// Every decision the status page makes, as pure functions over plain, read-only data: what a
// component shows, what the banner says, what state a maintenance window is in, and the uptime
// bars. Nothing here touches the database, the clock or the network; callers pass `now`.
import { createHash } from "node:crypto";

// ----- Statuses -----

// What staff set on a component. Maintenance is never set by hand: a component shows it while a
// maintenance window that names it is in progress.
export const STATUSES = ["operational", "degraded", "partial", "major"] as const;
export type Status = (typeof STATUSES)[number];
export type Shown = Status | "maintenance";

export const statusLabel: Readonly<Record<Shown, string>> = {
  operational: "Operational",
  degraded: "Degraded performance",
  partial: "Partial outage",
  major: "Major outage",
  maintenance: "Under maintenance",
};

// The banner at the top of the page, in the words every status page uses.
export const bannerLabel: Readonly<Record<Shown, string>> = {
  operational: "All systems operational",
  degraded: "Degraded performance",
  partial: "Partial outage",
  major: "Major outage",
  maintenance: "Under maintenance",
};

const rank: Readonly<Record<Shown, number>> = { operational: 0, maintenance: 1, degraded: 2, partial: 3, major: 4 };

export const isStatus = (v: unknown): v is Status => typeof v === "string" && (STATUSES as readonly string[]).includes(v);

export const worst = <T extends Shown>(xs: readonly T[], fallback: T): T => xs.reduce((a, b) => (rank[b] > rank[a] ? b : a), fallback);

// ----- Incidents and maintenance -----

export const INCIDENT_STATES = ["investigating", "identified", "monitoring", "resolved"] as const;
export const MAINTENANCE_STATES = ["scheduled", "in_progress", "completed"] as const;
export type IncidentState = (typeof INCIDENT_STATES)[number];
export type MaintenanceState = (typeof MAINTENANCE_STATES)[number];
export type State = IncidentState | MaintenanceState;
export type Kind = "incident" | "maintenance";

export const stateLabel: Readonly<Record<State, string>> = {
  investigating: "Investigating",
  identified: "Identified",
  monitoring: "Monitoring",
  resolved: "Resolved",
  scheduled: "Scheduled",
  in_progress: "In progress",
  completed: "Completed",
};

export const statesFor = (kind: Kind): readonly State[] => (kind === "incident" ? INCIDENT_STATES : MAINTENANCE_STATES);
export const isStateFor = (kind: Kind, v: unknown): v is State => typeof v === "string" && (statesFor(kind) as readonly string[]).includes(v);

export type Incident = Readonly<{
  id: number;
  kind: Kind;
  title: string;
  impact: Status;
  state: State;
  starts_at: Date | null;
  ends_at: Date | null;
  resolved_at: Date | null;
  created_at: Date;
  component_ids: readonly number[];
}>;

export type Update = Readonly<{ id: number; incident_id: number; state: State; body: string; at: Date; author: string }>;

// A maintenance window's state follows its times: scheduled before it starts, in progress until
// it ends, completed after, or completed early when someone finished it. Nothing has to run on a
// timer to move it along.
export const maintenanceState = (m: Pick<Incident, "starts_at" | "ends_at" | "resolved_at">, now: Date): MaintenanceState =>
  m.resolved_at && m.resolved_at <= now
    ? "completed"
    : m.starts_at && now < m.starts_at
      ? "scheduled"
      : m.ends_at && now >= m.ends_at
        ? "completed"
        : "in_progress";

export const currentState = (i: Incident, now: Date): State => (i.kind === "maintenance" ? maintenanceState(i, now) : i.state);

export const isOpen = (i: Incident, now: Date) => {
  const s = currentState(i, now);
  return s !== "resolved" && s !== "completed";
};

export const isActive = (i: Incident, now: Date) => isOpen(i, now) && currentState(i, now) !== "scheduled";

// When an incident or window ended, for the history.
export const endedAt = (i: Incident, now: Date): Date | null =>
  isOpen(i, now) ? null : i.kind === "maintenance" ? (i.resolved_at && (!i.ends_at || i.resolved_at < i.ends_at) ? i.resolved_at : i.ends_at) : i.resolved_at;

// An incident's impact only grows while it is open: the worst status any of its updates set.
export const nextImpact = (current: Status, set: readonly Status[]): Status => worst(set, current);

// ----- What the page shows -----

export type Component = Readonly<{
  id: number;
  group_id: number | null;
  name: string;
  description: string;
  position: number;
  status: Status;
  created_at: Date;
}>;

export type Group = Readonly<{ id: number; name: string; position: number }>;

export const shownStatus = (c: Component, incidents: readonly Incident[], now: Date): Shown =>
  c.status === "operational" && incidents.some((i) => i.kind === "maintenance" && i.component_ids.includes(c.id) && maintenanceState(i, now) === "in_progress")
    ? "maintenance"
    : c.status;

export const overall = (shown: readonly Shown[]): Shown => worst(shown, "operational");

export type Section = Readonly<{ group: Group | null; components: readonly Component[] }>;

// Components in their groups, in order. Ungrouped components come first, each on its own.
export const sections = (groups: readonly Group[], components: readonly Component[]): readonly Section[] => {
  const byPos = <T extends { position: number; id: number }>(xs: readonly T[]) => [...xs].sort((a, b) => a.position - b.position || a.id - b.id);
  const loose = byPos(components.filter((c) => c.group_id === null || !groups.some((g) => g.id === c.group_id)));
  return [
    ...loose.map((c) => ({ group: null, components: [c] })),
    ...byPos(groups)
      .map((g) => ({ group: g, components: byPos(components.filter((c) => c.group_id === g.id)) }))
      .filter((s) => s.components.length > 0),
  ];
};

// The status of a group is the worst of its components.
export const sectionStatus = (s: Section, shown: (c: Component) => Shown): Shown => overall(s.components.map(shown));

// ----- Time zones -----

// Calendar dates in the page's time zone, as "YYYY-MM-DD".
export const localDate = (d: Date, tz: string): string => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(d).map((x) => [x.type, x.value]),
  );
  return `${p.year}-${p.month}-${p.day}`;
};

// How far the zone is ahead of UTC at an instant, in milliseconds.
const offsetAt = (d: Date, tz: string): number => {
  const p = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "numeric", day: "numeric", hour: "numeric", minute: "numeric", second: "numeric" })
      .formatToParts(d)
      .map((x) => [x.type, x.value]),
  );
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour), Number(p.minute), Number(p.second));
  return asUtc - Math.floor(d.getTime() / 1000) * 1000;
};

// The instant a local wall-clock time happens in a zone ("2026-10-09", "14:30").
export const zonedTime = (date: string, time: string, tz: string): Date => {
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  const guess = Date.UTC(y, m - 1, d, hh, mm);
  const first = guess - offsetAt(new Date(guess), tz);
  return new Date(guess - offsetAt(new Date(first), tz));
};

export const addDays = (date: string, n: number): string => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

export const isTimeZone = (tz: string) => {
  try {
    new Intl.DateTimeFormat("en", { timeZone: tz });
    return tz.length > 0;
  } catch {
    return false;
  }
};

// ----- Uptime -----

export type Change = Readonly<{ status: Status; at: Date }>;

// How much of a status counts as down time: all of a major outage and 30 % of a partial outage,
// as Atlassian Statuspage counts it. Degraded performance and maintenance count as up.
const downWeight: Readonly<Record<Status, number>> = { operational: 0, degraded: 0, partial: 0.3, major: 1 };

type Span = Readonly<{ status: Status; from: number; to: number }>;

// The component's history as spans of one status each, from when it was added until now.
const spans = (created: Date, changes: readonly Change[], now: Date): readonly Span[] => {
  const points = [{ status: "operational" as Status, at: created }, ...[...changes].filter((c) => c.at >= created).sort((a, b) => a.at.getTime() - b.at.getTime())];
  return points.map((p, i) => ({ status: p.status, from: p.at.getTime(), to: i + 1 < points.length ? points[i + 1].at.getTime() : now.getTime() })).filter((s) => s.to > s.from);
};

export type Day = Readonly<{
  date: string;
  // null before the component existed.
  uptime: number | null;
  worst: Status | null;
  // Incidents that touched this component on this day.
  incidents: readonly Readonly<{ id: number; title: string; impact: Status }>[];
}>;

// One bar per day for the last `days` days in the page's time zone, today last.
export const uptimeDays = (
  c: Pick<Component, "id" | "created_at">,
  changes: readonly Change[],
  incidents: readonly Incident[],
  now: Date,
  tz: string,
  days: number,
): readonly Day[] => {
  const all = spans(c.created_at, changes, now);
  const today = localDate(now, tz);
  const mine = incidents.filter((i) => i.kind === "incident" && i.component_ids.includes(c.id));
  return Array.from({ length: days }, (_, k) => addDays(today, k - days + 1)).map((date) => {
    const from = zonedTime(date, "00:00", tz).getTime();
    const to = Math.min(zonedTime(addDays(date, 1), "00:00", tz).getTime(), now.getTime());
    const inDay = all.map((s) => ({ status: s.status, ms: Math.max(0, Math.min(s.to, to) - Math.max(s.from, from)) })).filter((s) => s.ms > 0);
    const total = inDay.reduce((a, s) => a + s.ms, 0);
    const down = inDay.reduce((a, s) => a + s.ms * downWeight[s.status], 0);
    const touched = mine.filter((i) => i.created_at.getTime() < to && (i.resolved_at?.getTime() ?? Infinity) >= from);
    return {
      date,
      uptime: total > 0 ? 1 - down / total : null,
      worst: total > 0 ? worst(inDay.map((s) => s.status), "operational") : null,
      incidents: touched.map((i) => ({ id: i.id, title: i.title, impact: i.impact })),
    };
  });
};

// Uptime over the days shown, weighting each day the same, as a percentage with two decimals.
export const uptimePercent = (ds: readonly Day[]): number | null => {
  const known = ds.filter((d) => d.uptime !== null);
  return known.length === 0 ? null : Math.floor((known.reduce((a, d) => a + (d.uptime ?? 0), 0) / known.length) * 10000) / 100;
};

// ----- Statuspage-compatible JSON -----

// Many tools and widgets read Atlassian Statuspage's public /api/v2 files; the same shapes here
// let them read this page too.
const indicators = { operational: "none", degraded: "minor", partial: "major", major: "critical", maintenance: "maintenance" } as const;
export const indicator = (s: Shown) => indicators[s];

export const statuspageComponentStatus = (s: Shown) =>
  ({ operational: "operational", degraded: "degraded_performance", partial: "partial_outage", major: "major_outage", maintenance: "under_maintenance" })[s];

export const statuspageImpact = (s: Status) => ({ operational: "none", degraded: "minor", partial: "major", major: "critical" })[s];

// ----- Input -----

// keyFrom reads the API key a request carries: Authorization: Bearer <key>, Basic auth with the
// key as the user name, X-Api-Key, or ?token=. The first one present wins.
export const keyFrom = (header: (name: string) => string | undefined, token?: string): string => {
  const auth = (header("authorization") ?? "").trim();
  const bearer = /^bearer\s+(.+)$/i.exec(auth)?.[1];
  const basic = /^basic\s+(.+)$/i.exec(auth)?.[1];
  const user = basic ? Buffer.from(basic.trim(), "base64").toString("utf8").split(":")[0] : undefined;
  return (bearer ?? user ?? header("x-api-key") ?? token ?? "").trim();
};

export const isColor = (v: unknown): v is string => typeof v === "string" && /^#[0-9a-fA-F]{6}$/.test(v);

export const cleanEmail = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  return s.length <= 254 && /^[^\s@<>()",;]+@[^\s@<>()",;]+\.[^\s@<>()",;]{2,}$/.test(s) ? s : null;
};

// A web address someone typed, kept only when it is http(s).
export const cleanUrl = (v: unknown): string => {
  const s = typeof v === "string" ? v.trim().slice(0, 500) : "";
  if (!s) return "";
  try {
    const u = new URL(s);
    return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : "";
  } catch {
    return "";
  }
};

export const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

// Moving an item up or down a list: the new order of ids.
export const move = (ids: readonly number[], id: number, dir: -1 | 1): readonly number[] => {
  const i = ids.indexOf(id);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= ids.length) return ids;
  return ids.map((x, k) => (k === i ? ids[j] : k === j ? ids[i] : x));
};

// ----- Words for times, in the page's time zone -----

export const formatTime = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", minute: "2-digit", hour12: true }).format(d).replace(/\s?([ap])\.?m\.?/i, (_, x: string) => ` ${x.toLowerCase()}m`);

export const formatDay = (d: Date, tz: string, withYear = false) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, weekday: "short", day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) }).format(d).replace(",", "");

export const zoneName = (d: Date, tz: string) =>
  new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "short" }).formatToParts(d).find((p) => p.type === "timeZoneName")?.value ?? tz;

export const formatWhen = (d: Date, tz: string, now: Date) =>
  `${localDate(d, tz) === localDate(now, tz) ? "Today" : formatDay(d, tz, localDate(d, tz).slice(0, 4) !== localDate(now, tz).slice(0, 4))}, ${formatTime(d, tz)} ${zoneName(d, tz)}`;

// "52 minutes", "3 hours 10 minutes", "2 days".
export const duration = (ms: number) => {
  const m = Math.max(1, Math.round(ms / 60_000));
  const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;
  if (m < 60) return plural(m, "minute");
  if (m < 48 * 60) return m % 60 ? `${plural(Math.floor(m / 60), "hour")} ${plural(m % 60, "minute")}` : plural(m / 60, "hour");
  return plural(Math.round(m / 1440), "day");
};
