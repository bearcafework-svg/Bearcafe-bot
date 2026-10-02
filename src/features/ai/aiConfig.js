// ===================================================
// src/features/ai/aiConfig.js
// Central Configuration for Bear Cafe AI System
// ===================================================

const AI_CONFIG = {
  // Model & Endpoint settings (Configurable via ENV)
  MODEL_NAME: process.env.AI_MODEL_NAME || "gemini-2.0-flash",
  DEDICATED_CHANNEL_ID: process.env.AI_DEDICATED_CHANNEL_ID || "1544088196332134491",

  // Internal Daily Request Budget (Safety guard for cost control)
  DAILY_INTERNAL_BUDGET: parseInt(process.env.AI_DAILY_BUDGET, 10) || 1000,

  // Budget Tiers (Based on % of internal daily budget)
  BUDGET_TIERS: {
    NORMAL: 0.70,      // 0% - 69%: Full natural participation
    NEAR_LIMIT: 0.85,  // 70% - 84%: Reduced spontaneous chatter
    CRITICAL: 1.00,    // 85% - 99%: Direct Mention / Direct Reply only
    EXHAUSTED: 1.00,   // >= 100%: LLM disabled, static reply on direct mention only
  },

  // Technical & Pipeline Limits
  LIMITS: {
    DEBOUNCE_WAIT_MS: 2500,               // หน่วงเวลารวบประโยคพิมพ์รัว (มิลลิวินาที)
    USER_COOLDOWN_SECONDS: 6,             // คูลดาวน์การยิง request ต่อ user
    MEMORY_MAX_TURNS: 15,                 // จำนวนข้อความย้อนหลังสูงสุดใน RAM ต่อห้อง
    MEMORY_MAX_ESTIMATED_TOKENS: 1800,    // เพดาน token ประวัติบทสนทนา
    MEMORY_TTL_MS: 15 * 60 * 1000,        // ล้างห้องถ้าไม่มีการคุยเกิน 15 นาที
    H2H_BACKOFF_THRESHOLD: 4,             // ถ้ามนุษย์คุยกันเองติดกัน 4 ข้อความโดยไม่เกี่ยวบอท ให้พัก LLM
    MAX_KNOWLEDGE_SNIPPETS_IN_PROMPT: 3,  // ดึงความรู้ไม่เกิน 3 เรื่องที่ตรงที่สุดเข้า Prompt
  },

  // Static Fallback message when Daily Budget is exhausted (sent only on Direct Mention/Reply)
  STATIC_EXHAUSTED_MESSAGE: "🐻 ตอนนี้พี่หมีขอตัวไปพักผ่อนชงกาแฟก่อนน้า โควตาประจำวันของระบบเต็มแล้วงับ ไว้พรุ่งนี้มาคุยกันใหม่นะคะ ☕✨",

  // Asia/Bangkok Time Slot Label Resolver
  getTimeSlotBangkok() {
    const now = new Date();
    // UTC to Bangkok (UTC+7)
    const bangkokHour = (now.getUTCHours() + 7) % 24;

    if (bangkokHour >= 3 && bangkokHour < 6) {
      return { slot: "เช้ามืด", hour: bangkokHour };
    } else if (bangkokHour >= 6 && bangkokHour < 12) {
      return { slot: "เช้า", hour: bangkokHour };
    } else if (bangkokHour >= 12 && bangkokHour < 17) {
      return { slot: "กลางวัน", hour: bangkokHour };
    } else if (bangkokHour >= 17 && bangkokHour < 21) {
      return { slot: "เย็น", hour: bangkokHour };
    } else if (bangkokHour >= 21 && bangkokHour < 24) {
      return { slot: "กลางคืน", hour: bangkokHour };
    } else {
      // 00:00 - 02:59
      return { slot: "ดึก", hour: bangkokHour };
    }
  },
};

module.exports = AI_CONFIG;
