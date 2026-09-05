-- sql/flower_sessions.sql
-- ตารางเก็บสถานะการมอบดอกไม้เพื่อรองรับการ restart บอท

CREATE TABLE IF NOT EXISTS public.flower_sessions (
  id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  message_id TEXT NOT NULL,
  sender_id TEXT NOT NULL,
  target_id TEXT NOT NULL,
  flower_key TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- RLS (Row Level Security)
ALTER TABLE public.flower_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public Read/Write Access on flower_sessions" ON public.flower_sessions;
DROP POLICY IF EXISTS "Allow public read access to flower_sessions" ON public.flower_sessions;
DROP POLICY IF EXISTS "Allow service_role full access to flower_sessions" ON public.flower_sessions;

CREATE POLICY "Public Read/Write Access on flower_sessions"
  ON public.flower_sessions FOR ALL
  TO public, anon, authenticated, service_role
  USING (true)
  WITH CHECK (true);
