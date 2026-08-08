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
  buildBeeExpiredPayload
} = require('./beePayloads');

const logger = require('../../utils/logger');

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

// ─── Helper: ดึงการตั้งค่าระบบผึ้งจากไฟล์ settingBee.json ───────────────────────
async function fetchBeeSystemConfig() {
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

// ─── Helper: เลือกว่าจะส่งผึ้งตัวไหน ──────────────────────────────────────────
function selectBeeToSpawn(setting, requestedBeeId = null) {
  const allBees = setting.bees || [];
  if (allBees.length === 0) return null;

  // หากมีการระบุผึ้งตัวเฉพาะมา (เช่น สั่ง Test Spawn) ให้ส่งตัวนั้นได้ทันทีแม้ปิดอยู่
  if (requestedBeeId) {
    const found = allBees.find((b) => b.id === requestedBeeId || b.name === requestedBeeId);
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
async function spawnBee(client, beeId = null) {
  try {
    // ล้างผึ้งเก่าที่หมดอายุ 15 นาที
    await checkAndCleanExpiredBees(client);

    const config = await fetchBeeSystemConfig();
    const channelId = config.channel_id || '1524123413122125964';

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
    const customId = `bee_click_${Date.now()}_${randInt(1000, 9999)}`;
    const expiresAt = Date.now() + 15 * 60 * 1000; // หมดอายุภายใน 15 นาที

    // 1. ส่ง Component v2 อันที่ 1 (ปุ่ม disabled "กำลังโหลดผึ้ง . . .")
    const spawnPayload = buildBeeSpawnPayload(selectedBee, customId, false, config.garden_background_url);
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
      expiresAt
    };
    activeSessions.set(customId, sessionData);

    // 2. รอ 5 วินาที แล้วแก้ไขเฉพาะปุ่มให้เป็น active
    const delayMs = selectedBee.button_delay_ms || 5000;
    setTimeout(async () => {
      try {
        const session = activeSessions.get(customId);
        if (session && !session.claimed) {
          session.isReady = true;
          const activePayload = buildBeeSpawnPayload(selectedBee, customId, true, config.garden_background_url);
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

  // 2. ปุ่มคลิกแย่งผึ้ง
  if (interaction.customId.startsWith('bee_click_')) {
    const customId = interaction.customId;

    // ตรวจสอบ role_blacklist
    const isBlacklisted = sharedSettings.role_blacklist.some((id) =>
      interaction.member?.roles?.cache?.has(id)
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

module.exports = {
  getSettingBee,
  fetchBeeSystemConfig,
  spawnBee,
  scheduleNextAutoSpawn,
  handleBeeInteraction,
  checkAndCleanExpiredBees
};
