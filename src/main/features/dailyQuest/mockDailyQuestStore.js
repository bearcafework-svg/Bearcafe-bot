// src/features/dailyQuest/mockDailyQuestStore.js
// ระบบบันทึกและติดตามภารกิจประจำวันแบบ Local Storage ( Zero Supabase Egress Mode )
const fs = require('fs');
const path = require('path');
const questPool = require('./questPool');

const STORAGE_PATH = path.join(__dirname, 'mockDailyQuestStore.json');

function getTodayBangkok() {
  const d = new Date();
  const bangkokDate = new Date(d.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const year = bangkokDate.getFullYear();
  const month = String(bangkokDate.getMonth() + 1).padStart(2, "0");
  const day = String(bangkokDate.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function loadStore() {
  try {
    if (fs.existsSync(STORAGE_PATH)) {
      const data = fs.readFileSync(STORAGE_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[mockDailyQuestStore] Error loading file:', err.message);
  }
  return { users: {} };
}

function saveStore(store) {
  try {
    fs.writeFileSync(STORAGE_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('[mockDailyQuestStore] Error saving file:', err.message);
  }
}

/**
 * ดึงหรือสร้างภารกิจ 5 ข้อ (หมวดละ 1 ข้อ) สำหรับวันปัจจุบันของผู้เล่น
 */
function getOrAssignDailyQuestsLocal(userId) {
  const store = loadStore();
  const today = getTodayBangkok();

  if (!store.users[userId]) {
    store.users[userId] = {
      dates: {},
      points: 1000
    };
  }

  const userRecord = store.users[userId];
  if (!userRecord.dates[today]) {
    const categories = ["CHAT", "VOICE", "MINIGAME", "FEATURE", "SOCIAL"];
    const assigned = [];
    for (const cat of categories) {
      const catQuests = questPool.filter(q => q.category === cat);
      if (catQuests.length > 0) {
        const picked = catQuests[Math.floor(Math.random() * catQuests.length)];
        assigned.push({
          quest_id: picked.id,
          category: picked.category,
          title: picked.title,
          description: picked.description,
          target_count: picked.targetCount,
          unit: picked.unit,
          reward_points: picked.rewardPoints,
          tracker_type: picked.trackerType,
          current_progress: 0,
          is_completed: false,
          is_claimed: false
        });
      }
    }

    userRecord.dates[today] = {
      quests: assigned,
      summary: { completed_count: 0, is_jackpot_claimed: false, reroll_used: 0 }
    };

    saveStore(store);
  }

  return userRecord.dates[today];
}

const TRACKER_ALIASES = {
  MESSAGE_COUNT: ["MESSAGE_COUNT", "CHAT_CHANNELS", "TIME_GREETINGS", "TIME_SLOTS", "CHAT_AFTER_DELAY", "VISIT_CHANNELS"],
  MESSAGE_REPLIED: ["MESSAGE_REPLIED"],
  VOICE_MINUTES: ["VOICE_MINUTES", "VOICE_INTERACTION", "VOICE_CONTINUOUS"],
  VOICE_CHANNELS: ["VOICE_CHANNELS"],
  VOICE_WITH_FRIENDS: ["VOICE_WITH_FRIENDS", "NEW_FRIENDS_INTERACT"],
  VOICE_CONTINUOUS: ["VOICE_CONTINUOUS"],
  VOICE_SESSIONS: ["VOICE_SESSIONS"],
  VOICE_CROWD: ["VOICE_CROWD"],
  CREATE_ROOM: ["CREATE_ROOM", "JOIN_SERVER_EVENT"],
  MINIGAME_PLAY: ["MINIGAME_PLAY", "MINIGAME_TYPES_2", "MINIGAME_TYPES_3"],
  MINIGAME_WIN: ["MINIGAME_WIN", "MINIGAME_STREAK", "MINIGAME_PERFECT"],
  USE_HEALJAI: ["USE_HEALJAI", "USE_MULTI_FEATURES"],
  USE_HOROSCOPE: ["USE_HOROSCOPE", "USE_MULTI_FEATURES"],
  VIEW_BEAR_MARKET: ["VIEW_BEAR_MARKET", "USE_AD_REWARD", "USE_MULTI_FEATURES"],
  USE_MATCHMAKING: ["USE_MATCHMAKING"],
  JOIN_GAME_TABLE: ["JOIN_GAME_TABLE"]
};

function getTrackersToUpdate(trackerType) {
  return TRACKER_ALIASES[trackerType] || [trackerType];
}

/**
 * อัปเดตความคืบหน้าภารกิจตาม trackerType (เช่น MESSAGE_COUNT, VOICE_MINUTES ฯลฯ)
 */
function addProgressLocal(userId, trackerType, amount = 1) {
  if (!userId || !trackerType) return;
  const store = loadStore();
  const today = getTodayBangkok();
  const dayData = getOrAssignDailyQuestsLocal(userId);
  const trackersToUpdate = getTrackersToUpdate(trackerType);

  let updated = false;
  for (const q of dayData.quests) {
    if (!q.is_completed && trackersToUpdate.includes(q.tracker_type)) {
      q.current_progress = Math.min(q.target_count, q.current_progress + amount);
      if (q.current_progress >= q.target_count) {
        q.is_completed = true;
        dayData.summary.completed_count = (dayData.summary.completed_count || 0) + 1;
      }
      updated = true;
    }
  }

  if (updated) {
    store.users[userId].dates[today] = dayData;
    saveStore(store);
  }
}

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
 * กดรับรางวัลของภารกิจ 1 ข้อ
 */
function claimRewardLocal(userId, questId) {
  const store = loadStore();
  const today = getTodayBangkok();
  const dayData = getOrAssignDailyQuestsLocal(userId);

  const quest = dayData.quests.find(q => q.quest_id === questId);
  if (!quest || !quest.is_completed || quest.is_claimed) {
    return { success: false, pointsEarned: 0 };
  }

  quest.is_claimed = true;
  let pointsToAdd = quest.reward_points;

  // เช็คกรณีทำครบ 5/5 ข้อ และยังไม่ได้กดรับ Jackpot
  const completedAll = dayData.quests.every(q => q.is_completed);
  if (completedAll && !dayData.summary.is_jackpot_claimed) {
    dayData.summary.is_jackpot_claimed = true;
    pointsToAdd += 100; // Jackpot bonus +100 แต้ม
  }

  store.users[userId].points = (store.users[userId].points || 0) + pointsToAdd;
  store.users[userId].dates[today] = dayData;
  saveStore(store);

  return { success: true, pointsEarned: quest.reward_points };
}

/**
 * กดรับรางวัลทั้งหมด
 */
function claimAllRewardsLocal(userId) {
  const store = loadStore();
  const today = getTodayBangkok();
  const dayData = getOrAssignDailyQuestsLocal(userId);

  let totalEarned = 0;
  let claimedAny = false;

  for (const q of dayData.quests) {
    if (q.is_completed && !q.is_claimed) {
      q.is_claimed = true;
      totalEarned += q.reward_points;
      claimedAny = true;
    }
  }

  const completedAll = dayData.quests.every(q => q.is_completed);
  if (completedAll && !dayData.summary.is_jackpot_claimed) {
    dayData.summary.is_jackpot_claimed = true;
    totalEarned += 100; // Jackpot bonus
    claimedAny = true;
  }

  if (claimedAny) {
    store.users[userId].points = (store.users[userId].points || 0) + totalEarned;
    store.users[userId].dates[today] = dayData;
    saveStore(store);
  }

  return { success: claimedAny, totalEarned };
}

/**
 * สุ่มเปลี่ยนภารกิจ 1 ข้อ
 */
function rerollQuestLocal(userId, questId) {
  const store = loadStore();
  const today = getTodayBangkok();
  const dayData = getOrAssignDailyQuestsLocal(userId);

  if ((dayData.summary.reroll_used || 0) >= 1) return false;

  const qIndex = dayData.quests.findIndex(q => q.quest_id === questId);
  if (qIndex === -1 || dayData.quests[qIndex].is_completed) return false;

  const currentAssignedIds = dayData.quests.map(q => q.quest_id);
  const poolCat = questPool.filter(q => !currentAssignedIds.includes(q.id));

  if (poolCat.length === 0) return false;
  const newQuest = poolCat[Math.floor(Math.random() * poolCat.length)];

  dayData.quests[qIndex] = {
    quest_id: newQuest.id,
    category: newQuest.category,
    title: newQuest.title,
    description: newQuest.description,
    target_count: newQuest.targetCount,
    unit: newQuest.unit,
    reward_points: newQuest.rewardPoints,
    tracker_type: newQuest.trackerType,
    current_progress: 0,
    is_completed: false,
    is_claimed: false
  };

  dayData.summary.reroll_used = (dayData.summary.reroll_used || 0) + 1;
  store.users[userId].dates[today] = dayData;
  saveStore(store);
  return true;
}

function getWeeklyProgressLocal(userId) {
  const store = loadStore();
  const userRecord = store.users[userId];
  if (!userRecord || !userRecord.dates) return { count: 0, claimedTiers: [] };

  const weekStart = getWeekStartDateBangkok();
  let count = 0;

  for (const [dateStr, dayData] of Object.entries(userRecord.dates)) {
    if (dateStr >= weekStart && dayData.quests) {
      count += dayData.quests.filter(q => q.is_completed).length;
    }
  }

  const claimedTiers = userRecord.weeklyClaimedTiers || [];
  return { count, claimedTiers };
}

module.exports = {
  getOrAssignDailyQuestsLocal,
  addProgressLocal,
  claimRewardLocal,
  claimAllRewardsLocal,
  rerollQuestLocal,
  getWeeklyProgressLocal
};
