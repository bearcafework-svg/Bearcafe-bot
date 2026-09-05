-- ===================================================
-- guild_structure_backups.sql — ตารางสำรองโครงสร้างเซิร์ฟเวอร์
-- ===================================================

CREATE TABLE IF NOT EXISTS guild_structure_backups (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    guild_id VARCHAR(64) NOT NULL,
    backup_name VARCHAR(255) NOT NULL DEFAULT 'Manual Backup',
    created_by VARCHAR(64) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    
    -- ข้อมูลโครงสร้าง
    categories JSONB NOT NULL DEFAULT '[]'::jsonb,
    channels JSONB NOT NULL DEFAULT '[]'::jsonb,
    roles JSONB NOT NULL DEFAULT '[]'::jsonb,
    special_channels JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_guild_structure_backups_guild ON guild_structure_backups(guild_id, created_at DESC);
