-- sql/migrations/11_permission_presets_and_archive.sql
-- 1. เพิ่มคอลัมน์ permission_presets ใน smart_room_presets และ rent_house_settings
ALTER TABLE public.smart_room_presets 
ADD COLUMN IF NOT EXISTS permission_presets JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.rent_house_settings 
ADD COLUMN IF NOT EXISTS permission_presets JSONB NOT NULL DEFAULT '[]'::jsonb;

-- 2. สร้างตารางเก็บข้อมูลบ้านเช่าที่ถูกลบชั่วคราว 30 วัน (archived_rent_house_settings)
CREATE TABLE IF NOT EXISTS public.archived_rent_house_settings (
  id BIGSERIAL PRIMARY KEY,
  channel_id TEXT NOT NULL,
  owner_id TEXT NOT NULL,
  settings JSONB NOT NULL DEFAULT '{}'::jsonb,
  archived_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_archived_rent_house_owner ON public.archived_rent_house_settings(owner_id, archived_at DESC);

ALTER TABLE public.archived_rent_house_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to archived_rent_house_settings" ON public.archived_rent_house_settings;
CREATE POLICY "Allow service_role full access to archived_rent_house_settings"
  ON public.archived_rent_house_settings FOR ALL USING (true) WITH CHECK (true);

-- 3. ตัดทอน trusted_user_ids ที่เกิน 8 คนสำหรับ VIP ทั่วไป
UPDATE public.smart_room_presets
SET trusted_user_ids = trusted_user_ids[1:8]
WHERE zone_id = 'vip' AND cardinality(trusted_user_ids) > 8;
