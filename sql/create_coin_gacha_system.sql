-- ============================================================================
-- 🪙 ระบบหมีโยนเหรียญ (Coin Gacha System) - Database Migration
-- ============================================================================

-- 1. เพิ่มคอลัมน์สถานะรับแต้มครั้งแรกในตาราง user_points (หากยังไม่มี)
ALTER TABLE IF EXISTS public.user_points 
ADD COLUMN IF NOT EXISTS has_claimed_gacha_first_time BOOLEAN DEFAULT false;

-- 2. ตารางรายการของรางวัลในตู้สุ่มเหรียญ (gacha_coin_rewards)
CREATE TABLE IF NOT EXISTS public.gacha_coin_rewards (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,                                 -- ชื่อของรางวัลที่แสดงผลตอนสุ่มได้
    history_name TEXT NOT NULL,                         -- ชื่อของรางวัลสั้นๆ สำหรับแสดงในประวัติ
    tier VARCHAR(16) NOT NULL CHECK (tier IN ('god', 'epic', 'rare', 'common')), -- ระดับ
    reward_type VARCHAR(16) NOT NULL DEFAULT 'manual' CHECK (reward_type IN ('auto', 'manual')), -- auto (บอทแจก), manual (รับกับทีมงาน)
    role_id VARCHAR(32) DEFAULT NULL,                   -- Discord Role ID (กรณี auto + ยศ)
    points_reward INT DEFAULT 0,                        -- จำนวนแต้ม (กรณี auto + แต้ม)
    duplicate_compensation_points INT DEFAULT 300,      -- แต้มชดเชยกรณียศซ้ำ (กรณี auto + ยศ)
    is_unlimited BOOLEAN NOT NULL DEFAULT true,         -- true = ไม่จำกัด, false = มีสต็อกจำกัด
    stock INT NOT NULL DEFAULT -1,                      -- สต็อกคงเหลือ (-1 คือไม่จำกัด)
    is_active BOOLEAN NOT NULL DEFAULT true,            -- เปิดใช้งานหรือไม่
    sort_order INT NOT NULL DEFAULT 0,                  -- ลำดับการแสดงผลในหน้า Admin
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index สำหรับค้นหาตาม tier และสถานะ active
CREATE INDEX IF NOT EXISTS idx_gacha_coin_rewards_tier_active 
ON public.gacha_coin_rewards (tier, is_active);

-- 3. ตารางบันทึกประวัติการสุ่มและการรับของรางวัล (gacha_coin_rolls)
CREATE TABLE IF NOT EXISTS public.gacha_coin_rolls (
    id BIGSERIAL PRIMARY KEY,
    discord_id VARCHAR(32) NOT NULL,                    -- Discord User ID
    reward_id BIGINT REFERENCES public.gacha_coin_rewards(id) ON DELETE SET NULL,
    tier VARCHAR(16) NOT NULL,
    reward_name TEXT NOT NULL,                          -- Snapshot ชื่อของรางวัล
    history_name TEXT NOT NULL,                         -- Snapshot ชื่อสั้นในประวัติ
    reward_type VARCHAR(16) NOT NULL,                   -- 'auto' หรือ 'manual'
    is_claimed BOOLEAN NOT NULL DEFAULT false,          -- true = รับแล้ว
    claimed_at TIMESTAMPTZ DEFAULT NULL,                -- วันเวลาที่รับ
    claimed_by_admin_id VARCHAR(32) DEFAULT NULL,       -- Admin ผู้ยืนยัน (กรณี manual)
    expires_at TIMESTAMPTZ DEFAULT NULL,                -- วันหมดเขตรับ (NOW() + 1 month สำหรับ manual)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes สำหรับการดึงประวัติ และการตรวจสอบ Pending Claims
CREATE INDEX IF NOT EXISTS idx_gacha_coin_rolls_user 
ON public.gacha_coin_rolls (discord_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_gacha_coin_rolls_pending 
ON public.gacha_coin_rolls (is_claimed, reward_type) 
WHERE is_claimed = false;

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.gacha_coin_rewards ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gacha_coin_rolls ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
DO $$
BEGIN
  -- gacha_coin_rewards
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gacha_coin_rewards' AND policyname = 'Allow read active gacha coin rewards') THEN
    CREATE POLICY "Allow read active gacha coin rewards" ON public.gacha_coin_rewards FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gacha_coin_rewards' AND policyname = 'Allow manage gacha coin rewards to authenticated') THEN
    CREATE POLICY "Allow manage gacha coin rewards to authenticated" ON public.gacha_coin_rewards FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gacha_coin_rewards' AND policyname = 'Allow service_role manage gacha coin rewards') THEN
    CREATE POLICY "Allow service_role manage gacha coin rewards" ON public.gacha_coin_rewards FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  -- gacha_coin_rolls
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gacha_coin_rolls' AND policyname = 'Allow read gacha coin rolls') THEN
    CREATE POLICY "Allow read gacha coin rolls" ON public.gacha_coin_rolls FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gacha_coin_rolls' AND policyname = 'Allow manage gacha coin rolls to authenticated') THEN
    CREATE POLICY "Allow manage gacha coin rolls to authenticated" ON public.gacha_coin_rolls FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gacha_coin_rolls' AND policyname = 'Allow service_role manage gacha coin rolls') THEN
    CREATE POLICY "Allow service_role manage gacha coin rolls" ON public.gacha_coin_rolls FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  -- gacha_coin_tier_rates
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gacha_coin_tier_rates' AND policyname = 'Allow read gacha coin tier rates') THEN
    CREATE POLICY "Allow read gacha coin tier rates" ON public.gacha_coin_tier_rates FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gacha_coin_tier_rates' AND policyname = 'Allow manage gacha coin tier rates to authenticated') THEN
    CREATE POLICY "Allow manage gacha coin tier rates to authenticated" ON public.gacha_coin_tier_rates FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'gacha_coin_tier_rates' AND policyname = 'Allow service_role manage gacha coin tier rates') THEN
    CREATE POLICY "Allow service_role manage gacha coin tier rates" ON public.gacha_coin_tier_rates FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 6. ตารางตั้งค่าอัตราสุ่มของแต่ละระดับ (gacha_coin_tier_rates)
CREATE TABLE IF NOT EXISTS public.gacha_coin_tier_rates (
    tier VARCHAR(16) PRIMARY KEY CHECK (tier IN ('god', 'epic', 'rare', 'common')),
    rate_percent NUMERIC(7, 4) NOT NULL DEFAULT 0.0000,
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO public.gacha_coin_tier_rates (tier, rate_percent) VALUES
    ('god', 0.0700),
    ('epic', 1.0000),
    ('rare', 45.0000),
    ('common', 53.9300)
ON CONFLICT (tier) DO NOTHING;

-- 7. Atomic RPC Function สำหรับการโยนเหรียญสุ่มรางวัล (fn_roll_coin_gacha)
CREATE OR REPLACE FUNCTION public.fn_roll_coin_gacha(p_discord_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_coins INT;
    v_roll_chance NUMERIC;
    v_target_tier VARCHAR(16);
    v_reward RECORD;
    v_expires_at TIMESTAMPTZ := NULL;
    v_is_claimed BOOLEAN := false;
    v_claimed_at TIMESTAMPTZ := NULL;
    v_roll_id BIGINT;
    v_tier_list TEXT[] := ARRAY['god', 'epic', 'rare', 'common'];
    v_tier_idx INT;
    v_god_rate NUMERIC;
    v_epic_rate NUMERIC;
    v_rare_rate NUMERIC;
    v_god_threshold NUMERIC;
    v_epic_threshold NUMERIC;
    v_rare_threshold NUMERIC;
BEGIN
    -- 1. ตรวจสอบเหรียญของผู้ใช้
    SELECT COALESCE(gacha_coins, 0) INTO v_user_coins
    FROM public.user_points
    WHERE discord_id = p_discord_id
    FOR UPDATE;

    IF v_user_coins IS NULL OR v_user_coins < 1 THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INSUFFICIENT_COINS',
            'message', 'เหรียญกาชาของคุณไม่เพียงพอ',
            'remaining_coins', COALESCE(v_user_coins, 0)
        );
    END IF;

    -- 2. ดึงอัตราสุ่มจากตาราง gacha_coin_tier_rates (ถ้าไม่มีหรือเป็น NULL ให้ fallback เป็นค่าเริ่มต้น)
    SELECT COALESCE(rate_percent, 0.07) INTO v_god_rate
    FROM public.gacha_coin_tier_rates WHERE tier = 'god';
    IF v_god_rate IS NULL THEN v_god_rate := 0.07; END IF;

    SELECT COALESCE(rate_percent, 1.00) INTO v_epic_rate
    FROM public.gacha_coin_tier_rates WHERE tier = 'epic';
    IF v_epic_rate IS NULL THEN v_epic_rate := 1.00; END IF;

    SELECT COALESCE(rate_percent, 45.00) INTO v_rare_rate
    FROM public.gacha_coin_tier_rates WHERE tier = 'rare';
    IF v_rare_rate IS NULL THEN v_rare_rate := 45.00; END IF;

    -- คำนวณขอบเขตโอกาสสุ่ม (Thresholds: 0.0 - 1.0)
    v_god_threshold := (v_god_rate / 100.0);
    v_epic_threshold := v_god_threshold + (v_epic_rate / 100.0);
    v_rare_threshold := v_epic_threshold + (v_rare_rate / 100.0);

    v_roll_chance := random();

    IF v_roll_chance < v_god_threshold THEN
        v_target_tier := 'god';
        v_tier_idx := 1;
    ELSIF v_roll_chance < v_epic_threshold THEN
        v_target_tier := 'epic';
        v_tier_idx := 2;
    ELSIF v_roll_chance < v_rare_threshold THEN
        v_target_tier := 'rare';
        v_tier_idx := 3;
    ELSE
        v_target_tier := 'common';
        v_tier_idx := 4;
    END IF;

    -- 3. ค้นหาของรางวัลใน Tier (ถ้าหมด ให้ Cascade ลดหลั่นลงไปหา Tier ล่างถัดไป)
    WHILE v_tier_idx <= 4 LOOP
        SELECT * INTO v_reward
        FROM public.gacha_coin_rewards
        WHERE tier = v_tier_list[v_tier_idx]
          AND is_active = true
          AND (is_unlimited = true OR stock > 0)
        ORDER BY random()
        LIMIT 1
        FOR UPDATE;

        IF v_reward.id IS NOT NULL THEN
            EXIT; -- พบของรางวัลที่มีสต็อก
        END IF;

        -- หากไม่มีของใน Tier นี้ เลื่อนไปหา Tier ล่างถัดไป
        v_tier_idx := v_tier_idx + 1;
    END LOOP;

    -- หากไม่มีของรางวัลชิ้นใดเปิดอยู่เลยในทั้งระบบ
    IF v_reward.id IS NULL THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'NO_ACTIVE_REWARDS',
            'message', 'ขณะนี้ไม่มีของรางวัลที่พร้อมสุ่มในตู้ กรุณาติดต่อแอดมิน',
            'remaining_coins', v_user_coins
        );
    END IF;

    -- 4. หักเหรียญ 1 เหรียญทันที
    UPDATE public.user_points
    SET gacha_coins = gacha_coins - 1,
        updated_at = NOW()
    WHERE discord_id = p_discord_id;

    v_user_coins := v_user_coins - 1;

    -- 5. หากเป็นของจำกัดสต็อก ให้หักสต็อก 1 ชิ้น
    IF NOT v_reward.is_unlimited THEN
        UPDATE public.gacha_coin_rewards
        SET stock = GREATEST(stock - 1, 0),
            updated_at = NOW()
        WHERE id = v_reward.id;
    END IF;

    -- 6. กำหนดสถานะการรับของรางวัล
    IF v_reward.reward_type = 'auto' THEN
        v_is_claimed := true;
        v_claimed_at := NOW();
        v_expires_at := NULL;
    ELSE
        v_is_claimed := false;
        v_claimed_at := NULL;
        v_expires_at := NOW() + INTERVAL '1 month';
    END IF;

    -- 7. บันทึกผลการสุ่มลง gacha_coin_rolls
    INSERT INTO public.gacha_coin_rolls (
        discord_id,
        reward_id,
        tier,
        reward_name,
        history_name,
        reward_type,
        is_claimed,
        claimed_at,
        expires_at,
        created_at
    ) VALUES (
        p_discord_id,
        v_reward.id,
        v_reward.tier,
        v_reward.name,
        v_reward.history_name,
        v_reward.reward_type,
        v_is_claimed,
        v_claimed_at,
        v_expires_at,
        NOW()
    ) RETURNING id INTO v_roll_id;

    -- 8. ส่งข้อมูลผลลัพธ์กลับ
    RETURN jsonb_build_object(
        'success', true,
        'roll_id', v_roll_id,
        'reward_id', v_reward.id,
        'reward_name', v_reward.name,
        'history_name', v_reward.history_name,
        'tier', v_reward.tier,
        'reward_type', v_reward.reward_type,
        'role_id', v_reward.role_id,
        'points_reward', v_reward.points_reward,
        'duplicate_compensation_points', COALESCE(v_reward.duplicate_compensation_points, 300),
        'is_claimed', v_is_claimed,
        'expires_at', v_expires_at,
        'remaining_coins', v_user_coins
    );
END;
$$;
