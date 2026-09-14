-- ContentOps :: core schema
-- Single-tenant (one internal team). Access is gated on an active profile row.

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- enums

create type user_role as enum (
  'admin', 'manager', 'strategist', 'copywriter', 'designer', 'scheduler', 'viewer'
);

-- Stage is what automations key off. Column names are free text; stage is not.
create type stage_type as enum (
  'backlog', 'brief', 'production', 'review', 'approved', 'scheduled', 'published', 'archived'
);

create type campaign_status as enum ('draft', 'active', 'paused', 'completed', 'archived');

create type content_channel as enum (
  'instagram', 'facebook', 'linkedin', 'tiktok', 'youtube', 'x', 'blog', 'email', 'other'
);

create type content_format as enum (
  'static', 'carousel', 'reel', 'story', 'video', 'article', 'email', 'other'
);

create type priority_level as enum ('low', 'normal', 'high', 'urgent');

create type asset_kind as enum ('working', 'final');

-- ---------------------------------------------------------------- profiles

create table profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  email        text not null unique,
  full_name    text,
  avatar_url   text,
  role         user_role not null default 'viewer',
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table profiles is 'Team members. Row is created automatically on first Google SSO sign-in.';

-- ---------------------------------------------------------------- clients

create table clients (
  id               uuid primary key default gen_random_uuid(),
  name             text not null,
  slug             text not null unique,
  brand_color      text,
  drive_folder_id  text,
  notes            text,
  is_archived      boolean not null default false,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- ---------------------------------------------------------------- campaigns

create table campaigns (
  id               uuid primary key default gen_random_uuid(),
  client_id        uuid not null references clients (id) on delete cascade,
  name             text not null,
  objective        text,
  brief            jsonb not null default '{}'::jsonb,
  status           campaign_status not null default 'draft',
  start_date       date,
  end_date         date,
  owner_id         uuid references profiles (id) on delete set null,
  drive_folder_id  text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint campaigns_dates_ordered
    check (end_date is null or start_date is null or end_date >= start_date)
);

create index campaigns_client_idx on campaigns (client_id);
create index campaigns_status_idx on campaigns (status);

-- ---------------------------------------------------------------- board

create table board_columns (
  id           uuid primary key default gen_random_uuid(),
  key          text not null unique,
  name         text not null,
  stage        stage_type not null,
  position     integer not null,
  wip_limit    integer,
  -- Role that work in this column normally belongs to. Automations use it to auto-assign.
  default_role user_role,
  created_at   timestamptz not null default now()
);

create unique index board_columns_position_idx on board_columns (position);

-- ---------------------------------------------------------------- content items (kanban cards)

create table content_items (
  id              uuid primary key default gen_random_uuid(),
  campaign_id     uuid references campaigns (id) on delete set null,
  client_id       uuid not null references clients (id) on delete cascade,
  title           text not null,
  hook            text,
  caption         text,
  channel         content_channel not null default 'instagram',
  format          content_format not null default 'static',
  column_id       uuid not null references board_columns (id),
  position        double precision not null default 1000,
  assignee_id     uuid references profiles (id) on delete set null,
  created_by      uuid references profiles (id) on delete set null,
  priority        priority_level not null default 'normal',
  due_date        date,
  scheduled_for   timestamptz,
  published_at    timestamptz,
  approved_at     timestamptz,
  approved_by     uuid references profiles (id) on delete set null,
  drive_folder_id text,
  archived_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index content_items_column_idx on content_items (column_id, position);
create index content_items_campaign_idx on content_items (campaign_id);
create index content_items_client_idx on content_items (client_id);
create index content_items_assignee_idx on content_items (assignee_id);
create index content_items_scheduled_idx on content_items (scheduled_for)
  where scheduled_for is not null;

-- ---------------------------------------------------------------- assets

-- Creatives live in Google Drive and nowhere else. A row here is a pointer plus the
-- workflow state around it; the bytes are never copied into Postgres or object storage,
-- so there is exactly one copy of every file and one answer to "which version is real".
create table content_assets (
  id                 uuid primary key default gen_random_uuid(),
  content_item_id    uuid not null references content_items (id) on delete cascade,
  kind               asset_kind not null default 'working',
  version            integer not null default 1,
  file_name          text not null,
  mime_type          text,
  byte_size          bigint,
  -- Set at upload time; the file exists in Drive before this row does.
  drive_file_id      text not null,
  drive_url          text,
  -- The Drive folder the file currently sits in: Working/ until approved, Final/ after.
  drive_parent_id    text,
  -- Stamped once the file has been moved into Final/ and renamed to the convention.
  filed_at           timestamptz,
  filing_error       text,
  filing_attempts    integer not null default 0,
  uploaded_by        uuid references profiles (id) on delete set null,
  created_at         timestamptz not null default now(),
  unique (content_item_id, version)
);

create index content_assets_item_idx on content_assets (content_item_id, version desc);

-- Drives the filing queue: approved creatives still sitting in Working/.
create index content_assets_pending_filing_idx on content_assets (created_at)
  where kind = 'final' and filed_at is null;

-- ---------------------------------------------------------------- comments (the inbox)

create table comments (
  id              uuid primary key default gen_random_uuid(),
  content_item_id uuid not null references content_items (id) on delete cascade,
  parent_id       uuid references comments (id) on delete cascade,
  author_id       uuid not null references profiles (id) on delete cascade,
  body            text not null check (length(btrim(body)) > 0),
  -- Set when the comment is feedback pinned to one specific creative.
  asset_id        uuid references content_assets (id) on delete set null,
  resolved_at     timestamptz,
  resolved_by     uuid references profiles (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index comments_item_idx on comments (content_item_id, created_at);
create index comments_unresolved_idx on comments (content_item_id) where resolved_at is null;

-- One row per person who needs to see a comment: mention, assignee, or thread participant.
create table comment_recipients (
  comment_id uuid not null references comments (id) on delete cascade,
  profile_id uuid not null references profiles (id) on delete cascade,
  reason     text not null default 'mention',
  read_at    timestamptz,
  primary key (comment_id, profile_id)
);

create index comment_recipients_unread_idx on comment_recipients (profile_id)
  where read_at is null;

-- ---------------------------------------------------------------- automations

create table automations (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  description text,
  -- card.created | card.moved | asset.marked_final | card.scheduled | schedule.due
  trigger     text not null,
  conditions  jsonb not null default '{}'::jsonb,
  actions     jsonb not null default '[]'::jsonb,
  is_enabled  boolean not null default true,
  run_count   integer not null default 0,
  last_run_at timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- ---------------------------------------------------------------- activity log

create table activity (
  id          bigserial primary key,
  entity_type text not null,
  entity_id   uuid not null,
  actor_id    uuid references profiles (id) on delete set null,
  verb        text not null,
  meta        jsonb not null default '{}'::jsonb,
  created_at  timestamptz not null default now()
);

create index activity_entity_idx on activity (entity_type, entity_id, created_at desc);
create index activity_recent_idx on activity (created_at desc);
