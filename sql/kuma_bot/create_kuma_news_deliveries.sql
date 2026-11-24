-- ========================================================
-- sql/kuma_bot/create_kuma_news_deliveries.sql
-- บันทึกประวัติการส่งบรอดแคสต์ข่าวสารของ Kuma Bot เพื่อกันส่งซ้ำ
-- ========================================================

CREATE TABLE IF NOT EXISTS public.kuma_news_deliveries (
  id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  campaign_key TEXT NOT NULL,
  guild_id TEXT NOT NULL,
  guild_name TEXT,
  owner_id TEXT,
  channel_id TEXT NOT NULL,
  channel_name TEXT,
  sent_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT unique_kuma_news_campaign_guild UNIQUE (campaign_key, guild_id)
);

CREATE INDEX IF NOT EXISTS idx_kuma_news_campaign_guild 
  ON public.kuma_news_deliveries (campaign_key, guild_id);

COMMENT ON TABLE public.kuma_news_deliveries IS 'ตารางบันทึกสถานะการส่งข่าวสาร/อัปเดตของ Kuma Bot ไปยังเซิร์ฟเวอร์ย่อย เพื่อป้องกันการส่งซ้ำ';
