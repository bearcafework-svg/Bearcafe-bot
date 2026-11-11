// ===================================================
// src/akari/minigames/minigamesEngine.js
// ระบบมินิเกม Multi-Tenant สำหรับ Akari Bot (Public Engine)
// สไตล์การตกแต่ง ข้อความ หัวเรื่อง และอิโมจิ ถอดแบบจาก Bear Cafe Bot (บอทหลัก) 100%
// แยกฐานข้อมูลอย่างเด็ดขาด (ใช้ Akari Supabase / RAM Fallback)
// พร้อม Hybrid Anti-Multiplatform Concurrency Guard ป้องกันการเล่นหลายจอ
// ===================================================

const {
  MessageFlags,
  AttachmentBuilder,
  EmbedBuilder,
} = require('discord.js');
const googleTTS = require('google-tts-api');
const {
  getNextQuestion,
  maskWord,
  scrambleWord,
  generateHint,
} = require('../../features/minigames/questionBank');
const { createTextImageBuffer, createSentenceBuilderImageBuffer } = require('../../features/minigames/canvasGenerator');
const { safeDeferReply, safeRespond } = require('../../../utils/discordSafety');

// ─── ภาวะแวดล้อม / Emojis / Config (ตรงตามบอทหลัก 100%) ──────────────

const FLAG_V2 = MessageFlags.IsComponentsV2 || 32768;

const BEE_EMOJI_STR = '<:bee20000:1256669436350562355>';
const CHECKMARK_EMOJI_ID = '1358584609087946867';
const POINT_EMOJI = {
  id: '1548976664090779650',
  name: 'strawberryv2',
  animated: false,
};
const GIFT_EMOJI = {
  id: '1276130500410605609',
  name: '68492gift',
  animated: false,
};

// ─── Hybrid Anti-Multiplatform Concurrency Guard ───────────────────
const GAME_TYPES = {
  BUTTON: 'BUTTON',
  TEXT: 'TEXT',
  AUDIO: 'AUDIO',
};

const GAME_TYPE_MAP = {
  1: GAME_TYPES.TEXT,
  2: GAME_TYPES.TEXT,
  3: GAME_TYPES.TEXT,
  4: GAME_TYPES.TEXT,
  5: GAME_TYPES.AUDIO,
  6: GAME_TYPES.TEXT,
  7: GAME_TYPES.TEXT,
  8: GAME_TYPES.BUTTON,
  9: GAME_TYPES.BUTTON,
  10: GAME_TYPES.BUTTON,
  11: GAME_TYPES.AUDIO,
  12: GAME_TYPES.BUTTON,
  13: GAME_TYPES.BUTTON,
  15: GAME_TYPES.BUTTON,
  16: GAME_TYPES.BUTTON,
};

// State สำหรับเก็บคำที่ผู้เล่นกดไปแล้วในมินิเกมเรียงประโยค (Game 13)
const userSentenceProgress = new Map();

const TRANSITION_MIN_MS = {
  [GAME_TYPES.BUTTON]: 1200, // ขั้นต่ำ 1.2 วินาทีสำหรับสลับเข้าเล่นเกมปุ่ม
  [GAME_TYPES.TEXT]: 2000,   // ขั้นต่ำ 2.0 วินาทีสำหรับสลับเข้าเล่นเกมพิมพ์
  [GAME_TYPES.AUDIO]: 3000,  // ขั้นต่ำ 3.0 วินาทีสำหรับสลับเข้าเล่นเกมเสียง
};

// เก็บประวัติการเล่นล่าสุดของผู้ใช้ (userId -> { channelId, gameId, timestamp })
const userLastMinigameAction = new Map();
// ล็อกกันการยิงคำตอบซ้อนกันในระดับ millisecond เดียวกัน (In-Flight Concurrency Mutex)
const userInFlightProcessing = new Set();

// ล้างข้อมูลผู้เล่นที่ไม่มีกิจกรรมเกิน 1 นาที เพื่อไม่ให้กินหน่วยความจำ
setInterval(() => {
  const now = Date.now();
  for (const [uid, record] of userLastMinigameAction.entries()) {
    if (now - record.timestamp > 60000) {
      userLastMinigameAction.delete(uid);
    }
  }
  if (userSentenceProgress.size > 200) {
    userSentenceProgress.clear();
  }
}, 5 * 60 * 1000).unref();

// เก็บสถานะคูลดาวน์เมื่อตอบผิดของผู้เล่น (Global Scope Per User: userId -> expireTimestamp)
const userWrongCooldowns = new Map();

/**
 * ตรวจสอบว่าผู้เล่นกำลังติดคูลดาวน์จากการตอบผิดหรือไม่ (Global Scope)
 * @param {string} userId Discord User ID
 * @returns {{ inCooldown: boolean, expireTs: number }}
 */
function checkUserWrongCooldown(userId) {
  const expire = userWrongCooldowns.get(userId);
  if (expire && expire > Date.now()) {
    return { inCooldown: true, expireTs: Math.ceil(expire / 1000) };
  }
  if (expire) {
    userWrongCooldowns.delete(userId);
  }
  return { inCooldown: false, expireTs: 0 };
}

/**
 * สร้าง Component V2 เมื่อผู้เล่นตอบผิดและถูกหักแต้ม (บอทคุมะ)
 * @param {string} userId
 * @param {number} penalty
 * @param {number} endTs
 * @param {string} template
 * @param {string} currencyEmoji
 * @returns {object}
 */
function buildKumaPenaltyPayload(userId, penalty, endTs, template, currencyEmoji) {
  const emoji = currencyEmoji || '<:strawberryv2:1548976664090779650>';
  const defaultTpl = '## <:68440x:1358584606911369226> {user} ตอบไม่ถูก โดนหัก {emoji} **{point}** ติดคูลดาวน์ {cooldown}';
  const rawTpl = template || defaultTpl;

  const renderedHeader = rawTpl
    .replace(/\{user\}/g, `<@${userId}>`)
    .replace(/\{emoji\}/g, emoji)
    .replace(/\{point\}/g, `-${penalty}`)
    .replace(/\{cooldown\}/g, `<t:${endTs}:R>`);

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: renderedHeader,
          },
          {
            type: 14,
            spacing: 2,
          },
          {
            type: 10,
            content: '-# เมื่อท่านตอบผิดจะติดดูลดาวน์ทุกเกม เพื่อป้องกันการสลับห้องสแปม',
          },
        ],
      },
    ],
  };
}

/**
 * บันทึก Log ข้อผิดพลาดของ Interaction (ยกเว้น Interaction หมดอายุหรือถูกตอบไปแล้ว)
 */
function logAkariInteractionError(context, err) {
  if (!err) return;
  const code = err.code ?? err.rawError?.code;
  if (code === 10062 || code === 40060 || code === 10008) return;
  console.error(`[akari-minigames] ${context}:`, err.message || err);
}

/**
 * ตอบกลับหรืออัปเดตข้อความ Ephemeral อย่างปลอดภัย (ถอด flags ออกเมื่อเป็นการ update เพื่อป้องกัน Discord API 50035)
 */
async function respondAkariEphemeralSafe(interaction, payload, isUpdate = false) {
  if (isUpdate) {
    const { flags, ...cleanPayload } = payload;
    return interaction.update(cleanPayload).catch((err) => logAkariInteractionError('interaction.update failed', err));
  }
  const replyFlags = payload.flags ? (payload.flags | MessageFlags.Ephemeral) : MessageFlags.Ephemeral;
  return safeRespond(interaction, { ...payload, flags: replyFlags });
}

/**
 * ตรวจสอบความสมเหตุสมผลของการสลับห้องเล่นมินิเกม (Cross-Channel Feasibility Guard)
 */
function checkCrossChannelFeasibility(userId, targetChannelId, targetGameId) {
  if (userInFlightProcessing.has(userId)) {
    return {
      allowed: false,
      reason: 'IN_FLIGHT_CONFLICT',
    };
  }

  const lastAction = userLastMinigameAction.get(userId);
  if (!lastAction) {
    return { allowed: true };
  }

  if (lastAction.channelId === targetChannelId) {
    return { allowed: true };
  }

  const now = Date.now();
  const elapsed = now - lastAction.timestamp;
  const targetGameType = GAME_TYPE_MAP[targetGameId] || GAME_TYPES.TEXT;
  const requiredMs = TRANSITION_MIN_MS[targetGameType] || 2000;

  if (elapsed < requiredMs) {
    return {
      allowed: false,
      reason: 'CROSS_CHANNEL_TOO_FAST',
      elapsed,
      requiredMs,
      fromGameId: lastAction.gameId,
      toGameId: targetGameId,
    };
  }

  return { allowed: true };
}

function recordUserAction(userId, channelId, gameId) {
  userLastMinigameAction.set(userId, {
    channelId,
    gameId,
    timestamp: Date.now(),
  });
}

// ─── Freemium Tier Management ─────────────────────────────────────────
const LIGHTWEIGHT_GAMES = [1, 2, 3, 4, 8, 9, 10, 12, 15, 16];
const HEAVYWEIGHT_GAMES = [5, 6, 7, 11, 13];
const FREE_QUOTA_LIMIT = 5;

// Cache สำหรับเก็บข้อมูลแผนสมาชิกของแต่ละ Guild: guildId -> { plan, expiresAt, status, cachedAt }
const tenantPlanCache = new Map();
const PLAN_CACHE_TTL_MS = 60 * 1000; // 60 วินาที

/**
 * ดึงสถานะแผนสมาชิกของแต่ละ Guild (Standard vs Premium)
 * พร้อมระบบตรวจสอบวันหมดอายุแบบ Passive (Passive Expiry Check)
 */
async function getTenantPlan(guildId, supabase, force = false) {
  if (!guildId) return { plan: 'standard', expiresAt: null, status: 'active', isPremium: false };

  if (!force && tenantPlanCache.has(guildId)) {
    const cached = tenantPlanCache.get(guildId);
    if (Date.now() - cached.cachedAt < PLAN_CACHE_TTL_MS) {
      if (cached.expiresAt && new Date(cached.expiresAt).getTime() < Date.now()) {
        return {
          plan: 'standard',
          expiresAt: cached.expiresAt,
          status: 'expired',
          isPremium: false,
        };
      }
      return {
        plan: cached.plan,
        expiresAt: cached.expiresAt,
        status: cached.status,
        isPremium: cached.plan === 'premium',
      };
    }
  }

  if (!supabase) {
    const defaultPlan = { plan: 'standard', expiresAt: null, status: 'active', isPremium: false };
    tenantPlanCache.set(guildId, { ...defaultPlan, cachedAt: Date.now() });
    return defaultPlan;
  }

  try {
    const { data, error } = await supabase
      .from('tenant_configs')
      .select('guild_id, plan, expires_at, status')
      .eq('guild_id', guildId)
      .maybeSingle();

    if (error || !data) {
      const defaultPlan = { plan: 'standard', expiresAt: null, status: 'active', isPremium: false };
      tenantPlanCache.set(guildId, { ...defaultPlan, cachedAt: Date.now() });
      return defaultPlan;
    }

    let plan = data.plan || 'standard';
    const expiresAt = data.expires_at || null;
    let status = data.status || 'active';

    // ตรวจสอบวันหมดอายุแบบ Passive
    if (expiresAt && new Date(expiresAt).getTime() < Date.now()) {
      plan = 'standard';
      status = 'expired';
    }

    const planInfo = {
      plan,
      expiresAt,
      status,
      isPremium: plan === 'premium',
    };

    tenantPlanCache.set(guildId, { ...planInfo, cachedAt: Date.now() });
    return planInfo;
  } catch (err) {
    console.warn(`[akari-minigames] getTenantPlan error for guild ${guildId}:`, err.message);
    const defaultPlan = { plan: 'standard', expiresAt: null, status: 'active', isPremium: false };
    tenantPlanCache.set(guildId, { ...defaultPlan, cachedAt: Date.now() });
    return defaultPlan;
  }
}

function invalidateTenantPlanCache(guildId) {
  if (guildId) {
    tenantPlanCache.delete(guildId);
  } else {
    tenantPlanCache.clear();
  }
}

/**
 * ตรวจสอบสิทธิ์การเปิด/เล่นมินิเกมตามระดับสมาชิก (Tier Validation)
 */
async function validateGameAccess(guildId, targetGameId, supabase, currentEnabledCount = null) {
  const planInfo = await getTenantPlan(guildId, supabase);

  if (planInfo.isPremium) {
    return { allowed: true, plan: 'premium' };
  }

  const numTargetGameId = Number(targetGameId);

  // 1. Feature-Gating Check: ไม่อนุญาต Heavyweight Games สำหรับผู้ใช้ฟรี
  if (HEAVYWEIGHT_GAMES.includes(numTargetGameId)) {
    return {
      allowed: false,
      reason: 'FEATURE_GATED',
      plan: 'standard',
      message: 'มินิเกมนี้เป็นเกมพิเศษ (มีรูปภาพการ์ด/ไฟล์เสียง) สำหรับสมาชิก Premium เท่านั้น',
    };
  }

  // 2. Quota Check: โควตาฟรีเปิดได้สูงสุด 5 เกม
  if (currentEnabledCount !== null) {
    if (currentEnabledCount >= FREE_QUOTA_LIMIT) {
      return {
        allowed: false,
        reason: 'QUOTA_EXCEEDED',
        plan: 'standard',
        message: `เซิร์ฟเวอร์เปิดใช้งานมินิเกมครบโควตาฟรีแล้ว (${FREE_QUOTA_LIMIT}/${FREE_QUOTA_LIMIT} เกม) กรุณาอัปเกรดเป็น Premium หรือปิดบางเกมก่อน`,
      };
    }
  } else if (supabase) {
    try {
      // ใช้ Cache ของ getTenantSettings และ getTenantChannels เพื่อไม่ให้ยิง DB ทุกครั้งที่สปอว์นโจทย์
      const [settingsMap, channels] = await Promise.all([
        getTenantSettings(supabase, guildId),
        getTenantChannels(supabase, guildId),
      ]);

      const disabledGameIds = new Set(
        Object.entries(settingsMap || {})
          .filter(([, s]) => s && s.enabled === false)
          .map(([gid]) => Number(gid))
      );

      if (Array.isArray(channels) && channels.length > 0) {
        // กรองเฉพาะเกมที่เปิดใช้งานอยู่จริง (ไม่ถูกปิด)
        const activeChannels = channels.filter((c) => !disabledGameIds.has(Number(c.game_id)));

        // กรองเฉพาะเกม Lightweight และหยิบตามโควตาฟรี
        const allowedGameIds = activeChannels
          .map((c) => Number(c.game_id))
          .filter((gid) => LIGHTWEIGHT_GAMES.includes(gid))
          .slice(0, FREE_QUOTA_LIMIT);

        const isExistingInAllowed = allowedGameIds.includes(numTargetGameId);
        const totalActiveCount = activeChannels.length;

        // ถ้าเป็นเกมใหม่ที่จะเพิ่มเข้ามา หรือเป็นห้องที่เกินโควตา 5 ห้องแรก (เฉพาะเมื่อจำนวนห้องที่เปิดอยู่รวมเต็มหรือเกินโควตาฟรีแล้ว)
        if (!isExistingInAllowed && totalActiveCount >= FREE_QUOTA_LIMIT) {
          return {
            allowed: false,
            reason: 'QUOTA_EXCEEDED',
            plan: 'standard',
            message: `เซิร์ฟเวอร์เปิดใช้งานมินิเกมครบโควตาฟรีแล้ว (สูงสุด ${FREE_QUOTA_LIMIT} เกม) หรือหมดอายุการใช้งาน Premium แล้ว`,
          };
        }
      }
    } catch (_) {}
  }

  return { allowed: true, plan: 'standard' };
}

// ─── Memory Cache / Sessions (Multi-Tenant Isolated) ───────────────

const activeTenantSessions = new Map();
const processingChannels = new Set();
const ttsAudioCache = new Map();

const guildSettingsCache = new Map(); // guildId -> { gameId: { enabled, points_per_win }, ... }
const guildChannelsCache = new Map(); // guildId -> { data: [{ game_id, created_at }], expiresAt }
const CHANNELS_CACHE_TTL_MS = 5 * 60 * 1000; // แคชรายการห้องเกม 5 นาที
const guildLeaderboardCache = new Map(); // guildId -> [{ user_id, points, wins }, ... ]
const guildScoreBuffer = new Map(); // guildId:user_id -> { points_accumulated, wins_accumulated }

async function getTenantChannels(supabase, guildId) {
  const now = Date.now();
  const cached = guildChannelsCache.get(guildId);
  if (cached && now < cached.expiresAt) {
    return cached.data;
  }
  if (!supabase) return [];

  const { data, error } = await supabase
    .from('tenant_minigame_channels')
    .select('game_id, created_at')
    .eq('guild_id', guildId)
    .order('created_at', { ascending: true });

  if (error || !Array.isArray(data)) {
    return cached?.data || [];
  }
  guildChannelsCache.set(guildId, { data, expiresAt: now + CHANNELS_CACHE_TTL_MS });
  return data;
}

/**
 * ดึง settings ของ guild จาก cache หรือ DB (Akari Isolated)
 */
async function getTenantSettings(supabase, guildId) {
  if (guildSettingsCache.has(guildId)) {
    return guildSettingsCache.get(guildId);
  }

  const ALL_MINIGAME_IDS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 15, 16];

  if (!supabase) {
    const defaults = {};
    for (const i of ALL_MINIGAME_IDS) {
      defaults[i] = { enabled: true, points_per_win: 10 };
    }
    guildSettingsCache.set(guildId, defaults);
    return defaults;
  }

  try {
    const { data, error } = await supabase
      .from('tenant_minigame_settings')
      .select('game_id, enabled, points_per_win')
      .eq('guild_id', guildId);

    if (error) {
      console.warn(`[akari-minigames] fetch settings error for guild ${guildId}:`, error.message);
      const defaults = {};
      for (const i of ALL_MINIGAME_IDS) {
        defaults[i] = { enabled: true, points_per_win: 10 };
      }
      guildSettingsCache.set(guildId, defaults);
      return defaults;
    }

    const map = {};
    for (const i of ALL_MINIGAME_IDS) {
      map[i] = { enabled: true, points_per_win: 10 };
    }

    if (data && Array.isArray(data)) {
      for (const row of data) {
        map[row.game_id] = {
          enabled: row.enabled !== false,
          points_per_win: row.points_per_win != null ? row.points_per_win : 10,
        };
      }
    }
    guildSettingsCache.set(guildId, map);
    return map;
  } catch (e) {
    console.warn(`[akari-minigames] settings cache fallback for guild ${guildId}:`, e.message);
    const defaults = {};
    for (const i of ALL_MINIGAME_IDS) {
      defaults[i] = { enabled: true, points_per_win: 10 };
    }
    guildSettingsCache.set(guildId, defaults);
    return defaults;
  }
}

function setTenantSettingsInCache(guildId, gameId, settings) {
  const guildCache = guildSettingsCache.get(guildId) || {};
  guildCache[gameId] = settings;
  guildSettingsCache.set(guildId, guildCache);
}

function invalidateSettingsCache(guildId) {
  if (guildId) {
    guildSettingsCache.delete(guildId);
    guildChannelsCache.delete(guildId);
  } else {
    guildSettingsCache.clear();
    guildChannelsCache.clear();
  }
}

function invalidateLeaderboardCache(guildId) {
  if (guildId) {
    guildLeaderboardCache.delete(guildId);
    guildLeaderboardCache.delete(`${guildId}:points`);
    guildLeaderboardCache.delete(`${guildId}:wins`);
    for (const key of guildLeaderboardCache.keys()) {
      if (key.startsWith(`${guildId}:`)) {
        guildLeaderboardCache.delete(key);
      }
    }
  } else {
    guildLeaderboardCache.clear();
  }
}

/**
 * ดึง leaderboard ของแต่ละ Guild จาก Akari DB
 */
async function getTenantLeaderboard(supabase, guildId, limit = 10, force = false, sortBy = 'points') {
  const cacheKey = `${guildId}:${sortBy}`;
  const now = Date.now();
  if (!force && guildLeaderboardCache.has(cacheKey)) {
    const cached = guildLeaderboardCache.get(cacheKey);
    if (cached) {
      if (Array.isArray(cached)) return cached;
      if (cached.expiresAt && now < cached.expiresAt) return cached.data;
    }
  }

  if (!supabase) {
    guildLeaderboardCache.set(cacheKey, { data: [], expiresAt: now + 30000 });
    return [];
  }

  try {
    if (force) {
      await flushAllTenantPoints(supabase, guildId).catch(() => {});
    }
    const orderColumn = sortBy === 'wins' ? 'wins' : 'points';
    const secondaryColumn = sortBy === 'wins' ? 'points' : 'wins';

    const { data, error } = await supabase
      .from('tenant_minigame_scores')
      .select('user_id, points, wins')
      .eq('guild_id', guildId)
      .order(orderColumn, { ascending: false })
      .order(secondaryColumn, { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[akari-minigames] Leaderboard fetch error:', error.message);
      return [];
    }
    const result = data || [];
    guildLeaderboardCache.set(cacheKey, { data: result, expiresAt: now + 30000 });
    return result;
  } catch (e) {
    console.error('[akari-minigames] DB Leaderboard error:', e.message);
    return [];
  }
}

/**
 * ดึงอันดับและข้อมูลคะแนนของผู้ใช้ใน Guild
 */
async function getUserTenantRank(supabase, guildId, userId) {
  if (!supabase || !guildId || !userId) {
    return { rank: "-", totalPlayers: 0, points: 0, wins: 0 };
  }

  try {
    const { data: userData, error: userError } = await supabase
      .from('tenant_minigame_scores')
      .select('points, wins')
      .eq('guild_id', guildId)
      .eq('user_id', userId)
      .maybeSingle();

    const { count: totalPlayers } = await supabase
      .from('tenant_minigame_scores')
      .select('*', { count: 'exact', head: true })
      .eq('guild_id', guildId);

    if (userError || !userData) {
      return { rank: "-", totalPlayers: totalPlayers || 0, points: 0, wins: 0 };
    }

    const points = Number(userData.points) || 0;
    const wins = Number(userData.wins) || 0;

    const { count: higherCount } = await supabase
      .from('tenant_minigame_scores')
      .select('*', { count: 'exact', head: true })
      .eq('guild_id', guildId)
      .gt('points', points);

    const rank = (higherCount || 0) + 1;

    return {
      rank,
      totalPlayers: totalPlayers || 1,
      points,
      wins,
    };
  } catch (err) {
    console.error('[akari-minigames] getUserTenantRank error:', err.message);
    return { rank: "-", totalPlayers: 0, points: 0, wins: 0 };
  }
}

/**
 * เก็บคะแนนลง buffer ใน memory เพื่อประหยัด Supabase Egress
 * (เฉพาะเซิร์ฟเวอร์ที่เป็น Premium เท่านั้น)
 */
function bufferTenantPoints(guildId, userId, pointsToAdd = 10, winsToAdd = 1) {
  if (!guildId || !userId) return;
  const key = `${guildId}:${userId}`;
  const existing = guildScoreBuffer.get(key) || { points_accumulated: 0, wins_accumulated: 0 };
  existing.points_accumulated += pointsToAdd;
  existing.wins_accumulated += winsToAdd;
  guildScoreBuffer.set(key, existing);
}

/**
 * Flush คะแนนที่สะสมใน memory ลง Akari DB
 * (รองรับทุกเซิร์ฟเวอร์ทั้งแผน Standard และ Premium)
 */
async function flushTenantPoints(supabase, guildId, userId, pointsToAdd = 0, winsToAdd = 0) {
  if (!supabase || !guildId || !userId) return;

  const bufferKey = `${guildId}:${userId}`;
  const buffered = guildScoreBuffer.get(bufferKey) || { points_accumulated: 0, wins_accumulated: 0 };
  const totalPoints = pointsToAdd + buffered.points_accumulated;
  const totalWins = winsToAdd + buffered.wins_accumulated;

  if (totalPoints === 0 && totalWins === 0) {
    guildScoreBuffer.delete(bufferKey);
    return;
  }

  // Snapshot ปริมาณแต้มและจำนวนชนะใน Buffer ก่อนส่ง RPC เพื่อป้องกัน Race Condition ลบแต้มใหม่ทิ้ง
  const flushedPoints = buffered.points_accumulated;
  const flushedWins = buffered.wins_accumulated;

  try {
    // 1. ลองใช้ Atomic RPC เพื่อประหยัด Supabase Egress และป้องกัน Race Conditions
    const { error: rpcError } = await supabase.rpc('increment_tenant_score', {
      p_guild_id: String(guildId),
      p_user_id: String(userId),
      p_points: Number(totalPoints),
      p_wins: Number(totalWins),
    });

    if (!rpcError) {
      const current = guildScoreBuffer.get(bufferKey);
      if (current) {
        current.points_accumulated -= flushedPoints;
        current.wins_accumulated -= flushedWins;
        if (current.points_accumulated <= 0 && current.wins_accumulated <= 0) {
          guildScoreBuffer.delete(bufferKey);
        } else {
          guildScoreBuffer.set(bufferKey, current);
        }
      } else {
        guildScoreBuffer.delete(bufferKey);
      }
      invalidateLeaderboardCache(guildId);
      return;
    }

    // 2. Fallback สู่ 2-step SELECT + UPSERT กรณี RPC เกิดข้อผิดพลาด
    const { data } = await supabase
      .from('tenant_minigame_scores')
      .select('points, wins')
      .eq('guild_id', guildId)
      .eq('user_id', userId)
      .maybeSingle();

    const currentPoints = data?.points || 0;
    const currentWins = data?.wins || 0;

    await supabase.from('tenant_minigame_scores').upsert(
      {
        guild_id: guildId,
        user_id: userId,
        points: Math.max(0, currentPoints + totalPoints),
        wins: Math.max(0, currentWins + totalWins),
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'guild_id,user_id' }
    );

    const current = guildScoreBuffer.get(bufferKey);
    if (current) {
      current.points_accumulated -= flushedPoints;
      current.wins_accumulated -= flushedWins;
      if (current.points_accumulated <= 0 && current.wins_accumulated <= 0) {
        guildScoreBuffer.delete(bufferKey);
      } else {
        guildScoreBuffer.set(bufferKey, current);
      }
    } else {
      guildScoreBuffer.delete(bufferKey);
    }
    invalidateLeaderboardCache(guildId);
  } catch (e) {
    console.error('[akari-minigames] Score upsert error:', e.message);
  }
}

/**
 * Flush คะแนนทั้งหมดของ Guild หรือทุก Guild (ตอน Shutdown)
 */
async function flushAllTenantPoints(supabase, guildId = null) {
  if (!supabase) return;
  const entries = guildId
    ? [...guildScoreBuffer.entries()].filter(([key]) => key.startsWith(`${guildId}:`))
    : [...guildScoreBuffer.entries()];

  for (const [key, value] of entries) {
    const [gid, uid] = key.split(':');
    await flushTenantPoints(supabase, gid, uid, value.points_accumulated, value.wins_accumulated);
  }
}

// ─── TTS Audio Buffer Helper ──────────────────────────────────────────

async function getTTSAudioBuffer(word, lang = 'th') {
  const cacheKey = `${lang}:${String(word).trim()}`;
  if (ttsAudioCache.has(cacheKey)) return ttsAudioCache.get(cacheKey);

  try {
    const base64Audio = await googleTTS.getAudioBase64(String(word).trim(), {
      lang,
      slow: false,
      host: 'https://translate.google.com',
      timeout: 10000,
    });
    const buffer = Buffer.from(base64Audio, 'base64');
    ttsAudioCache.set(cacheKey, buffer);
    return buffer;
  } catch (err) {
    console.warn(`[akari-minigames] TTS Error for "${cacheKey}", retrying once...`, err.message);
    try {
      const retry = await googleTTS.getAudioBase64(String(word).trim(), {
        lang,
        slow: false,
        host: 'https://translate.google.com',
        timeout: 10000,
      });
      const buffer = Buffer.from(retry, 'base64');
      ttsAudioCache.set(cacheKey, buffer);
      return buffer;
    } catch (_) {
      return null;
    }
  }
}

// ─── Component V2 Generator (สไตล์ตรงตามบอทหลัก 100%) ────────────────

/**
 * สร้าง Component V2 Payload สำหรับโจทย์มินิเกม ถอดแบบจาก src/features/minigames/minigames.js
 */
function buildAkariGamePayload(gameId, questionData, rewardPoints = 10, isPremium = true) {
  const accessoryButton = {
    type: 2,
    style: 5,
    label: '︲เชิญบอทฟรี',
    emoji: GIFT_EMOJI,
    url: 'https://discord.com/oauth2/authorize?client_id=1538896195253178409',
  };

  let contentText = '';
  let mediaItem = null;

  switch (gameId) {
    case 1: { // เติมคำศัพท์ไทย
      const categoryLabel = questionData.category || 'คำทั่วไป';
      contentText = `### ${BEE_EMOJI_STR}︲__\` 𝖦𝖺𝗆𝖾 ₊ เกมเติมคำศัพท์ (ไทย) 𓂃 \`__\n` +
        `# \`${questionData.wordOrQuestion}\`\n` +
        `-# - หมวดหมู่: ${categoryLabel}`;
      break;
    }
    case 2: { // เติมคำศัพท์อังกฤษ
      const categoryLabel = questionData.category || 'คำทั่วไป';
      contentText = `### ${BEE_EMOJI_STR}︲__\` 𝖦𝖺𝗆𝖾 ₊ เกมเติมคำศัพท์ (อังกฤษ) 𓂃 \`__\n` +
        `# \`${questionData.wordOrQuestion}\`\n` +
        `-# - หมวดหมู่: ${categoryLabel}`;
      break;
    }
    case 3: { // สุ่มโจทย์คณิตฯ
      const rawDiff = String(questionData.difficulty || '').toLowerCase();
      const diffLabel = (rawDiff === 'easy' || rawDiff === 'ง่าย') ? 'ง่าย' : (rawDiff === 'medium' || rawDiff === 'ปานกลาง') ? 'ปานกลาง' : 'ยาก';
      contentText = `### ${BEE_EMOJI_STR}︲__\` 𝖦𝖺𝗆𝖾 ₊ สุ่มโจทย์คณิตฯ 𓂃 \`__\n\n` +
        `# \`${questionData.wordOrQuestion}\`\n` +
        `-# - ระดับ: ${diffLabel}`;
      break;
    }
    case 4: { // ทายคำจากคำใบ้
      const rawDiff = String(questionData.difficulty || '').toLowerCase();
      const diffLabel = (rawDiff === 'easy' || rawDiff === 'ง่าย') ? 'ง่าย' : (rawDiff === 'medium' || rawDiff === 'ปานกลาง') ? 'ปานกลาง' : 'ยาก';
      const hintsText = Array.isArray(questionData.hints) && questionData.hints.length > 0
        ? questionData.hints.map(h => `# ${h}`).join('\n')
        : '# ไม่มีคำใบ้';

      contentText = `### ${BEE_EMOJI_STR}︲__\` 𝖦𝖺𝗆𝖾 ₊ ทายคำจากคำใบ้ 𓂃 \`__\n` +
        `${hintsText}\n` +
        `-# - ระดับ: ${diffLabel}`;
      break;
    }
    case 5: { // ฟังเสียงแล้วพิมพ์ตอบ (อังกฤษ)
      contentText = `### ${BEE_EMOJI_STR}︲__\` 𝖦𝖺𝗆𝖾 ₊ ฟังเสียงแล้วพิมพ์ตอบ (อังกฤษ) 𓂃 \`__\n` +
        `# 🔊 จงฟังไฟล์เสียงในข้อความด้านบน แล้วพิมพ์คำตอบภาษาอังกฤษให้ถูกต้อง`;
      mediaItem = null;
      break;
    }
    case 6: { // พิมพ์คำต่อไปนี้ (ไทย)
      contentText = `### ${BEE_EMOJI_STR}︲__\` 𝖦𝖺𝗆𝖾 ₊ พิมพ์คำต่อไปนี้ (ไทย) 𓂃 \`__`;
      mediaItem = { media: { url: 'attachment://text_image.png' } };
      break;
    }
    case 7: { // พิมพ์คำต่อไปนี้ (อังกฤษ)
      contentText = `### ${BEE_EMOJI_STR}︲__\` 𝖦𝖺𝗆𝖾 ₊ พิมพ์คำต่อไปนี้ (อังกฤษ) 𓂃 \`__`;
      mediaItem = { media: { url: 'attachment://text_image.png' } };
      break;
    }
    case 8: { // ทายคำแปลภาษาอังกฤษ
      contentText = `### ${BEE_EMOJI_STR}︲__\` 𝖦𝖺𝗆𝖾 ₊ ทายคำแปลภาษาอังกฤษ 𓂃 \`__\n` +
        `# ${questionData.wordOrQuestion}`;
      break;
    }
    case 9: { // ทายคำแปลภาษาไทย
      contentText = `### ${BEE_EMOJI_STR}︲__\` 𝖦𝖺𝗆𝖾 ₊ ทายคำแปลภาษาไทย 𓂃 \`__\n` +
        `# ${questionData.wordOrQuestion}`;
      break;
    }
    case 10: { // เกมต่อคำ
      contentText = `### ${BEE_EMOJI_STR}︲__\` 𝖦𝖺𝗆𝖾 ₊ เกมต่อคำ 𓂃 \`__\n` +
        `# ${questionData.wordOrQuestion}`;
      break;
    }
    case 11: { // ฟังเสียงแล้วพิมพ์ตอบ (ไทย)
      contentText = `### ${BEE_EMOJI_STR}︲__\` 𝖦𝖺𝗆𝖾 ₊ ฟังเสียงแล้วพิมพ์ตอบ (ไทย) 𓂃 \`__\n` +
        `# 🔊 จงฟังไฟล์เสียงในข้อความด้านบน แล้วพิมพ์คำตอบภาษาไทยให้ถูกต้อง`;
      mediaItem = null;
      break;
    }
    case 12: { // จริงหรือเท็จ
      contentText = `### ${BEE_EMOJI_STR}︲__\` 𝖦𝖺𝗆𝖾 ₊ จริงหรือเท็จ 𓂃 \`__\n` +
        `# ${questionData.wordOrQuestion}`;
      break;
    }
    case 13: { // เรียงประโยคภาษาอังกฤษ (Sentence Builder)
      contentText = `### ${BEE_EMOJI_STR}︲__\` 𝖦𝖺𝗆𝖾 ₊ เรียงประโยคภาษาอังกฤษ 𓂃 \`__\n` +
        `- กดปุ่มคำศัพท์ด้านล่างตามลำดับให้ครบประโยค ใครต่อเสร็จคนแรกชนะ!`;
      mediaItem = { media: { url: 'attachment://sentence_card.png' } };
      break;
    }
    case 15: { // ทายธงประเทศ
      contentText = `### ${BEE_EMOJI_STR}︲__\` 𝖦𝖺𝗆𝖾 ₊ ธงในรูปนี้คือประเทศอะไร? 𓂃 \`__\n` +
        `- เลือกทายชื่อประเทศจากภาพธงด้านบน ใครตอบถูกคนแรกชนะ!<:cuteplant:1152834055528783872>`;
      const flagUrl = questionData.imageUrl || questionData.flagUrl;
      mediaItem = flagUrl ? { media: { url: flagUrl } } : null;
      break;
    }
    case 16: { // นับจำนวนอีโมจิ
      contentText = `### ${BEE_EMOJI_STR}︲__\` 𝖦𝖺𝗆𝖾 ₊ ในกระดานนี้มีอีโมจิที่กำหนดกี่ชิ้น? 𓂃 \`__\n` +
        `- ดูตารางอีโมจิด้านล่าง แล้วนับจำนวนของอีโมจิเป้าหมาย ใครตอบถูกคนแรกชนะ!<:cuteplant:1152834055528783872>`;
      mediaItem = null;
      break;
    }
  }

  const containerComponents = [];

  // Media Component (สำหรับเกม 6, 7 & 13)
  if (mediaItem) {
    if (mediaItem.type === 13) {
      containerComponents.push(mediaItem);
    } else {
      containerComponents.push({ type: 12, items: [mediaItem] });
    }
    containerComponents.push({ type: 14, spacing: 1, divider: false });
    containerComponents.push({
      type: 9,
      components: [{ type: 10, content: contentText }],
      accessory: accessoryButton,
    });
  } else {
    containerComponents.push({
      type: 9,
      components: [{ type: 10, content: contentText }],
      accessory: accessoryButton,
    });
  }

  if (gameId === 16 && questionData.wordOrQuestion) {
    containerComponents.push({ type: 14, spacing: 1, divider: false });
    containerComponents.push({
      type: 10,
      content: questionData.wordOrQuestion,
    });
  }

  const leaderboardButton = {
    style: 1,
    type: 2,
    label: '🏆 ตารางคะแนน',
    custom_id: `akari_mg_top:${gameId}`,
  };

  // Choice Buttons (สำหรับเกม 8, 9, 10, 12, 13, 15, 16)
  if ([8, 9, 10, 12, 13, 15, 16].includes(gameId) && Array.isArray(questionData.options) && questionData.options.length > 0) {
    if (gameId === 15 || gameId === 16) {
      containerComponents.push({ type: 14, spacing: 2, divider: true });
      const choiceStyles = [1, 4, 3];
      const buttonComponents = questionData.options.map((optionLabel, idx) => ({
        style: choiceStyles[idx % choiceStyles.length],
        type: 2,
        label: String(optionLabel || ' ').slice(0, 80),
        custom_id: `kuma_mg_opt_${gameId}_${idx}_${Date.now()}`,
      }));
      buttonComponents.push({
        style: 2,
        type: 2,
        label: '🏆 ตารางคะแนน',
        custom_id: `akari_mg_top:${gameId}`,
      });
      for (let i = 0; i < buttonComponents.length; i += 5) {
        containerComponents.push({
          type: 1,
          components: buttonComponents.slice(i, i + 5),
        });
      }
    } else {
      containerComponents.push({ type: 14, spacing: 2 });
      let buttonComponents = [];

      if (gameId === 12) {
        // จริง (เขียว: Style 3) และ เท็จ (แดง: Style 4)
        buttonComponents = questionData.options.map((optionLabel, idx) => {
          const isTrueBtn = String(optionLabel).trim() === 'จริง';
          return {
            style: isTrueBtn ? 3 : 4,
            type: 2,
            label: String(optionLabel || ' ').slice(0, 80),
            custom_id: `akari_mg_opt_${gameId}_${idx}_${Date.now()}`,
          };
        });
        buttonComponents.push(leaderboardButton);
        for (let i = 0; i < buttonComponents.length; i += 5) {
          containerComponents.push({
            type: 1,
            components: buttonComponents.slice(i, i + 5),
          });
        }
      } else if (gameId === 13) {
        // เกม 13: เรียงประโยค -> ปุ่มคำศัพท์สลับสีให้อ่านง่าย
        const choiceStyles = [2, 1, 2, 1, 2, 1];
        const allButtons = questionData.options.map((optionLabel, idx) => ({
          style: choiceStyles[idx % choiceStyles.length],
          type: 2,
          label: String(optionLabel || ' ').slice(0, 80),
          custom_id: `akari_mg_sb_${gameId}_${idx}_${Date.now()}`,
        }));
        // แยกแถวละสูงสุด 5 ปุ่ม
        for (let i = 0; i < allButtons.length; i += 5) {
          containerComponents.push({
            type: 1,
            components: allButtons.slice(i, i + 5),
          });
        }
        containerComponents.push({
          type: 1,
          components: [leaderboardButton],
        });
      } else {
        const choiceStyles = [1, 4, 3, 2];
        buttonComponents = questionData.options.map((optionLabel, idx) => ({
          style: choiceStyles[idx % choiceStyles.length],
          type: 2,
          label: String(optionLabel || ' ').slice(0, 80),
          custom_id: `akari_mg_opt_${gameId}_${idx}_${Date.now()}`,
        }));
        buttonComponents.push(leaderboardButton);
        for (let i = 0; i < buttonComponents.length; i += 5) {
          containerComponents.push({
            type: 1,
            components: buttonComponents.slice(i, i + 5),
          });
        }
      }
    }
  } else {
    // เกมแบบพิมพ์ตอบ: แสดงปุ่มตารางคะแนนสำหรับทุกระดับสมาชิก
    containerComponents.push({ type: 14, spacing: 2 });
    containerComponents.push({
      type: 1,
      components: [leaderboardButton],
    });
  }

  // ปิดท้าย Container อย่างสะอาด ไร้ Trailing Separator
  return {
    flags: FLAG_V2,
    components: [{
      type: 17,
      components: containerComponents,
    }],
  };
}

/**
 * สร้าง Component V2 Payload เมื่อมีผู้ชนะ ถอดแบบจากบอทหลัก 100%
 */
function buildAkariWinnerPayload(gameId, questionData, winnerDisplayName, rewardPoints = 10, isPremium = true) {
  const accessoryButton = {
    type: 2,
    style: 5,
    label: '︲เชิญบอทฟรี',
    emoji: GIFT_EMOJI,
    url: 'https://discord.com/oauth2/authorize?client_id=1538896195253178409',
  };

  const titleMap = {
    1: 'เกมเติมคำศัพท์ (ไทย)',
    2: 'เกมเติมคำศัพท์ (อังกฤษ)',
    3: 'สุ่มโจทย์คณิตฯ',
    4: 'ทายคำจากคำใบ้',
    5: 'ฟังเสียงแล้วพิมพ์ตอบ (อังกฤษ)',
    6: 'พิมพ์คำต่อไปนี้ (ไทย)',
    7: 'พิมพ์คำต่อไปนี้ (อังกฤษ)',
    8: 'ทายคำแปลภาษาอังกฤษ',
    9: 'ทายคำแปลภาษาไทย',
    10: 'เกมต่อคำ',
    11: 'ฟังเสียงแล้วพิมพ์ตอบ (ไทย)',
    12: 'จริงหรือเท็จ',
    13: 'เรียงประโยคภาษาอังกฤษ',
    15: 'ธงในรูปนี้คือประเทศอะไร?',
    16: 'ในกระดานนี้มีอีโมจิที่กำหนดกี่ชิ้น?',
  };
  const titleText = titleMap[gameId] || `มินิเกม #${gameId}`;

  let contentText = '';
  if (gameId === 10) {
    contentText = `### ${BEE_EMOJI_STR}︲__\` 𝖦𝖺𝗆𝖾 ₊ ${titleText} 𓂃 \`__\n` +
      `# ${questionData.wordOrQuestion || ''}${questionData.answer}`;
  } else if (gameId === 11 || gameId === 12) {
    contentText = `### ${BEE_EMOJI_STR}︲__\` 𝖦𝖺𝗆𝖾 ₊ ${titleText} 𓂃 \`__\n` +
      `# ${questionData.wordOrQuestion || ''}\n` +
      `-# เฉลย: ${questionData.answer}`;
  } else if (gameId === 13) {
    const template = questionData.englishTemplate || (Array.isArray(questionData.hints) ? questionData.hints[0] : '') || '';
    const correctWords = questionData.correctWords || String(questionData.answer || '').split(/[,|]/).map((s) => s.trim());
    let fullSentence = template;
    correctWords.forEach((word, idx) => {
      fullSentence = fullSentence.replace(new RegExp(`\\{${idx + 1}\\}`, 'g'), `**${word}**`);
    });
    contentText = `### ${BEE_EMOJI_STR}︲__\` 𝖦𝖺𝗆𝖾 ₊ ${titleText} 𓂃 \`__\n` +
      `# ${questionData.wordOrQuestion}\n` +
      `> 🔤 ${fullSentence}`;
  } else if (gameId === 15) {
    contentText = `### ${BEE_EMOJI_STR}︲__\` 𝖦𝖺𝗆𝖾 ₊ ธงในรูปนี้คือประเทศอะไร? 𓂃 \`__\n` +
      `# 🏳️ ธงนี้คือประเทศ: ${questionData.answer}\n` +
      `- เลือกทายชื่อประเทศจากภาพธงด้านบน ใครตอบถูกคนแรกชนะ!<:cuteplant:1152834055528783872>`;
  } else if (gameId === 16) {
    contentText = `### ${BEE_EMOJI_STR}︲__\` 𝖦𝖺𝗆𝖾 ₊ ในกระดานนี้มีอีโมจิที่กำหนดกี่ชิ้น? 𓂃 \`__\n` +
      `- ดูตารางอีโมจิด้านล่าง แล้วนับจำนวนของอีโมจิเป้าหมาย ใครตอบถูกคนแรกชนะ!<:cuteplant:1152834055528783872>`;
  } else {
    contentText = `### ${BEE_EMOJI_STR}︲__\` 𝖦𝖺𝗆𝖾 ₊ ${titleText} 𓂃 \`__\n` +
      `# ${questionData.wordOrQuestion || ''} = ${questionData.answer}`;
  }

  const winnerBtnLabel = `@${winnerDisplayName} ตอบถูก (+${rewardPoints} แต้ม)`.slice(0, 80);

  const winnerContainer = [];
  const flagUrl = questionData.imageUrl || questionData.flagUrl;
  if (gameId === 15 && flagUrl) {
    winnerContainer.push({
      type: 12,
      items: [{ media: { url: flagUrl } }],
    });
    winnerContainer.push({ type: 14, spacing: 1, divider: false });
  }

  winnerContainer.push({
    type: 9,
    components: [{ type: 10, content: contentText }],
    accessory: accessoryButton,
  });

  if (gameId === 16 && questionData.wordOrQuestion) {
    const winnerWordOrQuestion = questionData.wordOrQuestion.includes('=')
      ? questionData.wordOrQuestion
      : questionData.wordOrQuestion.replace(
        /(> \*\*เป้าหมายที่ต้องนับ:\*\* [^\n]+)/,
        `$1 = ${questionData.answer}`
      );
    winnerContainer.push({ type: 14, spacing: 1, divider: false });
    winnerContainer.push({
      type: 10,
      content: winnerWordOrQuestion,
    });
  }

  const winnerButtons = [
    {
      style: 3,
      type: 2,
      label: winnerBtnLabel,
      custom_id: `akari_mg_winner_disabled_${Date.now()}`,
      disabled: true,
    },
    {
      style: 2,
      type: 2,
      label: '🏆 ตารางคะแนน',
      custom_id: `akari_mg_top:${gameId}`,
      disabled: true,
    }
  ];

  winnerContainer.push({ type: 14, spacing: 2, divider: [15, 16].includes(gameId) });
  winnerContainer.push({
    type: 1,
    components: winnerButtons,
  });

  return {
    flags: FLAG_V2,
    components: [{
      type: 17,
      components: winnerContainer,
    }],
  };
}

// ─── สปอว์นคำถาม (Spawn Question) ───────────────────────────────────

async function spawnQuestion(client, channel, gameId, guildId, supabase) {
  // ตรวจสอบสิทธิ์การใช้งานตามระดับสมาชิก (Freemium & Quota Guard)
  const access = await validateGameAccess(guildId, gameId, supabase);
  if (!access.allowed) {
    console.log(
      `[akari-minigames] 🔒 ข้ามการสปอว์นโจทย์เกม #${gameId} บน Guild ${guildId} (${access.reason})`
    );
    try {
      await channel.send({
        flags: FLAG_V2,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content:
                  "## <:lowwarning:1548772721679278180>︲__` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀  ₊ พักการส่งโจทย์ชั่วคราว 𓂃 `__\n" +
                  "# เซิร์ฟเวอร์นี้ใช้งานเกินโควตาฟรี หรือเกมนี้สำหรับ Premium เท่านั้น\n" +
                  `> 📦⠀**แผนปัจจุบัน:** Standard (ฟรี - สูงสุด ${FREE_QUOTA_LIMIT} เกมทั่วไป)\n` +
                  "> 💡⠀**วิธีดำเนินการ:** แอดมินสามารถใช้ `/setting-games` เพื่อปรับเปลี่ยนเกม หรือติดต่อผู้พัฒนาเพื่ออัปเกรด Premium ครับ\n\n" +
                  "-# <<< ข้อมูลคะแนนและประวัติห้องยังคงปลอดภัยครบถ้วนครับ >>>",
              },
              {
                type: 14,
                spacing: 2,
              },
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 5,
                    label: "︲ติดต่อผู้พัฒนา",
                    emoji: {
                      id: "1212856675053346897",
                      name: "bearcafe_star",
                      animated: false,
                    },
                    url: "https://discord.gg/EHHybsbHxD",
                  },
                ],
              },
            ],
          },
        ],
      });
    } catch (_) {}
    return null;
  }

  const settingsMap = await getTenantSettings(supabase, guildId);
  const gameSettings = settingsMap[gameId];
  if (!gameSettings || gameSettings.enabled === false) {
    console.log(
      `[akari-minigames] ⏭️ ข้ามการสปอว์นโจทย์เกม #${gameId} บน Guild ${guildId} (สถานะ: ปิดใช้งาน)`
    );
    return null;
  }

  const sessionKey = `${guildId}:${channel.id}`;
  // ส่งคำขอโจทย์ไปยัง minigame_questions บน Main Supabase
  const questionObj = await getNextQuestion(supabase, gameId, gameSettings, { tableName: 'minigame_questions' });
  if (!questionObj) return null;

  const rawAnswer = String(questionObj.answer).trim();
  let wordOrQuestion = String(questionObj.word_or_question || questionObj.wordOrQuestion || '').trim();
  let ttsBuffer = null;

  if (gameId === 1 || gameId === 2) {
    if (gameId === 1 && questionObj.pre_validated_mask) {
      wordOrQuestion = questionObj.pre_validated_mask;
    } else {
      const maskedObj = maskWord(rawAnswer, gameId === 1);
      wordOrQuestion = typeof maskedObj === 'object' ? maskedObj.maskedStr : String(maskedObj);
    }
  } else if (gameId === 5) {
    ttsBuffer = await getTTSAudioBuffer(rawAnswer, 'en');
  } else if (gameId === 11) {
    ttsBuffer = await getTTSAudioBuffer(rawAnswer, 'th');
  }

  // ป้องกันกรณี Google TTS ล้มเหลวสำหรับเกมฟังเสียง (เกม 5 และ 11)
  // หากไม่มีไฟล์เสียง จะไม่ส่งการ์ดโจทย์ที่ไร้เสียง แต่จะหน่วงเวลา 5 วินาทีแล้วลองสปอว์นข้อใหม่
  if ((gameId === 5 || gameId === 11) && !ttsBuffer) {
    console.warn(`[akari-minigames] ⚠️ TTS buffer generation failed for Game ${gameId} ("${rawAnswer}"). Rescheduling spawn in 5s...`);
    setTimeout(() => {
      spawnQuestion(client, channel, gameId, guildId, supabase).catch(() => {});
    }, 5000);
    return null;
  }

  const isPremium = access.plan === 'premium';
  // ค่าเริ่มต้นแต้มมินิเกมของทุกเซิร์ฟเป็น 10 ยกเว้นเซิร์ฟพรีเมียมให้ปรับแต่งได้ (ถ้ายังไม่ตั้งก็ให้ใช้ 10 เช่นกัน)
  let pointsPerWin = 10;
  if (isPremium) {
    if (typeof gameSettings.points_per_win === 'number' && gameSettings.points_per_win > 0) {
      pointsPerWin = gameSettings.points_per_win;
    }
  } else {
    pointsPerWin = 10;
  }

  const questionData = {
    wordOrQuestion,
    answer: rawAnswer,
    category: questionObj.category,
    difficulty: questionObj.difficulty,
    hints: questionObj.hints,
    options: questionObj.options,
    englishTemplate: questionObj.englishTemplate,
    correctWords: questionObj.correctWords,
    imageUrl: questionObj.imageUrl || questionObj.flagUrl,
    flagUrl: questionObj.flagUrl || questionObj.imageUrl,
    countryCode: questionObj.countryCode,
    rewardPoints: pointsPerWin,
  };

  const payload = buildAkariGamePayload(gameId, questionData, pointsPerWin, isPremium);

  const attachments = [];
  if (gameId === 6 || gameId === 7) {
    try {
      const buffer = createTextImageBuffer(wordOrQuestion);
      attachments.push(new AttachmentBuilder(buffer, { name: 'text_image.png' }));
    } catch (imgErr) {
      console.error(`[akari-minigames] Text image buffer create error:`, imgErr.message);
    }
  } else if (gameId === 13) {
    try {
      const template = questionData.englishTemplate || (Array.isArray(questionData.hints) ? questionData.hints[0] : questionData.hints) || '';
      const buffer = createSentenceBuilderImageBuffer(wordOrQuestion, template);
      attachments.push(new AttachmentBuilder(buffer, { name: 'sentence_card.png' }));
    } catch (imgErr) {
      console.error(`[akari-minigames] Sentence builder image buffer error:`, imgErr.message);
    }
  }

  let sentAudioMsg = null;
  if (ttsBuffer) {
    try {
      const audioFile = new AttachmentBuilder(ttsBuffer, { name: 'audio.mp3' });
      sentAudioMsg = await channel.send({ files: [audioFile] });
      questionData.audioMessageId = sentAudioMsg.id;
    } catch (audioErr) {
      console.error(`[akari-minigames] TTS audio send error for Game ${gameId}:`, audioErr.message);
    }
  }

  let sentMsg = null;
  try {
    if (!channel || channel.deleted) {
      activeTenantSessions.delete(sessionKey);
      if (supabase) {
        try {
          await supabase.from("tenant_minigame_channels").delete().eq("channel_id", channel?.id || "");
        } catch (_) {}
      }
      return null;
    }
    sentMsg = await channel.send({ ...payload, files: attachments });
  } catch (sendErr) {
    if (sentAudioMsg) {
      sentAudioMsg.delete().catch(() => {});
    }
    if (sendErr.code === 10003 || sendErr.code === 50001 || sendErr.message?.includes("Unknown Channel")) {
      console.log(`[akari-minigames] 🧹 ตรวจพบช่องมินิเกม #${gameId} ถูกลบใน Discord (${channel?.id}) — ล้างข้อมูลออกจากระบบให้อัตโนมัติ`);
      activeTenantSessions.delete(sessionKey);
      if (supabase) {
        try {
          await supabase.from("tenant_minigame_channels").delete().eq("channel_id", channel.id);
        } catch (_) {}
      }
    } else {
      console.error(`[akari-minigames] Send game payload error for Game ${gameId}:`, sendErr.message);
    }
    return null;
  }

  const session = {
    guildId,
    gameId,
    questionObj,
    questionData,
    answer: rawAnswer.toLowerCase(),
    displayAnswer: rawAnswer,
    hintStep: 0,
    messageId: sentMsg.id,
    channelId: channel.id,
    isPremium,
    createdAt: Date.now(),
  };

  activeTenantSessions.set(sessionKey, session);

  if (supabase) {
    try {
      await supabase.from('tenant_minigame_active_sessions').upsert(
        {
          guild_id: guildId,
          channel_id: channel.id,
          game_id: gameId,
          session_data: session,
          created_at: new Date().toISOString(),
        },
        { onConflict: 'guild_id,channel_id' }
      );
    } catch (_) {}
  }

  return session;
}

/**
 * ฟื้นฟูเซสชันเดิมตอนบอทรีสตาร์ต (Smart Restoration)
 */
async function restoreTenantChannelsOnStartup(client, supabase) {
  if (!supabase || !client) return;

  try {
    const { data: channels } = await supabase
      .from('tenant_minigame_channels')
      .select('guild_id, game_id, channel_id, created_at')
      .order('created_at', { ascending: true });

    if (Array.isArray(channels) && channels.length > 0) {
      const cacheExpiry = Date.now() + CHANNELS_CACHE_TTL_MS;
      const byGuild = new Map();
      for (const ch of channels) {
        if (!byGuild.has(ch.guild_id)) byGuild.set(ch.guild_id, []);
        byGuild.get(ch.guild_id).push({ game_id: ch.game_id, created_at: ch.created_at });
      }
      for (const [gId, list] of byGuild.entries()) {
        guildChannelsCache.set(gId, { data: list, expiresAt: cacheExpiry });
      }
    }

    const validChannelKeys = new Set(
      Array.isArray(channels) ? channels.map(c => `${c.guild_id}:${c.channel_id}`) : []
    );

    const { data: dbSessions } = await supabase
      .from('tenant_minigame_active_sessions')
      .select('guild_id, channel_id, game_id, session_data');

    const orphanChannelIds = [];

    if (Array.isArray(dbSessions) && dbSessions.length > 0) {
      for (const row of dbSessions) {
        if (row && row.guild_id && row.channel_id && row.session_data) {
          const sessionKey = `${row.guild_id}:${row.channel_id}`;
          if (validChannelKeys.has(sessionKey)) {
            let sessionData = row.session_data;
            if (typeof sessionData === 'string') {
              try { sessionData = JSON.parse(sessionData); } catch (_) { sessionData = null; }
            }
            const hasAnswer = sessionData && String(sessionData?.answer || sessionData?.displayAnswer || '').trim() !== '';
            if (hasAnswer) {
              const planInfo = await getTenantPlan(row.guild_id, supabase);
              sessionData.isPremium = planInfo.isPremium;
              activeTenantSessions.set(sessionKey, sessionData);
            }
          } else {
            orphanChannelIds.push(row.channel_id);
          }
        }
      }
      console.log(`[kuma-minigames] ⚡ โหลด ${activeTenantSessions.size} เซสชันเกมที่ถูกต้องจาก DB เข้าสู่ RAM`);
    }

    if (orphanChannelIds.length > 0) {
      console.log(`[kuma-minigames] 🧹 [Startup] ตรวจพบเซสชันค้างเก่าที่ไม่มีการผูกห้อง ${orphanChannelIds.length} รายการ — กำลังลบออกจาก DB...`);
      try {
        const { error: delErr } = await supabase
          .from('tenant_minigame_active_sessions')
          .delete()
          .in('channel_id', orphanChannelIds);
        if (delErr) {
          console.error('[kuma-minigames] Error cleaning up orphan sessions:', delErr.message);
        }
      } catch (delErr) {
        console.error('[kuma-minigames] Error cleaning up orphan sessions:', delErr.message);
      }
    }

    if (Array.isArray(channels) && channels.length > 0) {
      let newlySpawned = 0;
      const missingChannelIds = [];
      const affectedGuildIds = new Set();

      for (const row of channels) {
        const { guild_id, game_id, channel_id } = row;
        const sessionKey = `${guild_id}:${channel_id}`;

        if (activeTenantSessions.has(sessionKey)) continue;

        try {
          const channel = await client.channels.fetch(channel_id).catch(() => null);
          if (!channel) {
            missingChannelIds.push(channel_id);
            affectedGuildIds.add(guild_id);
            continue;
          }

          // Smart Guard: ตรวจสอบข้อความล่าสุดในห้องก่อน spawn ซ้ำ
          if (channel.isTextBased && channel.isTextBased()) {
            const recentMsgs = await channel.messages.fetch({ limit: 5 }).catch(() => null);
            if (recentMsgs && recentMsgs.size > 0) {
              const lastBotMsg = recentMsgs.find(m => m.author.id === client.user.id);
              if (lastBotMsg) {
                const isWinnerMsg =
                  lastBotMsg.content?.includes('เฉลย:') ||
                  lastBotMsg.components?.some(row =>
                    row.components?.some(c =>
                      c.customId?.includes('winner') ||
                      c.customId?.includes('done') ||
                      c.label?.includes('ตอบถูก')
                    )
                  );

                if (!isWinnerMsg) {
                  console.log(`[kuma-minigames] 🛡️ Smart Guard: พบโจทย์เดิมค้างอยู่ใน <#${channel_id}> (Msg: ${lastBotMsg.id}) ข้ามการส่งโจทย์ซ้ำ`);
                  continue;
                }
              }
            }
          }

          const session = await spawnQuestion(client, channel, game_id, guild_id, supabase);
          if (session) newlySpawned++;
        } catch (chErr) {
          console.error(`[kuma-minigames] Restore error for channel ${channel_id}:`, chErr.message);
        }
      }

      if (missingChannelIds.length > 0) {
        await Promise.all([
          supabase.from('tenant_minigame_channels').delete().in('channel_id', missingChannelIds),
          supabase.from('tenant_minigame_active_sessions').delete().in('channel_id', missingChannelIds),
        ]).catch(() => {});
        for (const gId of affectedGuildIds) {
          guildChannelsCache.delete(gId);
        }
      }

      if (newlySpawned > 0) {
        console.log(`[kuma-minigames] ✅ สปอว์นโจทย์ครั้งแรกสำหรับช่องใหม่สำเร็จ ${newlySpawned} ช่อง`);
      }
    }
  } catch (err) {
    console.error('[kuma-minigames] Startup restoration error:', err.message);
  }
}

// ─── Setup Event Listeners ─────────────────────────────────────────────

let scoreFlushTimer = null;

function setupAkariMinigames(client, supabase) {
  if (supabase && !scoreFlushTimer) {
    scoreFlushTimer = setInterval(() => {
      flushAllTenantPoints(supabase).catch((err) =>
        console.error('[akari-minigames] Periodic flushAllTenantPoints error:', err.message)
      );
    }, 20000);
    if (typeof scoreFlushTimer.unref === 'function') {
      scoreFlushTimer.unref();
    }
  }

  const onReady = async () => {
    await restoreTenantChannelsOnStartup(client, supabase);
  };

  if (client.isReady && typeof client.isReady === 'function' && client.isReady()) {
    onReady();
  } else {
    client.once('clientReady', onReady);
  }

  // ── Event listener: ดักฟังเมื่อมีการลบช่องใน Discord (Channel Delete Self-Healing) ──
  client.on('channelDelete', async (channel) => {
    if (!channel || !channel.guild) return;
    const guildId = channel.guild.id;
    const sessionKey = `${guildId}:${channel.id}`;

    if (activeTenantSessions.has(sessionKey)) {
      activeTenantSessions.delete(sessionKey);
      console.log(`[akari-minigames] 🧹 [channelDelete] ลบ RAM Session ของช่องมินิเกม (${channel.id}) เรียบร้อยแล้ว`);
    }

    if (supabase) {
      try {
        const { data } = await supabase
          .from('tenant_minigame_channels')
          .delete()
          .eq('guild_id', guildId)
          .eq('channel_id', channel.id)
          .select('game_id');

        if (data && data.length > 0) {
          for (const row of data) {
            await supabase
              .from('tenant_minigame_settings')
              .delete()
              .eq('guild_id', guildId)
              .eq('game_id', row.game_id);
          }
          invalidateSettingsCache(guildId);
          console.log(`[akari-minigames] 🧹 [channelDelete] ล้างข้อมูลช่องที่ถูกลบออกจาก Supabase DB เรียบร้อยแล้ว (Guild: ${guildId}, Channel: ${channel.id})`);
        }
      } catch (err) {
        console.error(`[akari-minigames] DB channelDelete cleanup error:`, err.message);
      }
    }
  });

  // ── Message handler: ตรวจคำตอบเกมพิมพ์ตอบ พร้อม Concurrency Guard ───
  client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;

    const guildId = message.guild.id;
    const sessionKey = `${guildId}:${message.channel.id}`;
    const session = activeTenantSessions.get(sessionKey);
    if (!session) return;

    // ข้ามเกมที่ตอบด้วยปุ่ม (เกม 8, 9, 10, 12, 13, 15, 16)
    if ([8, 9, 10, 12, 13, 15, 16].includes(session.gameId)) return;

    const userText = message.content.trim();
    if (!userText) return;

    const answerStr = String(session.answer || session.displayAnswer || '').trim();
    if (!answerStr) {
      console.warn(`[akari-minigames] ⚠️ Session for Game ${session.gameId} (${message.channel.id}) missing answer. Auto-healing with fresh question...`);
      spawnQuestion(client, message.channel, session.gameId, guildId, supabase).catch(() => {});
      return;
    }

    const isThaiGame = session.gameId === 1 || session.gameId === 4 || session.gameId === 6 || session.gameId === 11;
    const isCorrect = isThaiGame
      ? userText.trim() === String(session.displayAnswer || '').trim()
      : userText.trim().toLowerCase() === String(session.answer || '').trim().toLowerCase();

    const userId = message.author.id;

    // ── Global Wrong Cooldown Check ─────────────────────────────────
    const cooldownCheck = checkUserWrongCooldown(userId);
    if (cooldownCheck.inCooldown) {
      message.delete().catch(() => {});
      message.channel.send({
        content: `${message.author} ⏳ คุณกำลังติดคูลดาวน์จากการตอบผิด กรุณารออีก <t:${cooldownCheck.expireTs}:R> ก่อนพิมพ์ใหม่นะครับ`
      }).then((warnMsg) => {
        setTimeout(() => warnMsg.delete().catch(() => {}), 5000);
      }).catch(() => {});
      return;
    }

    // ── Cross-Channel Feasibility Guard ─────────────────────────────
    const feasibility = checkCrossChannelFeasibility(userId, message.channel.id, session.gameId);
    if (!feasibility.allowed) {
      message.delete().catch(() => {});
      if (feasibility.reason === 'CROSS_CHANNEL_TOO_FAST') {
        console.log(`[akari-minigames] 🛡️ Blocked concurrent attempt by User: ${message.author.tag || message.author.username} (${userId}) (from Game ${feasibility.fromGameId} to Game ${feasibility.toGameId} in ${feasibility.elapsed}ms, required >= ${feasibility.requiredMs}ms)`);
      }
      return;
    }

    recordUserAction(userId, message.channel.id, session.gameId);

    const planInfo = await getTenantPlan(guildId, supabase);
    const isPremium = planInfo.isPremium;

    if (!isCorrect) {
      // ❌ ตอบผิด: ลบข้อความผิดทิ้ง, หักแต้ม, ติดคูลดาวน์ และส่งข้อความเตือน Component V2
      message.delete().catch(() => {});

      let penaltyConfig = { cooldownMs: 10000, penaltyTemplate: '' };
      try {
        const { getTenantPenaltyConfig } = require('../commands/minigamesCommands');
        penaltyConfig = await getTenantPenaltyConfig(supabase, guildId);
      } catch (e) {
        console.warn('[akari-minigames] Error getting penalty config:', e.message);
      }

      const cooldownMs = penaltyConfig.cooldownMs || 10000;
      const endTs = Math.ceil((Date.now() + cooldownMs) / 1000);
      userWrongCooldowns.set(userId, Date.now() + cooldownMs);

      const penalty = isPremium ? (Math.floor(Math.random() * 11) + 5) : 10;
      bufferTenantPoints(guildId, userId, -penalty, 0);

      let currencyEmoji = '<:strawberryv2:1548976664090779650>';
      try {
        const { getTenantStoreConfig } = require('../store/storeEngine');
        const storeConfig = await getTenantStoreConfig(supabase, guildId);
        if (storeConfig?.currency_emoji) currencyEmoji = storeConfig.currency_emoji;
      } catch {}

      const penaltyPayload = buildKumaPenaltyPayload(
        userId,
        penalty,
        endTs,
        penaltyConfig.penaltyTemplate,
        currencyEmoji
      );

      message.channel.send(penaltyPayload).then((penaltyMsg) => {
        setTimeout(() => penaltyMsg.delete().catch(() => {}), 5000);
      }).catch(() => {});
      return;
    }

    if (isCorrect) {
      if (processingChannels.has(sessionKey)) return;
      processingChannels.add(sessionKey);
      userInFlightProcessing.add(userId);

      const safetyTimeout = setTimeout(() => {
        userInFlightProcessing.delete(userId);
        processingChannels.delete(sessionKey);
      }, 10000);

      try {
        // 1. แอด Reaction ด้วยอิโมจิ Custom ของ Bear Cafe (1358584609087946867) แบบเดียวกับบอทหลัก
        await message.react(CHECKMARK_EMOJI_ID).catch(() => {
          return message.react('✅').catch(() => {});
        });

        const pointsPerWin = session.questionData?.rewardPoints || 10;
        bufferTenantPoints(guildId, message.author.id, pointsPerWin, 1);

        // 2. สำหรับเกมฟังเสียง (เกม 5 และ 11): ลบการ์ด Component V2 ทิ้ง (เหลือข้อความไฟล์เสียง MP3 ไว้) แบบเดียวกับบอทหลัก
        if ((session.gameId === 5 || session.gameId === 11) && session.messageId) {
          message.channel.messages.delete(session.messageId).catch(() => {});
        }
        // 3. สำหรับเกมพิมพ์ตอบอื่นๆ (เช่น เกม 1, 2, 3, 4, 6, 7): ไม่ต้องแก้ไขการ์ดเดิม ปล่อยให้คงอยู่ตามปกติแบบเดียวกับบอทหลัก!

        activeTenantSessions.delete(sessionKey);
        if (supabase) {
          Promise.resolve(
            supabase
              .from('tenant_minigame_active_sessions')
              .delete()
              .eq('guild_id', guildId)
              .eq('channel_id', message.channel.id)
          ).catch(() => {});
        }

        await new Promise((r) => setTimeout(r, 700));
        await spawnQuestion(client, message.channel, session.gameId, guildId, supabase);
      } finally {
        clearTimeout(safetyTimeout);
        userInFlightProcessing.delete(userId);
        processingChannels.delete(sessionKey);
      }
    }
  });

  // ── Interaction handler: Choice Buttons, Hint, Skip, Leaderboard ──────
  client.on('interactionCreate', async (interaction) => {
    if ((!interaction.isButton() && !interaction.isStringSelectMenu()) || !interaction.guild) return;
    const { customId, guild, channel, user } = interaction;

    if (!customId.startsWith('akari_mg_') && !customId.startsWith('kuma_mg_') && !customId.startsWith('mg_opt_')) return;

    const guildId = guild.id;
    const sessionKey = `${guildId}:${channel.id}`;
    const session = activeTenantSessions.get(sessionKey);

    // ── ปุ่ม Leaderboard ──────────────────────────────────────
    if (customId.startsWith('akari_mg_top')) {
      await safeDeferReply(interaction, { flags: MessageFlags.Ephemeral | FLAG_V2 });

      try {
        const { buildLeaderboardPayload } = require('../commands/pointsCommands');
        const { getTenantStoreConfig } = require('../store/storeEngine');

        const [leaderboardList, storeConfig] = await Promise.all([
          getTenantLeaderboard(supabase, guildId, 10, false, 'points'),
          getTenantStoreConfig(supabase, guildId).catch(() => null),
        ]);

        const currencyEmoji = storeConfig?.currency_emoji || '<:strawberryv2:1548976664090779650>';
        const payload = buildLeaderboardPayload(guild, leaderboardList, 'points', currencyEmoji);

        return safeRespond(interaction, payload);
      } catch (err) {
        console.error('[akari-minigames] Error showing leaderboard from game button:', err.message);
        return safeRespond(interaction, {
          content: `⚠️ เกิดข้อผิดพลาดในการดึงกระดานจัดอันดับ: ${err.message}`,
          flags: MessageFlags.Ephemeral,
        });
      }
    }

    if (!session) {
      const isEphemeralMsg = Boolean(
        interaction.message &&
        (interaction.message.flags?.has(MessageFlags.Ephemeral) || (interaction.message.flags?.bitfield & 64))
      );
      return respondAkariEphemeralSafe(
        interaction,
        {
          content: '⚠️ ไม่พบเซสชันมินิเกมที่กำลังเล่นอยู่ในช่องนี้ หรือโจทย์จบไปแล้วครับ',
          components: [],
        },
        isEphemeralMsg
      );
    }

    // ── ปุ่มเรียงประโยค: เกม 13 (Sentence Builder) ───────────────
    if (customId.startsWith('akari_mg_sb_') || customId.startsWith('akari_mg_sb_reset_')) {
      const isReset = customId.startsWith('akari_mg_sb_reset_');
      const parts = customId.split('_');
      // For reset: akari_mg_sb_reset_{gameId}_{msgIdOrTs} -> parts[4] is gameId, parts[5] is msgIdOrTs
      // For choice: akari_mg_sb_{gameId}_{choiceIndex}_{msgIdOrTs} -> parts[3] is gameId, parts[4] is choiceIndex, parts[5] is msgIdOrTs
      const targetGameId = parseInt(isReset ? parts[4] : parts[3], 10);
      if (targetGameId !== 13) return;

      const isEphemeralInteraction = Boolean(
        interaction.message &&
        (interaction.message.flags?.has(MessageFlags.Ephemeral) || (interaction.message.flags?.bitfield & 64))
      );
      const roundMsgId = parts[5] && parts[5].length >= 17 ? parts[5] : null;

      if (session.gameId !== targetGameId || (roundMsgId && session.messageId && roundMsgId !== session.messageId)) {
        return respondAkariEphemeralSafe(
          interaction,
          {
            content: '⚠️ ข้อความนี้เป็นโจทย์ข้อเก่าหรือจบไปแล้วนะครับ กรุณากดเล่นที่ข้อความล่าสุดในช่องครับ 🎮',
            components: [],
          },
          isEphemeralInteraction
        );
      }

      if (processingChannels.has(sessionKey)) {
        return safeRespond(interaction, {
          content: 'กำลังเปลี่ยนโจทย์ข้อใหม่ครับ กรุณารอสักครู่นะครับ',
          flags: MessageFlags.Ephemeral,
        });
      }

      const userId = user.id;
      const feasibility = checkCrossChannelFeasibility(userId, channel.id, targetGameId);
      if (!feasibility.allowed) {
        if (feasibility.reason === 'IN_FLIGHT_CONFLICT') {
          return safeRespond(interaction, {
            content: '⚠️ กำลังประมวลผลคำตอบจากเกมอื่นอยู่ กรุณารอสักครู่นะครับ 🐻',
            flags: MessageFlags.Ephemeral,
          });
        }
        return safeRespond(interaction, {
          content: '⚠️ ตรวจพบการเล่นหลายเกมพร้อมกัน กรุณารอสักครู่แล้วลองใหม่อีกครั้งนะครับ (เล่นทีละเกมนะครับ 🐻)',
          flags: MessageFlags.Ephemeral,
        });
      }
      recordUserAction(userId, channel.id, targetGameId);

      const questionData = session.questionData;
      const correctWords = questionData.correctWords || String(questionData.answer || '').split(/[,|]/).map(s => s.trim()).filter(Boolean);
      const allOptions = questionData.options || [];
      const userKey = `${channel.id}:${userId}:${session.messageId}`;
      const roundTag = session.messageId || Date.now();

      // ── Reset Button ──
      if (isReset) {
        userSentenceProgress.delete(userKey);

        const btnRows = [];
        const btnStyles = [2, 1, 2, 1, 2, 1];
        const buttons = allOptions.map((optLabel, idx) => ({
          style: btnStyles[idx % btnStyles.length],
          type: 2,
          label: String(optLabel || ' ').slice(0, 80),
          custom_id: `akari_mg_sb_${targetGameId}_${idx}_${roundTag}`,
        }));
        for (let i = 0; i < buttons.length; i += 5) {
          btnRows.push({ type: 1, components: buttons.slice(i, i + 5) });
        }

        const templateStr = questionData.englishTemplate || (Array.isArray(questionData.hints) ? questionData.hints[0] : '') || '';
        let maskedPreview = templateStr;
        for (let i = 1; i <= correctWords.length; i++) {
          maskedPreview = maskedPreview.replace(new RegExp(`\\{${i}\\}`, 'g'), '`[ ___ ]`');
        }

        const resetPayload = {
          content: `🔄 **รีเซ็ตประโยคเรียบร้อยแล้วครับ!**\n> 📝 โจทย์: **${questionData.wordOrQuestion}**\n> 🔤 กำลังต่อ: ${maskedPreview}\n\n👉 เลือกคำแรกด้านล่างได้เลยครับ:`,
          components: btnRows,
        };

        return respondAkariEphemeralSafe(interaction, resetPayload, isEphemeralInteraction);
      }

      // ── Global Wrong Cooldown Check ──
      const cooldownCheck = checkUserWrongCooldown(user.id);
      if (cooldownCheck.inCooldown) {
        return safeRespond(interaction, {
          content: `⏳ คุณกำลังติดคูลดาวน์จากการตอบผิด กรุณารออีก <t:${cooldownCheck.expireTs}:R> ก่อนกดใหม่อีกครั้งนะครับ`,
          flags: MessageFlags.Ephemeral,
        });
      }

      // ── Word Choice Click ──
      // akari_mg_sb_{gameId}_{choiceIndex}_{msgIdOrTs} -> parts[4] is choiceIndex
      const choiceIndex = parseInt(parts[4], 10);
      const clickedWord = allOptions[choiceIndex];

      let progress = userSentenceProgress.get(userKey) || { pickedIndices: [], pickedWords: [] };

      if (progress.pickedIndices.includes(choiceIndex)) {
        return safeRespond(interaction, {
          content: `คุณได้เลือกคำว่า **"${clickedWord}"** ไปแล้วครับ กรุณาเลือกคำถัดไปนะครับ!`,
          flags: MessageFlags.Ephemeral,
        });
      }

      const nextExpectedWord = correctWords[progress.pickedWords.length];
      const isCorrectWord = String(clickedWord || '').trim().toLowerCase() === String(nextExpectedWord || '').trim().toLowerCase();

      // Case 1: Wrong word / Wrong order -> Immediate penalty & cooldown
      if (!isCorrectWord) {
        userSentenceProgress.delete(userKey);

        let penaltyConfig = { cooldownMs: 10000, penaltyTemplate: '' };
        try {
          const { getTenantPenaltyConfig } = require('../commands/minigamesCommands');
          penaltyConfig = await getTenantPenaltyConfig(supabase, guildId);
        } catch {}

        const cooldownMs = penaltyConfig.cooldownMs || 10000;
        const endTs = Math.ceil((Date.now() + cooldownMs) / 1000);
        userWrongCooldowns.set(user.id, Date.now() + cooldownMs);

        const planInfo = await getTenantPlan(guildId, supabase);
        const isPremium = planInfo.isPremium;
        const penalty = isPremium ? (Math.floor(Math.random() * 11) + 5) : 10;
        bufferTenantPoints(guildId, user.id, -penalty, 0);

        let currencyEmoji = '<:strawberryv2:1548976664090779650>';
        try {
          const { getTenantStoreConfig } = require('../store/storeEngine');
          const storeConfig = await getTenantStoreConfig(supabase, guildId);
          if (storeConfig?.currency_emoji) currencyEmoji = storeConfig.currency_emoji;
        } catch {}

        if (isEphemeralInteraction) {
          // อัปเดตข้อความ Ephemeral เดิมด้วย Text format เพื่อไม่ให้ขัดแย้งกับ FLAG_V2 ของ Discord API
          return respondAkariEphemeralSafe(
            interaction,
            {
              content: `<:68440x:1358584606911369226> <@${user.id}> ตอบไม่ถูก โดนหัก ${currencyEmoji} **-${penalty}** ติดคูลดาวน์ <t:${endTs}:R>\n-# เมื่อท่านตอบผิดจะติดคูลดาวน์ทุกเกม เพื่อป้องกันการสลับห้องสแปม`,
              components: [],
            },
            true
          );
        }

        const penaltyPayload = buildKumaPenaltyPayload(
          user.id,
          penalty,
          endTs,
          penaltyConfig.penaltyTemplate,
          currencyEmoji
        );

        return respondAkariEphemeralSafe(interaction, penaltyPayload, false);
      }

      // Case 2: Correct word!
      progress.pickedIndices.push(choiceIndex);
      progress.pickedWords.push(clickedWord);

      const isCompleted = progress.pickedWords.length >= correctWords.length;

      if (!isCompleted) {
        if (userSentenceProgress.size > 300) {
          const oldestKey = userSentenceProgress.keys().next().value;
          userSentenceProgress.delete(oldestKey);
        }
        userSentenceProgress.set(userKey, progress);

        const remainingButtons = [];
        allOptions.forEach((optLabel, idx) => {
          if (!progress.pickedIndices.includes(idx)) {
            remainingButtons.push({
              style: 1,
              type: 2,
              label: String(optLabel || ' ').slice(0, 80),
              custom_id: `akari_mg_sb_${targetGameId}_${idx}_${roundTag}`,
            });
          }
        });

        // Add Reset button
        remainingButtons.push({
          style: 4,
          type: 2,
          label: '︲เริ่มใหม่',
          emoji: { name: '🔄' },
          custom_id: `akari_mg_sb_reset_${targetGameId}_${roundTag}`,
        });

        const btnRows = [];
        for (let i = 0; i < remainingButtons.length; i += 5) {
          btnRows.push({ type: 1, components: remainingButtons.slice(i, i + 5) });
        }

        const templateStr = questionData.englishTemplate || (Array.isArray(questionData.hints) ? questionData.hints[0] : '') || '';
        let previewStr = templateStr;
        for (let i = 1; i <= correctWords.length; i++) {
          if (i <= progress.pickedWords.length) {
            previewStr = previewStr.replace(new RegExp(`\\{${i}\\}`, 'g'), `**${progress.pickedWords[i - 1]}**`);
          } else {
            previewStr = previewStr.replace(new RegExp(`\\{${i}\\}`, 'g'), '`[ ___ ]`');
          }
        }

        const stepPayload = {
          content: `✅ ถูกต้อง! ต่อคำถัดไปได้เลยครับ (เหลืออีก **${correctWords.length - progress.pickedWords.length}** คำ)\n> 📝 โจทย์: **${questionData.wordOrQuestion}**\n> 🔤 กำลังต่อ: ${previewStr}`,
          components: btnRows,
        };

        return respondAkariEphemeralSafe(interaction, stepPayload, isEphemeralInteraction);
      }

      // Case 3: Completed & WINNER!
      for (const key of userSentenceProgress.keys()) {
        if (key.startsWith(`${channel.id}:`)) {
          userSentenceProgress.delete(key);
        }
      }

      if (processingChannels.has(sessionKey) || userInFlightProcessing.has(userId)) {
        return respondAkariEphemeralSafe(
          interaction,
          {
            content: 'คุณต่อคำได้ถูกต้องแล้วครับ แต่มีผู้เล่นคนอื่นตอบเสร็จก่อนหน้าไปเสี้ยววินาที! 🎮',
            components: [],
          },
          isEphemeralInteraction
        );
      }

      processingChannels.add(sessionKey);
      userInFlightProcessing.add(userId);

      const safetyTimeout = setTimeout(() => {
        userInFlightProcessing.delete(userId);
        processingChannels.delete(sessionKey);
      }, 10000);

      try {
        const planInfo = await getTenantPlan(guildId, supabase);
        const isPremium = planInfo.isPremium;
        const pointsPerWin = questionData.rewardPoints || 10;
        bufferTenantPoints(guildId, user.id, pointsPerWin, 1);

        const winnerDisplayName = interaction.member?.displayName || user.username;
        const winnerPayload = buildAkariWinnerPayload(
          targetGameId,
          questionData,
          winnerDisplayName,
          pointsPerWin,
          isPremium
        );

        if (isEphemeralInteraction) {
          await respondAkariEphemeralSafe(
            interaction,
            {
              content: '🎉 **ยินดีด้วยครับ! คุณเรียงประโยคสำเร็จเป็นคนแรก!** 🏆',
              components: [],
            },
            true
          );
          if (session.messageId) {
            const originalMsg = await channel.messages.fetch(session.messageId).catch(() => null);
            if (originalMsg) {
              await originalMsg.edit(winnerPayload).catch((err) => logAkariInteractionError('Game 13 originalMsg.edit failed', err));
            } else {
              await channel.send(winnerPayload).catch((err) => logAkariInteractionError('Game 13 winner fallback send failed', err));
            }
          } else {
            await channel.send(winnerPayload).catch((err) => logAkariInteractionError('Game 13 winner send failed', err));
          }
        } else {
          await interaction.update(winnerPayload).catch((err) => logAkariInteractionError('Game 13 winner interaction.update failed', err));
        }

        activeTenantSessions.delete(sessionKey);
        if (supabase) {
          Promise.resolve(
            supabase
              .from('tenant_minigame_active_sessions')
              .delete()
              .eq('guild_id', guildId)
              .eq('channel_id', channel.id)
          ).catch(() => {});
        }

        await new Promise((r) => setTimeout(r, 700));
        await spawnQuestion(client, channel, targetGameId, guildId, supabase);
      } finally {
        clearTimeout(safetyTimeout);
        userInFlightProcessing.delete(userId);
        processingChannels.delete(sessionKey);
      }
      return;
    }

    // ── ปุ่ม/ช้อยส์เลือกคำตอบ (Option Buttons) ───────────────
    if (customId.startsWith('akari_mg_opt_') || customId.startsWith('kuma_mg_opt_') || customId.startsWith('mg_opt_')) {
      const parts = customId.split('_');
      const isShort = customId.startsWith('mg_opt_');
      const gameId = parseInt(parts[isShort ? 2 : 3], 10);
      const optIdx = parseInt(parts[isShort ? 3 : 4], 10);

      if (session.gameId !== gameId) {
        return safeRespond(interaction, {
          content: '⚠️ ข้อความนี้เป็นโจทย์ข้อเก่าแล้วนะครับ 🎮',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (session.messageId && interaction.message?.id !== session.messageId) {
        return safeRespond(interaction, {
          content: '⚠️ ข้อความนี้เป็นโจทย์ข้อเก่าแล้วนะครับ กรุณาตอบที่ข้อความล่าสุดในช่องครับ 🎮',
          flags: MessageFlags.Ephemeral,
        });
      }

      const selectedOption = session.questionData?.options?.[optIdx];
      const isCorrect = selectedOption && String(selectedOption).trim().toLowerCase() === session.answer;
      const userId = user.id;

      // ── Global Wrong Cooldown Check ─────────────────────────────────
      const cooldownCheck = checkUserWrongCooldown(userId);
      if (cooldownCheck.inCooldown) {
        return safeRespond(interaction, {
          content: `⏳ คุณกำลังติดคูลดาวน์จากการตอบผิด กรุณารออีก <t:${cooldownCheck.expireTs}:R> ก่อนกดใหม่อีกครั้งนะครับ`,
          flags: MessageFlags.Ephemeral,
        });
      }

      // ── Cross-Channel Feasibility Guard ─────────────────────────────
      const feasibility = checkCrossChannelFeasibility(userId, channel.id, session.gameId);
      if (!feasibility.allowed) {
        if (feasibility.reason === 'IN_FLIGHT_CONFLICT') {
          return safeRespond(interaction, {
            content: '⚠️ กำลังประมวลผลคำตอบจากเกมอื่นอยู่ กรุณารอสักครู่นะครับ 🐻',
            flags: MessageFlags.Ephemeral,
          });
        }
        console.log(`[akari-minigames] 🛡️ Blocked concurrent attempt by User: ${user.tag || user.username} (${userId}) (from Game ${feasibility.fromGameId} to Game ${feasibility.toGameId} in ${feasibility.elapsed}ms, required >= ${feasibility.requiredMs}ms)`);
        return safeRespond(interaction, {
          content: '⚠️ ตรวจพบการเล่นหลายเกมพร้อมกัน กรุณารอสักครู่แล้วลองใหม่อีกครั้งนะครับ (เล่นทีละเกมนะครับ 🐻)',
          flags: MessageFlags.Ephemeral,
        });
      }

      recordUserAction(userId, channel.id, session.gameId);

      const planInfo = await getTenantPlan(guildId, supabase);
      const isPremium = planInfo.isPremium;

      if (!isCorrect) {
        let penaltyConfig = { cooldownMs: 10000, penaltyTemplate: '' };
        try {
          const { getTenantPenaltyConfig } = require('../commands/minigamesCommands');
          penaltyConfig = await getTenantPenaltyConfig(supabase, guildId);
        } catch {}

        const cooldownMs = penaltyConfig.cooldownMs || 10000;
        const endTs = Math.ceil((Date.now() + cooldownMs) / 1000);
        userWrongCooldowns.set(userId, Date.now() + cooldownMs);

        const penalty = isPremium ? (Math.floor(Math.random() * 11) + 5) : 10;
        bufferTenantPoints(guildId, user.id, -penalty, 0);

        let currencyEmoji = '<:strawberryv2:1548976664090779650>';
        try {
          const { getTenantStoreConfig } = require('../store/storeEngine');
          const storeConfig = await getTenantStoreConfig(supabase, guildId);
          if (storeConfig?.currency_emoji) currencyEmoji = storeConfig.currency_emoji;
        } catch {}

        const penaltyPayload = buildKumaPenaltyPayload(
          user.id,
          penalty,
          endTs,
          penaltyConfig.penaltyTemplate,
          currencyEmoji
        );

        return safeRespond(interaction, {
          ...penaltyPayload,
          flags: FLAG_V2 | MessageFlags.Ephemeral,
        });
      }

      if (processingChannels.has(sessionKey)) {
        return safeRespond(interaction, {
          content: 'กำลังเปลี่ยนโจทย์ข้อใหม่ครับ กรุณารอสักครู่นะครับ',
          flags: MessageFlags.Ephemeral,
        });
      }

      processingChannels.add(sessionKey);
      userInFlightProcessing.add(userId);

      const safetyTimeout = setTimeout(() => {
        userInFlightProcessing.delete(userId);
        processingChannels.delete(sessionKey);
      }, 10000);

      try {
        const pointsPerWin = session.questionData?.rewardPoints || 10;
        bufferTenantPoints(guildId, user.id, pointsPerWin, 1);

        const winnerDisplayName = interaction.member?.displayName || user.username;
        const winnerPayload = buildAkariWinnerPayload(
          session.gameId,
          session.questionData,
          winnerDisplayName,
          pointsPerWin,
          isPremium
        );

        let updated = false;
        try {
          await interaction.update(winnerPayload);
          updated = true;
        } catch (updErr) {
          logAkariInteractionError('choice winner interaction.update failed', updErr);
        }
        if (!updated && session.messageId && channel) {
          const fallbackMsg = await channel.messages.fetch(session.messageId).catch(() => null);
          if (fallbackMsg) {
            await fallbackMsg.edit(winnerPayload).catch((e) => logAkariInteractionError('choice winner fallback edit failed', e));
          }
        }

        activeTenantSessions.delete(sessionKey);
        if (supabase) {
          Promise.resolve(
            supabase
              .from('tenant_minigame_active_sessions')
              .delete()
              .eq('guild_id', guildId)
              .eq('channel_id', channel.id)
          ).catch(() => {});
        }

        await new Promise((r) => setTimeout(r, 700));
        await spawnQuestion(client, channel, session.gameId, guildId, supabase);
      } finally {
        clearTimeout(safetyTimeout);
        userInFlightProcessing.delete(userId);
        processingChannels.delete(sessionKey);
      }
      return;
    }

    // ── Select Menu คำใบ้ (เกม 5 และ 11) ──────────────────────
    if (customId.startsWith('akari_mg_hint_select_')) {
      const selectVal = interaction.values?.[0];
      let hintText = '';
      if (selectVal === 'hint_1') {
        hintText = generateHint(session.displayAnswer, 1);
      } else {
        hintText = generateHint(session.displayAnswer, 2);
      }

      return safeRespond(interaction, {
        content: `💡 **คำใบ้:** ${hintText}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── ปุ่ม Hint ──────────────────────────────────────────────
    if (customId.startsWith('akari_mg_hint')) {
      session.hintStep += 1;
      const hintMsg = generateHint(session.displayAnswer, session.hintStep);

      return safeRespond(interaction, {
        content: `💡 **คำใบ้ที่ ${session.hintStep}:** ${hintMsg}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── ปุ่ม Skip ──────────────────────────────────────────────
    if (customId.startsWith('akari_mg_skip')) {
      await safeDeferReply(interaction);

      await safeRespond(interaction, {
        content: `⏭️ <@${user.id}> กดข้ามข้อนี้! คำตอบที่ถูกต้องคือ: **${session.displayAnswer}**`,
      });

      activeTenantSessions.delete(sessionKey);
      await new Promise((r) => setTimeout(r, 700));
      await spawnQuestion(client, channel, session.gameId, guildId, supabase);
    }
  });

  console.log('🐻 [KumaMinigames] ระบบมินิเกม Component V2 (สไตล์บอทหลัก 100% + Anti-Cheat Guard) พร้อมใช้งานแล้ว!');
}

// ─── Utils สำหรับ Commands ─────────────────────────────────────────────

function getBufferedPoints(guildId, userId) {
  const key = `${guildId}:${userId}`;
  return guildScoreBuffer.get(key) || { points_accumulated: 0, wins_accumulated: 0 };
}

function clearBufferedPoints(guildId, userId) {
  const key = `${guildId}:${userId}`;
  guildScoreBuffer.delete(key);
}

function clearActiveTenantSession(guildId, channelId) {
  const sessionKey = `${guildId}:${channelId}`;
  activeTenantSessions.delete(sessionKey);
}

function getActiveTenantSession(guildId, channelId) {
  const sessionKey = `${guildId}:${channelId}`;
  return activeTenantSessions.get(sessionKey) || null;
}

module.exports = {
  setupAkariMinigames,
  spawnQuestion,
  getTenantSettings,
  setTenantSettingsInCache,
  getTenantLeaderboard,
  getUserTenantRank,
  invalidateLeaderboardCache,
  invalidateSettingsCache,
  flushAllTenantPoints,
  getBufferedPoints,
  clearBufferedPoints,
  clearActiveTenantSession,
  getActiveTenantSession,
  bufferTenantPoints,
  flushTenantPoints,
  buildAkariGamePayload,
  buildAkariWinnerPayload,
  getTTSAudioBuffer,
  checkCrossChannelFeasibility,
  recordUserAction,
  getTenantPlan,
  invalidateTenantPlanCache,
  validateGameAccess,
  LIGHTWEIGHT_GAMES,
  HEAVYWEIGHT_GAMES,
  FREE_QUOTA_LIMIT,
};
