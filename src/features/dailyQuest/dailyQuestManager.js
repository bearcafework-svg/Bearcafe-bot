// src/features/dailyQuest/dailyQuestManager.js — ตัวจัดการลอจิกและฐานข้อมูลภารกิจประจำวัน
const questPool = require("./questPool");

/**
 * ดึงวันที่ปัจจุบันใน timezone GMT+7 (Bangkok) ในรูปแบบ YYYY-MM-DD
 */
function getTodayBangkok() {
  const d = new Date();
  const bangkokDate = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const year = bangkokDate.getFullYear();
  const month = String(bangkokDate.getMonth() + 1).padStart(2, "0");
  const day = String(bangkokDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * ตรวจสอบและลงทะเบียนภารกิจ Master ทั้ง 30 ข้อลงในฐานข้อมูล
 */
async function ensureMasterQuestsSeeded(supabase) {
  if (!supabase) return;
  try {
    const rows = questPool.map(q => ({
      quest_id: q.id,
      category: q.category,
      title: q.title,
      description: q.description,
      target_count: q.targetCount,
      unit: q.unit,
      reward_points: q.rewardPoints,
      difficulty: q.difficulty,
      tracker_type: q.trackerType,
      is_active: true
    }));

    await supabase.from("daily_quest_master").upsert(rows, { onConflict: "quest_id" });
  } catch (err) {
    console.error("[dailyQuestManager] Error seeding master quests:", err);
  }
}

/**
 * ดึงภารกิจประจำวันของผู้ใช้ หรือสุ่มให้ใหม่หากยังไม่มีในวันนี้ (สุ่มหมวดละ 1 ข้อ)
 */
async function getOrAssignDailyQuests(supabase, userId) {
  const today = getTodayBangkok();

  if (!supabase) {
    // Fallback เมื่อไม่มี Supabase (Local Mode)
    return {
      quests: questPool.slice(0, 5).map(q => ({
        quest_id: q.id,
        category: q.category,
        title: q.title,
        description: q.description,
        target_count: q.targetCount,
        unit: q.unit,
        reward_points: q.rewardPoints,
        current_progress: 0,
        is_completed: false,
        is_claimed: false
      })),
      summary: { completed_count: 0, is_jackpot_claimed: false, reroll_used: 0 }
    };
  }

  try {
    // 1. ดึงภารกิจผู้ใช้ในวันนี้
    const { data: existingQuests, error } = await supabase
      .from("user_daily_quests")
      .select("*, daily_quest_master(*)")
      .eq("discord_id", userId)
      .eq("quest_date", today);

    if (error) {
      console.error("[dailyQuestManager] Error fetching user quests:", error);
    }

    if (existingQuests && existingQuests.length === 5) {
      // ดึงสรุปรายวัน
      const { data: summaryData } = await supabase
        .from("user_quest_daily_summary")
        .select("*")
        .eq("discord_id", userId)
        .eq("quest_date", today)
        .maybeSingle();

      const formattedQuests = existingQuests.map(item => ({
        quest_id: item.quest_id,
        category: item.daily_quest_master?.category || "CHAT",
        title: item.daily_quest_master?.title || "ภารกิจประจำวัน",
        description: item.daily_quest_master?.description || "",
        target_count: item.daily_quest_master?.target_count || 1,
        unit: item.daily_quest_master?.unit || "ครั้ง",
        reward_points: item.daily_quest_master?.reward_points || 15,
        current_progress: item.current_progress,
        is_completed: item.is_completed,
        is_claimed: item.is_claimed
      }));

      return {
        quests: formattedQuests,
        summary: summaryData || { completed_count: 0, is_jackpot_claimed: false, reroll_used: 0 }
      };
    }

    // 2. ถ้ายังไม่มี ให้สุ่มภารกิจใหม่ 5 ข้อ (หมวดละ 1 ข้อ)
    const categories = ["CHAT", "VOICE", "MINIGAME", "FEATURE", "SOCIAL"];
    const assignedQuestIds = [];

    for (const cat of categories) {
      const catQuests = questPool.filter(q => q.category === cat);
      if (catQuests.length > 0) {
        const picked = catQuests[Math.floor(Math.random() * catQuests.length)];
        assignedQuestIds.push(picked.id);
      }
    }

    // บันทึกลง user_daily_quests
    const insertRows = assignedQuestIds.map(qId => ({
      discord_id: userId,
      quest_date: today,
      quest_id: qId,
      current_progress: 0,
      is_completed: false,
      is_claimed: false
    }));

    await supabase.from("user_daily_quests").upsert(insertRows, { onConflict: "discord_id,quest_date,quest_id" });

    // สร้างข้อมูลสรุปรายวัน
    await supabase.from("user_quest_daily_summary").upsert(
      {
        discord_id: userId,
        quest_date: today,
        completed_count: 0,
        is_jackpot_claimed: false,
        reroll_used: 0
      },
      { onConflict: "discord_id,quest_date" }
    );

    // ดึงกลับมาแสดงผล
    return await getOrAssignDailyQuests(supabase, userId);
  } catch (err) {
    console.error("[dailyQuestManager] Exception in getOrAssignDailyQuests:", err);
    return { quests: [], summary: { completed_count: 0, is_jackpot_claimed: false, reroll_used: 0 } };
  }
}

/**
 * อัปเดตความคืบหน้าภารกิจเมื่อเกิด Event
 */
async function addProgress(supabase, userId, trackerType, amount = 1) {
  if (!supabase || !userId) return;
  const today = getTodayBangkok();

  try {
    // หาภารกิจของผู้ใช้ที่ยังไม่สำเร็จและตรงกับ trackerType
    const { data: userQuests } = await supabase
      .from("user_daily_quests")
      .select("*, daily_quest_master!inner(tracker_type, target_count)")
      .eq("discord_id", userId)
      .eq("quest_date", today)
      .eq("is_completed", false)
      .eq("daily_quest_master.tracker_type", trackerType);

    if (!userQuests || userQuests.length === 0) return;

    for (const item of userQuests) {
      const target = item.daily_quest_master.target_count;
      const newProgress = Math.min(target, item.current_progress + amount);
      const isNowCompleted = newProgress >= target;

      await supabase
        .from("user_daily_quests")
        .update({
          current_progress: newProgress,
          is_completed: isNowCompleted,
          updated_at: new Date().toISOString()
        })
        .eq("id", item.id);

      if (isNowCompleted) {
        // เพิ่มจำนวน completed_count ใน summary
        const { data: summary } = await supabase
          .from("user_quest_daily_summary")
          .select("completed_count")
          .eq("discord_id", userId)
          .eq("quest_date", today)
          .maybeSingle();

        const currentCount = summary?.completed_count || 0;
        await supabase
          .from("user_quest_daily_summary")
          .upsert(
            {
              discord_id: userId,
              quest_date: today,
              completed_count: currentCount + 1,
              updated_at: new Date().toISOString()
            },
            { onConflict: "discord_id,quest_date" }
          );
      }
    }
  } catch (err) {
    console.error(`[dailyQuestManager] Error adding progress for ${userId} (${trackerType}):`, err);
  }
}

/**
 * กดรับรางวัลของภารกิจ 1 ข้อ
 */
async function claimReward(supabase, userId, questId) {
  if (!supabase) return { success: false, pointsEarned: 0 };
  const today = getTodayBangkok();

  try {
    const { data: item } = await supabase
      .from("user_daily_quests")
      .select("*, daily_quest_master(reward_points)")
      .eq("discord_id", userId)
      .eq("quest_date", today)
      .eq("quest_id", questId)
      .maybeSingle();

    if (!item || !item.is_completed || item.is_claimed) {
      return { success: false, pointsEarned: 0 };
    }

    const reward = item.daily_quest_master?.reward_points || 15;

    // ทำเครื่องหมายเป็นรับรางวัลแล้ว
    await supabase
      .from("user_daily_quests")
      .update({ is_claimed: true, updated_at: new Date().toISOString() })
      .eq("id", item.id);

    // เติมแต้มผู้เล่นใน user_points
    await addPointsToUser(supabase, userId, reward);

    return { success: true, pointsEarned: reward };
  } catch (err) {
    console.error(`[dailyQuestManager] Error claiming reward ${questId} for ${userId}:`, err);
    return { success: false, pointsEarned: 0 };
  }
}

/**
 * กดรับรางวัลทั้งหมดรวมถึง Daily Jackpot
 */
async function claimAllRewards(supabase, userId) {
  if (!supabase) return { success: false, totalEarned: 0 };
  const today = getTodayBangkok();

  try {
    const { quests, summary } = await getOrAssignDailyQuests(supabase, userId);
    let totalPoints = 0;

    // 1. รับแต้มภารกิจข้อที่ทำสำเร็จแต่ยังไม่ได้กดรับ
    for (const q of quests) {
      if (q.is_completed && !q.is_claimed) {
        const res = await claimReward(supabase, userId, q.quest_id);
        if (res.success) {
          totalPoints += res.pointsEarned;
        }
      }
    }

    // 2. เช็คการรับ Daily Jackpot Bonus (ทำครบ 5/5)
    const updatedQuests = (await getOrAssignDailyQuests(supabase, userId)).quests;
    const completedAll = updatedQuests.every(q => q.is_completed);

    if (completedAll && !summary.is_jackpot_claimed) {
      const jackpotReward = 100; // แต้มกล่องสุ่มสมบัติหมีน้อย
      totalPoints += jackpotReward;
      await addPointsToUser(supabase, userId, jackpotReward);

      await supabase
        .from("user_quest_daily_summary")
        .update({ is_jackpot_claimed: true, updated_at: new Date().toISOString() })
        .eq("discord_id", userId)
        .eq("quest_date", today);
    }

    return { success: totalPoints > 0, totalEarned: totalPoints };
  } catch (err) {
    console.error(`[dailyQuestManager] Error claiming all rewards for ${userId}:`, err);
    return { success: false, totalEarned: 0 };
  }
}

/**
 * สุ่มเปลี่ยนภารกิจ 1 ข้อ (Re-roll)
 */
async function rerollQuest(supabase, userId, questIdToSwap) {
  if (!supabase) return false;
  const today = getTodayBangkok();

  try {
    const { quests, summary } = await getOrAssignDailyQuests(supabase, userId);
    if ((summary.reroll_used || 0) >= 1) {
      return false; // หมดสิทธิ์ Re-roll วันนี้
    }

    const targetQuest = quests.find(q => q.quest_id === questIdToSwap);
    if (!targetQuest || targetQuest.is_completed) {
      return false; // ไม่พบภารกิจ หรือสำเร็จไปแล้ว ห้ามเปลี่ยน
    }

    // สุ่มหาภารกิจใหม่ในหมวดเดียวกันที่ไม่ซ้ำกับของเดิมผู้เล่น
    const currentCategory = targetQuest.category;
    const currentAssignedIds = quests.map(q => q.quest_id);
    const availablePool = questPool.filter(
      q => q.category === currentCategory && !currentAssignedIds.includes(q.id)
    );

    if (availablePool.length === 0) return false;

    const newQuest = availablePool[Math.floor(Math.random() * availablePool.length)];

    // อัปเดตภารกิจใหม่ลงตาราง
    await supabase
      .from("user_daily_quests")
      .update({
        quest_id: newQuest.id,
        current_progress: 0,
        is_completed: false,
        is_claimed: false,
        updated_at: new Date().toISOString()
      })
      .eq("discord_id", userId)
      .eq("quest_date", today)
      .eq("quest_id", questIdToSwap);

    // บันทึกการใช้สิทธิ์ Re-roll
    await supabase
      .from("user_quest_daily_summary")
      .update({
        reroll_used: (summary.reroll_used || 0) + 1,
        updated_at: new Date().toISOString()
      })
      .eq("discord_id", userId)
      .eq("quest_date", today);

    return true;
  } catch (err) {
    console.error(`[dailyQuestManager] Error rerolling quest ${questIdToSwap} for ${userId}:`, err);
    return false;
  }
}

/**
 * เพิ่มแต้มผู้เล่นในตาราง user_points
 */
async function addPointsToUser(supabase, userId, pointsToAdd) {
  if (!supabase || pointsToAdd <= 0) return;
  try {
    const { data: existing } = await supabase
      .from("user_points")
      .select("points")
      .eq("discord_id", userId)
      .maybeSingle();

    const currentPoints = existing?.points || 0;
    const newPoints = currentPoints + pointsToAdd;

    await supabase
      .from("user_points")
      .upsert({ discord_id: userId, points: newPoints }, { onConflict: "discord_id" });
  } catch (err) {
    console.error(`[dailyQuestManager] Error adding ${pointsToAdd} points to ${userId}:`, err);
  }
}

/**
 * ล้างข้อมูลย้อนหลังตามกำหนด (Purge / Maintenance)
 */
async function runAutoCleanup(supabase) {
  if (!supabase) return;
  try {
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    await supabase.from("user_daily_quests").delete().lt("quest_date", sevenDaysAgo);
    await supabase.from("user_quest_daily_summary").delete().lt("quest_date", thirtyDaysAgo);
    console.log("[dailyQuestManager] Automated cleanup completed successfully.");
  } catch (err) {
    console.error("[dailyQuestManager] Error during automated cleanup:", err);
  }
}

/**
 * ดึงวันที่เริ่มต้นสัปดาห์ (วันจันทร์) ใน timezone GMT+7
 */
function getWeekStartDateBangkok() {
  const d = new Date();
  const bangkokDate = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const dayOfWeek = bangkokDate.getDay();
  const distanceToMonday = (dayOfWeek + 6) % 7;
  bangkokDate.setDate(bangkokDate.getDate() - distanceToMonday);
  const year = bangkokDate.getFullYear();
  const month = String(bangkokDate.getMonth() + 1).padStart(2, "0");
  const day = String(bangkokDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/**
 * ดึงความคืบหน้าสะสมประจำสัปดาห์ของผู้ใช้
 */
async function getWeeklyProgress(supabase, userId) {
  if (!supabase) return { count: 0, claimedTiers: [] };
  const weekStart = getWeekStartDateBangkok();

  try {
    // 1. นับจำนวนภารกิจที่สำเร็จในสัปดาห์นี้
    const { data: weekQuests, error } = await supabase
      .from("user_daily_quests")
      .select("is_completed")
      .eq("discord_id", userId)
      .gte("quest_date", weekStart)
      .eq("is_completed", true);

    const count = weekQuests ? weekQuests.length : 0;

    // 2. ดึงสถานะการกดรับรางวัลประจำสัปดาห์
    const { data: streakData } = await supabase
      .from("user_quest_streaks")
      .select("weekly_completed_count, weekly_claimed_milestones, week_start_date")
      .eq("discord_id", userId)
      .maybeSingle();

    let claimedTiers = [];
    if (streakData && streakData.week_start_date === weekStart) {
      claimedTiers = streakData.weekly_claimed_milestones || [];
    } else if (streakData && streakData.week_start_date !== weekStart) {
      // สัปดาห์ใหม่ รีเซ็ตโบนัสสัปดาห์
      await supabase
        .from("user_quest_streaks")
        .update({
          week_start_date: weekStart,
          weekly_completed_count: count,
          weekly_claimed_milestones: [],
          updated_at: new Date().toISOString()
        })
        .eq("discord_id", userId);
    }

    return { count, claimedTiers };
  } catch (err) {
    console.error("[dailyQuestManager] Error fetching weekly progress:", err);
    return { count: 0, claimedTiers: [] };
  }
}

/**
 * กดรับรางวัลโบนัสสะสมประจำสัปดาห์
 */
async function claimWeeklyMilestone(supabase, userId) {
  if (!supabase) return { success: false, message: "ไม่มีระบบฐานข้อมูล" };
  const weekStart = getWeekStartDateBangkok();
  const { count, claimedTiers } = await getWeeklyProgress(supabase, userId);

  // กำหนดเกณฑ์รางวัล 3 ขั้น
  const TIERS = [
    { tier: 1, target: 10, points: 50, cakes: 0, name: "ขั้นที่ 1 (10 ภารกิจ)" },
    { tier: 2, target: 20, points: 150, cakes: 0, name: "ขั้นที่ 2 (20 ภารกิจ)" },
    { tier: 3, target: 30, points: 350, cakes: 1, name: "ขั้นที่ 3 (30 ภารกิจ - Master)" }
  ];

  // หา Tier สูงสุดที่ทำถึงแต่ยังไม่ได้กดรับ
  const claimable = TIERS.find(t => count >= t.target && !claimedTiers.includes(t.tier));

  if (!claimable) {
    return { success: false, message: "ยังไม่มีโบนัสประจำสัปดาห์ที่สามารถกดรับได้ในขณะนี้ค่ะ" };
  }

  try {
    // 1. เพิ่มแต้ม + เค้ก
    await addPointsToUser(supabase, userId, claimable.points);
    if (claimable.cakes > 0) {
      const { data: userRow } = await supabase
        .from("user_points")
        .select("cakes")
        .eq("discord_id", userId)
        .maybeSingle();
      const newCakes = (userRow?.cakes || 0) + claimable.cakes;
      await supabase.from("user_points").update({ cakes: newCakes }).eq("discord_id", userId);
    }

    // 2. บันทึก Tier ที่กดรับแล้ว
    const newClaimed = [...claimedTiers, claimable.tier];
    await supabase
      .from("user_quest_streaks")
      .upsert(
        {
          discord_id: userId,
          week_start_date: weekStart,
          weekly_completed_count: count,
          weekly_claimed_milestones: newClaimed,
          updated_at: new Date().toISOString()
        },
        { onConflict: "discord_id" }
      );

    return {
      success: true,
      tierName: claimable.name,
      rewardPoints: claimable.points,
      rewardCakes: claimable.cakes
    };
  } catch (err) {
    console.error("[dailyQuestManager] Error claiming weekly milestone:", err);
    return { success: false, message: "เกิดข้อผิดพลาดในการรับโบนัสประจำสัปดาห์" };
  }
}
/**
 * คำนวณและอัปเดตเวลานั่งห้องเสียงของผู้ใช้ ณ ปัจจุบัน (Real-time Flush)
 */
async function flushVoiceProgressRealtime(supabase, userId, voiceChannel, joinTimestamp) {
  if (!supabase || !userId || !joinTimestamp || !voiceChannel) return;

  const now = Date.now();
  const elapsedMinutes = Math.floor((now - joinTimestamp) / (1000 * 60));
  if (elapsedMinutes < 1) return;

  await addProgress(supabase, userId, "VOICE_MINUTES", elapsedMinutes);

  if (elapsedMinutes >= 30) {
    await addProgress(supabase, userId, "VOICE_CONTINUOUS", elapsedMinutes);
  }

  const memberCount = voiceChannel.members ? voiceChannel.members.size : 0;
  if (memberCount >= 2) {
    await addProgress(supabase, userId, "VOICE_WITH_FRIENDS", elapsedMinutes);
  }

  if (memberCount >= 3) {
    await addProgress(supabase, userId, "VOICE_CROWD", elapsedMinutes);
  }
}

module.exports = {
  getTodayBangkok,
  getWeekStartDateBangkok,
  ensureMasterQuestsSeeded,
  getOrAssignDailyQuests,
  addProgress,
  claimReward,
  claimAllRewards,
  rerollQuest,
  runAutoCleanup,
  flushVoiceProgressRealtime,
  getWeeklyProgress,
  claimWeeklyMilestone
};
