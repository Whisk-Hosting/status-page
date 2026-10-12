// Background work. Step names match workflows/*.graph.yaml.
import { runChecks } from "./checks.js";
import { demoFunctions } from "./demo.js";
import { BATCH, queueUpdate, sendBatch } from "./notify.js";
import * as store from "./store.js";
import { inngest } from "./whisk.js";

// After an update is posted: write an email per subscriber, then send them in batches of 40
// about every 30 seconds, under Whisk's limit of 100 a minute. Each batch is a step, so a run
// that stops resumes where it left off and nobody gets the same email twice.
export const notifySubscribers = inngest.createFunction(
  { id: "notify-subscribers", triggers: [{ event: "update.posted" }], retries: 4, concurrency: { limit: 1 } },
  async ({ event, step }) => {
    const id = Number(event.data.update_id);
    await step.run("queue", () => queueUpdate(id));
    for (let sent = BATCH; sent === BATCH; ) {
      sent = await step.run("send-batch", () => sendBatch(id));
      if (sent === BATCH) await step.sleep("pace", "30s");
    }
  },
);

// Every three minutes: check each monitored component (checks.ts). The schedule is in whisk.yaml
// too; change both to check more or less often. Runs never overlap.
export const monitor = inngest.createFunction(
  { id: "monitor", triggers: [{ cron: "0-59/3 * * * *" }], concurrency: { limit: 1 }, retries: 0 },
  async ({ step }) => step.run("check", () => runChecks()),
);

// Every night: addresses that never confirmed within a week are dropped, and checks older than a
// week.
export const tidy = inngest.createFunction({ id: "tidy", triggers: [{ cron: "30 3 * * *" }] }, async ({ step }) => {
  const week = () => new Date(Date.now() - 7 * 86_400_000);
  await step.run("drop-unconfirmed", () => store.dropUnconfirmed(week()));
  await step.run("drop-old-checks", () => store.dropOldChecks(week()));
});

export const functions = [notifySubscribers, monitor, tidy, ...demoFunctions()];
