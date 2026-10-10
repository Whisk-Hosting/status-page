import assert from "node:assert/strict";
import { test } from "node:test";
import { changedStatuses, newIncident, newUpdate, windowFrom } from "../src/forms.js";
import type { Incident } from "../src/model.js";

const comps = [{ id: 1, status: "operational" as const }, { id: 2, status: "major" as const }];
const now = new Date("2026-10-09T00:00:00Z");

test("a new incident takes its impact from the worst status chosen", () => {
  const r = newIncident({ title: "Down", body: "Looking", state: "identified", component: ["1", "2", "7"], status_1: "partial", status_2: "major", notify: "on" }, "incident", comps, "UTC", now);
  assert.ok(r.ok);
  assert.equal(r.value.impact, "major");
  assert.equal(r.value.state, "identified");
  assert.deepEqual(r.value.component_ids, [1, 2]);
  assert.deepEqual([...r.value.statuses], [[1, "partial"], [2, "major"]]);
  assert.equal(r.value.notify, true);
});

test("a new incident: missing fields, bad states, resolved at once", () => {
  for (const [b, error] of [
    [{ body: "x" }, "Give it a title."],
    [{ title: "x" }, "Write a message for the first update."],
  ] as const) assert.deepEqual(newIncident(b, "incident", comps, "UTC", now), { ok: false, error });
  const odd = newIncident({ title: "t", body: "b", state: "exploded", component: "1", status_1: "sideways" }, "incident", comps, "UTC", now);
  assert.ok(odd.ok);
  assert.equal(odd.value.state, "investigating");
  assert.equal(odd.value.statuses.get(1), "operational");
  assert.equal(odd.value.notify, false);
  const done = newIncident({ title: "t", body: "b", state: "resolved", component: "1", status_1: "major" }, "incident", comps, "UTC", now);
  assert.ok(done.ok);
  assert.equal(done.value.statuses.get(1), "operational");
  assert.equal(done.value.impact, "major");
});

test("maintenance windows", () => {
  const w = windowFrom({ date: "2026-10-10", start: "22:00", end: "01:00" }, "America/New_York");
  assert.ok(w.ok);
  assert.equal(w.value.starts_at.toISOString(), "2026-10-11T02:00:00.000Z");
  assert.equal(w.value.ends_at.toISOString(), "2026-10-11T05:00:00.000Z");
  assert.deepEqual(windowFrom({ date: "10/10/2026", start: "22:00", end: "23:00" }, "UTC"), { ok: false, error: "Enter the date, start time and end time." });
  const past = newIncident({ title: "t", body: "b", date: "2026-10-01", start: "10:00", end: "11:00" }, "maintenance", comps, "UTC", now);
  assert.equal(past.ok, false);
  const m = newIncident({ title: "t", body: "b", date: "2026-10-12", start: "10:00", end: "11:00", component: "1" }, "maintenance", comps, "UTC", now);
  assert.ok(m.ok);
  assert.equal(m.value.state, "scheduled");
  assert.equal(m.value.statuses.size, 0);
});

const open: Incident = { id: 1, kind: "incident", title: "x", impact: "partial", state: "identified", starts_at: null, ends_at: null, resolved_at: null, created_at: now, component_ids: [1, 2] };

test("updates: impact grows, resolving sets components back", () => {
  const up = newUpdate({ state: "monitoring", body: "Better", status_1: "major", status_2: "degraded", notify: "on" }, open, now);
  assert.ok(up.ok);
  assert.equal(up.value.impact, "major");
  assert.equal(up.value.closes, false);
  assert.deepEqual([...up.value.statuses], [[1, "major"], [2, "degraded"]]);
  const res = newUpdate({ state: "resolved", body: "Fixed", status_1: "major" }, open, now);
  assert.ok(res.ok);
  assert.equal(res.value.closes, true);
  assert.deepEqual([...res.value.statuses], [[1, "operational"], [2, "operational"]]);
  assert.deepEqual(newUpdate({ state: "completed", body: "x" }, open, now), { ok: false, error: "Choose a state." });
  assert.deepEqual(newUpdate({ state: "resolved", body: " " }, open, now), { ok: false, error: "Write a message for the update." });
});

test("starting maintenance early moves its start", () => {
  const m: Incident = { ...open, kind: "maintenance", state: "scheduled", starts_at: new Date("2026-10-10T00:00:00Z"), ends_at: new Date("2026-10-10T02:00:00Z") };
  const r = newUpdate({ state: "in_progress", body: "Started" }, m, now);
  assert.ok(r.ok);
  assert.equal(r.value.startsNow, true);
  assert.equal(r.value.statuses.size, 0);
});

test("only changed statuses are saved", () => {
  assert.deepEqual([...changedStatuses({ status_1: "operational", status_2: "operational", status_3: "major" }, comps)], [[2, "operational"]]);
  assert.deepEqual([...changedStatuses({ status_1: "nope" }, comps)], []);
});
