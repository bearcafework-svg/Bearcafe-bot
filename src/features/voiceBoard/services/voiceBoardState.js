// ===================================================
// src/features/voiceBoard/services/voiceBoardState.js
// จัดการสถานะข้อความบอร์ดห้องเสียง (Message ID, Channel ID) และ Debounce Real-time Updater
// ===================================================

const { getSupabaseClient } = require("../../../services/supabaseClient");
const { getRedis } = require("../../../../state/redisClient");
const { getVoiceBoardData } = require("./voiceBoardService");
const { buildVoiceBoardPayload } = require("../components/voiceBoardPayloads");

const THROTTLE_INTERVAL_MS = 30000; // รอบเวลาขั้นต่ำระหว่างการ Edit บอร์ด (30 วินาที ป้องกัน Discord Rate Limit & UI Flicker)
const BURST_DEBOUNCE_MS = 4000;    // หน่วงเวลา 4 วินาทีเพื่อรวบ event ที่เกิดพร้อมๆ กัน
const CONFIG_KEY = "voice_board_config";
const IS_VOICE_BOARD_ENABLED = process.env.ENABLE_VOICE_BOARD === "true"; // ปิดระบบชั่วคราวตามคำสั่งผู้ใช้

// Cooldown สำหรับระบบหาตี้ LFG
const USER_COOLDOWN_MS = 15 * 60 * 1000;    // 15 นาที ต่อคน
const CHANNEL_COOLDOWN_MS = 30 * 60 * 1000; // 30 นาที ต่อห้อง
const userCooldowns = new Map();
const channelCooldowns = new Map();

// สถานะ Spotlight ปัจจุบัน { userId, voiceChannelId, roleId, roleName, roleEmoji, message, expiresAt }
let activeSpotlight = null;

// เก็บสถานะบอร์ดในหน่วยความจำ RAM
// { channelId: string, messageId: string, guildId: string }
let boardConfig = null;
let queuedTimer = null;
let isUpdating = false;
let lastEditTimestamp = 0;
let lastRenderedFingerprint = "";

/**
 * คำนวณ Fingerprint ย่อของรายการห้องและ Spotlight เพื่อตรวจจับความเปลี่ยนแปลง
 */
function computeRoomsFingerprint(rooms, spotlight) {
  const spotPart = spotlight
    ? `${spotlight.userId}:${spotlight.voiceChannelId}:${spotlight.message}:${spotlight.expiresAt}`
    : "none";
  if (!rooms || rooms.length === 0) return `empty|${spotPart}`;
  return (
    rooms
      .map(
        (r) =>
          `${r.id}:${r.memberCount}/${r.userLimit}:${r.primaryGame || ""}:${r.isStreaming ? 1 : 0}:${r.isLooking ? 1 : 0}`
      )
      .join("|") + `|${spotPart}`
  );
}

/**
 * ตรวจสอบ Cooldown สำหรับการกดหาตี้ LFG
 */
function checkLfgCooldown(userId, channelId) {
  const now = Date.now();
  const userLast = userCooldowns.get(userId) || 0;
  if (now - userLast < USER_COOLDOWN_MS) {
    const remainingMin = Math.ceil((USER_COOLDOWN_MS - (now - userLast)) / 60000);
    return {
      allowed: false,
      reason: `⏳ คุณเพิ่งกดเรียกเพื่อนไป กรุณารออีก **${remainingMin} นาที** ก่อนใช้งานใหม่นะคะ`,
    };
  }

  const channelLast = channelCooldowns.get(channelId) || 0;
  if (now - channelLast < CHANNEL_COOLDOWN_MS) {
    const remainingMin = Math.ceil((CHANNEL_COOLDOWN_MS - (now - channelLast)) / 60000);
    return {
      allowed: false,
      reason: `⏳ ห้องนี้เพิ่งถูกกดเรียกเพื่อนไป กรุณารออีก **${remainingMin} นาที** เพื่อไม่ให้เป็นการปิงรบกวนบ่อยเกินไปนะคะ`,
    };
  }

  return { allowed: true };
}

/**
 * บันทึกเวลา Cooldown สำหรับผู้ใช้และห้องเสียง
 */
function recordLfgCooldown(userId, channelId) {
  const now = Date.now();
  userCooldowns.set(userId, now);
  channelCooldowns.set(channelId, now);
}

/**
 * ตั้งค่า Spotlight ป้ายหาเพื่อน
 */
function setSpotlight(spotlightData) {
  activeSpotlight = spotlightData;
}

/**
 * ดึงสถานะ Spotlight ปัจจุบัน (หากหมดอายุจะถูกเคลียร์ออกทันที)
 */
function getSpotlight() {
  if (activeSpotlight && Date.now() > activeSpotlight.expiresAt) {
    activeSpotlight = null;
  }
  return activeSpotlight;
}

/**
 * ล้างป้าย Spotlight
 */
function clearSpotlight() {
  activeSpotlight = null;
}

/**
 * โหลดการตั้งค่าบอร์ดจาก Supabase / Redis / RAM
 */
async function loadVoiceBoardConfig() {
  if (boardConfig) return boardConfig;

  // 1. ตรวจสอบจาก Redis
  try {
    const redis = getRedis();
    if (redis) {
      const data = await redis.get(`config:${CONFIG_KEY}`);
      if (data) {
        boardConfig = typeof data === "string" ? JSON.parse(data) : data;
        return boardConfig;
      }
    }
  } catch (e) {
    // ignore redis error
  }

  // 2. ตรวจสอบจาก Supabase (site_settings)
  try {
    const supabase = getSupabaseClient();
    if (supabase) {
      const { data, error } = await supabase
        .from("site_settings")
        .select("value")
        .eq("key", CONFIG_KEY)
        .maybeSingle();

      if (!error && data?.value) {
        boardConfig = data.value;
        return boardConfig;
      }
    }
  } catch (e) {
    // ignore supabase error
  }

  return boardConfig;
}

/**
 * บันทึกการตั้งค่าบอร์ดลงหน่วยความจำและฐานข้อมูล
 */
async function saveVoiceBoardConfig(channelId, messageId, guildId) {
  boardConfig = { channelId, messageId, guildId, savedAt: Date.now() };

  // บันทึกลง Redis
  try {
    const redis = getRedis();
    if (redis) {
      await redis.set(`config:${CONFIG_KEY}`, JSON.stringify(boardConfig));
    }
  } catch (e) {
    // ignore redis error
  }

  // บันทึกลง Supabase
  try {
    const supabase = getSupabaseClient();
    if (supabase) {
      await supabase.from("site_settings").upsert({
        key: CONFIG_KEY,
        value: boardConfig,
        updated_at: new Date().toISOString(),
      });
    }
  } catch (e) {
    console.warn("[voiceBoardState] Failed to persist config to Supabase:", e.message);
  }

  return boardConfig;
}

/**
 * ดึงสถานะบอร์ดปัจจุบัน
 */
function getActiveVoiceBoardConfig() {
  return boardConfig;
}

/**
 * ดึงเวลาที่บอร์ดถูก Edit ครั้งล่าสุด
 */
function getLastEditTimestamp() {
  return lastEditTimestamp;
}

/**
 * ทำการอัปเดตข้อความบอร์ดบน Discord Channel
 * @param {import("discord.js").Client} client
 * @param {boolean} [force=false] บังคับอัปเดตโดยข้ามการตรวจ fingerprint
 */
async function performVoiceBoardUpdate(client, force = false) {
  if (!IS_VOICE_BOARD_ENABLED) return;
  if (isUpdating) return;
  const config = await loadVoiceBoardConfig();
  if (!config?.channelId || !config?.messageId) return;

  isUpdating = true;
  try {
    const channel =
      client.channels.cache.get(config.channelId) ||
      (await client.channels.fetch(config.channelId).catch(() => null));
    if (!channel || !channel.isTextBased()) return;

    const message = await channel.messages.fetch(config.messageId).catch((err) => {
      if (err.code === 10008) {
        console.warn(`[voiceBoardState] Board message ${config.messageId} was deleted.`);
        boardConfig = null;
      }
      return null;
    });

    if (!message) return;

    const data = await getVoiceBoardData(channel.guild, "all");
    if (!data) return;

    // ⚡ ตรวจสอบความถูกต้องของ Spotlight
    if (activeSpotlight) {
      if (Date.now() > activeSpotlight.expiresAt) {
        activeSpotlight = null;
      } else {
        const vCh = channel.guild.channels.cache.get(activeSpotlight.voiceChannelId);
        if (!vCh || !vCh.isVoiceBased()) {
          activeSpotlight = null;
        } else {
          const hasUser = vCh.members.has(activeSpotlight.userId);
          const isFull = vCh.userLimit > 0 && vCh.members.filter((m) => !m.user?.bot).size >= vCh.userLimit;
          if (!hasUser || isFull) {
            activeSpotlight = null;
          }
        }
      }
    }

    data.spotlight = activeSpotlight;

    // ⚡ ตรวจสอบความเปลี่ยนแปลง (Diffing)
    // หากข้อมูลห้อง สมาชิก และเกม ไม่มีการเปลี่ยนแปลง และเพิ่งอัปเดตไปไม่เกิน 5 นาที ให้ข้ามทันที
    const currentFingerprint = computeRoomsFingerprint(data.rooms, activeSpotlight);
    const timeSinceLastEdit = Date.now() - lastEditTimestamp;

    if (!force && currentFingerprint === lastRenderedFingerprint && timeSinceLastEdit < 300000) {
      return; // ข้ามการยิง API ไม่เปลือง Rate Limit และหน้าจอไม่กระพริบ
    }

    const payload = buildVoiceBoardPayload(data);
    await message.edit(payload).catch((err) => {
      console.error("[voiceBoardState] Failed to edit voice board message:", err.message);
    });

    lastRenderedFingerprint = currentFingerprint;
    lastEditTimestamp = Date.now();
  } catch (err) {
    console.error("[voiceBoardState] performVoiceBoardUpdate error:", err.message);
  } finally {
    isUpdating = false;
  }
}

/**
 * ส่งคำขออัปเดตบอร์ดอย่างชาญฉลาด (Adaptive Throttle & Burst Debounce)
 * - รวบยอด event ที่เกิดขึ้นติดๆ กัน (เช่น คนเข้าออกพร้อมกัน 3 คน)
 * - กำหนดให้ Edit ข้อความได้ไม่เกิน 1 ครั้งต่อ 30 วินาที
 */
function queueVoiceBoardUpdate(client) {
  if (!IS_VOICE_BOARD_ENABLED) return;
  if (queuedTimer) {
    clearTimeout(queuedTimer);
    queuedTimer = null;
  }

  const now = Date.now();
  const timeSinceLastEdit = now - lastEditTimestamp;

  // คำนวณเวลารอ: ต้องรออย่างน้อย BURST_DEBOUNCE_MS และไม่เร็วกว่า THROTTLE_INTERVAL_MS
  const remainingCooldown = Math.max(0, THROTTLE_INTERVAL_MS - timeSinceLastEdit);
  const waitTime = Math.max(BURST_DEBOUNCE_MS, remainingCooldown);

  queuedTimer = setTimeout(() => {
    queuedTimer = null;
    performVoiceBoardUpdate(client).catch(console.error);
  }, waitTime);
}

module.exports = {
  THROTTLE_INTERVAL_MS,
  loadVoiceBoardConfig,
  saveVoiceBoardConfig,
  getActiveVoiceBoardConfig,
  getLastEditTimestamp,
  performVoiceBoardUpdate,
  queueVoiceBoardUpdate,
  checkLfgCooldown,
  recordLfgCooldown,
  setSpotlight,
  getSpotlight,
  clearSpotlight,
};
