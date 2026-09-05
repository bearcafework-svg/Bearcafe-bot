-- ============================================================================
-- SQL Schema Migration: User Bee Gacha Storage
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_bee_gacha (
    discord_id TEXT PRIMARY KEY,
    honey_dust INT NOT NULL DEFAULT 0,
    inventory JSONB NOT NULL DEFAULT '[]'::jsonb,
    equipped JSONB NOT NULL DEFAULT '{"BACKGROUND": null, "OUTFIT": null, "HAT": null, "ACCESSORY": null}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- RLS & Permissions
ALTER TABLE public.user_bee_gacha DISABLE ROW LEVEL SECURITY;
GRANT ALL ON public.user_bee_gacha TO anon, authenticated, service_role;
