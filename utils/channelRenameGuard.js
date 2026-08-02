// utils/channelRenameGuard.js
// ระบบป้องกันและจัดการ Discord Rate Limit ในการเปลี่ยนชื่อห้องแชนแนลเสียง
// ข้อจำกัด Discord API: เปลี่ยนชื่อห้องได้ไม่เกิน 2 ครั้ง ในระยะเวลา 10 นาที ต่อ 1 แชนแนล (setName)

const RENAME_LIMIT = 2;
const RENAME_WINDOW_MS = 10 * 60 * 1000; // 10 นาที

// Map เก็บประวัติ timestamp การเปลี่ยนชื่อห้อง (key: channelId, value: number[])
const renameHistoryMap = new Map();

/**
 * ทำความสะอาดประวัติ timestamp ที่เก่าเกิน 10 นาทีออก
 * @param {number[]} history 
 * @returns {number[]}
 */
function cleanHistory(history) {
  const now = Date.now();
  return history.filter((ts) => now - ts < RENAME_WINDOW_MS);
}

/**
 * ตรวจสอบว่าแชนแนลนี้ติด Rate Limit การเปลี่ยนชื่อห้องหรือไม่
 * @param {string} channelId 
 * @returns {{ allowed: boolean, remainingMs: number }}
 */
function checkRenameRateLimit(channelId) {
  let history = renameHistoryMap.get(channelId) || [];
  history = cleanHistory(history);
  renameHistoryMap.set(channelId, history);

  if (history.length >= RENAME_LIMIT) {
    const oldestTimestamp = history[0];
    const remainingMs = RENAME_WINDOW_MS - (Date.now() - oldestTimestamp);
    return { allowed: false, remainingMs: Math.max(remainingMs, 1000) };
  }

  return { allowed: true, remainingMs: 0 };
}

/**
 * บันทึก timestamp เมื่อมีการเปลี่ยนชื่อห้องสำเร็จ
 * @param {string} channelId 
 */
function recordRename(channelId) {
  let history = renameHistoryMap.get(channelId) || [];
  history = cleanHistory(history);
  history.push(Date.now());
  renameHistoryMap.set(channelId, history);
}

/**
 * ฟังก์ชันพยายามเปลี่ยนชื่อห้องอย่างปลอดภัย (ดักจับ Rate Limit อัตโนมัติ)
 * @param {GuildChannel} channel 
 * @param {string} newName 
 * @returns {Promise<{ success: boolean, rateLimited: boolean, remainingSeconds?: number, error?: string }>}
 */
async function safeSetChannelName(channel, newName) {
  if (!channel || typeof channel.setName !== "function") {
    return { success: false, rateLimited: false, error: "Invalid channel object" };
  }

  const { allowed, remainingMs } = checkRenameRateLimit(channel.id);
  if (!allowed) {
    const remainingSeconds = Math.ceil(remainingMs / 1000);
    return { success: false, rateLimited: true, remainingSeconds };
  }

  try {
    await channel.setName(newName);
    recordRename(channel.id);
    return { success: true, rateLimited: false };
  } catch (err) {
    // 429 = Rate Limited, 50035 = Invalid Form Body
    if (err.status === 429 || err.code === 429 || (err.message && err.message.toLowerCase().includes("rate limit"))) {
      recordRename(channel.id); // Mark to prevent immediate retry
      return { success: false, rateLimited: true, remainingSeconds: 600 };
    }
    return { success: false, rateLimited: false, error: err.message };
  }
}

module.exports = {
  checkRenameRateLimit,
  recordRename,
  safeSetChannelName,
};
