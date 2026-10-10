// Telling subscribers. Each email is written down first (the emails table), then sent by the
// queue in paced batches so a long list never holds up a page and Whisk's limit of 100 a minute
// is kept. Where no queue runs (a preview, a local run) the batches run in the background.
import { demoOn } from "./demo.js";
import { confirmEmail, updateEmail, type Mail } from "./emails.js";
import { formatWhen, stateLabel } from "./model.js";
import * as store from "./store.js";
import { enqueue, log, publicUrl, queueAvailable, whiskApi } from "./whisk.js";

export const BATCH = 40;

const fromHeader = (s: store.Settings) => {
  const name = s.name.replace(/["\\\r\n]/g, "");
  // The business's own verified address when set; otherwise Whisk's address for this app.
  return s.email_from ? `"${name} status" <${s.email_from}>` : `"${name} status" <status@whisk.page>`;
};

// deliver sends one message, or records it in the live demo. Throws when Whisk refuses it.
const deliver = async (s: store.Settings, m: Mail): Promise<"sent" | "demo"> => {
  if (demoOn()) return "demo";
  await whiskApi("/email/send", { to: m.to, subject: m.subject, html: m.html, text: m.text, from: fromHeader(s) });
  return "sent";
};

// sendConfirmation emails a new subscriber their confirm link straight away.
export const sendConfirmation = async (sub: store.Subscriber) => {
  const s = await store.settings();
  const m = await confirmEmail(s, { to: sub.email, link: `${publicUrl()}/subscribe/confirm/${sub.token}` });
  try {
    const status = await deliver(s, m);
    await store.recordEmail({ kind: "confirm", to_email: m.to, subject: m.subject, status });
    return status;
  } catch (err) {
    await store.recordEmail({ kind: "confirm", to_email: m.to, subject: m.subject, status: "failed", error: String((err as Error).message ?? err) });
    throw err;
  }
};

// queueUpdate writes one email per confirmed subscriber for an update. Answers how many.
export const queueUpdate = async (updateId: number) => {
  const u = await store.updateById(updateId);
  const i = u && (await store.incidentById(u.incident_id));
  if (!u || !i || !u.notify) return 0;
  const s = await store.settings();
  return store.queueUpdateEmails(updateId, `[${s.name}] ${stateLabel[u.state]}: ${i.title}`);
};

// sendBatch sends up to BATCH pending emails for an update and answers how many it handled. A
// refused address is marked failed and the rest carry on.
export const sendBatch = async (updateId: number) => {
  const u = await store.updateById(updateId);
  const i = u && (await store.incidentById(u.incident_id));
  if (!u || !i) return 0;
  const [s, comps, rows] = await Promise.all([store.settings(), store.components(), store.pendingEmails(updateId, BATCH)]);
  const names = comps.filter((c) => i.component_ids.includes(c.id)).map((c) => c.name);
  const when = (d: Date) => formatWhen(d, s.time_zone, new Date());
  for (const r of rows) {
    const m = await updateEmail(s, {
      to: r.to_email,
      incident: i,
      update: u,
      components: names,
      when,
      link: `${publicUrl()}/incidents/${i.id}`,
      unsubscribe: `${publicUrl()}/unsubscribe/${r.token ?? ""}`,
    });
    try {
      await store.markEmail(r.id, await deliver(s, m));
    } catch (err) {
      await store.markEmail(r.id, "failed", String((err as Error).message ?? err));
    }
  }
  return rows.length;
};

// announce tells subscribers about an update. It never fails the caller: the update is posted.
export const announce = async (updateId: number) => {
  try {
    if (queueAvailable()) {
      await enqueue("update.posted", { update_id: updateId }, `update-${updateId}`);
      return;
    }
  } catch (err) {
    log.warn({ err: String(err), update_id: updateId }, "queue refused the event; sending in the background");
  }
  void (async () => {
    await queueUpdate(updateId);
    while ((await sendBatch(updateId)) > 0) await new Promise((r) => setTimeout(r, 1000));
  })().catch((err) => log.error({ err: String(err), update_id: updateId }, "could not send update emails"));
};
