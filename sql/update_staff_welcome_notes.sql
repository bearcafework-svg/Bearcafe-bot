-- =========================================================================
-- 1. SQL สำหรับเซ็ตค่า notes ของทีมงานทุกรายการเป็นข้อความต้อนรับเริ่มต้น (ไม่เกิน 100 ตัวอักษร)
-- =========================================================================
UPDATE public.staff_members
SET notes = 'ยินดีต้อนรับนะ ขอให้เธอได้เจอเพื่อนดี ๆ มีความสุข สนุกกับทุกช่วงเวลา และสมหวังในทุกสิ่งที่ตั้งใจ';


-- =========================================================================
-- 2. SQL สำหรับเปิดใช้งาน Row Level Security (RLS) Policy (หากต้องการให้ Staff แก้ไขเอง)
-- =========================================================================
-- เปิดใช้งาน RLS บนตาราง staff_members
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

-- ลบ Policy เดิมถ้ามีอยู่แล้ว
DROP POLICY IF EXISTS "Allow staff members to update their own notes" ON public.staff_members;

-- สร้าง Policy อนุญาตให้สมาชิกทีมงานอัปเดตข้อมูล (notes) ของตนเอง
CREATE POLICY "Allow staff members to update their own notes"
ON public.staff_members
FOR UPDATE
USING (
  auth.uid() IN (
    SELECT id FROM public.profiles WHERE discord_id = staff_members.discord_id
  )
)
WITH CHECK (
  auth.uid() IN (
    SELECT id FROM public.profiles WHERE discord_id = staff_members.discord_id
  )
);
