// The staff screens under /admin: what is happening now, incidents and maintenance, components,
// subscribers and settings. Plain labels and fields; the status page itself is the preview.
import { html } from "hono/html";
import {
  currentState,
  formatWhen,
  localDate,
  stateLabel,
  STATUSES,
  statesFor,
  statusLabel,
  type Component,
  type Group,
  type Incident,
  type Kind,
  type Section,
  type Shown,
  type Status,
  type Update,
} from "../model.js";
import { averageMs, checksUptime, monitorLabel, SLOW_MS, type Check, type Monitor } from "../monitor.js";
import type { ApiKey, EmailRow, Settings, Subscriber } from "../store.js";
import { icon } from "./icons.js";
import { notice, type Html } from "./layout.js";
import { statePill, statusText } from "./public.js";

export type Tab = "overview" | "incidents" | "components" | "subscribers" | "settings";

export const tabs = (on: Tab, admin: boolean) => {
  const t = (key: Tab, href: string, label: Html | string, ic: Html) => html`<a href="${href}"${on === key ? html` aria-current="page"` : ""}>${ic} ${label}</a>`;
  return html`<nav class="tabs" aria-label="Manage">
  ${t("overview", "/admin", "Now", icon.pulse)}
  ${t("incidents", "/admin/incidents", "Incidents", icon.alert)}
  ${t("components", "/admin/components", "Components", icon.layers)}
  ${admin ? t("subscribers", "/admin/subscribers", "Subscribers", icon.people) : ""}
  ${admin ? t("settings", "/admin/settings", "Settings", icon.settings) : ""}
</nav>`;
};

const when = (s: Settings, d: Date, now: Date) => formatWhen(d, s.time_zone, now);
const statusOptions = (current: Status) => STATUSES.map((st) => html`<option value="${st}"${st === current ? " selected" : ""}>${statusLabel[st]}</option>`);

const empty = (ic: Html, label: string) => html`<div class="empty">${ic}<div>${label}</div></div>`;

const incidentRow = (s: Settings, i: Incident, now: Date, names: ReadonlyMap<number, string>) => html`<li>
  <span class="dot s-${i.kind === "maintenance" ? "maintenance" : currentState(i, now) === "resolved" ? "operational" : i.impact}"></span>
  <div class="grow">
    <a class="title" href="/admin/incidents/${i.id}">${i.title}</a>
    <div class="sub">${i.kind === "maintenance" && i.starts_at ? html`${icon.calendar} ${when(s, i.starts_at, now)}` : when(s, i.created_at, now)}${i.component_ids.length ? html` · ${i.component_ids.map((c) => names.get(c)).filter(Boolean).join(", ")}` : ""}</div>
  </div>
  ${statePill(i, now)}
</li>`;

// ----- Now -----

export const overview = (p: {
  s: Settings;
  now: Date;
  flash?: string;
  admin: boolean;
  open: readonly Incident[];
  sections: readonly Section[];
  shown: (c: Component) => Shown;
  names: ReadonlyMap<number, string>;
  subscribers: number;
}) => html`
${tabs("overview", p.admin)}
${notice(p.flash)}
<div class="quick">
  <a href="/admin/incidents/new" class="s-major"><span class="ico">${icon.alert}</span><span>New incident</span></a>
  <a href="/admin/incidents/new?kind=maintenance" class="s-maintenance"><span class="ico">${icon.calendar}</span><span>Schedule maintenance</span></a>
  <a href="/" class="s-operational"><span class="ico">${icon.eye}</span><span>View status page<small>${p.subscribers} subscriber${p.subscribers === 1 ? "" : "s"}</small></span></a>
</div>
<div class="two" style="margin-top:22px">
  <section>
    <h2 class="section-title"><span>Components</span><a href="/admin/components">Edit</a></h2>
    ${p.sections.length
      ? html`<form method="post" action="/admin/statuses" class="card">
      <ul class="list">
        ${p.sections.flatMap((sec) => [
          ...(sec.group ? [html`<li class="sub" style="padding:10px 20px;background:var(--surface-2);font-weight:700;text-transform:uppercase;letter-spacing:.07em;font-size:.75rem">${sec.group.name}</li>`] : []),
          ...sec.components.map(
            (c) => html`<li class="comp-row"><span class="row"><span class="dot s-${p.shown(c)}"></span><b style="font-weight:600">${c.name}</b>${p.shown(c) === "maintenance" ? html`<span class="pill s-maintenance">Maintenance</span>` : ""}</span>
              <select name="status_${c.id}" aria-label="${c.name}">${statusOptions(c.status)}</select></li>`,
          ),
        ])}
      </ul>
      <div style="padding:14px 20px;border-top:1px solid var(--line);display:flex;justify-content:flex-end"><button class="btn primary small" type="submit">${icon.check} Save statuses</button></div>
    </form>`
      : html`<div class="card">${empty(icon.layers, "No components yet")}<div style="text-align:center;padding-bottom:24px"><a class="btn" href="/admin/components">${icon.plus} Add components</a></div></div>`}
  </section>
  <section>
    <h2 class="section-title"><span>Open</span><a href="/admin/incidents">All incidents</a></h2>
    <div class="card">${p.open.length ? html`<ul class="list">${p.open.map((i) => incidentRow(p.s, i, p.now, p.names))}</ul>` : empty(icon.check, "Nothing open")}</div>
  </section>
</div>`;

// ----- Incidents -----

export const incidentList = (p: { s: Settings; now: Date; flash?: string; admin: boolean; incidents: readonly Incident[]; names: ReadonlyMap<number, string>; page: number; more: boolean }) => html`
${tabs("incidents", p.admin)}
${notice(p.flash)}
<div class="page-head"><h1>Incidents</h1><div class="row">
  <a class="btn" href="/admin/incidents/new?kind=maintenance">${icon.calendar} Schedule maintenance</a>
  <a class="btn primary" href="/admin/incidents/new">${icon.plus} New incident</a></div></div>
<div class="card">${p.incidents.length ? html`<ul class="list">${p.incidents.map((i) => incidentRow(p.s, i, p.now, p.names))}</ul>` : empty(icon.check, "No incidents yet")}</div>
<div class="spread" style="margin-top:16px">
  ${p.page > 1 ? html`<a class="btn small" href="/admin/incidents?page=${p.page - 1}">${icon.left} Newer</a>` : html`<span></span>`}
  ${p.more ? html`<a class="btn small" href="/admin/incidents?page=${p.page + 1}">Older ${icon.chevron}</a>` : ""}
</div>`;

// The components picker: check what is affected and say how badly.
const picker = (sections: readonly Section[], picked: ReadonlySet<number>, statusOf: (c: Component) => Status, withStatus: boolean) =>
  sections.length
    ? html`<div class="pick">${sections.map(
        (sec) => html`${sec.group ? html`<div class="pg">${sec.group.name}</div>` : ""}
      ${sec.components.map(
        (c) => html`<div class="pr">
        <label class="check"><input type="checkbox" name="component" value="${c.id}"${picked.has(c.id) ? " checked" : ""}> ${c.name}</label>
        ${withStatus ? html`<select name="status_${c.id}" aria-label="Status of ${c.name}">${statusOptions(statusOf(c))}</select>` : ""}
      </div>`,
      )}`,
      )}</div>`
    : html`<p class="muted small">No components yet.</p>`;

const stateChoices = (kind: Kind, current: string, only?: readonly string[]) =>
  html`<div class="choices" role="radiogroup">${statesFor(kind)
    .filter((st) => !only || only.includes(st))
    .map((st) => html`<label><input type="radio" name="state" value="${st}"${st === current ? " checked" : ""}><span>${stateLabel[st]}</span></label>`)}</div>`;

const notifyBox = (subscribers: number, checked = true) =>
  html`<label class="check"><input type="checkbox" name="notify"${checked ? " checked" : ""}> Email ${subscribers} subscriber${subscribers === 1 ? "" : "s"}</label>`;

export const newIncidentPage = (p: {
  s: Settings;
  now: Date;
  admin: boolean;
  kind: Kind;
  sections: readonly Section[];
  subscribers: number;
  error?: string;
  v: Readonly<Record<string, unknown>>;
}) => {
  const picked = new Set((Array.isArray(p.v.component) ? p.v.component : p.v.component ? [p.v.component] : []).map(Number));
  const val = (k: string) => (typeof p.v[k] === "string" ? (p.v[k] as string) : "");
  const tomorrow = localDate(new Date(p.now.getTime() + 86_400_000), p.s.time_zone);
  const maint = p.kind === "maintenance";
  return html`
${tabs("incidents", p.admin)}
<div class="page-head"><h1>${maint ? "Schedule maintenance" : "New incident"}</h1></div>
${notice(p.error, "error")}
<form method="post" action="/admin/incidents/new?kind=${p.kind}" class="card pad" style="max-width:760px">
  <div class="field"><label for="title">Title</label><input id="title" type="text" name="title" required maxlength="200" value="${val("title")}" placeholder="${maint ? "Database upgrade" : "Checkout is slow"}"></div>
  ${maint
    ? html`<div class="grid3">
      <div class="field"><label for="date">Date</label><input id="date" type="date" name="date" required value="${val("date") || tomorrow}"></div>
      <div class="field"><label for="start">Starts</label><input id="start" type="time" name="start" required value="${val("start") || "22:00"}"></div>
      <div class="field"><label for="end">Ends</label><input id="end" type="time" name="end" required value="${val("end") || "23:00"}"></div>
    </div><p class="hint" style="margin:-10px 0 18px">${p.s.time_zone}</p>`
    : html`<div class="field"><label>State</label>${stateChoices("incident", val("state") || "investigating")}</div>`}
  <div class="field"><label>Affected components</label>${picker(p.sections, picked, (c) => (p.v[`status_${c.id}`] as Status) ?? (c.status === "operational" ? "partial" : c.status), !maint)}</div>
  <div class="field"><label for="body">Message</label><textarea id="body" name="body" required maxlength="5000" placeholder="${maint ? "What will happen and what people will notice" : "What people are seeing"}">${val("body")}</textarea></div>
  <div class="spread">${notifyBox(p.subscribers, val("notify") !== "off")}<div class="row"><a class="btn ghost" href="/admin/incidents">Cancel</a><button class="btn primary" type="submit">${maint ? html`${icon.calendar} Schedule` : html`${icon.alert} Post incident`}</button></div></div>
</form>`;
};

export const manageIncident = (p: {
  s: Settings;
  now: Date;
  admin: boolean;
  flash?: string;
  error?: string;
  i: Incident;
  updates: readonly (Update & { totals?: Readonly<Record<string, number>> })[];
  sections: readonly Section[];
  comps: readonly Component[];
  subscribers: number;
}) => {
  const st = currentState(p.i, p.now);
  const closed = st === "resolved" || st === "completed";
  const mine = p.comps.filter((c) => p.i.component_ids.includes(c.id));
  const nextState = p.i.kind === "incident" ? (closed ? "resolved" : st === "investigating" ? "identified" : st === "identified" ? "monitoring" : "resolved") : st === "scheduled" ? "in_progress" : "completed";
  const sent = (t?: Readonly<Record<string, number>>) => {
    if (!t) return "";
    const parts = [t.sent ? `${t.sent} sent` : "", t.demo ? `${t.demo} recorded (demo)` : "", t.pending ? `${t.pending} sending` : "", t.failed ? `${t.failed} failed` : ""].filter(Boolean);
    return parts.length ? html`<span class="badge">${icon.mail} ${parts.join(" · ")}</span>` : "";
  };
  const window = p.i.kind === "maintenance" && p.i.starts_at && p.i.ends_at;
  return html`
${tabs("incidents", p.admin)}
${notice(p.flash)}${notice(p.error, "error")}
<p class="crumbs"><a href="/admin/incidents">${icon.back} Incidents</a></p>
<div class="page-head">
  <div><h1>${p.i.title}</h1><div class="row" style="margin-top:10px">${statePill(p.i, p.now)}
    ${p.i.kind === "incident" ? statusText(p.i.impact) : window ? html`<span class="muted small">${icon.calendar} ${when(p.s, window ? p.i.starts_at! : p.now, p.now)} to ${when(p.s, p.i.ends_at!, p.now)}</span>` : ""}</div></div>
  <a class="btn" href="/incidents/${p.i.id}">${icon.eye} View</a>
</div>
<div class="two">
  <section class="stack">
    <form method="post" action="/admin/incidents/${p.i.id}/updates" class="card pad">
      <h2>Post an update</h2>
      <div class="field"><label>State</label>${stateChoices(p.i.kind, nextState)}</div>
      ${p.i.kind === "incident" && mine.length
        ? html`<div class="field"><label>Components</label><div class="pick">${mine.map(
            (c) => html`<div class="pr"><span>${c.name}</span><select name="status_${c.id}" aria-label="Status of ${c.name}">${statusOptions(c.status)}</select></div>`,
          )}</div></div>`
        : ""}
      <div class="field"><label for="body">Message</label><textarea id="body" name="body" required maxlength="5000"></textarea></div>
      <div class="spread">${notifyBox(p.subscribers)}<button class="btn primary" type="submit">${icon.check} Post update</button></div>
    </form>
    <div class="card pad">
      <h2>Updates</h2>
      <ol class="timeline">${p.updates.map(
        (u) => html`<li class="s-${u.state === "resolved" || u.state === "completed" ? "operational" : p.i.kind === "maintenance" ? "maintenance" : p.i.impact}">
        <div class="spread"><span><span class="st">${stateLabel[u.state]}</span> <span class="when">· ${when(p.s, u.at, p.now)}${u.author && u.author !== "sample" ? ` · ${u.author}` : ""}</span></span>${sent(u.totals)}</div>
        <p>${u.body}</p>
        <details class="edit"><summary>${icon.edit} Edit text</summary>
          <form method="post" action="/admin/updates/${u.id}"><textarea name="body" required maxlength="5000">${u.body}</textarea>
          <div class="row" style="margin-top:8px"><button class="btn small" type="submit">Save</button><span class="hint">No email is sent for an edit</span></div></form>
        </details></li>`,
      )}</ol>
    </div>
  </section>
  <aside class="stack">
    <form method="post" action="/admin/incidents/${p.i.id}/edit" class="card pad">
      <h2>Details</h2>
      <div class="field"><label for="title">Title</label><input id="title" type="text" name="title" required maxlength="200" value="${p.i.title}"></div>
      ${window
        ? html`<div class="field"><label for="date">Date</label><input id="date" type="date" name="date" value="${localDate(p.i.starts_at!, p.s.time_zone)}"></div>
        <div class="grid2"><div class="field"><label for="start">Starts</label><input id="start" type="time" name="start" value="${new Intl.DateTimeFormat("en-GB", { timeZone: p.s.time_zone, hour: "2-digit", minute: "2-digit" }).format(p.i.starts_at!)}"></div>
        <div class="field"><label for="end">Ends</label><input id="end" type="time" name="end" value="${new Intl.DateTimeFormat("en-GB", { timeZone: p.s.time_zone, hour: "2-digit", minute: "2-digit" }).format(p.i.ends_at!)}"></div></div>`
        : ""}
      <div class="field"><label>Affected components</label>${picker(p.sections, new Set(p.i.component_ids), (c) => c.status, false)}</div>
      <button class="btn" type="submit">${icon.check} Save</button>
    </form>
    ${p.admin
      ? html`<form method="post" action="/admin/incidents/${p.i.id}/delete" class="card pad" data-confirm="Delete this ${p.i.kind} and its updates?">
      <button class="btn danger" type="submit">${icon.trash} Delete ${p.i.kind}</button></form>`
      : ""}
  </aside>
</div>`;
};

// ----- Components -----

// ----- Monitors -----

const monitorClass = { up: "s-operational", slow: "s-degraded", down: "s-major" } as const;

// The last checks, oldest first, as bars as tall as the answer was slow; failures in red.
const checkBars = (cs: readonly Check[]) => {
  const top = Math.max(500, ...cs.map((c) => c.ms ?? 0));
  return html`<div class="checks" aria-hidden="true">${[...cs].reverse().map(
    (c) => html`<i class="${c.ok ? "s-operational" : "s-major"}" style="height:${c.ok && c.ms !== null ? Math.max(12, Math.round((c.ms / top) * 100)) : 100}%"></i>`,
  )}</div>`;
};

// One line under a monitored component: Up · 182 ms · 99.8 % · checked at 3:12 pm.
const monitorLine = (m: Monitor, cs: readonly Check[], tz: string, now: Date) => {
  const last = cs[0];
  const avg = averageMs(cs);
  const up = checksUptime(cs);
  return html`<div class="monitor">
    ${checkBars(cs)}
    <div class="row muted" style="gap:8px;font-size:.85rem">
      ${m.paused
        ? html`<span class="pill s-none">Paused</span>`
        : html`<span class="pill ${monitorClass[m.state]}">${monitorLabel[m.state]}</span>`}
      ${last && !last.ok ? html`<span>${last.error}</span>` : ""}
      ${avg !== null ? html`<span class="mono">${avg} ms</span>` : ""}
      ${up !== null ? html`<span class="mono">${up} %</span>` : ""}
      ${m.checked_at ? html`<span>${formatWhen(m.checked_at, tz, now)}</span>` : html`<span>Not checked yet</span>`}
    </div>
  </div>`;
};

const monitorForm = (c: Component, m: Monitor | undefined) => html`
  <form method="post" action="/admin/components/${c.id}/monitor" class="monitor-form">
    <h3>${icon.pulse} Monitor</h3>
    <div class="field"><label for="url${c.id}">Address</label><input id="url${c.id}" type="url" name="url" value="${m?.url ?? ""}" required maxlength="500" placeholder="https://example.com/"></div>
    <div class="grid2">
      <div class="field"><label for="kw${c.id}">Must contain</label><input id="kw${c.id}" type="text" name="keyword" value="${m?.keyword ?? ""}" maxlength="100"></div>
      <div class="field"><label for="slow${c.id}">Slow after (ms)</label><input id="slow${c.id}" type="number" name="slow_ms" min="100" max="30000" step="100" value="${m?.slow_ms ?? SLOW_MS}"></div>
    </div>
    <div class="field stack" style="gap:8px">
      <label class="check"><input type="checkbox" name="open_incidents"${!m || m.open_incidents ? " checked" : ""}> Open an incident when it's down</label>
      <label class="check"><input type="checkbox" name="paused"${m?.paused ? " checked" : ""}> Paused</label>
    </div>
    <div class="row"><button class="btn small" type="submit">${m ? "Save monitor" : html`${icon.plus} Add monitor`}</button></div>
  </form>
  ${m
    ? html`<div class="row" style="margin-top:8px">
      <form method="post" action="/admin/components/${c.id}/monitor/check"><button class="btn small">${icon.pulse} Check now</button></form>
      <form method="post" action="/admin/components/${c.id}/monitor/delete" data-confirm="Stop monitoring ${c.name}?"><button class="btn small danger">${icon.trash} Remove monitor</button></form>
    </div>`
    : ""}`;

export const componentsPage = (p: {
  admin: boolean;
  flash?: string;
  error?: string;
  groups: readonly Group[];
  sections: readonly Section[];
  comps: readonly Component[];
  monitors: ReadonlyMap<number, Monitor>;
  checks: ReadonlyMap<number, readonly Check[]>;
  tz: string;
  now: Date;
}) => {
  const groupOptions = (current: number | null) =>
    html`<option value="">No group</option>${p.groups.map((g) => html`<option value="${g.id}"${g.id === current ? " selected" : ""}>${g.name}</option>`)}`;
  const ids = (sec: Section) => sec.components.map((c) => c.id);
  const moveBtns = (action: string, first: boolean, last: boolean) => html`<form method="post" action="${action}" class="row" style="gap:2px">
    <button class="icon-btn" name="dir" value="up" title="Move up"${first ? " disabled" : ""}>${icon.up}</button>
    <button class="icon-btn" name="dir" value="down" title="Move down"${last ? " disabled" : ""}>${icon.down}</button></form>`;
  return html`
${tabs("components", p.admin)}
${notice(p.flash)}${notice(p.error, "error")}
<div class="page-head"><h1>Components</h1></div>
<div class="two">
  <section class="stack">
    ${p.sections.length ? "" : html`<div class="card">${empty(icon.layers, "No components yet")}</div>`}
    ${p.sections.map((sec, si) => {
      const loose = !sec.group;
      return html`<div class="card">
      ${sec.group
        ? html`<div class="spread" style="padding:14px 20px;border-bottom:1px solid var(--line)">
          <details class="edit"><summary><b style="color:var(--ink);font-size:1rem">${sec.group.name}</b> ${icon.edit}</summary>
            <form method="post" action="/admin/groups/${sec.group.id}" class="row"><input type="text" name="name" value="${sec.group.name}" required maxlength="80" style="width:auto;flex:1"><button class="btn small">Save</button></form>
            <form method="post" action="/admin/groups/${sec.group.id}/delete" data-confirm="Delete this group? Its components stay." style="margin-top:8px"><button class="btn small danger">${icon.trash} Delete group</button></form>
          </details>
          ${moveBtns(`/admin/groups/${sec.group.id}/move`, si === p.sections.findIndex((x) => x.group), si === p.sections.length - 1)}
        </div>`
        : ""}
      <ul class="list">${sec.components.map(
        (c, ci) => html`<li style="align-items:flex-start">
        <div class="grow">
          <div class="row"><b style="font-weight:650">${c.name}</b>${c.description ? html`<span class="sub">${c.description}</span>` : ""}</div>
          ${p.monitors.has(c.id) ? monitorLine(p.monitors.get(c.id)!, p.checks.get(c.id) ?? [], p.tz, p.now) : ""}
          <details class="edit" style="margin-top:4px"><summary>${icon.edit} Edit</summary>
            <form method="post" action="/admin/components/${c.id}">
              <div class="grid2"><div class="field"><label>Name</label><input type="text" name="name" value="${c.name}" required maxlength="80"></div>
              <div class="field"><label>Group</label><select name="group_id">${groupOptions(c.group_id)}</select></div></div>
              <div class="field"><label>Description</label><input type="text" name="description" value="${c.description}" maxlength="140"></div>
              <div class="row"><button class="btn small" type="submit">Save</button></div>
            </form>
            <form method="post" action="/admin/components/${c.id}/delete" data-confirm="Delete ${c.name} and its uptime history?" style="margin-top:8px"><button class="btn small danger">${icon.trash} Delete</button></form>
            ${monitorForm(c, p.monitors.get(c.id))}
          </details>
        </div>
        ${loose ? "" : moveBtns(`/admin/components/${c.id}/move`, ci === 0, ci === ids(sec).length - 1)}
      </li>`,
      )}</ul></div>`;
    })}
  </section>
  <aside class="stack">
    <form method="post" action="/admin/components" class="card pad">
      <h2>Add a component</h2>
      <div class="field"><label for="cname">Name</label><input id="cname" type="text" name="name" required maxlength="80" placeholder="Website"></div>
      <div class="field"><label for="cdesc">Description</label><input id="cdesc" type="text" name="description" maxlength="140"></div>
      <div class="field"><label for="cgroup">Group</label><select id="cgroup" name="group_id">${groupOptions(null)}</select></div>
      <button class="btn primary" type="submit">${icon.plus} Add</button>
    </form>
    <form method="post" action="/admin/groups" class="card pad">
      <h2>Add a group</h2>
      <div class="field"><label for="gname">Name</label><input id="gname" type="text" name="name" required maxlength="80" placeholder="Integrations"></div>
      <button class="btn" type="submit">${icon.plus} Add group</button>
    </form>
  </aside>
</div>`;
};

// ----- Subscribers -----

export const subscribersPage = (p: {
  s: Settings;
  now: Date;
  flash?: string;
  counts: { confirmed: number; waiting: number };
  list: readonly Subscriber[];
  emails: readonly (EmailRow & { created_at: Date })[];
  page: number;
  more: boolean;
  demo: boolean;
}) => html`
${tabs("subscribers", true)}
${notice(p.flash)}
<div class="page-head"><h1>Subscribers</h1><a class="btn" href="/admin/subscribers.csv">${icon.download} Export CSV</a></div>
<div class="stats">
  <div class="card stat"><b>${p.counts.confirmed}</b><span>Confirmed</span></div>
  <div class="card stat"><b>${p.counts.waiting}</b><span>Waiting to confirm</span></div>
</div>
<div class="two">
  <section class="card">
    ${p.list.length
      ? html`<ul class="list compact">${p.list.map(
          (sub) => html`<li><div class="grow"><b style="font-weight:600">${p.demo ? sub.email.replace(/^(.).*@/, "$1•••@") : sub.email}</b><div class="sub">${sub.confirmed_at ? html`Confirmed ${formatWhen(sub.confirmed_at, p.s.time_zone, p.now)}` : "Waiting to confirm"}</div></div>
        <form method="post" action="/admin/subscribers/${sub.id}/delete" data-confirm="Remove this subscriber?"><button class="icon-btn" title="Remove">${icon.trash}</button></form></li>`,
        )}</ul>`
      : empty(icon.people, "No subscribers yet")}
    <div class="spread" style="padding:12px 20px">
      ${p.page > 1 ? html`<a class="btn small" href="/admin/subscribers?page=${p.page - 1}">${icon.left} Newer</a>` : html`<span></span>`}
      ${p.more ? html`<a class="btn small" href="/admin/subscribers?page=${p.page + 1}">Older ${icon.chevron}</a>` : ""}
    </div>
  </section>
  <aside class="card">
    <h2 style="padding:20px 20px 0">Recent emails</h2>
    ${p.emails.length
      ? html`<table class="plain"><thead><tr><th>To</th><th>Status</th></tr></thead><tbody>${p.emails.map(
          (e) => html`<tr><td><div style="font-weight:600;word-break:break-all">${p.demo ? e.to_email.replace(/^(.).*@/, "$1•••@") : e.to_email}</div><div class="sub muted small">${e.subject}</div></td>
          <td><span class="pill s-${e.status === "sent" ? "operational" : e.status === "failed" ? "major" : e.status === "demo" ? "maintenance" : "degraded"}" title="${e.error}">${e.status === "demo" ? "Recorded" : e.status}</span></td></tr>`,
        )}</tbody></table>`
      : empty(icon.mail, "No emails yet")}
  </aside>
</div>`;

// ----- Settings -----

export const settingsPage = (p: { s: Settings; flash?: string; error?: string; keys: readonly ApiKey[]; newKey?: string; zones: readonly string[]; demo: boolean; uploads: boolean; base: string; now: Date }) => html`
${tabs("settings", true)}
${notice(p.flash)}${notice(p.error, "error")}
<div class="page-head"><h1>Settings</h1></div>
<div class="two">
  <form method="post" action="/admin/settings" class="card pad">
    <h2>Page</h2>
    <div class="field"><label for="name">Name</label><input id="name" type="text" name="name" required maxlength="80" value="${p.s.name}"></div>
    <div class="field"><label>Logo</label>
      <div class="logo-preview">${p.s.logo_upload ? html`<img src="/.whisk/img/${p.s.logo_upload}?h=88" alt="">` : html`<span class="brand-dot"></span>`}
        <input type="hidden" name="logo_upload" value="${p.s.logo_upload ?? ""}" id="logo_upload">
        ${p.uploads ? html`<label class="btn small" style="margin:0">${icon.upload} Upload<input type="file" accept="image/png,image/jpeg,image/svg+xml,image/webp" data-upload="logo_upload" hidden></label>` : ""}
        ${p.s.logo_upload ? html`<button class="btn small ghost" type="button" data-clear="logo_upload">Remove</button>` : ""}
      </div>
    </div>
    <div class="field"><label for="accent">Color</label><div class="row"><input id="accent" type="color" name="accent" value="${p.s.accent}"><span class="mono muted">${p.s.accent}</span></div></div>
    <div class="field"><label for="website_url">Website</label><input id="website_url" type="url" name="website_url" maxlength="500" value="${p.s.website_url}" placeholder="https://"></div>
    <div class="field"><label for="support_url">Contact link</label><input id="support_url" type="url" name="support_url" maxlength="500" value="${p.s.support_url}" placeholder="https:// or mailto:"></div>
    <div class="field"><label for="time_zone">Time zone</label><select id="time_zone" name="time_zone">${p.zones.map((z) => html`<option${z === p.s.time_zone ? " selected" : ""}>${z}</option>`)}</select></div>
    <div class="field"><label for="email_from">Send emails from</label><input id="email_from" type="email" name="email_from" maxlength="254" value="${p.s.email_from}" placeholder="status@yourdomain.com"${p.demo ? " disabled" : ""}><p class="hint">Verified domain only</p></div>
    <button class="btn primary" type="submit">${icon.check} Save</button>
  </form>
  <aside class="stack">
    <section class="card pad">
      <h2>API keys</h2>
      <p class="hint" style="margin:0 0 14px">For monitors and scripts, through the JSON API at <span class="mono">${p.base}/api/v1</span>.${p.demo ? " In the demo, keys work on the sample data and are removed every night." : ""}</p>
      ${p.newKey ? html`<div class="field"><label>New key</label><div class="key-show"><span id="newkey">${p.newKey}</span><button class="icon-btn" type="button" data-copy="newkey" title="Copy">${icon.copy}</button></div><p class="hint">Shown once</p></div>` : ""}
      ${p.keys.length
        ? html`<ul class="list compact" style="margin:0 -24px 14px">${p.keys.map(
            (k) => html`<li><div class="grow"><b style="font-weight:600">${k.name}</b> <span class="mono muted">${k.prefix}…</span><div class="sub">${k.revoked_at ? "Off" : k.last_used_at ? `Used ${formatWhen(k.last_used_at, p.s.time_zone, p.now)}` : "Never used"}</div></div>
          ${k.revoked_at ? "" : html`<form method="post" action="/admin/keys/${k.id}/revoke" data-confirm="Turn this key off?"><button class="btn small danger">Turn off</button></form>`}</li>`,
          )}</ul>`
        : ""}
      <form method="post" action="/admin/keys" class="row"><input type="text" name="name" required maxlength="60" placeholder="Uptime monitor" style="flex:1;width:auto"><button class="btn" type="submit">${icon.key} Create</button></form>
      <details style="margin-top:14px"><summary class="small" style="cursor:pointer;font-weight:600">How to use the API</summary>
        <pre class="key-show" style="display:block;white-space:pre-wrap;margin:10px 0 0">curl ${p.base}/api/v1/components \\
  -H "Authorization: Bearer YOUR_KEY"

curl -X PUT ${p.base}/api/v1/components/1 \\
  -H "Authorization: Bearer YOUR_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"status": "degraded"}'</pre>
        <p class="hint">GET ${p.base}/api/v1 lists every endpoint. Errors come back as {"error": {"code", "message", "fix"}}.</p>
      </details>
    </section>
    <section class="card pad">
      <h2>Links</h2>
      <ul class="list compact" style="margin:0 -24px">
        <li><span class="grow">Status JSON</span><a class="mono small" href="/api/v2/summary.json">/api/v2/summary.json</a></li>
        <li><span class="grow">Badge</span><img src="/badge.svg" alt="Status badge" height="20"></li>
        <li><span class="grow">Feed</span><a class="mono small" href="/feed.atom">/feed.atom</a></li>
        <li><span class="grow">API</span><a class="mono small" href="/api/v1">/api/v1</a></li>
      </ul>
    </section>
  </aside>
</div>`;
