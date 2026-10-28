-- ==============================================================================
-- BEAR CAFE BOT: USER COOLDOWNS TABLE
-- ==============================================================================

CREATE TABLE IF NOT EXISTS user_cooldowns (
  discord_id TEXT NOT NULL,
  command TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (discord_id, command)
);

ALTER TABLE user_cooldowns DISABLE ROW LEVEL SECURITY;
GRANT ALL ON user_cooldowns TO anon, authenticated, service_role;

