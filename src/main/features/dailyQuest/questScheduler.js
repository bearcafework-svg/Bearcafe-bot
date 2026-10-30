// src/features/dailyQuest/questScheduler.js
// ระบบตั้งเวลา Reset 00:00 น. และประกาศเควสประจำวัน 08:00 น. (Asia/Bangkok)

const { ANNOUNCE_CHANNEL_ID, ANNOUNCE_PING_ROLE_ID } = require("./questConstants");
const {
  getBangkokTodayDate,
  getNextMidnightTimestamp,
  getOrInitDailyQuestSet
} = require("./questEngine");
const { buildDailyQuestAnnouncementPayload, formatThaiDate } = require("./questPayloads");

// In-memory status cache for zero-overhead event checking
let isDailyQuestActive = true;
let dailyQuestPausedMessage = "ระบบเควสประจำวันปิดปรับปรุงชั่วคราว ขออภัยในความไม่สะดวกค่ะ";

function getQuestSystemStatus() {
  return {
    isActive: isDailyQuestActive,
    message: dailyQuestPausedMessage
  };
}

function updateQuestSettingsCache(value) {
  if (!value) return;
  if (typeof value.is_active === "boolean") {
    isDailyQuestActive = value.is_active;
  }
  if (typeof value.paused_message === "string" && value.paused_message.trim()) {
    dailyQuestPausedMessage = value.paused_message.trim();
  }
}

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
      updateQuestSettingsCache(data.value);

      const times = Array.isArray(data.value.announcement_times) && data.value.announcement_times.length > 0
        ? data.value.announcement_times
        : ["08:00"];

      return {
        announcement_times: times,
        channel_id: data.value.announce_channel_id || ANNOUNCE_CHANNEL_ID,
        role_id: data.value.announce_ping_role_id || ANNOUNCE_PING_ROLE_ID,
        is_active: isDailyQuestActive,
        paused_message: dailyQuestPausedMessage
      };
    }
  } catch (err) {
    console.error("[dailyQuest] Error loading quest settings from site_settings:", err.message);
  }

  return {
    announcement_times: ["08:00"],
    channel_id: ANNOUNCE_CHANNEL_ID,
    role_id: ANNOUNCE_PING_ROLE_ID,
    is_active: isDailyQuestActive,
    paused_message: dailyQuestPausedMessage
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
    if (!isDailyQuestActive) {
      console.log("[dailyQuest] ⏸️ Skipping daily announcement: Quest system is currently paused.");
      return;
    }

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

    // 0. ล้างข้อความทั้งหมดในห้องก่อนส่งเควสใหม่
    try {
      if (typeof channel.bulkDelete === "function") {
        let deleted;
        do {
          // ดึงและลบข้อความชุดละไม่เกิน 100 ข้อความ (filterOld: true เพื่อกัน error ข้อความที่เก่ากว่า 14 วัน)
          deleted = await channel.bulkDelete(100, true).catch(() => null);
        } while (deleted && deleted.size >= 10);
      }

      // ตรวจสอบข้อความคงเหลือ (รวมถึงข้อความที่อายุเกิน 14 วันที่ bulkDelete ลบไม่ได้)
      const remainingMessages = await channel.messages.fetch({ limit: 100 }).catch(() => null);
      if (remainingMessages && remainingMessages.size > 0) {
        for (const msg of remainingMessages.values()) {
          await msg.delete().catch(() => {});
        }
      }
      console.log(`[dailyQuest] 🧹 Cleaned all previous messages in #${channel.name} (${channelId})`);
    } catch (clearErr) {
      console.warn(`[dailyQuest] Warning during channel message cleanup:`, clearErr.message);
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
        if (isDailyQuestActive) {
          console.log(`[dailyQuest] 🔔 Announcement time (${nextTimeStr}) reached! Posting Daily Quest Announcement...`);
          await postDailyAnnouncement(client, supabase);
        } else {
          console.log(`[dailyQuest] ⏸️ Announcement time (${nextTimeStr}) reached, but quest system is paused. Skipping.`);
        }
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
 * สมัครรับการแจ้งเตือน Realtime เพื่อซิงค์สถานะระบบเควส (เปิด/ปิด) ทันที
 */
function setupQuestRealtimeSync(supabase) {
  try {
    const channel = supabase
      .channel("daily_quest_settings_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "site_settings", filter: "key=eq.daily_quest_settings" },
        (payload) => {
          const newVal = payload.new?.value;
          if (newVal) {
            updateQuestSettingsCache(newVal);
            console.log(`[dailyQuest] 🔄 Realtime status updated: is_active=${isDailyQuestActive}`);
          }
        }
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          console.log("[dailyQuest] ✅ Realtime subscription for daily_quest_settings established.");
        }
      });
    return channel;
  } catch (err) {
    console.error("[dailyQuest] Error setting up realtime sync:", err.message);
  }
}

/**
 * เริ่มต้นระบบตั้งเวลาทั้งหมด
 * @param {import('discord.js').Client} client
 * @param {object} supabase
 */
function setupQuestScheduler(client, supabase) {
  // 0. ดึงการตั้งค่าทันทีตั้งแต่เริ่มทำงาน และสมัครรับ Realtime เพื่อดักจับการเปิด/ปิดเควสจากแดชบอร์ด
  getQuestSettings(supabase).catch((err) => console.error("[dailyQuest] Initial getQuestSettings error:", err.message));
  setupQuestRealtimeSync(supabase);

  // 1. เริ่มต้นตรวจความพร้อม ณ ตอนบอทสตาร์ต (Startup Check)
  setTimeout(async () => {
    try {
      const today = getBangkokTodayDate();
      const settings = await getQuestSettings(supabase);
      
      if (!isDailyQuestActive) {
        console.log("[dailyQuest] ⏸️ Startup check: Quest system is paused. Skipping announcement post.");
        return;
      }

      const { set, quests } = await getOrInitDailyQuestSet(supabase, today);
      console.log(`[dailyQuest] ✅ Loaded today's quest set (${today}) with ${quests.length} quests.`);

      const times = settings.announcement_times || ["08:00"];

      // ตรวจสอบว่ามีเวลาประกาศใดของวันนี้ที่ผ่านมาแล้ว และยังไม่เคยโพสต์การ์ดของวันนี้
      const now = new Date();
      const bkkNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
      const currentMinutesOfDay = bkkNow.getHours() * 60 + bkkNow.getMinutes();

      const hasAnyTimePassed = times.some((t) => {
        const [h, m] = t.split(":").map(Number);
        return currentMinutesOfDay >= (h * 60 + (m || 0));
      });

      if (hasAnyTimePassed && set) {
        let needsPost = !set.announcement_message_id;

        // Smart Verification: แม้ไม่มี announcement_message_id ใน DB ให้ตรวจในห้อง Discord ก่อนเสมอ
        if (needsPost) {
          const channelId = settings.channel_id || ANNOUNCE_CHANNEL_ID;
          const channel = client.channels.cache.get(channelId) || (await client.channels.fetch(channelId).catch(() => null));
          if (channel && channel.isTextBased()) {
            const recentMsgs = await channel.messages.fetch({ limit: 10 }).catch(() => null);
            if (recentMsgs && recentMsgs.size > 0) {
              const botCardMsg = recentMsgs.find(m => m.author.id === client.user.id && (m.components?.length > 0 || m.content?.includes("เควสประจำวัน")));
              if (botCardMsg) {
                console.log(`[dailyQuest] 🛡️ Smart Reconnect: Found existing quest card in #${channel.name} (${botCardMsg.id}). Linking to DB without reposting or pinging.`);
                await supabase
                  .from("daily_quest_sets")
                  .update({
                    announcement_message_id: botCardMsg.id,
                    published_at: new Date().toISOString()
                  })
                  .eq("id", set.id);
                set.announcement_message_id = botCardMsg.id;
                needsPost = false;
              }
            }
          }
        }

        if (needsPost) {
          console.log("[dailyQuest] 🔄 Scheduled announcement time has passed and not yet posted today. Posting now...");
          await postDailyAnnouncement(client, supabase, today);
        }
      }
    } catch (err) {
      console.error("[dailyQuest] Startup check error:", err);
    }
  }, 3000);

  // 2. รัน Scheduler
  scheduleMidnightReset(client, supabase);
  scheduleNextAnnouncement(client, supabase);

  // 3. ตรวจสอบตารางเวลาทุก ๆ 10 นาที เพื่ออัปเดตหากแอดมินแก้ไขเวลาในแดชบอร์ด
  setInterval(async () => {
    await getQuestSettings(supabase);
    scheduleNextAnnouncement(client, supabase);
  }, 10 * 60 * 1000);
}

module.exports = {
  setupQuestScheduler,
  postDailyAnnouncement,
  getQuestSettings,
  scheduleNextAnnouncement,
  getQuestSystemStatus
};
