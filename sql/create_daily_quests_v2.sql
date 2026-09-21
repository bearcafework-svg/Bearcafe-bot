-- ============================================================================
-- Bear Cafe Daily Quest System Migration (Plan 1)
-- ============================================================================

-- 1. ตารางคลังแม่แบบเควส (daily_quest_templates)
CREATE TABLE IF NOT EXISTS daily_quest_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) UNIQUE NOT NULL,
  title VARCHAR(100) NOT NULL,
  category VARCHAR(30) NOT NULL, -- 'chat', 'voice', 'community', 'irl'
  description TEXT NOT NULL,
  trigger_type VARCHAR(50) NOT NULL, -- 'keyword', 'chat_any', 'chat_reply', 'chat_mention', 'chat_media', 'chat_emoji', 'chat_count', 'voice_duration', 'voice_join', 'reaction_add', 'command_usage', 'irl_manual'
  trigger_config JSONB DEFAULT '{}'::jsonb,
  target_count INTEGER NOT NULL DEFAULT 1,
  reward_points INTEGER NOT NULL DEFAULT 5,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. ตารางชุดเควสประจำวัน (daily_quest_sets)
CREATE TABLE IF NOT EXISTS daily_quest_sets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_date DATE UNIQUE NOT NULL,
  quest_ids UUID[] NOT NULL,
  bonus_points INTEGER NOT NULL DEFAULT 50,
  announcement_message_id VARCHAR(32),
  published_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. ตารางความคืบหน้ารายบุคคล (daily_quest_progress)
CREATE TABLE IF NOT EXISTS daily_quest_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_date DATE NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  quest_id UUID NOT NULL REFERENCES daily_quest_templates(id) ON DELETE CASCADE,
  current_progress INTEGER NOT NULL DEFAULT 0,
  target_count INTEGER NOT NULL DEFAULT 1,
  is_completed BOOLEAN NOT NULL DEFAULT FALSE,
  completed_at TIMESTAMPTZ,
  reward_claimed BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (quest_date, user_id, quest_id)
);

-- 4. ตารางบันทึกโบนัสทำเควสครบ 3 ข้อ (daily_quest_bonuses)
CREATE TABLE IF NOT EXISTS daily_quest_bonuses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_date DATE NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  bonus_points INTEGER NOT NULL DEFAULT 50,
  awarded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (quest_date, user_id)
);

-- 5. ตารางบันทึกสถิติการใช้งานและการคลิก (daily_quest_analytics)
CREATE TABLE IF NOT EXISTS daily_quest_analytics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  quest_date DATE NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  user_id VARCHAR(32) NOT NULL,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes เพื่อความรวดเร็วในการ Query
CREATE INDEX IF NOT EXISTS idx_daily_quest_sets_date ON daily_quest_sets(quest_date);
CREATE INDEX IF NOT EXISTS idx_daily_quest_progress_user_date ON daily_quest_progress(user_id, quest_date);
CREATE INDEX IF NOT EXISTS idx_daily_quest_progress_quest ON daily_quest_progress(quest_id);
CREATE INDEX IF NOT EXISTS idx_daily_quest_analytics_date ON daily_quest_analytics(quest_date, event_type);

-- RLS Policies
ALTER TABLE daily_quest_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_quest_sets ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_quest_progress ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_quest_bonuses ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_quest_analytics ENABLE ROW LEVEL SECURITY;

-- Allow public read access (anon / authenticated) for viewing active quests & sets
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow read daily_quest_templates') THEN
    CREATE POLICY "Allow read daily_quest_templates" ON daily_quest_templates FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow read daily_quest_sets') THEN
    CREATE POLICY "Allow read daily_quest_sets" ON daily_quest_sets FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow read daily_quest_progress') THEN
    CREATE POLICY "Allow read daily_quest_progress" ON daily_quest_progress FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow read daily_quest_bonuses') THEN
    CREATE POLICY "Allow read daily_quest_bonuses" ON daily_quest_bonuses FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow read daily_quest_analytics') THEN
    CREATE POLICY "Allow read daily_quest_analytics" ON daily_quest_analytics FOR SELECT USING (true);
  END IF;
END $$;

-- Allow service_role full control
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access templates') THEN
    CREATE POLICY "Service role full access templates" ON daily_quest_templates FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access sets') THEN
    CREATE POLICY "Service role full access sets" ON daily_quest_sets FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access progress') THEN
    CREATE POLICY "Service role full access progress" ON daily_quest_progress FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access bonuses') THEN
    CREATE POLICY "Service role full access bonuses" ON daily_quest_bonuses FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Service role full access analytics') THEN
    CREATE POLICY "Service role full access analytics" ON daily_quest_analytics FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;

  -- Allow web admin and authenticated users to manage daily quests
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow manage daily_quest_templates') THEN
    CREATE POLICY "Allow manage daily_quest_templates" ON daily_quest_templates FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow manage daily_quest_sets') THEN
    CREATE POLICY "Allow manage daily_quest_sets" ON daily_quest_sets FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow manage daily_quest_progress') THEN
    CREATE POLICY "Allow manage daily_quest_progress" ON daily_quest_progress FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow manage daily_quest_bonuses') THEN
    CREATE POLICY "Allow manage daily_quest_bonuses" ON daily_quest_bonuses FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow manage daily_quest_analytics') THEN
    CREATE POLICY "Allow manage daily_quest_analytics" ON daily_quest_analytics FOR ALL TO anon, authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;

-- ============================================================================
-- Seed ข้อมูลเควสเริ่มต้น 33 เควสตามเอกสารสเปก
-- ============================================================================
INSERT INTO daily_quest_templates (code, title, category, description, trigger_type, trigger_config, target_count, reward_points)
VALUES
  -- 💬 Discord Quests
  ('morning_bear', '🌞 ︰ Morning Bear', 'chat', 'พิมพ์ Morning หรือ มอนิ่ง 1 ครั้ง', 'keyword', '{"keywords": ["morning", "good morning", "gm", "มอนิ่ง", "มอนิ่งง", "อรุณสวัสดิ์"]}'::jsonb, 1, 5),
  ('chat_visit', '💬 ︰ แวะมาคุย', 'chat', 'ส่งข้อความ 1 ครั้ง (แชทใดก็ได้)', 'chat_any', '{}'::jsonb, 1, 5),
  ('random_question', '💭 ︰ วันนี้เป็นไงบ้าง', 'chat', 'ใช้คำสั่ง /สุ่มคำถาม ที่ <#1524124012492619847> 1 ครั้ง', 'command_usage', '{"command": "สุ่มคำถาม", "channel_id": "1524124012492619847"}'::jsonb, 1, 5),
  ('reply_friend', '↩️ ︰ ตอบเพื่อน', 'chat', 'Reply ข้อความสมาชิก 1 ครั้ง', 'chat_reply', '{}'::jsonb, 1, 5),
  ('greet_friend', '👋 ︰ ทักเพื่อน', 'chat', 'Mention สมาชิก 1 คนพร้อมข้อความ', 'chat_mention', '{}'::jsonb, 1, 5),
  ('meme_today', '😂 ︰ วันนี้ต้องมีม', 'chat', 'ส่ง GIF หรือ Sticker 1 ครั้ง', 'chat_media', '{"media_type": "sticker_or_gif"}'::jsonb, 1, 5),
  ('song_today', '🎵 ︰ เพลงวันนี้', 'chat', 'แชร์เพลง 1 เพลง', 'chat_media', '{"media_type": "music_link"}'::jsonb, 1, 5),
  ('bear_emoji', '🧸 ︰ ใช้ Emoji หมี', 'chat', 'ใช้ Emoji ของเซิร์ฟเวอร์ 1 ครั้ง', 'chat_emoji', '{}'::jsonb, 1, 5),
  ('chat_more', '🗨️ ︰ คุยต่ออีกนิด', 'chat', 'ส่งข้อความ 3 ครั้งในวันเดียว', 'chat_count', '{}'::jsonb, 3, 5),

  -- 🎙 Voice Quests
  ('vc_visit', '🎙 ︰ แวะห้องเสียง', 'voice', 'เข้า VC 1 ครั้ง', 'voice_join', '{}'::jsonb, 1, 10),
  ('cafe_time', '☕ ︰ Café Time', 'voice', 'อยู่ VC 10 นาที', 'voice_duration', '{"minutes": 10}'::jsonb, 10, 10),
  ('vc_relax', '🧸 ︰ นั่งเล่น', 'voice', 'อยู่ VC 20 นาที', 'voice_duration', '{"minutes": 20}'::jsonb, 20, 10),
  ('vc_friends', '👥 ︰ มาเป็นเพื่อน', 'voice', 'อยู่ VC พร้อมสมาชิกอื่น 10 นาที', 'voice_duration', '{"minutes": 10, "min_members": 2}'::jsonb, 10, 10),
  ('bear_table', '🐻 ︰ โต๊ะหมี', 'voice', 'อยู่ VC ห้องที่กำหนด 15 นาที', 'voice_duration', '{"minutes": 15}'::jsonb, 15, 10),
  ('listening_time', '🎧 ︰ Listening Time', 'voice', 'อยู่ VC 30 นาที', 'voice_duration', '{"minutes": 30}'::jsonb, 30, 10),

  -- 🤝 Community Quests
  ('welcome_bear', '👋 ︰ Welcome Bear', 'community', 'ต้อนรับสมาชิกใหม่ 1 คน', 'chat_any', '{"channel_id": "1524122867178930237"}'::jsonb, 1, 15),
  ('reaction_three', '❤️ ︰ Reaction', 'community', 'React ข้อความ 3 ครั้ง', 'reaction_add', '{}'::jsonb, 3, 15),
  ('support_bear', '🫶 ︰ Support Bear', 'community', 'Reply สมาชิกคนอื่น 2 ครั้ง', 'chat_reply', '{}'::jsonb, 2, 15),

  -- 📷 IRL Quests
  ('red_hunter', '🔴 ︰ Red Hunter', 'irl', 'ถ่ายของสีแดง 3 สิ่ง', 'irl_manual', '{}'::jsonb, 1, 20),
  ('yellow_hunter', '🟡 ︰ Yellow Hunter', 'irl', 'ถ่ายของสีเหลือง 3 สิ่ง', 'irl_manual', '{}'::jsonb, 1, 20),
  ('pink_hunter', '🩷 ︰ Pink Hunter', 'irl', 'ถ่ายของสีชมพู 3 สิ่ง', 'irl_manual', '{}'::jsonb, 1, 20),
  ('sky_check', '☁️ ︰ Sky Check', 'irl', 'ถ่ายท้องฟ้าวันนี้ 1 ภาพ', 'irl_manual', '{}'::jsonb, 1, 20),
  ('food_check', '🍜 ︰ Food Check', 'irl', 'ถ่ายอาหาร/ขนมวันนี้ 1 ภาพ', 'irl_manual', '{}'::jsonb, 1, 20),
  ('bear_hunt', '🐻 ︰ Bear Hunt', 'irl', 'ถ่ายสิ่งที่มีรูปหมี 1 ภาพ', 'irl_manual', '{}'::jsonb, 1, 20),
  ('circle_hunt', '⭕ ︰ Circle Hunt', 'irl', 'ถ่ายของทรงกลม 3 สิ่ง', 'irl_manual', '{}'::jsonb, 1, 20),
  ('number_hunt', '🔢 ︰ Number Hunt', 'irl', 'ถ่ายสิ่งที่มีตัวเลข 1 ภาพ', 'irl_manual', '{}'::jsonb, 1, 20),
  ('something_cute', '✨ ︰ Something Cute', 'irl', 'ถ่ายสิ่งที่คิดว่าน่ารัก 1 ภาพ', 'irl_manual', '{}'::jsonb, 1, 20),
  ('something_weird', '😂 ︰ Something Weird', 'irl', 'ถ่ายสิ่งที่คิดว่าแปลก 1 ภาพ', 'irl_manual', '{}'::jsonb, 1, 20),
  ('nature_check', '🌿 ︰ Nature Check', 'irl', 'ถ่ายต้นไม้/ธรรมชาติ 1 ภาพ', 'irl_manual', '{}'::jsonb, 1, 20),
  ('reflection_check', '🪞 ︰ Reflection', 'irl', 'ถ่ายเงาหรือภาพสะท้อน 1 ภาพ', 'irl_manual', '{}'::jsonb, 1, 20),
  ('two_colors', '🎨 ︰ Two Colors', 'irl', 'ถ่ายภาพที่มี 2 สีเด่น', 'irl_manual', '{}'::jsonb, 1, 20),
  ('tiny_detail', '🔍 ︰ Tiny Detail', 'irl', 'ถ่ายของเล็ก ๆ ใกล้ตัว 1 ภาพ', 'irl_manual', '{}'::jsonb, 1, 20),
  ('outside_view', '🚪 ︰ Outside View', 'irl', 'ถ่ายวิวจากนอกห้อง/หน้าต่าง 1 ภาพ', 'irl_manual', '{}'::jsonb, 1, 20)
ON CONFLICT (code) DO UPDATE SET
  title = EXCLUDED.title,
  category = EXCLUDED.category,
  description = EXCLUDED.description,
  trigger_type = EXCLUDED.trigger_type,
  trigger_config = EXCLUDED.trigger_config,
  target_count = EXCLUDED.target_count,
  reward_points = EXCLUDED.reward_points,
  updated_at = NOW();
