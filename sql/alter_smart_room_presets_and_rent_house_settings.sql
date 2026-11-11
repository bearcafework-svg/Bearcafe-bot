-- ===================================================
-- sql/alter_smart_room_presets_and_rent_house_settings.sql
-- 1. เพิ่ม UNIQUE constraint และคอลัมน์ permission_presets ใน smart_room_presets
-- 2. เพิ่มคอลัมน์และตั้งค่า Auto-Increment Sequence ใน rent_house_settings
-- ===================================================

-- 1. smart_room_presets
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'smart_room_presets_owner_id_zone_id_key'
  ) THEN
    ALTER TABLE public.smart_room_presets
      ADD CONSTRAINT smart_room_presets_owner_id_zone_id_key UNIQUE (owner_id, zone_id);
  END IF;
END $$;

ALTER TABLE public.smart_room_presets
  ADD COLUMN IF NOT EXISTS permission_presets JSONB DEFAULT '[]'::jsonb;

-- 2. rent_house_settings
ALTER TABLE public.rent_house_settings
  ADD COLUMN IF NOT EXISTS channel_id TEXT,
  ADD COLUMN IF NOT EXISTS owner_id TEXT,
  ADD COLUMN IF NOT EXISTS locked BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS trusted_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS blocked_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS co_owner_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS image_url TEXT,
  ADD COLUMN IF NOT EXISTS permission_presets JSONB NOT NULL DEFAULT '[]'::jsonb;

-- ตั้งค่า Sequence สำหรับ id ใน rent_house_settings ป้องกัน pkey ซ้ำกับค่าเริ่มต้น id = 1
CREATE SEQUENCE IF NOT EXISTS rent_house_settings_id_seq;
SELECT setval('rent_house_settings_id_seq', COALESCE((SELECT MAX(id) FROM public.rent_house_settings), 1));
ALTER TABLE public.rent_house_settings ALTER COLUMN id SET DEFAULT nextval('rent_house_settings_id_seq');

-- เพิ่ม UNIQUE constraint บน owner_id เพื่อรองรับการ Upsert การตั้งค่าห้องบ้านเช่า
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rent_house_settings_owner_id_key'
  ) THEN
    ALTER TABLE public.rent_house_settings
      ADD CONSTRAINT rent_house_settings_owner_id_key UNIQUE (owner_id);
  END IF;
END $$;
