-- ====================================================================
-- cleanup_orphan_tenant_data.sql
-- สคริปต์ SQL สำหรับทำความสะอาดขยะข้อมูลที่ตกค้างใน Supabase (Orphaned Data Cleanup)
-- ใช้สำหรับรันใน Supabase SQL Editor เพื่อลบข้อมูลการตั้งค่าและเซสชันของช่องที่ถูกลบไปแล้ว
-- ====================================================================

-- 1. ลบข้อมูลตั้งค่ามินิเกม (tenant_minigame_settings) ที่ไม่มีช่องมินิเกมหลงเหลือใน Discord/DB แล้ว
DELETE FROM public.tenant_minigame_settings s
WHERE NOT EXISTS (
    SELECT 1 FROM public.tenant_minigame_channels c
    WHERE c.guild_id = s.guild_id AND c.game_id = s.game_id
);

-- 2. ลบข้อมูลเซสชันมินิเกมที่ค้างอยู่ (tenant_minigame_active_sessions) ที่ช่องถูกลบไปแล้ว
DELETE FROM public.tenant_minigame_active_sessions a
WHERE NOT EXISTS (
    SELECT 1 FROM public.tenant_minigame_channels c
    WHERE c.guild_id = a.guild_id AND c.channel_id = a.channel_id
);

-- 3. (Optional) แสดงจำนวนรายการตั้งค่ามินิเกมปัจจุบันในตาราง
SELECT guild_id, game_id, enabled, updated_at FROM public.tenant_minigame_settings;
