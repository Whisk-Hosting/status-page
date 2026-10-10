// Background work. Step names match workflows/*.graph.yaml.
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

// Every night: addresses that never confirmed within a week are dropped.
export const tidy = inngest.createFunction({ id: "tidy", triggers: [{ cron: "30 3 * * *" }] }, async ({ step }) =>
  step.run("drop-unconfirmed", () => store.dropUnconfirmed(new Date(Date.now() - 7 * 86_400_000))),
);

export const functions = [notifySubscribers, tidy, ...demoFunctions()];
