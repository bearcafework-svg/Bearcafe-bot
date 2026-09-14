-- ====================================================================
-- akari_minigame_questions.sql
-- สคริปต์ DDL สำหรับสร้างตารางคลังคำศัพท์/โจทย์มินิเกมของ Akari Bot
-- คุณสามารถนำไฟล์นี้ไปรันใน Supabase SQL Editor แล้วเพิ่มโจทย์ได้ตามต้องการ
-- ====================================================================

-- 1. สร้างตารางคลังโจทย์มินิเกม (Akari Minigame Question Bank)
CREATE TABLE IF NOT EXISTS public.akari_minigame_questions (
    id BIGSERIAL PRIMARY KEY,
    game_id INT NOT NULL,                     -- หมายเลขเกม (1-13)
    word_or_question TEXT NOT NULL,           -- โจทย์, คำศัพท์ หรือประโยค
    answer TEXT NOT NULL,                     -- คำตอบที่ถูกต้อง
    options JSONB,                            -- Array ช้อยส์เลือกตอบ (สำหรับเกม 8, 9, 10, 12, 13)
    hints JSONB,                              -- Array คำใบ้/Template (สำหรับเกม 4, 13)
    category VARCHAR(64) DEFAULT 'คำทั่วไป',  -- หมวดหมู่โจทย์
    difficulty VARCHAR(32) DEFAULT 'medium',  -- ระดับความยาก: 'easy', 'medium', 'hard'
    is_active BOOLEAN DEFAULT true,           -- สถานะเปิดใช้งานโจทย์ข้อนี้
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. สร้าง Index ค้นหาโจทย์ตาม game_id และสถานะ is_active
CREATE INDEX IF NOT EXISTS idx_akari_questions_game ON public.akari_minigame_questions (game_id, is_active);
CREATE INDEX IF NOT EXISTS idx_akari_questions_category ON public.akari_minigame_questions (category);

-- 3. ปิด Row Level Security (RLS) เพื่อให้บอทอ่าน/เขียนข้อมูลได้รวดเร็ว
ALTER TABLE public.akari_minigame_questions DISABLE ROW LEVEL SECURITY;

-- 4. มอบสิทธิ์การเข้าถึงเต็มรูปแบบให้แก่ Roles ประจำ Supabase
GRANT ALL ON public.akari_minigame_questions TO anon, authenticated, service_role;
GRANT ALL ON SEQUENCE public.akari_minigame_questions_id_seq TO anon, authenticated, service_role;

-- ====================================================================
-- ตัวอย่างสคริปต์ INSERT สำหรับเพิ่มโจทย์มินิเกม (คุณสามารถแก้ไขและรันเพิ่มได้ตามต้องการ)
-- ====================================================================

/*
-- ตัวอย่างที่ 1: เพิ่มโจทย์เกม 1 (เติมคำศัพท์-ไทย)
INSERT INTO public.akari_minigame_questions (game_id, word_or_question, answer, category, difficulty) VALUES
(1, 'แมว', 'แมว', 'สัตว์และธรรมชาติ', 'easy'),
(1, 'อินเทอร์เน็ต', 'อินเทอร์เน็ต', 'เทคโนโลยี', 'medium');

-- ตัวอย่างที่ 2: เพิ่มโจทย์เกม 8 (ทายคำแปล-อังกฤษ เป็นช้อยส์)
INSERT INTO public.akari_minigame_questions (game_id, word_or_question, answer, options, category, difficulty) VALUES
(8, 'Apple', 'แอปเปิ้ล', '["แอปเปิ้ล", "กล้วย", "ส้ม", "มะพร้าว"]', 'Fruit', 'easy');

-- ตัวอย่างที่ 3: เพิ่มโจทย์เกม 12 (จริงหรือเท็จ)
INSERT INTO public.akari_minigame_questions (game_id, word_or_question, answer, options, category, difficulty) VALUES
(12, 'ดวงอาทิตย์ขึ้นทางทิศตะวันออก', 'จริง', '["จริง", "เท็จ"]', 'ความรู้ทั่วไป', 'easy');

-- ตัวอย่างที่ 4: เพิ่มโจทย์เกม 13 (เรียงประโยคภาษาอังกฤษ)
INSERT INTO public.akari_minigame_questions (game_id, word_or_question, hints, answer, options, category, difficulty) VALUES
(13, 'เรื่องกล้วยๆ (ง่ายมาก)', '["It is a {1} of {2}."]'::jsonb, 'piece,cake', '["banana", "cake", "piece", "pie", "slice"]'::jsonb, 'สำนวนและสุภาษิต', 'easy');
*/
