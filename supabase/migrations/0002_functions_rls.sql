-- ContentOps :: triggers, invariants, and row level security

-- ---------------------------------------------------------------- helpers

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger profiles_updated_at      before update on profiles      for each row execute function set_updated_at();
create trigger clients_updated_at       before update on clients       for each row execute function set_updated_at();
create trigger campaigns_updated_at     before update on campaigns     for each row execute function set_updated_at();
create trigger content_items_updated_at before update on content_items for each row execute function set_updated_at();
create trigger comments_updated_at      before update on comments      for each row execute function set_updated_at();
create trigger automations_updated_at   before update on automations   for each row execute function set_updated_at();

-- Is the caller a signed-in, still-active team member?
create or replace function is_active_member()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = auth.uid() and is_active
  );
$$;

-- The caller's role, or null if they have no profile.
create or replace function current_role_name()
returns user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from profiles where id = auth.uid() and is_active;
$$;

create or replace function has_role(variadic allowed user_role[])
returns boolean
language sql
stable
as $$
  select current_role_name() = any(allowed);
$$;

-- ---------------------------------------------------------------- profile provisioning
-- First Google SSO sign-in creates the profile. Domain is enforced here as well as in
-- the app, so a leaked redirect URL cannot mint an account outside the company domain.

create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  allowed_domains text[];
  email_domain    text;
begin
  allowed_domains := string_to_array(
    coalesce(current_setting('app.allowed_email_domains', true), 'creatorflow.com.au'),
    ','
  );
  email_domain := lower(split_part(new.email, '@', 2));

  if not (email_domain = any(allowed_domains)) then
    raise exception 'Email domain % is not permitted to sign in', email_domain
      using errcode = 'check_violation';
  end if;

  insert into profiles (id, email, full_name, avatar_url, role)
  values (
    new.id,
    lower(new.email),
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url',
    -- First person through the door is the admin; everyone after starts as a viewer
    -- and is promoted by an admin.
    case when (select count(*) from profiles) = 0 then 'admin'::user_role
         else 'viewer'::user_role end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------- board invariants

-- Refuse a move that would push a column past its WIP limit. This is the guardrail that
-- keeps the board honest: without it "in review" silently becomes a dumping ground.
create or replace function enforce_wip_limit()
returns trigger
language plpgsql
as $$
declare
  limit_for_column integer;
  current_count    integer;
begin
  if tg_op = 'UPDATE' and new.column_id = old.column_id then
    return new;
  end if;

  select wip_limit into limit_for_column from board_columns where id = new.column_id;

  if limit_for_column is null then
    return new;
  end if;

  select count(*) into current_count
  from content_items
  where column_id = new.column_id
    and archived_at is null
    and id <> new.id;

  if current_count >= limit_for_column then
    raise exception 'Column is at its WIP limit of %. Finish something before starting more.',
      limit_for_column
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger content_items_wip_limit
  before insert or update of column_id on content_items
  for each row execute function enforce_wip_limit();

-- Stamp the lifecycle timestamps from the stage a card lands in, so reporting does not
-- depend on anyone remembering to set a date by hand.
create or replace function stamp_stage_timestamps()
returns trigger
language plpgsql
as $$
declare
  new_stage stage_type;
begin
  if tg_op = 'UPDATE' and new.column_id = old.column_id then
    return new;
  end if;

  select stage into new_stage from board_columns where id = new.column_id;

  if new_stage = 'approved' and new.approved_at is null then
    new.approved_at := now();
    new.approved_by := auth.uid();
  end if;

  if new_stage = 'published' and new.published_at is null then
    new.published_at := now();
  end if;

  if new_stage = 'archived' and new.archived_at is null then
    new.archived_at := now();
  end if;

  return new;
end;
$$;

create trigger content_items_stage_timestamps
  before insert or update of column_id on content_items
  for each row execute function stamp_stage_timestamps();

-- Assets version per card automatically, so "final_v3.png" is never a filename anyone types.
create or replace function assign_asset_version()
returns trigger
language plpgsql
as $$
begin
  if new.version is null or new.version = 1 then
    select coalesce(max(version), 0) + 1 into new.version
    from content_assets
    where content_item_id = new.content_item_id;
  end if;
  return new;
end;
$$;

create trigger content_assets_version
  before insert on content_assets
  for each row execute function assign_asset_version();

-- ---------------------------------------------------------------- row level security

alter table profiles           enable row level security;
alter table clients            enable row level security;
alter table campaigns          enable row level security;
alter table board_columns      enable row level security;
alter table content_items      enable row level security;
alter table content_assets     enable row level security;
alter table comments           enable row level security;
alter table comment_recipients enable row level security;
alter table automations        enable row level security;
alter table activity           enable row level security;

-- Everyone on the team can see the whole board. The point of the tool is shared context.
create policy "members read profiles"       on profiles       for select using (is_active_member());
create policy "members read clients"        on clients        for select using (is_active_member());
create policy "members read campaigns"      on campaigns      for select using (is_active_member());
create policy "members read columns"        on board_columns  for select using (is_active_member());
create policy "members read items"          on content_items  for select using (is_active_member());
create policy "members read assets"         on content_assets for select using (is_active_member());
create policy "members read comments"       on comments       for select using (is_active_member());
create policy "members read automations"    on automations    for select using (is_active_member());
create policy "members read activity"       on activity       for select using (is_active_member());

create policy "members read own recipients" on comment_recipients
  for select using (profile_id = auth.uid());
create policy "members mark own read"       on comment_recipients
  for update using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- Profiles: you edit yourself; admins edit anyone.
create policy "update own profile" on profiles
  for update using (id = auth.uid() or has_role('admin'))
  with check (id = auth.uid() or has_role('admin'));

-- Clients and campaigns are shaped by the people who plan the work.
create policy "manage clients" on clients
  for all using (has_role('admin', 'manager'))
  with check (has_role('admin', 'manager'));

create policy "manage campaigns" on campaigns
  for all using (has_role('admin', 'manager', 'strategist'))
  with check (has_role('admin', 'manager', 'strategist'));

create policy "manage columns" on board_columns
  for all using (has_role('admin', 'manager'))
  with check (has_role('admin', 'manager'));

create policy "manage automations" on automations
  for all using (has_role('admin', 'manager'))
  with check (has_role('admin', 'manager'));

-- Anyone who does the work can move cards. Viewers cannot.
create policy "write items" on content_items
  for all
  using (has_role('admin', 'manager', 'strategist', 'copywriter', 'designer', 'scheduler'))
  with check (has_role('admin', 'manager', 'strategist', 'copywriter', 'designer', 'scheduler'));

create policy "write assets" on content_assets
  for all
  using (has_role('admin', 'manager', 'strategist', 'designer'))
  with check (has_role('admin', 'manager', 'strategist', 'designer'));

-- Everyone active can comment; you can only edit or delete your own.
create policy "insert comments" on comments
  for insert with check (is_active_member() and author_id = auth.uid());
create policy "edit own comments" on comments
  for update using (author_id = auth.uid() or has_role('admin'))
  with check (author_id = auth.uid() or has_role('admin'));
create policy "delete own comments" on comments
  for delete using (author_id = auth.uid() or has_role('admin'));

-- Activity is append-only from the app; nothing rewrites history.
create policy "insert activity" on activity
  for insert with check (is_active_member());
