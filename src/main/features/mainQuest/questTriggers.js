// src/main/features/mainQuest/questTriggers.js
// ตัวดักจับและตรวจนับชั่วโมงเสียงสำหรับเควสใหญ่ (Voice Tracker & Board Updater)

const {
  getActiveOrCreateMainQuest,
  recordBatchVoiceMinutes,
  updateQuestBoard
} = require("./questEngine");

const AFK_CATEGORY_OR_CHANNEL_ID = "1205512963058962482"; // ID ห้องหรือหมวดหมู่ AFK

/**
 * ลงทะเบียนตัวตรวจจับเวลาห้องเสียงแบบอัตโนมัติ
 * @param {Client} client Discord Client
 * @param {SupabaseClient} supabase Supabase Client
 */
function setupMainQuestTriggers(client, supabase) {
  if (!client || !supabase) return;

  console.log("⏱️ [mainQuest] Initializing Voice State Tracker & Minute Interval...");

  // รัน Loop ทุก 1 นาทีเพื่อสะสมเวลานาทีเสียงของผู้ใช้ที่อยู่ในห้องเสียง
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

      const voiceMembers = [];

      for (const guild of client.guilds.cache.values()) {
        // ข้ามเซิร์ฟเวอร์ที่ไม่เกี่ยวข้อง (เช่น ฮิลใจ)
        if (guild.id === "1536199707922141254") continue;

        for (const [userId, vs] of guild.voiceStates.cache) {
          if (!vs.channelId || vs.member?.user?.bot) continue;

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
          voiceMembers.push({
            userId,
            username
          });
        }
      }

      if (voiceMembers.length > 0) {
        await recordBatchVoiceMinutes(client, supabase, voiceMembers);
      }

      // อัปเดตบอร์ดเควสบน Discord (มี Throttler คุมภายใน updateQuestBoard ทุกๆ 3 นาที)
      if (activeQuest.channel_id && activeQuest.message_id) {
        await updateQuestBoard(client, supabase, activeQuest);
      }
    } catch (err) {
      console.error("[mainQuest] Voice minute ticker error:", err.message);
    }
  }, 60 * 1000);
}

module.exports = {
  setupMainQuestTriggers
};
