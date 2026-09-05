-- ==============================================================================
-- SQL Migration: Delete Obsolete Emoji Questions from minigame_questions
-- ==============================================================================

-- ลบแถวที่เป็นอีโมจิ (เช่น 💖, 💗, ♈, ♉ ฯลฯ) ออกจากตาราง minigame_questions
DELETE FROM public.minigame_questions
WHERE word_or_question ~ '[\u2600-\u27BF\u1F300-\u1F9FF]'
   OR answer ~ '[\u2600-\u27BF\u1F300-\u1F9FF]';
