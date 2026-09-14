-- ContentOps :: RPCs the app leans on

-- Automation telemetry. Security definer so a member without automation write access
-- can still cause the counter to tick.
create or replace function bump_automation_run(rule_id uuid)
returns void
language sql
security definer
set search_path = public
as $$
  update automations
  set run_count = run_count + 1, last_run_at = now()
  where id = rule_id;
$$;

-- Fractional ordering: hand back a position that sits between two cards, so a drag
-- only ever writes the one row that moved.
create or replace function position_between(before_pos double precision, after_pos double precision)
returns double precision
language sql
immutable
as $$
  select case
    when before_pos is null and after_pos is null then 1000::double precision
    when before_pos is null then after_pos - 1000
    when after_pos is null then before_pos + 1000
    else (before_pos + after_pos) / 2
  end;
$$;

-- Unread count for the inbox badge.
create or replace function my_unread_count()
returns integer
language sql
stable
security definer
set search_path = public
as $$
  select count(*)::integer
  from comment_recipients
  where profile_id = auth.uid() and read_at is null;
$$;

-- Fan a new comment out to everyone who should see it: the people named in it, the card
-- assignee, and anyone already in the thread. Called once, right after the insert.
create or replace function fan_out_comment(comment_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  c            comments%rowtype;
  mentioned    text[];
  recipient_id uuid;
begin
  select * into c from comments where id = comment_id;
  if not found then
    return;
  end if;

  -- @handles in the body, matched against the local part of each team email.
  select array_agg(distinct lower(m[1]))
  into mentioned
  from regexp_matches(c.body, '@([A-Za-z0-9._-]+)', 'g') as m;

  for recipient_id in
    select p.id
    from profiles p
    where p.is_active
      and p.id <> c.author_id
      and (
        -- named in the body
        lower(split_part(p.email, '@', 1)) = any(coalesce(mentioned, array[]::text[]))
        -- or holds the card
        or p.id = (select assignee_id from content_items where id = c.content_item_id)
        -- or already spoke in this thread
        or p.id in (
          select author_id from comments
          where content_item_id = c.content_item_id and id <> c.id
        )
      )
  loop
    insert into comment_recipients (comment_id, profile_id, reason)
    values (c.id, recipient_id, 'thread')
    on conflict do nothing;
  end loop;
end;
$$;

-- Cards whose publish slot has arrived. The scheduler cron reads this.
create or replace function due_for_publish(at_time timestamptz default now())
returns setof content_items
language sql
stable
as $$
  select i.*
  from content_items i
  join board_columns c on c.id = i.column_id
  where c.stage = 'scheduled'
    and i.scheduled_for is not null
    and i.scheduled_for <= at_time
    and i.archived_at is null;
$$;
