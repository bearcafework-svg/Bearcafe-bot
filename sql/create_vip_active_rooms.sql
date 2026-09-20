-- ===================================================
-- sql/create_vip_active_rooms.sql
-- ตารางสำหรับจัดเก็บสถานะห้อง VIP ที่กำลังเปิดใช้งาน และเวลานับถอยหลังเมื่อห้องว่าง
-- ===================================================

CREATE TABLE IF NOT EXISTS public.vip_active_rooms (
  channel_id TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  guild_id TEXT,
  channel_name TEXT,
  empty_at BIGINT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index สำหรับการค้นหาห้องที่ว่าง
CREATE INDEX IF NOT EXISTS idx_vip_active_rooms_empty_at ON public.vip_active_rooms (empty_at);

-- เปิดใช้งาน Row Level Security (RLS)
ALTER TABLE public.vip_active_rooms ENABLE ROW LEVEL SECURITY;

-- นโยบายความปลอดภัย
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'vip_active_rooms' AND policyname = 'Allow service_role full access to vip_active_rooms'
  ) THEN
    CREATE POLICY "Allow service_role full access to vip_active_rooms"
    ON public.vip_active_rooms
    FOR ALL
    TO service_role
    USING (true)
    WITH CHECK (true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE tablename = 'vip_active_rooms' AND policyname = 'Allow read access to vip_active_rooms'
  ) THEN
    CREATE POLICY "Allow read access to vip_active_rooms"
    ON public.vip_active_rooms
    FOR SELECT
    TO authenticated, anon
    USING (true);
  END IF;
END $$;
