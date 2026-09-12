-- ==============================================================================
-- SQL Migration: Add Minigame 14: เรียงประโยคภาษาไทย (Thai Sentence Builder)
-- ==============================================================================

-- 1. Insert or update minigame_settings for Game 14
INSERT INTO public.minigame_settings ("game_id", "game_name", "channel_id", "is_enabled", "min_points", "max_points", "updated_at") 
VALUES (14, 'เรียงประโยคภาษาไทย', '1544088196332134491', true, 3, 6, NOW())
ON CONFLICT (game_id) DO UPDATE SET 
    game_name = EXCLUDED.game_name,
    channel_id = EXCLUDED.channel_id,
    is_enabled = EXCLUDED.is_enabled,
    min_points = EXCLUDED.min_points,
    max_points = EXCLUDED.max_points,
    updated_at = EXCLUDED.updated_at;

-- 2. Seed initial questions for Game 14
-- Note: โจทย์คือภาษาอังกฤษ (word_or_question) และช่องว่างคือภาษาไทยใน hints
-- ระบบจะสุ่มคำหลอกภาษาไทยให้อัตโนมัติทุกรอบที่เล่น

INSERT INTO public.minigame_questions (game_id, word_or_question, hints, answer, options, category, difficulty, is_active) VALUES
(14, 'Kill two birds with one stone.', '["ยิงปืน{1}เดียวได้{2}สอง{3}"]'::jsonb, 'นัด,นก,ตัว', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'Strike while the iron is hot.', '["น้ำขึ้นให้{1}{2}"]'::jsonb, 'รีบ,ตัก', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'Actions speak louder than words.', '["การกระทำ{1}กว่า{2}"]'::jsonb, 'สำคัญ,คำพูด', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'Don''t judge a book by its cover.', '["อย่าตัดสินคนจาก{1}"]'::jsonb, 'ภายนอก', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'Where there is a will, there is a way.', '["ความพยายามอยู่ที่ไหน {1}อยู่ที่นั่น"]'::jsonb, 'ความสำเร็จ', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'Time and tide wait for no man.', '["เวลาและวารี{1}ใคร"]'::jsonb, 'ไม่คอย', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'A friend in need is a friend indeed.', '["เพื่อนแท้ใน{1} คือมิตรแท้"]'::jsonb, 'ยามยาก', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'Slow and steady wins the race.', '["ช้าๆ ได้{1}งาม"]'::jsonb, 'พร้าเล่ม', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'When the cat''s away, the mice will play.', '["แมวไม่อยู่ {1}ร่าเริง"]'::jsonb, 'หนู', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'Every cloud has a silver lining.', '["ฟ้าหลังฝน{1}เสมอ"]'::jsonb, 'ย่อมสดใส', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'When in Rome, do as the Romans do.', '["เข้าเมือง{1} ต้องหลิ่วตาตาม"]'::jsonb, 'ตาหลิ่ว', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'Still waters run deep.', '["น้ำนิ่ง{1}"]'::jsonb, 'ไหลลึก', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'The early bird catches the worm.', '["คนตื่นเช้าได้{1}เสมอ"]'::jsonb, 'เปรียบ', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'Better safe than sorry.', '["{1}ดีกว่าแก้"]'::jsonb, 'กันไว้', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'Rome was not built in a day.', '["ความสำเร็จต้อง{1}"]'::jsonb, 'ใช้เวลา', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'Barking dogs seldom bite.', '["หมาเห่า{1}"]'::jsonb, 'มักไม่กัด', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'Experience is the best teacher.', '["ประสบการณ์คือ{1}ที่ดีที่สุด"]'::jsonb, 'บทเรียน', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'Two heads are better than one.', '["สองหัว{1}หัวเดียว"]'::jsonb, 'ดีกว่า', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'Blood is thicker than water.', '["เลือดย่อม{1}น้ำ"]'::jsonb, 'ข้นกว่า', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'Curiosity killed the cat.', '["ความอยากรู้อยากเห็น{1}สู่ตัว"]'::jsonb, 'นำภัยมา', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'Cast pearls before swine.', '["ยื่นสิ่งมีค่าให้คน{1}คุณค่า"]'::jsonb, 'ไม่รู้', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'A frog in a well.', '["กบใน{1}"]'::jsonb, 'กะลาครอบ', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'Make hay while the sun shines.', '["ฉวยโอกาสตอน{1}"]'::jsonb, 'จังหวะดี', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'Better late than never.', '["มาช้า{1}ไม่มา"]'::jsonb, 'ยังดีกว่า', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'Beauty is in the eye of the beholder.', '["ความสวยขึ้นอยู่กับ{1}คนมอง"]'::jsonb, 'สายตา', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'Out of the frying pan into the fire.', '["หนีเสือ{1}"]'::jsonb, 'ปะจระเข้', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'Forgive and forget.', '["{1}และลืมความหลัง"]'::jsonb, 'ให้อภัย', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'Knowledge is power.', '["ความรู้คือ{1}"]'::jsonb, 'พลังอำนาจ', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'Swimming against the tide.', '["ว่ายทวน{1}"]'::jsonb, 'กระแสน้ำ', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(14, 'Speech is silver, silence is golden.', '["พูดไปสองไพเบี้ย {1}"]'::jsonb, 'นิ่งเสียตำลึงทอง', '[]'::jsonb, 'สำนวนและสุภาษิต', 'medium', true);
