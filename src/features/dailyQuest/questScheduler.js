// src/features/dailyQuest/questScheduler.js
// ระบบตั้งเวลา Reset 00:00 น. และประกาศเควสประจำวัน 08:00 น. (Asia/Bangkok)

const { ANNOUNCE_CHANNEL_ID, ANNOUNCE_PING_ROLE_ID } = require("./questConstants");
const {
  getBangkokTodayDate,
  getNextMidnightTimestamp,
  getOrInitDailyQuestSet
} = require("./questEngine");
const { buildDailyQuestAnnouncementPayload, formatThaiDate } = require("./questPayloads");

/**
 * ดึงค่าการตั้งค่าจากตาราง site_settings (key: daily_quest_settings)
 */
async function getQuestSettings(supabase) {
  try {
    const { data, error } = await supabase
      .from("site_settings")
      .select("value")
      .eq("key", "daily_quest_settings")
      .maybeSingle();

    if (!error && data?.value) {
      const times = Array.isArray(data.value.announcement_times) && data.value.announcement_times.length > 0
        ? data.value.announcement_times
        : ["08:00"];

      return {
        announcement_times: times,
        channel_id: data.value.announce_channel_id || ANNOUNCE_CHANNEL_ID,
        role_id: data.value.announce_ping_role_id || ANNOUNCE_PING_ROLE_ID,
      };
    }
  } catch (err) {
    console.error("[dailyQuest] Error loading quest settings from site_settings:", err.message);
  }

  return {
    announcement_times: ["08:00"],
    channel_id: ANNOUNCE_CHANNEL_ID,
    role_id: ANNOUNCE_PING_ROLE_ID,
  };
}

/**
 * คำนวณจำนวนมิลลิวินาทีจนถึงเวลาเป้าหมายถัดไปตามเวลาไทย (Asia/Bangkok)
 * @param {number} targetHour (0..23)
 * @param {number} targetMinute (0..59)
 * @param {number} targetSecond (0..59)
 * @returns {number}
 */
function getMsUntilNextTime(targetHour, targetMinute = 0, targetSecond = 0) {
  const now = new Date();
  const bkkNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));

  const nextTarget = new Date(bkkNow);
  nextTarget.setHours(targetHour, targetMinute, targetSecond, 0);

  if (nextTarget.getTime() <= bkkNow.getTime()) {
    // หากเลยเวลาของวันนี้ไปแล้ว ให้ขยับไปวันพรุ่งนี้
    nextTarget.setDate(nextTarget.getDate() + 1);
  }

  const diffMs = nextTarget.getTime() - bkkNow.getTime();
  return Math.max(1000, diffMs);
}

/**
 * โพสต์การ์ดประกาศประจำวันลงในห้องประกาศ
 * @param {import('discord.js').Client} client
 * @param {object} supabase
 * @param {string} targetDate
 */
async function postDailyAnnouncement(client, supabase, targetDate = getBangkokTodayDate()) {
  try {
    const { set, quests } = await getOrInitDailyQuestSet(supabase, targetDate);
    if (!set || !quests || quests.length === 0) {
      console.warn("[dailyQuest] Cannot post announcement: No active quests found.");
      return;
    }

    const settings = await getQuestSettings(supabase);
    const channelId = settings.channel_id || ANNOUNCE_CHANNEL_ID;
    const roleId = settings.role_id || ANNOUNCE_PING_ROLE_ID;

    const channel =
      client.channels.cache.get(channelId) ||
      (await client.channels.fetch(channelId).catch(() => null));

    if (!channel || !channel.isTextBased()) {
      console.warn(`[dailyQuest] Announcement channel ${channelId} not found.`);
      return;
    }

    // 1. ส่งข้อความแจ้งเตือนและแท็กบทบาทก่อน
    const thaiDate = formatThaiDate(targetDate);
    const mentionMsg = `<a:3602exclamationmarkbubble:1372837492205555812> เควสประจำวัน ${thaiDate} มาแล้ว! <@&${roleId}>`;
    await channel.send({ content: mentionMsg });

    // 2. ส่ง Component V2 Card ตามหลัง
    const nextMidnightTs = getNextMidnightTimestamp();
    const payload = buildDailyQuestAnnouncementPayload(targetDate, quests, nextMidnightTs);

    const sentMsg = await channel.send(payload);
    console.log(`[dailyQuest] 📢 Daily quest card published to #${channel.name} (${sentMsg.id})!`);

    // บันทึก announcement_message_id ลงในตาราง daily_quest_sets
    await supabase
      .from("daily_quest_sets")
      .update({
        announcement_message_id: sentMsg.id,
        published_at: new Date().toISOString()
      })
      .eq("id", set.id);
  } catch (err) {
    console.error("[dailyQuest] Failed to post daily announcement:", err);
  }
}

/**
 * กำหนด Loop ตั้งเวลา Reset เวลา 00:00 น.
 */
function scheduleMidnightReset(client, supabase) {
  const msUntilMidnight = getMsUntilNextTime(0, 0, 0);
  const minutes = Math.round(msUntilMidnight / 60000);
  console.log(`[dailyQuest] ⏰ Midnight reset scheduled in ${minutes} minutes (00:00:00 Asia/Bangkok).`);

  setTimeout(async () => {
    try {
      const today = getBangkokTodayDate();
      console.log(`[dailyQuest] 🔔 Midnight 00:00 arrived! Initializing Daily Quest Set for ${today}...`);
      await getOrInitDailyQuestSet(supabase, today);
    } catch (err) {
      console.error("[dailyQuest] Midnight reset error:", err);
    } finally {
      // วนลูปสำหรับวันถัดไป
      scheduleMidnightReset(client, supabase);
    }
  }, msUntilMidnight);
}

let currentAnnouncementTimeout = null;

/**
 * คำนวณและตั้งเวลารอบประกาศถัดไปจากรายการ announcement_times ในฐานข้อมูล
 */
async function scheduleNextAnnouncement(client, supabase) {
  if (currentAnnouncementTimeout) {
    clearTimeout(currentAnnouncementTimeout);
    currentAnnouncementTimeout = null;
  }

  try {
    const settings = await getQuestSettings(supabase);
    const times = settings.announcement_times && settings.announcement_times.length > 0
      ? settings.announcement_times
      : ["08:00"];

    let minMs = Infinity;
    let nextTimeStr = "08:00";

    for (const timeStr of times) {
      const [hStr, mStr] = (timeStr || "").split(":");
      const hour = parseInt(hStr, 10) || 0;
      const minute = parseInt(mStr, 10) || 0;
      const ms = getMsUntilNextTime(hour, minute, 0);
      if (ms < minMs) {
        minMs = ms;
        nextTimeStr = timeStr;
      }
    }

    const minutes = Math.round(minMs / 60000);
    console.log(`[dailyQuest] ⏰ Next announcement scheduled for ${nextTimeStr} in ${minutes} minutes (${Math.floor(minMs / 1000)}s Asia/Bangkok). [Times: ${times.join(", ")}]`);

    currentAnnouncementTimeout = setTimeout(async () => {
      try {
        console.log(`[dailyQuest] 🔔 Announcement time (${nextTimeStr}) reached! Posting Daily Quest Announcement...`);
        await postDailyAnnouncement(client, supabase);
      } catch (err) {
        console.error(`[dailyQuest] Announcement (${nextTimeStr}) error:`, err);
      } finally {
        scheduleNextAnnouncement(client, supabase);
      }
    }, minMs);
  } catch (err) {
    console.error("[dailyQuest] Failed to schedule next announcement:", err);
    currentAnnouncementTimeout = setTimeout(() => scheduleNextAnnouncement(client, supabase), 5 * 60 * 1000);
  }
}

/**
 * เริ่มต้นระบบตั้งเวลาทั้งหมด
 * @param {import('discord.js').Client} client
 * @param {object} supabase
 */
function setupQuestScheduler(client, supabase) {
  // 1. เริ่มต้นตรวจความพร้อม ณ ตอนบอทสตาร์ต (Startup Check)
  setTimeout(async () => {
    try {
      const today = getBangkokTodayDate();
      const { set, quests } = await getOrInitDailyQuestSet(supabase, today);
      console.log(`[dailyQuest] ✅ Loaded today's quest set (${today}) with ${quests.length} quests.`);

      const settings = await getQuestSettings(supabase);
      const times = settings.announcement_times || ["08:00"];

      // ตรวจสอบว่ามีเวลาประกาศใดของวันนี้ที่ผ่านมาแล้ว และยังไม่เคยโพสต์การ์ดของวันนี้
      const now = new Date();
      const bkkNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
      const currentMinutesOfDay = bkkNow.getHours() * 60 + bkkNow.getMinutes();

      const hasAnyTimePassed = times.some((t) => {
        const [h, m] = t.split(":").map(Number);
        return currentMinutesOfDay >= (h * 60 + (m || 0));
      });

      if (hasAnyTimePassed && set && !set.announcement_message_id) {
        console.log("[dailyQuest] 🔄 Scheduled announcement time has passed and not yet posted today. Posting now...");
        await postDailyAnnouncement(client, supabase, today);
      }
    } catch (err) {
      console.error("[dailyQuest] Startup check error:", err);
    }
  }, 3000);

  // 2. รัน Scheduler
  scheduleMidnightReset(client, supabase);
  scheduleNextAnnouncement(client, supabase);

  // 3. ตรวจสอบตารางเวลาทุก ๆ 10 นาที เพื่ออัปเดตหากแอดมินแก้ไขเวลาในแดชบอร์ด
  setInterval(() => {
    scheduleNextAnnouncement(client, supabase);
  }, 10 * 60 * 1000);
}

module.exports = {
  setupQuestScheduler,
  postDailyAnnouncement,
  getQuestSettings,
  scheduleNextAnnouncement
};
