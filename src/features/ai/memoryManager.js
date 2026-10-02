// ===================================================
// src/features/ai/memoryManager.js
// Per-Channel Conversation Memory in RAM (Sliding Window)
// ===================================================

const AI_CONFIG = require("./aiConfig");

// channelId -> { messages: [{ role, authorName, content, timestamp }], lastActive: number }
const channelMemoryStore = new Map();

/**
 * ประมาณการ Token สำหรับตัดข้อความไม่ให้เกิน Budget
 * (ข้อความภาษาไทย/อังกฤษผสม ประมาณ 2.5 ตัวอักษร = 1 Token)
 */
function estimateTokens(text) {
  if (!text) return 0;
  return Math.ceil(String(text).length / 2.5);
}

/**
 * ดึง Session ประวัติของห้อง (สร้างใหม่ถ้าไม่มี หรือหมดอายุ)
 */
function getChannelSession(channelId) {
  const now = Date.now();
  let session = channelMemoryStore.get(channelId);

  if (!session || (now - session.lastActive > AI_CONFIG.LIMITS.MEMORY_TTL_MS)) {
    session = {
      messages: [],
      lastActive: now,
    };
    channelMemoryStore.set(channelId, session);
  } else {
    session.lastActive = now;
  }

  return session;
}

/**
 * บันทึกข้อความเข้า Channel Memory
 * (รวมถึงข้อความที่ถูก Backoff ระงับ เพื่อให้ Memory สะท้อนบทสนทนาจริงของห้อง)
 *
 * @param {string} channelId
 * @param {'user'|'model'} role
 * @param {string} authorName
 * @param {string} content
 */
function recordMessage(channelId, role, authorName, content) {
  if (!content || !String(content).trim()) return;

  const session = getChannelSession(channelId);
  session.messages.push({
    role,
    authorName: authorName || (role === "model" ? "พี่หมี" : "สมาชิก"),
    content: String(content).trim(),
    timestamp: Date.now(),
  });

  // ตัด sliding window ตาม Max Turns
  if (session.messages.length > AI_CONFIG.LIMITS.MEMORY_MAX_TURNS) {
    session.messages = session.messages.slice(-AI_CONFIG.LIMITS.MEMORY_MAX_TURNS);
  }

  // ตรวจสอบและตัดตาม Max Estimated Tokens
  let totalEstimatedTokens = 0;
  for (let i = session.messages.length - 1; i >= 0; i--) {
    const tokens = estimateTokens(session.messages[i].content);
    totalEstimatedTokens += tokens;

    if (totalEstimatedTokens > AI_CONFIG.LIMITS.MEMORY_MAX_ESTIMATED_TOKENS && i > 0) {
      session.messages = session.messages.slice(i + 1);
      break;
    }
  }
}

/**
 * แปลง Channel Memory ให้อยู่ในรูป Format ของ Gemini API (contents array)
 * โดยระบุชื่อผู้พูดเพื่อให้ AI แยกแยะบริบทคนในห้องได้ถูกต้อง
 */
function getFormattedHistory(channelId) {
  const session = getChannelSession(channelId);
  const formatted = [];

  for (const msg of session.messages) {
    if (msg.role === "model") {
      formatted.push({
        role: "model",
        parts: [{ text: msg.content }],
      });
    } else {
      formatted.push({
        role: "user",
        parts: [{ text: `[${msg.authorName}]: ${msg.content}` }],
      });
    }
  }

  return formatted;
}

/**
 * ตรวจสอบจำนวนข้อความมนุษย์ล่าสุดติดต่อกัน (สำหรับกลไก Human-to-Human Backoff)
 */
function getConsecutiveHumanMessagesCount(channelId) {
  const session = getChannelSession(channelId);
  let count = 0;

  for (let i = session.messages.length - 1; i >= 0; i--) {
    if (session.messages[i].role === "user") {
      count++;
    } else {
      break;
    }
  }

  return count;
}

/**
 * ล้างประวัติ Memory ของห้อง
 */
function clearChannelMemory(channelId) {
  channelMemoryStore.delete(channelId);
}

module.exports = {
  recordMessage,
  getFormattedHistory,
  getConsecutiveHumanMessagesCount,
  clearChannelMemory,
  estimateTokens,
};
