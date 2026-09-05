// src/bees/beeManager.js
// ระบบจัดการเจ้าผึ้ง: Supabase DB Config Sync, Auto Spawn, Interaction & Database Point Calculation

const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
const sharedSettings = require('../sharedSettings.json');
const { blacklistPayload, beeInfoPayload } = require('../features/shared/tarotComponents');
const {
  buildBeeSpawnPayload,
  buildBeeWinPayload,
  buildBeeLossPayload,
  buildBeePoisonLossPayload,
  buildBeeExpiredPayload,
  buildQueenBeeWinPayload,
  buildQueenBeeLossPayload,
  buildVampireDrainSelfPayload,
  buildVampireAwakenPayload,
  buildVampireTargetResultPayload,
  buildSpyBeeSpawnPayload,
  buildSpyBeeRewardPayload,
  buildSpyBeeQuestResultPayload,
  buildSpyBeeAllGonePayload,
  buildMathBeeSpawnPayload,
  buildMathBeeWinPayload
} = require('./beePayloads');

const logger = require('../../utils/logger');

// ─── Level Role Cap Helper: คำนวณเพดานแต้มสูงสุดตาม 12 Level Roles ─────────────
let checkInCfg = null;
try {
  checkInCfg = require('../points/settingCheckIn.json');
} catch (e) {
  checkInCfg = null;
}

function getMaxPoints(member) {
  let maxPoints = checkInCfg?.DEFAULT_CAP || 750;
  if (!member || !member.roles || !member.roles.cache) return maxPoints;
  for (const [roleId, cap] of Object.entries(checkInCfg?.ROLE_CAPS || {})) {
    if (member.roles.cache.has(roleId)) {
      if (cap > maxPoints) maxPoints = cap;
    }
  }
  return maxPoints;
}

const SETTING_PATH = path.join(__dirname, 'settingBee.json');
const FLAG_EPHEMERAL = 64; // MessageFlags.Ephemeral

// ─── Active Sessions Store (in-memory) ────────────────────────────────────────
const activeSessions = new Map();
let autoSpawnTimer = null;
let supabaseClient = null;

// Helper: ดึง/สร้าง Supabase Client
function getSupabase() {
  if (!supabaseClient && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }
  return supabaseClient;
}

// ─── DB Helpers: Active Bee Session Storage (minigame_active_sessions) ─────────
async function saveActiveBeeSession(channelId, messageId, customId, beeConfig, gardenUrl, expiresAt) {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    await supabase.from('minigame_active_sessions').upsert({
      channel_id: `bee_${channelId}`,
      game_id: 999,
      message_id: messageId,
      current_question: { customId, beeConfig, gardenUrl, expiresAt },
      updated_at: new Date().toISOString()
    }, { onConflict: 'channel_id' });
  } catch (err) {
    console.error('[bees] saveActiveBeeSession error:', err.message);
  }
}

async function getActiveBeeSession(channelId) {
  const supabase = getSupabase();
  if (!supabase) return null;
  try {
    const { data, error } = await supabase
      .from('minigame_active_sessions')
      .select('*')
      .eq('channel_id', `bee_${channelId}`)
      .single();
    if (error || !data) return null;
    return data;
  } catch (err) {
    return null;
  }
}

async function clearActiveBeeSession(channelId) {
  const supabase = getSupabase();
  if (!supabase) return;
  try {
    await supabase
      .from('minigame_active_sessions')
      .delete()
      .eq('channel_id', `bee_${channelId}`);
  } catch (err) {
    console.error('[bees] clearActiveBeeSession error:', err.message);
  }
}

async function checkAndCleanExpiredBees(client) {
  const supabase = getSupabase();
  if (!supabase) return;

  try {
    const { data, error } = await supabase
      .from('minigame_active_sessions')
      .select('*')
      .eq('game_id', 999);

    if (error || !data || data.length === 0) return;

    const now = Date.now();
    for (const session of data) {
      const qData = session.current_question || {};
      const expiresAt = qData.expiresAt || 0;
      if (now >= expiresAt) {
        const channelId = session.channel_id.replace(/^bee_/, '');
        const messageId = session.message_id;

        await clearActiveBeeSession(channelId);

        try {
          const channel = client.channels.cache.get(channelId) || await client.channels.fetch(channelId).catch(() => null);
          if (channel) {
            const msg = await channel.messages.fetch(messageId).catch(() => null);
            if (msg) {
              const expiredPayload = buildBeeExpiredPayload(qData.beeConfig, qData.gardenUrl);
              await msg.edit(expiredPayload);
              logger.bee(`Bee message ${messageId} expired after 15 mins and updated in channel ${channelId}`);
            }
          }
        } catch (err) {
          console.warn('[bees] Failed to edit expired bee message:', err.message);
        }
      }
    }
  } catch (err) {
    console.error('[bees] checkAndCleanExpiredBees error:', err.message);
  }
}

// Helper: ดึงการตั้งค่าระบบผึ้งจาก JSON โดยตรง
function getSettingBee() {
  try {
    const raw = fs.readFileSync(SETTING_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return require('./settingBee.json');
  }
}

// ─── Helper: ดึงการตั้งค่าระบบผึ้ง (Supabase Primary + Local JSON Fallback) ───
async function fetchBeeSystemConfig() {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data: sysData, error: sysErr } = await supabase
        .from('bee_system_settings')
        .select('*')
        .eq('id', 1)
        .maybeSingle();

      const { data: beeRows, error: beeErr } = await supabase
        .from('bee_configs')
        .select('*')
        .order('sequence_order', { ascending: true });

      if (!sysErr && sysData && !beeErr && beeRows && beeRows.length > 0) {
        return {
          channel_id: sysData.channel_id,
          auto_spawn_enabled: sysData.auto_spawn_enabled,
          min_spawn_minutes: sysData.min_spawn_minutes,
          max_spawn_minutes: sysData.max_spawn_minutes,
          spawn_mode: sysData.spawn_mode,
          garden_background_url: sysData.garden_background_url,
          bees: beeRows
        };
      }
    } catch (err) {
      console.warn('[bees] fetchBeeSystemConfig from Supabase failed, using local settingBee.json:', err.message);
    }
  }

  const local = getSettingBee();
  return {
    channel_id: local.channel_id || '1524123413122125964',
    auto_spawn_enabled: local.auto_spawn_enabled ?? false,
    min_spawn_minutes: local.min_spawn_minutes || 5,
    max_spawn_minutes: local.max_spawn_minutes || 10,
    spawn_mode: local.spawn_mode || 'weighted_random',
    garden_background_url: local.garden_background_url || 'https://cdn.discordapp.com/attachments/1528780402544611348/1528780439836430487/Garden.png',
    bees: local.bees || []
  };
}

// ─── Helper: Random Integer ───────────────────────────────────────────────────
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Math Bee: Cooldown Store (userId -> timestamp) ───────────────────────────
const userMathCooldowns = new Map();

// ─── Math Problem Generator for Math Bee (อาจารย์บีเรขา) ──────────────────────
function generateMathProblem() {
  const tiers = [
    { tier: 1, name: 'หลักหน่วย', points: 15 },
    { tier: 2, name: 'หลักสิบ', points: 30 },
    { tier: 3, name: 'หลักร้อย', points: 50 }
  ];

  const selectedTier = tiers[randInt(0, tiers.length - 1)];
  let num1, num2, op, questionText, correctAnswer;

  if (selectedTier.tier === 1) {
    // หลักหน่วย (15 แต้ม): บวก, ลบ, คูณเลข 1 หลัก
    const ops = ['+', '-', '×'];
    op = ops[randInt(0, ops.length - 1)];

    if (op === '+') {
      num1 = randInt(1, 9);
      num2 = randInt(1, 9);
      correctAnswer = num1 + num2;
    } else if (op === '-') {
      num1 = randInt(2, 10);
      num2 = randInt(1, num1); // ผลลัพธ์ >= 0
      correctAnswer = num1 - num2;
    } else {
      num1 = randInt(2, 9);
      num2 = randInt(2, 9);
      correctAnswer = num1 * num2;
    }
  } else if (selectedTier.tier === 2) {
    // หลักสิบ (30 แต้ม): บวก, ลบ เลข 2 หลัก หรือคูณแม่ 2-12
    const ops = ['+', '-', '×'];
    op = ops[randInt(0, ops.length - 1)];

    if (op === '+') {
      num1 = randInt(10, 80);
      num2 = randInt(10, 80);
      correctAnswer = num1 + num2;
    } else if (op === '-') {
      num1 = randInt(20, 99);
      num2 = randInt(10, num1);
      correctAnswer = num1 - num2;
    } else {
      num1 = randInt(10, 15);
      num2 = randInt(2, 9);
      correctAnswer = num1 * num2;
    }
  } else {
    // หลักร้อย (50 แต้ม): บวก, ลบ เลข 2-3 หลัก
    const ops = ['+', '-'];
    op = ops[randInt(0, ops.length - 1)];

    if (op === '+') {
      num1 = randInt(100, 500);
      num2 = randInt(50, 450);
      correctAnswer = num1 + num2;
    } else {
      num1 = randInt(200, 900);
      num2 = randInt(100, num1);
      correctAnswer = num1 - num2;
    }
  }

  questionText = `${num1} ${op} ${num2} = ?`;

  // สร้างช้อยส์หลอก 2 ตัวเลือก
  const wrongAnswers = new Set();
  const offsets = [-10, -5, -3, -2, -1, 1, 2, 3, 5, 10, 4, -4];
  for (let i = offsets.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [offsets[i], offsets[j]] = [offsets[j], offsets[i]];
  }

  for (const offset of offsets) {
    const candidate = correctAnswer + offset;
    if (candidate !== correctAnswer && candidate >= 0 && !wrongAnswers.has(candidate)) {
      wrongAnswers.add(candidate);
      if (wrongAnswers.size >= 2) break;
    }
  }

  while (wrongAnswers.size < 2) {
    const candidate = correctAnswer + (wrongAnswers.size + 1) * (Math.random() < 0.5 ? 1 : -1) + 2;
    if (candidate !== correctAnswer && candidate >= 0) {
      wrongAnswers.add(candidate);
    }
  }

  const rawChoices = [
    { label: String(correctAnswer), value: correctAnswer, isCorrect: true },
    ...Array.from(wrongAnswers).map((wa) => ({ label: String(wa), value: wa, isCorrect: false }))
  ];

  // สับเปลี่ยนตำแหน่ง (Fisher-Yates Shuffle)
  for (let i = rawChoices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [rawChoices[i], rawChoices[j]] = [rawChoices[j], rawChoices[i]];
  }

  return {
    tier: selectedTier.tier,
    tierName: selectedTier.name,
    rewardPoints: selectedTier.points,
    questionText,
    correctAnswer,
    choices: rawChoices
  };
}

// ─── DB Helper: ดึงแต้มปัจจุบันของผู้ใช้ ──────────────────────────────────────
async function getUserPoints(userId) {
  const supabase = getSupabase();
  if (!supabase) return 0;
  try {
    const { data, error } = await supabase
      .from('user_points')
      .select('points')
      .eq('discord_id', userId)
      .single();
    if (error) return 0;
    return data?.points ?? 0;
  } catch (e) {
    console.error('[bees] getUserPoints error:', e.message);
    return 0;
  }
}

// ─── DB Helper: อัปเดตแต้มของผู้ใช้ ───────────────────────────────────────────
async function updateUserPoints(userId, delta) {
  const supabase = getSupabase();
  if (!supabase) return 0;
  try {
    const { data, error } = await supabase.rpc('add_tarot_points', {
      p_discord_id: userId,
      p_points_delta: delta,
      p_tarot_delta: 0
    });
    if (error) {
      console.warn('[bees] RPC add_tarot_points failed, using upsert fallback:', error.message);
      const current = await getUserPoints(userId);
      const newPoints = current + delta;
      await supabase.from('user_points').upsert(
        { discord_id: userId, points: newPoints },
        { onConflict: 'discord_id' }
      );
      return newPoints;
    }
    return data?.[0]?.new_points ?? 0;
  } catch (e) {
    console.error('[bees] updateUserPoints error:', e.message);
    return 0;
  }
}

// ─── DB Helper: กำหนดแต้มโดยตรงของผู้ใช้ (ใช้สำหรับริบแต้มหมดตัว หรือ Cap แต้ม) ───
async function setUserPoints(userId, targetPoints) {
  const supabase = getSupabase();
  if (!supabase) return targetPoints;
  try {
    await supabase.from('user_points').upsert(
      { discord_id: userId, points: targetPoints },
      { onConflict: 'discord_id' }
    );
    return targetPoints;
  } catch (e) {
    console.error('[bees] setUserPoints error:', e.message);
    return targetPoints;
  }
}

// ─── DB Helper: เพิ่มแต้มพร้อมตรวจสอบเพดานแต้ม (Point Cap) ────────────────────
async function addPointsWithCap(userId, delta, member = null) {
  const maxPoints = getMaxPoints(member);
  const currentPoints = await getUserPoints(userId);
  let newPoints = currentPoints + delta;
  let capped = false;
  if (newPoints > maxPoints) {
    newPoints = maxPoints;
    capped = true;
  }
  await setUserPoints(userId, newPoints);
  return { newPoints, capped, maxPoints };
}

// ─── Helper: เลือกว่าจะส่งผึ้งตัวไหน ──────────────────────────────────────────
function selectBeeToSpawn(setting, requestedBeeId = null) {
  const allBees = setting.bees || [];
  if (allBees.length === 0) return null;

  // หากมีการระบุผึ้งตัวเฉพาะมา (เช่น สั่ง Test Spawn) ให้ส่งตัวนั้นได้ทันทีแม้ปิดอยู่
  if (requestedBeeId) {
    const cleanId = String(requestedBeeId).trim().toLowerCase();
    const found = allBees.find(
      (b) =>
        b.id.toLowerCase() === cleanId ||
        b.name.toLowerCase() === cleanId ||
        String(b.sequence_order) === cleanId ||
        cleanId === `ผึ้ง${b.sequence_order}` ||
        cleanId === `bee${b.sequence_order}`
    );
    if (found) return found;
  }

  const enabledBees = allBees.filter((b) => b.enabled);
  if (enabledBees.length === 0) return allBees[0];

  // 1. โหมด Sequence
  if (setting.spawn_mode === 'sequence') {
    let index = (setting.last_spawn_index || 0) % enabledBees.length;
    const selected = enabledBees[index];
    setting.last_spawn_index = (index + 1) % enabledBees.length;
    return selected;
  }

  // 2. โหมด Weighted Random
  const totalWeight = enabledBees.reduce((acc, b) => acc + (b.spawn_weight || 1), 0);
  let randomWeight = Math.random() * totalWeight;

  for (const bee of enabledBees) {
    randomWeight -= bee.spawn_weight || 1;
    if (randomWeight <= 0) return bee;
  }

  return enabledBees[0];
}

// ─── Function: ปล่อยผึ้งออกสู่ Channel ────────────────────────────────────────
async function spawnBee(client, beeId = null, targetChannelId = null) {
  try {
    // ล้างผึ้งเก่าที่หมดอายุ 15 นาที
    await checkAndCleanExpiredBees(client);

    const config = await fetchBeeSystemConfig();
    const channelId = targetChannelId || config.channel_id || '1524124134387224828';

    // ลองดึงจาก cache ก่อน หากไม่มีให้ fetch จาก Discord API
    const channel = client.channels.cache.get(channelId) ||
                    await client.channels.fetch(channelId).catch((fetchErr) => {
                      console.error(`[bees] Failed to fetch channel ${channelId}:`, fetchErr.message);
                      return null;
                    });

    if (!channel) {
      console.error(`[bees] Channel ID ${channelId} not found in client cache or API fetch.`);
      return null;
    }

    const selectedBee = selectBeeToSpawn(config, beeId);
    if (!selectedBee) {
      console.warn('[bees] No bees available to spawn.');
      return null;
    }

    selectedBee.garden_background_url = config.garden_background_url;
    const isSpyBee = selectedBee.id === 'spy_bee';
    const isMathBee = selectedBee.id === 'math_bee';

    let customId = `bee_click_${Date.now()}_${randInt(1000, 9999)}`;
    if (isSpyBee) {
      customId = `bee_spy_${Date.now()}_${randInt(1000, 9999)}`;
    } else if (isMathBee) {
      customId = `bee_math_${Date.now()}_${randInt(1000, 9999)}`;
    }
    const expiresAt = Date.now() + 15 * 60 * 1000; // หมดอายุภายใน 15 นาที

    // 1. ส่ง Component v2 อันที่ 1 (ปุ่ม disabled "กำลังโหลดผึ้ง . . ." หรือ "Waiting . . .")
    let mathData = null;
    let spawnPayload = null;
    if (isSpyBee) {
      spawnPayload = buildSpyBeeSpawnPayload(selectedBee, customId, [true, true, true], false, config.garden_background_url);
    } else if (isMathBee) {
      mathData = generateMathProblem();
      spawnPayload = buildMathBeeSpawnPayload(selectedBee, mathData, customId, false, config.garden_background_url);
    } else {
      spawnPayload = buildBeeSpawnPayload(selectedBee, customId, false, config.garden_background_url);
    }
    const message = await channel.send(spawnPayload);

    // บันทึกลง Supabase DB (minigame_active_sessions)
    await saveActiveBeeSession(channelId, message.id, customId, selectedBee, config.garden_background_url, expiresAt);

    // เก็บสถานะ Session (in-memory)
    const sessionData = {
      messageId: message.id,
      customId,
      beeConfig: selectedBee,
      gardenUrl: config.garden_background_url,
      claimed: false,
      isReady: false,
      expiresAt,
      // Spy Bee specific:
      starsState: [true, true, true],
      claimedUsers: new Set(),
      claimedCount: 0,
      // Math Bee specific:
      mathData
    };
    activeSessions.set(customId, sessionData);

    // 2. รอ 6 วินาที (ตาม BDFD replyIn[6s]) แล้วแก้ไขเฉพาะปุ่มให้เป็น active
    const delayMs = selectedBee.button_delay_ms || 6000;
    setTimeout(async () => {
      try {
        const session = activeSessions.get(customId);
        if (session && !session.claimed && (!isSpyBee || session.claimedCount < 3)) {
          session.isReady = true;
          let activePayload = null;
          if (isSpyBee) {
            activePayload = buildSpyBeeSpawnPayload(selectedBee, customId, session.starsState, true, config.garden_background_url);
          } else if (isMathBee) {
            activePayload = buildMathBeeSpawnPayload(selectedBee, session.mathData, customId, true, config.garden_background_url);
          } else {
            activePayload = buildBeeSpawnPayload(selectedBee, customId, true, config.garden_background_url);
          }
          await message.edit(activePayload);
        }
      } catch (err) {
        console.error('[bees] Failed to update button after delay:', err.message);
      }
    }, delayMs);

    logger.bee(`Spawned "${selectedBee.name}" in channel <#${channelId}> (custom_id: ${customId})`);
    return message;
  } catch (err) {
    logger.error('BEES', `spawnBee error: ${err.message}`);
    return null;
  }
}

// ─── Function: Auto Spawn Scheduler Loop ──────────────────────────────────────
async function scheduleNextAutoSpawn(client) {
  if (autoSpawnTimer) {
    clearTimeout(autoSpawnTimer);
    autoSpawnTimer = null;
  }

  // เช็กและล้างผึ้งที่หมดอายุ 15 นาที
  await checkAndCleanExpiredBees(client);

  const config = await fetchBeeSystemConfig();
  if (!config.auto_spawn_enabled) {
    logger.bee('Auto spawn is currently disabled in Supabase config.');
    return;
  }

  const minMin = config.min_spawn_minutes || 5;
  const maxMin = config.max_spawn_minutes || 10;
  const randomMinutes = Math.random() * (maxMin - minMin) + minMin;
  const delayMs = Math.floor(randomMinutes * 60 * 1000);

  logger.bee(`Next auto spawn scheduled in ${randomMinutes.toFixed(1)} minutes.`);

  autoSpawnTimer = setTimeout(async () => {
    await spawnBee(client);
    await scheduleNextAutoSpawn(client);
  }, delayMs);
}

// ─── Function: Handle Interaction ────────────────────────────────────────────
async function handleBeeInteraction(interaction, client, supabase) {
  if (!interaction.isButton()) return;

  // 1. ปุ่ม "ผึ้งคืออะไร"
  if (interaction.customId === 'bee_info') {
    return interaction.reply(beeInfoPayload());
  }

  // ปุ่ม "คลิกไม่ได้แล้ว" (สำหรับผึ้งบินกลับรังไปแล้ว)
  if (interaction.customId === 'bee_expired_disabled') {
    return interaction.reply({
      content: '## 🐝︲ปุ่มนี้ไม่สามารถคลิกได้แล้วค่ะ เนื่องจากผึ้งบินกลับรังไปแล้ว 𓂃',
      flags: FLAG_EPHEMERAL
    });
  }

  // 2. ปุ่มของ เจ้าผึ้งสายลับ (spy_bee)
  if (interaction.customId.startsWith('bee_spy_')) {
    if (interaction.customId.endsWith('_waiting')) {
      return interaction.reply({
        content: '## ⏳︲กรุณารอสักครู่ กำลังเตรียมความพร้อมของดวงดาว . . . 𓂃',
        flags: FLAG_EPHEMERAL
      });
    }

    const lastUnderscore = interaction.customId.lastIndexOf('_');
    const parentCustomId = interaction.customId.substring(0, lastUnderscore);
    const starIdx = parseInt(interaction.customId.substring(lastUnderscore + 1), 10);

    // ตรวจสอบ role_blacklist
    const memberRoles = interaction.member?.roles;
    const isBlacklisted = sharedSettings.role_blacklist.some((id) =>
      memberRoles?.cache ? memberRoles.cache.has(id) : (Array.isArray(memberRoles) ? memberRoles.includes(id) : false)
    );
    if (isBlacklisted) {
      return interaction.reply(blacklistPayload(interaction.user.id));
    }

    // ดึงข้อมูล Session จาก Memory หรือ Supabase DB
    let session = activeSessions.get(parentCustomId);
    if (!session) {
      const dbSession = await getActiveBeeSession(interaction.channelId);
      if (dbSession && dbSession.current_question?.customId === parentCustomId) {
        const qData = dbSession.current_question;
        session = {
          messageId: dbSession.message_id,
          customId: parentCustomId,
          beeConfig: qData.beeConfig,
          gardenUrl: qData.gardenUrl,
          claimed: false,
          isReady: true,
          expiresAt: qData.expiresAt,
          starsState: qData.starsState || [true, true, true],
          claimedUsers: new Set(qData.claimedUsers || []),
          claimedCount: qData.claimedCount || 0
        };
        activeSessions.set(parentCustomId, session);
      }
    }

    const now = Date.now();

    // เช็กว่าหมดอายุ 15 นาทีหรือยัง
    if (session && session.expiresAt && now >= session.expiresAt) {
      activeSessions.delete(parentCustomId);
      await clearActiveBeeSession(interaction.channelId);
      try {
        const expiredPayload = buildBeeExpiredPayload(session.beeConfig, session.gardenUrl);
        await interaction.message.edit(expiredPayload);
      } catch (err) { }
      return interaction.reply({
        content: '## 🐝︲เจ้าผึ้งตัวนี้บินกลับรังไปแล้วค่ะ! เนื่องจากไม่มีการตอบสนองภายใน 15 นาที 𓂃',
        flags: FLAG_EPHEMERAL
      });
    }

    // หากไม่พบ session หรือดาวหมดแล้ว
    if (!session || (session.starsState && session.starsState.every((s) => !s))) {
      return interaction.reply({
        content: '## ⭐︲ดาวของเจ้าผึ้งรอบนี้ถูกเก็บไปหมดแล้วค่ะ! รอสุ่มรอบถัดไปน้า 𓂃',
        flags: FLAG_EPHEMERAL
      });
    }

    const userId = interaction.user.id;

    // เช็กกันความโลภ (1 คนเก็บได้ 1 ดวงต่อการสปอว์น 1 รอบ)
    if (session.claimedUsers && session.claimedUsers.has(userId)) {
      return interaction.reply({
        content: `## <:bear7:1148271118709436416>︲<@${userId}> นี่ เธอเก็บดาวไปแล้วนะ แบ่งคนอื่นบ้างสิ!`,
        flags: FLAG_EPHEMERAL
      });
    }

    // เช็กว่าดาวดวงนี้ถูกเก็บไปหรือยัง
    if (!session.starsState || session.starsState[starIdx] === false) {
      return interaction.reply({
        content: '## ⭐︲ดาวดวงนี้มีคนเก็บไปแล้วค่ะ! ลองกดดวงอื่นดูน้า 𓂃',
        flags: FLAG_EPHEMERAL
      });
    }

    // เคลมดาว
    session.starsState[starIdx] = false;
    session.claimedUsers.add(userId);
    session.claimedCount = (session.claimedCount || 0) + 1;

    // Defer update ก่อน
    await interaction.deferUpdate().catch(() => {});

    // อัปเดตข้อความสปอว์นผึ้งให้ดาวดวงนั้นกลายเป็น disabled line
    const isAllClaimed = session.claimedCount >= 3 || session.starsState.every((s) => !s);
    if (!isAllClaimed) {
      try {
        const updatedSpawnPayload = buildSpyBeeSpawnPayload(
          session.beeConfig,
          parentCustomId,
          session.starsState,
          true,
          session.gardenUrl
        );
        await interaction.message.edit(updatedSpawnPayload);
      } catch (err) {
        console.warn('[bees] Failed to update spy bee message:', err.message);
      }
    }

    // สุ่ม 1 ใน 4 รางวัล (25% ต่อรางวัล)
    const rewardChoice = randInt(1, 4);
    let member = interaction.member;
    if ((!member || !member.roles || !member.roles.cache) && interaction.guild) {
      member = await interaction.guild.members.fetch(userId).catch(() => member);
    }

    let rewardPayload = null;

    if (rewardChoice === 1) {
      // 1: +point (50, 100, 150, 200, 250)
      const possiblePoints = [50, 100, 150, 200, 250];
      const pts = possiblePoints[randInt(0, possiblePoints.length - 1)];
      await addPointsWithCap(userId, pts, member);
      rewardPayload = buildSpyBeeRewardPayload(session.beeConfig, userId, '+point', { amount: pts }, session.gardenUrl);
    } else if (rewardChoice === 2) {
      // 2: -point (50, 100, 150, 200, 250)
      const possibleLoss = [50, 100, 150, 200, 250];
      const pts = possibleLoss[randInt(0, possibleLoss.length - 1)];
      await updateUserPoints(userId, -pts);
      rewardPayload = buildSpyBeeRewardPayload(session.beeConfig, userId, '-point', { amount: pts }, session.gardenUrl);
    } else if (rewardChoice === 3) {
      // 3: meme
      const memeImages = session.beeConfig.meme_images || [
        "https://cdn.discordapp.com/attachments/1144675871798591569/1412720722979323984/494310493c0f9fb57e7c0b3e4f0859db.png",
        "https://cdn.discordapp.com/attachments/1144675871798591569/1412720723352354857/15579c0f681b2174e6e9bdd5889ce4d1.png",
        "https://cdn.discordapp.com/attachments/1144675871798591569/1412720723759468566/0b8fb571ea34ec78c005a4c001ae4b03.png",
        "https://media.discordapp.net/attachments/1144675871798591569/1412720724136824863/6abe7835c79e84870df04ee72e7f6ec5.png",
        "https://cdn.discordapp.com/attachments/1144675871798591569/1412720724535279676/8bcbc04f4e99f273ab394bed06b0f4ee.png",
        "https://cdn.discordapp.com/attachments/1144675871798591569/1484563528441532537/90698fb1befa5eb8dc6499da24b44090.jpg",
        "https://media.discordapp.net/attachments/1144675871798591569/1484563529141850253/c289ce3819690c15219653ef7b619b69.jpg",
        "https://media.discordapp.net/attachments/1144675871798591569/1484563529716600882/bb2ef75f7e02c07dc38f099248327f9f.jpg"
      ];
      const memeUrl = memeImages[randInt(0, memeImages.length - 1)];
      rewardPayload = buildSpyBeeRewardPayload(session.beeConfig, userId, 'meme', { memeUrl }, session.gardenUrl);
    } else {
      // 4: role
      const questRoleId = session.beeConfig.quest_ticket_role_id || '1412721168611545138';
      try {
        if (member?.roles) {
          await member.roles.add(questRoleId);
        }
      } catch (err) {
        console.error('[bees] Failed to grant quest ticket role:', err.message);
      }
      rewardPayload = buildSpyBeeRewardPayload(session.beeConfig, userId, 'role', {}, session.gardenUrl);
    }

    // ส่งข้อความผลลัพธ์ในช่องแชท และตั้งเวลาลบหลัง 20 วินาที
    if (rewardPayload) {
      const rewardMsg = await interaction.channel.send(rewardPayload).catch(() => null);
      if (rewardMsg) {
        setTimeout(async () => {
          try {
            await rewardMsg.delete().catch(() => {});
          } catch (e) {}
        }, 20000);
      }
    }

    // หากดาวถูกเก็บครบทั้ง 3 ดวงแล้ว
    if (isAllClaimed) {
      activeSessions.delete(parentCustomId);
      await clearActiveBeeSession(interaction.channelId);

      // ลบข้อความสปอว์นเดิม
      try {
        await interaction.message.delete().catch(() => {});
      } catch (e) {}

      // รอ 3 วินาทีก่อนส่งข้อความดาวหมด (ตาม BDFD replyIn[3s])
      setTimeout(async () => {
        try {
          const allGonePayload = buildSpyBeeAllGonePayload(session.beeConfig, session.gardenUrl);
          await interaction.channel.send(allGonePayload);
        } catch (err) {
          console.error('[bees] Failed to send spy bee all-gone message:', err.message);
        }
      }, 3000);
    }

    return;
  }

  // 3. ปุ่มช้อยส์คำตอบของ อาจารย์บีเรขา (math_bee)
  if (interaction.customId.startsWith('bee_math_')) {
    if (interaction.customId.endsWith('_waiting')) {
      return interaction.reply({
        content: '## ⏳︲กรุณารอสักครู่ กำลังเตรียมความพร้อมของโจทย์ . . . 𓂃',
        flags: FLAG_EPHEMERAL
      });
    }

    const lastUnderscore = interaction.customId.lastIndexOf('_');
    const parentCustomId = interaction.customId.substring(0, lastUnderscore);
    const choiceIdx = parseInt(interaction.customId.substring(lastUnderscore + 1), 10);

    // ตรวจสอบ role_blacklist
    const memberRoles = interaction.member?.roles;
    const isBlacklisted = sharedSettings.role_blacklist.some((id) =>
      memberRoles?.cache ? memberRoles.cache.has(id) : (Array.isArray(memberRoles) ? memberRoles.includes(id) : false)
    );
    if (isBlacklisted) {
      return interaction.reply(blacklistPayload(interaction.user.id));
    }

    // ดึงข้อมูล Session จาก Memory หรือ Supabase DB
    let session = activeSessions.get(parentCustomId);
    if (!session) {
      const dbSession = await getActiveBeeSession(interaction.channelId);
      if (dbSession && dbSession.current_question?.customId === parentCustomId) {
        const qData = dbSession.current_question;
        session = {
          messageId: dbSession.message_id,
          customId: parentCustomId,
          beeConfig: qData.beeConfig,
          gardenUrl: qData.gardenUrl,
          claimed: false,
          isReady: true,
          expiresAt: qData.expiresAt,
          mathData: qData.mathData
        };
        activeSessions.set(parentCustomId, session);
      }
    }

    const now = Date.now();

    // เช็กว่าหมดอายุ 15 นาทีหรือยัง
    if (session && session.expiresAt && now >= session.expiresAt) {
      activeSessions.delete(parentCustomId);
      await clearActiveBeeSession(interaction.channelId);
      try {
        const expiredPayload = buildBeeExpiredPayload(session.beeConfig, session.gardenUrl);
        await interaction.message.edit(expiredPayload);
      } catch (err) { }
      return interaction.reply({
        content: '## 🐝︲เจ้าผึ้งตัวนี้บินกลับรังไปแล้วค่ะ! เนื่องจากไม่มีการตอบสนองภายใน 15 นาที 𓂃',
        flags: FLAG_EPHEMERAL
      });
    }

    // หากไม่พบ session หรือมีคนตอบถูกไปแล้ว
    if (!session || session.claimed) {
      return interaction.reply({
        content: '## 🐝︲ข้อนี้มีคนตอบถูกไปแล้วค่ะ! รอสุ่มรอบถัดไปน้า 𓂃',
        flags: FLAG_EPHEMERAL
      });
    }

    const mathData = session.mathData;
    const selectedChoice = mathData?.choices?.[choiceIdx];
    if (!selectedChoice) {
      return interaction.reply({
        content: '## ⚠️︲ไม่พบตัวเลือกคำตอบนี้ค่ะ',
        flags: FLAG_EPHEMERAL
      });
    }

    const userId = interaction.user.id;

    // ─── กรณีตอบผิด (Wrong Choice) ───
    if (!selectedChoice.isCorrect) {
      // ตรวจสอบ Cooldown 7 วินาทีรายบุคคล
      const userCd = userMathCooldowns.get(userId);
      if (userCd && now < userCd) {
        return interaction.reply({
          content: '## <a:bearg11:1396016056035840140>︲ค่อย ๆ ตอบนะคะคนเก่ง...',
          flags: FLAG_EPHEMERAL
        });
      }

      // บันทึก Cooldown 7 วินาที
      userMathCooldowns.set(userId, now + 7000);

      // ตอบรับ Interaction ทันทีเพื่อป้องกัน Timeout 3 วินาที
      await interaction.deferUpdate().catch(() => {});

      // สุ่มหักแต้ม -10 ถึง -50 แต้ม
      const lossPoints = randInt(10, 50);
      await updateUserPoints(userId, -lossPoints);

      // ส่งข้อความแจ้งเตือนในช่องแชท
      const iconStr = '<:strawbear:1280194407014076447>';
      const wrongMsg = await interaction.channel.send({
        content: `## <:bear8:1148271114288644116>︲<@${userId}> ตอบผิดจ้า หักแต้ม ${iconStr} **-${lossPoints}**`
      }).catch(() => null);

      // ลบข้อความแจ้งเตือนตอบผิดหลังจาก 5 วินาที
      if (wrongMsg) {
        setTimeout(async () => {
          try {
            await wrongMsg.delete().catch(() => {});
          } catch (e) {}
        }, 5000);
      }

      return;
    }

    // ─── กรณีตอบถูก (Correct Choice) ───
    session.claimed = true;
    activeSessions.delete(parentCustomId);
    await clearActiveBeeSession(interaction.channelId);

    // ตอบรับ Interaction ทันที
    await interaction.deferUpdate().catch(() => {});

    // ลบข้อความคำถามเดิมทันที (จบรอบ)
    try {
      await interaction.message.delete().catch(() => {});
    } catch (e) {}

    // คำนวณแต้มรางวัลตาม Tier พร้อม Point Cap
    let member = interaction.member;
    if ((!member || !member.roles || !member.roles.cache) && interaction.guild) {
      member = await interaction.guild.members.fetch(userId).catch(() => member);
    }

    const rewardPoints = mathData.rewardPoints || 15;
    const capResult = await addPointsWithCap(userId, rewardPoints, member);
    mathData.capped = capResult.capped;
    mathData.maxPoints = capResult.maxPoints;

    // ส่ง Win Payload Component v2 ฉลองชัยชนะ
    const winPayload = buildMathBeeWinPayload(session.beeConfig, userId, mathData, session.gardenUrl);
    await interaction.channel.send(winPayload);
    return;
  }

  // 4. ปุ่มคลิกแย่งผึ้งทั่วไป
  if (interaction.customId.startsWith('bee_click_')) {
    const customId = interaction.customId;

    // ตรวจสอบ role_blacklist
    const memberRoles = interaction.member?.roles;
    const isBlacklisted = sharedSettings.role_blacklist.some((id) =>
      memberRoles?.cache ? memberRoles.cache.has(id) : (Array.isArray(memberRoles) ? memberRoles.includes(id) : false)
    );
    if (isBlacklisted) {
      return interaction.reply(blacklistPayload(interaction.user.id));
    }

    // ดึงข้อมูล Session จาก Memory หรือ Supabase DB
    let session = activeSessions.get(customId);
    if (!session) {
      const dbSession = await getActiveBeeSession(interaction.channelId);
      if (dbSession && dbSession.current_question?.customId === customId) {
        const qData = dbSession.current_question;
        session = {
          messageId: dbSession.message_id,
          customId,
          beeConfig: qData.beeConfig,
          gardenUrl: qData.gardenUrl,
          claimed: false,
          isReady: true,
          expiresAt: qData.expiresAt
        };
      }
    }

    const now = Date.now();

    // เช็กว่าหมดอายุ 15 นาทีหรือยัง
    if (session && session.expiresAt && now >= session.expiresAt) {
      activeSessions.delete(customId);
      await clearActiveBeeSession(interaction.channelId);
      try {
        const expiredPayload = buildBeeExpiredPayload(session.beeConfig, session.gardenUrl);
        await interaction.message.edit(expiredPayload);
      } catch (err) { }
      return interaction.reply({
        content: '## 🐝︲เจ้าผึ้งตัวนี้บินกลับรังไปแล้วค่ะ! เนื่องจากไม่มีการตอบสนองภายใน 15 นาที 𓂃',
        flags: FLAG_EPHEMERAL
      });
    }

    // หากไม่พบ session หรือมีคนเก็บผึ้งตัวนี้ไปแล้ว
    if (!session || session.claimed) {
      return interaction.reply({
        content: '## 🐝︲เจ้าผึ้งตัวนี้ถูกจับไปแล้วค่ะ! รอสุ่มรอบถัดไปน้า 𓂃',
        flags: FLAG_EPHEMERAL
      });
    }

    // ทำการล็อค Session ป้องกันการกดพร้อมกัน และลบ session ใน DB
    session.claimed = true;
    activeSessions.delete(customId);
    await clearActiveBeeSession(interaction.channelId);

    const userId = interaction.user.id;
    const beeConfig = session.beeConfig;
    const gardenUrl = session.gardenUrl;

    // 3. เมื่อมีคนกดปุ่ม -> ลบ Component v2 เดิม
    try {
      await interaction.message.delete();
    } catch (err) {
      console.warn('[bees] Could not delete original spawn message:', err.message);
    }

    // 4. สุ่มอัตราการแพ้/ชนะ
    const winRate = beeConfig.win_rate ?? 0.5;
    const isWin = Math.random() < winRate;

    // 4.1 กรณีเป็น นางพญาผึ้ง (queen_bee) - มินิเกมขโมยของจากนางพญาผึ้ง
    if (beeConfig.id === 'queen_bee') {
      let member = interaction.member;
      if ((!member || !member.roles || !member.roles.cache) && interaction.guild) {
        member = await interaction.guild.members.fetch(userId).catch(() => member);
      }

      if (isWin) {
        // ขโมยสำเร็จ (50%)
        const chance = Math.random();
        let winResult = null;

        if (chance >= 0.900) {
          // 10%: ได้รับแต้มสุ่ม 100 – 200
          const points = randInt(100, 200);
          const capResult = await addPointsWithCap(userId, points, member);
          winResult = { type: 'points', points, capped: capResult.capped, maxPoints: capResult.maxPoints };
        } else if (chance >= 0.600) {
          // 30%: ได้รับแต้มสุ่ม 201 – 301
          const points = randInt(201, 301);
          const capResult = await addPointsWithCap(userId, points, member);
          winResult = { type: 'points', points, capped: capResult.capped, maxPoints: capResult.maxPoints };
        } else if (chance >= 0.035) {
          // 56.5%: ได้รับแต้มก้อนใหญ่ 999
          const points = 999;
          const capResult = await addPointsWithCap(userId, points, member);
          winResult = { type: 'points', points, capped: capResult.capped, maxPoints: capResult.maxPoints };
        } else if (chance >= 0.015) {
          // 2%: แจ็กพอตแต้ม 9,999
          const points = 9999;
          const capResult = await addPointsWithCap(userId, points, member);
          winResult = { type: 'jackpot', points, capped: capResult.capped, maxPoints: capResult.maxPoints };
        } else {
          // 1.5%: ได้รับยศพิเศษมงกุฎ (Role ID: 1144704201574846504)
          const crownRoleId = beeConfig.crown_role_id || '1144704201574846504';
          const hasRole = member?.roles?.cache?.has(crownRoleId);

          if (hasRole) {
            // มียศอยู่แล้ว -> แปลงเป็นแจ็กพอต +9,999 แต้ม
            const capResult = await addPointsWithCap(userId, 9999, member);
            winResult = {
              type: 'role',
              roleId: crownRoleId,
              convertedToJackpot: true,
              points: 9999,
              capped: capResult.capped,
              maxPoints: capResult.maxPoints
            };
          } else {
            // ยังไม่มียศ -> มอบยศให้ทันที
            try {
              if (member?.roles) {
                await member.roles.add(crownRoleId);
              }
            } catch (roleErr) {
              console.error('[bees] Failed to grant crown role to user:', roleErr.message);
            }
            winResult = { type: 'role', roleId: crownRoleId, convertedToJackpot: false };
          }
        }

        const winPayload = buildQueenBeeWinPayload(beeConfig, userId, winResult, gardenUrl);
        await interaction.channel.send(winPayload);
      } else {
        // ขโมยล้มเหลว (50%)
        const chance1 = Math.random();
        let lossResult = null;

        if (chance1 > 0.100) {
          // 90%: สุ่มหักแต้ม 100 – 499
          const lossPoints = randInt(100, 499);
          await updateUserPoints(userId, -lossPoints);
          lossResult = { type: 'normal', points: lossPoints };
        } else {
          // 10%: แจ็กพอตฝั่งแย่
          const currentPoints = await getUserPoints(userId);
          if (currentPoints >= 1) {
            // แต้มตั้งแต่ 1 ขึ้นไป: ริบแต้มทั้งหมดเหลือ 0 ทันที (หมดตัว)
            await setUserPoints(userId, 0);
            lossResult = { type: 'bankrupt', previousPoints: currentPoints };
          } else {
            // แต้ม <= 0: ติดพิษนางพญาผึ้ง (-250 แต้ม)
            await updateUserPoints(userId, -250);
            lossResult = { type: 'poison', points: 250 };
          }
        }

        const lossPayload = buildQueenBeeLossPayload(beeConfig, userId, lossResult, gardenUrl);
        await interaction.channel.send(lossPayload);
      }
      return;
    }

    // 4.2 กรณีเป็น เจ้าผึ้งแวมไพร์ (vampire_bee)
    if (beeConfig.id === 'vampire_bee') {
      let member = interaction.member;
      if ((!member || !member.roles || !member.roles.cache) && interaction.guild) {
        member = await interaction.guild.members.fetch(userId).catch(() => member);
      }

      if (!isWin) {
        // 50% แพ้: โดนดูดแต้มเอง สุ่ม -100 ถึง -300 แต้ม
        const lossPoints = randInt(100, 300);
        await updateUserPoints(userId, -lossPoints);

        const lossPayload = buildVampireDrainSelfPayload(beeConfig, userId, lossPoints, gardenUrl);
        await interaction.channel.send(lossPayload);
        return;
      }

      // 50% ชนะ: ได้รับพลังแวมไพร์ ปลุกพลัง 60 วินาที
      const expireTimestamp = Math.floor(Date.now() / 1000) + 60;
      const awakenPayload = buildVampireAwakenPayload(beeConfig, userId, expireTimestamp, gardenUrl);
      const awakenMsg = await interaction.channel.send(awakenPayload);

      // เปิด MessageCollector ในห้องแชท ดักจับข้อความจาก userId ภายใน 60 วินาที (60,000 ms)
      const channel = interaction.channel;
      const filter = (m) => m.author.id === userId;
      const collector = channel.createMessageCollector({ filter, time: 60000 });

      let warningCount = 0;
      let handled = false;

      collector.on('collect', async (m) => {
        if (handled) return;

        // ดึง user ที่ถูกแท็กคนแรก
        const targetUser = m.mentions.users.first();

        if (!targetUser) {
          // พิมพ์ข้อความแต่ไม่ได้แท็กใคร
          warningCount++;
          if (warningCount < 3) {
            await m.reply({
              content: `## <:strawbear:1280194407014076447>︲<@${userId}> คุณสามารถแท็กใครก็ได้เพื่อทำการดูดแต้มของเขา เหลือเวลาอีก <t:${expireTimestamp}:R> *!*`
            }).catch(() => {});
          } else {
            // ครั้งที่ 3: ดุด่า + timeout 1 นาที + ยกเลิก
            handled = true;
            collector.stop('exceeded_attempts');

            try { await awakenMsg.delete().catch(() => {}); } catch (e) {}
            await m.reply({
              content: `## <:bear1:1148269886766862337>︲<@${userId}> เล่นเป็นมั้ยเนี่ย บอกให้แท็ก งั้นก็โดนหมดเวลาไปซะ *!*`
            }).catch(() => {});

            // Timeout 1 นาที
            if (member && member.timeout) {
              await member.timeout(60 * 1000, 'Vampire Bee - ไม่ยอมแท็กคนตามเงื่อนไข').catch((err) => {
                console.warn('[bees] Failed to timeout user:', err.message);
              });
            }
          }
          return;
        }

        // หากมีการแท็กคน
        handled = true;
        collector.stop('tagged');

        try { await awakenMsg.delete().catch(() => {}); } catch (e) {}

        const targetId = targetUser.id;
        const ownerId = beeConfig.owner_id || '944920660759707658';

        // 1. แท็กบอท
        if (targetUser.bot) {
          await m.react('❌').catch(() => {});
          const resultPayload = buildVampireTargetResultPayload(beeConfig, userId, targetId, { type: 'bot' }, gardenUrl);
          await channel.send(resultPayload);
          return;
        }

        // 2. แท็กตัวเอง
        if (targetId === userId) {
          await m.react('❌').catch(() => {});
          const resultPayload = buildVampireTargetResultPayload(beeConfig, userId, targetId, { type: 'self' }, gardenUrl);
          await channel.send(resultPayload);
          return;
        }

        // 3. แท็ก Owner
        if (targetId === ownerId || (interaction.guild && targetId === interaction.guild.ownerId)) {
          await m.react('❌').catch(() => {});
          await updateUserPoints(userId, -500);

          if (member && member.timeout) {
            await member.timeout(5 * 60 * 1000, 'Vampire Bee - พยายามดูดแต้ม Owner').catch((err) => {
              console.warn('[bees] Failed to timeout user for targeting owner:', err.message);
            });
          }

          const resultPayload = buildVampireTargetResultPayload(beeConfig, userId, targetId, { type: 'owner' }, gardenUrl);
          await channel.send(resultPayload);
          return;
        }

        // 4. แท็กผู้เล่นคนอื่น
        await m.react('✅').catch(() => {});

        const victimPoints = await getUserPoints(targetId);

        if (victimPoints <= 0) {
          // คนจน (แต้ม <= 0): ได้รับ +50 แต้มจากโครงการผึ้งจนแล้วจนอีก
          const capResult = await addPointsWithCap(userId, 50, member);
          const resultPayload = buildVampireTargetResultPayload(beeConfig, userId, targetId, {
            type: 'poor',
            points: 50,
            capped: capResult.capped,
            maxPoints: capResult.maxPoints
          }, gardenUrl);
          await channel.send(resultPayload);
        } else {
          // คนมีแต้ม (แต้ม >= 1): สุ่มดูด 20 ถึงแต้มทั้งหมดของเหยื่อ
          const minDrain = Math.min(20, victimPoints);
          const pointsToDrain = randInt(minDrain, victimPoints);

          // หักเหยื่อ
          await updateUserPoints(targetId, -pointsToDrain);
          // ให้คนกดพร้อม Cap
          const capResult = await addPointsWithCap(userId, pointsToDrain, member);

          const resultPayload = buildVampireTargetResultPayload(beeConfig, userId, targetId, {
            type: 'drain',
            points: pointsToDrain,
            capped: capResult.capped,
            maxPoints: capResult.maxPoints
          }, gardenUrl);
          await channel.send(resultPayload);
        }
      });

      collector.on('end', async (collected, reason) => {
        if (!handled && reason === 'time') {
          try { await awakenMsg.delete().catch(() => {}); } catch (e) {}
          await channel.send({
            content: `## <:bear1:1148269886766862337>︲<@${userId}> เล่นเป็นมั้ยเนี่ย บอกให้แท็ก งั้นก็โดนหมดเวลาไปซะ *!*`
          }).catch(() => {});

          if (member && member.timeout) {
            await member.timeout(60 * 1000, 'Vampire Bee - หมดเวลาแท็กคน').catch((err) => {
              console.warn('[bees] Failed to timeout user on expired collector:', err.message);
            });
          }
        }
      });

      return;
    }

    // 4.3 กรณีผึ้งทั่วไป
    if (isWin) {
      // ชนะ: สุ่มแต้ม
      const winPoints = randInt(beeConfig.min_win_points || 15, beeConfig.max_win_points || 50);
      await updateUserPoints(userId, winPoints);

      const winPayload = buildBeeWinPayload(beeConfig, userId, winPoints, gardenUrl);
      await interaction.channel.send(winPayload);
    } else {
      // แพ้: เช็กแต้มปัจจุบันก่อน
      const currentPoints = await getUserPoints(userId);

      if (currentPoints <= 0) {
        // แต้ม <= 0 -> ติดพิษ
        const poisonLoss = beeConfig.poison_loss_points || 150;
        await updateUserPoints(userId, -poisonLoss);

        const poisonPayload = buildBeePoisonLossPayload(beeConfig, userId, poisonLoss, gardenUrl);
        await interaction.channel.send(poisonPayload);
      } else {
        // แต้ม > 0 -> สุ่มลบแต้ม
        const lossPoints = randInt(beeConfig.min_loss_points || 15, beeConfig.max_loss_points || 50);
        await updateUserPoints(userId, -lossPoints);

        const lossPayload = buildBeeLossPayload(beeConfig, userId, lossPoints, gardenUrl);
        await interaction.channel.send(lossPayload);
      }
    }
  }
}

// ─── Function: Handle Chat Message for Secret Pig Quest ("อู๊ด" / "อู๊ดอู๊ด") ───
async function handleSpyBeeChatMessage(message) {
  if (!message || message.author?.bot || !message.guild) return;

  const content = message.content?.trim();
  if (!content) return;

  // ตรวจสอบว่าพิมพ์คำว่า "อู๊ด" หรือ "อู๊ดอู๊ด" (รองรับทั้งที่มีหรือไม่มี spoil ||)
  const cleanContent = content.replace(/\|\|/g, '').trim();
  if (cleanContent !== 'อู๊ด' && cleanContent !== 'อู๊ดอู๊ด') return;

  const questTicketRoleId = '1412721168611545138';
  const permanentEventRoleId = '1413043801886560327';

  // ตรวจสอบว่ามี Role ตั๋วเควสต์ (1412721168611545138) หรือไม่
  let member = message.member;
  if ((!member || !member.roles || !member.roles.cache) && message.guild) {
    member = await message.guild.members.fetch(message.author.id).catch(() => member);
  }
  if (!member || !member.roles) return;

  const hasTicketRole = member.roles.cache ? member.roles.cache.has(questTicketRoleId) : false;
  if (!hasTicketRole) return;

  // ตรวจสอบ role_blacklist (ถ้วยกาแฟ)
  const isBlacklisted = sharedSettings.role_blacklist.some((id) =>
    member.roles.cache ? member.roles.cache.has(id) : false
  );
  if (isBlacklisted) {
    const warningMsg = await message.reply(blacklistPayload(message.author.id)).catch(() => null);
    if (warningMsg) {
      setTimeout(() => warningMsg.delete().catch(() => {}), 3000);
    }
    return;
  }

  // กด Reaction 🐷 ที่ข้อความของผู้ใช้
  await message.react('🐷').catch(() => {});

  const setting = getSettingBee();
  const spyBeeConfig = (setting.bees || []).find((b) => b.id === 'spy_bee') || {};

  const hasPermanentRole = member.roles.cache ? member.roles.cache.has(permanentEventRoleId) : false;

  // 1. นำยศตั๋วเควสต์ (1412721168611545138) ออก
  try {
    await member.roles.remove(questTicketRoleId);
  } catch (err) {
    console.warn('[bees] Failed to remove quest ticket role:', err.message);
  }

  let replyPayload = null;

  if (!hasPermanentRole) {
    // ผู้เล่นยังไม่มียศอีเวนต์ถาวร -> มอบยศ 1413043801886560327 ให้
    try {
      await member.roles.add(permanentEventRoleId);
    } catch (err) {
      console.error('[bees] Failed to grant permanent event role:', err.message);
    }
    replyPayload = buildSpyBeeQuestResultPayload(spyBeeConfig, message.author.id, 'role_grant');
  } else {
    // ผู้เล่นมียศอีเวนต์ถาวรอยู่แล้ว -> สุ่มแจกแต้ม 50 - 250
    const points = randInt(50, 250);
    await addPointsWithCap(message.author.id, points, member);
    replyPayload = buildSpyBeeQuestResultPayload(spyBeeConfig, message.author.id, 'points_grant', points);
  }

  if (replyPayload) {
    const replyMsg = await message.reply(replyPayload).catch(() => null);
    if (replyMsg) {
      setTimeout(() => {
        replyMsg.delete().catch(() => {});
      }, 15000);
    }
  }
}

module.exports = {
  getSettingBee,
  fetchBeeSystemConfig,
  spawnBee,
  scheduleNextAutoSpawn,
  handleBeeInteraction,
  handleSpyBeeChatMessage,
  generateMathProblem,
  checkAndCleanExpiredBees
};
