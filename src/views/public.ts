// The pages anyone can see: the status page, one incident, the history, and subscribing.
import { html } from "hono/html";
import {
  bannerLabel,
  currentState,
  duration,
  endedAt,
  formatDay,
  formatTime,
  formatWhen,
  localDate,
  sectionStatus,
  stateLabel,
  statusLabel,
  uptimePercent,
  zoneName,
  type Component,
  type Day,
  type Incident,
  type Section,
  type Shown,
  type Update,
} from "../model.js";
import type { Settings } from "../store.js";
import { icon, statusIcon } from "./icons.js";
import { notice, type Html } from "./layout.js";

export type View = Readonly<{
  s: Settings;
  now: Date;
  shown: (c: Component) => Shown;
  updates: ReadonlyMap<number, readonly Update[]>;
  names: ReadonlyMap<number, string>;
}>;

const when = (v: View, d: Date) => formatWhen(d, v.s.time_zone, v.now);
const pct = (n: number | null) => (n === null ? "No data" : `${n.toFixed(n === 100 ? 0 : 2)} % uptime`);

// ----- Pieces -----

export const statusText = (s: Shown) => html`<span class="status-text s-${s}"><span class="dot"></span>${statusLabel[s]}</span>`;
export const statePill = (i: Incident, now: Date) => {
  const st = currentState(i, now);
  const c = i.kind === "maintenance" ? "maintenance" : st === "resolved" ? "operational" : i.impact;
  return html`<span class="pill s-${c}">${stateLabel[st]}</span>`;
};

const affected = (v: View, i: Incident) =>
  i.component_ids.length
    ? html`<span>${icon.layers} ${i.component_ids.map((c) => v.names.get(c)).filter(Boolean).join(", ")}</span>`
    : "";

const bars = (v: View, days: readonly Day[]) => {
  const tip = (d: Day) =>
    [
      formatDay(new Date(`${d.date}T12:00:00Z`), "UTC"),
      d.uptime === null ? "No data" : d.uptime === 1 ? "No downtime" : `${(Math.floor(d.uptime * 10000) / 100).toFixed(2)} % uptime`,
      ...d.incidents.map((i) => `${i.impact}|${i.title}`),
    ].join("\n");
  return html`<div class="bars" role="img" aria-label="Uptime for the last ${days.length} days">${days.map(
    (d) => html`<i class="s-${d.worst ?? "none"}" tabindex="0" data-tip="${tip(d)}"></i>`,
  )}</div>
<div class="bars-foot"><span><span class="days90">${days.length} days ago</span><span class="days30">30 days ago</span></span><span class="pct"><span class="days90">${pct(uptimePercent(days))}</span><span class="days30">${pct(uptimePercent(days.slice(-30)))}</span></span><span>Today</span></div>`;
};

const componentRow = (v: View, c: Component, days: readonly Day[]) => html`<div class="component">
  <div class="head">
    <span class="name">${c.name}${c.description ? html`<span class="desc">· ${c.description}</span>` : ""}</span>
    ${statusText(v.shown(c))}
  </div>
  ${bars(v, days)}
</div>`;

export const sectionsView = (v: View, sections: readonly Section[], daysOf: (c: Component) => readonly Day[]) => html`<div class="card components">
  ${sections.map((sec) =>
    sec.group
      ? html`<details class="group" open>
          <summary><span class="row">${icon.chevron}<span>${sec.group.name}</span><span class="count">${sec.components.length}</span></span>${statusText(sectionStatus(sec, v.shown))}</summary>
          ${sec.components.map((c) => componentRow(v, c, daysOf(c)))}
        </details>`
      : componentRow(v, sec.components[0], daysOf(sec.components[0])),
  )}
</div>`;

const activeCard = (v: View, i: Incident) => {
  const ups = v.updates.get(i.id) ?? [];
  const last = ups[0];
  const c = i.kind === "maintenance" ? "maintenance" : i.impact;
  return html`<article class="incident s-${c}">
  <h3><a href="/incidents/${i.id}">${i.title}</a></h3>
  ${last
    ? html`<div class="latest"><div class="row">${statePill(i, v.now)}<span class="muted small">${when(v, last.at)}</span></div><p>${last.body}</p></div>`
    : ""}
  <div class="meta">${affected(v, i)}${ups.length > 1 ? html`<a href="/incidents/${i.id}">${ups.length} updates</a>` : ""}</div>
</article>`;
};

const maintCard = (v: View, i: Incident) => {
  const last = (v.updates.get(i.id) ?? [])[0];
  return html`<article class="maint">
  <div class="when">${icon.calendar} ${i.starts_at ? when(v, i.starts_at) : ""}${i.ends_at ? html` to ${formatTime(i.ends_at, v.s.time_zone)}${localDate(i.ends_at, v.s.time_zone) !== localDate(i.starts_at ?? i.ends_at, v.s.time_zone) ? ` ${formatDay(i.ends_at, v.s.time_zone)}` : ""}` : ""}</div>
  <h3><a href="/incidents/${i.id}">${i.title}</a></h3>
  ${last ? html`<p>${last.body}</p>` : ""}
  <div class="meta muted small row" style="margin-top:10px">${affected(v, i)}</div>
</article>`;
};

// A finished or past incident in a list: title in its color, last update, when.
export const pastItem = (v: View, i: Incident) => {
  const last = (v.updates.get(i.id) ?? [])[0];
  const end = endedAt(i, v.now);
  const start = i.starts_at ?? i.created_at;
  const c = i.kind === "maintenance" ? "maintenance" : i.impact;
  return html`<a class="past s-${c}" href="/incidents/${i.id}">
  <span class="t"><span class="dot"></span><span>${i.title}</span></span>
  ${last ? html`<p>${last.body}</p>` : ""}
  <small>${formatTime(start, v.s.time_zone)}${end ? html` to ${formatTime(end, v.s.time_zone)} · ${duration(end.getTime() - start.getTime())}` : html` · ${stateLabel[currentState(i, v.now)]}`}</small>
</a>`;
};

// ----- The status page -----

export type StatusPage = View &
  Readonly<{
    overall: Shown;
    active: readonly Incident[];
    upcoming: readonly Incident[];
    sections: readonly Section[];
    daysOf: (c: Component) => readonly Day[];
    pastDays: readonly Readonly<{ date: string; incidents: readonly Incident[] }>[];
    flash?: string;
    demoCard?: Html;
  }>;

export const statusPage = (p: StatusPage) => html`
${notice(p.flash)}
${p.demoCard ?? ""}
<section class="banner s-${p.overall}" aria-live="polite">
  <span class="mark">${statusIcon(p.overall)}</span>
  <div><h1>${bannerLabel[p.overall]}</h1><p>Updated ${formatTime(p.now, p.s.time_zone)} ${zoneName(p.now, p.s.time_zone)}</p></div>
</section>
${p.active.length ? html`<div>${p.active.map((i) => (i.kind === "maintenance" ? maintCard(p, i) : activeCard(p, i)))}</div>` : ""}
${p.upcoming.length ? html`<h2 class="section-title">Scheduled maintenance</h2>${p.upcoming.map((i) => maintCard(p, i))}` : ""}
${p.sections.length ? html`<h2 class="section-title"><span>Components</span></h2>${sectionsView(p, p.sections, p.daysOf)}` : ""}
<h2 class="section-title"><span>Past incidents</span><a href="/history">Incident history</a></h2>
<div class="card days">
  ${p.pastDays.map(
    (d) => html`<div class="day${d.incidents.length ? "" : " quiet"}"><h3>${formatDay(new Date(`${d.date}T12:00:00Z`), "UTC", true)}</h3>
      ${d.incidents.length ? d.incidents.map((i) => pastItem(p, i)) : html`<p class="none">No incidents</p>`}</div>`,
  )}
</div>`;

// ----- One incident -----

export const incidentPage = (v: View & { i: Incident; manage?: string }) => {
  const ups = v.updates.get(v.i.id) ?? [];
  const c = v.i.kind === "maintenance" ? "maintenance" : v.i.impact;
  return html`
<p class="crumbs"><a href="/">${icon.back} Current status</a></p>
<div class="inc-head">
  <h1>${v.i.title}</h1>
  <div class="row">${statePill(v.i, v.now)}
    ${v.i.kind === "maintenance" && v.i.starts_at && v.i.ends_at
      ? html`<span class="muted small">${when(v, v.i.starts_at)} to ${when(v, v.i.ends_at)}</span>`
      : v.i.kind === "incident"
        ? html`<span class="status-text s-${v.i.impact}"><span class="dot"></span>${statusLabel[v.i.impact]}</span>`
        : ""}
    ${v.manage ? html`<a class="btn small" href="${v.manage}">${icon.edit} Manage</a>` : ""}
  </div>
</div>
<div class="card pad">
  <ol class="timeline">
    ${ups.map((u) => html`<li class="s-${u.state === "resolved" || u.state === "completed" ? "operational" : c}">
      <span class="st">${stateLabel[u.state]}</span> <span class="when">· ${when(v, u.at)}</span>
      <p>${u.body}</p></li>`)}
  </ol>
  ${v.i.component_ids.length
    ? html`<p class="muted small" style="margin:6px 0 0">Affected</p>
      <div class="affected" style="margin-top:8px">${v.i.component_ids.map((id) => html`<span class="badge">${v.names.get(id) ?? ""}</span>`)}</div>`
    : ""}
</div>`;
};

// ----- History -----

export const historyPage = (v: View & { month: string; incidents: readonly Incident[]; prev?: string; next?: string }) => {
  const label = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${v.month}-15T00:00:00Z`));
  const byDay = [...new Set(v.incidents.map((i) => localDate(i.starts_at ?? i.created_at, v.s.time_zone)))];
  return html`
<p class="crumbs"><a href="/">${icon.back} Current status</a></p>
<div class="page-head"><h1>Incident history</h1></div>
<div class="month-nav">
  ${v.prev ? html`<a class="btn small" href="/history/${v.prev}">${icon.left} Earlier</a>` : html`<span></span>`}
  <h2 style="margin:0">${label}</h2>
  ${v.next ? html`<a class="btn small" href="/history/${v.next}">Later ${icon.chevron}</a>` : html`<span></span>`}
</div>
<div class="card days">
  ${byDay.length
    ? byDay.map(
        (d) => html`<div class="day"><h3>${formatDay(new Date(`${d}T12:00:00Z`), "UTC")}</h3>
        ${v.incidents.filter((i) => localDate(i.starts_at ?? i.created_at, v.s.time_zone) === d).map((i) => pastItem(v, i))}</div>`,
      )
    : html`<div class="empty">${icon.check}<div>No incidents</div></div>`}
</div>`;
};

// ----- Subscribing -----

export const subscribePage = (s: Settings, p: { error?: string; done?: string; email?: string }) => html`
<p class="crumbs"><a href="/">${icon.back} Current status</a></p>
<div class="subscribe">
  <div class="card">
    <h1 style="font-size:1.7rem">${icon.bell} Get updates</h1>
    ${notice(p.done)}${notice(p.error, "error")}
    ${p.done
      ? ""
      : html`<form method="post" action="/subscribe" data-challenge>
      <div class="field"><label for="email">Email</label><input id="email" type="email" name="email" required autocomplete="email" value="${p.email ?? ""}" placeholder="you@example.com"></div>
      <button class="btn primary" type="submit">${icon.mail} Subscribe</button>
    </form>`}
  </div>
  <p class="muted small" style="text-align:center;margin-top:16px"><a href="/feed.atom">${icon.rss} Atom feed</a></p>
</div>`;

export const tokenPage = (p: { title: string; action?: string; button?: string; done?: string; error?: string }) => html`
<div class="subscribe"><div class="card">
  <h1 style="font-size:1.6rem">${p.title}</h1>
  ${notice(p.done)}${notice(p.error, "error")}
  ${p.action && !p.done ? html`<form method="post" action="${p.action}" data-challenge><button class="btn primary" type="submit">${p.button}</button></form>` : html`<a class="btn" href="/">${icon.back} Current status</a>`}
</div></div>`;

export const message = (title: string, link = { href: "/", label: "Current status" }) => html`
<div class="subscribe"><div class="card"><h1 style="font-size:1.6rem">${title}</h1><a class="btn" href="${link.href}">${icon.back} ${link.label}</a></div></div>`;
