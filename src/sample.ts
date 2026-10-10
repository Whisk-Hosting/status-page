// The sample status page a new install starts with (and the live demo resets to each night): a
// made-up online ordering business with three months of history, so every screen has something
// to show. Pure: it plans rows relative to `now`; seed.ts writes them.
import type { Kind, State, Status } from "./model.js";

export type SampleComponent = Readonly<{ key: string; name: string; description: string; group: string | null }>;
export type SampleUpdate = Readonly<{ state: State; body: string; minutes: number }>;
export type SampleIncident = Readonly<{
  kind: Kind;
  title: string;
  impact: Status;
  components: readonly string[];
  // When it started, and its updates as minutes after that.
  start: Date;
  // Maintenance windows only.
  minutes?: number;
  updates: readonly SampleUpdate[];
}>;
export type Sample = Readonly<{
  name: string;
  website_url: string;
  groups: readonly string[];
  components: readonly SampleComponent[];
  created: Date;
  incidents: readonly SampleIncident[];
  subscribers: readonly string[];
}>;

const DAY = 86_400_000;
const at = (now: Date, daysAgo: number, hour: number, minute = 0) => {
  const d = new Date(now.getTime() - daysAgo * DAY);
  d.setUTCHours(hour, minute, 0, 0);
  return d;
};

const resolved = (minutes: number, body = "This incident has been resolved.") => ({ state: "resolved" as const, body, minutes });

export const sample = (now: Date): Sample => ({
  name: "Larder",
  website_url: "https://example.com",
  groups: ["Ordering", "Platform", "Notifications", "Integrations"],
  created: new Date(now.getTime() - 120 * DAY),
  components: [
    { key: "web", name: "Website", description: "larder.example.com", group: null },
    { key: "app", name: "Web app", description: "Ordering for cafés and restaurants", group: "Ordering" },
    { key: "mobile", name: "iPhone and Android apps", description: "", group: "Ordering" },
    { key: "checkout", name: "Checkout and payments", description: "Card and account payments", group: "Ordering" },
    { key: "api", name: "API", description: "", group: "Platform" },
    { key: "hooks", name: "Webhooks", description: "", group: "Platform" },
    { key: "sso", name: "Single sign-on", description: "", group: "Platform" },
    { key: "email", name: "Email", description: "Order confirmations and invoices", group: "Notifications" },
    { key: "sms", name: "Text messages", description: "Delivery alerts", group: "Notifications" },
    { key: "quickbooks", name: "QuickBooks", description: "Invoices and payments sync", group: "Integrations" },
    { key: "shopify", name: "Shopify", description: "Orders from online stores", group: "Integrations" },
  ],
  incidents: [
    {
      kind: "incident",
      title: "Shopify orders arriving late",
      impact: "degraded",
      components: ["shopify"],
      start: new Date(now.getTime() - 95 * 60_000),
      updates: [
        { state: "investigating", body: "Orders from Shopify stores are taking up to 20 minutes to appear. We're looking into it.", minutes: 0 },
        { state: "identified", body: "Shopify is sending order notifications slowly. Orders are not lost, only delayed.", minutes: 25 },
        { state: "monitoring", body: "Shopify has fixed the delay on their side and new orders are arriving within a minute. We're watching the backlog clear.", minutes: 70 },
      ],
    },
    {
      kind: "maintenance",
      title: "Payment provider upgrade",
      impact: "degraded",
      components: ["checkout"],
      start: at(now, -4, 14),
      minutes: 120,
      updates: [{ state: "scheduled", body: "We're moving to our payment provider's new platform. Card payments may be slow for a few minutes during the window. Account payments are not affected.", minutes: -7200 }],
    },
    {
      kind: "incident",
      title: "Slow checkout for some customers",
      impact: "partial",
      components: ["checkout"],
      start: at(now, 3, 1, 12),
      updates: [
        { state: "investigating", body: "Some customers are seeing checkout take more than 30 seconds or time out. We're investigating.", minutes: 0 },
        { state: "identified", body: "A database index was missing after last night's release. We're adding it now.", minutes: 18 },
        { state: "monitoring", body: "Checkout is back to normal speed. We're monitoring.", minutes: 34 },
        resolved(52, "Checkout has been fast for 20 minutes. Orders that timed out were not charged."),
      ],
    },
    {
      kind: "incident",
      title: "Text message alerts delayed",
      impact: "degraded",
      components: ["sms"],
      start: at(now, 11, 22, 40),
      updates: [
        { state: "investigating", body: "Delivery alerts by text are arriving late. Email alerts are on time.", minutes: 0 },
        { state: "identified", body: "Our text message provider has a backlog on the West Coast.", minutes: 30 },
        resolved(128),
      ],
    },
    {
      kind: "maintenance",
      title: "Database upgrade",
      impact: "major",
      components: ["app", "mobile", "checkout", "api"],
      start: at(now, 19, 14),
      minutes: 60,
      updates: [
        { state: "scheduled", body: "We're upgrading our main database. Ordering will be unavailable for up to 15 minutes during the window.", minutes: -4320 },
        { state: "in_progress", body: "The upgrade has started.", minutes: 0 },
        { state: "completed", body: "The upgrade is done. Ordering was unavailable for 9 minutes.", minutes: 41 },
      ],
    },
    {
      kind: "incident",
      title: "QuickBooks sync paused",
      impact: "partial",
      components: ["quickbooks"],
      start: at(now, 23, 3),
      updates: [
        { state: "investigating", body: "Invoices are not reaching QuickBooks. They are queued and will sync once this is fixed.", minutes: 0 },
        { state: "identified", body: "QuickBooks is refusing our connection after a change to their sign-in. We're updating it.", minutes: 90 },
        { state: "monitoring", body: "Sync has restarted and the queue is clearing.", minutes: 260 },
        resolved(310, "Every queued invoice is now in QuickBooks."),
      ],
    },
    {
      kind: "incident",
      title: "Ordering unavailable",
      impact: "major",
      components: ["app", "mobile"],
      start: at(now, 37, 19, 5),
      updates: [
        { state: "investigating", body: "The web app and mobile apps are not loading. We're on it.", minutes: 0 },
        { state: "identified", body: "A network change at our hosting provider cut off the app servers. It is being reversed.", minutes: 12 },
        resolved(34, "Ordering is back. Orders placed before the outage were kept."),
      ],
    },
    {
      kind: "incident",
      title: "Webhook deliveries retrying",
      impact: "degraded",
      components: ["hooks"],
      start: at(now, 58, 9, 30),
      updates: [
        { state: "investigating", body: "Some webhook deliveries are failing and being retried.", minutes: 0 },
        resolved(75, "Every delivery has now gone through."),
      ],
    },
    {
      kind: "incident",
      title: "Sign-in errors with Microsoft accounts",
      impact: "partial",
      components: ["sso"],
      start: at(now, 76, 0, 15),
      updates: [
        { state: "investigating", body: "Some people signing in with Microsoft see an error. Email sign-in works.", minutes: 0 },
        { state: "monitoring", body: "We've renewed an expired certificate. Sign-in is working again.", minutes: 48 },
        resolved(70),
      ],
    },
  ],
  subscribers: ["ana@example.com", "ben@example.com", "chloe@example.com", "dev@example.com", "emma@example.com", "frank@example.com"],
});

// The status changes an incident implies: its components take its impact when it starts and go
// back to operational when it is resolved. Maintenance changes no stored status.
export const impliedChanges = (i: SampleIncident, now: Date): readonly Readonly<{ key: string; status: Status; at: Date }>[] => {
  if (i.kind !== "incident") return [];
  const end = i.updates.find((u) => u.state === "resolved");
  return i.components.flatMap((key) => [
    { key, status: i.impact, at: i.start },
    ...(end ? [{ key, status: "operational" as Status, at: new Date(i.start.getTime() + end.minutes * 60_000) }] : []),
  ]).filter((c) => c.at <= now);
};
