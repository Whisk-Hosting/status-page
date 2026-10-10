-- The status page: what the page shows (components in groups), what happened (incidents and
-- maintenance with their updates), the history behind the uptime bars, and who hears about it.

create table settings (
  id int primary key default 1 check (id = 1),
  name text not null default 'Status',
  logo_upload text,
  accent text not null default '#4f46e5',
  website_url text not null default '',
  support_url text not null default '',
  time_zone text not null default 'UTC',
  email_from text not null default '',
  updated_at timestamptz not null default now()
);
insert into settings (id) values (1);

create table component_groups (
  id serial primary key,
  name text not null,
  position int not null default 0,
  created_at timestamptz not null default now()
);

-- status: operational, degraded, partial, major. Maintenance is never stored here: it is worked
-- out from the maintenance windows when a page is drawn.
create table components (
  id serial primary key,
  group_id int references component_groups (id) on delete set null,
  name text not null,
  description text not null default '',
  position int not null default 0,
  status text not null default 'operational' check (status in ('operational', 'degraded', 'partial', 'major')),
  created_at timestamptz not null default now()
);

-- Every change of a component's status, newest last. The uptime bars are drawn from this.
create table status_changes (
  id bigserial primary key,
  component_id int not null references components (id) on delete cascade,
  status text not null check (status in ('operational', 'degraded', 'partial', 'major')),
  at timestamptz not null default now()
);
create index status_changes_component_at on status_changes (component_id, at);

-- kind: incident or maintenance. An incident's state is the state of its latest update. A
-- maintenance window's state comes from its times unless someone finished it early.
create table incidents (
  id serial primary key,
  kind text not null check (kind in ('incident', 'maintenance')),
  title text not null,
  impact text not null default 'degraded' check (impact in ('operational', 'degraded', 'partial', 'major')),
  state text not null,
  starts_at timestamptz,
  ends_at timestamptz,
  resolved_at timestamptz,
  created_by text not null default '',
  created_at timestamptz not null default now()
);
create index incidents_created on incidents (created_at desc);

create table incident_components (
  incident_id int not null references incidents (id) on delete cascade,
  component_id int not null references components (id) on delete cascade,
  primary key (incident_id, component_id)
);

create table incident_updates (
  id serial primary key,
  incident_id int not null references incidents (id) on delete cascade,
  state text not null,
  body text not null,
  notify boolean not null default true,
  author text not null default '',
  at timestamptz not null default now()
);
create index incident_updates_incident on incident_updates (incident_id, at);

create table subscribers (
  id serial primary key,
  email text not null,
  token text not null unique,
  confirmed_at timestamptz,
  created_at timestamptz not null default now()
);
create unique index subscribers_email on subscribers (lower(email));

-- One row per email: confirmations, and each update sent to each subscriber. status: pending,
-- sent, failed, or recorded (the live demo writes emails down and never sends them).
create table emails (
  id bigserial primary key,
  kind text not null,
  update_id int references incident_updates (id) on delete cascade,
  subscriber_id int references subscribers (id) on delete cascade,
  to_email text not null,
  subject text not null,
  status text not null default 'pending',
  error text not null default '',
  created_at timestamptz not null default now(),
  sent_at timestamptz
);
create unique index emails_update_subscriber on emails (update_id, subscriber_id) where update_id is not null;
create index emails_pending on emails (update_id, status);

-- Keys for /api/v1. Only a hash is kept; the key itself is shown once.
create table api_keys (
  id serial primary key,
  name text not null,
  prefix text not null,
  hash text not null unique,
  created_by text not null default '',
  created_at timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at timestamptz
);
