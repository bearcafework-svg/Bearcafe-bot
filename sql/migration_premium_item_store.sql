-- ====================================================================
-- sql/migration_premium_item_store.sql
-- Migration สำหรับฟีเจอร์พรีเมียมของระบบร้านค้าไอเทม (Kuma Bot)
-- 1. เงื่อนไขการแลกขั้นสูง (สถิติชนะขั้นต่ำ + ยศที่ต้องมี)
-- 2. แบนเนอร์หน้าร้านค้า
-- 3. ระบบส่วนลดแต้มร้านค้าตามยศ
-- ====================================================================

-- 1. เพิ่มคอลัมน์เงื่อนไขขั้นสูงในตารางไอเทม V2
ALTER TABLE public.tenant_store_items_v2 ADD COLUMN IF NOT EXISTS wins_required INT NOT NULL DEFAULT 0;
ALTER TABLE public.tenant_store_items_v2 ADD COLUMN IF NOT EXISTS required_role_id VARCHAR(32) DEFAULT NULL;

-- 2. เพิ่มคอลัมน์แบนเนอร์และส่วนลดยศในตารางตั้งค่าร้านค้า
ALTER TABLE public.tenant_store_configs ADD COLUMN IF NOT EXISTS banner_url TEXT DEFAULT NULL;
ALTER TABLE public.tenant_store_configs ADD COLUMN IF NOT EXISTS role_discounts JSONB DEFAULT '[]'::jsonb;
