create table if not exists public.smart_room_presets (
  id bigserial not null,
  guild_id text not null,
  owner_id text not null,
  zone_id text not null default 'default'::text,
  room_name text null,
  user_limit integer null,
  locked boolean not null default false,
  hidden boolean not null default false,
  trusted_user_ids text[] not null default '{}'::text[],
  blocked_user_ids text[] not null default '{}'::text[],
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  constraint smart_room_presets_pkey primary key (id),
  constraint smart_room_presets_guild_id_owner_id_zone_id_key unique (guild_id, owner_id, zone_id),
  constraint smart_room_presets_user_limit_check check (
    user_limit is null or (user_limit >= 0 and user_limit <= 99)
  )
);

create index if not exists smart_room_presets_owner_idx
  on public.smart_room_presets using btree (guild_id, owner_id);

create index if not exists smart_room_presets_zone_idx
  on public.smart_room_presets using btree (guild_id, zone_id);
