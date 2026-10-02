-- ===================================================
-- Migration: 03_create_ai_system_tables.sql
-- Description: Tables for Bear Cafe AI System (Knowledge Base & Sticker Triggers)
-- ===================================================

-- 1. Table: ai_knowledge
CREATE TABLE IF NOT EXISTS public.ai_knowledge (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    category TEXT NOT NULL,                -- e.g. 'rules', 'systems', 'cafe', 'points', 'minigames', 'faq'
    title TEXT NOT NULL,                   -- Subject title e.g. 'กฎระเบียบเซิร์ฟเวอร์'
    content TEXT NOT NULL,                 -- Markdown / text content for AI grounding
    tags TEXT[] NOT NULL DEFAULT '{}',     -- Array of search keywords/tags e.g. ARRAY['rules', 'กฎ', 'ข้อห้าม']
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for category & tags query
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_category ON public.ai_knowledge(category);
CREATE INDEX IF NOT EXISTS idx_ai_knowledge_is_active ON public.ai_knowledge(is_active);

-- 2. Table: ai_sticker_triggers
CREATE TABLE IF NOT EXISTS public.ai_sticker_triggers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    keyword TEXT NOT NULL UNIQUE,          -- Exact-match keyword e.g. 'อิอิว', 'โอโอเย'
    mode TEXT NOT NULL DEFAULT 'llm_select', -- 'llm_select' | 'instant'
    sticker_ids TEXT[] NOT NULL DEFAULT '{}', -- Discord sticker IDs or placeholder names
    description TEXT,                      -- Short context e.g. 'สติกเกอร์กวนๆ ยิ้มกรุ้มกริ่ม'
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_sticker_triggers_keyword ON public.ai_sticker_triggers(keyword);
CREATE INDEX IF NOT EXISTS idx_ai_sticker_triggers_is_active ON public.ai_sticker_triggers(is_active);

-- 3. Seed Initial Knowledge
INSERT INTO public.ai_knowledge (category, title, content, tags)
VALUES
  (
    'rules',
    'กฎระเบียบเซิร์ฟเวอร์ Bear Cafe',
    '1. ให้เกียรติซึ่งกันและกัน ห้ามใช้คำหยาบ คุกคาม กลั่นแกล้ง (No Harassment)\n2. ห้ามส่งสแปม ข้อความ/รูปภาพรัวๆ (No Spamming)\n3. ห้ามเนื้อหาลามกอนาจาร (NSFW/18+) หรือผิดกฎหมาย\n4. ห้ามโฆษณา แปะลิงก์เชิญเซิร์ฟเวอร์อื่นโดยไม่ได้รับอนุญาต\n5. ใช้ห้องให้ตรงตามวัตถุประสงค์',
    ARRAY['rules', 'rule', 'กฎ', 'ข้อห้าม', 'ระเบียบ', 'มารยาท']
  ),
  (
    'systems',
    'ระบบร้านกาแฟ (Bear Cafe System)',
    'ระบบจำลองเปิดร้านคาเฟ่ รับออเดอร์ ทำเครื่องดื่ม และเสิร์ฟให้ลูกค้า มีเควสต์ประจำวัน (Daily Quests) เพื่อรับแต้มและอัปเกรดทักษะบาริสต้า',
    ARRAY['cafe', 'ร้านกาแฟ', 'เครื่องดื่ม', 'บาริสต้า', 'ออเดอร์', 'ชงกาแฟ']
  ),
  (
    'systems',
    'ระบบกาชาผึ้ง (Bee Gacha)',
    'สุ่มผึ้งหลากหลายสายพันธุ์ (Common ถึง Legendary) สะสมน้ำผึ้ง นำผึ้งไปทำงานเพื่อผลิตไอเทมและแต้มพิเศษ พร้อมดูคอลเลกชันผึ้งของตนเองได้',
    ARRAY['bee', 'ผึ้ง', 'กาชาผึ้ง', 'น้ำผึ้ง', 'รังผึ้ง', 'เลี้ยงผึ้ง']
  ),
  (
    'systems',
    'ระบบมินิเกม (Minigames 13 รูปแบบ)',
    'มินิเกม 13 รูปแบบ เช่น เติมคำศัพท์ (ไทย/อังกฤษ), สุ่มโจทย์เลข, ทายคำจากคำใบ้, ฟังเสียงตอบ (Listening), จริงหรือเท็จ, เรียงประโยค เล่นชนะได้แต้มสะสมขึ้น Leaderboard',
    ARRAY['game', 'games', 'minigame', 'มินิเกม', 'เกม', 'ทายคำ', 'คำศัพท์', 'คณิตศาสตร์']
  ),
  (
    'systems',
    'ระบบแต้มห้องเสียง (Voice Points)',
    'ยิ่งเข้าห้องเสียงพูดคุยกับเพื่อนๆ ในเซิร์ฟเวอร์ จะได้รับแต้มสะสมอัตโนมัติ นำแต้มไปแลกของรางวัลหรือซื้อของในร้านค้าได้',
    ARRAY['voice', 'points', 'แต้มเสียง', 'ห้องเสียง', 'คะแนน', 'คุยไมค์']
  ),
  (
    'systems',
    'ระบบเช่าบ้าน (Rent House / VIP Rooms)',
    'ระบบเช่าห้องเสียงส่วนตัวสำหรับจัดปาร์ตี้ คุยเล่น หรือเปิดห้องเพลงแบบไพรเวท จัดการสิทธิ์ ล็อคห้อง หรือตั้งชื่อห้องได้ตามต้องการ',
    ARRAY['rent', 'house', 'vip', 'เช่าบ้าน', 'ห้องส่วนตัว', 'ห้องไพรเวท']
  ),
  (
    'systems',
    'ระบบฮีลใจ (Heal Jai)',
    'ห้องและฟีเจอร์สำหรับพักผ่อน ระบายความเครียด หรือส่งกำลังใจให้กัน มีคำคมพลังบวกและระบบดูแลความรู้สึกของผู้เล่น',
    ARRAY['heal', 'healjai', 'ฮีลใจ', 'กำลังใจ', 'ระบาย', 'เครียด', 'พักผ่อน']
  ),
  (
    'faq',
    'คำถามที่พบบ่อย (FAQ)',
    'Q: อยากได้ยศเพิ่มทำยังไง? -> สะสมแต้มห้องเสียง (Voice Points) หรือเล่นมินิเกม แล้วแลกยศในร้านค้า\nQ: เปิดเพลงยังไง? -> เข้าห้องเสียงแล้วใช้คำสั่งของบอทเพลงประจำเซิร์ฟเวอร์\nQ: ติดต่อแอดมินยังไง? -> เปิด Ticket ในห้องแจ้งปัญหาเพื่อติดต่อทีมงาน',
    ARRAY['faq', 'ยศ', 'เปิดเพลง', 'ติดต่อแอดมิน', 'ปัญหา', 'ช่วยเหลือ', 'ticket', 'ทิกเก็ต']
  )
ON CONFLICT DO NOTHING;

-- 4. Seed Initial Triggers
INSERT INTO public.ai_sticker_triggers (keyword, mode, description, sticker_ids)
VALUES
  ('อิอิว', 'llm_select', 'สติกเกอร์ยิ้มกรุ้มกริ่ม/กวนๆ', ARRAY['1200000000000000001']),
  ('โอโอเย', 'llm_select', 'สติกเกอร์ดีใจ/เฮฮา/เห็นด้วย', ARRAY['1200000000000000002']),
  ('ไรเรย', 'llm_select', 'สติกเกอร์งง/สงสัย/แซว', ARRAY['1200000000000000003']),
  ('หลีกไป', 'llm_select', 'สติกเกอร์เปิดทาง/พี่หมีมาแล้ว/เท่ๆ', ARRAY['1200000000000000004'])
ON CONFLICT (keyword) DO NOTHING;

-- 5. Enable RLS & Policies
ALTER TABLE public.ai_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_sticker_triggers ENABLE ROW LEVEL SECURITY;

-- Allow read access for authenticated & service role
CREATE POLICY "Allow read ai_knowledge" ON public.ai_knowledge
    FOR SELECT USING (true);

CREATE POLICY "Allow all ai_knowledge for authenticated" ON public.ai_knowledge
    FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

CREATE POLICY "Allow read ai_sticker_triggers" ON public.ai_sticker_triggers
    FOR SELECT USING (true);

CREATE POLICY "Allow all ai_sticker_triggers for authenticated" ON public.ai_sticker_triggers
    FOR ALL USING (auth.role() = 'authenticated' OR auth.role() = 'service_role');

