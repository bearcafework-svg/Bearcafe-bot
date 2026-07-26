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
  buildBeePoisonLossPayload
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

// Helper: ดึง Local Setting Fallback
function getLocalSetting() {
  try {
    const raw = fs.readFileSync(SETTING_PATH, 'utf8');
    return JSON.parse(raw);
  } catch (e) {
    return require('./settingBee.json');
  }
}

// ─── Helper: ดึงการตั้งค่าระบบผึ้งล่าสุดจาก Supabase DB (หรือ Fallback) ──────
async function fetchBeeSystemConfig() {
  const supabase = getSupabase();
  let sysSetting = null;
  let bees = [];

  if (supabase) {
    try {
      const [{ data: sysData }, { data: beesData }] = await Promise.all([
        supabase.from('bee_system_settings').select('*').eq('id', 1).single(),
        supabase.from('bee_configs').select('*').order('sequence_order', { ascending: true })
      ]);

      if (sysData) sysSetting = sysData;
      if (beesData && beesData.length > 0) bees = beesData;
    } catch (e) {
      console.warn('[bees] Failed to fetch bee config from Supabase, using local fallback:', e.message);
    }
  }

  const local = getLocalSetting();

  return {
    channel_id: sysSetting?.channel_id || local.channel_id || '1524123413122125964',
    auto_spawn_enabled: sysSetting?.auto_spawn_enabled ?? local.auto_spawn_enabled ?? true,
    min_spawn_minutes: sysSetting?.min_spawn_minutes || local.min_spawn_minutes || 5,
    max_spawn_minutes: sysSetting?.max_spawn_minutes || local.max_spawn_minutes || 10,
    spawn_mode: sysSetting?.spawn_mode || local.spawn_mode || 'weighted_random',
    garden_background_url: sysSetting?.garden_background_url || 'https://cdn.discordapp.com/attachments/1528780402544611348/1528780439836430487/Garden.png',
    bees: bees.length > 0 ? bees : (local.bees || [])
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

    // 1. ส่ง Component v2 อันที่ 1 (ปุ่ม disabled "กำลังโหลดผึ้ง . . .")
    const spawnPayload = buildBeeSpawnPayload(selectedBee, customId, false, config.garden_background_url);
    const message = await channel.send(spawnPayload);

    // เก็บสถานะ Session
    const sessionData = {
      messageId: message.id,
      customId,
      beeConfig: selectedBee,
      gardenUrl: config.garden_background_url,
      claimed: false,
      isReady: false
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

    const session = activeSessions.get(customId);

    // หากไม่พบ session หรือมีคนเก็บผึ้งตัวนี้ไปแล้ว
    if (!session || session.claimed) {
      return interaction.reply({
        content: '## 🐝︲เจ้าผึ้งตัวนี้ถูกจับไปแล้วค่ะ! รอสุ่มรอบถัดไปน้า 𓂃',
        flags: FLAG_EPHEMERAL
      });
    }

    // ทำการล็อค Session ป้องกันการกดพร้อมกัน
    session.claimed = true;
    activeSessions.delete(customId);

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
  fetchBeeSystemConfig,
  spawnBee,
  scheduleNextAutoSpawn,
  handleBeeInteraction
};
