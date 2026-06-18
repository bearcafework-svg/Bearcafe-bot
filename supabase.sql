-- Required by src/features/secretChat/index.js
-- This is separate from secret_chat_logs. Logs are historical events; this table
-- is the current active-room state used to survive deploy/restart safely.
create table if not exists public.secret_chat_active_rooms (
  channel_id text primary key,
  guild_id text not null,
  user_a_id text not null,
  user_b_id text not null,
  started_at timestamptz not null default now(),
  end_at timestamptz,
  status text not null default 'active',
  updated_at timestamptz not null default now()
);

create index if not exists secret_chat_active_rooms_status_idx
  on public.secret_chat_active_rooms (status);

create index if not exists secret_chat_active_rooms_guild_idx
  on public.secret_chat_active_rooms (guild_id);

-- Optional preset storage for the smart voice-room system.
-- Use this when you want a member's room settings to be remembered next time
-- they create a room. Active room state still lives in Upstash Redis.
create table if not exists public.smart_room_presets (
  id bigserial primary key,
  guild_id text not null,
  owner_id text not null,
  zone_id text not null default 'default',
  room_name text,
  user_limit integer check (user_limit is null or (user_limit >= 0 and user_limit <= 99)),
  locked boolean not null default false,
  hidden boolean not null default false,
  trusted_user_ids text[] not null default '{}',
  blocked_user_ids text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (guild_id, owner_id, zone_id)
);

create index if not exists smart_room_presets_owner_idx
  on public.smart_room_presets (guild_id, owner_id);

create index if not exists smart_room_presets_zone_idx
  on public.smart_room_presets (guild_id, zone_id);
