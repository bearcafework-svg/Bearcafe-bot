-- ══════════════════════════════════════════════════════════════════
-- Migration: Drop Secret Chat Tables & Functions (Safe Version)
-- ══════════════════════════════════════════════════════════════════

-- 1. ลบตารางที่เกี่ยวข้องของระบบสุ่มแชท Discord Bot
-- (การใช้ CASCADE จะลบ Foreign Keys, Indexes และ Triggers ของตารางทั้งหมดให้อัตโนมัติ)
DROP TABLE IF EXISTS secret_chat_active_rooms CASCADE;
DROP TABLE IF EXISTS secret_chat_ratings CASCADE;
DROP TABLE IF EXISTS secret_chat_logs CASCADE;
DROP TABLE IF EXISTS discord_secret_reports CASCADE;
DROP TABLE IF EXISTS discord_secret_sessions CASCADE;

-- 2. ลบฟังก์ชันที่เกี่ยวข้อง (ถ้ามี)
DROP FUNCTION IF EXISTS trg_increment_session_report_count() CASCADE;
DROP FUNCTION IF EXISTS increment_discord_strike(text) CASCADE;

-- ยืนยันการทำงาน
SELECT 'Secret Chat tables and functions dropped successfully.' AS status;
