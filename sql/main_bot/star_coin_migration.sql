-- ==============================================================================
-- BEAR CAFE BOT: STAR COIN (GACHA COIN) SYSTEM
-- ==============================================================================

-- 1. เพิ่มคอลัมน์ gacha_coins ใน user_points
ALTER TABLE user_points 
ADD COLUMN IF NOT EXISTS gacha_coins INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS daily_gacha_coins INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS last_gacha_coin_reset TEXT DEFAULT '';

-- 2. ฟังก์ชัน Atomic add_gacha_coins สำหรับการเพิ่มเหรียญกาชาพร้อมเช็ก Daily Cap
CREATE OR REPLACE FUNCTION add_gacha_coins(
    p_user_id TEXT,
    p_amount INT,
    p_daily_cap INT DEFAULT 15,
    p_today_date TEXT DEFAULT TO_CHAR(NOW() AT TIME ZONE 'Asia/Bangkok', 'YYYY-MM-DD')
)
RETURNS TABLE (
    success BOOLEAN,
    coins_added INT,
    total_coins INT,
    daily_coins INT,
    reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_coins INT := 0;
    v_daily_coins INT := 0;
    v_last_reset TEXT := '';
    v_actual_add INT := 0;
BEGIN
    SELECT 
        COALESCE(gacha_coins, 0),
        COALESCE(daily_gacha_coins, 0),
        COALESCE(last_gacha_coin_reset, '')
    INTO 
        v_current_coins,
        v_daily_coins,
        v_last_reset
    FROM user_points
    WHERE discord_id = p_user_id
    FOR UPDATE;

    IF NOT FOUND THEN
        v_actual_add := LEAST(p_amount, p_daily_cap);
        INSERT INTO user_points (
            discord_id,
            points,
            max_cap,
            gacha_coins,
            daily_gacha_coins,
            last_gacha_coin_reset,
            updated_at
        ) VALUES (
            p_user_id,
            0,
            750,
            v_actual_add,
            v_actual_add,
            p_today_date,
            NOW()
        );

        RETURN QUERY SELECT TRUE, v_actual_add, v_actual_add, v_actual_add, 'success'::TEXT;
        RETURN;
    END IF;

    IF v_last_reset IS NULL OR v_last_reset <> p_today_date THEN
        v_daily_coins := 0;
        v_last_reset := p_today_date;
    END IF;

    IF v_daily_coins >= p_daily_cap THEN
        RETURN QUERY SELECT FALSE, 0, v_current_coins, v_daily_coins, 'daily_cap_reached'::TEXT;
        RETURN;
    END IF;

    v_actual_add := LEAST(p_amount, p_daily_cap - v_daily_coins);

    IF v_actual_add <= 0 THEN
        RETURN QUERY SELECT FALSE, 0, v_current_coins, v_daily_coins, 'daily_cap_reached'::TEXT;
        RETURN;
    END IF;

    v_current_coins := v_current_coins + v_actual_add;
    v_daily_coins := v_daily_coins + v_actual_add;

    UPDATE user_points
    SET 
        gacha_coins = v_current_coins,
        daily_gacha_coins = v_daily_coins,
        last_gacha_coin_reset = v_last_reset,
        updated_at = NOW()
    WHERE discord_id = p_user_id;

    RETURN QUERY SELECT TRUE, v_actual_add, v_current_coins, v_daily_coins, 'success'::TEXT;
END;
$$;

GRANT EXECUTE ON FUNCTION add_gacha_coins(TEXT, INT, INT, TEXT) TO anon, authenticated, service_role;
