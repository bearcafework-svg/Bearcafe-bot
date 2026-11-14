-- ====================================================================
-- sql/add_rent_house_channel_id_unique.sql
-- เพิ่ม UNIQUE constraint ให้กับ channel_id ในตาราง rent_house_settings
-- เพื่อรองรับการ Upsert และป้องกันข้อมูลห้องบ้านเช่าซ้ำซ้อน
-- ====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'rent_house_settings_channel_id_key'
  ) THEN
    ALTER TABLE public.rent_house_settings
      ADD CONSTRAINT rent_house_settings_channel_id_key UNIQUE (channel_id);
  END IF;
END $$;

