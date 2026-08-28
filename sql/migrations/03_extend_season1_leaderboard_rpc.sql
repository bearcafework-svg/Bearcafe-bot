-- ==============================================================================
-- BEAR CAFE BOT: MIGRATION 03 - EXTEND SEASON 1 MINIGAME LEADERBOARD (COMPENSATION)
-- (รันใน Supabase SQL Editor เพื่ออัปเดตการกรองคะแนนช่วงชดเชย 1 ส.ค. - 10 ก.ย. 2026)
-- ==============================================================================

-- ลบ Function เดิมออกก่อนเพื่อป้องกัน Parameter Signature Conflict
DROP FUNCTION IF EXISTS get_minigame_leaderboard(INT, INT);
DROP FUNCTION IF EXISTS get_minigame_leaderboard(INT, INT, TIMESTAMPTZ, TIMESTAMPTZ);

-- สร้าง RPC Function สำหรับจัดอันดับสถิติมินิเกม พร้อมรองรับ Date Range (Season 1 ชดเชย: 1 ส.ค. - 10 ก.ย. 2026)
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
