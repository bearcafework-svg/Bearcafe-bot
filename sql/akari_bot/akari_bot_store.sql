-- ====================================================================
-- akari_bot_store.sql
-- ฐานข้อมูลสำหรับระบบร้านค้าแลกของรางวัล Akari Bot (Multi-Tenant)
-- รองรับการตั้งค่า 3 ไอเทม (Slot 1-3) ต่อเซิร์ฟเวอร์ Premium
-- ====================================================================

-- 1. ตารางตั้งค่าร้านค้าของกิลด์ (Store Config)
CREATE TABLE IF NOT EXISTS public.tenant_store_configs (
    guild_id VARCHAR(32) PRIMARY KEY,
    log_channel_id VARCHAR(32) DEFAULT NULL,
    currency_emoji TEXT DEFAULT '<:strawberryv2:1548976664090779650>',
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Migration สำหรับเพิ่มคอลัมน์ currency_emoji ในกรณีตารางเดิมถูกสร้างไว้แล้ว
ALTER TABLE public.tenant_store_configs ADD COLUMN IF NOT EXISTS currency_emoji TEXT DEFAULT '<:strawberryv2:1548976664090779650>';

-- 2. ตารางไอเทมร้านค้า 3 Slots ของแต่ละกิลด์ (Store Items)
CREATE TABLE IF NOT EXISTS public.tenant_store_items (
    guild_id VARCHAR(32) NOT NULL,
    slot INT NOT NULL CHECK (slot BETWEEN 1 AND 3),
    name TEXT NOT NULL DEFAULT 'ของรางวัล',
    description TEXT DEFAULT '',
    points_cost INT NOT NULL DEFAULT 100,
    wins_required INT NOT NULL DEFAULT 0,
    reward_type VARCHAR(16) NOT NULL DEFAULT 'custom', -- 'role' หรือ 'custom'
    role_id VARCHAR(32) DEFAULT NULL,
    limit_type VARCHAR(16) NOT NULL DEFAULT 'unlimited', -- 'unlimited' หรือ 'once_per_user'
    emoji TEXT DEFAULT '🎁',
    is_active BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (guild_id, slot)
);

-- 3. ตารางประวัติการแลกของรางวัลของผู้เล่น (Redemptions Log)
CREATE TABLE IF NOT EXISTS public.tenant_store_redemptions (
    id BIGSERIAL PRIMARY KEY,
    guild_id VARCHAR(32) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    slot INT NOT NULL,
    item_name TEXT NOT NULL,
    points_spent INT NOT NULL,
    wins_at_redemption INT NOT NULL DEFAULT 0,
    reward_type VARCHAR(16) NOT NULL,
    role_id VARCHAR(32) DEFAULT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes สำหรับสปีดในการตรวจสอบสิทธิ์การแลก
CREATE INDEX IF NOT EXISTS idx_tenant_store_items_guild ON public.tenant_store_items (guild_id);
CREATE INDEX IF NOT EXISTS idx_tenant_store_redemptions_user ON public.tenant_store_redemptions (guild_id, user_id, slot);

-- ปิดการใช้งาน RLS เพื่อให้ Akari Engine อ่าน/เขียนได้อย่างรวดเร็ว
ALTER TABLE public.tenant_store_configs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_store_items DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_store_redemptions DISABLE ROW LEVEL SECURITY;

-- มอบสิทธิ์อ่าน/เขียน
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
