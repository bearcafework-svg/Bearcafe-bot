-- ====================================================================
-- security_and_cleanup_akari.sql
-- สคริปต์ปรับปรุงความปลอดภัย เปิด RLS และล้างข้อมูลเก่าสำหรับ Akari Bot
-- รันไฟล์นี้ใน SQL Editor ของ Supabase (ฝั่ง Akari Bot)
-- ====================================================================

-- 1. 🛡️ เปิดใช้งาน Row Level Security (RLS) ทั้ง 6 ตารางเพื่อลบป้ายแดง UNRESTRICTED
ALTER TABLE public.akari_minigame_questions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_minigame_active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_minigame_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_minigame_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_minigame_settings ENABLE ROW LEVEL SECURITY;

-- 2. 🔐 จัดการสิทธิ์การเข้าถึงให้ปลอดภัย:
-- บอท Akari ใช้ SERVICE_ROLE_KEY ซึ่งจะบายพาส (Bypass) RLS เสมอ สามารถอ่าน/เขียนได้เต็มที่ 100%
-- ไม่อนุญาตให้ Anon (คนนอก) เขียนหรือแก้ข้อมูล
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon; -- (หรือ REVOKE ทั้งหมดหากไม่ต้องการให้เว็บอื่นอ่าน)
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;

-- 3. 🧹 ล้างข้อมูลคำถามเก่าใน akari_minigame_questions เพื่อเตรียมรับข้อมูลโจทย์ใหม่จากระบบ Sync
TRUNCATE TABLE public.akari_minigame_questions RESTART IDENTITY;

-- 4. 🎨 รีเซ็ตการตั้งค่าเกมเก่าใน tenant_minigame_settings ให้เป็นมาตรฐานเดียวกับ Bear Cafe
-- ปรับธีมเดิมที่เป็น 'cyber' ออก และตั้งค่าแต้มต่อข้อเป็น 3 แต้ม
UPDATE public.tenant_minigame_settings
SET canvas_theme = 'default',
    points_per_win = 3,
    updated_at = NOW();

-- แจ้งสถานะเสร็จสิ้น
SELECT 'Akari Supabase Security & Cleanup Completed Successfully!' AS status;
