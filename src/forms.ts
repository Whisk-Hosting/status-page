// Reading the staff forms into the changes they ask for. Pure: a form body in, either the change
// or a sentence saying what to fix out. Table-tested in test/forms.test.ts.
import {
  isStateFor,
  isStatus,
  maintenanceState,
  nextImpact,
  worst,
  zonedTime,
  type Component,
  type Incident,
  type Kind,
  type State,
  type Status,
} from "./model.js";

export type Body = Readonly<Record<string, unknown>>;
export type Result<T> = Readonly<{ ok: true; value: T }> | Readonly<{ ok: false; error: string }>;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.trim().replace(/\r\n/g, "\n").slice(0, max) : "");
const list = (v: unknown): readonly string[] => (Array.isArray(v) ? v.map(String) : v === undefined ? [] : [String(v)]);
const fail = (error: string) => ({ ok: false as const, error });

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// The components checked on the form, kept only when they exist.
export const pickedComponents = (b: Body, comps: readonly Pick<Component, "id">[]) => {
  const known = new Set(comps.map((c) => c.id));
  return [...new Set(list(b.component).map(Number))].filter((id) => known.has(id)).sort((a, z) => a - z);
};

// The status chosen for each checked component (status_<id>); resolving sets them all back.
export const pickedStatuses = (b: Body, ids: readonly number[], resolving: boolean): ReadonlyMap<number, Status> =>
  new Map(ids.map((id) => [id, resolving ? "operational" : isStatus(b[`status_${id}`]) ? (b[`status_${id}`] as Status) : "operational"]));

export type IncidentInput = Readonly<{
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
}>;

// A maintenance window from date, start and end fields in the page's time zone. An end time
// before the start means the next day.
export const windowFrom = (b: Body, tz: string): Result<{ starts_at: Date; ends_at: Date }> => {
  const date = str(b.date, 10);
  const start = str(b.start, 5);
  const end = str(b.end, 5);
  if (!DATE.test(date) || !TIME.test(start) || !TIME.test(end)) return fail("Enter the date, start time and end time.");
  const starts_at = zonedTime(date, start, tz);
  const sameDay = zonedTime(date, end, tz);
  const ends_at = sameDay > starts_at ? sameDay : new Date(sameDay.getTime() + 86_400_000);
  if (ends_at.getTime() - starts_at.getTime() > 7 * 86_400_000) return fail("A maintenance window can be at most a week long.");
  return { ok: true, value: { starts_at, ends_at } };
};

export const newIncident = (b: Body, kind: Kind, comps: readonly Pick<Component, "id">[], tz: string, now: Date): Result<IncidentInput> => {
  const title = str(b.title, 200);
  const body = str(b.body, 5000);
  if (!title) return fail("Give it a title.");
  if (!body) return fail("Write a message for the first update.");
  const component_ids = pickedComponents(b, comps);
  const notify = b.notify === "on";
  if (kind === "maintenance") {
    const w = windowFrom(b, tz);
    if (!w.ok) return w;
    if (w.value.ends_at <= now) return fail("The window has already ended. Pick a time in the future.");
    return {
      ok: true,
      value: { kind, title, body, notify, component_ids, statuses: new Map(), impact: "degraded", state: maintenanceState({ ...w.value, resolved_at: null }, now), ...w.value },
    };
  }
  const state = isStateFor("incident", b.state) ? b.state : "investigating";
  const statuses = pickedStatuses(b, component_ids, state === "resolved");
  const chosen = component_ids.map((id) => (isStatus(b[`status_${id}`]) ? (b[`status_${id}`] as Status) : "operational"));
  return {
    ok: true,
    value: { kind, title, body, notify, component_ids, statuses, impact: worst(chosen, "degraded"), state, starts_at: null, ends_at: null },
  };
};

export type UpdateInput = Readonly<{ state: State; body: string; notify: boolean; impact: Status; statuses: ReadonlyMap<number, Status>; closes: boolean; startsNow: boolean }>;

export const newUpdate = (b: Body, i: Incident, now: Date): Result<UpdateInput> => {
  const body = str(b.body, 5000);
  if (!body) return fail("Write a message for the update.");
  if (!isStateFor(i.kind, b.state)) return fail("Choose a state.");
  const state = b.state;
  const closes = state === "resolved" || state === "completed";
  const statuses = i.kind === "incident" ? pickedStatuses({ ...b, component: i.component_ids.map(String) }, i.component_ids, closes) : new Map<number, Status>();
  const chosen = i.component_ids.map((id) => (isStatus(b[`status_${id}`]) ? (b[`status_${id}`] as Status) : "operational"));
  return {
    ok: true,
    value: {
      state,
      body,
      notify: b.notify === "on",
      statuses,
      closes,
      impact: i.kind === "incident" && !closes ? nextImpact(i.impact, chosen) : i.impact,
      // Starting a window early moves its start to now.
      startsNow: i.kind === "maintenance" && state === "in_progress" && !!i.starts_at && i.starts_at > now,
    },
  };
};

// The statuses form on the overview: status_<id> for every component, only the ones that changed.
export const changedStatuses = (b: Body, comps: readonly Pick<Component, "id" | "status">[]): ReadonlyMap<number, Status> =>
  new Map(
    comps.flatMap((c) => {
      const v = b[`status_${c.id}`];
      return isStatus(v) && v !== c.status ? [[c.id, v] as const] : [];
    }),
  );
