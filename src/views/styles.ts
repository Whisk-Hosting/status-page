// The whole stylesheet, served once at /assets/app.css and cached. Colors are tokens on :root;
// the accent comes from Settings. Dark mode follows the device.
export const css = String.raw`
@font-face { font-family: "Figtree"; font-style: normal; font-weight: 300 900; font-display: swap; src: url(/assets/fonts/figtree-latin-wght-normal.woff2) format("woff2"); unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD; }
@font-face { font-family: "Figtree"; font-style: normal; font-weight: 300 900; font-display: swap; src: url(/assets/fonts/figtree-latin-ext-wght-normal.woff2) format("woff2"); unicode-range: U+0100-02BA, U+02BD-02C5, U+02C7-02CC, U+02CE-02D7, U+02DD-02FF, U+0304, U+0308, U+0329, U+1D00-1DBF, U+1E00-1E9F, U+1EF2-1EFF, U+2020, U+20A0-20AB, U+20AD-20C0, U+2113, U+2C60-2C7F, U+A720-A7FF; }
@font-face { font-family: "JetBrains Mono"; font-style: normal; font-weight: 500; font-display: swap; src: url(/assets/fonts/jetbrains-mono-latin-500-normal.woff2) format("woff2"); }
:root {
  --bg: #f6f6f3; --surface: #ffffff; --surface-2: #efefeb; --ink: #18181b; --muted: #6b6b70;
  --line: #e4e4df; --line-strong: #cfcfc8;
  --accent: #4f46e5; --on-accent: #ffffff;
  --accent-soft: color-mix(in oklab, var(--accent) 12%, transparent);
  --accent-ink: color-mix(in oklab, var(--accent) 80%, var(--ink));
  --operational: #1f9d55; --degraded: #d4a20b; --partial: #ea7a1c; --major: #dc3545; --maintenance: #3b82f6; --empty: #dcdcd6;
  --shadow: 0 1px 2px rgb(20 20 15 / .05), 0 10px 30px -12px rgb(20 20 15 / .18);
  --radius: 18px; --font: "Figtree", system-ui, sans-serif; --mono: "JetBrains Mono", ui-monospace, monospace;
  color-scheme: light;
}
@media (prefers-color-scheme: dark) {
  :root {
    --bg: #0f0f11; --surface: #18181b; --surface-2: #232327; --ink: #f2f2f0; --muted: #a1a1a8;
    --line: #2b2b30; --line-strong: #3f3f46; --empty: #34343a;
    --operational: #34c46f; --degraded: #e8bb2a; --partial: #f59343; --major: #f0596a; --maintenance: #60a0ff;
    --accent-ink: color-mix(in oklab, var(--accent) 65%, white);
    --shadow: 0 1px 2px rgb(0 0 0 / .4), 0 12px 32px -12px rgb(0 0 0 / .7);
    color-scheme: dark;
  }
  body .staff-bar { background: #26262b; }
}
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; background: var(--bg); color: var(--ink); font: 400 16px/1.6 var(--font); -webkit-font-smoothing: antialiased; min-height: 100vh; display: flex; flex-direction: column; }
main { flex: 1; }
a { color: inherit; }
img { max-width: 100%; }
h1, h2, h3 { line-height: 1.2; letter-spacing: -0.02em; margin: 0 0 .4em; }
h1 { font-size: clamp(1.9rem, 4.2vw, 2.6rem); font-weight: 750; }
h2 { font-size: 1.3rem; font-weight: 700; }
h3 { font-size: 1.05rem; font-weight: 650; }
p { margin: 0 0 1em; }
.icon { flex: none; vertical-align: -0.2em; }
.wrap { max-width: 880px; margin: 0 auto; padding: 0 20px; }
.wrap.wide { max-width: 1080px; }
.muted { color: var(--muted); }
.small { font-size: .875rem; }
.mono { font-family: var(--mono); font-size: .85em; }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
:focus-visible { outline: 3px solid var(--accent); outline-offset: 2px; border-radius: 6px; }
.row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.spread { display: flex; gap: 12px; align-items: center; justify-content: space-between; flex-wrap: wrap; }
.stack { display: flex; flex-direction: column; gap: 16px; }

/* Header and footer */
.site-header { padding: 22px 0; }
.site-header .wrap { display: flex; align-items: center; gap: 16px; }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 750; font-size: 1.15rem; text-decoration: none; letter-spacing: -0.01em; min-width: 0; }
.brand img { height: 34px; width: auto; display: block; }
.brand-dot { width: 14px; height: 14px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); flex: none; }
.site-header nav { margin-left: auto; display: flex; gap: 6px; align-items: center; }
.site-header nav a.link { text-decoration: none; color: var(--muted); font-weight: 550; font-size: .95rem; padding: 8px 10px; border-radius: 10px; display: inline-flex; gap: 6px; align-items: center; }
.site-header nav a.link:hover, .site-header nav a.link[aria-current] { color: var(--ink); background: var(--surface-2); }
@media (max-width: 560px) { .site-header nav .label { display: none; } }
footer.site { padding: 36px 0 44px; color: var(--muted); font-size: .9rem; }
footer.site .wrap { display: flex; gap: 18px; flex-wrap: wrap; align-items: center; }
footer.site a { color: var(--muted); text-decoration: none; display: inline-flex; gap: 6px; align-items: center; }
footer.site a:hover { color: var(--ink); }
footer.site .runs { margin-left: auto; }
footer.site .runs a { text-decoration: underline; text-underline-offset: 3px; }

/* Buttons, badges, notices */
.btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; border: 1px solid var(--line-strong); background: var(--surface); color: var(--ink); font: 650 .95rem/1 var(--font); padding: 11px 16px; border-radius: 12px; text-decoration: none; cursor: pointer; transition: transform .12s, box-shadow .12s, background .12s; white-space: nowrap; }
.btn:hover { transform: translateY(-1px); box-shadow: var(--shadow); }
.btn:active { transform: none; }
.btn.primary { background: var(--accent); border-color: transparent; color: var(--on-accent); }
.btn.ghost { background: transparent; border-color: transparent; }
.btn.ghost:hover { background: var(--surface-2); box-shadow: none; }
.btn.small { padding: 7px 11px; font-size: .85rem; border-radius: 10px; }
.btn.danger { color: var(--major); }
.btn[disabled], .btn.busy { opacity: .55; pointer-events: none; }
.icon-btn { border: 0; background: none; color: var(--muted); padding: 6px; border-radius: 8px; cursor: pointer; display: inline-grid; place-items: center; }
.icon-btn:hover { background: var(--surface-2); color: var(--ink); }
.icon-btn[disabled] { opacity: .3; pointer-events: none; }
.badge { display: inline-flex; align-items: center; gap: 5px; font: 700 .7rem/1 var(--font); text-transform: uppercase; letter-spacing: .07em; padding: 5px 8px; border-radius: 999px; background: var(--surface-2); color: var(--muted); white-space: nowrap; }
.notice { border-radius: 12px; padding: 12px 16px; margin: 0 0 18px; background: color-mix(in oklab, var(--operational) 12%, var(--surface)); border: 1px solid color-mix(in oklab, var(--operational) 35%, transparent); font-weight: 550; }
.notice.error { background: color-mix(in oklab, var(--major) 10%, var(--surface)); border-color: color-mix(in oklab, var(--major) 35%, transparent); color: color-mix(in oklab, var(--major) 75%, var(--ink)); }

/* Status colors: one class per status sets --c for whatever uses it */
.s-operational { --c: var(--operational); } .s-degraded { --c: var(--degraded); } .s-partial { --c: var(--partial); }
.s-major { --c: var(--major); } .s-maintenance { --c: var(--maintenance); } .s-none { --c: var(--empty); }
.dot { width: 10px; height: 10px; border-radius: 50%; background: var(--c); flex: none; display: inline-block; }
.status-text { color: color-mix(in oklab, var(--c) 82%, var(--ink)); font-weight: 650; font-size: .9rem; display: inline-flex; gap: 7px; align-items: center; white-space: nowrap; }
.pill { display: inline-flex; gap: 6px; align-items: center; font: 700 .72rem/1 var(--font); letter-spacing: .05em; text-transform: uppercase; padding: 6px 9px; border-radius: 999px; color: color-mix(in oklab, var(--c) 80%, var(--ink)); background: color-mix(in oklab, var(--c) 14%, transparent); white-space: nowrap; }

/* The banner */
.banner { margin: 8px 0 28px; border-radius: 22px; padding: 26px 28px; display: flex; gap: 18px; align-items: center; background: color-mix(in oklab, var(--c) 11%, var(--surface)); border: 1px solid color-mix(in oklab, var(--c) 28%, transparent); position: relative; overflow: hidden; }
.banner::after { content: ""; position: absolute; right: -60px; top: -60px; width: 220px; height: 220px; border-radius: 50%; background: radial-gradient(circle, color-mix(in oklab, var(--c) 22%, transparent), transparent 70%); pointer-events: none; }
.banner .mark { width: 52px; height: 52px; border-radius: 50%; background: var(--c); color: #fff; display: grid; place-items: center; flex: none; box-shadow: 0 0 0 7px color-mix(in oklab, var(--c) 18%, transparent); }
.banner .mark .icon { width: 28px; height: 28px; stroke-width: 2.6; }
.banner.s-operational .mark { animation: breathe 3.2s ease-in-out infinite; }
@keyframes breathe { 50% { box-shadow: 0 0 0 11px color-mix(in oklab, var(--c) 10%, transparent); } }
@media (prefers-reduced-motion: reduce) { .banner .mark { animation: none !important; } }
.banner h1 { font-size: clamp(1.45rem, 3.6vw, 2rem); margin: 0; }
.banner p { margin: 2px 0 0; color: var(--muted); font-size: .9rem; }

/* Cards */
.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); }
.card.pad { padding: 24px; }
.section-title { font-size: .8rem; font-weight: 750; text-transform: uppercase; letter-spacing: .08em; color: var(--muted); margin: 34px 0 12px; display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.section-title a { text-transform: none; letter-spacing: 0; font-weight: 600; font-size: .9rem; text-decoration: none; color: var(--accent-ink); }

/* Incident cards (active ones on the page) */
.incident { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 22px 24px 20px 28px; position: relative; overflow: hidden; margin-bottom: 14px; }
.incident::before { content: ""; position: absolute; left: 0; top: 0; bottom: 0; width: 6px; background: var(--c); }
.incident h3 { font-size: 1.15rem; margin: 0 0 10px; }
.incident h3 a { text-decoration: none; }
.incident h3 a:hover { text-decoration: underline; text-underline-offset: 3px; }
.incident .latest { margin: 8px 0 0; }
.incident .latest p { margin: 6px 0 0; }
.incident .meta { color: var(--muted); font-size: .85rem; margin-top: 12px; display: flex; gap: 14px; flex-wrap: wrap; }

/* Components and the uptime bars */
.components { overflow: visible; }
.component { padding: 18px 24px; border-top: 1px solid var(--line); }
.component:first-child { border-top: 0; }
.component .head { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
.component .name { font-weight: 650; display: inline-flex; gap: 6px; align-items: center; min-width: 0; }
.component .desc { color: var(--muted); font-size: .85rem; font-weight: 400; }
.group > summary { list-style: none; cursor: pointer; padding: 18px 24px; display: flex; justify-content: space-between; align-items: center; gap: 12px; border-top: 1px solid var(--line); font-weight: 700; }
.group:first-child > summary { border-top: 0; }
.group > summary::-webkit-details-marker { display: none; }
.group > summary .chev { transition: transform .2s; color: var(--muted); }
.group[open] > summary .chev { transform: rotate(90deg); }
.group > summary .count { color: var(--muted); font-weight: 500; font-size: .85rem; }
.group > summary > .row { flex-wrap: nowrap; min-width: 0; }
.group .component { padding-left: 46px; background: color-mix(in oklab, var(--surface-2) 35%, var(--surface)); }
.group:last-child .component:last-child { border-radius: 0 0 var(--radius) var(--radius); }
.bars { display: grid; grid-template-columns: repeat(90, 1fr); gap: 2px; height: 34px; margin-top: 12px; }
.bars i { display: block; border-radius: 3px; background: var(--c, var(--empty)); transition: transform .12s, opacity .12s; outline: none; }
.bars i:hover, .bars i:focus-visible { transform: scaleY(1.12); opacity: .82; }
.bars-foot { display: flex; justify-content: space-between; color: var(--muted); font-size: .78rem; margin-top: 6px; gap: 8px; }
.bars-foot .pct { color: var(--ink); font-weight: 600; }
.bars-foot .days30 { display: none; }
@media (max-width: 640px) {
  .bars { grid-template-columns: repeat(30, 1fr); gap: 3px; }
  .bars i:nth-child(-n+60) { display: none; }
  .bars-foot .days90 { display: none; } .bars-foot .days30 { display: inline; }
  .group .component { padding-left: 24px; }
  .component .desc { display: none; }
}
.tip { position: fixed; z-index: 50; max-width: 280px; background: var(--ink); color: var(--bg); border-radius: 12px; padding: 10px 13px; font-size: .82rem; line-height: 1.45; pointer-events: none; box-shadow: var(--shadow); opacity: 0; transform: translateY(4px); transition: opacity .12s, transform .12s; }
.tip.on { opacity: 1; transform: none; }
.tip b { display: block; font-size: .85rem; }
.tip .t-inc { display: flex; gap: 6px; align-items: baseline; margin-top: 5px; }
.tip .t-inc .dot { width: 8px; height: 8px; }

/* Maintenance */
.maint { border-radius: var(--radius); padding: 20px 24px; background: color-mix(in oklab, var(--maintenance) 8%, var(--surface)); border: 1px solid color-mix(in oklab, var(--maintenance) 26%, transparent); margin-bottom: 14px; }
.maint h3 { margin: 6px 0 4px; }
.maint h3 a { text-decoration: none; }
.maint p { margin: 6px 0 0; }
.maint .when { font-weight: 600; font-size: .9rem; display: flex; gap: 6px; align-items: center; color: color-mix(in oklab, var(--maintenance) 75%, var(--ink)); }

/* Past incidents by day, and the history */
.days { padding: 6px 24px; }
.day { padding: 16px 0; border-top: 1px solid var(--line); }
.day:first-child { border-top: 0; }
.day h3 { font-size: .95rem; margin: 0 0 6px; }
.day .none { color: var(--muted); font-size: .9rem; margin: 0; }
.day.quiet { display: flex; justify-content: space-between; align-items: baseline; gap: 12px; padding: 11px 0; }
.day.quiet h3 { margin: 0; font-weight: 600; }
.past { display: block; text-decoration: none; padding: 8px 0; }
.past .t { font-weight: 650; display: flex; gap: 8px; align-items: center; color: color-mix(in oklab, var(--c) 78%, var(--ink)); }
.past:hover .t span { text-decoration: underline; text-underline-offset: 3px; }
.past p { margin: 2px 0 0 18px; color: var(--muted); font-size: .9rem; }
.past small { display: block; margin-left: 18px; color: var(--muted); font-size: .8rem; }
.month-nav { display: flex; justify-content: space-between; align-items: center; margin: 4px 0 18px; gap: 12px; }

/* One incident: the timeline */
.crumbs { font-size: .9rem; color: var(--muted); margin: 8px 0 12px; }
.crumbs a { text-decoration: none; display: inline-flex; gap: 6px; align-items: center; }
.crumbs a:hover { color: var(--ink); }
.inc-head { margin-bottom: 22px; }
.inc-head .row { margin-top: 10px; }
.timeline { list-style: none; margin: 0; padding: 4px 0; position: relative; }
.timeline li { position: relative; padding: 0 0 26px 34px; }
.timeline li::before { content: ""; position: absolute; left: 7px; top: 12px; bottom: -6px; width: 2px; background: var(--line); }
.timeline li:last-child::before { display: none; }
.timeline li::after { content: ""; position: absolute; left: 0; top: 4px; width: 12px; height: 12px; border-radius: 50%; background: var(--surface); border: 2px solid var(--c, var(--line-strong)); }
.timeline li:first-child::after { background: var(--c, var(--line-strong)); box-shadow: 0 0 0 5px color-mix(in oklab, var(--c, var(--line-strong)) 18%, transparent); }
.timeline .when { color: var(--muted); font-size: .85rem; }
.timeline .st { font-weight: 700; }
.timeline p { margin: 4px 0 0; white-space: pre-line; }
.affected { display: flex; gap: 8px; flex-wrap: wrap; }

/* Subscribe */
.subscribe { max-width: 520px; margin: 24px auto 40px; }
.subscribe .card { padding: 30px; }

/* Forms */
label { font-weight: 600; font-size: .92rem; display: block; margin-bottom: 6px; }
.field { margin-bottom: 18px; }
.hint { color: var(--muted); font-size: .82rem; margin-top: 5px; font-weight: 400; }
input[type=text], input[type=email], input[type=url], input[type=date], input[type=time], input[type=search], select, textarea {
  width: 100%; font: 400 1rem/1.4 var(--font); color: var(--ink); background: var(--surface); border: 1px solid var(--line-strong); border-radius: 11px; padding: 11px 13px; }
input:focus, select:focus, textarea:focus { outline: none; border-color: var(--accent); box-shadow: 0 0 0 4px var(--accent-soft); }
textarea { min-height: 120px; resize: vertical; }
input[type=color] { width: 54px; height: 44px; padding: 3px; border: 1px solid var(--line-strong); border-radius: 11px; background: var(--surface); cursor: pointer; }
input[type=checkbox], input[type=radio] { accent-color: var(--accent); width: 18px; height: 18px; margin: 0; flex: none; }
.check { display: flex; gap: 10px; align-items: center; font-weight: 550; margin: 0; cursor: pointer; }
.grid2 { display: grid; grid-template-columns: 1fr 1fr; gap: 0 16px; }
.grid3 { display: grid; grid-template-columns: 1.3fr 1fr 1fr; gap: 0 14px; }
@media (max-width: 640px) { .grid2, .grid3 { grid-template-columns: 1fr; } }
.choices { display: flex; flex-wrap: wrap; gap: 8px; }
.choices label { margin: 0; }
.choices input { position: absolute; opacity: 0; pointer-events: none; }
.choices span { display: inline-flex; gap: 7px; align-items: center; padding: 9px 13px; border-radius: 11px; border: 1px solid var(--line-strong); background: var(--surface); font-weight: 600; font-size: .9rem; cursor: pointer; transition: background .12s, border-color .12s; }
.choices input:checked + span { border-color: var(--accent); background: var(--accent-soft); color: var(--accent-ink); }
.choices input:focus-visible + span { outline: 3px solid var(--accent); outline-offset: 2px; }
.pick { border: 1px solid var(--line); border-radius: 14px; overflow: hidden; }
.pick .pg { padding: 9px 14px; font-size: .76rem; font-weight: 750; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); background: var(--surface-2); }
.pick .pr { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; padding: 10px 14px; border-top: 1px solid var(--line); }
.pick .pr select { width: auto; min-width: 200px; padding: 7px 10px; font-size: .9rem; }
.pick .pr:has(input:not(:checked)) select { opacity: .45; }
@media (max-width: 560px) { .pick .pr { grid-template-columns: 1fr; } .pick .pr select { width: 100%; } }

/* Staff screens */
.staff-bar { background: #18181b; color: #f4f4f5; font-size: .85rem; }
.staff-bar .wrap { display: flex; gap: 14px; align-items: center; min-height: 40px; flex-wrap: wrap; }
.staff-bar a { color: inherit; text-decoration: none; opacity: .85; }
.staff-bar a:hover { opacity: 1; }
.staff-bar .grow { flex: 1; }
.tabs { display: flex; gap: 4px; overflow-x: auto; margin: 4px 0 26px; padding-bottom: 2px; scrollbar-width: none; }
.tabs a { text-decoration: none; padding: 9px 13px; border-radius: 11px; color: var(--muted); font-weight: 600; font-size: .92rem; display: inline-flex; gap: 7px; align-items: center; white-space: nowrap; }
.tabs a:hover { background: var(--surface-2); color: var(--ink); }
.tabs a[aria-current] { background: var(--surface); color: var(--ink); box-shadow: var(--shadow); }
.page-head { display: flex; justify-content: space-between; align-items: flex-end; gap: 16px; flex-wrap: wrap; margin: 8px 0 22px; }
.page-head h1 { margin: 0; font-size: clamp(1.6rem, 3.6vw, 2.1rem); }
.list { list-style: none; margin: 0; padding: 0; }
.list > li { display: flex; gap: 14px; align-items: center; padding: 14px 20px; border-top: 1px solid var(--line); }
.list > li:first-child { border-top: 0; }
.list > li .grow { flex: 1; min-width: 0; }
.list > li a.title { font-weight: 650; text-decoration: none; }
.list > li a.title:hover { text-decoration: underline; text-underline-offset: 3px; }
.list .sub { color: var(--muted); font-size: .85rem; }
.list.compact > li { padding: 10px 20px; }
.empty { text-align: center; padding: 42px 24px; color: var(--muted); }
.empty .icon { width: 30px; height: 30px; margin-bottom: 8px; }
.quick { display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 14px; margin-bottom: 8px; }
.quick a { display: flex; gap: 14px; align-items: center; padding: 20px; border-radius: var(--radius); background: var(--surface); border: 1px solid var(--line); text-decoration: none; font-weight: 700; transition: transform .12s, box-shadow .12s; }
.quick a:hover { transform: translateY(-2px); box-shadow: var(--shadow); }
.quick a .ico { width: 42px; height: 42px; border-radius: 12px; display: grid; place-items: center; background: color-mix(in oklab, var(--c, var(--accent)) 14%, transparent); color: color-mix(in oklab, var(--c, var(--accent)) 85%, var(--ink)); }
.quick a small { display: block; font-weight: 500; color: var(--muted); font-size: .85rem; }
.stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 14px; margin-bottom: 22px; }
.stat { padding: 18px 20px; }
.stat b { display: block; font-size: 1.7rem; letter-spacing: -0.02em; }
.stat span { color: var(--muted); font-size: .85rem; }
.two { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(0, 1fr); gap: 22px; align-items: start; }
@media (max-width: 860px) { .two { grid-template-columns: 1fr; } }
.comp-row > .row { flex-wrap: nowrap; min-width: 0; }
.list > li.comp-row, .comp-row { display: grid; grid-template-columns: 1fr auto; gap: 12px; align-items: center; }
.comp-row select { width: auto; min-width: 190px; padding: 7px 10px; font-size: .9rem; }
@media (max-width: 560px) { .comp-row { grid-template-columns: 1fr; } .comp-row select { width: 100%; } }
details.edit > summary { cursor: pointer; color: var(--muted); font-size: .85rem; list-style: none; display: inline-flex; gap: 6px; align-items: center; }
details.edit > summary::-webkit-details-marker { display: none; }
details.edit[open] > summary { margin-bottom: 12px; }
.key-show { font-family: var(--mono); font-size: .9rem; background: var(--surface-2); padding: 12px 14px; border-radius: 11px; word-break: break-all; display: flex; gap: 10px; align-items: center; justify-content: space-between; }
table.plain { width: 100%; border-collapse: collapse; font-size: .9rem; }
table.plain th { text-align: left; font-size: .75rem; text-transform: uppercase; letter-spacing: .07em; color: var(--muted); font-weight: 700; padding: 10px 20px; }
table.plain td { padding: 11px 20px; border-top: 1px solid var(--line); vertical-align: top; }
@media (max-width: 640px) { table.plain .opt { display: none; } }
.logo-preview { display: flex; gap: 14px; align-items: center; }
.logo-preview img { height: 44px; border-radius: 8px; background: var(--surface-2); padding: 4px; }

/* The live demo */
.demo-bar { background: linear-gradient(90deg, var(--accent), color-mix(in oklab, var(--accent) 70%, #ec4899)); color: #fff; font-size: .88rem; font-weight: 600; }
.demo-bar .wrap { display: flex; gap: 12px; align-items: center; min-height: 42px; flex-wrap: wrap; justify-content: space-between; }
.demo-bar a, .demo-bar button { color: #fff; }
.demo-bar button { background: rgb(255 255 255 / .18); border: 0; border-radius: 9px; padding: 6px 12px; font: 650 .85rem/1 var(--font); cursor: pointer; }
.demo-card { margin: 0 0 22px; padding: 22px 24px; display: flex; gap: 18px; align-items: center; justify-content: space-between; flex-wrap: wrap; background: linear-gradient(135deg, var(--accent-soft), transparent 70%), var(--surface); }
.demo-card h2 { margin: 0; font-size: 1.15rem; }
`;
