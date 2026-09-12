-- ==============================================================================
-- SQL Migration: Add Minigame 13: เรียงประโยคภาษาอังกฤษ (Sentence Builder)
-- ==============================================================================

-- 1. Insert or update minigame_settings for Game 13
INSERT INTO public.minigame_settings ("game_id", "game_name", "channel_id", "is_enabled", "min_points", "max_points", "updated_at") 
VALUES (13, 'เรียงประโยคภาษาอังกฤษ', '1524123413122125964', true, 3, 6, NOW())
ON CONFLICT (game_id) DO UPDATE SET 
    game_name = EXCLUDED.game_name,
    is_enabled = EXCLUDED.is_enabled,
    min_points = EXCLUDED.min_points,
    max_points = EXCLUDED.max_points,
    updated_at = EXCLUDED.updated_at;

-- 2. Seed initial questions for Game 13
-- Note: ไม่จำเป็นต้องใส่ options (ระบบจะสุ่มคำหลอกจาก Pool และคลังคำศัพท์ให้อัตโนมัติทุกรอบที่เล่น)
-- แต่หากต้องการกำหนดตัวเลือกเฉพาะเจาะจง สามารถใส่ options เพิ่มเติมได้ตามต้องการ

INSERT INTO public.minigame_questions (game_id, word_or_question, hints, answer, options, category, difficulty, is_active) VALUES
-- ข้อตัวอย่างที่มีการกำหนด options เอง
(13, 'เรื่องกล้วยๆ (ง่ายมาก)', '["It is a {1} of {2}."]'::jsonb, 'piece,cake', '["banana", "cake", "piece", "pie", "slice"]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'สุดสัปดาห์นี้คุณจะทำอะไร?', '["What {1} you {2} this {3}?"]'::jsonb, 'are,doing,weekend', '["doing", "is", "weekend", "are", "making", "holiday"]'::jsonb, 'บทสนทนาทั่วไป', 'medium', true),
(13, 'ฝนตกหนักมาก (ตกอย่างกับฟ้ารั่ว)', '["It is raining {1} and {2}."]'::jsonb, 'cats,dogs', '["hard", "dogs", "pigs", "cats", "heavy"]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'ฉันตั้งตารอที่จะได้พบคุณ', '["I am {1} forward to {2} you."]'::jsonb, 'looking,seeing', '["meeting", "looking", "watching", "seeing", "look"]'::jsonb, 'บทสนทนาทั่วไป', 'medium', true),
(13, 'อย่าตัดสินคนจากภายนอก', '["Don''t {1} a {2} by its {3}."]'::jsonb, 'judge,book,cover', '["read", "cover", "book", "face", "judge", "person"]'::jsonb, 'สำนวนและสุภาษิต', 'medium', true),

-- ข้อตัวอย่างแบบ "ไม่ต้องกรอก options" (ปล่อยเป็น [] ระบบสุ่มตัวหลอกให้เองอัตโนมัติ)
(13, 'ความพยายามอยู่ที่ไหน ความสำเร็จอยู่ที่นั่น', '["Where there is a {1}, there is a {2}."]'::jsonb, 'will,way', '[]'::jsonb, 'สำนวนและสุภาษิต', 'medium', true),
(13, 'การกระทำสำคัญกว่าคำพูด', '["{1} speak louder than {2}."]'::jsonb, 'Actions,words', '[]'::jsonb, 'สำนวนและสุภาษิต', 'medium', true),
(13, 'เวลาและวารีไม่คอยใคร', '["Time and {1} wait for no {2}."]'::jsonb, 'tide,man', '[]'::jsonb, 'สำนวนและสุภาษิต', 'medium', true),
(13, 'ไม่มีอะไรสายเกินแก้', '["It is {1} too late to {2}."]'::jsonb, 'never,mend', '[]'::jsonb, 'สำนวนและสุภาษิต', 'medium', true),
(13, 'ไก่งามเพราะขน คนงามเพราะแต่ง', '["Clothes make the {1}."]'::jsonb, 'man', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'เพื่อนแท้ในยามยาก คือมิตรแท้', '["A {1} in need is a {2} indeed."]'::jsonb, 'friend,friend', '[]'::jsonb, 'สำนวนและสุภาษิต', 'medium', true),
(13, 'ฟ้าหลังฝนย่อมสดใสเสมอ', '["Every {1} has a silver {2}."]'::jsonb, 'cloud,lining', '[]'::jsonb, 'สำนวนและสุภาษิต', 'medium', true),
(13, 'เข้าเมืองตาหลิ่ว ต้องหลิ่วตาตาม', '["When in Rome, do as the {1} do."]'::jsonb, 'Romans', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'ฉันชอบดื่มกาแฟในตอนเช้า', '["I like to drink {1} in the {2}."]'::jsonb, 'coffee,morning', '[]'::jsonb, 'บทสนทนาทั่วไป', 'easy', true),
(13, 'วันนี้อากาศสดใสมาก', '["The {1} is very {2} today."]'::jsonb, 'weather,nice', '[]'::jsonb, 'บทสนทนาทั่วไป', 'easy', true);
