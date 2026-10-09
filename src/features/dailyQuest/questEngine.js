// src/features/dailyQuest/questEngine.js
// ตัวประมวลผลหลักของระบบ Daily Quest (จัดการข้อมูล เควสประจำวัน สถิติ และการแจกแต้ม)

const sharedSettings = require("../../sharedSettings.json");
const {
  ANNOUNCE_CHANNEL_ID,
  NOTIFY_CHANNEL_ID,
  FULL_COMPLETION_BONUS_POINTS
} = require("./questConstants");
const {
  buildQuestCompletedNotificationPayload,
  buildBatchQuestCompletedNotificationPayload,
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

// ─────────────────────────────────────────────────────────────
// 🚀 IN-MEMORY PERFORMANCE CACHE (Guard against Supabase Egress/Log Bloat)
// ─────────────────────────────────────────────────────────────
let cachedQuestData = {
  date: null,
  set: null,
  quests: [],
  fetchedAt: 0
};

// Cache user progress for 45 seconds to absorb rapid chat message bursts
const userProgressCache = new Map(); // key: `${userId}:${targetDate}`, value: { data: map, expiresAt: number }

function invalidateUserProgressCache(userId, targetDate) {
  if (userId && targetDate) {
    userProgressCache.delete(`${userId}:${targetDate}`);
  }
}

/**
 * สุ่มหรือดึง Daily Quest Set ของวันที่ระบุ (1 Chat, 1 Voice/Community, 1 IRL)
 * @param {object} supabase
 * @param {string} targetDate YYYY-MM-DD
 * @param {boolean} forceRefresh
 * @returns {Promise<{ set: object, quests: Array }>}
 */
async function getOrInitDailyQuestSet(supabase, targetDate = getBangkokTodayDate(), forceRefresh = false) {
  if (!supabase) return { set: null, quests: [] };

  const now = Date.now();
  // ใช้ In-memory cache หากยังอยู่ในวันเดิมและไม่เกิน 10 นาที
  if (
    !forceRefresh &&
    cachedQuestData.date === targetDate &&
    Array.isArray(cachedQuestData.quests) &&
    cachedQuestData.quests.length > 0 &&
    now - cachedQuestData.fetchedAt < 10 * 60 * 1000
  ) {
    return { set: cachedQuestData.set, quests: cachedQuestData.quests };
  }

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

      cachedQuestData = {
        date: targetDate,
        set: existingSet,
        quests: orderedQuests,
        fetchedAt: Date.now()
      };

      return { set: existingSet, quests: orderedQuests };
    }

    // 2. หากยังไม่มี ให้สุ่มสร้างชุดใหม่ 3 เควสตาม Option A (Exhaustion Cycle: ไม่ซ้ำจนกว่าจะวนครบ Pool)
    // ดึงประวัติชุดเควสที่ผ่านมาก่อน targetDate เพื่อคำนวณเควสที่ยังไม่ออกในรอบปัจจุบัน
    const { data: pastSets } = await supabase
      .from("daily_quest_sets")
      .select("quest_date, quest_ids")
      .lt("quest_date", targetDate)
      .order("quest_date", { ascending: true })
      .limit(60);

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

    // ฟังก์ชันคำนวณแคนดิเดตที่ยังไม่ออกในรอบปัจจุบัน (Exhaustion Pool)
    const getExhaustionCandidates = (pool) => {
      if (!pool || pool.length === 0) return [];
      const poolIds = new Set(pool.map((q) => q.id));
      let currentCycle = new Set();
      let lastPickedId = null;

      if (Array.isArray(pastSets)) {
        for (const set of pastSets) {
          const pickedId = set.quest_ids?.find((id) => poolIds.has(id));
          if (pickedId) {
            lastPickedId = pickedId;
            if (currentCycle.has(pickedId) || currentCycle.size >= pool.length) {
              currentCycle = new Set([pickedId]);
            } else {
              currentCycle.add(pickedId);
            }
          }
        }
      }

      let remaining = pool.filter((q) => !currentCycle.has(q.id));
      if (remaining.length === 0) {
        // เมื่อวนครบทั้ง Pool แล้ว รีเซ็ตรอบใหม่ (หลีกเลี่ยงเควสของเมื่อวาน)
        remaining = pool.filter((q) => pool.length <= 1 || q.id !== lastPickedId);
      }
      return remaining.length > 0 ? remaining : pool;
    };

    const pickOne = (pool) => {
      const candidates = getExhaustionCandidates(pool);
      if (!candidates || candidates.length === 0) return null;
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

    cachedQuestData = {
      date: targetDate,
      set: insertedSet,
      quests: selectedQuests,
      fetchedAt: Date.now()
    };

    return { set: insertedSet, quests: selectedQuests };
  } catch (err) {
    console.error("[dailyQuest] getOrInitDailyQuestSet error:", err.message);
    return { set: null, quests: [] };
  }
}

/**
 * ดึงสถานะ Progress ของผู้ใช้ในวันนั้น (พร้อม In-Memory Cache 45s)
 * @param {object} supabase
 * @param {string} userId
 * @param {string} targetDate
 * @param {boolean} forceRefresh
 * @returns {Promise<object>} map: { [quest_id]: progressRow }
 */
async function getUserDailyProgress(supabase, userId, targetDate = getBangkokTodayDate(), forceRefresh = false) {
  if (!supabase || !userId) return {};

  const cacheKey = `${userId}:${targetDate}`;
  const now = Date.now();
  if (!forceRefresh) {
    const cached = userProgressCache.get(cacheKey);
    if (cached && cached.expiresAt > now) {
      return cached.data;
    }
  }

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

    // แคชไว้ 45 วินาที เพื่อดูดซับ Burst Message ในห้องแชท
    userProgressCache.set(cacheKey, {
      data: map,
      expiresAt: now + 45 * 1000
    });

    // ทำความสะอาดแคชเมื่อขนาดเกิน 3000 รายการ
    if (userProgressCache.size > 3000) {
      for (const [k, v] of userProgressCache.entries()) {
        if (v.expiresAt <= now) userProgressCache.delete(k);
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
      let healingMsg = "วันนี้เก่งมากแล้ว พักผ่อนเยอะๆ นะคะ 🐻✨";
      try {
        const { data } = await supabase
          .from("healing_messages")
          .select("message")
          .eq("status", "approved");
        if (data && data.length > 0) {
          const randItem = data[Math.floor(Math.random() * data.length)];
          if (randItem?.message) {
            healingMsg = randItem.message;
          }
        }
      } catch (err) {
        console.warn("[dailyQuest] Failed to fetch random healing message:", err.message);
      }

      const bonusPayload = buildAllQuestsBonusNotificationPayload(
        user,
        FULL_COMPLETION_BONUS_POINTS,
        healingMsg
      );
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

    // ล้างแคชเพื่อให้รีเฟรชสถานะเควสใหม่
    invalidateUserProgressCache(user.id, targetDate);

    // 2. มอบแต้มรางวัลของเควสนี้ (ถ้ามี)
    const pointsToAdd = Number(quest.reward_points) || 0;
    if (pointsToAdd > 0) {
      await updateUserPoints(supabase, user.id, pointsToAdd);
    }

    // 2.1 มอบยศ Discord (ถ้ามี reward_role_id)
    let roleAwardSuccess = false;
    let roleAwardDetail = null;
    const roleIdToAdd = quest.reward_role_id || quest.trigger_config?.reward_role_id;

    if (roleIdToAdd && client) {
      try {
        const targetGuildId = process.env.GUILD_ID || "1144251788493602848";
        // 1. ลองดึงจาก Main Guild ก่อน
        let targetGuild = client.guilds.cache.get(targetGuildId) || (await client.guilds.fetch(targetGuildId).catch(() => null));
        let member = null;

        if (targetGuild) {
          member = await targetGuild.members.fetch(user.id).catch(() => null);
        }

        // 2. หากยังไม่พบ ให้ค้นหาจากทุกกิลด์ที่บอทอยู่
        if (!member) {
          for (const g of client.guilds.cache.values()) {
            member = await g.members.fetch(user.id).catch(() => null);
            if (member) {
              targetGuild = g;
              break;
            }
          }
        }

        if (member) {
          const hasRole = member.roles.cache.has(roleIdToAdd);
          if (!hasRole) {
            await member.roles.add(roleIdToAdd, `Daily Quest Reward: ${quest.title}`);
            roleAwardSuccess = true;
            roleAwardDetail = "awarded";
            console.log(`[dailyQuest] 🎖️ Awarded role ${roleIdToAdd} to user ${user.id} in guild ${targetGuild?.name || targetGuildId} (${quest.title})`);
          } else {
            roleAwardSuccess = true;
            roleAwardDetail = "already_has_role";
            console.log(`[dailyQuest] ℹ️ User ${user.id} already has role ${roleIdToAdd} (${quest.title})`);
          }
        } else {
          console.warn(`[dailyQuest] ⚠️ Could not fetch member ${user.id} in guild ${targetGuildId} to award role ${roleIdToAdd}`);
          roleAwardDetail = "member_not_found";
        }
      } catch (roleErr) {
        console.error(`[dailyQuest] ❌ Failed to award role ${roleIdToAdd} to user ${user.id}:`, roleErr);
        roleAwardDetail = `error: ${roleErr.message}`;
      }
    }

    // 3. บันทึกสถิติ Analytics
    await supabase
      .from("daily_quest_analytics")
      .insert({
        quest_date: targetDate,
        event_type: "quest_completed",
        user_id: user.id,
        metadata: { quest_code: quest.code, reward_points: pointsToAdd, reward_role_id: roleIdToAdd || null }
      })
      .then(null, () => {});

    // 4. ส่งเข้าคิวแจ้งเตือน (Debounce 2.5 วินาที รวมสูงสุด 10 คนต่อ message)
    const avatarUrl =
      (typeof user.displayAvatarURL === "function"
        ? user.displayAvatarURL({ extension: "png", size: 256, forceStatic: true })
        : user.avatarUrl) ||
      user.defaultAvatarURL ||
      "https://cdn.discordapp.com/embed/avatars/0.png";

    queueQuestCompletionNotification(client, {
      userId: user.id,
      avatarUrl,
      questId: quest.id,
      questTitle: quest.title,
      rewardPoints: pointsToAdd,
      rewardRoleId: roleIdToAdd || null,
      rewardRoleName: quest.reward_role_name || quest.trigger_config?.reward_role_name || (roleIdToAdd ? client.guilds.cache.first()?.roles.cache.get(roleIdToAdd)?.name : null) || null
    });

    // 5. ตรวจสอบเงื่อนไขโบนัสครบ 3 เควส
    await checkAndAwardFullBonus(client, supabase, user, targetDate, dailyQuests);
  } catch (err) {
    console.error("[dailyQuest] completeQuest error:", err.message);
  }
}

// ─── Quest Completion Notification Queue (Debounce 2.5s) ──────────────────
const questCompletionQueue = [];
let questCompletionDebounceTimer = null;
const BATCH_DEBOUNCE_MS = 2500; // 2.5 วินาที

/**
 * เพิ่มรายการเควสที่สำเร็จเข้าคิว และตั้งเวลาส่งแจ้งเตือนแบบรวมกลุ่ม
 * @param {import('discord.js').Client} client
 * @param {object} item { userId, avatarUrl, questId, questTitle, rewardPoints, rewardRoleId }
 */
function queueQuestCompletionNotification(client, item) {
  questCompletionQueue.push(item);

  if (questCompletionDebounceTimer) {
    clearTimeout(questCompletionDebounceTimer);
  }

  questCompletionDebounceTimer = setTimeout(async () => {
    questCompletionDebounceTimer = null;
    await flushQuestCompletionQueue(client);
  }, BATCH_DEBOUNCE_MS);
}

/**
 * ประมวลผลและส่งการ์ดแจ้งเตือนเควสที่สะสมไว้ในคิว (1 message สูงสุด 10 คน)
 * @param {import('discord.js').Client} client
 */
async function flushQuestCompletionQueue(client) {
  if (questCompletionQueue.length === 0) return;

  const itemsToProcess = questCompletionQueue.splice(0, questCompletionQueue.length);

  try {
    const notifyCh =
      client.channels.cache.get(NOTIFY_CHANNEL_ID) ||
      (await client.channels.fetch(NOTIFY_CHANNEL_ID).catch(() => null));

    if (!notifyCh || !notifyCh.isTextBased()) return;

    // จัดกลุ่มตาม questId (หรือ questTitle)
    const groupedByQuest = new Map();
    for (const item of itemsToProcess) {
      const key = item.questId || item.questTitle;
      if (!groupedByQuest.has(key)) {
        groupedByQuest.set(key, { title: item.questTitle, items: [] });
      }
      groupedByQuest.get(key).items.push(item);
    }

    // ส่งข้อความแยกแต่ละเควส (จำกัดสูงสุด 10 คนต่อ 1 message หากเกินให้แยกข้อความ)
    for (const group of groupedByQuest.values()) {
      const allItems = group.items;
      const CHUNK_SIZE = 10;

      for (let i = 0; i < allItems.length; i += CHUNK_SIZE) {
        const chunk = allItems.slice(i, i + CHUNK_SIZE);
        let payload;

        if (chunk.length === 1) {
          // หากมี 1 คน ส่งการ์ดแบบเดี่ยว (มีรูปโปรไฟล์ด้านขวา)
          const single = chunk[0];
          payload = buildQuestCompletedNotificationPayload(
            { id: single.userId, avatarUrl: single.avatarUrl },
            {
              title: group.title,
              reward_points: single.rewardPoints,
              reward_role_id: single.rewardRoleId,
              reward_role_name: single.rewardRoleName
            }
          );
        } else {
          // หากมีหลายคน (2-10 คน) ส่งการ์ดแบบรวมกลุ่ม
          const formattedChunk = chunk.map((c) => ({
            ...c,
            reward_points: c.rewardPoints,
            reward_role_id: c.rewardRoleId,
            reward_role_name: c.rewardRoleName
          }));
          payload = buildBatchQuestCompletedNotificationPayload(group.title, formattedChunk);
        }

        await notifyCh.send(payload).catch((err) => {
          console.error("[dailyQuest] Failed to send quest completed notification:", err.message);
        });

        // เว้นวรรค 200ms ป้องกัน rate limit หากมีหลายข้อความ
        if (i + CHUNK_SIZE < allItems.length) {
          await new Promise((r) => setTimeout(r, 200));
        }
      }
    }
  } catch (err) {
    console.error("[dailyQuest] Error in flushQuestCompletionQueue:", err.message);
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
  // ตรวจสอบ Blacklist จาก sharedSettings.json
  const blacklistRoles = sharedSettings.role_blacklist || [];
  if (eventContext.member) {
    const memberRoles = eventContext.member.roles;
    const isBlacklisted = blacklistRoles.some((roleId) =>
      Array.isArray(memberRoles) ? memberRoles.includes(roleId) : Boolean(memberRoles?.cache?.has?.(roleId))
    );
    if (isBlacklisted) return;
  }

  const today = getBangkokTodayDate();
  const { quests } = await getOrInitDailyQuestSet(supabase, today);
  if (!quests || quests.length === 0) return;

  // ⚡ FAST GUARD: กรองว่าวันนี้มีเควสที่ตรงกับ triggerType นี้หรือไม่ ก่อนดึง Database!
  // ช่วยตัด Supabase REST calls ได้มหาศาลเมื่อไม่มีเควสประเภทนี้ในชุดประจำวัน
  const hasMatchingTrigger = quests.some((q) => q.trigger_type === triggerType);
  if (!hasMatchingTrigger) return;

  const progressMap = await getUserDailyProgress(supabase, user.id, today);

  for (const quest of quests) {
    // หากผ่านเควสนี้ไปแล้ว ให้ข้าม
    if (progressMap[quest.id]?.is_completed) continue;

    // ตรวจสอบความสอดคล้องของ Trigger Type
    if (quest.trigger_type !== triggerType) continue;

    // ตรวจสอบเงื่อนไขย่อย (Trigger Config)
    const cfg = quest.trigger_config || {};

    // ฟังก์ชันตรวจสอบ Channel และ Forum/Thread Parent Channel รวมถึงหมวดหมู่ (Category)
    const isChannelMatch = () => {
      const allowedChannels = cfg.channel_ids || (cfg.channel_id ? [cfg.channel_id] : null);
      const allowedCategories = cfg.category_ids || (cfg.category_id ? [cfg.category_id] : null);

      const hasChannels = allowedChannels && allowedChannels.length > 0;
      const hasCategories = allowedCategories && allowedCategories.length > 0;

      if (!hasChannels && !hasCategories) return true;

      // ตรวจสอบหมวดหมู่ (Category ID): สำหรับ Voice Channel คือ channel.parentId
      if (hasCategories) {
        if (!eventContext.parentId || !allowedCategories.includes(eventContext.parentId)) {
          return false;
        }
      }

      // ตรวจสอบห้อง (Channel ID หรือ Forum Thread Parent ID)
      if (hasChannels) {
        // ข้อยกเว้นสำหรับมินิเกม: หากเควสระบุ game_id ชัดเจนแล้ว ให้ยึด game_id เป็นหลัก
        // เพื่อป้องกันกรณี channel_id ในเควสไม่ตรงกับตาราง minigame_settings หรือมีการย้ายห้อง
        const isMinigameWithId =
          (triggerType === "minigame_win" || triggerType === "minigame_play") &&
          cfg.game_id &&
          cfg.game_id !== "any";
        if (!isMinigameWithId) {
          const targetIds = [eventContext.channelId, eventContext.parentId].filter(Boolean);
          if (!targetIds.some((id) => allowedChannels.includes(id))) {
            return false;
          }
        }
      }

      return true;
    };

    if (!isChannelMatch()) continue;

    if (triggerType === "keyword") {
      const kwList = cfg.keywords || [];
      const text = (eventContext.text || "").toLowerCase().trim();
      const match = kwList.some((kw) => text.includes(kw.toLowerCase()));
      if (!match) continue;
    } else if (triggerType === "command_usage") {
      if (cfg.command && eventContext.commandName !== cfg.command) continue;
    } else if (triggerType === "chat_any" || triggerType === "voice_duration" || triggerType === "voice_join") {
      if (cfg.min_members && (eventContext.memberCount || 0) < cfg.min_members) continue;
    } else if (triggerType === "chat_media") {
      if (cfg.media_type && eventContext.mediaType !== cfg.media_type) continue;
    } else if (triggerType === "reaction_add") {
      if (cfg.message_url && eventContext.messageUrl !== cfg.message_url) continue;
    } else if (triggerType === "horoscope_usage") {
      if (cfg.tarot_type && cfg.tarot_type !== "any" && eventContext.tarotType !== cfg.tarot_type) continue;
      if (cfg.command && cfg.command !== "any" && eventContext.commandName !== cfg.command) continue;
    } else if (triggerType === "minigame_win" || triggerType === "minigame_play") {
      if (cfg.game_id && cfg.game_id !== "any" && Number(cfg.game_id) !== Number(eventContext.gameId)) continue;
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

      // อัปเดต In-Memory Cache เพื่อลดการ Query ซ้ำ
      const cacheKey = `${user.id}:${today}`;
      const cached = userProgressCache.get(cacheKey);
      if (cached && cached.data) {
        cached.data[quest.id] = {
          quest_date: today,
          user_id: user.id,
          quest_id: quest.id,
          current_progress: currentProgress,
          target_count: target,
          is_completed: false
        };
        cached.expiresAt = Date.now() + 45 * 1000;
      }
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

  const roleId = quest.reward_role_id || quest.trigger_config?.reward_role_id;
  const rewardDesc = [];
  if (quest.reward_points > 0) rewardDesc.push(`มอบแต้ม +${quest.reward_points}`);
  if (roleId) rewardDesc.push(`มอบยศ <@&${roleId}>`);
  const rewardNotice = rewardDesc.length > 0 ? ` (${rewardDesc.join(", ")})` : "";

  return {
    success: true,
    message: `✅ อนุมัติเควส **${quest.title}** ให้กับ <@${targetUser.id}> เรียบร้อยแล้วค่ะ!${rewardNotice}`
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
