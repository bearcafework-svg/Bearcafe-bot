-- ===================================================
-- sql/add_custom_layout_json_to_tenant_store_configs.sql
-- เพิ่มคอลัมน์ custom_layout_json ให้กับตาราง tenant_store_configs สำหรับ Akari Store
-- ===================================================

ALTER TABLE tenant_store_configs 
ADD COLUMN IF NOT EXISTS custom_layout_json JSONB DEFAULT NULL;

