-- ============================================================================
-- SQL Schema Migration: Loy Krathong System (ระบบลอยกระทงฝากข้อความ)
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.loy_krathong_messages (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    sender_id TEXT NOT NULL,
    receiver_id TEXT NOT NULL,
    message TEXT NOT NULL,
    reward_given BOOLEAN NOT NULL DEFAULT false,
    channel_id TEXT NOT NULL DEFAULT '1573996427292708884',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_loy_krathong_sender ON public.loy_krathong_messages (sender_id);
CREATE INDEX IF NOT EXISTS idx_loy_krathong_receiver ON public.loy_krathong_messages (receiver_id);

ALTER TABLE public.loy_krathong_messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow service_role full access to loy_krathong_messages" ON public.loy_krathong_messages;
CREATE POLICY "Allow service_role full access to loy_krathong_messages"
ON public.loy_krathong_messages FOR ALL
TO public, anon, authenticated, service_role
USING (true)
WITH CHECK (true);
