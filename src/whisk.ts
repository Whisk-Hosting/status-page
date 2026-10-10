// The Whisk conventions this app uses: identity from the platform headers, JSON logs with the
// request id, the queue, and calls to the Whisk API with the app's service token.
import { Inngest } from "inngest";
import pino from "pino";

export const env = (name: string, fallback?: string): string => {
  const v = process.env[name] ?? fallback;
  if (v === undefined) throw new Error(`${name} is not set`);
  return v;
};

export const log = pino({ level: process.env.LOG_LEVEL ?? "info", base: { app: process.env.WHISK_APP_NAME } });

// Only the X-Whisk-* headers say who the caller is; the platform strips any copy from outside.
export type Identity = Readonly<{
  audience: "anonymous" | "team" | "customer" | "service";
  userId?: string;
  email?: string;
  name?: string;
  groups: readonly string[];
  roles: readonly string[];
  requestId: string;
}>;

const list = (v: string | undefined) => (v ?? "").split(",").filter(Boolean);

export const identity = (h: (name: string) => string | undefined): Identity => ({
  audience: (h("x-whisk-audience") as Identity["audience"]) ?? "anonymous",
  userId: h("x-whisk-user-id"),
  email: h("x-whisk-email"),
  name: h("x-whisk-name"),
  groups: list(h("x-whisk-groups")),
  roles: list(h("x-whisk-roles")),
  requestId: h("x-whisk-request-id") ?? "",
});

// Staff are the business's own Whisk team. Everyone on it may post incidents and change
// components; owners and admins (or the "status-admins" group) also change settings, API keys
// and subscribers. Change the rules here and nowhere else.
export const canPost = (id: Identity) => id.audience === "team";
export const canAdmin = (id: Identity) => canPost(id) && (id.roles.includes("owner") || id.roles.includes("admin") || id.groups.includes("status-admins"));

// The API origin and the app's path on it come from WHISK_QUEUE_URL
// (https://api.whisk.run/v1/orgs/<org>/apps/<app>/events).
const appApi = (path: string) => env("WHISK_QUEUE_URL").replace(/\/events$/, "") + path;

export type ApiError = { code: string; message: string; fix?: string };

// whiskApi calls the Whisk API as this app, with a deadline. The service token rotates daily,
// so it is read from the environment on every call.
export const whiskApi = async <T>(path: string, body?: unknown, method = body === undefined ? "GET" : "POST"): Promise<T> => {
  if (localOnly()) return (await localApi(path, body, method)) as T;
  const res = await fetch(appApi(path), {
    method,
    signal: AbortSignal.timeout(15_000),
    headers: { "content-type": "application/json", authorization: `Bearer ${env("WHISK_SERVICE_TOKEN")}` },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: ApiError };
  if (!res.ok) throw Object.assign(new Error(json.error?.message ?? `Whisk API ${res.status}`), { api: json.error });
  return json as T;
};

// The Inngest client. The platform delivers function runs to /.whisk/inngest and signs them with
// WHISK_INNGEST_SIGNING_KEY. Event names are plain: the platform keeps each app's events apart.
export const inngest = new Inngest({
  id: process.env.WHISK_APP_NAME ?? "status",
  eventKey: process.env.WHISK_INNGEST_EVENT_KEY,
  signingKey: process.env.WHISK_INNGEST_SIGNING_KEY,
  baseUrl: process.env.WHISK_INNGEST_URL,
  isDev: process.env.WHISK_DEV === "1",
  logger: log,
});

export const isPreview = () => (process.env.WHISK_ENV ?? "").startsWith("preview:");
// False outside Whisk (a plain local run) and in a preview, where work runs inline instead.
export const queueAvailable = () => !!process.env.WHISK_QUEUE_URL && !!process.env.WHISK_SERVICE_TOKEN && !isPreview();

// enqueue sends an event through the platform queue. Same dedupe key within 24 hours: dropped.
export const enqueue = async (name: string, data: unknown, dedupeKey?: string): Promise<void> => {
  const res = await fetch(env("WHISK_QUEUE_URL"), {
    method: "POST",
    signal: AbortSignal.timeout(10_000),
    headers: { "content-type": "application/json", authorization: `Bearer ${env("WHISK_SERVICE_TOKEN")}` },
    body: JSON.stringify({ name, data, dedupe_key: dedupeKey }),
  });
  if (!res.ok) throw new Error(`enqueue ${name}: ${res.status} ${await res.text()}`);
};

export const publicUrl = () => (process.env.WHISK_PUBLIC_URL ?? `http://localhost:${process.env.PORT ?? 8080}`).replace(/\/$/, "");

// ----- Local stand-in -----

// On a laptop without Whisk (no WHISK_QUEUE_URL), the few Whisk API calls the app makes are
// answered here so every screen works: email is logged, uploads are refused politely.
export const localOnly = () => !process.env.WHISK_QUEUE_URL;

const localApi = async (path: string, body: unknown, method: string): Promise<unknown> => {
  if (path === "/email/send") {
    const b = (body ?? {}) as { to?: string; subject?: string };
    log.info({ to: b.to, subject: b.subject }, "local run: email not sent");
    return { id: "local" };
  }
  throw Object.assign(new Error(`${method} ${path} needs Whisk`), { api: { code: "LOCAL_RUN", message: "This needs the app running on Whisk.", fix: "Deploy it with whisk deploy." } });
};
