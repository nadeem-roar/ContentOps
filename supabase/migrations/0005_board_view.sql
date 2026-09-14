-- ContentOps :: the board read model
-- One view so the board renders from a single query instead of N+1 count round trips.

create or replace view board_cards
with (security_invoker = true)
as
select
  i.*,
  c.name  as client_name,
  c.slug  as client_slug,
  c.brand_color as client_brand_color,
  ca.name as campaign_name,
  p.full_name  as assignee_name,
  p.avatar_url as assignee_avatar_url,
  coalesce(a.asset_count, 0)     as asset_count,
  coalesce(cm.open_comments, 0)  as unresolved_comment_count,
  a.latest_asset_id,
  a.latest_asset_drive_id,
  a.latest_asset_mime,
  a.latest_asset_version,
  a.has_unfiled_final
from content_items i
join clients c on c.id = i.client_id
left join campaigns ca on ca.id = i.campaign_id
left join profiles p on p.id = i.assignee_id
left join lateral (
  select
    count(*)                                                    as asset_count,
    (array_agg(x.id           order by x.version desc))[1]      as latest_asset_id,
    (array_agg(x.drive_file_id  order by x.version desc))[1]     as latest_asset_drive_id,
    (array_agg(x.mime_type    order by x.version desc))[1]      as latest_asset_mime,
    max(x.version)                                              as latest_asset_version,
    bool_or(x.kind = 'final' and x.filed_at is null)            as has_unfiled_final
  from content_assets x
  where x.content_item_id = i.id
) a on true
left join lateral (
  select count(*) as open_comments
  from comments cc
  where cc.content_item_id = i.id and cc.resolved_at is null
) cm on true
where i.archived_at is null;

comment on view board_cards is
  'Read model for the kanban board and calendar. security_invoker keeps RLS on the base tables in force.';
