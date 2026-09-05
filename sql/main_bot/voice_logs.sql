-- sql/voice_logs.sql
-- 1. สร้างตารางเก็บประวัติการเข้า/ออกห้องคุยเสียง
CREATE TABLE IF NOT EXISTS voice_logs (
  id BIGSERIAL PRIMARY KEY,
  user_id TEXT NOT NULL,
  username TEXT,
  channel_id TEXT NOT NULL,
  channel_name TEXT,
  event_type TEXT NOT NULL, -- 'join', 'leave', 'move'
  from_channel_id TEXT,
  from_channel_name TEXT,
  timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. สร้าง Index เพื่อให้อัปเดตและเรียกดูประวัติของแต่ละ User ได้รวดเร็วขึ้น
CREATE INDEX IF NOT EXISTS idx_voice_logs_user_timestamp ON voice_logs (user_id, timestamp);

-- 3. เปิดใช้งาน Extension pg_cron ในฐานข้อมูล Supabase เพื่อสเกดดูลคำสั่งลบประวัติย้อนหลังอัตโนมัติ
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 4. ตั้งเวลาลบข้อมูลอัตโนมัติ ทุกๆ เที่ยงคืน (ลบแถวที่มีอายุมากกว่า 1 วันทิ้ง)
SELECT cron.schedule(
  'clear-old-voice-logs',
  '0 0 * * *', -- รันทุกวันเวลา 00:00 (UTC)
  $$ DELETE FROM voice_logs WHERE timestamp < NOW() - INTERVAL '1 day' $$
);
