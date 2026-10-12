-- Built-in monitoring: a component can have one monitor, a web address the app checks on a
-- schedule (functions.ts). After two failed checks in a row the component shows a major outage
-- and, if the monitor says so, an incident opens; the first good check puts it back.

-- state is what the monitor last decided: up, slow (answered, but slower than slow_ms) or down.
-- fails counts failed checks in a row. incident_id is the incident the monitor opened, if any.
create table monitors (
  component_id int primary key references components (id) on delete cascade,
  url text not null,
  keyword text not null default '',
  slow_ms int not null default 3000 check (slow_ms between 100 and 30000),
  open_incidents boolean not null default true,
  paused boolean not null default false,
  state text not null default 'up' check (state in ('up', 'slow', 'down')),
  fails int not null default 0,
  since timestamptz not null default now(),
  checked_at timestamptz,
  incident_id int references incidents (id) on delete set null,
  created_at timestamptz not null default now()
);

-- Every check, kept for a week (the nightly tidy drops older ones). ms is null when nothing
-- answered.
create table checks (
  id bigserial primary key,
  component_id int not null references components (id) on delete cascade,
  at timestamptz not null default now(),
  ok boolean not null,
  ms int,
  error text not null default ''
);
create index checks_component_at on checks (component_id, at desc);
