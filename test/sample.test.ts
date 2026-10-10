import assert from "node:assert/strict";
import { test } from "node:test";
import { atom, badge, summaryJson } from "../src/feeds.js";
import { impliedChanges, sample } from "../src/sample.js";

const now = new Date("2026-10-09T05:00:00Z");

test("the sample is self-consistent", () => {
  const s = sample(now);
  const keys = new Set(s.components.map((c) => c.key));
  for (const i of s.incidents) {
    for (const k of i.components) assert.ok(keys.has(k), `${i.title}: ${k}`);
    assert.ok(i.updates.length > 0);
  }
  for (const c of s.components) assert.ok(c.group === null || s.groups.includes(c.group));
  assert.ok(s.incidents.some((i) => i.kind === "maintenance" && i.start > now), "an upcoming window");
});

test("incidents imply status changes; open ones leave the component down", () => {
  const s = sample(now);
  const open = s.incidents.find((i) => i.title === "Shopify orders arriving late")!;
  assert.deepEqual(impliedChanges(open, now).map((c) => c.status), ["degraded"]);
  const closed = s.incidents.find((i) => i.title === "Ordering unavailable")!;
  assert.deepEqual(impliedChanges(closed, now).map((c) => [c.key, c.status]), [["app", "major"], ["app", "operational"], ["mobile", "major"], ["mobile", "operational"]]);
  assert.deepEqual(impliedChanges(s.incidents.find((i) => i.kind === "maintenance")!, now), []);
});

test("feeds escape what people typed", () => {
  const s = { name: "A & B <x>", logo_upload: null, accent: "#000000", website_url: "", support_url: "", time_zone: "UTC", email_from: "" };
  const inc = { id: 1, kind: "incident" as const, title: "<script>", impact: "major" as const, state: "investigating" as const, starts_at: null, ends_at: null, resolved_at: null, created_at: now, component_ids: [] };
  const xml = atom(s, "https://x", [inc], new Map([[1, [{ id: 1, incident_id: 1, state: "investigating" as const, body: "a < b", at: now, author: "" }]]]), now);
  assert.ok(!xml.includes("<script>"));
  assert.ok(xml.includes("A &amp; B &lt;x&gt;"));
  assert.ok(badge("major").includes("Major outage"));
  const j = summaryJson({ s, base: "https://x", now, overall: "major", groups: [], comps: [], shown: () => "operational", incidents: [inc], updates: new Map() });
  assert.equal(j.status.indicator, "critical");
  assert.equal(j.incidents.length, 1);
  assert.equal(j.incidents[0].impact, "critical");
});
