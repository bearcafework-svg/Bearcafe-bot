// src/utils/pointManager.js — จัดการแจกแต้มพร้อมระบบ Daily Cap และ Max Cap
const cfg = require('../../points/settingCheckIn.json');

const DAILY_CAP_MAP = {
  750: 150,
  1000: 200,
  1500: 250,
  2000: 300,
  2500: 350,
  3000: 400,
  4000: 450,
  5000: 500,
  6000: 550,
  7500: 600,
  9000: 700,
  10000: 800,
  12000: 1000,
};

function getTodayBangkok() {
  return new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
}

const LIMITED_ROLE_ID = cfg?.limited_role?.role_id || '1383998275711012956';
const LIMITED_BONUS_CAP = cfg?.limited_role?.bonus_max_cap ?? 15000;
const LIMITED_BONUS_DAILY = cfg?.limited_role?.bonus_daily_cap ?? 1500;

function getDailyCap(maxCap, member = null) {
  const hasLimited = Boolean(member?.roles?.cache?.has(LIMITED_ROLE_ID)) || (maxCap >= LIMITED_BONUS_CAP);
  const baseCap = hasLimited ? (maxCap >= LIMITED_BONUS_CAP ? maxCap - LIMITED_BONUS_CAP : maxCap) : maxCap;
  const baseDaily = DAILY_CAP_MAP[baseCap] ?? (baseCap >= 12000 ? 1000 : 150);
  return hasLimited ? (baseDaily + LIMITED_BONUS_DAILY) : baseDaily;
}

function getOverflowCap(maxCap, member = null) {
  return getDailyCap(maxCap, member);
}

function getMaxPoints(member) {
  let maxPoints = cfg.DEFAULT_CAP || 750;
  if (!member || !member.roles) return maxPoints;
  for (const [roleId, cap] of Object.entries(cfg.ROLE_CAPS || {})) {
    if (member.roles.cache.has(roleId)) {
      if (cap > maxPoints) maxPoints = cap;
    }
  }
  if (member.roles.cache.has(LIMITED_ROLE_ID)) {
    maxPoints += LIMITED_BONUS_CAP;
  }
  return maxPoints;
}

function checkAndCleanExpiredOverflow(row) {
  if (!row) return { overflowPoints: 0, overflowExpiresAt: null, wasExpired: false };
  const now = Date.now();
  const expiresAt = row.overflow_expires_at ? new Date(row.overflow_expires_at).getTime() : null;
  if (expiresAt && now > expiresAt) {
    return {
      overflowPoints: 0,
      overflowExpiresAt: null,
      wasExpired: true
    };
  }
  return {
    overflowPoints: row.overflow_points ?? 0,
    overflowExpiresAt: row.overflow_expires_at ?? null,
    wasExpired: false
  };
}

async function autoDrainOverflow(supabase, member, userId) {
  return withUserPointLock(userId, async () => {
    const maxCap = member ? getMaxPoints(member) : 750;

    const { data: row, error } = await supabase
      .from('user_points')
      .select('points, max_cap, daily_points, last_reset_date, overflow_points, overflow_expires_at')
      .eq('discord_id', userId)
      .maybeSingle();

    if (error || !row) {
      return { drained: 0, points: row?.points ?? 0, overflow: 0, overflowExpiresAt: null };
    }

    const currentPoints = row.points ?? 0;
    const cleaned = checkAndCleanExpiredOverflow(row);
    let overflowPoints = cleaned.overflowPoints;
    let overflowExpiresAt = cleaned.overflowExpiresAt;

    const availableSpace = Math.max(0, maxCap - currentPoints);
    let drained = 0;

    if (availableSpace > 0 && overflowPoints > 0) {
      drained = Math.min(availableSpace, overflowPoints);
      const newPoints = currentPoints + drained;
      overflowPoints -= drained;
      if (overflowPoints <= 0) {
        overflowExpiresAt = null;
        overflowPoints = 0;
      }

      await supabase.from('user_points').update({
        points: newPoints,
        max_cap: maxCap,
        overflow_points: overflowPoints,
        overflow_expires_at: overflowExpiresAt,
        updated_at: new Date().toISOString()
      }).eq('discord_id', userId);

      return {
        drained,
        points: newPoints,
        overflow: overflowPoints,
        overflowExpiresAt
      };
    } else if (cleaned.wasExpired) {
      await supabase.from('user_points').update({
        overflow_points: 0,
        overflow_expires_at: null,
        updated_at: new Date().toISOString()
      }).eq('discord_id', userId);
    }

    return {
      drained: 0,
      points: currentPoints,
      overflow: overflowPoints,
      overflowExpiresAt
    };
  });
}

function getDailyResetTimestamp() {
  const now = new Date();
  // Get current date string in Asia/Bangkok
  const dateStr = now.toLocaleDateString('en-CA', { timeZone: 'Asia/Bangkok' });
  const [year, month, day] = dateStr.split('-').map(Number);
  
  // Create Date object for tomorrow midnight in Asia/Bangkok (+07:00)
  const tomorrowMidnight = new Date(Date.UTC(year, month - 1, day + 1, -7, 0, 0));
  return Math.floor(tomorrowMidnight.getTime() / 1000);
}

/**
 * คำนวณตัวคูณแต้มห้องเสียง (Voice Point Multiplier)
 * หมวดหมู่ 1543974947561537646:
 * - หากในห้องมีสมาชิก (คนจริง ไม่นับบอท) >= 2 คน -> ได้ x2
 * - หากมีเพียง 1 คน หรือไม่ใช่หมวดหมู่นี้ -> ได้ x1
 */
function getVoicePointMultiplier(channel) {
  if (!channel) return 1;
  const POINT_X2_CATEGORY_ID = '1543974947561537646';
  if (channel.parentId === POINT_X2_CATEGORY_ID) {
    let nonBotMembersCount = 0;
    if (channel.members) {
      if (typeof channel.members.filter === 'function') {
        nonBotMembersCount = channel.members.filter(m => !m.user?.bot).size;
      } else if (typeof channel.members.values === 'function') {
        for (const member of channel.members.values()) {
          if (!member.user?.bot) nonBotMembersCount++;
        }
      }
    }
    return nonBotMembersCount >= 2 ? 2 : 1;
  }
  return 1;
}

const userPointLocks = new Map();

/**
 * Mutex lock ต่อรายบุคคล (userId) เพื่อจัดคิวธุรกรรมคะแนนแบบ Read-Modify-Write ไม่ให้เขียนทับกัน
 */
function withUserPointLock(userId, fn) {
  if (!userId) return fn();
  const currentLock = userPointLocks.get(userId) || Promise.resolve();
  let release;
  const nextLock = new Promise((resolve) => { release = resolve; });
  userPointLocks.set(userId, nextLock);

  return (async () => {
    try {
      await currentLock;
      return await fn();
    } finally {
      release();
      if (userPointLocks.get(userId) === nextLock) {
        userPointLocks.delete(userId);
      }
    }
  })();
}

async function addPointsWithCap(supabase, member, userId, pointsDelta) {
  return withUserPointLock(userId, async () => {
    const today = getTodayBangkok();

    const { data: row, error } = await supabase
      .from('user_points')
      .select('points, max_cap, daily_points, last_reset_date, overflow_points, overflow_expires_at')
      .eq('discord_id', userId)
      .maybeSingle();

    if (error) {
      console.error('[pointManager] fetch error:', error.message);
    }

    const calculatedCap = member ? getMaxPoints(member) : 750;
    const maxCap = Math.max(calculatedCap, row?.max_cap ?? 750);
    const dailyCap = getDailyCap(maxCap, member);
    const overflowCap = getOverflowCap(maxCap, member);

    const currentPoints = row?.points ?? 0;
    const lastReset = row?.last_reset_date ?? '';
    const needsReset = lastReset !== today;
    const dailyPoints = needsReset ? 0 : (row?.daily_points ?? 0);

    const cleaned = checkAndCleanExpiredOverflow(row);
    let overflowPoints = cleaned.overflowPoints;
    let overflowExpiresAt = cleaned.overflowExpiresAt;

    if (dailyPoints >= dailyCap) {
      if (cleaned.wasExpired) {
        await supabase.from('user_points').update({
          overflow_points: 0,
          overflow_expires_at: null,
          updated_at: new Date().toISOString()
        }).eq('discord_id', userId);
      }
      return {
        awarded: 0,
        toWallet: 0,
        toOverflow: 0,
        reason: 'daily_cap',
        points: currentPoints,
        overflowPoints,
        overflowExpiresAt,
        dailyPoints,
        dailyCap,
        maxCap,
        overflowCap
      };
    }

    const dailyRemaining = Math.max(0, dailyCap - dailyPoints);
    const allowedByDaily = Math.min(pointsDelta, dailyRemaining);

    const spaceInWallet = Math.max(0, maxCap - currentPoints);
    const toWallet = Math.min(allowedByDaily, spaceInWallet);
    const remainder = allowedByDaily - toWallet;

    const spaceInOverflow = Math.max(0, overflowCap - overflowPoints);
    const toOverflow = Math.min(remainder, spaceInOverflow);

    const actualEarned = toWallet + toOverflow;

    if (actualEarned <= 0) {
      if (cleaned.wasExpired) {
        await supabase.from('user_points').update({
          overflow_points: 0,
          overflow_expires_at: null,
          updated_at: new Date().toISOString()
        }).eq('discord_id', userId);
      }
      return {
        awarded: 0,
        toWallet: 0,
        toOverflow: 0,
        reason: 'max_and_overflow_cap',
        points: currentPoints,
        overflowPoints,
        overflowExpiresAt,
        dailyPoints,
        dailyCap,
        maxCap,
        overflowCap
      };
    }

    const newPoints = currentPoints + toWallet;
    const newDailyPoints = dailyPoints + actualEarned;
    let newOverflowPoints = overflowPoints + toOverflow;
    let newOverflowExpiresAt = overflowExpiresAt;

    if (toOverflow > 0) {
      if (overflowPoints === 0 || !overflowExpiresAt) {
        newOverflowExpiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
      }
    }

    const { error: upsertErr } = await supabase.from('user_points').upsert(
      {
        discord_id: userId,
        points: newPoints,
        max_cap: maxCap,
        daily_points: newDailyPoints,
        last_reset_date: today,
        overflow_points: newOverflowPoints,
        overflow_expires_at: newOverflowExpiresAt,
        updated_at: new Date().toISOString()
      },
      { onConflict: 'discord_id' }
    );

    if (upsertErr) {
      console.error('[pointManager] upsert error:', upsertErr.message);
    }

    return {
      awarded: actualEarned,
      toWallet,
      toOverflow,
      points: newPoints,
      overflowPoints: newOverflowPoints,
      overflowExpiresAt: newOverflowExpiresAt,
      dailyPoints: newDailyPoints,
      dailyCap,
      maxCap,
      overflowCap
    };
  });
}

/**
 * ลบแต้มผู้เล่น (สำหรับบทลงโทษตอบผิด)
 * รองรับแต้มติดลบ (ไม่มี floor)
 */
async function deductPoints(supabase, userId, pointsToDeduct) {
  return withUserPointLock(userId, async () => {
    const { data: row, error } = await supabase
      .from('user_points')
      .select('points')
      .eq('discord_id', userId)
      .maybeSingle();

    if (error) {
      console.error('[pointManager] deductPoints fetch error:', error.message);
      return { deducted: 0, points: 0, error: error.message };
    }

    const currentPoints = row?.points ?? 0;
    const newPoints = currentPoints - pointsToDeduct;

    const { error: upsertErr } = await supabase.from('user_points').upsert(
      {
        discord_id: userId,
        points: newPoints
      },
      { onConflict: 'discord_id' }
    );

    if (upsertErr) {
      console.error('[pointManager] deductPoints upsert error:', upsertErr.message);
      return { deducted: 0, points: currentPoints, error: upsertErr.message };
    }

    return {
      deducted: pointsToDeduct,
      points: newPoints
    };
  });
}

module.exports = {
  getTodayBangkok,
  getDailyCap,
  getOverflowCap,
  getMaxPoints,
  getDailyResetTimestamp,
  getVoicePointMultiplier,
  withUserPointLock,
  checkAndCleanExpiredOverflow,
  autoDrainOverflow,
  addPointsWithCap,
  deductPoints
};
