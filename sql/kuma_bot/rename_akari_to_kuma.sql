-- ==============================================================================
-- Kuma Bot Migration: Rename Legacy Akari Tables & Sync Columns
-- File: sql/kuma_bot/rename_akari_to_kuma.sql
-- Description:
--   1. ปรับเปลี่ยนชื่อตาราง akari_minigame_questions เป็น kuma_minigame_questions
--   2. สร้าง VIEW akari_minigame_questions เพื่อรองรับ Backward Compatibility
--   3. เพิ่มคอลัมน์ has_kuma_bot ในตาราง discord_servers และซิงค์ค่าเดิมจาก has_akari_bot
--   4. เพิ่มคอลัมน์ banner_url และ role_discounts ใน tenant_store_configs
-- ==============================================================================

-- 1. เปลี่ยนชื่อตาราง akari_minigame_questions เป็น kuma_minigame_questions
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'akari_minigame_questions'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' AND table_name = 'kuma_minigame_questions'
  ) THEN
    ALTER TABLE public.akari_minigame_questions RENAME TO kuma_minigame_questions;
    RAISE NOTICE 'Renamed akari_minigame_questions to kuma_minigame_questions';
  END IF;
END $$;

-- 2. อัปเดตชื่อ Index สำหรับตารางคำถาม
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' AND indexname = 'idx_akari_questions_game'
  ) THEN
    ALTER INDEX public.idx_akari_questions_game RENAME TO idx_kuma_questions_game;
  END IF;

  IF EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE schemaname = 'public' AND indexname = 'idx_akari_questions_category'
  ) THEN
    ALTER INDEX public.idx_akari_questions_category RENAME TO idx_kuma_questions_category;
  END IF;
END $$;

-- 3. สร้าง VIEW akari_minigame_questions สำหรับ Backward Compatibility
-- (เผื่อระบบหรือสคริปต์เก่าที่ยังเรียก akari_minigame_questions จะยังสามารถ Select/Insert/Update ได้ปกติ)
CREATE OR REPLACE VIEW public.akari_minigame_questions AS
SELECT * FROM public.kuma_minigame_questions;

-- 4. มอบสิทธิ์การเข้าถึงให้ anon, authenticated, service_role
GRANT ALL ON public.kuma_minigame_questions TO anon, authenticated, service_role;
GRANT ALL ON public.akari_minigame_questions TO anon, authenticated, service_role;

-- 5. เพิ่มคอลัมน์ has_kuma_bot ลงในตาราง discord_servers
ALTER TABLE IF EXISTS public.discord_servers
ADD COLUMN IF NOT EXISTS has_kuma_bot boolean DEFAULT false;

-- คัดลอกค่าเดิมจาก has_akari_bot ไปยัง has_kuma_bot
UPDATE public.discord_servers
SET has_kuma_bot = has_akari_bot
WHERE has_akari_bot IS NOT NULL AND has_kuma_bot IS DISTINCT FROM has_akari_bot;

-- 6. เพิ่มคอลัมน์ banner_url และ role_discounts สำหรับระบบร้านค้า (/open market)
ALTER TABLE IF EXISTS public.tenant_store_configs
ADD COLUMN IF NOT EXISTS banner_url text,
ADD COLUMN IF NOT EXISTS role_discounts jsonb DEFAULT '[]'::jsonb;

COMMENT ON TABLE public.kuma_minigame_questions IS 'คลังคำถามมินิเกมของบอทคุมะ (Kuma Multi-Tenant Bot)';
COMMENT ON COLUMN public.discord_servers.has_kuma_bot IS 'สถานะว่ามีบอทคุมะอยู่ในเซิร์ฟเวอร์หรือไม่';
