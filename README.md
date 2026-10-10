# Status page

A self-hosted status page for your business: components with 90-day uptime bars, incidents with
a timeline of updates, scheduled maintenance, email subscribers, an Atom feed and an API your
monitors can use. It does what most people pay Atlassian Statuspage or Instatus for, and runs on
[Whisk](https://whisk.run) as one app.

**Live demo:** https://status.examples.whisk.page. Press **Look around** to manage it;
it resets every night.

## What it does

- **The page** answers "is it up?" at a glance: a banner (All systems operational, Degraded
  performance, Partial outage, Major outage, Under maintenance), open incidents, upcoming
  maintenance, components in groups with 90 days of uptime (30 on a phone), and the last two
  weeks of incidents. Hover or tap a bar to see that day. Dark mode follows the device.
- **Incidents** go through Investigating, Identified, Monitoring and Resolved. Each update can
  change the status of the components it affects and email subscribers. Every incident has its
  own page, and the history goes back month by month.
- **Maintenance** is scheduled as a window. It shows as upcoming, then in progress, then
  completed, worked out from the times, so nobody has to remember to flip it. Components in a
  window show as Under maintenance while it runs.
- **Uptime** comes from the history of component statuses: a major outage counts as down and a
  partial outage as 30 % down, as Statuspage counts it.
- **Subscribers** confirm by email and can unsubscribe from any email. Emails go out in the
  background, paced under Whisk's sending limit, and the staff timeline shows how many went.
- **Your brand**: name, logo, color, website and contact links, time zone, and your own domain
  through Whisk.
- **Machine-readable**: `/feed.atom`, `/badge.svg`, and `/api/v2/status.json` and
  `/api/v2/summary.json` in Atlassian Statuspage's format, so tools that read Statuspage read this.
- **API** (`/api/v1`) with keys made under Manage > Settings: set a component's status, open an
  incident, post an update. This is how an uptime monitor or a deploy script plugs in.
- **Staff** are the business's Whisk team. Everyone on it can post incidents and change
  components; owners, admins and the `status-admins` group also manage subscribers, settings and
  API keys. The rules are two lines in `src/whisk.ts`.

## Get your own

Copy this one as it is:

```
git clone https://github.com/whisk-hosting/status-page && cd status-page
whisk init --name status
whisk deploy -m "Set up the status page"
```

Or give your coding agent this prompt:

> Deploy the status page example from https://github.com/whisk-hosting/status-page to my Whisk
> account as an app called "status". Then open Manage > Settings and set the name to our
> business name, and replace the sample components with ours: [list them].

Build your own version from it:

> Using https://github.com/whisk-hosting/status-page as the starting point, build a status page
> for [business]. Our customers care about [the parts of the service]. Keep the functional style
> (pure decisions in src/model.ts, table-tested), and add [what you need, such as Slack alerts
> or a private page for one customer].

The first deploy adds a sample page for a made-up business so every screen has something to show.
Rename or delete it all under **Manage**.

## API

```
curl https://<your app>/api/v1/components -H "Authorization: Bearer sp_..."

curl -X PUT https://<your app>/api/v1/components/3 -H "Authorization: Bearer sp_..." \
  -H "Content-Type: application/json" -d '{"status": "major"}'

curl -X POST https://<your app>/api/v1/incidents -H "Authorization: Bearer sp_..." \
  -H "Content-Type: application/json" \
  -d '{"title": "Checkout is down", "body": "We are looking into it.", "component_ids": [3], "status": "major"}'

curl -X POST https://<your app>/api/v1/incidents/12/updates -H "Authorization: Bearer sp_..." \
  -H "Content-Type: application/json" -d '{"state": "resolved", "body": "Fixed."}'
```

The key goes in `Authorization: Bearer <key>`, `X-Api-Key: <key>`, Basic auth with the key as the
user name, or `?token=<key>`. In the live demo, keys made under Manage > Settings work on the
sample and are removed every night.

Statuses are `operational`, `degraded`, `partial` and `major`. Incident states are
`investigating`, `identified`, `monitoring` and `resolved`. `"notify": false` posts without
emailing subscribers. Errors are `{"error": {"code", "message", "fix"}}`.

## How it is built

Hono on Node, Postgres through `postgres`, no front-end framework. Pages render on the server; a
small script adds the uptime tooltips, the bot challenge and the logo upload. Decisions are pure
functions over read-only data, and the database, email and queue are thin shells around them.

```
src/model.ts          pure: statuses, the banner, maintenance state, uptime, time zones
src/forms.ts          pure: reading staff forms and API bodies into changes
src/feeds.ts          pure: Atom, the badge, Statuspage-compatible JSON
src/sample.ts         pure: the sample page, relative to now
src/load.ts           gathers what a page needs, then works it out with model.ts
src/store.ts          one small query per function
src/notify.ts         confirmation and update emails, written down first, sent in batches
src/functions.ts      notify-subscribers and the nightly tidy (Inngest, on Whisk's queue)
src/api.ts            /api/v1
src/routes/           the public pages and the staff screens
src/views/            layout, pages, styles, icons, the browser script
src/demo.ts           the live demo only; delete it in your copy if you like
migrations/           plain SQL, run in order before each release
```

Whisk provides sign-in (`X-Whisk-*` headers), the database, storage and image resizing for the
logo, email, the queue and schedules, the bot challenge on public forms, and custom domains.

**Why there is no built-in monitoring.** A check every minute keeps the app awake all day. Point
any monitor (Uptime Kuma, Better Stack, a cron job) at the API instead.

## Run it locally

With Postgres running:

```
npm install && npm run build
DATABASE_URL=postgres://… node dist/migrate.js
DATABASE_URL=postgres://… PORT=8080 node dist/index.js
```

Outside Whisk, email is logged instead of sent. Staff screens need the `X-Whisk-*` headers, so
use `whisk dev --as you@example.com --roles owner -- node dist/index.js` to sign in.

`npm test` runs the unit tests and `npm run typecheck` checks the types.

## License

MIT
