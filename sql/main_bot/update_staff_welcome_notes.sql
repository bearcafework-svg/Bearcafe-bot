-- =========================================================================
-- 1. SQL สำหรับเซ็ตค่า notes ของทีมงานทุกรายการเป็นข้อความต้อนรับเริ่มต้น (ไม่เกิน 100 ตัวอักษร)
-- =========================================================================
UPDATE public.staff_members
SET notes = 'ยินดีต้อนรับนะ ขอให้เธอได้เจอเพื่อนดี ๆ มีความสุข สนุกกับทุกช่วงเวลา และสมหวังในทุกสิ่งที่ตั้งใจ';

-- =========================================================================
-- 2. SQL ลบแถวข้อมูลซ้ำในตาราง staff_members (เก็บเฉพาะแถวที่อัปเดตล่าสุด) และใส่ Constraint ป้องกันแถวซ้ำ
-- =========================================================================
DELETE FROM public.staff_members a
USING public.staff_members b
WHERE a.discord_id = b.discord_id
  AND a.updated_at < b.updated_at;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'staff_members_discord_id_key'
    ) THEN
        ALTER TABLE public.staff_members ADD CONSTRAINT staff_members_discord_id_key UNIQUE (discord_id);
    END IF;
END $$;

-- =========================================================================
-- 3. SQL สำหรับเปิดใช้งาน Row Level Security (RLS) Policy (หากต้องการให้ Staff แก้ไขเอง)
-- =========================================================================
ALTER TABLE public.staff_members ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow staff members to update their own notes" ON public.staff_members;

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
