-- ==============================================================================
-- SQL Migration: Update 12 Minigames in minigame_settings (Deleted Old Game 6)
-- ==============================================================================

-- Delete all old minigame settings to clean up re-numbered IDs
DELETE FROM public.minigame_settings;

-- Insert exact 12 active minigames configuration
INSERT INTO public.minigame_settings ("game_id", "game_name", "channel_id", "is_enabled", "min_points", "max_points", "updated_at") VALUES 
(1, 'เติมคำศัพท์ (ไทย)', '1534437994327572510', true, 3, 6, NOW()), 
(2, 'เติมคำศัพท์ (อังกฤษ)', '1534453700188176506', true, 3, 6, NOW()), 
(3, 'สุ่มโจทย์คณิตฯ', '1534454001532272730', true, 2, 10, NOW()), 
(4, 'ทายคำจากคำใบ้', '1534458749782200390', true, 2, 10, NOW()), 
(5, 'ฟังเสียงแล้วพิมพ์ตอบ (อังกฤษ)', '1544201307894587472', true, 3, 6, NOW()), 
(6, 'พิมพ์คำต่อไปนี้ (ไทย)', '1534469630234726431', true, 3, 6, NOW()), 
(7, 'พิมพ์คำต่อไปนี้ (อังกฤษ)', '1534469708517085315', true, 3, 6, NOW()), 
(8, 'ทายคำแปลภาษาอังกฤษ', '1534647461262393435', true, 3, 6, NOW()), 
(9, 'ทายคำแปลภาษาไทย', '1534647589121818795', true, 3, 6, NOW()), 
(10, 'เกมต่อคำ', '1536934025187295232', true, 1, 3, NOW()), 
(11, 'ฟังเสียงแล้วพิมพ์ตอบ (ไทย)', '1544201245974073405', true, 1, 3, NOW()), 
(12, 'จริงหรือเท็จ', '1536934867256868885', true, 2, 4, NOW())
ON CONFLICT (game_id) DO UPDATE SET 
    game_name = EXCLUDED.game_name,
    channel_id = EXCLUDED.channel_id,
    is_enabled = EXCLUDED.is_enabled,
    min_points = EXCLUDED.min_points,
    max_points = EXCLUDED.max_points,
    updated_at = EXCLUDED.updated_at;
