-- ===================================================
-- sql/create_tenant_welcome_configs.sql
-- ตารางเก็บคอนฟิกระบบข้อความต้อนรับสมาชิกใหม่ (Multi-Tenant Welcome System)
-- ===================================================

CREATE TABLE IF NOT EXISTS public.tenant_welcome_configs (
    guild_id VARCHAR(32) PRIMARY KEY,
    channel_id VARCHAR(32) DEFAULT NULL,
    is_enabled BOOLEAN NOT NULL DEFAULT false,
    message_content TEXT NOT NULL DEFAULT 'ยินดีต้อนรับ {user} สู่ {server_name}! 🎉',
    thumbnail_url TEXT DEFAULT NULL,
    banner_url TEXT DEFAULT NULL,
    accent_color VARCHAR(16) DEFAULT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tenant_welcome_configs_guild 
ON public.tenant_welcome_configs(guild_id);
