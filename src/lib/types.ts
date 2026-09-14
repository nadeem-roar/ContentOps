export type UserRole =
  | 'admin'
  | 'manager'
  | 'strategist'
  | 'copywriter'
  | 'designer'
  | 'scheduler'
  | 'viewer';

export type StageType =
  | 'backlog'
  | 'brief'
  | 'production'
  | 'review'
  | 'approved'
  | 'scheduled'
  | 'published'
  | 'archived';

export type CampaignStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';

export type ContentChannel =
  | 'instagram'
  | 'facebook'
  | 'linkedin'
  | 'tiktok'
  | 'youtube'
  | 'x'
  | 'blog'
  | 'email'
  | 'other';

export type ContentFormat =
  | 'static'
  | 'carousel'
  | 'reel'
  | 'story'
  | 'video'
  | 'article'
  | 'email'
  | 'other';

export type PriorityLevel = 'low' | 'normal' | 'high' | 'urgent';

export type AssetKind = 'working' | 'final';

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  role: UserRole;
  is_active: boolean;
}

export interface Client {
  id: string;
  name: string;
  slug: string;
  brand_color: string | null;
  drive_folder_id: string | null;
  notes: string | null;
  is_archived: boolean;
}

export interface Campaign {
  id: string;
  client_id: string;
  name: string;
  objective: string | null;
  brief: CampaignBrief;
  status: CampaignStatus;
  start_date: string | null;
  end_date: string | null;
  owner_id: string | null;
  drive_folder_id: string | null;
}

export interface CampaignBrief {
  audience?: string;
  key_message?: string;
  pillars?: string[];
  channels?: ContentChannel[];
  deliverables?: { format: ContentFormat; channel: ContentChannel; quantity: number }[];
  success_metrics?: string[];
  mandatories?: string;
}

export interface BoardColumn {
  id: string;
  key: string;
  name: string;
  stage: StageType;
  position: number;
  wip_limit: number | null;
  default_role: UserRole | null;
}

export interface ContentItem {
  id: string;
  campaign_id: string | null;
  client_id: string;
  title: string;
  hook: string | null;
  caption: string | null;
  channel: ContentChannel;
  format: ContentFormat;
  column_id: string;
  position: number;
  assignee_id: string | null;
  created_by: string | null;
  priority: PriorityLevel;
  due_date: string | null;
  scheduled_for: string | null;
  published_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  drive_folder_id: string | null;
  archived_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ContentAsset {
  id: string;
  content_item_id: string;
  kind: AssetKind;
  version: number;
  file_name: string;
  mime_type: string | null;
  byte_size: number | null;
  storage_path: string | null;
  drive_file_id: string | null;
  drive_url: string | null;
  synced_to_drive_at: string | null;
  sync_error: string | null;
  sync_attempts: number;
  uploaded_by: string | null;
  created_at: string;
}

export interface Comment {
  id: string;
  content_item_id: string;
  parent_id: string | null;
  author_id: string;
  body: string;
  asset_id: string | null;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

/** A card as the board renders it, with the joins the UI needs. */
export interface BoardCard extends ContentItem {
  client: Pick<Client, 'id' | 'name' | 'slug' | 'brand_color'> | null;
  campaign: Pick<Campaign, 'id' | 'name'> | null;
  assignee: Pick<Profile, 'id' | 'full_name' | 'avatar_url'> | null;
  asset_count: number;
  unresolved_comment_count: number;
  latest_asset: Pick<ContentAsset, 'id' | 'storage_path' | 'mime_type' | 'version'> | null;
}
