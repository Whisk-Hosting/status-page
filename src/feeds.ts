// The machine-readable faces of the page: an Atom feed, a status badge, and JSON in the shape
// of Atlassian Statuspage's public API so tools that read Statuspage read this too. Pure.
import {
  bannerLabel,
  currentState,
  indicator,
  isOpen,
  overall,
  stateLabel,
  statuspageComponentStatus,
  statuspageImpact,
  statusLabel,
  type Component,
  type Group,
  type Incident,
  type Shown,
  type Update,
} from "./model.js";
import type { Settings } from "./store.js";

const esc = (s: string) => s.replace(/[&<>"']/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" })[ch]!);

export const atom = (s: Settings, base: string, incidents: readonly Incident[], updates: ReadonlyMap<number, readonly Update[]>, now: Date) => {
  const entries = incidents.slice(0, 50).map((i) => {
    const ups = updates.get(i.id) ?? [];
    const latest = ups[0]?.at ?? i.created_at;
    const body = ups.map((u) => `<p><strong>${esc(stateLabel[u.state])}</strong> (${esc(u.at.toISOString())}): ${esc(u.body)}</p>`).join("");
    return `<entry>
<id>${esc(base)}/incidents/${i.id}</id>
<title>${esc(`${stateLabel[currentState(i, now)]}: ${i.title}`)}</title>
<link rel="alternate" href="${esc(base)}/incidents/${i.id}"/>
<published>${i.created_at.toISOString()}</published>
<updated>${latest.toISOString()}</updated>
<content type="html">${esc(body)}</content>
</entry>`;
  });
  const updated = incidents.reduce((a, i) => Math.max(a, (updates.get(i.id)?.[0]?.at ?? i.created_at).getTime()), 0);
  return `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<id>${esc(base)}/</id>
<title>${esc(s.name)} status</title>
<link rel="alternate" href="${esc(base)}/"/>
<link rel="self" href="${esc(base)}/feed.atom"/>
<updated>${new Date(updated || now.getTime()).toISOString()}</updated>
${entries.join("\n")}
</feed>`;
};

const color: Readonly<Record<Shown, string>> = { operational: "#1f9d55", degraded: "#b8890a", partial: "#d9650f", major: "#d22f3f", maintenance: "#2f6fe0" };

// A small "status | All systems operational" badge for a README or a website footer.
export const badge = (s: Shown) => {
  const left = "status";
  const right = bannerLabel[s];
  const w = (t: string) => Math.round(t.length * 6.6 + 14);
  const lw = w(left);
  const rw = w(right);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${lw + rw}" height="20" role="img" aria-label="${left}: ${esc(right)}">
<title>${left}: ${esc(right)}</title>
<clipPath id="r"><rect width="${lw + rw}" height="20" rx="4"/></clipPath>
<g clip-path="url(#r)"><rect width="${lw}" height="20" fill="#3f3f46"/><rect x="${lw}" width="${rw}" height="20" fill="${color[s]}"/></g>
<g fill="#fff" font-family="Verdana,DejaVu Sans,sans-serif" font-size="11" text-anchor="middle">
<text x="${lw / 2}" y="14">${left}</text><text x="${lw + rw / 2}" y="14">${esc(right)}</text></g>
</svg>`;
};

type Summary = Readonly<{
  s: Settings;
  base: string;
  now: Date;
  overall: Shown;
  groups: readonly Group[];
  comps: readonly Component[];
  shown: (c: Component) => Shown;
  incidents: readonly Incident[];
  updates: ReadonlyMap<number, readonly Update[]>;
}>;

const page = (p: Summary) => ({ id: "page", name: p.s.name, url: p.base, time_zone: p.s.time_zone, updated_at: p.now.toISOString() });

export const statusJson = (p: Summary) => ({ page: page(p), status: { indicator: indicator(p.overall), description: bannerLabel[p.overall] } });

const incidentJson = (p: Summary, i: Incident) => ({
  id: String(i.id),
  name: i.title,
  status: currentState(i, p.now),
  impact: i.kind === "maintenance" ? "maintenance" : statuspageImpact(i.impact),
  shortlink: `${p.base}/incidents/${i.id}`,
  created_at: i.created_at.toISOString(),
  updated_at: (p.updates.get(i.id)?.[0]?.at ?? i.created_at).toISOString(),
  resolved_at: i.resolved_at?.toISOString() ?? null,
  scheduled_for: i.starts_at?.toISOString() ?? null,
  scheduled_until: i.ends_at?.toISOString() ?? null,
  components: p.comps.filter((c) => i.component_ids.includes(c.id)).map((c) => ({ id: String(c.id), name: c.name, status: statuspageComponentStatus(p.shown(c)) })),
  incident_updates: (p.updates.get(i.id) ?? []).map((u) => ({ id: String(u.id), status: u.state, body: u.body, created_at: u.at.toISOString(), display_at: u.at.toISOString() })),
});

export const summaryJson = (p: Summary) => ({
  ...statusJson(p),
  components: [
    ...p.groups.map((g) => ({ id: `g${g.id}`, name: g.name, status: statuspageComponentStatus(overall(p.comps.filter((c) => c.group_id === g.id).map(p.shown))), group: true, group_id: null, position: g.position, components: p.comps.filter((c) => c.group_id === g.id).map((c) => String(c.id)) })),
    ...p.comps.map((c) => ({ id: String(c.id), name: c.name, description: c.description || null, status: statuspageComponentStatus(p.shown(c)), status_label: statusLabel[p.shown(c)], group: false, group_id: c.group_id ? `g${c.group_id}` : null, position: c.position, created_at: c.created_at.toISOString() })),
  ],
  incidents: p.incidents.filter((i) => i.kind === "incident" && isOpen(i, p.now)).map((i) => incidentJson(p, i)),
  scheduled_maintenances: p.incidents.filter((i) => i.kind === "maintenance" && isOpen(i, p.now)).map((i) => incidentJson(p, i)),
});
