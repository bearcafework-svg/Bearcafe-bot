// src/features/mainQuest/questEngine.js
// ระบบคำนวณ ตรรกะฐานข้อมูล และการแจกรางวัลเควสใหญ่ (Main Community Quest)

const {
  DEFAULT_BANNER_URL,
  DEFAULT_ROLE_REWARD_ID,
  DEFAULT_POINTS_REWARD,
  DEFAULT_CONGRATS_ROLE_ID,
  DEFAULT_TARGET_HOURS,
  DEFAULT_MIN_HOURS_ELIGIBLE
} = require("./questConstants");
const {
  buildMainQuestInProgressPayload,
  buildMainQuestCompletedPayload
} = require("./questPayloads");

let lastBoardEditTimestamp = 0;
let isAwardingInProgress = false;

/**
 * เพิ่ม/หักแต้มสะสมของผู้ใช้ผ่าน Supabase RPC หรือ fallback table
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
    console.error("[mainQuest] updateUserPoints error:", err.message);
    return 0;
  }
}

/**
 * ดึงเควสใหญ่ที่กำลังดำเนินอยู่ หรือสร้างเควสใหม่อัตโนมัติ 7 วัน (เก็บบน Database 100% ไม่เก็บใน Memory)
 */
async function getActiveOrCreateMainQuest(supabase) {
  if (!supabase) return null;

  try {
    // 1. ค้นหาเควสใหญ่ที่กำลัง Active และยังไม่สิ้นสุด
    const { data: existing, error } = await supabase
      .from("main_community_quests")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error("[mainQuest] getActiveOrCreateMainQuest fetch error:", error.message);
    }

    if (existing) {
      return existing;
    }

    // 2. หากยังไม่มี ให้สร้างเควสใหม่ กำหนดเวลาสิ้นสุดอัตโนมัติในอีก 7 วัน
    const startTime = new Date();
    const endTime = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    const newQuestData = {
      code: `bear_plus_voice_quest_${Date.now()}`,
      title: "เควสหมีช่วยหมีพลัส!",
      banner_url: DEFAULT_BANNER_URL,
      target_hours: DEFAULT_TARGET_HOURS,
      current_minutes: 0,
      min_minutes_eligible: DEFAULT_MIN_HOURS_ELIGIBLE * 60,
      reward_role_id: DEFAULT_ROLE_REWARD_ID,
      reward_points: DEFAULT_POINTS_REWARD,
      congrats_role_id: DEFAULT_CONGRATS_ROLE_ID,
      start_time: startTime.toISOString(),
      end_time: endTime.toISOString(),
      is_active: true,
      is_completed: false,
      rewards_distributed: false
    };

    const { data: created, error: insertErr } = await supabase
      .from("main_community_quests")
      .insert(newQuestData)
      .select()
      .single();

    if (insertErr) {
      console.error("[mainQuest] Failed to create default main quest:", insertErr.message);
      return null;
    }

    console.log(`[mainQuest] 🌟 Initialized new 7-Day Main Community Quest (ID: ${created.id})`);
    return created;
  } catch (err) {
    console.error("[mainQuest] getActiveOrCreateMainQuest exception:", err.message);
    return null;
  }
}

/**
 * ดึงรายชื่อหมีที่เพิ่งมาช่วยสะสมเวลาล่าสุด (Recent Active Contributors)
 * เรียงตามเวลาที่มีความเคลื่อนไหวล่าสุด (last_active_at DESC) เพื่อแสดงผลการช่วยเหลือแบบเรียลไทม์
 */
async function getRecentContributors(supabase, questId, limit = 5) {
  if (!supabase || !questId) return [];
  try {
    const { data, error } = await supabase
      .from("main_community_quest_participants")
      .select("user_id, username, total_minutes, last_active_at")
      .eq("quest_id", questId)
      .gt("total_minutes", 0)
      .order("last_active_at", { ascending: false })
      .limit(limit);

    if (error) {
      console.error("[mainQuest] getRecentContributors error:", error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error("[mainQuest] getRecentContributors exception:", err.message);
    return [];
  }
}

/**
 * ฟังก์ชันหน่วงเวลา (Sleep Helper)
 */
function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * แอดยศให้สมาชิกอย่างปลอดภัย พร้อมระบบ Exponential Backoff & 429 RateLimit Protection
 * ป้องกันไม่ให้บอทส่ง Request รัวจนติด Rate Limit หรือโดน Discord Quarantine
 */
async function safeAddRole(member, roleId, maxRetries = 3) {
  if (!member || !roleId) return false;
  if (member.roles.cache.has(roleId)) return true; // มี Role อยู่แล้ว ข้ามเพื่อประหยัด API Quota

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      await member.roles.add(roleId, "Main Quest Completion Reward");
      return true;
    } catch (err) {
      const status = err.status || err.code;
      const isRateLimit = status === 429 || err.message?.includes("rate limit") || err.name === "RateLimitError";

      if (isRateLimit) {
        const retryAfterSec = err.retryAfter || (err.rawError?.retry_after ?? 2);
        const waitMs = Math.ceil(retryAfterSec * 1000) + 1200;
        console.warn(`[mainQuest] 🚨 Discord API 429 RateLimit! Pausing ${waitMs}ms before retry ${attempt}/${maxRetries}...`);
        await sleep(waitMs);
      } else {
        console.warn(`[mainQuest] ⚠️ Could not add role to ${member.id} (attempt ${attempt}/${maxRetries}):`, err.message);
        if (attempt === maxRetries) return false;
        await sleep(1000 * attempt);
      }
    }
  }
  return false;
}

/**
 * บันทึกสะสมเวลานาทีเสียงของสมาชิกทุกคนลง Supabase แบบ Persistent
 * @param {Client} client Discord Client
 * @param {SupabaseClient} supabase Supabase Client
 * @param {Array<{userId: string, username: string}>} voiceMembers รายชื่อสมาชิกในห้องเสียง
 */
async function recordBatchVoiceMinutes(client, supabase, voiceMembers) {
  if (!supabase || !Array.isArray(voiceMembers) || voiceMembers.length === 0) return;

  const quest = await getActiveOrCreateMainQuest(supabase);
  if (!quest || quest.is_completed || !quest.is_active) return;

  // ตรวจสอบว่าหมดเวลา 7 วันหรือยัง
  if (new Date() > new Date(quest.end_time)) {
    console.log(`[mainQuest] ⌛ Quest ${quest.id} has reached its expiration time.`);
    return;
  }

  let totalAddedMinutes = 0;

  for (const vm of voiceMembers) {
    try {
      // เรียก RPC Atomic increment
      const { data, error } = await supabase.rpc("increment_main_quest_minutes", {
        p_quest_id: quest.id,
        p_user_id: vm.userId,
        p_username: vm.username,
        p_minutes: 1
      });

      if (error) {
        // Fallback: Direct DB updates
        const { data: participant } = await supabase
          .from("main_community_quest_participants")
          .select("total_minutes")
          .eq("quest_id", quest.id)
          .eq("user_id", vm.userId)
          .maybeSingle();

        const newMins = (participant?.total_minutes || 0) + 1;
        await supabase.from("main_community_quest_participants").upsert({
          quest_id: quest.id,
          user_id: vm.userId,
          username: vm.username,
          total_minutes: newMins,
          last_active_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        });

        await supabase
          .from("main_community_quests")
          .update({
            current_minutes: Number(quest.current_minutes || 0) + 1,
            updated_at: new Date().toISOString()
          })
          .eq("id", quest.id);
      }

      totalAddedMinutes++;
    } catch (e) {
      console.error(`[mainQuest] Failed to record voice minute for ${vm.username}:`, e.message);
    }
  }

  if (totalAddedMinutes > 0) {
    // ตรวจสอบสถานะการผ่านเควสแบบเรียลไทม์
    const updatedQuest = await getActiveOrCreateMainQuest(supabase);
    const targetMinutes = Number(updatedQuest.target_hours || DEFAULT_TARGET_HOURS) * 60;
    const currentMinutes = Number(updatedQuest.current_minutes || 0);

    if (currentMinutes >= targetMinutes && !updatedQuest.is_completed) {
      console.log(`[mainQuest] 🎉 QUEST TARGET REACHED! (${currentMinutes}/${targetMinutes} mins)`);
      await completeAndAwardMainQuest(client, supabase, updatedQuest);
    }
  }
}

/**
 * อัปเดตบอร์ดเควสใหญ่บน Discord แบบ Throttled เพื่อป้องกัน Rate Limit
 * จะอัปเดตสถานะหลอดสะสมและรายชื่อหมีล่าสุดอย่างต่อเนื่องโดยเฉลี่ยทุก 2-3 นาที
 */
async function updateQuestBoard(client, supabase, quest, force = false) {
  if (!client || !supabase || !quest || !quest.channel_id || !quest.message_id) return;

  const now = Date.now();
  // ป้องกัน Rate Limit: อัปเดตบอร์ดสูงสุดทุก 2 นาที ยกเว้นถูกสั่ง force
  if (!force && now - lastBoardEditTimestamp < 2 * 60 * 1000) {
    return;
  }
  lastBoardEditTimestamp = now;

  try {
    const channel = client.channels.cache.get(quest.channel_id) ||
      (await client.channels.fetch(quest.channel_id).catch(() => null));

    if (!channel || !channel.isTextBased()) return;

    const message = await channel.messages.fetch(quest.message_id).catch(() => null);
    if (!message) return;

    const recentParticipants = await getRecentContributors(supabase, quest.id, 5);
    const payload = quest.is_completed
      ? buildMainQuestCompletedPayload(quest)
      : buildMainQuestInProgressPayload(quest, recentParticipants);

    await message.edit(payload);
    console.log(`[mainQuest] 🔄 Updated Main Quest board message in #${channel.name}`);
  } catch (err) {
    console.error("[mainQuest] updateQuestBoard error:", err.message);
  }
}

/**
 * เมื่อเควสผ่าน: แจก Role + Points ให้ผู้มีสิทธิ์อย่างปลอดภัย (Rate-Limit Controlled) ลบการ์ดเดิม และส่งการ์ดแบบที่ 2
 */
async function completeAndAwardMainQuest(client, supabase, quest) {
  if (!client || !supabase || !quest) return;
  if (isAwardingInProgress) return;
  isAwardingInProgress = true;

  try {
    console.log(`[mainQuest] 🏆 Starting Quest Completion & Reward Distribution for quest: ${quest.id}`);

    // 1. ทำเครื่องหมายเควสสำเร็จในฐานข้อมูลทันที
    await supabase
      .from("main_community_quests")
      .update({
        is_completed: true,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      })
      .eq("id", quest.id);

    // 2. ดึงรายชื่อผู้มีสิทธิ์รับรางวัล (สะสมเวลา >= min_minutes_eligible เช่น 60 นาที)
    const minMins = Number(quest.min_minutes_eligible || 60);
    const { data: eligibleParticipants, error: partErr } = await supabase
      .from("main_community_quest_participants")
      .select("*")
      .eq("quest_id", quest.id)
      .gte("total_minutes", minMins)
      .eq("reward_granted", false);

    if (partErr) {
      console.error("[mainQuest] Failed to fetch eligible participants:", partErr.message);
    }

    const participantsToReward = eligibleParticipants || [];
    console.log(`[mainQuest] 🎁 Found ${participantsToReward.length} eligible participants (>= ${minMins} mins)`);

    const roleId = quest.reward_role_id || DEFAULT_ROLE_REWARD_ID;
    const points = Number(quest.reward_points || DEFAULT_POINTS_REWARD);

    // 3. ทยอยแจกของรางวัล (Role + แต้ม) ให้ทุกคนแบบ Queue มี Delay เพื่อความปลอดภัยจาก RateLimit/Quarantine
    for (const p of participantsToReward) {
      try {
        // เพิ่มแต้มใน Database
        if (points > 0) {
          await updateUserPoints(supabase, p.user_id, points);
        }

        // แจกยศบทบาท Discord Role พร้อมการควบคุม Rate Limit
        for (const guild of client.guilds.cache.values()) {
          try {
            if (!guild.roles.cache.has(roleId)) continue;

            const member = guild.members.cache.get(p.user_id) ||
              (await guild.members.fetch(p.user_id).catch(() => null));

            if (member) {
              await safeAddRole(member, roleId);
              // หน่วงเวลา 400ms + Jitter (50-150ms) ระหว่างสมาชิกแต่ละคน เพื่อความปลอดภัยสูงสุด
              const jitter = Math.floor(Math.random() * 100) + 50;
              await sleep(400 + jitter);
            }
          } catch (ge) {}
        }

        // บันทึกสถานะว่าได้รับรางวัลเรียบร้อยแล้วทันที
        await supabase
          .from("main_community_quest_participants")
          .update({
            reward_granted: true,
            reward_granted_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("quest_id", quest.id)
          .eq("user_id", p.user_id);

        console.log(`[mainQuest] ✅ Granted rewards to ${p.username || p.user_id} (+${points} pts & Role ${roleId})`);
      } catch (awardErr) {
        console.error(`[mainQuest] Error granting reward to ${p.user_id}:`, awardErr.message);
      }
    }

    // 4. ลบการ์ด Component V2 อันเดิม และส่งการ์ดแบบที่ 2 (Completed State)
    if (quest.channel_id) {
      const channel = client.channels.cache.get(quest.channel_id) ||
        (await client.channels.fetch(quest.channel_id).catch(() => null));

      if (channel && channel.isTextBased()) {
        // ลบข้อความเดิม
        if (quest.message_id) {
          try {
            const oldMsg = await channel.messages.fetch(quest.message_id).catch(() => null);
            if (oldMsg) {
              await oldMsg.delete().catch(() => {});
              console.log(`[mainQuest] 🗑️ Deleted previous in-progress quest card (${quest.message_id})`);
            }
          } catch (delErr) {}
        }

        // ส่งการ์ดใหม่แบบที่ 2
        const completedPayload = buildMainQuestCompletedPayload(quest);
        const newMsg = await channel.send(completedPayload);
        console.log(`[mainQuest] 🚀 Sent Completed Quest Card (แบบที่ 2) to #${channel.name} (${newMsg.id})`);

        // บันทึก Message ID ใหม่ลง Supabase
        await supabase
          .from("main_community_quests")
          .update({
            message_id: newMsg.id,
            rewards_distributed: true,
            rewards_distributed_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("id", quest.id);
      }
    }
  } catch (err) {
    console.error("[mainQuest] completeAndAwardMainQuest critical error:", err);
  } finally {
    isAwardingInProgress = false;
  }
}

module.exports = {
  updateUserPoints,
  getActiveOrCreateMainQuest,
  getRecentContributors,
  getTopParticipants: getRecentContributors,
  recordBatchVoiceMinutes,
  updateQuestBoard,
  completeAndAwardMainQuest
};
