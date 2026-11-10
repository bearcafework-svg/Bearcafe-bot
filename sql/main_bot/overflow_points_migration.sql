-- ==============================================================================
-- BEAR CAFE BOT: OVERFLOW POINTS (แต้มส่วนเกิน) MIGRATION
-- ==============================================================================

ALTER TABLE user_points
ADD COLUMN IF NOT EXISTS overflow_points INT DEFAULT 0,
ADD COLUMN IF NOT EXISTS overflow_expires_at TIMESTAMPTZ DEFAULT NULL;

