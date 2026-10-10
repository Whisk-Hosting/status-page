// Gathers what the status page, the feeds and the JSON need in one go, then works everything
// out with the pure functions in model.ts.
import {
  addDays,
  currentState,
  isActive,
  localDate,
  overall,
  sections,
  shownStatus,
  uptimeDays,
  zonedTime,
  type Component,
  type Day,
  type Incident,
  type Shown,
} from "./model.js";
import * as store from "./store.js";

export const DAYS = 90;

export const loadPage = async (now = new Date()) => {
  const s = await store.settings();
  const tz = s.time_zone;
  const from = zonedTime(addDays(localDate(now, tz), -DAYS), "00:00", tz);
  const [groups, comps, incidents, changes] = await Promise.all([store.groups(), store.components(), store.incidentsSince(from), store.changesSince(from)]);
  const updates = await store.updatesFor(incidents.map((i) => i.id));
  const shown = (c: Component): Shown => shownStatus(c, incidents, now);
  const memo = new Map<number, readonly Day[]>();
  const daysOf = (c: Component) => memo.get(c.id) ?? memo.set(c.id, uptimeDays(c, changes.get(c.id) ?? [], incidents, now, tz, DAYS)).get(c.id)!;
  const startOf = (i: Incident) => i.starts_at ?? i.created_at;
  const active = incidents.filter((i) => isActive(i, now)).sort((a, b) => (a.kind === b.kind ? startOf(b).getTime() - startOf(a).getTime() : a.kind === "incident" ? -1 : 1));
  const upcoming = incidents.filter((i) => i.kind === "maintenance" && currentState(i, now) === "scheduled").sort((a, b) => startOf(a).getTime() - startOf(b).getTime());
  const today = localDate(now, tz);
  const pastDays = Array.from({ length: 14 }, (_, k) => addDays(today, -k)).map((date) => ({
    date,
    incidents: incidents.filter((i) => localDate(startOf(i), tz) === date && startOf(i) <= now),
  }));
  return {
    s,
    now,
    groups,
    comps,
    incidents,
    updates,
    names: new Map(comps.map((c) => [c.id, c.name])),
    shown,
    daysOf,
    sections: sections(groups, comps),
    overall: overall(comps.map(shown)),
    active,
    upcoming,
    pastDays,
  };
};

export type Loaded = Awaited<ReturnType<typeof loadPage>>;
