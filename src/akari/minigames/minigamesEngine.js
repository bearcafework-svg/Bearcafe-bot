// ===================================================
// src/akari/minigames/minigamesEngine.js
// ระบบมินิเกม Multi-Tenant สำหรับ Akari Bot
// รองรับการทำงานแบบแยก Guild ID, Discord Components V2 (Container Type 17)
// สไตล์ข้อความและหัวเรื่องตรงตาม src/features/minigames/minigames.js
// ลด Supabase calls: เก็บ caching ใน memory และ flush คะแนน/settings เมื่อจำเป็น
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

// ─── ภาวะแวดล้อม / Config ───────────────────────────────────────────

const FLAG_V2 = MessageFlags.IsComponentsV2 || 32768;

// Session เป็น in-memory (ไม่พึ่ง DB)
const activeTenantSessions = new Map();
const processingChannels = new Set();
const ttsAudioCache = new Map();

// ─── In-Memory Settings / Leaderboard Cache (ลด Supabase Calls) ──────

const guildSettingsCache = new Map(); // guildId -> { gameId: { enabled, canvas_theme, points_per_win }, ... }
const guildLeaderboardCache = new Map(); // guildId -> [{ user_id, points, wins }, ... ]
const guildScoreBuffer = new Map(); // guildId:user_id -> { points_accumulated, wins_accumulated }

/**
 * ดึง settings ของ guild จาก cache (หรือ fetch จาก DB ครั้งแรก)
 */
async function getTenantSettings(supabase, guildId) {
  if (guildSettingsCache.has(guildId)) {
    return guildSettingsCache.get(guildId);
  }

  if (!supabase) {
    const defaults = {};
    for (let i = 1; i <= 12; i++) {
      defaults[i] = { enabled: true, canvas_theme: 'cyber', points_per_win: 10 };
    }
    guildSettingsCache.set(guildId, defaults);
    return defaults;
  }

  try {
    const { data, error } = await supabase
      .from('tenant_minigame_settings')
      .select('game_id, enabled, canvas_theme, points_per_win')
      .eq('guild_id', guildId);

    if (error) {
      console.warn(`[akari-minigames] fetch settings error for guild ${guildId}:`, error.message);
      const defaults = {};
      for (let i = 1; i <= 12; i++) {
        defaults[i] = { enabled: true, canvas_theme: 'cyber', points_per_win: 10 };
      }
      guildSettingsCache.set(guildId, defaults);
      return defaults;
    }

    const map = {};
    // กำหนดค่าเริ่มต้นเป็น enabled = true ครบทั้ง 12 เกมล่วงหน้า
    for (let i = 1; i <= 12; i++) {
      map[i] = { enabled: true, canvas_theme: 'cyber', points_per_win: 10 };
    }

    if (data && Array.isArray(data)) {
      for (const row of data) {
        map[row.game_id] = {
          enabled: row.enabled !== false,
          canvas_theme: row.canvas_theme || 'cyber',
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
      defaults[i] = { enabled: true, canvas_theme: 'cyber', points_per_win: 10 };
    }
    guildSettingsCache.set(guildId, defaults);
    return defaults;
  }
}

/**
 * อัปเดต settings ใน cache (เมื่อถูกเรียกจาก commands)
 */
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
 * ดึง leaderboard จาก cache (ถ้า cache ว่าง ค่อย fetch จาก DB)
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
 * เก็บคะแนนลง buffer ใน memory
 */
function bufferTenantPoints(guildId, userId, pointsToAdd = 10, winsToAdd = 1) {
  const key = `${guildId}:${userId}`;
  const existing = guildScoreBuffer.get(key) || { points_accumulated: 0, wins_accumulated: 0 };
  existing.points_accumulated += pointsToAdd;
  existing.wins_accumulated += winsToAdd;
  guildScoreBuffer.set(key, existing);
}

/**
 * Flush คะแนนที่สะสมใน memory ลง DB
 */
async function flushTenantPoints(supabase, guildId, userId, pointsToAdd = 10, winsToAdd = 1) {
  if (!supabase) return;

  const bufferKey = `${guildId}:${userId}`;
  const buffered = guildScoreBuffer.get(bufferKey) || { points_accumulated: 0, wins_accumulated: 0 };
  const totalPoints = pointsToAdd + buffered.points_accumulated;
  const totalWins = winsToAdd + buffered.wins_accumulated;

  try {
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

/**
 * Flush คะแนนทั้งหมดของ guild
 */
async function flushAllTenantPoints(supabase, guildId) {
  if (!supabase) return;
  const entries = [...guildScoreBuffer.entries()].filter(([key]) => key.startsWith(`${guildId}:`));
  for (const [key, value] of entries) {
    const [gid, uid] = key.split(':');
    await flushTenantPoints(supabase, gid, uid, value.points_accumulated, value.wins_accumulated);
  }
}

// ─── TTS ───────────────────────────────────────────────────────────────

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
    console.warn(`[akari-minigames] TTS Error for "${cacheKey}":`, err.message);
    return null;
  }
}

// ─── Component V2 Generator (โครงสร้างและสไตล์ตรงตาม minigames.js) ──────

/**
 * สร้าง Component V2 Payload สำหรับ Akari Bot ตามข้อกำหนดและสไตล์ minigames.js เป๊ะๆ
 */
function buildAkariGamePayload(gameId, questionData, rewardPoints = 10) {
  const accessoryButton = {
    type: 2,
    style: 5,
    label: `รางวัล +${rewardPoints} แต้ม`,
    emoji: { name: '🏮' },
    url: 'https://discord.com'
  };

  let contentText = '';
  let mediaItem = null;

  switch (gameId) {
    case 1: { // เติมคำศัพท์ไทย
      const categoryLabel = questionData.category || 'คำทั่วไป';
      contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ เกมเติมคำศัพท์ (ไทย) 𓂃 \`__\n` +
        `# \`${questionData.wordOrQuestion}\`\n` +
        `-# - หมวดหมู่: ${categoryLabel}`;
      break;
    }
    case 2: { // เติมคำศัพท์อังกฤษ
      const categoryLabel = questionData.category || 'คำทั่วไป';
      contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ เกมเติมคำศัพท์ (อังกฤษ) 𓂃 \`__\n` +
        `# \`${questionData.wordOrQuestion}\`\n` +
        `-# - หมวดหมู่: ${categoryLabel}`;
      break;
    }
    case 3: { // สุ่มโจทย์คณิตฯ
      const rawDiff = String(questionData.difficulty || '').toLowerCase();
      const diffLabel = (rawDiff === 'easy' || rawDiff === 'ง่าย') ? 'ง่าย' : (rawDiff === 'medium' || rawDiff === 'ปานกลาง') ? 'ปานกลาง' : 'ยาก';
      contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ สุ่มโจทย์คณิตฯ 𓂃 \`__\n\n` +
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

      contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ ทายคำจากคำใบ้ 𓂃 \`__\n` +
        `${hintsText}\n` +
        `-# - ระดับ: ${diffLabel}`;
      break;
    }
    case 5: { // ฟังเสียงแล้วพิมพ์ตอบ (อังกฤษ)
      contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ ฟังเสียงแล้วพิมพ์ตอบ (อังกฤษ) 𓂃 \`__\n` +
        `# 🔊 จงฟังไฟล์เสียงในข้อความด้านบน แล้วพิมพ์คำตอบภาษาอังกฤษให้ถูกต้อง`;
      mediaItem = null;
      break;
    }
    case 6: { // พิมพ์คำต่อไปนี้ (ไทย)
      contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ พิมพ์คำต่อไปนี้ (ไทย) 𓂃 \`__`;
      mediaItem = { media: { url: 'attachment://text_image.png' } };
      break;
    }
    case 7: { // พิมพ์คำต่อไปนี้ (อังกฤษ)
      contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ พิมพ์คำต่อไปนี้ (อังกฤษ) 𓂃 \`__`;
      mediaItem = { media: { url: 'attachment://text_image.png' } };
      break;
    }
    case 8: { // ทายคำแปลภาษาอังกฤษ
      contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ ทายคำแปลภาษาอังกฤษ 𓂃 \`__\n` +
        `# ${questionData.wordOrQuestion}`;
      break;
    }
    case 9: { // ทายคำแปลภาษาไทย
      contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ ทายคำแปลภาษาไทย 𓂃 \`__\n` +
        `# ${questionData.wordOrQuestion}`;
      break;
    }
    case 10: { // เกมต่อคำ
      contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ เกมต่อคำ 𓂃 \`__\n` +
        `# ${questionData.wordOrQuestion}`;
      break;
    }
    case 11: { // ฟังเสียงแล้วพิมพ์ตอบ (ไทย)
      contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ ฟังเสียงแล้วพิมพ์ตอบ (ไทย) 𓂃 \`__\n` +
        `# 🔊 จงฟังไฟล์เสียงในข้อความด้านบน แล้วพิมพ์คำตอบภาษาไทยให้ถูกต้อง`;
      mediaItem = null;
      break;
    }
    case 12: { // จริงหรือเท็จ
      contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ จริงหรือเท็จ 𓂃 \`__\n` +
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
      accessory: accessoryButton
    });
  } else {
    containerComponents.push({
      type: 9,
      components: [{ type: 10, content: contentText }],
      accessory: accessoryButton
    });
  }

  const leaderboardButton = {
    style: 1,
    type: 2,
    label: '🏆 ตารางคะแนน',
    custom_id: `akari_mg_top:${gameId}`
  };

  // Choice Buttons (สำหรับเกม 8, 9, 10, 12)
  if ([8, 9, 10, 12].includes(gameId) && Array.isArray(questionData.options) && questionData.options.length > 0) {
    containerComponents.push({ type: 14, spacing: 2 });
    let buttonComponents = [];

    if (gameId === 12) {
      buttonComponents = questionData.options.map((optionLabel, idx) => {
        const isTrueBtn = String(optionLabel).trim() === 'จริง';
        return {
          style: isTrueBtn ? 3 : 4,
          type: 2,
          label: optionLabel,
          custom_id: `akari_mg_opt_${gameId}_${idx}_${Date.now()}`
        };
      });
    } else {
      const choiceStyles = [1, 4, 3, 2];
      buttonComponents = questionData.options.map((optionLabel, idx) => ({
        style: choiceStyles[idx % choiceStyles.length],
        type: 2,
        label: optionLabel,
        custom_id: `akari_mg_opt_${gameId}_${idx}_${Date.now()}`
      }));
    }

    // ใส่ปุ่มตารางคะแนนต่อท้ายปุ่มช้อยส์ใน ActionRow เดียวกัน
    buttonComponents.push(leaderboardButton);

    containerComponents.push({
      type: 1,
      components: buttonComponents
    });
  } else {
    // สำหรับเกมแบบพิมพ์ตอบ (ไม่มีช้อยส์): ใส่ปุ่มตารางคะแนนแยกใต้การ์ด
    containerComponents.push({ type: 14, spacing: 2 });
    containerComponents.push({
      type: 1,
      components: [leaderboardButton]
    });
  }

  return {
    flags: FLAG_V2,
    components: [{
      type: 17,
      components: containerComponents
    }]
  };
}

/**
 * สร้าง Component V2 Payload สำหรับแสดงผลเมื่อมีผู้ชนะ (ตรงตาม minigames.js)
 */
function buildAkariWinnerPayload(gameId, questionData, winnerDisplayName, rewardPoints = 10) {
  const accessoryButton = {
    type: 2,
    style: 5,
    label: `รางวัล +${rewardPoints} แต้ม`,
    emoji: { name: '🏮' },
    url: 'https://discord.com'
  };

  const titleMap = {
    1: 'เกมเติมคำศัพท์ (ไทย)', 2: 'เกมเติมคำศัพท์ (อังกฤษ)', 3: 'สุ่มโจทย์คณิตฯ',
    4: 'ทายคำจากคำใบ้', 5: 'ฟังเสียงแล้วพิมพ์ตอบ (อังกฤษ)', 6: 'พิมพ์คำต่อไปนี้ (ไทย)',
    7: 'พิมพ์คำต่อไปนี้ (อังกฤษ)', 8: 'ทายคำแปลภาษาอังกฤษ', 9: 'ทายคำแปลภาษาไทย',
    10: 'เกมต่อคำ', 11: 'ฟังเสียงแล้วพิมพ์ตอบ (ไทย)', 12: 'จริงหรือเท็จ'
  };
  const titleText = titleMap[gameId] || `มินิเกม #${gameId}`;

  let contentText = '';
  if (gameId === 10) {
    contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ ${titleText} 𓂃 \`__\n` +
      `# ${questionData.wordOrQuestion || ''}${questionData.answer}`;
  } else if (gameId === 11 || gameId === 12) {
    contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ ${titleText} 𓂃 \`__\n` +
      `# ${questionData.wordOrQuestion || ''}\n` +
      `-# เฉลย: ${questionData.answer}`;
  } else {
    contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ ${titleText} 𓂃 \`__\n` +
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
          accessory: accessoryButton
        },
        { type: 14, spacing: 2 },
        {
          type: 1,
          components: [{
            style: 3,
            type: 2,
            label: `@${winnerDisplayName} ตอบถูก (+${rewardPoints} แต้ม)`,
            custom_id: `akari_mg_winner_disabled_${Date.now()}`,
            disabled: true
          }]
        }
      ]
    }]
  };
}

// ─── สปอว์นคำถาม ─────────────────────────────────────────────────────

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
  const questionObj = await getNextQuestion(supabase, gameId);
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

  const pointsPerWin = gameSettings.points_per_win || 10;

  const questionData = {
    wordOrQuestion,
    answer: rawAnswer,
    category: questionObj.category,
    difficulty: questionObj.difficulty,
    hints: questionObj.hints,
    options: questionObj.options,
    rewardPoints: pointsPerWin
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
          created_at: new Date().toISOString()
        },
        { onConflict: 'guild_id,channel_id' }
      );
    } catch (_) {}
  }

  return session;
}

async function restoreTenantChannelsOnStartup(client, supabase) {
  if (!supabase || !client) return;

  try {
    // 1. โหลด Active Sessions เดิมที่ค้างจาก DB เข้าสู่ RAM เงียบๆ (ไม่ส่งข้อความซ้ำ)
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

    // 2. ดึงรายการช่องมินิเกม หากช่องใดยังไม่มี Session (ช่องใหม่เพิ่งสร้าง) ให้สปอว์นโจทย์ข้อแรก
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

// ─── Setup ─────────────────────────────────────────────────────────────

function setupAkariMinigames(client, supabase) {
  // ── Restore Active Sessions / Spawn Questions on Startup ────────────────
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
  // ── Message handler: ตรวจคำตอบ ─────────────────────────────────
  client.on('messageCreate', async (message) => {
    if (!message.guild || message.author.bot) return;

    const guildId = message.guild.id;
    const sessionKey = `${guildId}:${message.channel.id}`;
    const session = activeTenantSessions.get(sessionKey);
    if (!session) return;

    const userText = message.content.trim().toLowerCase();
    if (!userText) return;

    if (userText === session.answer) {
      if (processingChannels.has(sessionKey)) return;
      processingChannels.add(sessionKey);

      try {
        await message.react('✅').catch(() => { });

        const pointsPerWin = session.questionData?.rewardPoints || 10;
        bufferTenantPoints(guildId, message.author.id, pointsPerWin, 1);

        const winnerPayload = buildAkariWinnerPayload(
          session.gameId,
          session.questionData,
          message.author.displayName || message.author.username,
          pointsPerWin
        );

        if (session.messageId) {
          const sentMsg = await message.channel.messages.fetch(session.messageId).catch(() => null);
          if (sentMsg && typeof sentMsg.edit === 'function') {
            await sentMsg.edit(winnerPayload).catch(() => { });
          }
        }

        activeTenantSessions.delete(sessionKey);
        await new Promise((r) => setTimeout(r, 2000));
        await spawnQuestion(client, message.channel, session.gameId, guildId, supabase);
        await flushTenantPoints(supabase, guildId, message.author.id, 0, 0);
      } finally {
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
        .setColor(0x38bdf8)
        .setDescription(desc)
        .setTimestamp()
        .setFooter({ text: 'อัปเดตแบบ Real-time | Akari Bot' });

      return safeRespond(interaction, { embeds: [embed], flags: MessageFlags.Ephemeral });
    }

    if (!session) {
      return safeRespond(interaction, {
        content: '⚠️ ไม่พบเซสชันมินิเกมที่กำลังเล่นอยู่ในช่องนี้',
        flags: MessageFlags.Ephemeral,
      });
    }

    // ── ปุ่ม/ช้อยส์เลือกคำตอบ (Option Buttons) ───────────────
    if (customId.startsWith('akari_mg_opt_')) {
      const parts = customId.split('_');
      const optIdx = parseInt(parts[3], 10);
      const selectedOption = session.questionData?.options?.[optIdx];

      if (selectedOption && String(selectedOption).trim().toLowerCase() === session.answer) {
        if (processingChannels.has(sessionKey)) return;
        processingChannels.add(sessionKey);

        try {
          const pointsPerWin = session.questionData?.rewardPoints || 10;
          bufferTenantPoints(guildId, user.id, pointsPerWin, 1);

          const winnerDisplayName = interaction.member?.displayName || user.username;
          const winnerPayload = buildAkariWinnerPayload(
            session.gameId,
            session.questionData,
            winnerDisplayName,
            pointsPerWin
          );

          await interaction.update(winnerPayload).catch(() => { });

          activeTenantSessions.delete(sessionKey);
          await new Promise((r) => setTimeout(r, 1500));
          await spawnQuestion(client, channel, session.gameId, guildId, supabase);
          await flushTenantPoints(supabase, guildId, user.id, 0, 0);
        } finally {
          processingChannels.delete(sessionKey);
        }
      } else {
        return safeRespond(interaction, {
          content: '❌ คำตอบยังไม่ถูกต้อง ลองคิดดูใหม่อีกครั้งนะ!',
          flags: MessageFlags.Ephemeral,
        });
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

  console.log('🏮 [AkariMinigames] ระบบมินิเกม Component V2 (สไตล์และรูปแบบเป๊ะๆ แบบ minigames.js) พร้อมใช้งานแล้ว!');
}

// ─── Utils สำหรับ commands ─────────────────────────────────────────────

function invalidateLeaderboardCache(guildId) {
  guildLeaderboardCache.delete(guildId);
}

function invalidateSettingsCache(guildId) {
  guildSettingsCache.delete(guildId);
}

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
};
