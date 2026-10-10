// /api/v1: for monitors, deploy scripts and other systems. Each call carries a key made under
// Manage > Settings, as "Authorization: Bearer sp_...", X-Api-Key, Basic auth with the key as the
// user name, or ?token= (model.ts keyFrom). Errors are {"error": {code, message, fix}}.
import { Hono, type Context } from "hono";
import { newIncident, newUpdate } from "./forms.js";
import { currentState, isStatus, keyFrom, statusLabel, type Component, type Incident } from "./model.js";
import { announce } from "./notify.js";
import * as store from "./store.js";

type Env = { Variables: { key: string } };
export const api = new Hono<Env>();

const err = (c: Context, status: 400 | 401 | 404, code: string, message: string, fix: string) => c.json({ error: { code, message, fix } }, status);

api.use("*", async (c, next) => {
  const key = keyFrom((n) => c.req.header(n), c.req.query("token"));
  const found = key.startsWith("sp_") ? await store.keyFor(key) : undefined;
  if (!found) return err(c, 401, "KEY_REQUIRED", "This needs an API key.", "Make one under Manage > Settings > API keys and send it as Authorization: Bearer <key>.");
  c.set("key", found.name);
  c.header("Cache-Control", "no-store");
  await next();
});

const componentJson = (c: Component) => ({ id: c.id, name: c.name, description: c.description, group_id: c.group_id, status: c.status, status_label: statusLabel[c.status] });
const incidentJson = (i: Incident, now: Date) => ({
  id: i.id,
  kind: i.kind,
  title: i.title,
  state: currentState(i, now),
  impact: i.impact,
  component_ids: i.component_ids,
  starts_at: i.starts_at,
  ends_at: i.ends_at,
  resolved_at: i.resolved_at,
  created_at: i.created_at,
});

// The JSON body as form-like fields, so the API and the pages share one reading of them.
const fields = async (c: Context) => {
  const b = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const ids = Array.isArray(b.component_ids) ? b.component_ids.map(Number) : [];
  const status = isStatus(b.status) ? b.status : undefined;
  return {
    ...b,
    component: ids.map(String),
    notify: b.notify === false ? "off" : "on",
    ...Object.fromEntries(ids.map((id) => [`status_${id}`, status ?? (isStatus((b.statuses as Record<string, unknown> | undefined)?.[id]) ? (b.statuses as Record<string, unknown>)[id] : undefined)])),
  };
};

api.get("/", (c) =>
  c.json({
    endpoints: [
      "GET /api/v1/components",
      "PUT /api/v1/components/:id {status: operational|degraded|partial|major}",
      "GET /api/v1/incidents",
      "POST /api/v1/incidents {title, body, state?, component_ids?, status?, notify?}",
      "POST /api/v1/incidents/:id/updates {state, body, status?, notify?}",
    ],
  }),
);

api.get("/components", async (c) => c.json({ components: (await store.components()).map(componentJson) }));

api.put("/components/:id", async (c) => {
  const comp = await store.componentById(Number(c.req.param("id")) || 0);
  if (!comp) return err(c, 404, "NOT_FOUND", "There is no such component.", "GET /api/v1/components lists them.");
  const b = (await c.req.json().catch(() => ({}))) as { status?: unknown };
  if (!isStatus(b.status)) return err(c, 400, "INVALID_STATUS", "status must be operational, degraded, partial or major.", "Send {\"status\": \"major\"}.");
  await store.sql.begin((tx) => store.setStatuses(tx, new Map([[comp.id, b.status as never]])));
  return c.json({ component: componentJson({ ...comp, status: b.status }) });
});

api.get("/incidents", async (c) => {
  const now = new Date();
  return c.json({ incidents: (await store.incidentPage(50, 0)).map((i) => incidentJson(i, now)) });
});

api.post("/incidents", async (c) => {
  const [s, comps] = await Promise.all([store.settings(), store.components()]);
  const r = newIncident(await fields(c), "incident", comps, s.time_zone, new Date());
  if (!r.ok) return err(c, 400, "INVALID_INCIDENT", r.error, "Send {\"title\": \"...\", \"body\": \"...\", \"component_ids\": [1], \"status\": \"major\"}.");
  const { id, update_id } = await store.createIncident({ ...r.value, author: `API: ${c.get("key")}` });
  if (r.value.notify) await announce(update_id);
  return c.json({ incident: incidentJson((await store.incidentById(id))!, new Date()) }, 201);
});

api.post("/incidents/:id/updates", async (c) => {
  const i = await store.incidentById(Number(c.req.param("id")) || 0);
  if (!i) return err(c, 404, "NOT_FOUND", "There is no such incident.", "GET /api/v1/incidents lists them.");
  const r = newUpdate(await fields(c), i, new Date());
  if (!r.ok) return err(c, 400, "INVALID_UPDATE", r.error, "Send {\"state\": \"resolved\", \"body\": \"...\"}.");
  const id = await store.addUpdate({ incident_id: i.id, author: `API: ${c.get("key")}`, ...r.value });
  if (r.value.notify) await announce(id);
  return c.json({ incident: incidentJson((await store.incidentById(i.id))!, new Date()), update_id: id }, 201);
});

