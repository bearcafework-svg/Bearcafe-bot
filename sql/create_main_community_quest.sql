-- ============================================================================
-- 🐻 Bear Cafe Main Community Quest System (เควสใหญ่ / เควสหมีช่วยหมีพลัส!)
-- ============================================================================

-- 1. ตารางเควสใหญ่หลัก (main_community_quests)
CREATE TABLE IF NOT EXISTS main_community_quests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL DEFAULT 'bear_plus_voice_quest',
    title TEXT NOT NULL DEFAULT 'เควสหมีช่วยหมีพลัส!',
    description TEXT,
    banner_url TEXT NOT NULL DEFAULT 'https://cdn.discordapp.com/attachments/1524704267015819274/1555123695469592596/1_.._2569_14_45_36.png?backend=b2&ex=6abf614d&is=6abe0fcd&hm=45af7851904b36de2b40b98761e82d7f1defd4f187d38e329138dcf64bb8208d&',
    target_hours INTEGER NOT NULL DEFAULT 3000,
    current_minutes BIGINT NOT NULL DEFAULT 0,
    min_minutes_eligible INTEGER NOT NULL DEFAULT 60, -- 1 ชั่วโมงขึ้นไปถึงจะมีสิทธิ์รับรางวัล
    reward_role_id TEXT NOT NULL DEFAULT '1426587608527667322',
    reward_points INTEGER NOT NULL DEFAULT 7500,
    congrats_role_id TEXT NOT NULL DEFAULT '1144700895020462200', -- Role ที่แท็กแสดงความยินดีในแบบที่ 2
    channel_id TEXT,
    message_id TEXT,
    start_time TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    end_time TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '7 days'),
    is_active BOOLEAN NOT NULL DEFAULT true,
    is_completed BOOLEAN NOT NULL DEFAULT false,
    completed_at TIMESTAMPTZ,
    rewards_distributed BOOLEAN NOT NULL DEFAULT false,
    rewards_distributed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. ตารางผู้เข้าร่วมสะสมเวลาในเควสใหญ่ (main_community_quest_participants)
CREATE TABLE IF NOT EXISTS main_community_quest_participants (
    quest_id UUID NOT NULL REFERENCES main_community_quests(id) ON DELETE CASCADE,
    user_id TEXT NOT NULL,
    username TEXT,
    total_minutes INTEGER NOT NULL DEFAULT 0,
    last_active_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    is_eligible BOOLEAN GENERATED ALWAYS AS (total_minutes >= 60) STORED,
    reward_granted BOOLEAN NOT NULL DEFAULT false,
    reward_granted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (quest_id, user_id)
);

-- Indexes สำหรับการค้นหาและจัดอันดับ
CREATE INDEX IF NOT EXISTS idx_mcq_active ON main_community_quests(is_active, is_completed);
CREATE INDEX IF NOT EXISTS idx_mcqp_quest_user ON main_community_quest_participants(quest_id, user_id);
CREATE INDEX IF NOT EXISTS idx_mcqp_quest_minutes ON main_community_quest_participants(quest_id, total_minutes DESC);
CREATE INDEX IF NOT EXISTS idx_mcqp_quest_last_active ON main_community_quest_participants(quest_id, last_active_at DESC);

-- 3. ฟังก์ชัน RPC เพิ่มเวลานาทีให้ผู้เข้าร่วมและเควสใหญ่แบบ Atomic
CREATE OR REPLACE FUNCTION increment_main_quest_minutes(
    p_quest_id UUID,
    p_user_id TEXT,
    p_username TEXT,
    p_minutes INTEGER DEFAULT 1
)
RETURNS TABLE (
    new_user_minutes INTEGER,
    new_quest_minutes BIGINT,
    quest_target_hours INTEGER,
    is_quest_completed BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_user_minutes INTEGER;
    v_quest_minutes BIGINT;
    v_target_hours INTEGER;
    v_is_completed BOOLEAN;
BEGIN
    -- 1. บันทึก/อัปเดตเวลารายบุคคล
    INSERT INTO main_community_quest_participants (quest_id, user_id, username, total_minutes, last_active_at, updated_at)
    VALUES (p_quest_id, p_user_id, p_username, p_minutes, NOW(), NOW())
    ON CONFLICT (quest_id, user_id)
    DO UPDATE SET
        total_minutes = main_community_quest_participants.total_minutes + p_minutes,
        username = COALESCE(EXCLUDED.username, main_community_quest_participants.username),
        last_active_at = NOW(),
        updated_at = NOW()
    RETURNING total_minutes INTO v_user_minutes;

    -- 2. อัปเดตเวลารวมของเควส
    UPDATE main_community_quests
    SET
        current_minutes = current_minutes + p_minutes,
        updated_at = NOW()
    WHERE id = p_quest_id
    RETURNING current_minutes, target_hours, is_completed
    INTO v_quest_minutes, v_target_hours, v_is_completed;

    RETURN QUERY
    SELECT v_user_minutes, v_quest_minutes, v_target_hours, v_is_completed;
END;
$$;

-- 4. Enable RLS
ALTER TABLE main_community_quests ENABLE ROW LEVEL SECURITY;
ALTER TABLE main_community_quest_participants ENABLE ROW LEVEL SECURITY;

-- 5. RLS Policies
DO $$
BEGIN
  -- main_community_quests
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read active main quests') THEN
    CREATE POLICY "Allow public read active main quests" ON main_community_quests FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service role manage main quests') THEN
    CREATE POLICY "Allow service role manage main quests" ON main_community_quests FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated manage main quests') THEN
    CREATE POLICY "Allow authenticated manage main quests" ON main_community_quests FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;

  -- main_community_quest_participants
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow public read main quest participants') THEN
    CREATE POLICY "Allow public read main quest participants" ON main_community_quest_participants FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow service role manage main quest participants') THEN
    CREATE POLICY "Allow service role manage main quest participants" ON main_community_quest_participants FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'Allow authenticated manage main quest participants') THEN
    CREATE POLICY "Allow authenticated manage main quest participants" ON main_community_quest_participants FOR ALL TO authenticated USING (true) WITH CHECK (true);
  END IF;
END $$;
