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
(13, 'วันนี้อากาศสดใสมาก', '["The {1} is very {2} today."]'::jsonb, 'weather,nice', '[]'::jsonb, 'บทสนทนาทั่วไป', 'easy', true),

-- 50 คำถามสำนวนและสุภาษิตเพิ่มเติม (ผ่านการตรวจสอบความถูกต้อง 100%)
(13, 'น้ำนิ่งไหลลึก (คนเงียบๆ แต่อาจมีความคิดลึกซึ้ง)', '["Still {1} run {2}."]'::jsonb, 'waters,deep', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'คนตื่นเช้าได้เปรียบเสมอ', '["The early {1} catches the {2}."]'::jsonb, 'bird,worm', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'รู้รอบด้านแต่ไม่เชี่ยวชาญสักอย่าง', '["Jack of all {1}, master of {2}."]'::jsonb, 'trades,none', '[]'::jsonb, 'สำนวนและสุภาษิต', 'medium', true),
(13, 'ทานแอปเปิลวันละผล ห่างไกลคุณหมอ', '["An {1} a day keeps the {2} away."]'::jsonb, 'apple,doctor', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'กัดฟันสู้ (ยอมรับความจริงที่ยากลำบาก)', '["{1} the {2}."]'::jsonb, 'Bite,bullet', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'เผลอปล่อยความลับรั่วไหล (ปล่อยไก่)', '["Let the {1} out of the {2}."]'::jsonb, 'cat,bag', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'กันไว้ดีกว่าแก้ (ปลอดภัยไว้ก่อน)', '["Better {1} than {2}."]'::jsonb, 'safe,sorry', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'ความสำเร็จต้องใช้เวลา (กรุงโรมไม่ได้สร้างในวันเดียว)', '["Rome was not {1} in a {2}."]'::jsonb, 'built,day', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'คิดหน้าคิดหลังก่อนลงมือทำ', '["{1} before you {2}."]'::jsonb, 'Look,leap', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'หมาเห่ามักไม่กัด', '["Barking {1} seldom {2}."]'::jsonb, 'dogs,bite', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'ประสบการณ์คือบทเรียนที่ดีที่สุด', '["Experience is the {1} {2}."]'::jsonb, 'best,teacher', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'งานเลี้ยงย่อมมีวันเลิกรา', '["All good things must {1} to an {2}."]'::jsonb, 'come,end', '[]'::jsonb, 'สำนวนและสุภาษิต', 'medium', true),
(13, 'พูดไปสองไพเบี้ย นิ่งเสียตำลึงทอง', '["Speech is silver, {1} is {2}."]'::jsonb, 'silence,golden', '[]'::jsonb, 'สำนวนและสุภาษิต', 'medium', true),
(13, 'สองหัวดีกว่าหัวเดียว', '["Two {1} are better than {2}."]'::jsonb, 'heads,one', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'เลือดย่อมข้นกว่าน้ำ', '["Blood is {1} than {2}."]'::jsonb, 'thicker,water', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'แกว่งเท้าหาเสี้ยน (ขุดหลุมฝังศพตัวเอง)', '["Dig your {1} {2}."]'::jsonb, 'own,grave', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'เคราะห์ซ้ำกรรมซัด (ปัญหาประดังเข้ามาพร้อมกัน)', '["When it {1}, it {2}."]'::jsonb, 'rains,pours', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'น้ำหยดลงหินทุกวันหินยังกร่อน', '["Constant dripping {1} away a {2}."]'::jsonb, 'wears,stone', '[]'::jsonb, 'สำนวนและสุภาษิต', 'medium', true),
(13, 'เงินทองซื้อความสุขไม่ได้', '["Money cannot {1} {2}."]'::jsonb, 'buy,happiness', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'ไม่มีมูลความจริงย่อมไม่มีข่าวลือ (ไม่มีควันไร้ไฟ)', '["There is no {1} without {2}."]'::jsonb, 'smoke,fire', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'ปากกาทรงพลังกว่าคมดาบ', '["The {1} is mightier than the {2}."]'::jsonb, 'pen,sword', '[]'::jsonb, 'สำนวนและสุภาษิต', 'medium', true),
(13, 'ตัดช่องทางถอยหลัง (เผาสะพาน)', '["Don''t {1} your {2}."]'::jsonb, 'burn,bridges', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'ใช้เงินเป็นเบี้ย (สุรุ่ยสุร่าย)', '["Spend {1} like {2}."]'::jsonb, 'money,water', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'ดาบสองคม (มีทั้งข้อดีและข้อเสีย)', '["A double-edged {1}."]'::jsonb, 'sword', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'ความอยากรู้อยากเห็นนำภัยมาสู่ตัว', '["Curiosity {1} the {2}."]'::jsonb, 'killed,cat', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'ยื่นสิ่งมีค่าให้คนไม่รู้คุณค่า (ไก่ได้พลอย)', '["Cast {1} before {2}."]'::jsonb, 'pearls,swine', '[]'::jsonb, 'สำนวนและสุภาษิต', 'medium', true),
(13, 'กบในกะลาครอบ', '["A {1} in a {2}."]'::jsonb, 'frog,well', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'ไม่เสี่ยงย่อมไม่ได้อะไร (ไม่ลองก็ไม่รู้)', '["Nothing {1}, nothing {2}."]'::jsonb, 'ventured,gained', '[]'::jsonb, 'สำนวนและสุภาษิต', 'medium', true),
(13, 'สิ่งที่มีอยู่ดีกว่าสิ่งที่หวังลมๆ แล้งๆ', '["A {1} in the hand is worth {2} in the bush."]'::jsonb, 'bird,two', '[]'::jsonb, 'สำนวนและสุภาษิต', 'medium', true),
(13, 'ยอมรับว่าตัวเองพูดผิด (กลืนน้ำลายตัวเอง)', '["Eat your {1}."]'::jsonb, 'words', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'ฉวยโอกาสตอนจังหวะดี (น้ำขึ้นให้รีบตัก)', '["Make {1} while the sun {2}."]'::jsonb, 'hay,shines', '[]'::jsonb, 'สำนวนและสุภาษิต', 'medium', true),
(13, 'เสียดายสิ่งที่ผ่านไปแล้วและแก้ไขไม่ได้', '["Don''t {1} over {2} milk."]'::jsonb, 'cry,spilled', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'ความซื่อสัตย์คือนโยบายที่ดีที่สุด', '["Honesty is the {1} {2}."]'::jsonb, 'best,policy', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'เรื่องร้ายที่กลายเป็นดี (โชคดีในคราบเคราะห์)', '["A {1} in {2}."]'::jsonb, 'blessing,disguise', '[]'::jsonb, 'สำนวนและสุภาษิต', 'medium', true),
(13, 'เนรคุณคนที่เคยช่วยเหลือ (แว้งกัด)', '["Don''t {1} the hand that {2} you."]'::jsonb, 'bite,feeds', '[]'::jsonb, 'สำนวนและสุภาษิต', 'medium', true),
(13, 'มาช้ายังดีกว่าไม่มา', '["Better {1} than {2}."]'::jsonb, 'late,never', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'ความสวยขึ้นอยู่กับสายตาคนมอง', '["Beauty is in the {1} of the {2}."]'::jsonb, 'eye,beholder', '[]'::jsonb, 'สำนวนและสุภาษิต', 'medium', true),
(13, 'เตี้ยอุ้มค่อม (คนไม่รู้พาคนไม่รู้ไปสู่หายนะ)', '["The {1} leading the {2}."]'::jsonb, 'blind,blind', '[]'::jsonb, 'สำนวนและสุภาษิต', 'medium', true),
(13, 'คำพูดหวานนุ่มนวลชนะใจคนได้ดีกว่าคำด่าทอ', '["You catch more {1} with {2}."]'::jsonb, 'flies,honey', '[]'::jsonb, 'สำนวนและสุภาษิต', 'medium', true),
(13, 'ไม่มีสิ่งใดสมบูรณ์แบบไร้ที่ติ (กุหลาบย่อมมีหนาม)', '["Every {1} has its {2}."]'::jsonb, 'rose,thorn', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'เริ่มต้นดีมีชัยไปกว่าครึ่ง', '["Well {1} is {2} done."]'::jsonb, 'begun,half', '[]'::jsonb, 'สำนวนและสุภาษิต', 'medium', true),
(13, 'อย่าเพิ่งหวังผลก่อนเวลาอันควร', '["Don''t count your {1} before they {2}."]'::jsonb, 'chickens,hatch', '[]'::jsonb, 'สำนวนและสุภาษิต', 'medium', true),
(13, 'หนีเสือปะจระเข้', '["Out of the frying {1} into the {2}."]'::jsonb, 'pan,fire', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'ให้อภัยและลืมความหลัง', '["{1} and {2}."]'::jsonb, 'Forgive,forget', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'ความรู้คือพลังอำนาจ', '["{1} is {2}."]'::jsonb, 'Knowledge,power', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'เอาใจเขามาใส่ใจเรา', '["Put yourself in their {1}."]'::jsonb, 'shoes', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'น้อยแต่มาก (ความเรียบง่ายคือสิ่งที่ดีที่สุด)', '["Less is {1}."]'::jsonb, 'more', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'ปลอดภัยไร้รอยขีดข่วน (แคล้วคลาดปลอดภัย)', '["{1} and {2}."]'::jsonb, 'Safe,sound', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'ว่ายทวนกระแสน้ำ (ฝืนกระแสสังคมหรืออำนาจ)', '["Swimming against the {1}."]'::jsonb, 'tide', '[]'::jsonb, 'สำนวนและสุภาษิต', 'easy', true),
(13, 'หากล้มเหลวครั้งแรกจงพยายามอีกครั้ง', '["If at first you don''t {1}, try, try {2}."]'::jsonb, 'succeed,again', '[]'::jsonb, 'สำนวนและสุภาษิต', 'medium', true);
