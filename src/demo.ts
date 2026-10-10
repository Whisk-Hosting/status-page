// The live demo, all in one place (see demo/whisk.yaml). With DEMO=1, a visitor who presses
// "Look around" gets a guest cookie and is treated as a member of the team, emails are recorded
// and never sent, the guest can make API keys to try the API on the sample, and everything resets
// to the sample every night, keys included. Without DEMO=1 none of this
// does anything: the routes answer 404 and the cookie is ignored. A copy can delete this file and
// the few lines that import it.
import type { Context, Hono } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import { sql } from "./db.js";
import { writeSample } from "./seed.js";
import { inngest, log, type Identity } from "./whisk.js";

export const demoOn = () => process.env.DEMO === "1";

const COOKIE = "guest";
const hasGuestCookie = (c: Context) => getCookie(c, COOKIE) === "1" || getCookie(c, `__Host-${COOKIE}`) === "1";

const guest: Identity = {
  audience: "team",
  userId: "demo-guest",
  email: "guest@example.com",
  name: "Guest",
  groups: ["status-admins"],
  roles: ["member"],
  requestId: "",
};

// withGuest is applied by the app's own identity wrapper and nowhere else. A real signed-in team
// member always wins over the cookie.
export const withGuest = (c: Context, id: Identity): Identity =>
  demoOn() && id.audience !== "team" && hasGuestCookie(c) ? { ...guest, requestId: id.requestId } : id;

export const isGuest = (id: Identity) => demoOn() && id.userId === guest.userId;

export const demoRoutes = (app: Hono) => {
  app.post("/demo/start", (c) => {
    if (!demoOn()) return c.notFound();
    setCookie(c, COOKIE, "1", { httpOnly: true, secure: true, sameSite: "Lax", path: "/", maxAge: 60 * 60 * 24 });
    return c.redirect("/admin", 303);
  });
  app.get("/demo/leave", (c) => {
    if (!demoOn()) return c.notFound();
    deleteCookie(c, COOKIE, { path: "/", secure: true });
    return c.redirect("/", 303);
  });
};

// Every night: empty the app's own tables and write the sample again, the same one a first
// install gets. Nothing is selected by name.
const TABLES = ["emails", "api_keys", "subscribers", "incident_updates", "incident_components", "incidents", "status_changes", "components", "component_groups"];

export const resetDemo = async (now = new Date()) =>
  sql.begin(async (tx) => {
    await tx`truncate ${tx(TABLES)} restart identity cascade`;
    await tx`update settings set name = 'Status', logo_upload = null, accent = '#4f46e5', website_url = '', support_url = '', time_zone = 'America/New_York', email_from = '' where id = 1`;
    await writeSample(tx, now);
  });

export const demoFunctions = () =>
  demoOn()
    ? [
        inngest.createFunction({ id: "demo-reset", triggers: [{ cron: "0 3 * * *" }] }, async ({ step }) => {
          await step.run("reset", async () => {
            await resetDemo();
            log.info("demo reset to the sample");
          });
        }),
      ]
    : [];
