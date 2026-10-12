// Built-in monitoring, the effects: fetch each monitor's address, then write what monitor.ts
// decided. The monitor function (functions.ts) runs this on a schedule; "Check now" runs it for
// one component.
import { lookup } from "node:dns/promises";
import { isOpen, maintenanceState, type Incident } from "./model.js";
import { next, outcome, publicAddress, TIMEOUT_MS, type Monitor, type Probe } from "./monitor.js";
import { announce } from "./notify.js";
import * as store from "./store.js";
import { log } from "./whisk.js";

const MAX_BODY = 1_000_000;
const MAX_REDIRECTS = 5;
const AT_ONCE = 8;

// Every address the name resolves to must be public, on every hop, so a redirect or a DNS answer
// can't point the monitor at the app's own network.
const guard = async (u: URL) => {
  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addrs = await lookup(host, { all: true, verbatim: true });
  if (!addrs.length || !addrs.every((a) => publicAddress(a.address))) throw new Error("Address is not public");
};

const reason = (err: unknown) => {
  const e = err as { name?: string; message?: string; cause?: { code?: string } };
  if (e.name === "TimeoutError" || e.name === "AbortError") return `No answer in ${TIMEOUT_MS / 1000} seconds`;
  if (e.cause?.code === "ENOTFOUND" || (e as { code?: string }).code === "ENOTFOUND") return "Address not found";
  if (e.cause?.code === "ECONNREFUSED") return "Connection refused";
  if (e.cause?.code?.startsWith("CERT") || e.cause?.code?.includes("TLS") || e.cause?.code === "DEPTH_ZERO_SELF_SIGNED_CERT") return "Certificate problem";
  return (e.message ?? String(err)).slice(0, 200);
};

// probe fetches an address once, following up to five redirects, within ten seconds in all.
export const probe = async (url: string, keyword: string): Promise<Probe> => {
  const started = performance.now();
  const signal = AbortSignal.timeout(TIMEOUT_MS);
  try {
    let u = new URL(url);
    for (let hop = 0; ; hop++) {
      await guard(u);
      const res = await fetch(u, { redirect: "manual", signal, headers: { "user-agent": "Whisk status monitor", accept: "*/*" } });
      const location = res.headers.get("location");
      if (res.status >= 300 && res.status < 400 && location && hop < MAX_REDIRECTS) {
        await res.body?.cancel();
        u = new URL(location, u);
        if (u.protocol !== "https:" && u.protocol !== "http:") throw new Error("Redirected away from the web");
        continue;
      }
      const body = keyword ? (await res.text()).slice(0, MAX_BODY) : "";
      if (!keyword) await res.body?.cancel();
      return { status: res.status, ms: Math.round(performance.now() - started), body };
    }
  } catch (err) {
    return { error: reason(err), ms: null };
  }
};

// check runs one monitor and writes what changed, holding the monitor's row so a "Check now" and
// a scheduled run never both open an incident.
const check = async (m: Monitor, names: ReadonlyMap<number, string>, incidents: readonly Incident[]) => {
  const p = await probe(m.url, m.keyword);
  const now = new Date();
  const announced = await store.sql.begin(async (tx) => {
    const [fresh] = await tx<Monitor[]>`select component_id, url, keyword, slow_ms, open_incidents, paused, state, fails, since, checked_at, incident_id
      from monitors where component_id = ${m.component_id} for update`;
    if (!fresh || fresh.url !== m.url) return [];
    const o = outcome(p, fresh);
    const id = fresh.component_id;
    const about = (i: Incident) => i.component_ids.includes(id);
    const fx = next(fresh, o, {
      name: names.get(id) ?? "This component",
      now,
      inMaintenance: incidents.some((i) => about(i) && i.kind === "maintenance" && maintenanceState(i, now) === "in_progress"),
      coveredByIncident: incidents.some((i) => about(i) && i.kind === "incident" && i.id !== fresh.incident_id && isOpen(i, now)),
      ownIncidentOpen: incidents.some((i) => i.id === fresh.incident_id && isOpen(i, now)),
    });
    await tx`insert into checks (component_id, at, ok, ms, error) values (${id}, ${now}, ${o.state !== "down"}, ${o.ms}, ${o.error})`;
    const statuses = new Map(fx.status ? [[id, fx.status] as const] : []);
    const opened = fx.open
      ? await store.insertIncident(tx, { kind: "incident", title: fx.open.title, impact: "major", state: "investigating", starts_at: null, ends_at: null, component_ids: [id], statuses, body: fx.open.body, notify: true, author: "Monitor" })
      : null;
    const resolvedUpdate = fx.resolve
      ? await store.insertUpdate(tx, { incident_id: fx.resolve.incident_id, state: "resolved", impact: incidents.find((i) => i.id === fx.resolve?.incident_id)?.impact ?? "major", body: fx.resolve.body, notify: true, author: "Monitor", statuses, closes: true })
      : null;
    if (!opened && !resolvedUpdate) await store.setStatuses(tx, statuses);
    await tx`update monitors set state = ${fx.monitor.state}, fails = ${fx.monitor.fails}, since = ${fx.monitor.since}, checked_at = ${fx.monitor.checked_at},
      incident_id = ${opened ? opened.id : fx.monitor.incident_id} where component_id = ${id}`;
    if (fx.status) log.info({ component_id: id, state: fx.monitor.state, error: o.error }, "monitor changed its mind");
    return [opened?.update_id, resolvedUpdate].filter((x): x is number => typeof x === "number");
  });
  for (const u of announced) await announce(u);
};

// runChecks checks every monitor that isn't paused, a few at a time, or just one component's.
export const runChecks = async (only?: number) => {
  const [all, comps, incidents] = await Promise.all([store.monitors(), store.components(), store.incidentsSince(new Date())]);
  const due = all.filter((m) => (only === undefined ? !m.paused : m.component_id === only));
  const names = new Map(comps.map((c) => [c.id, c.name]));
  for (let i = 0; i < due.length; i += AT_ONCE) {
    const results = await Promise.allSettled(due.slice(i, i + AT_ONCE).map((m) => check(m, names, incidents)));
    results.forEach((r, k) => r.status === "rejected" && log.error({ component_id: due[i + k].component_id, err: String(r.reason) }, "monitor check failed"));
  }
  return due.length;
};
