import { html, raw } from "hono/html";
import type { HtmlEscapedString } from "hono/utils/html";
import { isColor } from "../model.js";
import type { Settings } from "../store.js";
import { canPost, type Identity } from "../whisk.js";
import { icon } from "./icons.js";

export type Html = HtmlEscapedString | Promise<HtmlEscapedString>;

export type Page = Readonly<{
  s: Settings;
  id: Identity;
  title: string;
  body: Html;
  // Staff screens get the staff bar and their own width.
  staff?: boolean;
  demo?: Readonly<{ on: boolean; guest: boolean }>;
  head?: Html;
}>;

const accentOf = (s: Settings) => (isColor(s.accent) ? s.accent : "#4f46e5");

// Text on the accent: white unless the accent is light.
const onAccent = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.6 ? "#111111" : "#ffffff";
};

export const brand = (s: Settings) =>
  s.logo_upload
    ? html`<img src="/.whisk/img/${s.logo_upload}?h=68" alt="${s.name}" height="34">`
    : html`<span class="brand-dot"></span><span>${s.name}</span>`;

export const layout = ({ s, id, title, body, staff = false, demo, head }: Page) => {
  const accent = accentOf(s);
  const signedIn = id.audience === "team";
  return html`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title === s.name ? `${s.name} status` : `${title} · ${s.name} status`}</title>
<link rel="preload" href="/assets/fonts/figtree-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/assets/app.css?v=1">
<style>:root { --accent: ${raw(accent)}; --on-accent: ${raw(onAccent(accent))}; }</style>
<link rel="icon" href="data:image/svg+xml,${raw(encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6" fill="${accent}"/></svg>`))}">
<link rel="alternate" type="application/atom+xml" title="${s.name} status" href="/feed.atom">
<meta name="theme-color" content="${accent}">
${head ?? ""}
<script src="/assets/app.js?v=1" defer></script>
</head>
<body${demo?.on ? raw(" data-demo") : ""}>
${demo?.guest
  ? html`<div class="demo-bar"><div class="wrap ${staff ? "wide" : ""}"><span>Live demo · resets every night</span><a href="/demo/leave">Leave demo</a></div></div>`
  : ""}
${signedIn
  ? html`<div class="staff-bar"><div class="wrap ${staff ? "wide" : ""}">
      <a href="/">${icon.eye} Status page</a><a href="/admin">${icon.settings} Manage</a><span class="grow"></span>
      ${demo?.guest ? "" : html`<a href="/.whisk/logout?return=/" title="Signed in as ${id.email}">Sign out</a>`}
    </div></div>`
  : ""}
<header class="site-header">
  <div class="wrap ${staff ? "wide" : ""}">
    <a class="brand" href="/">${brand(s)}</a>
    <nav>
      ${s.website_url ? html`<a class="link" href="${s.website_url}" rel="noopener">${icon.external}<span class="label">Website</span></a>` : ""}
      ${s.support_url ? html`<a class="link" href="${s.support_url}" rel="noopener">${icon.mail}<span class="label">Contact</span></a>` : ""}
      ${staff ? "" : html`<a class="btn primary small" href="/subscribe">${icon.bell} Subscribe</a>`}
    </nav>
  </div>
</header>
<main><div class="wrap ${staff ? "wide" : ""}">${body}</div></main>
<footer class="site"><div class="wrap ${staff ? "wide" : ""}">
  <a href="/history">${icon.history} Incident history</a>
  <a href="/feed.atom">${icon.rss} Feed</a>
  ${signedIn || demo?.on ? "" : html`<a href="/.whisk/login?return=/admin">Sign in</a>`}
  <span class="runs">Runs on <a href="https://whisk.run">Whisk</a></span>
</div></footer>
<div class="tip" role="tooltip" id="tip"></div>
</body>
</html>`;
};

export const notice = (text?: string, kind: "good" | "error" = "good") => (text ? html`<div class="notice ${kind === "error" ? "error" : ""}" role="status">${text}</div>` : "");

export const staffAllowed = canPost;
