-- ══════════════════════════════════════════════════════════════════
-- Migration: Drop Secret Chat (ระบบสุ่มแชทหาเพื่อน) Tables & Functions
-- รันคำสั่งนี้ใน Supabase SQL Editor เพื่อลบข้อมูลและตารางทั้งหมดที่เกี่ยวกับระบบสุ่มแชท
-- ══════════════════════════════════════════════════════════════════

-- 1. ลบตารางที่ใช้งานโดย secretChat ในปัจจุบัน
DROP TABLE IF EXISTS secret_chat_active_rooms CASCADE;
DROP TABLE IF EXISTS secret_chat_ratings CASCADE;
DROP TABLE IF EXISTS secret_chat_logs CASCADE;

-- 2. ลบตาราง metadata/sessions ของระบบแชทลับ (companion/legacy tables)
DROP TABLE IF EXISTS discord_secret_reports CASCADE;
DROP TABLE IF EXISTS discord_secret_sessions CASCADE;

-- 3. ลบ Triggers & ฟังก์ชันที่เกี่ยวข้องกับ secret chat
DROP TRIGGER IF EXISTS trg_report_count ON discord_secret_reports;
DROP FUNCTION IF EXISTS trg_increment_session_report_count() CASCADE;
DROP FUNCTION IF EXISTS increment_discord_strike(text) CASCADE;
DROP FUNCTION IF EXISTS match_secret_chat CASCADE;

-- ยืนยันการทำงาน
SELECT 'Secret Chat tables, triggers, and functions dropped successfully.' AS status;
