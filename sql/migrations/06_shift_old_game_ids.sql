-- ==============================================================================
-- SQL Migration: Shift Old Minigame Question IDs to 12 Active Games
-- Shift Old IDs (7, 8, 9, 10, 13) -> Active IDs (6, 7, 8, 9, 12)
-- ==============================================================================

-- 1. Update Old Game 13 (จริงหรือเท็จ) -> New Game 12
UPDATE public.minigame_questions 
SET game_id = 12 
WHERE game_id = 13;

-- 2. Update Old Game 10 (ทายคำแปลภาษาไทย) -> New Game 9
UPDATE public.minigame_questions 
SET game_id = 9 
WHERE game_id = 10;

-- 3. Update Old Game 9 (ทายคำแปลภาษาอังกฤษ) -> New Game 8
UPDATE public.minigame_questions 
SET game_id = 8 
WHERE game_id = 9;

-- 4. Update Old Game 8 (พิมพ์คำต่อไปนี้ อังกฤษ) -> New Game 7
UPDATE public.minigame_questions 
SET game_id = 7 
WHERE game_id = 8;

-- 5. Update Old Game 7 (พิมพ์คำต่อไปนี้ ไทย) -> New Game 6
UPDATE public.minigame_questions 
SET game_id = 6 
WHERE game_id = 7;
