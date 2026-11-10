-- ==============================================================================
-- BEAR CAFE BOT: FIX MISSING PRESET & VIP ROOM COLUMNS
-- ==============================================================================

ALTER TABLE smart_room_presets ADD COLUMN IF NOT EXISTS image_url TEXT DEFAULT NULL;
ALTER TABLE vip_active_rooms ADD COLUMN IF NOT EXISTS empty_at TIMESTAMPTZ DEFAULT NULL;

