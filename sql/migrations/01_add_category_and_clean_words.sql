-- ==============================================================================
-- MIGRATION 01: ADD CATEGORY TO MINIGAME_QUESTIONS & DESTRUCTIVE CLEANUP SCRIPT
-- Specific to Game 1 (Thai Fill Word) and Game 2 (English Fill Word)
-- ==============================================================================

-- 1. Add Category Column if not exists
ALTER TABLE minigame_questions 
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT NULL;

-- 2. Populate / Update Categories for Game 1 (Thai Words)
UPDATE minigame_questions SET category = 'เทคโนโลยี' WHERE game_id = 1 AND answer IN ('ข้อมูล', 'ข่าวสาร', 'คอมพิวเตอร์', 'อินเทอร์เน็ต', 'โทรศัพท์');
UPDATE minigame_questions SET category = 'บันเทิงและศิลปะ' WHERE game_id = 1 AND answer IN ('ศิลปะ', 'ดนตรี', 'ภาพยนตร์', 'ละคร', 'เพลง', 'การ์ตูน');
UPDATE minigame_questions SET category = 'กีฬา' WHERE game_id = 1 AND answer IN ('กีฬา', 'ฟุตบอล', 'ว่ายน้ำ', 'วิ่งแข่ง', 'บาสเกตบอล', 'เทนนิส');
UPDATE minigame_questions SET category = 'เทศกาล' WHERE game_id = 1 AND answer IN ('สุขสันต์', 'วันเกิด', 'ปีใหม่', 'สงกรานต์', 'ประเพณี', 'คริสต์มาส');
UPDATE minigame_questions SET category = 'คุณธรรมและจริยธรรม' WHERE game_id = 1 AND answer IN ('ศาสนา', 'ศีลธรรม', 'คุณธรรม', 'จริยธรรม', 'ซื่อสัตย์', 'อดทน', 'เสียสละ', 'เมตตา', 'กรุณา', 'อภัย', 'กตัญญู', 'ความสุข', 'มิตรภาพ');
UPDATE minigame_questions SET category = 'สังคมและกฎหมาย' WHERE game_id = 1 AND answer IN ('ยุติธรรม', 'กฎหมาย', 'ระเบียบ', 'วินัย', 'มารยาท', 'เคารพ', 'ยินดี', 'ประเทศไทย', 'สวัสดี', 'ขอบคุณ');
UPDATE minigame_questions SET category = 'อาหารและเครื่องดื่ม' WHERE game_id = 1 AND answer IN ('ไอศกรีม', 'กาแฟ', 'น้ำ', 'กล้วย', 'แอปเปิ้ล', 'ส้ม');
UPDATE minigame_questions SET category = 'สัตว์และธรรมชาติ' WHERE game_id = 1 AND answer IN ('แมว', 'สุนัข', 'ช้าง', 'ผีเสื้อ', 'ดวงอาทิตย์', 'ท้องฟ้า', 'ธรรมชาติ');

-- Fallback default for any remaining Thai words without category
UPDATE minigame_questions SET category = 'คำทั่วไป' WHERE game_id = 1 AND (category IS NULL OR category = '');

-- 3. Populate / Update Categories for Game 2 (English Words)
UPDATE minigame_questions SET category = 'Fruit' WHERE game_id = 2 AND LOWER(answer) IN ('apple', 'banana', 'orange', 'strawberry', 'mango', 'grape', 'lemon');
UPDATE minigame_questions SET category = 'Animal' WHERE game_id = 2 AND LOWER(answer) IN ('cat', 'dog', 'elephant', 'butterfly', 'lion', 'tiger', 'rabbit', 'bird');
UPDATE minigame_questions SET category = 'Food & Drink' WHERE game_id = 2 AND LOWER(answer) IN ('icecream', 'coffee', 'water', 'milk', 'bread', 'pizza');
UPDATE minigame_questions SET category = 'Technology' WHERE game_id = 2 AND LOWER(answer) IN ('computer', 'phone', 'internet', 'laptop', 'camera');
UPDATE minigame_questions SET category = 'Nature & Sky' WHERE game_id = 2 AND LOWER(answer) IN ('sky', 'sunshine', 'rainbow', 'nature', 'flower', 'tree');
UPDATE minigame_questions SET category = 'Greetings & Feelings' WHERE game_id = 2 AND LOWER(answer) IN ('welcome', 'friendship', 'happy', 'smile', 'love');

-- Fallback default for any remaining English words without category
UPDATE minigame_questions SET category = 'General' WHERE game_id = 2 AND (category IS NULL OR category = '');

-- 4. DESTRUCTIVE CLEANUP: Remove very short words (REVIEW BEFORE EXECUTING)
-- Thai (Game 1): Delete words containing fewer than 3 grapheme clusters
-- English (Game 2): Delete words containing fewer than 4 alphabetic characters

-- English Cleanup (Game 2):
DELETE FROM minigame_questions 
WHERE game_id = 2 
  AND length(regexp_replace(answer, '[^a-zA-Z]', '', 'g')) < 4;

-- Thai Cleanup (Game 1):
-- Delete Thai answers with fewer than 3 grapheme clusters
DELETE FROM minigame_questions 
WHERE game_id = 1 
  AND length(regexp_replace(answer, '[\u0E30-\u0E3A\u0E47-\u0E4E]', '', 'g')) < 3;
