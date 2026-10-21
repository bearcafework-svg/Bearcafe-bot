-- ===================================================
-- Migration: เพิ่มคอลัมน์ type และ Composite Primary Key (guild_id, type)
-- ตาราง: tenant_welcome_configs
-- รองรับทั้งข้อความต้อนรับ (welcome) และข้อความอำลา (goodbye) ในตารางเดียว
-- ===================================================

DO $$
BEGIN
    -- 1. เพิ่มคอลัมน์ type ถ้ายังไม่มี
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' 
          AND table_name = 'tenant_welcome_configs' 
          AND column_name = 'type'
    ) THEN
        ALTER TABLE public.tenant_welcome_configs ADD COLUMN type TEXT NOT NULL DEFAULT 'welcome';
    END IF;

    -- 2. เปลี่ยน Primary Key เป็น (guild_id, type)
    IF EXISTS (
        SELECT 1 FROM information_schema.table_constraints 
        WHERE table_schema = 'public' 
          AND table_name = 'tenant_welcome_configs' 
          AND constraint_type = 'PRIMARY KEY'
    ) THEN
        ALTER TABLE public.tenant_welcome_configs DROP CONSTRAINT tenant_welcome_configs_pkey;
    END IF;

    ALTER TABLE public.tenant_welcome_configs ADD PRIMARY KEY (guild_id, type);
END $$;
