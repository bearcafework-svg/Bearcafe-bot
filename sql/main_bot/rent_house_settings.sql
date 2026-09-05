-- sql/rent_house_settings.sql
-- ตารางเก็บตั้งค่าห้องบ้านเช่าสำหรับเซิร์ฟเวอร์ Bearcafe

CREATE TABLE IF NOT EXISTS public.rent_house_settings (
  channel_id TEXT NOT NULL PRIMARY KEY,
  owner_id TEXT NOT NULL,
  password TEXT NULL,
  locked BOOLEAN NOT NULL DEFAULT false,
  hidden BOOLEAN NOT NULL DEFAULT false,
  trusted_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  blocked_user_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  co_owner_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- RLS (Row Level Security)
ALTER TABLE public.rent_house_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to rent_house_settings"
  ON public.rent_house_settings FOR SELECT USING (true);

CREATE POLICY "Allow service_role full access to rent_house_settings"
  ON public.rent_house_settings FOR ALL USING (true) WITH CHECK (true);
