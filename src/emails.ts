// The emails: a confirmation for new subscribers and one per incident or maintenance update.
// Short and plain, one button, an unsubscribe link in every update. Pure: each returns the
// subject, HTML and text; sending is notify.ts's job.
import { html, raw } from "hono/html";
import { isColor, stateLabel, statusLabel, type Incident, type Update } from "./model.js";
import type { Settings } from "./store.js";

export type Mail = Readonly<{ to: string; subject: string; html: string; text: string }>;

type Body = Readonly<{ to: string; subject: string; kicker?: string; title: string; lines: readonly string[]; button?: { href: string; label: string }; footer: readonly string[] }>;

const compose = async (s: Settings, b: Body): Promise<Mail> => {
  const accent = isColor(s.accent) ? s.accent : "#4f46e5";
  const page = await html`<!doctype html><html><body style="margin:0;background:#f5f5f2;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;color:#18181b">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:540px;background:#ffffff;border-radius:14px;border:1px solid #e4e4e0">
<tr><td style="padding:26px 28px 6px;font-weight:700;font-size:15px"><span style="display:inline-block;width:10px;height:10px;border-radius:50%;background:${raw(accent)};margin-right:8px"></span>${s.name}</td></tr>
<tr><td style="padding:10px 28px 28px;font-size:16px;line-height:1.55">
${b.kicker ? html`<p style="margin:0 0 6px;font-size:13px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:${raw(accent)}">${b.kicker}</p>` : ""}
<h1 style="margin:0 0 14px;font-size:21px;line-height:1.3">${b.title}</h1>
${b.lines.map((l) => html`<p style="margin:0 0 14px">${l}</p>`)}
${b.button ? html`<p style="margin:22px 0 4px"><a href="${b.button.href}" style="display:inline-block;background:${raw(accent)};color:#fff;text-decoration:none;font-weight:650;padding:12px 20px;border-radius:9px">${b.button.label}</a></p>` : ""}
</td></tr></table>
<p style="max-width:540px;margin:14px auto 0;font-size:12px;line-height:1.5;color:#71717a">${b.footer.map((l) => html`${l}<br>`)}</p>
</td></tr></table></body></html>`;
  const text = [b.kicker ?? "", b.title, "", ...b.lines.flatMap((l) => [l, ""]), ...(b.button ? [`${b.button.label}: ${b.button.href}`, ""] : []), ...b.footer]
    .join("\n")
    .trim();
  return { to: b.to, subject: b.subject, html: page.toString(), text: `${text}\n` };
};

export const confirmEmail = (s: Settings, p: { to: string; link: string }) =>
  compose(s, {
    to: p.to,
    subject: `Confirm your ${s.name} status updates`,
    title: "Confirm your subscription",
    lines: [`You asked for an email when ${s.name} has an incident or planned maintenance.`],
    button: { href: p.link, label: "Confirm" },
    footer: ["If this wasn't you, ignore this email and nothing will be sent."],
  });

export const updateEmail = (
  s: Settings,
  p: { to: string; incident: Pick<Incident, "kind" | "title" | "starts_at" | "ends_at" | "impact">; update: Pick<Update, "state" | "body">; components: readonly string[]; when: (d: Date) => string; link: string; unsubscribe: string },
) => {
  const label = stateLabel[p.update.state];
  const window = p.incident.kind === "maintenance" && p.incident.starts_at && p.incident.ends_at ? `${p.when(p.incident.starts_at)} to ${p.when(p.incident.ends_at)}` : "";
  return compose(s, {
    to: p.to,
    subject: `[${s.name}] ${label}: ${p.incident.title}`,
    kicker: p.incident.kind === "maintenance" ? `Maintenance · ${label}` : label,
    title: p.incident.title,
    lines: [
      p.update.body,
      ...(window ? [`Window: ${window}`] : []),
      ...(p.components.length ? [`Affects: ${p.components.join(", ")}${p.incident.kind === "incident" ? ` (${statusLabel[p.incident.impact].toLowerCase()})` : ""}`] : []),
    ],
    button: { href: p.link, label: "View status" },
    footer: [`You get these because you subscribed to ${s.name} status updates.`, `Unsubscribe: ${p.unsubscribe}`],
  });
};
