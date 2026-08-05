// src/utils/pointManager.js — จัดการแจกแต้มพร้อมระบบ Daily Cap และ Max Cap
const cfg = require('../points/settingCheckIn.json');

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

function getDailyCap(maxCap) {
  return DAILY_CAP_MAP[maxCap] ?? 150;
}

function getMaxPoints(member) {
  let maxPoints = cfg.DEFAULT_CAP || 750;
  if (!member || !member.roles) return maxPoints;
  for (const [roleId, cap] of Object.entries(cfg.ROLE_CAPS || {})) {
    if (member.roles.cache.has(roleId)) {
      if (cap > maxPoints) maxPoints = cap;
    }
  }
  return maxPoints;
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

async function addPointsWithCap(supabase, member, userId, pointsDelta) {
  const maxCap = member ? getMaxPoints(member) : 750;
  const dailyCap = getDailyCap(maxCap);
  const today = getTodayBangkok();

  const { data: row, error } = await supabase
    .from('user_points')
    .select('points, max_cap, daily_points, last_reset_date')
    .eq('discord_id', userId)
    .maybeSingle();

  if (error) {
    console.error('[pointManager] fetch error:', error.message);
  }

  const currentPoints = row?.points ?? 0;
  const lastReset = row?.last_reset_date ?? '';
  const needsReset = lastReset !== today;
  const dailyPoints = needsReset ? 0 : (row?.daily_points ?? 0);

  if (dailyPoints >= dailyCap) {
    return {
      awarded: 0,
      reason: 'daily_cap',
      points: currentPoints,
      dailyPoints,
      dailyCap,
      maxCap
    };
  }

  if (currentPoints >= maxCap) {
    return {
      awarded: 0,
      reason: 'max_cap',
      points: currentPoints,
      dailyPoints,
      dailyCap,
      maxCap
    };
  }

  const dailyRemaining = dailyCap - dailyPoints;
  const maxRemaining = maxCap - currentPoints;
  const actualEarned = Math.max(0, Math.min(pointsDelta, dailyRemaining, maxRemaining));

  if (actualEarned <= 0) {
    return {
      awarded: 0,
      reason: 'cap_reached',
      points: currentPoints,
      dailyPoints,
      dailyCap,
      maxCap
    };
  }

  const newPoints = currentPoints + actualEarned;
  const newDailyPoints = dailyPoints + actualEarned;

  const { error: upsertErr } = await supabase.from('user_points').upsert(
    {
      discord_id: userId,
      points: newPoints,
      max_cap: maxCap,
      daily_points: newDailyPoints,
      last_reset_date: today
    },
    { onConflict: 'discord_id' }
  );

  if (upsertErr) {
    console.error('[pointManager] upsert error:', upsertErr.message);
  }

  return {
    awarded: actualEarned,
    points: newPoints,
    dailyPoints: newDailyPoints,
    dailyCap,
    maxCap
  };
}

module.exports = {
  getTodayBangkok,
  getDailyCap,
  getMaxPoints,
  getDailyResetTimestamp,
  addPointsWithCap
};
