-- ==============================================================================
-- BEAR CAFE BOT: MIGRATION - MINIGAME LEADERBOARD AGGREGATION VIEW & RPC
-- (รันเฉพาะไฟล์นี้ใน Supabase SQL Editor เพื่ออัปเดตการประมวลผลสถิติมินิเกม)
-- ==============================================================================

-- 1. สร้าง View สรุปผลสถิติรวมมินิเกม (ประมวลผล Aggregate จาก DB)
CREATE OR REPLACE VIEW minigame_leaderboard_summary AS
SELECT 
    discord_id,
    COUNT(*)::INT AS wins,
    COALESCE(SUM(points_earned), 0)::INT AS points,
    MAX(created_at) AS last_win
FROM minigame_wins
GROUP BY discord_id
ORDER BY wins DESC, points DESC;

-- ให้สิทธิ์การอ่าน View สำหรับทุก Role
GRANT SELECT ON minigame_leaderboard_summary TO anon, authenticated, service_role;

-- 2. สร้าง RPC Function สำหรับจัดอันดับสถิติแบบกำหนดช่วงเวลา (Season 1 ชดเชย: 1 ส.ค. - 10 ก.ย. 2026)
DROP FUNCTION IF EXISTS get_minigame_leaderboard(INT, INT);
DROP FUNCTION IF EXISTS get_minigame_leaderboard(INT, INT, TIMESTAMPTZ, TIMESTAMPTZ);

CREATE OR REPLACE FUNCTION get_minigame_leaderboard(
    days_limit INT DEFAULT NULL, 
    filter_game_id INT DEFAULT NULL,
    start_time TIMESTAMPTZ DEFAULT '2026-08-01 00:00:00+07'::TIMESTAMPTZ,
    end_time TIMESTAMPTZ DEFAULT '2026-09-10 23:59:59+07'::TIMESTAMPTZ
)
RETURNS TABLE (
    discord_id TEXT,
    wins BIGINT,
    points BIGINT,
    last_win TIMESTAMPTZ
) 
LANGUAGE sql
SECURITY DEFINER
AS $$
    SELECT 
        w.discord_id,
        COUNT(*)::BIGINT AS wins,
        COALESCE(SUM(w.points_earned), 0)::BIGINT AS points,
        MAX(w.created_at) AS last_win
    FROM minigame_wins w
    WHERE (days_limit IS NULL OR w.created_at >= NOW() - (days_limit || ' days')::INTERVAL)
      AND (filter_game_id IS NULL OR w.game_id = filter_game_id)
      AND (start_time IS NULL OR w.created_at >= start_time)
      AND (end_time IS NULL OR w.created_at <= end_time)
    GROUP BY w.discord_id
    ORDER BY wins DESC, points DESC;
$$;

-- ให้สิทธิ์การรัน Function สำหรับทุก Role
GRANT EXECUTE ON FUNCTION get_minigame_leaderboard(INT, INT, TIMESTAMPTZ, TIMESTAMPTZ) TO anon, authenticated, service_role;

