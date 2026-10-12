// Built-in monitoring, the decisions only: what a check found, what the monitor now believes, and
// what that changes on the page. Pure, like model.ts: checks.ts does the fetching and the writing.
import { duration, type Status } from "./model.js";

// Two failed checks in a row before a component is called down, so one dropped request never
// opens an incident.
export const FAILS_TO_ALERT = 2;
export const TIMEOUT_MS = 10_000;
export const SLOW_MS = 3000;

export type MonitorState = "up" | "slow" | "down";

export type Monitor = Readonly<{
  component_id: number;
  url: string;
  keyword: string;
  slow_ms: number;
  open_incidents: boolean;
  paused: boolean;
  state: MonitorState;
  fails: number;
  since: Date;
  checked_at: Date | null;
  incident_id: number | null;
}>;

export type Check = Readonly<{ at: Date; ok: boolean; ms: number | null; error: string }>;

// What came back from one request: a status code and how long it took, or an error.
export type Probe = Readonly<{ status: number; ms: number; body: string } | { error: string; ms: number | null }>;

export type Outcome = Readonly<{ state: MonitorState; ms: number | null; error: string }>;

// outcome reads a probe: down when nothing answered, the answer was not 2xx, or the keyword is
// missing; slow when it answered after slow_ms; up otherwise.
export const outcome = (p: Probe, m: Pick<Monitor, "keyword" | "slow_ms">): Outcome => {
  if ("error" in p) return { state: "down", ms: p.ms, error: p.error };
  if (p.status < 200 || p.status > 299) return { state: "down", ms: p.ms, error: `HTTP ${p.status}` };
  if (m.keyword && !p.body.includes(m.keyword)) return { state: "down", ms: p.ms, error: `"${m.keyword}" not found` };
  return { state: p.ms > m.slow_ms ? "slow" : "up", ms: p.ms, error: "" };
};

const componentStatus: Readonly<Record<MonitorState, Status>> = { up: "operational", slow: "degraded", down: "major" };

export type Effects = Readonly<{
  // The monitor after this check.
  monitor: Pick<Monitor, "state" | "fails" | "since" | "checked_at" | "incident_id">;
  // A new status for the component, when the monitor changed its mind.
  status: Status | null;
  // An incident to open, or the monitor's open incident to resolve.
  open: Readonly<{ title: string; body: string }> | null;
  resolve: Readonly<{ incident_id: number; body: string }> | null;
}>;

export type Context = Readonly<{
  name: string;
  now: Date;
  // A maintenance window naming the component is in progress: checks are recorded, nothing changes.
  inMaintenance: boolean;
  // An open incident (not the monitor's own) already names the component.
  coveredByIncident: boolean;
  // The monitor's own incident is still open.
  ownIncidentOpen: boolean;
}>;

// next decides what one check changes. Only a change of mind touches the page, so a status
// someone sets by hand stays until the monitor next sees something different.
export const next = (m: Monitor, o: Outcome, ctx: Context): Effects => {
  const fails = o.state === "down" ? m.fails + 1 : 0;
  // A single failure keeps the last belief until it is confirmed.
  const seen: MonitorState = o.state === "down" && fails < FAILS_TO_ALERT ? m.state : o.state;
  const base = { fails, checked_at: ctx.now, incident_id: m.incident_id };
  if (ctx.inMaintenance || seen === m.state) return { monitor: { ...base, state: m.state, since: m.since }, status: null, open: null, resolve: null };

  const monitor = { ...base, state: seen, since: ctx.now };
  const status = componentStatus[seen];
  if (seen === "down") {
    const open = m.open_incidents && !ctx.coveredByIncident && !ctx.ownIncidentOpen
      ? { title: `${ctx.name} is down`, body: `Our checks can't reach ${ctx.name} (${o.error}). We're looking into it.` }
      : null;
    return { monitor, status, open, resolve: null };
  }
  const recovered = m.state === "down";
  const resolve = recovered && ctx.ownIncidentOpen && m.incident_id
    ? { incident_id: m.incident_id, body: `${ctx.name} is back up. It was down for ${duration(ctx.now.getTime() - m.since.getTime())}.` }
    : null;
  return { monitor: { ...monitor, incident_id: resolve ? null : m.incident_id }, status, open: null, resolve };
};

// ----- Reading the monitor form -----

export type MonitorInput = Readonly<{ url: string; keyword: string; slow_ms: number; open_incidents: boolean; paused: boolean }>;

// The live demo lets visitors check these hosts and no others, so it can't be used to probe the
// web. They are reserved for examples and always answer.
export const DEMO_HOSTS: readonly string[] = ["example.com", "example.org"];

// monitorFrom reads the staff form. `onlyHosts`, when set, are the hosts the URL may name.
export const monitorFrom = (b: Readonly<Record<string, unknown>>, onlyHosts?: readonly string[]): { ok: true; value: MonitorInput } | { ok: false; error: string } => {
  const raw = typeof b.url === "string" ? b.url.trim() : "";
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { ok: false, error: "Enter the address to check, starting with https://." };
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return { ok: false, error: "Enter the address to check, starting with https://." };
  if (u.username || u.password) return { ok: false, error: "Leave the user name and password out of the address." };
  if (!publicHost(u.hostname)) return { ok: false, error: "That address is not on the public internet." };
  if (onlyHosts && !onlyHosts.includes(u.host)) return { ok: false, error: `The demo checks ${onlyHosts.join(" and ")} only.` };
  const slow = Number(b.slow_ms);
  return {
    ok: true,
    value: {
      url: u.toString().slice(0, 500),
      keyword: typeof b.keyword === "string" ? b.keyword.trim().slice(0, 100) : "",
      slow_ms: Number.isFinite(slow) && slow >= 100 ? Math.min(30_000, Math.round(slow)) : SLOW_MS,
      open_incidents: b.open_incidents === "on",
      paused: b.paused === "on",
    },
  };
};

// ----- Only the public internet -----

// A monitor fetches whatever address staff give it, so it must never reach the app's own network:
// loopback, private ranges, link-local (cloud metadata), carrier-grade NAT and the like are
// refused, by name here and by every address the name resolves to in checks.ts.
export const publicHost = (host: string): boolean => {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (!h || h === "localhost" || h.endsWith(".localhost") || h.endsWith(".internal") || h.endsWith(".local")) return false;
  if (/^[\d.]+$/.test(h) || h.includes(":")) return publicAddress(h);
  return h.includes(".");
};

export const publicAddress = (ip: string): boolean => {
  const a = ip.toLowerCase();
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(a.replace(/^::ffff:/, ""));
  if (v4) {
    const [p, q] = [Number(v4[1]), Number(v4[2])];
    return !(
      p === 0 || p === 10 || p === 127 || p >= 224 ||
      (p === 100 && q >= 64 && q <= 127) ||
      (p === 169 && q === 254) ||
      (p === 172 && q >= 16 && q <= 31) ||
      (p === 192 && q === 168) ||
      (p === 192 && q === 0) ||
      (p === 198 && (q === 18 || q === 19))
    );
  }
  if (!a.includes(":")) return false;
  return !(a === "::" || a === "::1" || /^f[cd]/.test(a) || /^fe[89ab]/.test(a) || a.startsWith("ff") || a.startsWith("64:ff9b:") || a.startsWith("::ffff:"));
};

// ----- For the staff screens -----

export const monitorLabel: Readonly<Record<MonitorState, string>> = { up: "Up", slow: "Slow", down: "Down" };

// The share of checks that passed, as a percentage with two decimals, or null with none.
export const checksUptime = (cs: readonly Pick<Check, "ok">[]): number | null =>
  cs.length ? Math.floor((cs.filter((c) => c.ok).length / cs.length) * 10_000) / 100 : null;

export const averageMs = (cs: readonly Pick<Check, "ms" | "ok">[]): number | null => {
  const ms = cs.filter((c) => c.ok && c.ms !== null).map((c) => c.ms as number);
  return ms.length ? Math.round(ms.reduce((a, b) => a + b, 0) / ms.length) : null;
};
