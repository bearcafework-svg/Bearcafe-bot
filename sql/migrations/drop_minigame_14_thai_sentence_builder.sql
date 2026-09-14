-- ==============================================================================
-- SQL Migration: Drop Minigame 14: เรียงประโยคภาษาไทย (Thai Sentence Builder)
-- ==============================================================================

-- 1. Remove active sessions for Game 14
DELETE FROM public.minigame_active_sessions WHERE game_id = 14 OR channel_id = '1544088196332134491';

-- 2. Remove win history for Game 14
DELETE FROM public.minigame_wins WHERE game_id = 14;

-- 3. Remove question bank for Game 14
DELETE FROM public.minigame_questions WHERE game_id = 14;

-- 4. Remove minigame settings for Game 14
DELETE FROM public.minigame_settings WHERE game_id = 14;
