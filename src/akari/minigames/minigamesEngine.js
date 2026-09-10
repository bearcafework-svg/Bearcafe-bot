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
const { createTextImageBuffer } = require('../../features/minigames/canvasGenerator');
const { safeDeferReply, safeRespond } = require('../../../utils/discordSafety');

// ─── ภาวะแวดล้อม / Emojis / Config (ตรงตามบอทหลัก 100%) ──────────────

const FLAG_V2 = MessageFlags.IsComponentsV2 || 32768;

const BEE_EMOJI_STR = '<:bee20000:1256669436350562355>';
const CHECKMARK_EMOJI_ID = '1358584609087946867';
const POINT_EMOJI = {
  id: '1520439075100688614',
  name: 'strawberryv2',
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
};

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
}, 5 * 60 * 1000);

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

// ─── Memory Cache / Sessions (Multi-Tenant Isolated) ───────────────

const activeTenantSessions = new Map();
const processingChannels = new Set();
const ttsAudioCache = new Map();

const guildSettingsCache = new Map(); // guildId -> { gameId: { enabled, points_per_win }, ... }
const guildLeaderboardCache = new Map(); // guildId -> [{ user_id, points, wins }, ... ]
const guildScoreBuffer = new Map(); // guildId:user_id -> { points_accumulated, wins_accumulated }

/**
 * ดึง settings ของ guild จาก cache หรือ DB (Akari Isolated)
 */
async function getTenantSettings(supabase, guildId) {
  if (guildSettingsCache.has(guildId)) {
    return guildSettingsCache.get(guildId);
  }

  if (!supabase) {
    const defaults = {};
    for (let i = 1; i <= 12; i++) {
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
      for (let i = 1; i <= 12; i++) {
        defaults[i] = { enabled: true, points_per_win: 10 };
      }
      guildSettingsCache.set(guildId, defaults);
      return defaults;
    }

    const map = {};
    for (let i = 1; i <= 12; i++) {
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
    for (let i = 1; i <= 12; i++) {
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
  } else {
    guildSettingsCache.clear();
  }
}

function invalidateLeaderboardCache(guildId) {
  if (guildId) {
    guildLeaderboardCache.delete(guildId);
  } else {
    guildLeaderboardCache.clear();
  }
}

/**
 * ดึง leaderboard ของแต่ละ Guild จาก Akari DB
 */
async function getTenantLeaderboard(supabase, guildId, limit = 10, force = false) {
  if (!force && guildLeaderboardCache.has(guildId)) {
    return guildLeaderboardCache.get(guildId);
  }

  if (!supabase) {
    guildLeaderboardCache.set(guildId, []);
    return [];
  }

  try {
    const { data, error } = await supabase
      .from('tenant_minigame_scores')
      .select('user_id, points, wins')
      .eq('guild_id', guildId)
      .order('points', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[akari-minigames] Leaderboard fetch error:', error.message);
      return [];
    }
    const result = data || [];
    guildLeaderboardCache.set(guildId, result);
    return result;
  } catch (e) {
    console.error('[akari-minigames] DB Leaderboard error:', e.message);
    return [];
  }
}

/**
 * เก็บคะแนนลง buffer ใน memory เพื่อประหยัด Supabase Egress
 */
function bufferTenantPoints(guildId, userId, pointsToAdd = 10, winsToAdd = 1) {
  const key = `${guildId}:${userId}`;
  const existing = guildScoreBuffer.get(key) || { points_accumulated: 0, wins_accumulated: 0 };
  existing.points_accumulated += pointsToAdd;
  existing.wins_accumulated += winsToAdd;
  guildScoreBuffer.set(key, existing);
}

/**
 * Flush คะแนนที่สะสมใน memory ลง Akari DB
 * ใช้ Supabase RPC 'increment_tenant_score' แบบ Atomic (1 query, ประหยัด Egress 50%)
 * พร้อม Fallback สู่ SELECT+UPSERT หากยังไม่ได้ติดตั้ง RPC
 */
async function flushTenantPoints(supabase, guildId, userId, pointsToAdd = 10, winsToAdd = 1) {
  if (!supabase) return;

  const bufferKey = `${guildId}:${userId}`;
  const buffered = guildScoreBuffer.get(bufferKey) || { points_accumulated: 0, wins_accumulated: 0 };
  const totalPoints = pointsToAdd + buffered.points_accumulated;
  const totalWins = winsToAdd + buffered.wins_accumulated;

  if (totalPoints === 0 && totalWins === 0) {
    guildScoreBuffer.delete(bufferKey);
    return;
  }

  try {
    // 1. ลองใช้ Atomic RPC เพื่อประหยัด Supabase Egress
    const { error: rpcError } = await supabase.rpc('increment_tenant_score', {
      p_guild_id: String(guildId),
      p_user_id: String(userId),
      p_points: Number(totalPoints),
      p_wins: Number(totalWins),
    });

    if (!rpcError) {
      guildScoreBuffer.delete(bufferKey);
      return;
    }

    // 2. Fallback สู่ 2-step SELECT + UPSERT กรณี RPC ยังไม่ได้รันบน Database
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
        points: currentPoints + totalPoints,
        wins: currentWins + totalWins,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'guild_id,user_id' }
    );

    guildScoreBuffer.delete(bufferKey);
  } catch (e) {
    console.error('[akari-minigames] Score upsert error:', e.message);
  }
}

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
function buildAkariGamePayload(gameId, questionData, rewardPoints = 3) {
  const accessoryButton = {
    type: 2,
    style: 5,
    label: `รางวัล +${rewardPoints} แต้ม`,
    emoji: POINT_EMOJI,
    url: 'https://discord.gg/bearcafe',
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
  }

  const containerComponents = [];

  // Media Component (สำหรับเกม 6 & 7)
  if (mediaItem) {
    if (mediaItem.type === 13) {
      containerComponents.push(mediaItem);
    } else {
      containerComponents.push({ type: 12, items: [mediaItem] });
    }
    containerComponents.push({ type: 14, spacing: 2 });
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

  const leaderboardButton = {
    style: 1,
    type: 2,
    label: '🏆 ตารางคะแนน',
    custom_id: `akari_mg_top:${gameId}`,
  };

  // Choice Buttons (สำหรับเกม 8, 9, 10, 12)
  if ([8, 9, 10, 12].includes(gameId) && Array.isArray(questionData.options) && questionData.options.length > 0) {
    containerComponents.push({ type: 14, spacing: 2 });
    let buttonComponents = [];

    if (gameId === 12) {
      // จริง (เขียว: Style 3) และ เท็จ (แดง: Style 4)
      buttonComponents = questionData.options.map((optionLabel, idx) => {
        const isTrueBtn = String(optionLabel).trim() === 'จริง';
        return {
          style: isTrueBtn ? 3 : 4,
          type: 2,
          label: optionLabel,
          custom_id: `akari_mg_opt_${gameId}_${idx}_${Date.now()}`,
        };
      });
    } else {
      const choiceStyles = [1, 4, 3, 2];
      buttonComponents = questionData.options.map((optionLabel, idx) => ({
        style: choiceStyles[idx % choiceStyles.length],
        type: 2,
        label: optionLabel,
        custom_id: `akari_mg_opt_${gameId}_${idx}_${Date.now()}`,
      }));
    }

    buttonComponents.push(leaderboardButton);

    containerComponents.push({
      type: 1,
      components: buttonComponents,
    });
  } else {
    // เกมแบบพิมพ์ตอบ: วางปุ่มตารางคะแนนแยกแถว
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
function buildAkariWinnerPayload(gameId, questionData, winnerDisplayName, rewardPoints = 3) {
  const accessoryButton = {
    type: 2,
    style: 5,
    label: `รางวัล +${rewardPoints} แต้ม`,
    emoji: POINT_EMOJI,
    url: 'https://discord.gg/bearcafe',
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
  } else {
    contentText = `### ${BEE_EMOJI_STR}︲__\` 𝖦𝖺𝗆𝖾 ₊ ${titleText} 𓂃 \`__\n` +
      `# ${questionData.wordOrQuestion || ''} = ${questionData.answer}`;
  }

  return {
    flags: FLAG_V2,
    components: [{
      type: 17,
      components: [
        {
          type: 9,
          components: [{ type: 10, content: contentText }],
          accessory: accessoryButton,
        },
        { type: 14, spacing: 2 },
        {
          type: 1,
          components: [{
            style: 3,
            type: 2,
            label: `@${winnerDisplayName} ตอบถูก (+${rewardPoints} แต้ม)`,
            custom_id: `akari_mg_winner_disabled_${Date.now()}`,
            disabled: true,
          }],
        },
      ],
    }],
  };
}

// ─── สปอว์นคำถาม (Spawn Question) ───────────────────────────────────

async function spawnQuestion(client, channel, gameId, guildId, supabase) {
  const settingsMap = await getTenantSettings(supabase, guildId);
  const gameSettings = settingsMap[gameId];
  if (!gameSettings || gameSettings.enabled === false) {
    console.log(
      `[akari-minigames] ⏭️ ข้ามการสปอว์นโจทย์เกม #${gameId} บน Guild ${guildId} (สถานะ: ปิดใช้งาน)`
    );
    return null;
  }

  const sessionKey = `${guildId}:${channel.id}`;
  // ส่งคำขอโจทย์ไปยัง akari_minigame_questions บน Akari Supabase
  const questionObj = await getNextQuestion(supabase, gameId, gameSettings, { tableName: 'akari_minigame_questions' });
  if (!questionObj) return null;

  const rawAnswer = String(questionObj.answer).trim();
  let wordOrQuestion = String(questionObj.word_or_question || questionObj.wordOrQuestion || '').trim();
  let ttsBuffer = null;

  if (gameId === 1 || gameId === 2) {
    const maskedObj = maskWord(rawAnswer, gameId === 1);
    wordOrQuestion = typeof maskedObj === 'object' ? maskedObj.maskedStr : String(maskedObj);
  } else if (gameId === 5) {
    ttsBuffer = await getTTSAudioBuffer(rawAnswer, 'en');
  } else if (gameId === 11) {
    ttsBuffer = await getTTSAudioBuffer(rawAnswer, 'th');
  }

  const pointsPerWin = gameSettings.points_per_win || 3;

  const questionData = {
    wordOrQuestion,
    answer: rawAnswer,
    category: questionObj.category,
    difficulty: questionObj.difficulty,
    hints: questionObj.hints,
    options: questionObj.options,
    rewardPoints: pointsPerWin,
  };

  const payload = buildAkariGamePayload(gameId, questionData, pointsPerWin);

  const attachments = [];
  if (gameId === 6 || gameId === 7) {
    try {
      const buffer = createTextImageBuffer(wordOrQuestion);
      attachments.push(new AttachmentBuilder(buffer, { name: 'text_image.png' }));
    } catch (imgErr) {
      console.error(`[akari-minigames] Text image buffer create error:`, imgErr.message);
    }
  }

  if (ttsBuffer) {
    try {
      const audioFile = new AttachmentBuilder(ttsBuffer, { name: 'audio.mp3' });
      const audioMsg = await channel.send({ files: [audioFile] });
      questionData.audioMessageId = audioMsg.id;
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
    const { data: dbSessions } = await supabase
      .from('tenant_minigame_active_sessions')
      .select('guild_id, channel_id, game_id, session_data');

    if (Array.isArray(dbSessions) && dbSessions.length > 0) {
      for (const row of dbSessions) {
        if (row && row.guild_id && row.channel_id && row.session_data) {
          const sessionKey = `${row.guild_id}:${row.channel_id}`;
          activeTenantSessions.set(sessionKey, row.session_data);
        }
      }
      console.log(`[akari-minigames] ⚡ โหลด ${dbSessions.length} เซสชันเกมเดิมจาก DB เข้าสู่ RAM (เงียบๆ ไม่ส่งข้อความซ้ำ)`);
    }

    const { data: channels } = await supabase
      .from('tenant_minigame_channels')
      .select('guild_id, game_id, channel_id');

    if (Array.isArray(channels) && channels.length > 0) {
      let newlySpawned = 0;
      for (const row of channels) {
        const { guild_id, game_id, channel_id } = row;
        const sessionKey = `${guild_id}:${channel_id}`;

        if (activeTenantSessions.has(sessionKey)) continue;

        try {
          const channel = await client.channels.fetch(channel_id).catch(() => null);
          if (!channel) {
            console.log(`[akari-minigames] 🧹 [Startup] ตรวจพบช่องที่ถูกลบใน Discord (${channel_id}) — ลบออกจาก DB`);
            await supabase.from('tenant_minigame_channels').delete().eq('channel_id', channel_id).catch(() => {});
            await supabase.from('tenant_minigame_active_sessions').delete().eq('channel_id', channel_id).catch(() => {});
            continue;
          }

          const session = await spawnQuestion(client, channel, game_id, guild_id, supabase);
          if (session) newlySpawned++;
        } catch (chErr) {
          console.error(`[akari-minigames] Restore error for channel ${channel_id}:`, chErr.message);
        }
      }

      if (newlySpawned > 0) {
        console.log(`[akari-minigames] ✅ สปอว์นโจทย์ครั้งแรกสำหรับช่องใหม่สำเร็จ ${newlySpawned} ช่อง`);
      }
    }
  } catch (err) {
    console.error('[akari-minigames] Startup restoration error:', err.message);
  }
}

// ─── Setup Event Listeners ─────────────────────────────────────────────

function setupAkariMinigames(client, supabase) {
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
          .select();

        if (data && data.length > 0) {
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

    // ข้ามเกมที่ตอบด้วยปุ่ม (เกม 8, 9, 10, 12)
    if ([8, 9, 10, 12].includes(session.gameId)) return;

    const userText = message.content.trim();
    if (!userText) return;

    const isThaiGame = session.gameId === 1 || session.gameId === 4 || session.gameId === 6 || session.gameId === 11;
    const isCorrect = isThaiGame
      ? userText === session.displayAnswer
      : userText.toLowerCase() === session.answer;

    const userId = message.author.id;

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

    if (!isCorrect) {
      // ❌ ตอบผิด: ลบข้อความผิดทิ้ง สุ่มหักแต้ม 5-15 แต้ม และส่งข้อความเตือน 5 วิ แบบเดียวกับบอทหลัก
      message.delete().catch(() => {});
      const penalty = Math.floor(Math.random() * 11) + 5; // 5-15
      bufferTenantPoints(guildId, userId, -penalty, 0);
      flushTenantPoints(supabase, guildId, userId, 0, 0).catch(() => {});

      message.channel.send({
        content: `${message.author} ❌ ตอบผิดค่ะ! ถูกหักแต้ม **${penalty} แต้ม** 🔻`
      }).then((penaltyMsg) => {
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

        const pointsPerWin = session.questionData?.rewardPoints || 3;
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

        await new Promise((r) => setTimeout(r, 2000));
        await spawnQuestion(client, message.channel, session.gameId, guildId, supabase);
        await flushTenantPoints(supabase, guildId, message.author.id, 0, 0);
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

    if (!customId.startsWith('akari_mg_')) return;

    const guildId = guild.id;
    const sessionKey = `${guildId}:${channel.id}`;
    const session = activeTenantSessions.get(sessionKey);

    // ── ปุ่ม Leaderboard ──────────────────────────────────────
    if (customId.startsWith('akari_mg_top')) {
      await safeDeferReply(interaction, { flags: MessageFlags.Ephemeral });
      const leaderboard = await getTenantLeaderboard(supabase, guildId, 10);

      if (leaderboard.length === 0) {
        return safeRespond(interaction, {
          content: '📊 ยังไม่มีคะแนนมินิเกมในเซิร์ฟเวอร์นี้ เริ่มเล่นเป็นคนแรกได้เลย!',
          flags: MessageFlags.Ephemeral,
        });
      }

      const desc = leaderboard
        .map((row, idx) =>
          `**#${idx + 1}** <@${row.user_id}> — **${row.points}** คะแนน (${row.wins} ชนะ)`
        )
        .join('\n');

      const embed = new EmbedBuilder()
        .setTitle(`🏆 ตารางคะแนนมินิเกม — ${guild.name}`)
        .setColor(0xffb703)
        .setDescription(desc)
        .setTimestamp()
        .setFooter({ text: 'Bear Cafe Minigames | Akari Engine' });

      return safeRespond(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (!session) {
      return safeRespond(interaction, {
        content: '⚠️ ไม่พบเซสชันมินิเกมที่กำลังเล่นอยู่ในช่องนี้ หรือโจทย์จบไปแล้วค่ะ',
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── ปุ่ม/ช้อยส์เลือกคำตอบ (Option Buttons) ───────────────
    if (customId.startsWith('akari_mg_opt_')) {
      const parts = customId.split('_');
      const gameId = parseInt(parts[3], 10);
      const optIdx = parseInt(parts[4], 10);

      if (session.gameId !== gameId) {
        return safeRespond(interaction, {
          content: '⚠️ ข้อความนี้เป็นโจทย์ข้อเก่าแล้วนะคะ 🎮',
          flags: MessageFlags.Ephemeral,
        });
      }

      if (session.messageId && interaction.message?.id !== session.messageId) {
        return safeRespond(interaction, {
          content: '⚠️ ข้อความนี้เป็นโจทย์ข้อเก่าแล้วนะคะ กรุณาตอบที่ข้อความล่าสุดในช่องค่ะ 🎮',
          flags: MessageFlags.Ephemeral,
        });
      }

      const selectedOption = session.questionData?.options?.[optIdx];
      const isCorrect = selectedOption && String(selectedOption).trim().toLowerCase() === session.answer;
      const userId = user.id;

      // ── Cross-Channel Feasibility Guard ─────────────────────────────
      const feasibility = checkCrossChannelFeasibility(userId, channel.id, session.gameId);
      if (!feasibility.allowed) {
        if (feasibility.reason === 'IN_FLIGHT_CONFLICT') {
          return safeRespond(interaction, {
            content: '⚠️ กำลังประมวลผลคำตอบจากเกมอื่นอยู่ กรุณารอสักครู่นะคะ 🐻',
            flags: MessageFlags.Ephemeral,
          });
        }
        console.log(`[akari-minigames] 🛡️ Blocked concurrent attempt by User: ${user.tag || user.username} (${userId}) (from Game ${feasibility.fromGameId} to Game ${feasibility.toGameId} in ${feasibility.elapsed}ms, required >= ${feasibility.requiredMs}ms)`);
        return safeRespond(interaction, {
          content: '⚠️ ตรวจพบการเล่นหลายเกมพร้อมกัน กรุณารอสักครู่แล้วลองใหม่อีกครั้งนะคะ (เล่นทีละเกมนะคะ 🐻)',
          flags: MessageFlags.Ephemeral,
        });
      }

      recordUserAction(userId, channel.id, session.gameId);

      if (!isCorrect) {
        const penalty = Math.floor(Math.random() * 11) + 5; // 5-15
        bufferTenantPoints(guildId, user.id, -penalty, 0);
        flushTenantPoints(supabase, guildId, user.id, 0, 0).catch(() => {});
        return safeRespond(interaction, {
          content: `❌ คำตอบไม่ถูกต้องค่ะ! ถูกหักแต้ม **${penalty} แต้ม** 🔻`,
          flags: MessageFlags.Ephemeral,
        });
      }

      if (processingChannels.has(sessionKey)) {
        return safeRespond(interaction, {
          content: 'กำลังเปลี่ยนโจทย์ข้อใหม่ค่ะ กรุณารอสักครู่นะคะ',
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
        const pointsPerWin = session.questionData?.rewardPoints || 3;
        bufferTenantPoints(guildId, user.id, pointsPerWin, 1);

        const winnerDisplayName = interaction.member?.displayName || user.username;
        const winnerPayload = buildAkariWinnerPayload(
          session.gameId,
          session.questionData,
          winnerDisplayName,
          pointsPerWin
        );

        await interaction.update(winnerPayload).catch(() => {});

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

        await new Promise((r) => setTimeout(r, 1500));
        await spawnQuestion(client, channel, session.gameId, guildId, supabase);
        await flushTenantPoints(supabase, guildId, user.id, 0, 0);
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
      await flushTenantPoints(supabase, guildId, user.id, 0, 0);

      await safeRespond(interaction, {
        content: `⏭️ <@${user.id}> กดข้ามข้อนี้! คำตอบที่ถูกต้องคือ: **${session.displayAnswer}**`,
      });

      activeTenantSessions.delete(sessionKey);
      await new Promise((r) => setTimeout(r, 1500));
      await spawnQuestion(client, channel, session.gameId, guildId, supabase);
    }
  });

  console.log('🐻 [AkariMinigames] ระบบมินิเกม Component V2 (สไตล์บอทหลัก 100% + Anti-Cheat Guard) พร้อมใช้งานแล้ว!');
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

module.exports = {
  setupAkariMinigames,
  spawnQuestion,
  getTenantSettings,
  setTenantSettingsInCache,
  getTenantLeaderboard,
  invalidateLeaderboardCache,
  invalidateSettingsCache,
  flushAllTenantPoints,
  getBufferedPoints,
  clearBufferedPoints,
  bufferTenantPoints,
  flushTenantPoints,
  buildAkariGamePayload,
  buildAkariWinnerPayload,
  checkCrossChannelFeasibility,
  recordUserAction,
};
