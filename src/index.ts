import { serve as nodeServe } from "@hono/node-server";
import { Hono } from "hono";
import { serve as inngestServe } from "inngest/hono";
import { readFile } from "node:fs/promises";
import { api } from "./api.js";
import { sql } from "./db.js";
import { demoRoutes } from "./demo.js";
import { functions } from "./functions.js";
import { adminRoutes } from "./routes/admin.js";
import { publicRoutes } from "./routes/public.js";
import { js } from "./views/scripts.js";
import { css } from "./views/styles.js";
import { notFound, who } from "./web.js";
import { env, inngest, log } from "./whisk.js";

if (process.env.SENTRY_DSN) {
  const Sentry = await import("@sentry/node");
  Sentry.init({ dsn: process.env.SENTRY_DSN, environment: process.env.WHISK_ENV, tracesSampleRate: 0 });
}

const app = new Hono();

// Every request: one JSON log line with the request id.
app.use("*", async (c, next) => {
  const started = Date.now();
  await next();
  log.info({ request_id: who(c).requestId, method: c.req.method, path: c.req.path, status: c.res.status, audience: who(c).audience, ms: Date.now() - started }, "request");
});

app.get("/health", async (c) => {
  try {
    await sql`select 1`;
    return c.json({ ok: true });
  } catch (err) {
    return c.json({ ok: false, error: String(err) }, 503);
  }
});

const asset = (body: string, type: string) => (c: import("hono").Context) => {
  c.header("Cache-Control", "public, max-age=3600");
  return c.body(body, 200, { "content-type": type });
};
app.get("/assets/app.css", asset(css, "text/css; charset=utf-8"));
app.get("/assets/app.js", asset(js, "text/javascript; charset=utf-8"));

// Fonts ship with the app (OFL), so pages ask nothing of anyone else.
const fontDir = new URL("./fonts/", import.meta.url);
const fonts = new Map<string, Uint8Array>();
app.get("/assets/fonts/:file", async (c) => {
  const file = c.req.param("file");
  if (!/^[a-z0-9-]+\.woff2$/.test(file)) return c.notFound();
  const font = fonts.get(file) ?? (await readFile(new URL(file, fontDir)).then((b) => new Uint8Array(b)).catch(() => undefined));
  if (!font) return c.notFound();
  fonts.set(file, font);
  c.header("Cache-Control", "public, max-age=31536000, immutable");
  return c.body(font as Uint8Array<ArrayBuffer>, 200, { "content-type": "font/woff2" });
});

// Function runs arrive here from the platform with the service identity (queue.endpoint).
const inngestHandler = inngestServe({ client: inngest, functions });
app.on(["GET", "POST", "PUT"], "/.whisk/inngest", (c) => inngestHandler(c));

app.route("/api/v1", api);
demoRoutes(app);
publicRoutes(app);
adminRoutes(app);

app.notFound((c) =>
  c.req.path.startsWith("/api/") ? c.json({ error: { code: "NOT_FOUND", message: "There is no such API endpoint.", fix: "GET /api/v1 lists the endpoints." } }, 404) : notFound(c),
);

app.onError(async (err, c) => {
  log.error({ request_id: who(c).requestId, err: err.message, stack: err.stack }, "unhandled error");
  if (process.env.SENTRY_DSN) (await import("@sentry/node")).captureException(err);
  const ref = who(c).requestId.replace(/[^A-Za-z0-9_-]/g, "") || "none";
  if (c.req.path.startsWith("/api/")) return c.json({ error: { code: "INTERNAL", message: "Something went wrong.", fix: `Try again. If it keeps happening, quote ${ref}.` } }, 500);
  return c.html(
    `<!doctype html><meta name="viewport" content="width=device-width, initial-scale=1"><title>Something went wrong</title><body style="font-family:system-ui;max-width:36rem;margin:4rem auto;padding:0 1rem"><h1>Something went wrong</h1><p>Try again in a moment. Reference: ${ref}</p><p><a href="/">Current status</a></p></body>`,
    500,
  );
});

const server = nodeServe({ fetch: app.fetch, port: Number(env("PORT", "8080")), hostname: "0.0.0.0" }, (info) => log.info({ port: info.port }, "listening"));

// SIGTERM: stop accepting, finish in-flight requests, close the pool, exit within the grace period.
const shutdown = () => {
  log.info("shutting down");
  server.close(async () => {
    await sql.end({ timeout: 5 });
    process.exit(0);
  });
  setTimeout(() => process.exit(1), (Number(process.env.WHISK_STOP_GRACE ?? 28) - 2) * 1000).unref();
};
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
