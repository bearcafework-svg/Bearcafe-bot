-- Migration: add_session_room_fields
-- ขยาย heal_jai_orders_sessions เพื่อรองรับ Session Room, Timer และ Audit Data Points

-- 1. เพิ่มคอลัมน์ service_mode (เก็บ chat/voice)
ALTER TABLE heal_jai_orders_sessions
  ADD COLUMN IF NOT EXISTS service_mode TEXT DEFAULT 'chat' 
    CHECK (service_mode IN ('chat', 'voice'));

-- 2. เพิ่มคอลัมน์ expires_at สำหรับ Session Timer (bot-restart-safe)
ALTER TABLE heal_jai_orders_sessions
  ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ;

-- 3. เพิ่มคอลัมน์ ended_early สำหรับ audit log data point (จบก่อนเวลาที่กำหนด)
ALTER TABLE heal_jai_orders_sessions
  ADD COLUMN IF NOT EXISTS ended_early BOOLEAN DEFAULT false;

-- 4. แก้ CHECK constraint ของ session_status ให้รองรับ status ใหม่
ALTER TABLE heal_jai_orders_sessions
  DROP CONSTRAINT IF EXISTS heal_jai_orders_sessions_session_status_check;

ALTER TABLE heal_jai_orders_sessions
  ADD CONSTRAINT heal_jai_orders_sessions_session_status_check
    CHECK (session_status IN (
      'WAITING',
      'DISPATCHING',
      'ACTIVE',
      'IN_PROGRESS',
      'COMPLETED',
      'CANCELLED',
      'WAITING_FOR_PROVIDER',
      'WAITING_FOR_CUSTOMER',
      'PROVIDER_NO_SHOW',
      'CUSTOMER_NO_SHOW'
    ));
