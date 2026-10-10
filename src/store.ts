// The database, one small query per function. Rows come back as the read-only shapes in
// model.ts; decisions about them live there, not here.
import { randomBytes } from "node:crypto";
import { sql, type Tx } from "./db.js";
import { hashKey, type Change, type Component, type Group, type Incident, type Kind, type State, type Status, type Update } from "./model.js";

export { sql };


// ----- Settings -----

export type Settings = Readonly<{
  name: string;
  logo_upload: string | null;
  accent: string;
  website_url: string;
  support_url: string;
  time_zone: string;
  email_from: string;
}>;

export const settings = async (): Promise<Settings> => {
  const [s] = await sql<Settings[]>`select name, logo_upload, accent, website_url, support_url, time_zone, email_from from settings where id = 1`;
  return s;
};

export const saveSettings = async (s: Partial<Settings>) => {
  const cols = Object.keys(s) as (keyof Settings)[];
  if (cols.length) await sql`update settings set ${sql(s as Record<string, string | null>, ...cols)}, updated_at = now() where id = 1`;
};

// ----- Components and groups -----

export const groups = () => sql<Group[]>`select id, name, position from component_groups order by position, id`;

export const components = () =>
  sql<Component[]>`select id, group_id, name, description, position, status, created_at from components order by position, id`;

export const componentById = async (id: number) => (await sql<Component[]>`select id, group_id, name, description, position, status, created_at from components where id = ${id}`)[0];

export const addGroup = async (name: string) =>
  (await sql<{ id: number }[]>`insert into component_groups (name, position) values (${name}, (select coalesce(max(position), 0) + 1 from component_groups)) returning id`)[0].id;

export const renameGroup = (id: number, name: string) => sql`update component_groups set name = ${name} where id = ${id}`;
export const deleteGroup = (id: number) => sql`delete from component_groups where id = ${id}`;

export const addComponent = async (c: { name: string; description: string; group_id: number | null }) =>
  (
    await sql<{ id: number }[]>`insert into components (name, description, group_id, position)
      values (${c.name}, ${c.description}, ${c.group_id}, (select coalesce(max(position), 0) + 1 from components)) returning id`
  )[0].id;

export const editComponent = (id: number, c: { name: string; description: string; group_id: number | null }) =>
  sql`update components set name = ${c.name}, description = ${c.description}, group_id = ${c.group_id} where id = ${id}`;

export const deleteComponent = (id: number) => sql`delete from components where id = ${id}`;

// reorder writes a new order for a list of ids (components or groups).
export const reorder = (table: "components" | "component_groups", ids: readonly number[]) =>
  sql.begin((tx) => ids.map((id, i) => tx`update ${tx(table)} set position = ${i + 1} where id = ${id}`));

// setStatuses changes component statuses and records each real change for the uptime history.
export const setStatuses = async (q: Tx, changes: ReadonlyMap<number, Status>) => {
  for (const [id, status] of changes) {
    const done = await q`update components set status = ${status} where id = ${id} and status <> ${status} returning id`;
    if (done.length) await q`insert into status_changes (component_id, status) values (${id}, ${status})`;
  }
};

export const changesSince = async (from: Date): Promise<ReadonlyMap<number, readonly Change[]>> => {
  // The change just before the window too, so the window starts in the right status.
  const rows = await sql<(Change & { component_id: number })[]>`
    select component_id, status, at from status_changes where at >= ${from}
    union all
    select distinct on (component_id) component_id, status, at from status_changes where at < ${from} order by component_id, at desc`;
  return rows.reduce((m, r) => m.set(r.component_id, [...(m.get(r.component_id) ?? []), { status: r.status, at: r.at }]), new Map<number, readonly Change[]>());
};

// ----- Incidents and maintenance -----

const incidentCols = sql`i.id, i.kind, i.title, i.impact, i.state, i.starts_at, i.ends_at, i.resolved_at, i.created_at,
  coalesce((select array_agg(component_id order by component_id) from incident_components where incident_id = i.id), '{}') as component_ids`;

// Open incidents, maintenance not yet finished, and everything since `since`.
export const incidentsSince = (since: Date) =>
  sql<Incident[]>`select ${incidentCols} from incidents i
    where i.created_at >= ${since} or i.resolved_at is null or i.resolved_at >= ${since} or i.ends_at >= ${since}
    order by coalesce(i.starts_at, i.created_at) desc, i.id desc`;

export const incidentsBetween = (from: Date, to: Date) =>
  sql<Incident[]>`select ${incidentCols} from incidents i
    where coalesce(i.starts_at, i.created_at) >= ${from} and coalesce(i.starts_at, i.created_at) < ${to}
    order by coalesce(i.starts_at, i.created_at) desc, i.id desc`;

export const firstIncidentAt = async () => (await sql<{ at: Date | null }[]>`select min(coalesce(starts_at, created_at)) as at from incidents`)[0].at;

export const incidentPage = (limit: number, offset: number) =>
  sql<Incident[]>`select ${incidentCols} from incidents i order by coalesce(i.starts_at, i.created_at) desc, i.id desc limit ${limit} offset ${offset}`;

export const incidentById = async (id: number) => (await sql<Incident[]>`select ${incidentCols} from incidents i where i.id = ${id}`)[0];

export const updatesFor = async (ids: readonly number[]): Promise<ReadonlyMap<number, readonly Update[]>> => {
  if (ids.length === 0) return new Map();
  const rows = await sql<Update[]>`select id, incident_id, state, body, at, author from incident_updates where incident_id in ${sql(ids)} order by at desc, id desc`;
  return rows.reduce((m, u) => m.set(u.incident_id, [...(m.get(u.incident_id) ?? []), u]), new Map<number, readonly Update[]>());
};

export const updateById = async (id: number) =>
  (await sql<(Update & { notify: boolean })[]>`select id, incident_id, state, body, at, author, notify from incident_updates where id = ${id}`)[0];

export type NewIncident = Readonly<{
  kind: Kind;
  title: string;
  impact: Status;
  state: State;
  starts_at: Date | null;
  ends_at: Date | null;
  component_ids: readonly number[];
  statuses: ReadonlyMap<number, Status>;
  body: string;
  notify: boolean;
  author: string;
}>;

// createIncident opens an incident (or schedules maintenance) with its first update, and sets
// the statuses of the components it names, all at once. Answers the ids.
export const createIncident = (n: NewIncident) =>
  sql.begin(async (tx) => {
    const [i] = await tx<{ id: number }[]>`insert into incidents (kind, title, impact, state, starts_at, ends_at, resolved_at, created_by)
      values (${n.kind}, ${n.title}, ${n.impact}, ${n.state}, ${n.starts_at}, ${n.ends_at}, ${n.state === "resolved" ? new Date() : null}, ${n.author}) returning id`;
    if (n.component_ids.length) await tx`insert into incident_components ${tx(n.component_ids.map((component_id) => ({ incident_id: i.id, component_id })))}`;
    const [u] = await tx<{ id: number }[]>`insert into incident_updates (incident_id, state, body, notify, author) values (${i.id}, ${n.state}, ${n.body}, ${n.notify}, ${n.author}) returning id`;
    await setStatuses(tx, n.statuses);
    return { id: i.id, update_id: u.id };
  });

export type NewUpdate = Readonly<{
  incident_id: number;
  state: State;
  impact: Status;
  body: string;
  notify: boolean;
  author: string;
  statuses: ReadonlyMap<number, Status>;
  // Set when this update closes the incident or finishes the window.
  closes: boolean;
}>;

export const addUpdate = (n: NewUpdate) =>
  sql.begin(async (tx) => {
    await tx`update incidents set state = ${n.state}, impact = ${n.impact},
      resolved_at = case when ${n.closes} then coalesce(resolved_at, now()) else null end where id = ${n.incident_id}`;
    const [u] = await tx<{ id: number }[]>`insert into incident_updates (incident_id, state, body, notify, author) values (${n.incident_id}, ${n.state}, ${n.body}, ${n.notify}, ${n.author}) returning id`;
    await setStatuses(tx, n.statuses);
    return u.id;
  });

export const editIncident = (id: number, e: { title: string; component_ids: readonly number[]; starts_at: Date | null; ends_at: Date | null }) =>
  sql.begin(async (tx) => {
    await tx`update incidents set title = ${e.title}, starts_at = ${e.starts_at}, ends_at = ${e.ends_at} where id = ${id}`;
    await tx`delete from incident_components where incident_id = ${id}`;
    if (e.component_ids.length) await tx`insert into incident_components ${tx(e.component_ids.map((component_id) => ({ incident_id: id, component_id })))}`;
  });

export const deleteIncident = (id: number) => sql`delete from incidents where id = ${id}`;
export const editUpdateBody = (id: number, body: string) => sql`update incident_updates set body = ${body} where id = ${id}`;

// ----- Subscribers -----

export type Subscriber = Readonly<{ id: number; email: string; token: string; confirmed_at: Date | null; created_at: Date }>;

// subscribe adds an address, or answers the existing one so its confirmation can be sent again.
export const subscribe = async (email: string): Promise<Subscriber> => {
  const token = randomBytes(24).toString("base64url");
  const [s] = await sql<Subscriber[]>`insert into subscribers (email, token) values (${email}, ${token})
    on conflict (lower(email)) do update set email = subscribers.email returning id, email, token, confirmed_at, created_at`;
  return s;
};

export const subscriberByToken = async (token: string) =>
  (await sql<Subscriber[]>`select id, email, token, confirmed_at, created_at from subscribers where token = ${token}`)[0];

export const confirmSubscriber = (id: number) => sql`update subscribers set confirmed_at = coalesce(confirmed_at, now()) where id = ${id}`;
export const removeSubscriber = (id: number) => sql`delete from subscribers where id = ${id}`;

export const subscriberList = (limit: number, offset: number) =>
  sql<Subscriber[]>`select id, email, token, confirmed_at, created_at from subscribers order by created_at desc, id desc limit ${limit} offset ${offset}`;

export const subscriberCounts = async () =>
  (await sql<{ confirmed: number; waiting: number }[]>`select count(*) filter (where confirmed_at is not null)::int as confirmed, count(*) filter (where confirmed_at is null)::int as waiting from subscribers`)[0];

export const allConfirmed = () => sql<{ email: string; confirmed_at: Date }[]>`select email, confirmed_at from subscribers where confirmed_at is not null order by created_at`;

// Addresses that never confirmed within a week are dropped, by id.
export const dropUnconfirmed = async (olderThan: Date) => {
  const old = await sql<{ id: number }[]>`select id from subscribers where confirmed_at is null and created_at < ${olderThan}`;
  if (old.length) await sql`delete from subscribers where id in ${sql(old.map((o) => o.id))}`;
  return old.length;
};

// ----- Email -----

export type EmailRow = Readonly<{ id: number; kind: string; update_id: number | null; subscriber_id: number | null; to_email: string; subject: string; status: string; error: string }>;

// queueUpdateEmails writes one email per confirmed subscriber for an update. Safe to run twice.
export const queueUpdateEmails = async (updateId: number, subject: string) =>
  (
    await sql`insert into emails (kind, update_id, subscriber_id, to_email, subject)
      select 'update', ${updateId}, id, email, ${subject} from subscribers where confirmed_at is not null
      on conflict (update_id, subscriber_id) where update_id is not null do nothing`
  ).count;

export const pendingEmails = (updateId: number, limit: number) =>
  sql<(EmailRow & { token: string | null })[]>`select e.id, e.kind, e.update_id, e.subscriber_id, e.to_email, e.subject, e.status, e.error, s.token
    from emails e left join subscribers s on s.id = e.subscriber_id
    where e.update_id = ${updateId} and e.status = 'pending' order by e.id limit ${limit}`;

export const recordEmail = async (e: { kind: string; to_email: string; subject: string; status: string; error?: string }) =>
  (await sql<{ id: number }[]>`insert into emails (kind, to_email, subject, status, error, sent_at)
    values (${e.kind}, ${e.to_email}, ${e.subject}, ${e.status}, ${e.error ?? ""}, ${e.status === "sent" ? new Date() : null}) returning id`)[0].id;

export const markEmail = (id: number, status: string, error = "") =>
  sql`update emails set status = ${status}, error = ${error}, sent_at = case when ${status} = 'sent' then now() else sent_at end where id = ${id}`;

// How each update's emails went, for the staff timeline.
export const emailTotals = async (updateIds: readonly number[]): Promise<ReadonlyMap<number, Readonly<Record<string, number>>>> => {
  if (updateIds.length === 0) return new Map();
  const rows = await sql<{ update_id: number; status: string; n: number }[]>`select update_id, status, count(*)::int as n from emails where update_id in ${sql(updateIds)} group by 1, 2`;
  return rows.reduce((m, r) => m.set(r.update_id, { ...(m.get(r.update_id) ?? {}), [r.status]: r.n }), new Map<number, Readonly<Record<string, number>>>());
};

export const recentEmails = (limit: number) =>
  sql<(EmailRow & { created_at: Date })[]>`select id, kind, update_id, subscriber_id, to_email, subject, status, error, created_at from emails order by id desc limit ${limit}`;

// ----- API keys -----

export type ApiKey = Readonly<{ id: number; name: string; prefix: string; created_by: string; created_at: Date; last_used_at: Date | null; revoked_at: Date | null }>;

export const createKey = async (name: string, by: string) => {
  const key = `sp_${randomBytes(24).toString("base64url")}`;
  await sql`insert into api_keys (name, prefix, hash, created_by) values (${name}, ${key.slice(0, 7)}, ${hashKey(key)}, ${by})`;
  return key;
};

export const keys = () => sql<ApiKey[]>`select id, name, prefix, created_by, created_at, last_used_at, revoked_at from api_keys order by revoked_at nulls first, created_at desc`;
export const revokeKey = (id: number) => sql`update api_keys set revoked_at = coalesce(revoked_at, now()) where id = ${id}`;

export const keyFor = async (key: string) => {
  const [k] = await sql<{ id: number; name: string }[]>`update api_keys set last_used_at = now() where hash = ${hashKey(key)} and revoked_at is null returning id, name`;
  return k;
};
