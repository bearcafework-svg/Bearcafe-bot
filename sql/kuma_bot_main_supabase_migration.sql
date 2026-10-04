-- ====================================================================
-- kuma_bot_main_supabase_migration.sql
-- รวมตารางและฟังก์ชันทั้งหมดของ Kuma Bot สำหรับรันใน Supabase หลัก
-- (ใช้คลังโจทย์ร่วมกับ minigame_questions เดิมของ Bear Cafe 100%)
-- ====================================================================

-- 1. ตารางลงทะเบียนเซิร์ฟเวอร์ย่อย (Tenants Management)
CREATE TABLE IF NOT EXISTS public.tenant_configs (
    guild_id VARCHAR(32) PRIMARY KEY,
    guild_name TEXT,
    status VARCHAR(16) DEFAULT 'active', -- 'active', 'paused', 'expired'
    plan VARCHAR(16) DEFAULT 'standard', -- 'standard', 'premium'
    expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ตารางผูกช่องเล่นมินิเกมตาม Guild ID
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

-- 4. ตารางค้างสถานะมินิเกมตอนบอทรีสตาร์ต (แยกตาม guild_id และ channel_id)
CREATE TABLE IF NOT EXISTS public.tenant_minigame_active_sessions (
    guild_id VARCHAR(32) NOT NULL,
    channel_id VARCHAR(32) NOT NULL,
    game_id INT NOT NULL,
    session_data JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (guild_id, channel_id)
);

-- 5. ตารางตั้งค่ามินิเกมย่อยของแต่ละเซิร์ฟเวอร์
CREATE TABLE IF NOT EXISTS public.tenant_minigame_settings (
    guild_id VARCHAR(32) NOT NULL,
    game_id INT NOT NULL,
    enabled BOOLEAN DEFAULT true,
    canvas_theme VARCHAR(32) DEFAULT 'default',
    points_per_win INT DEFAULT 3,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (guild_id, game_id)
);

-- 6. ตารางระบบร้านค้าของแต่ละกิลด์ (Store Settings & Items)
CREATE TABLE IF NOT EXISTS public.tenant_store_configs (
    guild_id VARCHAR(32) PRIMARY KEY,
    log_channel_id VARCHAR(32) DEFAULT NULL,
    currency_emoji TEXT DEFAULT '<:strawberryv2:1548976664090779650>',
    is_enabled BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

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
    stock INT NOT NULL DEFAULT -1, -- -1 = ไม่จำกัด
    emoji TEXT DEFAULT '🎁',
    is_active BOOLEAN DEFAULT false,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (guild_id, slot)
);

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

-- 7. Indexes เพื่อประสิทธิภาพในการค้นหาและจัดอันดับ Leaderboard
CREATE INDEX IF NOT EXISTS idx_tenant_scores_leaderboard ON public.tenant_minigame_scores (guild_id, points DESC);
CREATE INDEX IF NOT EXISTS idx_tenant_minigame_channels_guild ON public.tenant_minigame_channels (guild_id);
CREATE INDEX IF NOT EXISTS idx_tenant_configs_plan ON public.tenant_configs (guild_id, plan);
CREATE INDEX IF NOT EXISTS idx_tenant_store_items_guild ON public.tenant_store_items (guild_id);
CREATE INDEX IF NOT EXISTS idx_tenant_store_redemptions_user ON public.tenant_store_redemptions (guild_id, user_id, slot);

-- 8. Atomic Score Increment RPC Function (ลด Egress และป้องกัน Race Conditions)
CREATE OR REPLACE FUNCTION public.increment_tenant_score(
  p_guild_id TEXT,
  p_user_id TEXT,
  p_points INT,
  p_wins INT
) RETURNS VOID AS $$
BEGIN
  INSERT INTO public.tenant_minigame_scores (guild_id, user_id, points, wins, updated_at)
  VALUES (p_guild_id, p_user_id, p_points, p_wins, NOW())
  ON CONFLICT (guild_id, user_id)
  DO UPDATE SET
    points = public.tenant_minigame_scores.points + EXCLUDED.points,
    wins = public.tenant_minigame_scores.wins + EXCLUDED.wins,
    updated_at = NOW();
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Row Level Security & Permissions
ALTER TABLE public.tenant_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_minigame_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_minigame_scores ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_minigame_active_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_minigame_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_store_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_store_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_store_redemptions ENABLE ROW LEVEL SECURITY;

GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_tenant_score(TEXT, TEXT, INT, INT) TO service_role, authenticated, anon;
