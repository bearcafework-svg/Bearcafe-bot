-- ====================================================================
-- sql/create_tenant_store_items_v2.sql
-- ตารางไอเทมร้านค้าแลกยศบอทคุมะ (Kuma Role Store System - Multi-Tenant)
-- รองรับการเพิ่ม แก้ไข ลบ ไอเทมไม่จำกัดสล็อต (Free สูงสุด 10, Premium สูงสุด 30)
-- ====================================================================

CREATE TABLE IF NOT EXISTS public.tenant_store_items_v2 (
    id BIGSERIAL PRIMARY KEY,
    guild_id VARCHAR(32) NOT NULL,
    name TEXT NOT NULL,
    description TEXT DEFAULT '',
    points_cost INT NOT NULL DEFAULT 100,
    reward_type VARCHAR(16) NOT NULL DEFAULT 'role',
    role_id VARCHAR(32) NOT NULL,
    stock INT NOT NULL DEFAULT -1, -- -1 = ไม่จำกัด, 0 = สินค้าหมด, >0 = จำนวนชิ้นคงเหลือ
    emoji TEXT DEFAULT '🎁',
    is_active BOOLEAN DEFAULT true,
    wins_required INT NOT NULL DEFAULT 0,
    required_role_id VARCHAR(32) DEFAULT NULL,
    sort_order INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ดัชนีค้นหาตาม Guild ID และสถานะเปิดใช้งาน
CREATE INDEX IF NOT EXISTS idx_tenant_items_v2_guild ON public.tenant_store_items_v2 (guild_id, is_active);

-- เปิดใช้งาน RLS และนโยบายความปลอดภัย
ALTER TABLE public.tenant_store_items_v2 ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public select tenant_store_items_v2" ON public.tenant_store_items_v2;
CREATE POLICY "Public select tenant_store_items_v2" ON public.tenant_store_items_v2 FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Service role full tenant_store_items_v2" ON public.tenant_store_items_v2;
CREATE POLICY "Service role full tenant_store_items_v2" ON public.tenant_store_items_v2 FOR ALL TO service_role USING (true) WITH CHECK (true);

-- เพิ่มคอลัมน์ item_id ใน tenant_store_redemptions เพื่อรองรับไอเทม V2
ALTER TABLE public.tenant_store_redemptions ADD COLUMN IF NOT EXISTS item_id BIGINT;
ALTER TABLE public.tenant_store_redemptions ADD COLUMN IF NOT EXISTS role_id VARCHAR(32);
