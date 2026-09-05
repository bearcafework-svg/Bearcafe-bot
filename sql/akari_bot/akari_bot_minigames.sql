-- ====================================================================
-- akari_bot_minigames.sql
-- ฐานข้อมูลสำหรับ Akari Bot (Public Multi-Tenant Engine)
-- สคริปต์นี้ใช้สำหรับรันใน Supabase Project ใหม่แยกต่างหากจาก Bear Cafe
-- ====================================================================

-- 1. ตารางลงทะเบียนเซิร์ฟเวอร์ย่อย (Tenants Management)
CREATE TABLE IF NOT EXISTS public.tenant_configs (
    guild_id VARCHAR(32) PRIMARY KEY,
    guild_name TEXT,
    status VARCHAR(16) DEFAULT 'active', -- 'active', 'paused', 'expired'
    plan VARCHAR(16) DEFAULT 'standard',
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ตารางผูกช่องเล่นมินิเกมตาม Guild ID (รองรับ 12 มินิเกม)
CREATE TABLE IF NOT EXISTS public.tenant_minigame_channels (
    id BIGSERIAL PRIMARY KEY,
    guild_id VARCHAR(32) NOT NULL,
    game_id INT NOT NULL,
    channel_id VARCHAR(32) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT idx_tenant_game_channel UNIQUE (guild_id, game_id)
);

-- 3. ตารางคะแนนมินิเกม (แยกตาม guild_id และ user_id)
CREATE TABLE IF NOT EXISTS public.tenant_minigame_scores (
    guild_id VARCHAR(32) NOT NULL,
    user_id VARCHAR(32) NOT NULL,
    points INT DEFAULT 0,
    wins INT DEFAULT 0,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (guild_id, user_id)
);

-- 4. ตารางค้างสถานะมินิเกมตอนบอทดับ/รีสตาร์ต (แยกตาม guild_id และ channel_id)
CREATE TABLE IF NOT EXISTS public.tenant_minigame_active_sessions (
    guild_id VARCHAR(32) NOT NULL,
    channel_id VARCHAR(32) NOT NULL,
    game_id INT NOT NULL,
    session_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (guild_id, channel_id)
);

-- 5. ตารางตั้งค่ามินิเกมย่อยของแต่ละเซิร์ฟเวอร์ (ธีมภาพ Canvas, เปิด/ปิด, แต้ม)
CREATE TABLE IF NOT EXISTS public.tenant_minigame_settings (
    guild_id VARCHAR(32) NOT NULL,
    game_id INT NOT NULL,
    enabled BOOLEAN DEFAULT true,
    canvas_theme VARCHAR(32) DEFAULT 'cyber', -- 'cyber', 'neon', 'pastel', 'minimal', 'dark'
    points_per_win INT DEFAULT 10,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (guild_id, game_id)
);

-- ถ้าตาราง tenant_minigame_settings มีอยู่แล้ว ให้เพิ่มคอลัมน์ updated_at (หากยังไม่มี)
ALTER TABLE public.tenant_minigame_settings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT NOW();

-- Indexes เพื่อความรวดเร็วในการแสดงผล Leaderboard ของแต่ละเซิร์ฟเวอร์
CREATE INDEX IF NOT EXISTS idx_tenant_scores_leaderboard ON public.tenant_minigame_scores (guild_id, points DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_minigame_channels_guild ON public.tenant_minigame_channels (guild_id);

-- 🔓 ปิดใช้งาน Row Level Security (RLS) เพื่อให้อ่าน/เขียนข้อมูลได้แบบเรียลไทม์
ALTER TABLE public.tenant_configs DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_minigame_channels DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_minigame_scores DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_minigame_active_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_minigame_settings DISABLE ROW LEVEL SECURITY;

-- 🛡️ อนุญาตสิทธิ์อ่าน/เขียน/แก้ไข ทุกตารางให้แก่ anon, authenticated และ service_role
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;
