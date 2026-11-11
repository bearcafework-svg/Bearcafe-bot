-- ===================================================
-- sql/alter_vip_active_rooms_add_missing_columns.sql
-- เพิ่มคอลัมน์ที่ขาดหายในตาราง vip_active_rooms เพื่อรองรับการนับถอยหลังและการกู้คืนห้อง VIP
-- ===================================================

ALTER TABLE public.vip_active_rooms 
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS guild_id TEXT,
  ADD COLUMN IF NOT EXISTS channel_name TEXT;

-- ปลด NOT NULL constraint บน expires_at (ถ้ามี) เพื่อให้ห้องที่ยังไม่หมดอายุสามารถบันทึกได้
ALTER TABLE public.vip_active_rooms 
  ALTER COLUMN expires_at DROP NOT NULL;
