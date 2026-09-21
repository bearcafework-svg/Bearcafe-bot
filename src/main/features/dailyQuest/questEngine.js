// src/features/dailyQuest/questEngine.js
// ตัวประมวลผลหลักของระบบ Daily Quest (จัดการข้อมูล เควสประจำวัน สถิติ และการแจกแต้ม)

const {
  ANNOUNCE_CHANNEL_ID,
  NOTIFY_CHANNEL_ID,
  FULL_COMPLETION_BONUS_POINTS,
  TEST_ONLY_DISCORD_ID
} = require("./questConstants");
const {
  buildQuestCompletedNotificationPayload,
  buildAllQuestsBonusNotificationPayload
} = require("./questPayloads");

/**
 * ดึงวันที่ปัจจุบันตามเวลาประเทศไทย (YYYY-MM-DD)
 * @returns {string}
 */
function getBangkokTodayDate() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

/**
 * คำนวณ Unix Timestamp (วินาที) ของเวลาเที่ยงคืนถัดไป (00:00:00 Asia/Bangkok)
 * @returns {number}
 */
function getNextMidnightTimestamp() {
  const now = new Date();
  // แปลงเวลาปัจจุบันเป็นเวลาไทย
  const bkkNow = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const nextMidnight = new Date(bkkNow);
  nextMidnight.setHours(24, 0, 0, 0);

  // คำนวณความต่างเวลาเป็นมิลลิวินาที
  const diffMs = nextMidnight.getTime() - bkkNow.getTime();
  return Math.floor((now.getTime() + diffMs) / 1000);
}

/**
 * อัปเดตแต้มของผู้ใช้ (เพิ่ม/ลด) ผ่าน RPC หรือ table user_points
 * @param {object} supabase
 * @param {string} userId
 * @param {number} delta
 * @returns {Promise<number>}
 */
async function updateUserPoints(supabase, userId, delta) {
  if (!supabase || !userId) return 0;
  try {
    const { data, error } = await supabase.rpc("add_tarot_points", {
      p_discord_id: userId,
      p_points_delta: delta,
      p_tarot_delta: 0
    });
    if (error) {
      // Fallback: ดึงและ upsert ลง table user_points
      const { data: userData } = await supabase
        .from("user_points")
        .select("points")
        .eq("discord_id", userId)
        .maybeSingle();

      const newPoints = (userData?.points || 0) + delta;
      await supabase.from("user_points").upsert(
        { discord_id: userId, points: newPoints },
        { onConflict: "discord_id" }
      );
      return newPoints;
    }
    return data?.[0]?.new_points ?? 0;
  } catch (err) {
    console.error("[dailyQuest] updateUserPoints error:", err.message);
    return 0;
  }
}

/**
 * สุ่มหรือดึง Daily Quest Set ของวันที่ระบุ (1 Chat, 1 Voice/Community, 1 IRL)
 * @param {object} supabase
 * @param {string} targetDate YYYY-MM-DD
 * @returns {Promise<{ set: object, quests: Array }>}
 */
async function getOrInitDailyQuestSet(supabase, targetDate = getBangkokTodayDate()) {
  if (!supabase) return { set: null, quests: [] };

  try {
    // 1. ตรวจสอบว่ามีชุดเควสของวันนี้ในตารางแล้วหรือไม่
    const { data: existingSet, error: fetchErr } = await supabase
      .from("daily_quest_sets")
      .select("*")
      .eq("quest_date", targetDate)
      .maybeSingle();

    if (existingSet && Array.isArray(existingSet.quest_ids) && existingSet.quest_ids.length > 0) {
      // ดึงรายละเอียดเควสตาม quest_ids
      const { data: questsData } = await supabase
        .from("daily_quest_templates")
        .select("*")
        .in("id", existingSet.quest_ids);

      // เรียงลำดับตาม array quest_ids
      const orderedQuests = existingSet.quest_ids
        .map((qid) => questsData?.find((q) => q.id === qid))
        .filter(Boolean);

      return { set: existingSet, quests: orderedQuests };
    }

    // 2. หากยังไม่มี ให้สุ่มสร้างชุดใหม่ 3 เควส
    // ดึงชุดของเมื่อวานมาเพื่อหลีกเลี่ยงการสุ่มซ้ำวันติดกัน
    const yesterday = new Date(new Date(targetDate).getTime() - 86400000)
      .toISOString()
      .split("T")[0];

    const { data: yesterdaySet } = await supabase
      .from("daily_quest_sets")
      .select("quest_ids")
      .eq("quest_date", yesterday)
      .maybeSingle();

    const yesterdayIds = new Set(yesterdaySet?.quest_ids || []);

    // ดึงแม่แบบเควสที่ active ทั้งหมด
    const { data: allTemplates, error: tErr } = await supabase
      .from("daily_quest_templates")
      .select("*")
      .eq("active", true);

    if (tErr || !allTemplates || allTemplates.length === 0) {
      console.error("[dailyQuest] No active templates found in database.");
      return { set: null, quests: [] };
    }

    const chatPool = allTemplates.filter((q) => q.category === "chat");
    const voiceCommPool = allTemplates.filter(
      (q) => q.category === "voice" || q.category === "community"
    );
    const irlPool = allTemplates.filter((q) => q.category === "irl");

    // ฟังก์ชันช่วยสุ่มโดยเลี่ยงของเมื่อวานถ้าเป็นไปได้
    const pickOne = (pool) => {
      if (!pool || pool.length === 0) return null;
      const filtered = pool.filter((q) => !yesterdayIds.has(q.id));
      const candidates = filtered.length > 0 ? filtered : pool;
      return candidates[Math.floor(Math.random() * candidates.length)];
    };

    const q1 = pickOne(chatPool) || chatPool[0];
    const q2 = pickOne(voiceCommPool) || voiceCommPool[0];
    const q3 = pickOne(irlPool) || irlPool[0];

    const selectedQuests = [q1, q2, q3].filter(Boolean);
    const selectedIds = selectedQuests.map((q) => q.id);

    // บันทึกลงตาราง daily_quest_sets
    const { data: insertedSet, error: insertErr } = await supabase
      .from("daily_quest_sets")
      .insert({
        quest_date: targetDate,
        quest_ids: selectedIds,
        bonus_points: FULL_COMPLETION_BONUS_POINTS
      })
      .select()
      .single();

    if (insertErr) {
      console.error("[dailyQuest] Error creating daily quest set:", insertErr.message);
      return { set: null, quests: selectedQuests };
    }

    return { set: insertedSet, quests: selectedQuests };
  } catch (err) {
    console.error("[dailyQuest] getOrInitDailyQuestSet error:", err.message);
    return { set: null, quests: [] };
  }
}

/**
 * ดึงสถานะ Progress ของผู้ใช้ในวันนั้น
 * @param {object} supabase
 * @param {string} userId
 * @param {string} targetDate
 * @returns {Promise<object>} map: { [quest_id]: progressRow }
 */
async function getUserDailyProgress(supabase, userId, targetDate = getBangkokTodayDate()) {
  if (!supabase || !userId) return {};

  try {
    const { data: progressList } = await supabase
      .from("daily_quest_progress")
      .select("*")
      .eq("user_id", userId)
      .eq("quest_date", targetDate);

    const map = {};
    if (Array.isArray(progressList)) {
      for (const row of progressList) {
        map[row.quest_id] = {
          ...row,
          current_progress: Number(row.current_progress || 0),
          target_count: Number(row.target_count || 1)
        };
      }
    }
    return map;
  } catch (err) {
    console.error("[dailyQuest] getUserDailyProgress error:", err.message);
    return {};
  }
}

/**
 * ตรวจสอบและมอบโบนัสสำเร็จครบ 3 เควส
 * @param {import('discord.js').Client} client
 * @param {object} supabase
 * @param {import('discord.js').User} user
 * @param {string} targetDate
 * @param {Array} quests
 */
async function checkAndAwardFullBonus(client, supabase, user, targetDate, quests) {
  if (!supabase || !user || !quests || quests.length === 0) return;

  try {
    // 1. ตรวจสอบว่าเคยได้โบนัสของวันนี้ไปแล้วหรือยัง
    const { data: existingBonus } = await supabase
      .from("daily_quest_bonuses")
      .select("id")
      .eq("user_id", user.id)
      .eq("quest_date", targetDate)
      .maybeSingle();

    if (existingBonus) return; // ได้ไปแล้ว

    // 2. ตรวจสอบว่าทำเควสครบทุกข้อในชุดของวันนี้หรือไม่
    const progressMap = await getUserDailyProgress(supabase, user.id, targetDate);
    const allCompleted = quests.every((q) => {
      const p = progressMap[q.id];
      return p && p.is_completed;
    });

    if (!allCompleted) return;

    // 3. บันทึกการรับโบนัสลงฐานข้อมูล
    const { error: bonusErr } = await supabase.from("daily_quest_bonuses").insert({
      quest_date: targetDate,
      user_id: user.id,
      bonus_points: FULL_COMPLETION_BONUS_POINTS
    });

    if (bonusErr) {
      console.error("[dailyQuest] Failed to record bonus:", bonusErr.message);
      return;
    }

    // 4. มอบแต้มโบนัส +50
    await updateUserPoints(supabase, user.id, FULL_COMPLETION_BONUS_POINTS);

    // 5. บันทึกสถิติ Analytics
    await supabase
      .from("daily_quest_analytics")
      .insert({
        quest_date: targetDate,
        event_type: "all_completed",
        user_id: user.id,
        metadata: { bonus: FULL_COMPLETION_BONUS_POINTS }
      })
      .then(null, () => {});

    // 6. ส่งการ์ดประกาศพิเศษฉลองทำครบ 3 เควสไปยัง NOTIFY_CHANNEL_ID
    const notifyCh =
      client.channels.cache.get(NOTIFY_CHANNEL_ID) ||
      (await client.channels.fetch(NOTIFY_CHANNEL_ID).catch(() => null));

    if (notifyCh && notifyCh.isTextBased()) {
      const bonusPayload = buildAllQuestsBonusNotificationPayload(user, FULL_COMPLETION_BONUS_POINTS);
      await notifyCh.send(bonusPayload).catch((err) => {
        console.error("[dailyQuest] Failed to send bonus notification:", err.message);
      });
    }
  } catch (err) {
    console.error("[dailyQuest] checkAndAwardFullBonus error:", err.message);
  }
}

/**
 * ดำเนินการให้เควสสำเร็จ (Complete Quest) มอบแต้ม และส่ง Notification
 * @param {import('discord.js').Client} client
 * @param {object} supabase
 * @param {import('discord.js').User} user
 * @param {object} quest
 * @param {string} targetDate
 * @param {Array} dailyQuests
 */
async function completeQuest(client, supabase, user, quest, targetDate, dailyQuests) {
  if (!supabase || !user || !quest) return;

  try {
    // 1. อัปเดตสถานะใน daily_quest_progress
    const { error: updateErr } = await supabase
      .from("daily_quest_progress")
      .upsert(
        {
          quest_date: targetDate,
          user_id: user.id,
          quest_id: quest.id,
          current_progress: quest.target_count || 1,
          target_count: quest.target_count || 1,
          is_completed: true,
          completed_at: new Date().toISOString(),
          reward_claimed: true,
          updated_at: new Date().toISOString()
        },
        { onConflict: "quest_date,user_id,quest_id" }
      );

    if (updateErr) {
      console.error("[dailyQuest] Failed to complete quest:", updateErr.message);
      return;
    }

    // 2. มอบแต้มรางวัลของเควสนี้
    const pointsToAdd = quest.reward_points || 5;
    await updateUserPoints(supabase, user.id, pointsToAdd);

    // 3. บันทึกสถิติ Analytics
    await supabase
      .from("daily_quest_analytics")
      .insert({
        quest_date: targetDate,
        event_type: "quest_completed",
        user_id: user.id,
        metadata: { quest_code: quest.code, reward: pointsToAdd }
      })
      .then(null, () => {});

    // 4. คำนวณจำนวนเควสที่เหลือของวันนี้
    const progressMap = await getUserDailyProgress(supabase, user.id, targetDate);
    let completedCount = 0;
    for (const q of dailyQuests) {
      if (progressMap[q.id]?.is_completed || q.id === quest.id) {
        completedCount++;
      }
    }
    const remainingCount = Math.max(0, dailyQuests.length - completedCount);

    // 5. ส่งการ์ดแจ้งเตือนไปยัง NOTIFY_CHANNEL_ID
    const notifyCh =
      client.channels.cache.get(NOTIFY_CHANNEL_ID) ||
      (await client.channels.fetch(NOTIFY_CHANNEL_ID).catch(() => null));

    if (notifyCh && notifyCh.isTextBased()) {
      const notifPayload = buildQuestCompletedNotificationPayload(user, quest, remainingCount);
      await notifyCh.send(notifPayload).catch((err) => {
        console.error("[dailyQuest] Failed to send quest completed notification:", err.message);
      });
    }

    // 6. ตรวจสอบเงื่อนไขโบนัสครบ 3 เควส
    await checkAndAwardFullBonus(client, supabase, user, targetDate, dailyQuests);
  } catch (err) {
    console.error("[dailyQuest] completeQuest error:", err.message);
  }
}

/**
 * บันทึก Progress หรือเพิ่มจำนวนครั้งให้เควส
 * @param {import('discord.js').Client} client
 * @param {object} supabase
 * @param {import('discord.js').User} user
 * @param {string} triggerType
 * @param {object} eventContext { keywords, channelId, count, ... }
 */
async function processTriggerEvent(client, supabase, user, triggerType, eventContext = {}) {
  // กรอง Whitelist ในช่วงทดสอบระบบ Beta
  if (TEST_ONLY_DISCORD_ID && user.id !== TEST_ONLY_DISCORD_ID) {
    return;
  }

  const today = getBangkokTodayDate();
  const { quests } = await getOrInitDailyQuestSet(supabase, today);
  if (!quests || quests.length === 0) return;

  const progressMap = await getUserDailyProgress(supabase, user.id, today);

  for (const quest of quests) {
    // หากผ่านเควสนี้ไปแล้ว ให้ข้าม
    if (progressMap[quest.id]?.is_completed) continue;

    // ตรวจสอบความสอดคล้องของ Trigger Type
    if (quest.trigger_type !== triggerType) continue;

    // ตรวจสอบเงื่อนไขย่อย (Trigger Config)
    const cfg = quest.trigger_config || {};

    if (triggerType === "keyword") {
      const kwList = cfg.keywords || [];
      const text = (eventContext.text || "").toLowerCase().trim();
      const match = kwList.some((kw) => text.includes(kw.toLowerCase()));
      if (!match) continue;
    } else if (triggerType === "command_usage") {
      if (cfg.command && eventContext.commandName !== cfg.command) continue;
      if (cfg.channel_id && eventContext.channelId !== cfg.channel_id) continue;
    } else if (triggerType === "chat_any" || triggerType === "voice_duration" || triggerType === "voice_join") {
      if (cfg.channel_id && eventContext.channelId !== cfg.channel_id) continue;
      if (cfg.min_members && (eventContext.memberCount || 0) < cfg.min_members) continue;
    } else if (triggerType === "chat_media") {
      if (cfg.media_type && eventContext.mediaType !== cfg.media_type) continue;
      if (cfg.channel_id && eventContext.channelId !== cfg.channel_id) continue;
    } else if (triggerType === "reaction_add") {
      if (cfg.message_url && eventContext.messageUrl !== cfg.message_url) continue;
      if (cfg.channel_id && eventContext.channelId !== cfg.channel_id) continue;
    }

    // คำนวณความคืบหน้าใหม่
    const delta = Number(eventContext.amount) || 1;
    const currentProgress = Number(progressMap[quest.id]?.current_progress || 0) + delta;
    const target = Number(quest.target_count || 1);

    if (currentProgress >= target) {
      // ผ่านเควส!
      console.log(
        `[dailyQuest] Quest completed: user=${user.tag || user.id} quest="${quest.title}" (${quest.code}) target=${target}`
      );
      await completeQuest(client, supabase, user, quest, today, quests);
    } else {
      // บันทึกความคืบหน้าที่เพิ่มขึ้น
      console.log(
        `[dailyQuest] Progress updated: user=${user.tag || user.id} quest="${quest.title}" (${quest.code}) progress=${currentProgress}/${target}`
      );
      await supabase
        .from("daily_quest_progress")
        .upsert(
          {
            quest_date: today,
            user_id: user.id,
            quest_id: quest.id,
            current_progress: currentProgress,
            target_count: target,
            is_completed: false,
            updated_at: new Date().toISOString()
          },
          { onConflict: "quest_date,user_id,quest_id" }
        )
        .then(null, (err) => {
          console.error("[dailyQuest] Failed to upsert progress:", err?.message);
        });
    }
  }
}

/**
 * คำสั่ง Staff: อนุมัติเควสถ่ายรูป IRL
 * @param {import('discord.js').Client} client
 * @param {object} supabase
 * @param {import('discord.js').User} targetUser
 * @param {string} questId
 * @param {import('discord.js').User} staffUser
 * @returns {Promise<{ success: boolean, message: string }>}
 */
async function approveIrlQuest(client, supabase, targetUser, questId, staffUser) {
  const today = getBangkokTodayDate();
  const { quests } = await getOrInitDailyQuestSet(supabase, today);

  const quest = quests?.find((q) => q.id === questId);
  if (!quest) {
    return { success: false, message: "❌ ไม่พบเควสนี้ในชุดเควสของวันนี้ค่ะ" };
  }

  if (quest.category !== "irl") {
    return { success: false, message: "⚠️ คำสั่งนี้สามารถใช้อนุมัติเฉพาะเควสถ่ายรูป (IRL) เท่านั้นค่ะ" };
  }

  // ตรวจสอบว่าเคยผ่านไปแล้วหรือไม่
  const progressMap = await getUserDailyProgress(supabase, targetUser.id, today);
  if (progressMap[quest.id]?.is_completed) {
    return { success: false, message: `ℹ️ สมาชิก <@${targetUser.id}> ผ่านเควส **${quest.title}** ของวันนี้ไปเรียบร้อยแล้วค่ะ` };
  }

  // บันทึกผ่านเควส มอบแต้ม และส่ง Notification
  await completeQuest(client, supabase, targetUser, quest, today, quests);

  // บันทึก Log การอนุมัติ
  await supabase
    .from("daily_quest_analytics")
    .insert({
      quest_date: today,
      event_type: "irl_approved",
      user_id: targetUser.id,
      metadata: {
        quest_id: quest.id,
        quest_code: quest.code,
        approved_by: staffUser.id
      }
    })
    .then(null, () => {});

  return {
    success: true,
    message: `✅ อนุมัติเควส **${quest.title}** ให้กับ <@${targetUser.id}> เรียบร้อยแล้วค่ะ! (มอบแต้ม +${quest.reward_points})`
  };
}

module.exports = {
  getBangkokTodayDate,
  getNextMidnightTimestamp,
  getOrInitDailyQuestSet,
  getUserDailyProgress,
  processTriggerEvent,
  completeQuest,
  approveIrlQuest,
  updateUserPoints
};
