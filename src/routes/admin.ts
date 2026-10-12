// The staff screens. The whole of /admin is private (only a signed-in person reaches it) and
// every route here checks the person is on the business's team; subscribers, settings and keys
// also need an owner or admin (whisk.ts says who).
import type { Context, Hono } from "hono";
import { runChecks } from "../checks.js";
import { demoOn } from "../demo.js";
import { changedStatuses, newIncident, newUpdate, windowFrom } from "../forms.js";
import { loadPage } from "../load.js";
import { cleanEmail, cleanUrl, isColor, isTimeZone, isOpen, move, sections } from "../model.js";
import { DEMO_HOSTS, monitorFrom } from "../monitor.js";
import { announce } from "../notify.js";
import * as store from "../store.js";
import { componentsPage, incidentList, manageIncident, newIncidentPage, overview, settingsPage, subscribersPage } from "../views/admin.js";
import { message } from "../views/public.js";
import { flash, form, idParam, notFound, posInt, render, text, who } from "../web.js";
import { canAdmin, canPost, localOnly, publicUrl, whiskApi } from "../whisk.js";

const PAGE = 50;

const forbidden = (c: Context, what = "This page") => render(c, "Not allowed", message(`${what} is for the business's owners and admins`), { status: 403, staff: true });
const authorName = (c: Context) => who(c).name || who(c).email || "staff";
const page = (c: Context) => Math.max(1, Math.min(10_000, posInt(c.req.query("page")) || 1));

export const adminRoutes = (app: Hono) => {
  // Everyone on the team; anyone else (a customer, a service call) is turned away.
  app.use("/admin/*", async (c, next) => {
    if (!canPost(who(c))) return render(c, "Not allowed", message("This page is for the business's team"), { status: 403 });
    await next();
  });
  app.use("/admin", async (c, next) => {
    if (!canPost(who(c))) return render(c, "Not allowed", message("This page is for the business's team"), { status: 403 });
    await next();
  });
  const adminOnly = async (c: Context, next: () => Promise<void>) => {
    if (!canAdmin(who(c))) return forbidden(c);
    await next();
  };
  for (const p of ["/admin/subscribers", "/admin/subscribers/*", "/admin/subscribers.csv", "/admin/settings", "/admin/settings/*", "/admin/keys", "/admin/keys/*"]) app.use(p, adminOnly);

  // ----- Now -----

  app.get("/admin", async (c) => {
    const p = await loadPage();
    const counts = await store.subscriberCounts();
    const open = p.incidents.filter((i) => isOpen(i, p.now));
    return render(c, "Manage", overview({ ...p, flash: flash(c), admin: canAdmin(who(c)), open, subscribers: counts.confirmed }), { staff: true, s: p.s });
  });

  app.post("/admin/statuses", async (c) => {
    const changes = changedStatuses(await form(c), await store.components());
    if (changes.size) await store.sql.begin((tx) => store.setStatuses(tx, changes));
    return c.redirect("/admin?ok=statuses", 303);
  });

  // ----- Incidents -----

  app.get("/admin/incidents", async (c) => {
    const n = page(c);
    const [s, rows, comps] = await Promise.all([store.settings(), store.incidentPage(PAGE + 1, (n - 1) * PAGE), store.components()]);
    return render(
      c,
      "Incidents",
      incidentList({ s, now: new Date(), flash: flash(c), admin: canAdmin(who(c)), incidents: rows.slice(0, PAGE), names: new Map(comps.map((x) => [x.id, x.name])), page: n, more: rows.length > PAGE }),
      { staff: true, s },
    );
  });

  const kindOf = (c: Context) => (c.req.query("kind") === "maintenance" ? "maintenance" : "incident");

  const newForm = async (c: Context, v: Record<string, unknown>, error?: string) => {
    const [s, groups, comps, counts] = await Promise.all([store.settings(), store.groups(), store.components(), store.subscriberCounts()]);
    const kind = kindOf(c);
    return render(
      c,
      kind === "maintenance" ? "Schedule maintenance" : "New incident",
      newIncidentPage({ s, now: new Date(), admin: canAdmin(who(c)), kind, sections: sections(groups, comps), subscribers: counts.confirmed, error, v }),
      { staff: true, s, status: error ? 400 : 200 },
    );
  };
  app.get("/admin/incidents/new", (c) => newForm(c, {}));
  app.post("/admin/incidents/new", async (c) => {
    const b = await form(c);
    const [s, comps] = await Promise.all([store.settings(), store.components()]);
    const r = newIncident(b, kindOf(c), comps, s.time_zone, new Date());
    if (!r.ok) return newForm(c, { ...b, notify: b.notify === "on" ? "on" : "off" }, r.error);
    const { id, update_id } = await store.createIncident({ ...r.value, author: authorName(c) });
    if (r.value.notify) await announce(update_id);
    return c.redirect(`/admin/incidents/${id}?ok=created`, 303);
  });

  const manage = async (c: Context, id: number, error?: string) => {
    const i = await store.incidentById(id);
    if (!i) return notFound(c);
    const [s, groups, comps, updates, counts] = await Promise.all([store.settings(), store.groups(), store.components(), store.updatesFor([id]), store.subscriberCounts()]);
    const ups = updates.get(id) ?? [];
    const totals = await store.emailTotals(ups.map((u) => u.id));
    return render(
      c,
      i.title,
      manageIncident({
        s,
        now: new Date(),
        admin: canAdmin(who(c)),
        flash: flash(c),
        error,
        i,
        updates: ups.map((u) => ({ ...u, totals: totals.get(u.id) })),
        sections: sections(groups, comps),
        comps,
        subscribers: counts.confirmed,
      }),
      { staff: true, s, status: error ? 400 : 200 },
    );
  };
  app.get("/admin/incidents/:id", (c) => manage(c, idParam(c)));

  app.post("/admin/incidents/:id/updates", async (c) => {
    const i = await store.incidentById(idParam(c));
    if (!i) return notFound(c);
    const now = new Date();
    const r = newUpdate(await form(c), i, now);
    if (!r.ok) return manage(c, i.id, r.error);
    if (r.value.startsNow) await store.editIncident(i.id, { title: i.title, component_ids: i.component_ids, starts_at: now, ends_at: i.ends_at });
    const updateId = await store.addUpdate({ incident_id: i.id, author: authorName(c), ...r.value });
    if (r.value.notify) await announce(updateId);
    return c.redirect(`/admin/incidents/${i.id}?ok=posted`, 303);
  });

  app.post("/admin/incidents/:id/edit", async (c) => {
    const i = await store.incidentById(idParam(c));
    if (!i) return notFound(c);
    const b = await form(c);
    const title = text(b.title, 200);
    if (!title) return manage(c, i.id, "Give it a title.");
    const comps = await store.components();
    const known = new Set(comps.map((x) => x.id));
    const component_ids = [...new Set((Array.isArray(b.component) ? b.component : b.component ? [b.component] : []).map(Number))].filter((x) => known.has(x));
    const s = await store.settings();
    const w = i.kind === "maintenance" ? windowFrom(b, s.time_zone) : undefined;
    if (w && !w.ok) return manage(c, i.id, w.error);
    await store.editIncident(i.id, { title, component_ids, starts_at: w?.ok ? w.value.starts_at : i.starts_at, ends_at: w?.ok ? w.value.ends_at : i.ends_at });
    return c.redirect(`/admin/incidents/${i.id}?ok=saved`, 303);
  });

  app.post("/admin/incidents/:id/delete", async (c) => {
    if (!canAdmin(who(c))) return forbidden(c, "Deleting");
    const i = await store.incidentById(idParam(c));
    if (i) await store.deleteIncident(i.id);
    return c.redirect("/admin/incidents?ok=deleted", 303);
  });

  app.post("/admin/updates/:id", async (c) => {
    const u = await store.updateById(idParam(c));
    if (!u) return notFound(c);
    const body = text((await form(c)).body, 5000);
    if (body) await store.editUpdateBody(u.id, body);
    return c.redirect(`/admin/incidents/${u.incident_id}?ok=saved`, 303);
  });

  // ----- Components -----

  const componentsView = async (c: Context, error?: string) => {
    const [groups, comps, monitors, checks, s] = await Promise.all([store.groups(), store.components(), store.monitors(), store.recentChecks(30), store.settings()]);
    const body = componentsPage({
      admin: canAdmin(who(c)),
      flash: flash(c),
      error,
      groups,
      comps,
      sections: sections(groups, comps),
      monitors: new Map(monitors.map((m) => [m.component_id, m])),
      checks,
      tz: s.time_zone,
      now: new Date(),
    });
    return render(c, "Components", body, {
      staff: true,
      status: error ? 400 : 200,
    });
  };
  app.get("/admin/components", (c) => componentsView(c));

  const groupIdFrom = async (v: unknown) => {
    const id = posInt(v);
    return id && (await store.groups()).some((g) => g.id === id) ? id : null;
  };

  app.post("/admin/components", async (c) => {
    const b = await form(c);
    const name = text(b.name, 80);
    if (!name) return componentsView(c, "Give the component a name.");
    await store.addComponent({ name, description: text(b.description, 140), group_id: await groupIdFrom(b.group_id) });
    return c.redirect("/admin/components?ok=added", 303);
  });
  app.post("/admin/components/:id", async (c) => {
    const comp = await store.componentById(idParam(c));
    if (!comp) return notFound(c);
    const b = await form(c);
    const name = text(b.name, 80);
    if (!name) return componentsView(c, "Give the component a name.");
    await store.editComponent(comp.id, { name, description: text(b.description, 140), group_id: await groupIdFrom(b.group_id) });
    return c.redirect("/admin/components?ok=saved", 303);
  });
  app.post("/admin/components/:id/delete", async (c) => {
    const comp = await store.componentById(idParam(c));
    if (comp) await store.deleteComponent(comp.id);
    return c.redirect("/admin/components?ok=deleted", 303);
  });
  app.post("/admin/components/:id/move", async (c) => {
    const comp = await store.componentById(idParam(c));
    if (!comp) return notFound(c);
    const dir = (await form(c)).dir === "up" ? -1 : 1;
    const sibs = (await store.components()).filter((x) => x.group_id === comp.group_id).map((x) => x.id);
    await store.reorder("components", move(sibs, comp.id, dir));
    return c.redirect("/admin/components", 303);
  });

  // A component's monitor: the address to check, saved, removed, or checked at once.
  app.post("/admin/components/:id/monitor", async (c) => {
    const comp = await store.componentById(idParam(c));
    if (!comp) return notFound(c);
    const r = monitorFrom(await form(c), demoOn() ? DEMO_HOSTS : undefined);
    if (!r.ok) return componentsView(c, r.error);
    await store.saveMonitor(comp.id, r.value);
    if (!r.value.paused) await runChecks(comp.id);
    return c.redirect("/admin/components?ok=saved", 303);
  });
  app.post("/admin/components/:id/monitor/delete", async (c) => {
    const comp = await store.componentById(idParam(c));
    if (comp) await store.deleteMonitor(comp.id);
    return c.redirect("/admin/components?ok=removed", 303);
  });
  app.post("/admin/components/:id/monitor/check", async (c) => {
    const comp = await store.componentById(idParam(c));
    if (!comp) return notFound(c);
    await runChecks(comp.id);
    return c.redirect("/admin/components?ok=checked", 303);
  });

  app.post("/admin/groups", async (c) => {
    const name = text((await form(c)).name, 80);
    if (!name) return componentsView(c, "Give the group a name.");
    await store.addGroup(name);
    return c.redirect("/admin/components?ok=added", 303);
  });
  app.post("/admin/groups/:id", async (c) => {
    const id = await groupIdFrom(idParam(c));
    const name = text((await form(c)).name, 80);
    if (!id) return notFound(c);
    if (!name) return componentsView(c, "Give the group a name.");
    await store.renameGroup(id, name);
    return c.redirect("/admin/components?ok=saved", 303);
  });
  app.post("/admin/groups/:id/delete", async (c) => {
    const id = await groupIdFrom(idParam(c));
    if (id) await store.deleteGroup(id);
    return c.redirect("/admin/components?ok=deleted", 303);
  });
  app.post("/admin/groups/:id/move", async (c) => {
    const id = await groupIdFrom(idParam(c));
    if (!id) return notFound(c);
    const dir = (await form(c)).dir === "up" ? -1 : 1;
    await store.reorder("component_groups", move((await store.groups()).map((g) => g.id), id, dir));
    return c.redirect("/admin/components", 303);
  });

  // ----- Subscribers -----

  app.get("/admin/subscribers", async (c) => {
    const n = page(c);
    const [s, counts, list, emails] = await Promise.all([store.settings(), store.subscriberCounts(), store.subscriberList(PAGE + 1, (n - 1) * PAGE), store.recentEmails(12)]);
    return render(c, "Subscribers", subscribersPage({ s, now: new Date(), flash: flash(c), counts, list: list.slice(0, PAGE), emails, page: n, more: list.length > PAGE, demo: demoOn() }), {
      staff: true,
      s,
    });
  });
  app.post("/admin/subscribers/:id/delete", async (c) => {
    const id = idParam(c);
    if (id) await store.removeSubscriber(id);
    return c.redirect("/admin/subscribers?ok=removed", 303);
  });
  app.get("/admin/subscribers.csv", async (c) => {
    if (demoOn()) return c.text("Not available in the demo.", 403);
    const rows = await store.allConfirmed();
    const cell = (v: string) => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""');
    const body = ["email,confirmed_at", ...rows.map((r) => `"${cell(r.email)}","${r.confirmed_at.toISOString()}"`)].join("\r\n");
    return c.body(`${body}\r\n`, 200, { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="subscribers.csv"' });
  });

  // ----- Settings -----

  const zones = Intl.supportedValuesOf("timeZone");
  const settingsView = async (c: Context, extra: { error?: string; newKey?: string } = {}) => {
    const [s, keys] = await Promise.all([store.settings(), store.keys()]);
    return render(
      c,
      "Settings",
      settingsPage({ s, keys, zones: zones.includes(s.time_zone) ? zones : [s.time_zone, ...zones], demo: demoOn(), uploads: !localOnly() && !demoOn(), base: publicUrl(), now: new Date(), flash: flash(c), ...extra }),
      { staff: true, s, status: extra.error ? 400 : 200 },
    );
  };
  app.get("/admin/settings", (c) => settingsView(c));
  app.post("/admin/settings", async (c) => {
    const b = await form(c);
    const name = text(b.name, 80);
    if (!name) return settingsView(c, { error: "Give the page a name." });
    const tz = text(b.time_zone, 64);
    const from = text(b.email_from, 254);
    const logo = text(b.logo_upload, 64);
    const support = text(b.support_url, 500);
    await store.saveSettings({
      name,
      accent: isColor(b.accent) ? b.accent.toLowerCase() : "#4f46e5",
      website_url: cleanUrl(b.website_url),
      support_url: support.startsWith("mailto:") && cleanEmail(support.slice(7)) ? support : cleanUrl(support),
      time_zone: isTimeZone(tz) ? tz : "UTC",
      logo_upload: /^[A-Za-z0-9_-]{1,64}$/.test(logo) ? logo : null,
      ...(demoOn() ? {} : { email_from: from ? (cleanEmail(from) ?? "") : "" }),
    });
    return c.redirect("/admin/settings?ok=saved", 303);
  });

  // The browser uploads the logo straight to storage; this asks Whisk for the upload form.
  app.post("/admin/settings/logo", async (c) => {
    if (demoOn() || localOnly()) return c.json({ error: { code: "UPLOADS_OFF", message: "Uploads are off here.", fix: "Deploy the app to Whisk." } }, 400);
    const type = c.req.query("type") ?? "";
    if (!["image/png", "image/jpeg", "image/webp", "image/svg+xml"].includes(type)) return c.json({ error: { code: "NOT_AN_IMAGE", message: "The logo must be a PNG, JPEG, WebP or SVG.", fix: "Pick another file." } }, 400);
    const up = await whiskApi<{ id: string; url: string; fields: Record<string, string> }>("/uploads", { filename: "logo", content_type: type, max_bytes: 2_000_000, visibility: "public" });
    return c.json({ id: up.id, url: up.url, fields: up.fields });
  });

  app.post("/admin/keys", async (c) => {
    const name = text((await form(c)).name, 60) || "API key";
    const key = await store.createKey(name, authorName(c));
    return settingsView(c, { newKey: key });
  });
  app.post("/admin/keys/:id/revoke", async (c) => {
    await store.revokeKey(idParam(c));
    return c.redirect("/admin/settings?ok=revoked", 303);
  });
};
