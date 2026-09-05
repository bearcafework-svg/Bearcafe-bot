create table if not exists public.smart_room_presets (
  id bigserial not null,
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
  constraint smart_room_presets_owner_id_zone_id_key unique (owner_id, zone_id),
  constraint smart_room_presets_user_limit_check check (
    user_limit is null or (user_limit >= 0 and user_limit <= 99)
  )
);

alter table public.smart_room_presets
  drop constraint if exists smart_room_presets_guild_id_owner_id_zone_id_key;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'smart_room_presets_owner_id_zone_id_key'
  ) then
    alter table public.smart_room_presets
      add constraint smart_room_presets_owner_id_zone_id_key unique (owner_id, zone_id);
  end if;
end $$;

alter table public.smart_room_presets
  drop column if exists guild_id;

create index if not exists smart_room_presets_owner_idx
  on public.smart_room_presets using btree (owner_id);

create index if not exists smart_room_presets_zone_idx
  on public.smart_room_presets using btree (zone_id);
