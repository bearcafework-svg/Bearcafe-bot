-- ===================================================
-- Migration: Add voice_display_categories to tenant_configs
-- สำหรับเก็บรายชื่อ Category IDs (สูงสุด 5 หมวดหมู่) ที่อนุญาตให้ซิงค์ขึ้นแดชบอร์ด
-- ===================================================

ALTER TABLE public.tenant_configs 
ADD COLUMN IF NOT EXISTS voice_display_categories TEXT[] DEFAULT '{}'::text[];

COMMENT ON COLUMN public.tenant_configs.voice_display_categories IS 'หมวดหมู่ห้องเสียง (Category IDs สูงสุด 5 ช่อง) ที่อนุญาตให้แสดงบนหน้าเว็บสำหรับเซิร์ฟเวอร์ Premium';
