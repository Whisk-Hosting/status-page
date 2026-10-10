// Pages anyone may open (routes.public in whisk.yaml): the status page, incidents, history,
// feeds, JSON, and subscribing. The only writes are subscribe (behind the bot challenge) and the
// confirm and unsubscribe buttons, which act only for the holder of the emailed token.
import type { Context, Hono } from "hono";
import { html } from "hono/html";
import { demoOn } from "../demo.js";
import { atom, badge, statusJson, summaryJson } from "../feeds.js";
import { loadPage } from "../load.js";
import { cleanEmail, localDate, zonedTime, type Component, type Shown } from "../model.js";
import { sendConfirmation } from "../notify.js";
import * as store from "../store.js";
import { historyPage, incidentPage, statusPage, subscribePage, tokenPage } from "../views/public.js";
import { icon } from "../views/icons.js";
import { flash, form, idParam, notFound, render, text, who } from "../web.js";
import { canPost, log, publicUrl } from "../whisk.js";

// Anonymous visitors share one cached copy for a few seconds; staff always see it fresh.
const cacheFor = (c: Context, seconds: number) => {
  const id = who(c);
  c.header("Cache-Control", id.audience === "anonymous" && !demoOn() ? `public, max-age=${seconds}` : "private, no-store");
};

const demoCard = html`<form class="card demo-card" method="post" action="/demo/start" data-challenge>
  <div><h2>Live demo</h2><span class="muted small">Post incidents, change statuses, schedule maintenance</span></div>
  <button class="btn primary" type="submit">${icon.right} Look around</button>
</form>`;

export const publicRoutes = (app: Hono) => {
  app.get("/", async (c) => {
    const p = await loadPage();
    const id = who(c);
    cacheFor(c, 15);
    return render(c, p.s.name, statusPage({ ...p, flash: flash(c), demoCard: demoOn() && !canPost(id) ? demoCard : undefined }), { s: p.s });
  });

  app.get("/incidents/:id", async (c) => {
    const i = await store.incidentById(idParam(c));
    if (!i) return notFound(c);
    const [s, comps, updates] = await Promise.all([store.settings(), store.components(), store.updatesFor([i.id])]);
    const now = new Date();
    cacheFor(c, 15);
    return render(
      c,
      i.title,
      incidentPage({
        s,
        now,
        i,
        updates,
        names: new Map(comps.map((x) => [x.id, x.name])),
        shown: (x: Component): Shown => x.status,
        manage: canPost(who(c)) ? `/admin/incidents/${i.id}` : undefined,
      }),
      { s },
    );
  });

  const history = async (c: Context, month?: string) => {
    const s = await store.settings();
    const now = new Date();
    const thisMonth = localDate(now, s.time_zone).slice(0, 7);
    const m = month && /^\d{4}-(0[1-9]|1[0-2])$/.test(month) && month <= thisMonth ? month : thisMonth;
    const shift = (n: number) => {
      const [y, mo] = m.split("-").map(Number);
      const d = new Date(Date.UTC(y, mo - 1 + n, 1));
      return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    };
    const from = zonedTime(`${m}-01`, "00:00", s.time_zone);
    const to = zonedTime(`${shift(1)}-01`, "00:00", s.time_zone);
    const [incidents, first, comps] = await Promise.all([store.incidentsBetween(from, to), store.firstIncidentAt(), store.components()]);
    const visible = incidents.filter((i) => (i.starts_at ?? i.created_at) <= now);
    const updates = await store.updatesFor(visible.map((i) => i.id));
    const firstMonth = first ? localDate(first, s.time_zone).slice(0, 7) : thisMonth;
    cacheFor(c, 60);
    return render(
      c,
      "Incident history",
      historyPage({
        s,
        now,
        month: m,
        incidents: visible,
        updates,
        names: new Map(comps.map((x) => [x.id, x.name])),
        shown: (x: Component): Shown => x.status,
        prev: shift(-1) >= firstMonth ? shift(-1) : undefined,
        next: m < thisMonth ? shift(1) : undefined,
      }),
      { s },
    );
  };
  app.get("/history", (c) => history(c));
  app.get("/history/:month", (c) => history(c, c.req.param("month")));

  // ----- Subscribing -----

  app.get("/subscribe", async (c) => render(c, "Subscribe", subscribePage(await store.settings(), {})));

  app.post("/subscribe", async (c) => {
    const s = await store.settings();
    const b = await form(c);
    const raw = text(b.email, 254);
    const email = cleanEmail(raw);
    if (!email) return render(c, "Subscribe", subscribePage(s, { error: "Enter a valid email address.", email: raw }), { status: 400, s });
    const sub = await store.subscribe(email);
    if (sub.confirmed_at) return render(c, "Subscribe", subscribePage(s, { done: "You're already subscribed." }), { s });
    try {
      const sent = await sendConfirmation(sub);
      return render(c, "Subscribe", subscribePage(s, { done: sent === "demo" ? "Demo: confirmation email recorded, not sent." : "Check your email to confirm." }), { s });
    } catch (err) {
      log.warn({ err: String(err) }, "confirmation email failed");
      return render(c, "Subscribe", subscribePage(s, { error: "The confirmation email could not be sent. Try again shortly.", email }), { status: 502, s });
    }
  });

  // Confirming and unsubscribing take a button press, not just opening the link, so mail
  // scanners that open links do not act on them.
  app.get("/subscribe/confirm/:token", async (c) => {
    const sub = await store.subscriberByToken(c.req.param("token"));
    if (!sub) return render(c, "Confirm", tokenPage({ title: "This link has expired", error: "Subscribe again to get a new one." }), { status: 404 });
    if (sub.confirmed_at) return render(c, "Confirm", tokenPage({ title: "Subscribed", done: "You'll get an email for each incident and maintenance update." }));
    return render(c, "Confirm", tokenPage({ title: "Confirm your subscription", action: c.req.path, button: "Confirm" }));
  });
  app.post("/subscribe/confirm/:token", async (c) => {
    const sub = await store.subscriberByToken(c.req.param("token"));
    if (!sub) return render(c, "Confirm", tokenPage({ title: "This link has expired", error: "Subscribe again to get a new one." }), { status: 404 });
    await store.confirmSubscriber(sub.id);
    return render(c, "Confirm", tokenPage({ title: "Subscribed", done: "You'll get an email for each incident and maintenance update." }));
  });

  app.get("/unsubscribe/:token", async (c) => {
    const sub = await store.subscriberByToken(c.req.param("token"));
    if (!sub) return render(c, "Unsubscribe", tokenPage({ title: "Unsubscribed", done: "You won't get any more emails." }));
    return render(c, "Unsubscribe", tokenPage({ title: `Unsubscribe ${sub.email}`, action: c.req.path, button: "Unsubscribe" }));
  });
  app.post("/unsubscribe/:token", async (c) => {
    const sub = await store.subscriberByToken(c.req.param("token"));
    if (sub) await store.removeSubscriber(sub.id);
    return render(c, "Unsubscribe", tokenPage({ title: "Unsubscribed", done: "You won't get any more emails." }));
  });

  // ----- Feeds, badge and JSON -----

  app.get("/feed.atom", async (c) => {
    const p = await loadPage();
    c.header("Cache-Control", "public, max-age=60");
    return c.body(atom(p.s, publicUrl(), p.incidents.filter((i) => (i.starts_at ?? i.created_at) <= p.now || i.kind === "maintenance"), p.updates, p.now), 200, {
      "content-type": "application/atom+xml; charset=utf-8",
    });
  });

  app.get("/badge.svg", async (c) => {
    const p = await loadPage();
    c.header("Cache-Control", "public, max-age=60");
    return c.body(badge(p.overall), 200, { "content-type": "image/svg+xml" });
  });

  const json = async (c: Context, shape: "status" | "summary") => {
    const p = await loadPage();
    c.header("Cache-Control", "public, max-age=30");
    c.header("Access-Control-Allow-Origin", "*");
    const data = { ...p, base: publicUrl() };
    return c.json(shape === "status" ? statusJson(data) : summaryJson(data));
  };
  app.get("/api/v2/status.json", (c) => json(c, "status"));
  app.get("/api/v2/summary.json", (c) => json(c, "summary"));

};
