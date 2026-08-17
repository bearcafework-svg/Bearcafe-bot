-- ===================================================
-- SQL Schema for Daily Quests System (Bear Cafe Bot)
-- ===================================================

-- 1. Master Pool 30 Quests
CREATE TABLE IF NOT EXISTS daily_quest_master (
    quest_id VARCHAR(32) PRIMARY KEY,
    category VARCHAR(32) NOT NULL, -- CHAT, VOICE, MINIGAME, FEATURE, SOCIAL
    title VARCHAR(100) NOT NULL,
    description TEXT NOT NULL,
    target_count INT NOT NULL DEFAULT 1,
    unit VARCHAR(32) NOT NULL DEFAULT 'ครั้ง',
    reward_points INT NOT NULL DEFAULT 15,
    difficulty VARCHAR(16) NOT NULL DEFAULT 'NORMAL',
    tracker_type VARCHAR(64) NOT NULL,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 2. User Daily Active Quests (5 random quests per user per date)
CREATE TABLE IF NOT EXISTS user_daily_quests (
    id BIGSERIAL PRIMARY KEY,
    discord_id VARCHAR(32) NOT NULL,
    quest_date DATE NOT NULL DEFAULT CURRENT_DATE,
    quest_id VARCHAR(32) NOT NULL REFERENCES daily_quest_master(quest_id) ON DELETE CASCADE,
    current_progress INT NOT NULL DEFAULT 0,
    is_completed BOOLEAN NOT NULL DEFAULT FALSE,
    is_claimed BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(discord_id, quest_date, quest_id)
);

CREATE INDEX IF NOT EXISTS idx_user_daily_quests_date ON user_daily_quests(discord_id, quest_date);

-- 3. Daily Summary & Jackpot Status per User per Date
CREATE TABLE IF NOT EXISTS user_quest_daily_summary (
    discord_id VARCHAR(32) NOT NULL,
    quest_date DATE NOT NULL DEFAULT CURRENT_DATE,
    completed_count INT NOT NULL DEFAULT 0,
    is_jackpot_claimed BOOLEAN NOT NULL DEFAULT FALSE,
    reroll_used INT NOT NULL DEFAULT 0,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    PRIMARY KEY(discord_id, quest_date)
);

-- 4. User Quest Streaks & Lifetime Statistics
CREATE TABLE IF NOT EXISTS user_quest_streaks (
    discord_id VARCHAR(32) PRIMARY KEY,
    current_streak INT NOT NULL DEFAULT 0,
    highest_streak INT NOT NULL DEFAULT 0,
    total_completed INT NOT NULL DEFAULT 0,
    last_completed_date DATE,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
