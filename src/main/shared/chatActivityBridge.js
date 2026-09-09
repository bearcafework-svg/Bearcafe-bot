// src/main/shared/chatActivityBridge.js
// ตัวกลางประสานงานระหว่างระบบผึ้ง (Bee System) และระบบโฆษณาบรอดแคสต์ (Broadcast Scheduler)
// ป้องกันการส่งชนกันในห้องแชทเดียวกัน และดูแลสถานะข้อความเพื่อการลบ/แทนที่ (Clean Chat)

const activeBeesByChannel = new Map();
const lastBroadcastByChannel = new Map();

/**
 * บันทึกว่ามีผึ้ง active อยู่ใน channel
 * @param {string} channelId
 * @param {object} info - { messageId, customId, spawnedAt }
 */
function registerActiveBee(channelId, info = {}) {
  if (!channelId) return;
  activeBeesByChannel.set(channelId, {
    messageId: info.messageId || null,
    customId: info.customId || null,
    spawnedAt: info.spawnedAt || Date.now()
  });
}

/**
 * ล้างสถานะผึ้งใน channel เมื่อจบรอบหรือหมดเวลา
 * @param {string} channelId
 */
function clearActiveBee(channelId) {
  if (!channelId) return;
  activeBeesByChannel.delete(channelId);
}

/**
 * ตรวจสอบว่ามีผึ้ง active อยู่ใน channel หรือไม่
 * @param {string} channelId
 * @returns {boolean}
 */
function isBeeActive(channelId) {
  if (!channelId) return false;
  return activeBeesByChannel.has(channelId);
}

/**
 * บันทึกข้อความบรอดแคสต์ล่าสุดของ channel
 * @param {string} channelId
 * @param {string} messageId
 */
function recordBroadcast(channelId, messageId) {
  if (!channelId) return;
  lastBroadcastByChannel.set(channelId, {
    messageId,
    sentAt: Date.now()
  });
}

/**
 * ดึง Message ID ของบรอดแคสต์ล่าสุดใน channel (สำหรับ Delete & Replace)
 * @param {string} channelId
 * @returns {string|null}
 */
function getLastBroadcastMessageId(channelId) {
  if (!channelId) return null;
  return lastBroadcastByChannel.get(channelId)?.messageId || null;
}

/**
 * ตรวจสอบว่าสามารถส่งบรอดแคสต์ไปที่ channel ได้หรือไม่ (Collision Guard)
 * ห้ามส่งหากมีผึ้งกำลัง active อยู่ในห้องนั้น
 * @param {string} channelId
 * @returns {boolean}
 */
function canSendBroadcast(channelId) {
  if (!channelId) return true;
  return !isBeeActive(channelId);
}

/**
 * ตรวจสอบว่าสามารถสปอว์นผึ้งใน channel ได้หรือไม่ (Collision Guard)
 * หากเพิ่งมีบรอดแคสต์ส่งไปไม่เกิน cooldownMs (ค่าเริ่มต้น 10 นาที) หรือมีผึ้งค้างอยู่ จะคืนค่า false
 * @param {string} channelId
 * @param {number} cooldownMs ค่าหน่วงเวลา (default: 10 นาที)
 * @returns {boolean}
 */
function canSpawnBee(channelId, cooldownMs = 10 * 60 * 1000) {
  if (!channelId) return true;
  if (isBeeActive(channelId)) return false;

  const lastBroadcast = lastBroadcastByChannel.get(channelId);
  if (!lastBroadcast) return true;

  const elapsed = Date.now() - lastBroadcast.sentAt;
  return elapsed >= cooldownMs;
}

/**
 * คำนวณเวลาที่เหลือจนกว่าจะสามารถสปอว์นผึ้งได้ (ms)
 * @param {string} channelId
 * @param {number} cooldownMs
 * @returns {number} เวลาเป็น ms (0 หากพร้อมสปอว์นได้ทันที)
 */
function getRemainingBeeSpawnDelay(channelId, cooldownMs = 10 * 60 * 1000) {
  if (!channelId) return 0;
  const lastBroadcast = lastBroadcastByChannel.get(channelId);
  if (!lastBroadcast) return 0;

  const elapsed = Date.now() - lastBroadcast.sentAt;
  if (elapsed < cooldownMs) {
    return cooldownMs - elapsed;
  }
  return 0;
}

module.exports = {
  registerActiveBee,
  clearActiveBee,
  isBeeActive,
  recordBroadcast,
  getLastBroadcastMessageId,
  canSendBroadcast,
  canSpawnBee,
  getRemainingBeeSpawnDelay
};
