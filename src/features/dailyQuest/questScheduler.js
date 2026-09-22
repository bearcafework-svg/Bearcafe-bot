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
 * โพสต์การ์ดประกาศประจำวันลงในห้อง ANNOUNCE_CHANNEL_ID
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

    const channel =
      client.channels.cache.get(ANNOUNCE_CHANNEL_ID) ||
      (await client.channels.fetch(ANNOUNCE_CHANNEL_ID).catch(() => null));

    if (!channel || !channel.isTextBased()) {
      console.warn(`[dailyQuest] Announcement channel ${ANNOUNCE_CHANNEL_ID} not found.`);
      return;
    }

    // 1. ส่งข้อความแจ้งเตือนและแท็กบทบาทก่อน
    const thaiDate = formatThaiDate(targetDate);
    const mentionMsg = `<a:3602exclamationmarkbubble:1372837492205555812> เควสประจำวัน ${thaiDate} มาแล้ว! <@&${ANNOUNCE_PING_ROLE_ID}>`;
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

/**
 * กำหนด Loop ตั้งเวลาประกาศเวลา 08:00 น.
 */
function scheduleMorningAnnouncement(client, supabase) {
  const msUntilMorning = getMsUntilNextTime(8, 0, 0);
  const minutes = Math.round(msUntilMorning / 60000);
  console.log(`[dailyQuest] ⏰ Morning announcement scheduled in ${minutes} minutes (08:00:00 Asia/Bangkok).`);

  setTimeout(async () => {
    try {
      console.log("[dailyQuest] 🔔 08:00 AM arrived! Posting Daily Quest Announcement...");
      await postDailyAnnouncement(client, supabase);
    } catch (err) {
      console.error("[dailyQuest] Morning announcement error:", err);
    } finally {
      // วนลูปสำหรับวันถัดไป
      scheduleMorningAnnouncement(client, supabase);
    }
  }, msUntilMorning);
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

      // ตรวจสอบว่าถ้าเลยเวลา 08:00 น. แล้ว และยังไม่เคยโพสต์การ์ดของวันนี้ ให้โพสต์ทันที
      const now = new Date();
      const bkkNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
      const isPast8AM = bkkNow.getHours() >= 8;

      if (isPast8AM && set && !set.announcement_message_id) {
        console.log("[dailyQuest] 🔄 Past 8 AM and announcement not yet posted today. Posting now...");
        await postDailyAnnouncement(client, supabase, today);
      }
    } catch (err) {
      console.error("[dailyQuest] Startup check error:", err);
    }
  }, 3000);

  // 2. รัน Scheduler
  scheduleMidnightReset(client, supabase);
  scheduleMorningAnnouncement(client, supabase);
}

module.exports = {
  setupQuestScheduler,
  postDailyAnnouncement
};
