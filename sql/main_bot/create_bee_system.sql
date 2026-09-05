-- ============================================================================
-- SQL Schema Migration: Bee System (ระบบเจ้าผึ้ง)
-- ============================================================================

-- 1. Create table for system-wide settings
CREATE TABLE IF NOT EXISTS public.bee_system_settings (
  id INT PRIMARY KEY DEFAULT 1,
  channel_id TEXT NOT NULL DEFAULT '1524123413122125964',
  auto_spawn_enabled BOOLEAN NOT NULL DEFAULT true,
  min_spawn_minutes INT NOT NULL DEFAULT 5,
  max_spawn_minutes INT NOT NULL DEFAULT 10,
  spawn_mode TEXT NOT NULL DEFAULT 'weighted_random',
  garden_background_url TEXT NOT NULL DEFAULT 'https://cdn.discordapp.com/attachments/1528780402544611348/1528780439836430487/Garden.png',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  CONSTRAINT single_row_check CHECK (id = 1)
);

-- Insert default system settings row if not exists
INSERT INTO public.bee_system_settings (id, channel_id, auto_spawn_enabled, min_spawn_minutes, max_spawn_minutes, spawn_mode, garden_background_url)
VALUES (1, '1524123413122125964', true, 5, 10, 'weighted_random', 'https://cdn.discordapp.com/attachments/1528780402544611348/1528780439836430487/Garden.png')
ON CONFLICT (id) DO NOTHING;

-- RLS Policies for bee_system_settings (Fix 403 Forbidden Error)
ALTER TABLE public.bee_system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Read/Write Access on bee_system_settings" ON public.bee_system_settings;
CREATE POLICY "Public Read/Write Access on bee_system_settings"
ON public.bee_system_settings FOR ALL
TO public, anon, authenticated, service_role
USING (true)
WITH CHECK (true);

-- 2. Create table for individual bee configurations
CREATE TABLE IF NOT EXISTS public.bee_configs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  spawn_weight INT NOT NULL DEFAULT 1,
  sequence_order INT NOT NULL DEFAULT 1,
  win_rate DOUBLE PRECISION NOT NULL DEFAULT 0.5,
  min_win_points INT NOT NULL DEFAULT 15,
  max_win_points INT NOT NULL DEFAULT 50,
  min_loss_points INT NOT NULL DEFAULT 15,
  max_loss_points INT NOT NULL DEFAULT 50,
  poison_loss_points INT NOT NULL DEFAULT 150,
  button_delay_ms INT NOT NULL DEFAULT 5000,
  spawn_image_url TEXT,
  win_image_url TEXT,
  lose_image_url TEXT,
  poison_image_url TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default bee: fat_round_bee (เจ้าผึ้งอ้วนตัวกลม)
INSERT INTO public.bee_configs (
  id, name, enabled, spawn_weight, sequence_order, win_rate,
  min_win_points, max_win_points, min_loss_points, max_loss_points,
  poison_loss_points, button_delay_ms, spawn_image_url, win_image_url, lose_image_url, poison_image_url
)
VALUES (
  'fat_round_bee', 'เจ้าผึ้งอ้วนตัวกลม', true, 1, 1, 0.5,
  15, 50, 15, 50,
  150, 5000,
  'https://cdn.discordapp.com/attachments/1528780402544611348/1528780439836430487/Garden.png',
  'https://cdn.discordapp.com/attachments/1528780402544611348/1528780439836430487/Garden.png',
  'https://cdn.discordapp.com/attachments/1528780402544611348/1528780439836430487/Garden.png',
  'https://cdn.discordapp.com/attachments/1528780402544611348/1528780439836430487/Garden.png'
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  enabled = EXCLUDED.enabled;

-- RLS Policies for bee_configs (Fix 403 Forbidden Error)
ALTER TABLE public.bee_configs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Public Read/Write Access on bee_configs" ON public.bee_configs;
CREATE POLICY "Public Read/Write Access on bee_configs"
ON public.bee_configs FOR ALL
TO public, anon, authenticated, service_role
USING (true)
WITH CHECK (true);

-- 3. Create Storage Bucket for bee-assets
INSERT INTO storage.buckets (id, name, public)
VALUES ('bee-assets', 'bee-assets', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage RLS Policies
DROP POLICY IF EXISTS "Public Read Access for bee-assets" ON storage.objects;
CREATE POLICY "Public Read Access for bee-assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'bee-assets');

DROP POLICY IF EXISTS "Public Upload Access for bee-assets" ON storage.objects;
CREATE POLICY "Public Upload Access for bee-assets"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'bee-assets');

DROP POLICY IF EXISTS "Public Update Access for bee-assets" ON storage.objects;
CREATE POLICY "Public Update Access for bee-assets"
ON storage.objects FOR UPDATE
USING (bucket_id = 'bee-assets');

DROP POLICY IF EXISTS "Public Delete Access for bee-assets" ON storage.objects;
CREATE POLICY "Public Delete Access for bee-assets"
ON storage.objects FOR DELETE
USING (bucket_id = 'bee-assets');
