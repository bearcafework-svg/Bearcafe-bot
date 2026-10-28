// src/features/mainQuest/questTriggers.js
// ตัวดักจับและตรวจนับชั่วโมงเสียงสำหรับเควสใหญ่ (Voice Tracker & Board Updater)
// พร้อม In-Memory Accumulator เพื่อลด Supabase RPC Calls และ Log Ingestion 80%+

const { Events } = require("discord.js");
const {
  getActiveOrCreateMainQuest,
  recordBatchVoiceMinutes,
  updateQuestBoard
} = require("./questEngine");
const sharedSettings = require("../../sharedSettings.json");

const AFK_CATEGORY_OR_CHANNEL_ID = "1205512963058962482"; // ID ห้องหรือหมวดหมู่ AFK
const roleBlacklist = sharedSettings.role_blacklist || [];
const FLUSH_INTERVAL_MS = 5 * 60 * 1000; // รวมกลุ่มส่ง Supabase ทุกๆ 5 นาที

/**
 * ลงทะเบียนตัวตรวจจับเวลาห้องเสียงแบบอัตโนมัติ
 * @param {Client} client Discord Client
 * @param {SupabaseClient} supabase Supabase Client
 */
function setupMainQuestTriggers(client, supabase) {
  if (!client || !supabase) return;

  console.log("⏱️ [mainQuest] Initializing Voice State Tracker & Minute Accumulator (5m Flush)...");

  // In-Memory Accumulator: เก็บสะสมนาทีใน RAM ก่อน Flush ลง Supabase
  const pendingVoiceMinutes = new Map(); // userId -> { userId, username, minutes }
  let lastFlushTimestamp = Date.now();
  let isFlushing = false;

  /**
   * Flush ข้อมูลนาทีเสียงที่สะสมไว้ทั้งหมดไปยัง Supabase
   * @param {boolean} force บังคับ flush โดยไม่สนระยะเวลา 5 นาที
   */
  async function flushPendingVoice(force = false) {
    if (isFlushing || pendingVoiceMinutes.size === 0) return;

    const now = Date.now();
    if (!force && now - lastFlushTimestamp < FLUSH_INTERVAL_MS) {
      return;
    }

    isFlushing = true;
    try {
      const activeQuest = await getActiveOrCreateMainQuest(supabase);
      if (!activeQuest || activeQuest.is_completed || !activeQuest.is_active) {
        pendingVoiceMinutes.clear();
        return;
      }

      if (new Date() > new Date(activeQuest.end_time)) {
        pendingVoiceMinutes.clear();
        return;
      }

      const listToFlush = Array.from(pendingVoiceMinutes.values());
      pendingVoiceMinutes.clear();
      lastFlushTimestamp = Date.now();

      if (listToFlush.length > 0) {
        await recordBatchVoiceMinutes(client, supabase, listToFlush);
      }

      // อัปเดตบอร์ดเควสบน Discord หลัง flush
      if (activeQuest.channel_id && activeQuest.message_id) {
        await updateQuestBoard(client, supabase, activeQuest);
      }
    } catch (err) {
      console.error("[mainQuest] Flush voice error:", err.message);
    } finally {
      isFlushing = false;
    }
  }

  // 1. ดักจับเมื่อผู้ใช้ออกจากห้องเสียง เพื่อ Flush นาทีที่ค้างอยู่ทันที ไม่ให้แต้มตกหล่น
  client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    try {
      const member = oldState.member || newState.member;
      if (!member || member.user?.bot) return;

      const userId = member.id;
      const channel = newState.channel || (newState.channelId ? newState.guild?.channels?.cache?.get(newState.channelId) : null);
      const parentId = channel?.parentId || null;

      const isLeft = oldState.channelId && (!newState.channelId || newState.channelId === AFK_CATEGORY_OR_CHANNEL_ID || parentId === AFK_CATEGORY_OR_CHANNEL_ID);

      if (isLeft && pendingVoiceMinutes.has(userId)) {
        const userPending = pendingVoiceMinutes.get(userId);
        pendingVoiceMinutes.delete(userId);

        if (userPending && userPending.minutes > 0) {
          const activeQuest = await getActiveOrCreateMainQuest(supabase);
          if (activeQuest && !activeQuest.is_completed && activeQuest.is_active) {
            await recordBatchVoiceMinutes(client, supabase, [userPending]);
          }
        }
      }
    } catch (err) {
      console.error("[mainQuest] VoiceStateUpdate flush error:", err.message);
    }
  });

  // 2. รัน Loop ทุก 1 นาทีเพื่อสะสมเวลานาทีเสียงใน RAM และ Trigger Batch Flush ทุก 5 นาที
  setInterval(async () => {
    try {
      if (!client.isReady()) return;

      const activeQuest = await getActiveOrCreateMainQuest(supabase);
      if (!activeQuest || activeQuest.is_completed || !activeQuest.is_active) {
        return;
      }

      // ตรวจสอบวันหมดอายุ
      if (new Date() > new Date(activeQuest.end_time)) {
        return;
      }

      for (const guild of client.guilds.cache.values()) {
        // ข้ามเซิร์ฟเวอร์ที่ไม่เกี่ยวข้อง (เช่น ฮิลใจ)
        if (guild.id === "1536199707922141254") continue;

        for (const [userId, vs] of guild.voiceStates.cache) {
          if (!vs.channelId || vs.member?.user?.bot) continue;

          // 🚫 ข้ามสมาชิกที่ติด role_blacklist
          const isBlacklisted = vs.member?.roles?.cache?.some((r) => roleBlacklist.includes(r.id));
          if (isBlacklisted) continue;

          // ข้ามห้องหรือหมวดหมู่ AFK
          const channel = vs.channel || guild.channels.cache.get(vs.channelId);
          const parentId = channel?.parentId || null;
          if (
            vs.channelId === AFK_CATEGORY_OR_CHANNEL_ID ||
            parentId === AFK_CATEGORY_OR_CHANNEL_ID
          ) {
            continue;
          }

          const username = vs.member?.user?.username || vs.member?.displayName || "Bear Member";
          const existing = pendingVoiceMinutes.get(userId);
          if (existing) {
            existing.minutes += 1;
            existing.username = username;
          } else {
            pendingVoiceMinutes.set(userId, {
              userId,
              username,
              minutes: 1
            });
          }
        }
      }

      // ตรวจสอบและ Flush ข้อมูลเมื่อครบ 5 นาที
      await flushPendingVoice(false);
    } catch (err) {
      console.error("[mainQuest] Voice minute ticker error:", err.message);
    }
  }, 60 * 1000);
}

module.exports = {
  setupMainQuestTriggers
};
