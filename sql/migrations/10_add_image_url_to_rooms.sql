-- sql/migrations/10_add_image_url_to_rooms.sql
-- เพิ่มคอลัมน์ image_url สำหรับบันทึกรูปภาพแผงควบคุมห้อง VIP และบ้านเช่า

-- 1. เพิ่มคอลัมน์ในตารางบ้านเช่า (rent_house_settings)
ALTER TABLE public.rent_house_settings 
ADD COLUMN IF NOT EXISTS image_url TEXT NULL;

-- 2. เพิ่มคอลัมน์ในตารางห้อง VIP (smart_room_presets)
ALTER TABLE public.smart_room_presets 
ADD COLUMN IF NOT EXISTS image_url TEXT NULL;
