-- Migration: Fix RLS policies for discord_servers so server owners can update (bump, edit invite/vibe) and delete their servers
-- Applied date: 2026-10-23

DROP POLICY IF EXISTS "Server owners can update own servers" ON public.discord_servers;
CREATE POLICY "Server owners can update own servers" ON public.discord_servers
  FOR UPDATE TO authenticated
  USING (
    public.is_admin_or_owner()
    OR public.has_page_access('discord-servers')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid() OR p.id = public.get_current_profile_id())
        AND p.discord_id = discord_servers.owner_id
    )
    OR owner_id = COALESCE(
      auth.jwt() -> 'user_metadata' ->> 'provider_id',
      auth.jwt() -> 'user_metadata' ->> 'discord_id',
      auth.jwt() -> 'user_metadata' ->> 'sub'
    )
  )
  WITH CHECK (
    public.is_admin_or_owner()
    OR public.has_page_access('discord-servers')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid() OR p.id = public.get_current_profile_id())
        AND p.discord_id = discord_servers.owner_id
    )
    OR owner_id = COALESCE(
      auth.jwt() -> 'user_metadata' ->> 'provider_id',
      auth.jwt() -> 'user_metadata' ->> 'discord_id',
      auth.jwt() -> 'user_metadata' ->> 'sub'
    )
  );

DROP POLICY IF EXISTS "Server owners can delete own servers" ON public.discord_servers;
CREATE POLICY "Server owners can delete own servers" ON public.discord_servers
  FOR DELETE TO authenticated
  USING (
    public.is_admin_or_owner()
    OR public.has_page_access('discord-servers')
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE (p.id = auth.uid() OR p.id = public.get_current_profile_id())
        AND p.discord_id = discord_servers.owner_id
    )
    OR owner_id = COALESCE(
      auth.jwt() -> 'user_metadata' ->> 'provider_id',
      auth.jwt() -> 'user_metadata' ->> 'discord_id',
      auth.jwt() -> 'user_metadata' ->> 'sub'
    )
  );
