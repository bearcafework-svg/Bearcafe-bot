create table if not exists public.smart_room_presets (
  owner_id text not null,
  zone_id text not null,
  settings jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (owner_id, zone_id)
);
