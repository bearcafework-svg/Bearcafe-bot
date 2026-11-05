-- ====================================================================
-- add_minigame_penalty_config_to_tenant_configs.sql
-- เพิ่มคอลัมน์ตั้งค่าคูลดาวน์เมื่อตอบผิด และเทมเพลตข้อความหักแต้มใน tenant_configs
-- ====================================================================

ALTER TABLE public.tenant_configs 
ADD COLUMN IF NOT EXISTS minigame_wrong_cooldown VARCHAR(16) DEFAULT '10s',
ADD COLUMN IF NOT EXISTS minigame_penalty_template TEXT DEFAULT '## <:68440x:1358584606911369226> {user} ตอบไม่ถูก โดนหัก {emoji} **{point}** ติดคูลดาวน์ {cooldown}';

