-- sql/update_minigame_settings_13.sql
-- อัปเดตข้อมูลตั้งค่ามินิเกมทั้ง 13 เกมในตาราง minigame_settings ให้ตรงกับระบบบอทและหน้าเว็บแดชบอร์ด

INSERT INTO "public"."minigame_settings" ("game_id", "game_name", "channel_id", "is_enabled", "min_points", "max_points", "updated_at") VALUES 
(1, 'เติมคำศัพท์ไทย', '1534437994327572510', true, 3, 6, NOW()),
(2, 'เติมคำศัพท์ภาษาอังกฤษ', '1534453700188176506', true, 3, 6, NOW()),
(3, 'สุ่มโจทย์คณิตฯ', '1534454001532272730', true, 2, 10, NOW()),
(4, 'ทายคำจากคำใบ้', '1534458749782200390', true, 2, 10, NOW()),
(5, 'เรียงคำศัพท์ไทย', '1534459076606431272', true, 3, 6, NOW()),
(6, 'เรียงคำศัพท์อังกฤษ', '1534459381779795998', true, 3, 6, NOW()),
(7, 'พิมพ์คำต่อไปนี้ (ไทย)', '1534469630234726431', true, 3, 6, NOW()),
(8, 'พิมพ์คำต่อไปนี้ (อังกฤษ)', '1534469708517085315', true, 3, 6, NOW()),
(9, 'ทายคำแปลภาษาอังกฤษ', '1534647461262393435', true, 3, 6, NOW()),
(10, 'ทายคำแปลภาษาไทย', '1534647589121818795', true, 3, 6, NOW()),
(11, 'เกมต่อคำ', '1536934025187295232', true, 1, 3, NOW()),
(12, 'ข้อไหนไม่เข้าพวก', '1536934464460951652', true, 1, 3, NOW()),
(13, 'จริงหรือเท็จ', '1536934867256868885', true, 2, 4, NOW())
ON CONFLICT (game_id) DO UPDATE SET 
    game_name = EXCLUDED.game_name,
    channel_id = EXCLUDED.channel_id,
    is_enabled = EXCLUDED.is_enabled,
    min_points = EXCLUDED.min_points,
    max_points = EXCLUDED.max_points,
    updated_at = NOW();
