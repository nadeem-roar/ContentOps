-- ContentOps :: default board, storage bucket, and the automations that make it run itself

-- ---------------------------------------------------------------- default columns

insert into board_columns (key, name, stage, position, wip_limit, default_role) values
  ('ideas',      'Ideas',          'backlog',    1, null, 'strategist'),
  ('briefing',   'Briefing',       'brief',      2, null, 'strategist'),
  ('copy',       'Copywriting',    'production', 3,    8, 'copywriter'),
  ('design',     'Design',         'production', 4,    6, 'designer'),
  ('review',     'Internal review','review',     5,   10, 'manager'),
  ('approved',   'Approved',       'approved',   6, null, 'scheduler'),
  ('scheduled',  'Scheduled',      'scheduled',  7, null, 'scheduler'),
  ('published',  'Published',      'published',  8, null, null);

-- ---------------------------------------------------------------- storage

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'creatives',
  'creatives',
  false,
  524288000, -- 500 MB
  array[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml',
    'video/mp4', 'video/quicktime', 'application/pdf',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
  ]
)
on conflict (id) do nothing;

create policy "members read creatives" on storage.objects
  for select using (bucket_id = 'creatives' and is_active_member());

create policy "members upload creatives" on storage.objects
  for insert with check (
    bucket_id = 'creatives'
    and has_role('admin', 'manager', 'strategist', 'designer')
  );

create policy "members update creatives" on storage.objects
  for update using (
    bucket_id = 'creatives'
    and has_role('admin', 'manager', 'strategist', 'designer')
  );

-- ---------------------------------------------------------------- default automations
-- These are data, not code, so the team can retune them in the Automations screen without
-- a deploy. The engine that reads them lives in src/lib/automations/engine.ts.

insert into automations (name, description, trigger, conditions, actions) values
(
  'Route work to the right desk',
  'When a card lands in a column, assign it to whoever owns that stage and give it a due date.',
  'card.moved',
  '{}'::jsonb,
  '[
     {"type": "assign_to_column_role"},
     {"type": "set_due_date", "business_days": 2}
   ]'::jsonb
),
(
  'Design needs a brief',
  'A card cannot enter Design without approved copy on it.',
  'card.moved',
  '{"to_column": "design"}'::jsonb,
  '[
     {"type": "require_fields", "fields": ["caption"],
      "message": "Add the approved caption before this goes to Design."}
   ]'::jsonb
),
(
  'Review needs a creative',
  'A card cannot enter Internal review without at least one uploaded asset.',
  'card.moved',
  '{"to_column": "review"}'::jsonb,
  '[
     {"type": "require_asset",
      "message": "Upload the creative before sending this to review."}
   ]'::jsonb
),
(
  'Approved creatives go to Drive',
  'Marks the latest creative final and queues it for upload into the client Drive folder.',
  'card.moved',
  '{"to_stage": "approved"}'::jsonb,
  '[
     {"type": "mark_latest_asset_final"},
     {"type": "queue_drive_sync"},
     {"type": "notify_assignee", "message": "Approved and syncing to Drive."}
   ]'::jsonb
),
(
  'Nothing gets scheduled without a slot',
  'A card entering Scheduled must carry a publish date and time.',
  'card.moved',
  '{"to_stage": "scheduled"}'::jsonb,
  '[
     {"type": "require_fields", "fields": ["scheduled_for"],
      "message": "Pick a publish slot on the calendar first."}
   ]'::jsonb
),
(
  'Publish on the slot',
  'When a scheduled card reaches its publish time, move it to Published.',
  'schedule.due',
  '{"from_stage": "scheduled"}'::jsonb,
  '[
     {"type": "move_to_column", "column": "published"}
   ]'::jsonb
);
