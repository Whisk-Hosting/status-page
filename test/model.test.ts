import assert from "node:assert/strict";
import { test } from "node:test";
import {
  addDays,
  cleanEmail,
  cleanUrl,
  duration,
  keyFrom,
  endedAt,
  localDate,
  maintenanceState,
  move,
  nextImpact,
  overall,
  sections,
  shownStatus,
  uptimeDays,
  uptimePercent,
  worst,
  zonedTime,
  type Component,
  type Incident,
} from "../src/model.js";

const d = (s: string) => new Date(s);
const comp = (over: Partial<Component> = {}): Component => ({ id: 1, group_id: null, name: "API", description: "", position: 1, status: "operational", created_at: d("2026-01-01T00:00:00Z"), ...over });
const inc = (over: Partial<Incident> = {}): Incident => ({
  id: 1, kind: "incident", title: "x", impact: "partial", state: "investigating", starts_at: null, ends_at: null, resolved_at: null, created_at: d("2026-10-01T00:00:00Z"), component_ids: [1], ...over,
});

test("worst and overall", () => {
  for (const [xs, want] of [
    [[], "operational"],
    [["operational", "degraded"], "degraded"],
    [["maintenance", "operational"], "maintenance"],
    [["degraded", "maintenance"], "degraded"],
    [["partial", "major", "degraded"], "major"],
  ] as const) assert.equal(overall(xs), want);
  assert.equal(worst([], "degraded"), "degraded");
});

test("maintenance state follows its window", () => {
  const w = { starts_at: d("2026-10-10T10:00:00Z"), ends_at: d("2026-10-10T12:00:00Z"), resolved_at: null };
  for (const [now, want] of [
    ["2026-10-10T09:59:00Z", "scheduled"],
    ["2026-10-10T10:00:00Z", "in_progress"],
    ["2026-10-10T11:59:00Z", "in_progress"],
    ["2026-10-10T12:00:00Z", "completed"],
  ] as const) assert.equal(maintenanceState(w, d(now)), want, now);
  assert.equal(maintenanceState({ ...w, resolved_at: d("2026-10-10T10:30:00Z") }, d("2026-10-10T11:00:00Z")), "completed");
});

test("a component under maintenance shows it only while operational", () => {
  const m = inc({ kind: "maintenance", state: "scheduled", starts_at: d("2026-10-10T10:00:00Z"), ends_at: d("2026-10-10T12:00:00Z") });
  const now = d("2026-10-10T11:00:00Z");
  assert.equal(shownStatus(comp(), [m], now), "maintenance");
  assert.equal(shownStatus(comp({ status: "major" }), [m], now), "major");
  assert.equal(shownStatus(comp({ id: 2 }), [m], now), "operational");
  assert.equal(shownStatus(comp(), [m], d("2026-10-10T13:00:00Z")), "operational");
});

test("endedAt: early finish, window end, open", () => {
  const m = inc({ kind: "maintenance", starts_at: d("2026-10-10T10:00:00Z"), ends_at: d("2026-10-10T12:00:00Z") });
  assert.equal(endedAt(m, d("2026-10-10T11:00:00Z")), null);
  assert.deepEqual(endedAt(m, d("2026-10-11T00:00:00Z")), d("2026-10-10T12:00:00Z"));
  assert.deepEqual(endedAt({ ...m, resolved_at: d("2026-10-10T10:40:00Z") }, d("2026-10-11T00:00:00Z")), d("2026-10-10T10:40:00Z"));
  assert.deepEqual(endedAt(inc({ state: "resolved", resolved_at: d("2026-10-01T01:00:00Z") }), d("2026-10-02T00:00:00Z")), d("2026-10-01T01:00:00Z"));
});

test("impact only grows", () => {
  assert.equal(nextImpact("partial", ["degraded"]), "partial");
  assert.equal(nextImpact("partial", ["major"]), "major");
  assert.equal(nextImpact("degraded", []), "degraded");
});

test("time zones: local dates and wall-clock times", () => {
  assert.equal(localDate(d("2026-10-10T03:00:00Z"), "America/New_York"), "2026-10-09");
  assert.equal(zonedTime("2026-10-10", "00:00", "America/New_York").toISOString(), "2026-10-10T04:00:00.000Z");
  // Across the end of US daylight saving time (1 November 2026).
  assert.equal(zonedTime("2026-10-31", "12:00", "America/New_York").toISOString(), "2026-10-31T16:00:00.000Z");
  assert.equal(zonedTime("2026-11-02", "12:00", "America/New_York").toISOString(), "2026-11-02T17:00:00.000Z");
  assert.equal(zonedTime("2026-10-10", "14:30", "UTC").toISOString(), "2026-10-10T14:30:00.000Z");
  assert.equal(addDays("2026-12-31", 1), "2027-01-01");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
});

test("uptime: major counts fully, partial 30 %, degraded not at all", () => {
  const now = d("2026-10-10T00:00:00Z");
  const c = comp({ created_at: d("2026-10-01T00:00:00Z") });
  const days = (changes: { status: "operational" | "degraded" | "partial" | "major"; at: Date }[]) => uptimeDays(c, changes, [], now, "UTC", 3);
  const [, , today] = days([]);
  assert.equal(today.uptime, null, "no time has passed today");
  const [a, b] = days([
    { status: "major", at: d("2026-10-08T00:00:00Z") },
    { status: "operational", at: d("2026-10-08T12:00:00Z") },
    { status: "partial", at: d("2026-10-09T00:00:00Z") },
    { status: "operational", at: d("2026-10-09T12:00:00Z") },
  ]);
  assert.equal(a.date, "2026-10-08");
  assert.equal(a.uptime, 0.5);
  assert.equal(a.worst, "major");
  assert.equal(b.uptime, 1 - 0.5 * 0.3);
  assert.equal(b.worst, "partial");
  const [x] = days([{ status: "degraded", at: d("2026-10-08T00:00:00Z") }]);
  assert.equal(x.uptime, 1);
  assert.equal(x.worst, "degraded");
});

test("uptime: before a component existed there is no data", () => {
  const now = d("2026-10-10T06:00:00Z");
  const ds = uptimeDays(comp({ created_at: d("2026-10-10T00:00:00Z") }), [], [], now, "UTC", 3);
  assert.deepEqual(ds.map((x) => x.uptime), [null, null, 1]);
  assert.equal(uptimePercent(ds), 100);
  assert.equal(uptimePercent([]), null);
});

test("uptime days list the incidents that touched them", () => {
  const now = d("2026-10-10T06:00:00Z");
  const i = inc({ created_at: d("2026-10-09T23:00:00Z"), resolved_at: d("2026-10-10T01:00:00Z"), state: "resolved" });
  const ds = uptimeDays(comp(), [], [i, inc({ id: 2, component_ids: [9] })], now, "UTC", 2);
  assert.deepEqual(ds.map((x) => x.incidents.map((y) => y.id)), [[1], [1]]);
});

test("sections: loose components first, then groups in order, empty groups dropped", () => {
  const s = sections(
    [{ id: 2, name: "B", position: 2 }, { id: 1, name: "A", position: 1 }, { id: 3, name: "Empty", position: 3 }],
    [comp({ id: 1, group_id: 2 }), comp({ id: 2, group_id: null, position: 5 }), comp({ id: 3, group_id: 1 }), comp({ id: 4, group_id: 99 })],
  );
  assert.deepEqual(s.map((x) => [x.group?.name ?? null, x.components.map((c) => c.id)]), [[null, [4]], [null, [2]], ["A", [3]], ["B", [1]]]);
});

test("cleanEmail, cleanUrl", () => {
  for (const [v, want] of [[" Ana@Example.COM ", "ana@example.com"], ["nope", null], ["a@b", null], ["a b@c.com", null], [42, null]] as const) assert.equal(cleanEmail(v), want);
  for (const [v, want] of [["https://x.com", "https://x.com/"], ["javascript:alert(1)", ""], ["", ""], ["ftp://x.com", ""]] as const) assert.equal(cleanUrl(v), want);
});

test("move and duration", () => {
  assert.deepEqual(move([1, 2, 3], 2, -1), [2, 1, 3]);
  assert.deepEqual(move([1, 2, 3], 3, 1), [1, 2, 3]);
  assert.deepEqual(move([1, 2, 3], 9, 1), [1, 2, 3]);
  for (const [ms, want] of [[60_000, "1 minute"], [52 * 60_000, "52 minutes"], [128 * 60_000, "2 hours 8 minutes"], [3 * 3600_000, "3 hours"], [3 * 86_400_000, "3 days"]] as const) assert.equal(duration(ms), want);
});

test("keyFrom reads a key as Bearer, Basic user name, X-Api-Key or ?token=", () => {
  const b64 = (s: string) => Buffer.from(s).toString("base64");
  const cases: [string, Record<string, string>, string | undefined, string][] = [
    ["bearer", { authorization: "Bearer sp_abc" }, undefined, "sp_abc"],
    ["bearer, any case, spaces", { authorization: "  bearer   sp_abc " }, undefined, "sp_abc"],
    ["basic with the key as user name", { authorization: `Basic ${b64("sp_abc:")}` }, undefined, "sp_abc"],
    ["basic without a colon", { authorization: `basic ${b64("sp_abc")}` }, undefined, "sp_abc"],
    ["x-api-key", { "x-api-key": "sp_abc" }, undefined, "sp_abc"],
    ["?token=", {}, "sp_abc", "sp_abc"],
    ["bearer wins over the rest", { authorization: "Bearer sp_one", "x-api-key": "sp_two" }, "sp_three", "sp_one"],
    ["x-api-key wins over ?token=", { "x-api-key": "sp_two" }, "sp_three", "sp_two"],
    ["another scheme falls through", { authorization: "Token sp_one", "x-api-key": "sp_two" }, undefined, "sp_two"],
    ["nothing", {}, undefined, ""],
  ];
  for (const [name, headers, token, want] of cases) assert.equal(keyFrom((n) => headers[n], token), want, name);
});
