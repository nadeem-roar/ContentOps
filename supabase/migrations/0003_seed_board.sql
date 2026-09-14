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

-- No storage bucket: creatives live in Google Drive. See content_assets in 0001.

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
  'File approved creatives',
  'Marks the latest creative final and files it into the campaign Final folder in Drive.',
  'card.moved',
  '{"to_stage": "approved"}'::jsonb,
  '[
     {"type": "mark_latest_asset_final"},
     {"type": "queue_drive_filing"},
     {"type": "notify_assignee", "message": "Approved and filing to Drive."}
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
