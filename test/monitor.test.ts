import assert from "node:assert/strict";
import { test } from "node:test";
import { averageMs, checksUptime, DEMO_HOSTS, monitorFrom, next, outcome, publicAddress, publicHost, type Monitor, type Outcome } from "../src/monitor.js";

const now = new Date("2026-10-10T20:00:00Z");
const m = (o: Partial<Monitor> = {}): Monitor => ({
  component_id: 1,
  url: "https://example.com/health",
  keyword: "",
  slow_ms: 3000,
  open_incidents: true,
  paused: false,
  state: "up",
  fails: 0,
  since: new Date("2026-10-10T19:00:00Z"),
  checked_at: null,
  incident_id: null,
  ...o,
});
const ctx = { name: "API", now, inMaintenance: false, coveredByIncident: false, ownIncidentOpen: false };
const up: Outcome = { state: "up", ms: 120, error: "" };
const down: Outcome = { state: "down", ms: null, error: "HTTP 503" };

test("a probe becomes up, slow or down", () => {
  const cases: [Parameters<typeof outcome>[0], Partial<Monitor>, Outcome["state"], string][] = [
    [{ status: 200, ms: 120, body: "" }, {}, "up", ""],
    [{ status: 204, ms: 3500, body: "" }, {}, "slow", ""],
    [{ status: 503, ms: 40, body: "" }, {}, "down", "HTTP 503"],
    [{ status: 301, ms: 40, body: "" }, {}, "down", "HTTP 301"],
    [{ status: 200, ms: 90, body: "all good" }, { keyword: "indicator" }, "down", '"indicator" not found'],
    [{ status: 200, ms: 90, body: '{"indicator":"none"}' }, { keyword: "indicator" }, "up", ""],
    [{ error: "No answer in 10 seconds", ms: null }, {}, "down", "No answer in 10 seconds"],
  ];
  for (const [p, mo, state, error] of cases) {
    const o = outcome(p, m(mo));
    assert.equal(o.state, state, JSON.stringify(p));
    assert.equal(o.error, error);
  }
});

test("one failure is not an outage; two in a row are", () => {
  const first = next(m(), down, ctx);
  assert.equal(first.monitor.state, "up");
  assert.equal(first.monitor.fails, 1);
  assert.equal(first.status, null);
  assert.equal(first.open, null);

  const second = next(m({ fails: 1 }), down, ctx);
  assert.equal(second.monitor.state, "down");
  assert.equal(second.status, "major");
  assert.deepEqual(second.open, { title: "API is down", body: "Our checks can't reach API (HTTP 503). We're looking into it." });
  assert.equal(second.monitor.since, now);

  const third = next(m({ state: "down", fails: 2 }), down, ctx);
  assert.equal(third.status, null, "already down: nothing more to change");
  assert.equal(third.open, null);
  assert.equal(third.monitor.fails, 3);
});

test("an incident opens only when asked and nothing already covers it", () => {
  const twice = m({ fails: 1 });
  assert.equal(next(m({ fails: 1, open_incidents: false }), down, ctx).open, null);
  assert.equal(next(twice, down, { ...ctx, coveredByIncident: true }).open, null);
  assert.equal(next(twice, down, { ...ctx, ownIncidentOpen: true }).open, null);
  assert.equal(next(twice, down, { ...ctx, coveredByIncident: true }).status, "major", "the status still changes");
});

test("recovery resolves the monitor's own incident, and only that", () => {
  const was = m({ state: "down", fails: 4, since: new Date("2026-10-10T19:48:00Z"), incident_id: 7 });
  const back = next(was, up, { ...ctx, ownIncidentOpen: true });
  assert.equal(back.status, "operational");
  assert.deepEqual(back.resolve, { incident_id: 7, body: "API is back up. It was down for 12 minutes." });
  assert.equal(back.monitor.incident_id, null);
  assert.equal(back.monitor.fails, 0);

  const closedByHand = next(was, up, ctx);
  assert.equal(closedByHand.resolve, null);
  assert.equal(closedByHand.status, "operational");
});

test("slow answers degrade, and fast ones restore", () => {
  assert.equal(next(m(), { state: "slow", ms: 4000, error: "" }, ctx).status, "degraded");
  assert.equal(next(m({ state: "slow" }), up, ctx).status, "operational");
  assert.equal(next(m({ state: "slow" }), up, ctx).resolve, null);
});

test("nothing changes during maintenance, but failures are counted", () => {
  const fx = next(m({ fails: 3 }), down, { ...ctx, inMaintenance: true });
  assert.equal(fx.status, null);
  assert.equal(fx.open, null);
  assert.equal(fx.monitor.state, "up");
  assert.equal(fx.monitor.fails, 4);
});

test("only public addresses are checked", () => {
  for (const ip of ["8.8.8.8", "1.1.1.1", "2606:4700:4700::1111", "::ffff:8.8.8.8"]) assert.ok(publicAddress(ip), ip);
  for (const ip of ["127.0.0.1", "10.1.2.3", "172.16.0.1", "172.31.255.255", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "::1", "fd00::1", "fe80::1", "::ffff:127.0.0.1", "::ffff:7f00:1", "224.0.0.1"])
    assert.ok(!publicAddress(ip), ip);
  for (const h of ["example.com", "status.example.com", "8.8.8.8"]) assert.ok(publicHost(h), h);
  for (const h of ["localhost", "db", "app.internal", "printer.local", "10.0.0.5", "[::1]", "api.localhost"]) assert.ok(!publicHost(h), h);
});

test("the monitor form", () => {
  const ok = monitorFrom({ url: " https://example.com/health ", keyword: "ok", slow_ms: "1500", open_incidents: "on" });
  assert.deepEqual(ok, { ok: true, value: { url: "https://example.com/health", keyword: "ok", slow_ms: 1500, open_incidents: true, paused: false } });
  assert.equal(monitorFrom({ url: "https://example.com", slow_ms: "abc" }).ok && (monitorFrom({ url: "https://example.com", slow_ms: "abc" }) as { value: { slow_ms: number } }).value.slow_ms, 3000);
  for (const url of ["", "example.com", "ftp://example.com", "https://user:pw@example.com", "http://localhost:8080", "http://169.254.169.254/latest"])
    assert.equal(monitorFrom({ url }).ok, false, url);
  assert.equal(monitorFrom({ url: "https://status.examples.whisk.page/" }, DEMO_HOSTS).ok, false);
  assert.equal(monitorFrom({ url: "https://example.com/nope" }, DEMO_HOSTS).ok, true);
});

test("uptime and average response time of the last checks", () => {
  const cs = [
    { ok: true, ms: 100 },
    { ok: true, ms: 200 },
    { ok: false, ms: null },
  ];
  assert.equal(checksUptime(cs), 66.66);
  assert.equal(averageMs(cs), 150);
  assert.equal(checksUptime([]), null);
  assert.equal(averageMs([{ ok: false, ms: null }]), null);
});
