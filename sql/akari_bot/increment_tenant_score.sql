-- ====================================================================
-- sql/akari_bot/increment_tenant_score.sql
-- Atomic Score Increment RPC for Akari Minigames (Multi-Tenant)
-- ลด Supabase Egress ลง 50% และป้องกัน Concurrency Race Conditions
-- ====================================================================

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

-- มอบสิทธิ์ให้ทั้ง anon และ service_role สามารถเรียกใช้ RPC นี้ได้
GRANT EXECUTE ON FUNCTION public.increment_tenant_score(TEXT, TEXT, INT, INT) TO anon;
GRANT EXECUTE ON FUNCTION public.increment_tenant_score(TEXT, TEXT, INT, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.increment_tenant_score(TEXT, TEXT, INT, INT) TO service_role;
