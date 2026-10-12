// Writes the sample status page from sample.ts. A first install gets it so there is something to
// look at; delete or rename anything under Manage.
import { randomBytes } from "node:crypto";
import type { Sql, Tx } from "./db.js";
import { maintenanceState } from "./model.js";
import { impliedChanges, sample, sampleChecks } from "./sample.js";

export const writeSample = async (tx: Tx, now: Date) => {
  const s = sample(now);
  await tx`update settings set name = ${s.name}, website_url = ${s.website_url} where id = 1`;
  const groupIds = new Map<string, number>();
  for (const [i, name] of s.groups.entries()) {
    const [g] = await tx<{ id: number }[]>`insert into component_groups (name, position) values (${name}, ${i + 1}) returning id`;
    groupIds.set(name, g.id);
  }
  const ids = new Map<string, number>();
  for (const [i, c] of s.components.entries()) {
    const [row] = await tx<{ id: number }[]>`insert into components (name, description, group_id, position, created_at)
      values (${c.name}, ${c.description}, ${c.group ? (groupIds.get(c.group) ?? null) : null}, ${i + 1}, ${s.created}) returning id`;
    ids.set(c.key, row.id);
  }
  for (const i of s.incidents) {
    const minutes = (m: number) => new Date(i.start.getTime() + m * 60_000);
    const shown = i.updates.filter((u) => minutes(u.minutes) <= now);
    const last = shown[shown.length - 1];
    const ends = i.kind === "maintenance" ? minutes(i.minutes ?? 60) : null;
    const done = last?.state === "resolved" || last?.state === "completed";
    const state = i.kind === "maintenance" ? maintenanceState({ starts_at: i.start, ends_at: ends, resolved_at: null }, now) : (last?.state ?? "investigating");
    const createdAt = minutes(Math.min(0, ...i.updates.map((u) => u.minutes)));
    const [row] = await tx<{ id: number }[]>`insert into incidents (kind, title, impact, state, starts_at, ends_at, resolved_at, created_by, created_at)
      values (${i.kind}, ${i.title}, ${i.impact}, ${state}, ${i.kind === "maintenance" ? i.start : null}, ${ends},
        ${done && last ? minutes(last.minutes) : null}, 'sample', ${createdAt}) returning id`;
    for (const key of i.components) await tx`insert into incident_components (incident_id, component_id) values (${row.id}, ${ids.get(key)!})`;
    for (const u of shown) await tx`insert into incident_updates (incident_id, state, body, notify, author, at) values (${row.id}, ${u.state}, ${u.body}, true, 'sample', ${minutes(u.minutes)})`;
    for (const c of impliedChanges(i, now)) {
      await tx`insert into status_changes (component_id, status, at) values (${ids.get(c.key)!}, ${c.status}, ${c.at})`;
      await tx`update components set status = ${c.status} where id = ${ids.get(c.key)!}`;
    }
  }
  for (const [n, m] of s.monitors.entries()) {
    const id = ids.get(m.key)!;
    await tx`insert into monitors (component_id, url, keyword, checked_at, since) values (${id}, ${m.url}, ${m.keyword}, ${now}, ${s.created})`;
    await tx`insert into checks ${tx(sampleChecks(now, n).map((c) => ({ component_id: id, at: c.at, ok: true, ms: c.ms, error: "" })))}`;
  }
  for (const email of s.subscribers)
    await tx`insert into subscribers (email, token, confirmed_at, created_at) values (${email}, ${randomBytes(24).toString("base64url")}, ${s.created}, ${s.created})`;
};

// seedIfEmpty adds the sample to a brand-new install only. Answers whether it did.
export const seedIfEmpty = (sql: Sql, now = new Date()) =>
  sql.begin(async (tx) => {
    const [{ n }] = await tx<{ n: number }[]>`select (select count(*) from components) + (select count(*) from incidents) + (select count(*) from component_groups) as n`;
    if (Number(n) > 0) return false;
    await writeSample(tx, now);
    return true;
  });
