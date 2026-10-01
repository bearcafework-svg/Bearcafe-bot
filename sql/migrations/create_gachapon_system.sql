-- ============================================================================
-- 🎰 Bear Cafe Gachapon System Database Migration & Seed
-- ============================================================================

-- 1. ตารางคลังของรางวัลในตู้กาชาปอง (gacha_items)
CREATE TABLE IF NOT EXISTS gacha_items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    category TEXT NOT NULL CHECK (category IN ('points', 'rent_house', 'color_role', 'special_role')),
    rarity TEXT NOT NULL DEFAULT 'COMMON' CHECK (rarity IN ('COMMON', 'RARE', 'EPIC', 'LEGENDARY')),
    weight INTEGER NOT NULL DEFAULT 10,
    reward_value JSONB NOT NULL DEFAULT '{}'::jsonb,
    compensation_points INTEGER NOT NULL DEFAULT 50,
    is_active BOOLEAN NOT NULL DEFAULT true,
    icon_url TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. ตารางประวัติการสุ่มกาชาปอง (gacha_roll_logs)
CREATE TABLE IF NOT EXISTS gacha_roll_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    discord_id TEXT NOT NULL,
    item_id UUID REFERENCES gacha_items(id) ON DELETE SET NULL,
    category TEXT NOT NULL,
    rarity TEXT NOT NULL DEFAULT 'COMMON',
    item_name TEXT NOT NULL,
    reward_snapshot JSONB NOT NULL DEFAULT '{}'::jsonb,
    is_duplicate BOOLEAN NOT NULL DEFAULT false,
    compensated_points INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index สำหรับค้นหาประวัติรวดเร็ว
CREATE INDEX IF NOT EXISTS idx_gacha_logs_discord ON gacha_roll_logs(discord_id);
CREATE INDEX IF NOT EXISTS idx_gacha_logs_created ON gacha_roll_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_gacha_logs_category ON gacha_roll_logs(category);

-- 3. ตารางตั้งค่าระบบกาชาปอง (gacha_settings)
CREATE TABLE IF NOT EXISTS gacha_settings (
    key TEXT PRIMARY KEY,
    value JSONB NOT NULL,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4. Enable RLS
ALTER TABLE gacha_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE gacha_roll_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE gacha_settings ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
DO $$
BEGIN
  -- gacha_items
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read active gacha items') THEN
    CREATE POLICY "Allow public read active gacha items" ON gacha_items FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service role manage gacha items') THEN
    CREATE POLICY "Allow service role manage gacha items" ON gacha_items FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated manage gacha items') THEN
    CREATE POLICY "Allow authenticated manage gacha items" ON gacha_items FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  -- gacha_roll_logs
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow read gacha logs') THEN
    CREATE POLICY "Allow read gacha logs" ON gacha_roll_logs FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service role insert gacha logs') THEN
    CREATE POLICY "Allow service role insert gacha logs" ON gacha_roll_logs FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated manage gacha logs') THEN
    CREATE POLICY "Allow authenticated manage gacha logs" ON gacha_roll_logs FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  -- gacha_settings
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow read gacha settings') THEN
    CREATE POLICY "Allow read gacha settings" ON gacha_settings FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service role manage gacha settings') THEN
    CREATE POLICY "Allow service role manage gacha settings" ON gacha_settings FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated manage gacha settings') THEN
    CREATE POLICY "Allow authenticated manage gacha settings" ON gacha_settings FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- 6. ข้อมูลเริ่มต้นการตั้งค่า (Seed Settings)
INSERT INTO gacha_settings (key, value)
VALUES 
  ('main_gacha', '{
    "dev_unlimited": true,
    "single_roll_price": 100,
    "ten_roll_price": 900,
    "banner_url": "https://cdn.discordapp.com/attachments/1524704267015819274/1524758921233825852/-_6.png",
    "title": "🎰 𝖡𝖾𝖺𝗋 𝖢𝖺𝖿𝖾 𝖫𝗎𝖼𝗄𝗒 𝖦𝖺𝖼𝗁𝖺 ₊ ตู้สุ่มของรางวัลคาเฟ่หมี 𓂃",
    "description": "หมุนตู้สุ่มลุ้นรับแต้มสะสม, สิทธิ์บ้านเช่าห้องเสียงส่วนตัว, ยศเปลี่ยนสีชื่อ และยศพิเศษประจำเซิร์ฟเวอร์!"
  }'::jsonb)
ON CONFLICT (key) DO UPDATE SET
  value = EXCLUDED.value,
  updated_at = NOW();

-- 7. ข้อมูลของรางวัลเริ่มต้นตามอัตราส่วน (แต้ม: 80, บ้านเช่า: 20, ยศสี: 15, ยศพิเศษ: 1)
INSERT INTO gacha_items (code, name, category, rarity, weight, reward_value, compensation_points, is_active)
VALUES
  -- 🪙 แต้มสะสมคาเฟ่ (รวมน้ำหนัก = 80)
  ('pts_50', '🪙 แต้มสะสม +50 แต้ม', 'points', 'COMMON', 40, '{"points": 50}'::jsonb, 50, true),
  ('pts_100', '🪙 แต้มสะสม +100 แต้ม', 'points', 'COMMON', 25, '{"points": 100}'::jsonb, 100, true),
  ('pts_250', '🪙 แต้มสะสม +250 แต้ม', 'points', 'RARE', 10, '{"points": 250}'::jsonb, 250, true),
  ('pts_500', '💰 แต้มสะสมก้อนโต +500 แต้ม', 'points', 'EPIC', 5, '{"points": 500}'::jsonb, 500, true),

  -- 🏠 สิทธิ์บ้านเช่า (รวมน้ำหนัก = 20)
  ('rent_3days', '🏠 สิทธิ์บ้านเช่าห้องเสียง (3 วัน)', 'rent_house', 'RARE', 15, '{"rent_days": 3}'::jsonb, 200, true),
  ('rent_7days', '🏡 สิทธิ์บ้านเช่าห้องเสียง (7 วัน)', 'rent_house', 'EPIC', 5, '{"rent_days": 7}'::jsonb, 400, true),

  -- 🎨 ยศเปลี่ยนสีชื่อ (รวมน้ำหนัก = 15)
  ('color_role_pass', '🎨 สิทธิ์เปลี่ยนสียศฟรี 1 ครั้ง', 'color_role', 'RARE', 15, '{"free_changes": 1}'::jsonb, 150, true),

  -- 👑 ยศบทบาทพิเศษ (น้ำหนัก = 1 - Jackpot)
  ('role_lucky_bear', '👑 ยศพิเศษ: นักสุ่มนำโชค (Lucky Gacha Bear)', 'special_role', 'LEGENDARY', 1, '{"role_id": "1318580353752895583"}'::jsonb, 1000, true)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  category = EXCLUDED.category,
  rarity = EXCLUDED.rarity,
  weight = EXCLUDED.weight,
  reward_value = EXCLUDED.reward_value,
  compensation_points = EXCLUDED.compensation_points,
  is_active = EXCLUDED.is_active,
  updated_at = NOW();
