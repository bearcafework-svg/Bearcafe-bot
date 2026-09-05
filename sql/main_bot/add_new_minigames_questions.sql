-- ==============================================================================
-- BEAR CAFE BOT: REGISTER GAMES 11, 12, 13 IN MINIGAME_SETTINGS
-- (ลงทะเบียนเพิ่มเกมที่ 11, 12, 13 ในตารางการตั้งค่ามินิเกม)
-- ==============================================================================

INSERT INTO minigame_settings (game_id, game_name, channel_id, min_points, max_points) VALUES
(11, 'เกมต่อคำ', '1534647600000000011', 3, 6),
(12, 'ข้อไหนไม่เข้าพวก', '1534647600000000012', 3, 6),
(13, 'จริงหรือเท็จ', '1534647600000000013', 2, 4)
ON CONFLICT (game_id) DO UPDATE SET 
    game_name = EXCLUDED.game_name;
