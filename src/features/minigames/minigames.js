// src/features/minigames/minigames.js — ระบบมินิเกม 10 เกม พร้อมการตอบสนอง Component V2 & State Persistence

const { createClient } = require('@supabase/supabase-js');
const { MessageFlags, AttachmentBuilder } = require('discord.js');
const sharedConfig = require('../../sharedSettings.json');
const { addPointsWithCap, deductPoints } = require('../../utils/pointManager');
const { getNextQuestion, maskWord, scrambleWord, generateHint } = require('./questionBank');
const { createTextImageBuffer } = require('./canvasGenerator');
const { setupResetTop } = require('./resetTop');
const { trackUserDailyQuestProgress } = require('../dailyQuest');

const FLAG_V2 = MessageFlags.IsComponentsV2 || 32768;
const FLAG_EPHEMERAL = MessageFlags.Ephemeral || 64;
const CHECKMARK_EMOJI_ID = '1358584609087946867';

// Mapping Game IDs to Channel IDs and Game Names
const GAME_CHANNELS = {
  1: { id: '1534437994327572510', name: 'เติมคำศัพท์ไทย' },
  2: { id: '1534453700188176506', name: 'เติมคำศัพท์ภาษาอังกฤษ' },
  3: { id: '1534454001532272730', name: 'สุ่มโจทย์คณิตฯ' },
  4: { id: '1534458749782200390', name: 'ทายคำจากคำใบ้' },
  5: { id: '1534459076606431272', name: 'เรียงคำศัพท์ไทย' },
  6: { id: '1534459381779795998', name: 'เรียงคำศัพท์อังกฤษ' },
  7: { id: '1534469630234726431', name: 'พิมพ์คำต่อไปนี้ (ไทย)' },
  8: { id: '1534469708517085315', name: 'พิมพ์คำต่อไปนี้ (อังกฤษ)' },
  9: { id: '1534647461262393435', name: 'ทายคำแปลภาษาอังกฤษ' },
  10: { id: '1534647589121818795', name: 'ทายคำแปลภาษาไทย' },
  11: { id: '1534647600000000011', name: 'เกมต่อคำ' },
  12: { id: '1534647600000000012', name: 'ข้อไหนไม่เข้าพวก' },
  13: { id: '1534647600000000013', name: 'จริงหรือเท็จ' }
};

// Memory cache for active game session per channel ID
const activeSessions = new Map();
// Lock per channel ID during win processing & question generation to prevent race conditions
const processingChannels = new Set();

/**
 * Restores active game sessions from Supabase DB on bot restart
 */
async function restoreActiveSessions(supabase) {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from('minigame_active_sessions').select('*');
    if (error) {
      console.error('[minigames] Failed to restore active sessions:', error.message);
      return;
    }
    if (data && data.length > 0) {
      for (const row of data) {
        activeSessions.set(row.channel_id, {
          gameId: row.game_id,
          questionData: row.current_question,
          messageId: row.message_id,
          channelId: row.channel_id
        });
      }
      console.log(`[minigames] ✅ Restored ${data.length} active game sessions from Supabase.`);
    }
  } catch (err) {
    console.error('[minigames] Error restoring active sessions:', err.message);
  }
}

/**
 * Builds Component V2 payload for a given game and question
 */
function buildGamePayload(gameId, questionData) {
  const pi = sharedConfig.point_icon;
  const pointEmoji = { id: pi.id, name: pi.name, animated: pi.animated };

  const accessoryButton = {
    type: 2,
    style: 5,
    label: `รางวัล +${questionData.rewardPoints} แต้ม`,
    emoji: pointEmoji,
    url: 'https://discord.com/channels/1144251788493602848/1524123727724417276'
  };

  let contentText = '';
  let mediaItem = null;

  switch (gameId) {
    case 1: { // เติมคำศัพท์ไทย
      const { maskedStr } = maskWord(questionData.wordOrQuestion, true);
      questionData.displayMask = maskedStr;
      const categoryLabel = questionData.category || 'คำทั่วไป';
      contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ เกมเติมคำศัพท์ (ไทย) 𓂃 \`__\n` +
        `# \`${maskedStr}\`\n` +
        `-# - หมวดหมู่: ${categoryLabel}`;
      break;
    }
    case 2: { // เติมคำศัพท์อังกฤษ
      const { maskedStr } = maskWord(questionData.wordOrQuestion, false);
      questionData.displayMask = maskedStr;
      const categoryLabel = questionData.category || 'คำทั่วไป';
      contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ เกมเติมคำศัพท์ (อังกฤษ) 𓂃 \`__\n` +
        `# \`${maskedStr}\`\n` +
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
    case 5: { // เรียงคำศัพท์ไทย
      const scrambled = scrambleWord(questionData.wordOrQuestion);
      questionData.scrambled = scrambled;
      contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ เรียงคำศัพท์ไทย 𓂃 \`__\n` +
        `# ${scrambled}`;
      break;
    }
    case 6: { // เรียงคำศัพท์อังกฤษ
      const scrambled = scrambleWord(questionData.wordOrQuestion);
      questionData.scrambled = scrambled;
      contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ เรียงคำศัพท์อังกฤษ 𓂃 \`__\n` +
        `# ${scrambled}`;
      break;
    }
    case 7: { // พิมพ์คำต่อไปนี้ (ไทย)
      contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ พิมพ์คำต่อไปนี้ (ไทย) 𓂃 \`__`;
      mediaItem = { media: { url: 'attachment://text_image.png' } };
      break;
    }
    case 8: { // พิมพ์คำต่อไปนี้ (อังกฤษ)
      contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ พิมพ์คำต่อไปนี้ (อังกฤษ) 𓂃 \`__`;
      mediaItem = { media: { url: 'attachment://text_image.png' } };
      break;
    }
    case 9: { // ทายคำแปลภาษาอังกฤษ
      contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ ทายคำแปลภาษาอังกฤษ 𓂃 \`__\n` +
        `# ${questionData.wordOrQuestion}`;
      break;
    }
    case 10: { // ทายคำแปลภาษาไทย
      contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ ทายคำแปลภาษาไทย 𓂃 \`__\n` +
        `# ${questionData.wordOrQuestion}`;
      break;
    }
    case 11: { // เกมต่อคำ
      contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ เกมต่อคำ 𓂃 \`__\n` +
        `# ${questionData.wordOrQuestion}`;
      break;
    }
    case 12: { // ข้อไหนไม่เข้าพวก
      contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ ข้อไหนไม่เข้าพวก 𓂃 \`__\n` +
        `# ${questionData.wordOrQuestion || 'อันไหนไม่เข้าพวก?'}`;
      break;
    }
    case 13: { // จริงหรือเท็จ
      contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ จริงหรือเท็จ 𓂃 \`__\n` +
        `# ${questionData.wordOrQuestion}`;
      break;
    }
  }

  const containerComponents = [];

  // For Games 7 & 8: Media Component (12) comes FIRST, then Separator (14), then Section Component (9)
  if (mediaItem) {
    containerComponents.push({ type: 12, items: [mediaItem] });
    containerComponents.push({ type: 14, spacing: 2 });
    containerComponents.push({
      type: 9,
      components: [{ type: 10, content: contentText }],
      accessory: accessoryButton
    });
  } else {
    // For Games 1-6, 9-13: Section Component (9) comes FIRST
    containerComponents.push({
      type: 9,
      components: [{ type: 10, content: contentText }],
      accessory: accessoryButton
    });
  }

  // 3. Choice Buttons (for Games 9, 10, 11, 12, 13)
  if ([9, 10, 11, 12, 13].includes(gameId) && Array.isArray(questionData.options) && questionData.options.length > 0) {
    containerComponents.push({ type: 14, spacing: 2 });
    let buttonComponents = [];

    if (gameId === 13) {
      // เกม 13: จริงหรือเท็จ -> [จริง] สีเขียว (Style 3) และ [เท็จ] สีแดง (Style 4) ไม่มี emoji
      buttonComponents = questionData.options.map((optionLabel, idx) => {
        const isTrueBtn = String(optionLabel).trim() === 'จริง';
        return {
          style: isTrueBtn ? 3 : 4, // 3: Success (Green), 4: Danger (Red)
          type: 2,
          label: optionLabel,
          custom_id: `mg_opt_${gameId}_${idx}_${Date.now()}`
        };
      });
    } else {
      const choiceStyles = [1, 4, 3, 2]; // Primary, Danger, Success, Secondary
      buttonComponents = questionData.options.map((optionLabel, idx) => ({
        style: choiceStyles[idx % choiceStyles.length],
        type: 2,
        label: optionLabel,
        custom_id: `mg_opt_${gameId}_${idx}_${Date.now()}`
      }));
    }

    containerComponents.push({
      type: 1,
      components: buttonComponents
    });
  }

  // 4. SelectMenu for Hints (for Games 1, 2, 5, 6)
  if ([1, 2, 5, 6].includes(gameId)) {
    containerComponents.push({
      type: 14,
      spacing: 1,
      divider: false
    });
    containerComponents.push({
      type: 1,
      components: [
        {
          type: 3,
          custom_id: `mg_hint_select_${gameId}_${Date.now()}`,
          placeholder: '💡︲เลือกใช้คำใบ้',
          options: [
            {
              label: '🔎︲คำใบ้ 1 (หัก 10 แต้ม)',
              value: 'hint_1',
              description: (gameId === 1 || gameId === 2) ? 'เปิดตัวอักษรที่ถูกต้อง 1 ตัว' : 'ล็อกตำแหน่งตัวอักษร 1 ตัว'
            },
            {
              label: '💡︲คำใบ้ 2 (หัก 25 แต้ม)',
              value: 'hint_2',
              description: (gameId === 1 || gameId === 2) ? 'เปิดตัวอักษรเพิ่ม 50%' : 'ล็อกตำแหน่งตัวอักษรเพิ่ม 50%'
            }
          ]
        }
      ]
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
 * Build winner disabled payload for Games 9-13
 */
function buildWinnerPayload(gameId, questionData, winnerDisplayName) {
  const pi = sharedConfig.point_icon;
  const pointEmoji = { id: pi.id, name: pi.name, animated: pi.animated };

  const accessoryButton = {
    type: 2,
    style: 5,
    label: `รางวัล +${questionData.rewardPoints} แต้ม`,
    emoji: pointEmoji,
    url: 'https://discord.com/channels/1144251788493602848/1524123727724417276'
  };

  let titleText = 'มินิเกม';
  if (gameId === 9) titleText = 'ทายคำแปลภาษาอังกฤษ';
  else if (gameId === 10) titleText = 'ทายคำแปลภาษาไทย';
  else if (gameId === 11) titleText = 'เกมต่อคำ';
  else if (gameId === 12) titleText = 'ข้อไหนไม่เข้าพวก';
  else if (gameId === 13) titleText = 'จริงหรือเท็จ';

  let contentText = '';
  if (gameId === 11) {
    // เกมต่อคำ: แสดงคำต่อกันแบบสมบูรณ์ (เช่น รถไฟ)
    contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ ${titleText} 𓂃 \`__\n` +
      `# ${questionData.wordOrQuestion}${questionData.answer}`;
  } else if (gameId === 12 || gameId === 13) {
    contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ ${titleText} 𓂃 \`__\n` +
      `# ${questionData.wordOrQuestion}\n` +
      `-# เฉลย: ${questionData.answer}`;
  } else {
    contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ ${titleText} 𓂃 \`__\n` +
      `# ${questionData.wordOrQuestion} = ${questionData.answer}`;
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
            label: `@${winnerDisplayName} ตอบถูก`,
            custom_id: `mg_winner_disabled_${Date.now()}`,
            disabled: true
          }]
        }
      ]
    }]
  };
}

/**
 * Sends or posts a new game question into the channel
 */
/**
 * Sends or posts a new game question into the channel (with Auto-Retry & Fallback)
 */
async function sendNextGameQuestion(client, supabase, channelOrId, gameId, retries = 3) {
  const channelId = typeof channelOrId === 'string' ? channelOrId : (channelOrId?.id || GAME_CHANNELS[gameId]?.id);
  if (!channelId) return;

  try {
    let channel = (typeof channelOrId === 'object' && channelOrId && typeof channelOrId.send === 'function')
      ? channelOrId
      : client.channels.cache.get(channelId);

    if (!channel && client) {
      try {
        channel = await client.channels.fetch(channelId);
      } catch (e) {
        console.error(`[minigames] Could not fetch channel ${channelId}:`, e.message);
      }
    }

    if (!channel) {
      console.warn(`[minigames] Channel ${channelId} unavailable for Game ${gameId}`);
      return;
    }

    const gameSettings = GAME_CHANNELS[gameId];
    let questionData = await getNextQuestion(supabase, gameId, gameSettings).catch(() => null);

    // Fallback: If DB query returned null, retry with default questions
    if (!questionData) {
      questionData = await getNextQuestion(null, gameId, gameSettings);
    }

    if (!questionData) {
      console.warn(`[minigames] No questions available for Game ${gameId}`);
      return;
    }

    const payload = buildGamePayload(gameId, questionData);
    let sentMsg = null;

    if (gameId === 7 || gameId === 8) {
      const buffer = createTextImageBuffer(questionData.wordOrQuestion);
      const file = new AttachmentBuilder(buffer, { name: 'text_image.png' });
      sentMsg = await channel.send({ ...payload, files: [file] });
    } else {
      sentMsg = await channel.send(payload);
    }

    activeSessions.set(channelId, {
      gameId,
      questionData,
      messageId: sentMsg.id,
      channelId
    });

    // Record active session in Supabase DB for crash/restart recovery
    if (supabase) {
      try {
        await supabase.from('minigame_active_sessions').upsert({
          channel_id: channelId,
          game_id: gameId,
          current_question: questionData,
          message_id: sentMsg.id,
          updated_at: new Date().toISOString()
        });
      } catch (err) {
        console.error('[minigames] Error saving active session to DB:', err.message);
      }
    }
  } catch (err) {
    console.error(`[minigames] Error sending question for Game ${gameId}:`, err.message);
    // Auto-retry if sending failed (e.g. rate-limit or network hiccup)
    if (retries > 0) {
      console.log(`[minigames] Retrying Game ${gameId} in 2s... (${retries} retries left)`);
      await new Promise(r => setTimeout(r, 2000));
      return sendNextGameQuestion(client, supabase, channelOrId, gameId, retries - 1);
    }
  } finally {
    processingChannels.delete(channelId);
  }
}

/**
 * Synchronizes GAME_CHANNELS mapping with Supabase `minigame_settings` table
 */
async function syncGameSettings(supabase) {
  if (!supabase) return;
  try {
    const { data, error } = await supabase
      .from('minigame_settings')
      .select('game_id, game_name, channel_id, min_points, max_points');

    if (error) {
      console.error('[minigames] Failed to sync minigame_settings from DB:', error.message);
      return;
    }

    if (data && data.length > 0) {
      for (const row of data) {
        if (row.game_id && row.channel_id) {
          GAME_CHANNELS[row.game_id] = {
            id: String(row.channel_id).trim(),
            name: row.game_name ? String(row.game_name).trim() : (GAME_CHANNELS[row.game_id]?.name || `เกมที่ ${row.game_id}`),
            minPoints: row.min_points ?? 3,
            maxPoints: row.max_points ?? 6
          };
        }
      }
      console.log(`[minigames] ✅ Synced ${data.length} game settings from Supabase minigame_settings.`);
    }
  } catch (err) {
    console.error('[minigames] Error syncing minigame_settings:', err.message);
  }
}

/**
 * Main feature setup
 */
function setupMinigames(client) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  // Initialize b!reset-top command & refresh handler
  setupResetTop(client, supabase);

  // Restore active sessions and register /เปิดเกม command on ready
  client.once('clientReady', async () => {
    // 1. Sync GAME_CHANNELS mapping with Supabase minigame_settings table
    await syncGameSettings(supabase);

    // 2. Restore active game sessions from Supabase Database
    await restoreActiveSessions(supabase);

    // 3. Register slash command /เปิดเกม
    try {
      const guild = client.guilds.cache.get('1144251788493602848');
      if (guild) {
        await guild.commands.create({
          name: 'เปิดเกม',
          description: 'เปิดใช้งานมินิเกมประจำช่อง (สำหรับผู้ดูแลระบบ)',
          options: [
            {
              name: 'เกม',
              description: 'เลือกชื่อมินิเกม 1-13',
              type: 4, // INTEGER
              required: true,
              choices: Object.entries(GAME_CHANNELS).map(([id, info]) => ({
                name: `${id}. ${info.name}`,
                value: parseInt(id, 10)
              }))
            }
          ]
        });
        console.log('[minigames] Command /เปิดเกม registered on guild.');
      }
    } catch (e) {
      console.error('[minigames] Failed to register command /เปิดเกม:', e.message);
    }

    // 4. Background Health Check Keeper: Automatically heal games every 5 minutes if missing active session
    setInterval(async () => {
      try {
        for (const [gId, gInfo] of Object.entries(GAME_CHANNELS)) {
          const gameId = parseInt(gId, 10);
          const channelId = gInfo.id;
          const session = activeSessions.get(channelId);
          if (!session && !processingChannels.has(channelId)) {
            console.log(`[minigames] 🏥 Self-Healing Keeper: Auto-starting missing game ${gameId} (${gInfo.name}) in channel ${channelId}`);
            await sendNextGameQuestion(client, supabase, channelId, gameId).catch(() => {});
          }
        }
      } catch (err) {
        console.error('[minigames] Error in Background Health Check Keeper:', err.message);
      }
    }, 5 * 60 * 1000);
  });

  // Handle Slash Command & Button Interactions
  client.on('interactionCreate', async (interaction) => {
    // 1. Slash Command /เปิดเกม
    if (interaction.isChatInputCommand() && interaction.commandName === 'เปิดเกม') {
      const gameId = interaction.options.getInteger('เกม');
      const gameInfo = GAME_CHANNELS[gameId];

      if (!gameInfo) {
        return interaction.reply({ content: 'ไม่พบมินิเกมที่เลือกค่ะ', flags: FLAG_EPHEMERAL });
      }

      const targetChannel = interaction.guild.channels.cache.get(gameInfo.id);
      if (!targetChannel) {
        return interaction.reply({ content: `ไม่พบช่องสำหรับเกม ${gameInfo.name} (${gameInfo.id}) ค่ะ`, flags: FLAG_EPHEMERAL });
      }

      // Send ephemeral confirmation to command user
      await interaction.reply({
        content: `✅ เปิดใช้งานเกม **${gameId}. ${gameInfo.name}** ในช่อง <#${gameInfo.id}> เรียบร้อยแล้วค่ะ`,
        flags: FLAG_EPHEMERAL
      });

      // Post first question to the designated channel
      await sendNextGameQuestion(client, supabase, targetChannel, gameId);
    }

    // 2. Button Interactions (Game 9 & 10) — INSTANT RESPONSE & CONCURRENCY LOCKED
    if (interaction.isButton() && interaction.customId.startsWith('mg_opt_')) {
      const parts = interaction.customId.split('_'); // mg_opt_{gameId}_{choiceIndex}_{timestamp}
      const gameId = parseInt(parts[2], 10);
      const choiceIndex = parseInt(parts[3], 10);

      const session = activeSessions.get(interaction.channelId);
      if (!session || session.gameId !== gameId) {
        // Auto-Heal: ถ้าเซสชันขาดหลุดไป ให้สร้างโจทย์ข้อใหม่ส่งเข้าช่องนี้ให้อัตโนมัติทันที!
        sendNextGameQuestion(client, supabase, interaction.channelId, gameId).catch(() => {});
        return interaction.reply({ content: 'โจทย์ข้อนี้จบไปแล้วค่ะ! กำลังส่งโจทย์ข้อใหม่ให้ในช่องเรียบร้อยแล้วนะคะ 🎮', flags: FLAG_EPHEMERAL });
      }

      // Message ID strict check: reject interactions on old question messages
      if (session.messageId && interaction.message.id !== session.messageId) {
        return interaction.reply({ content: 'ข้อความนี้เป็นโจทย์ข้อเก่าแล้วนะคะ กรุณาตอบที่ข้อความล่าสุดในช่องค่ะ 🎮', flags: FLAG_EPHEMERAL });
      }

      // Lock check: ignore if another win is currently processing for this channel
      if (processingChannels.has(interaction.channelId)) {
        return interaction.reply({ content: 'กำลังเปลี่ยนโจทย์ข้อใหม่ค่ะ กรุณารอแปปนึงนะคะ', flags: FLAG_EPHEMERAL });
      }

      const questionData = session.questionData;
      const selectedChoice = questionData.options[choiceIndex];
      const isCorrect = String(selectedChoice).trim().toLowerCase() === String(questionData.answer).trim().toLowerCase();

      if (!isCorrect) {
        const userId = interaction.user.id;
        const penalty = Math.floor(Math.random() * 11) + 5; // 5-15
        if (supabase) {
          deductPoints(supabase, userId, penalty).catch(err => {
            console.error('[minigames] deductPoints error:', err.message);
          });
        }

        return interaction.reply({
          content: `❌ คำตอบไม่ถูกต้องค่ะ! ถูกหักแต้ม **${penalty} แต้ม** 🔻`,
          flags: FLAG_EPHEMERAL
        });
      }

      // Correct Answer! Lock channel & clear session immediately
      processingChannels.add(interaction.channelId);
      activeSessions.delete(interaction.channelId);
      if (supabase) {
        Promise.resolve(supabase.from('minigame_active_sessions').delete().eq('channel_id', interaction.channelId)).catch(() => {});
      }

      // Fallback safety timeout: Auto-release lock after 10s if process stalls
      const safetyLockTimeout = setTimeout(() => {
        if (processingChannels.has(interaction.channelId)) {
          console.warn(`[minigames] Auto-releasing stuck lock for channel ${interaction.channelId}`);
          processingChannels.delete(interaction.channelId);
        }
      }, 10000);

      try {
        // 1. Immediately update interaction UI to show winner (Ultra-Fast response!)
        const winnerName = interaction.user.displayName || interaction.user.username;
        const winnerPayload = buildWinnerPayload(gameId, questionData, winnerName);
        await interaction.update(winnerPayload);

        // 2. Process points and DB recording asynchronously in background
        const userId = interaction.user.id;
        const member = interaction.member;
        const pointsEarned = questionData.rewardPoints || 3;

        if (supabase) {
          addPointsWithCap(supabase, member, userId, pointsEarned)
            .then((pointResult) => {
              const awarded = pointResult && typeof pointResult.awarded === 'number' ? pointResult.awarded : 0;
              return supabase.from('minigame_wins').insert({
                discord_id: userId,
                game_id: gameId,
                points_earned: awarded
              });
            })
            .catch(err => {
              console.error('[minigames] Error processing win points for Game 9/10:', err.message);
              supabase.from('minigame_wins').insert({
                discord_id: userId,
                game_id: gameId,
                points_earned: 0
              }).catch(e => console.error('[minigames] Fallback win stat insert failed:', e.message));
            });
        }

        // 3. Post next question with minimal delay
        setTimeout(() => {
          sendNextGameQuestion(client, supabase, interaction.channelId, gameId)
            .finally(() => clearTimeout(safetyLockTimeout))
            .catch((err) => {
              console.error(`[minigames] Error in sendNextGameQuestion for Game ${gameId}:`, err);
              clearTimeout(safetyLockTimeout);
              processingChannels.delete(interaction.channelId);
            });
        }, 400);
      } catch (err) {
        console.error('[minigames] Error processing correct answer interaction:', err.message);
        clearTimeout(safetyLockTimeout);
        processingChannels.delete(interaction.channelId);
      }
    }

    // 3. StringSelectMenu Hint Interactions (Games 1, 2, 5, 6)
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('mg_hint_select_')) {
      const parts = interaction.customId.split('_');
      const gameId = parseInt(parts[3], 10);
      const hintValue = interaction.values[0];
      const hintLevel = hintValue === 'hint_1' ? 1 : 2;
      const hintCost = hintLevel === 1 ? 10 : 25;

      const session = activeSessions.get(interaction.channelId);
      if (!session || session.gameId !== gameId) {
        return interaction.reply({ content: 'โจทย์ข้อนี้จบไปแล้วค่ะ หรือเริ่มข้อใหม่แล้วนะคะ', flags: FLAG_EPHEMERAL });
      }

      const userId = interaction.user.id;

      // Reset menu selection UI on primary message so it can be re-selected if needed
      if (interaction.message) {
        const updatedComponents = interaction.message.components.map(row => {
          const rowJson = row.toJSON();
          if (rowJson.type === 1 && Array.isArray(rowJson.components)) {
            rowJson.components = rowJson.components.map(comp => {
              if (comp.custom_id === interaction.customId) {
                return {
                  ...comp,
                  options: comp.options.map(opt => ({ ...opt, default: false }))
                };
              }
              return comp;
            });
          }
          return rowJson;
        });
        await interaction.message.edit({ components: updatedComponents }).catch(() => {});
      }

      // Fetch active session record from Supabase DB to check used hints
      let sessionDataFromDB = null;
      if (supabase) {
        const { data } = await supabase
          .from('minigame_active_sessions')
          .select('user_hints')
          .eq('channel_id', interaction.channelId)
          .maybeSingle();
        sessionDataFromDB = data;
      }

      const userHintsMap = sessionDataFromDB?.user_hints || session.userHints || {};
      const userUsedSet = new Set(userHintsMap[userId]?.usedLevels || []);

      // Rule: Check if user already used this specific hint level
      if (userUsedSet.has(hintLevel)) {
        return interaction.reply({
          content: `❌ คุณเคยใช้ **คำใบ้ ${hintLevel}** สำหรับโจทย์ข้อนี้ไปแล้วค่ะ (ใช้ได้สูงสุดครั้งเดียวต่อระดับต่อข้อ)`,
          flags: FLAG_EPHEMERAL
        });
      }

      // Rule: Check if user has enough points
      if (supabase) {
        const { data: pointRow } = await supabase
          .from('user_points')
          .select('points')
          .eq('discord_id', userId)
          .maybeSingle();

        const currentPoints = pointRow?.points ?? 0;
        if (currentPoints < hintCost) {
          return interaction.reply({
            content: `❌ แต้มของคุณไม่พอสำหรับแลกใช้ **คำใบ้ ${hintLevel}** ค่ะ (คุณมี ${currentPoints} แต้ม / ต้องการ ${hintCost} แต้ม)`,
            flags: FLAG_EPHEMERAL
          });
        }
      }

      // Generate Hint Text
      const previousHintData = userHintsMap[userId]?.hintData || null;
      const hintResult = generateHint(gameId, session.questionData, hintLevel, previousHintData);

      if (hintResult.error) {
        return interaction.reply({ content: `❌ ${hintResult.error}`, flags: FLAG_EPHEMERAL });
      }

      // Deduct points from user
      if (supabase) {
        await deductPoints(supabase, userId, hintCost).catch(err => {
          console.error('[minigames] Deduct points for hint error:', err.message);
        });
      }

      // Update used hints map
      userUsedSet.add(hintLevel);
      userHintsMap[userId] = {
        usedLevels: Array.from(userUsedSet),
        hintData: hintResult.updatedHintData
      };
      session.userHints = userHintsMap;

      // Persist to Supabase DB
      if (supabase) {
        await supabase
          .from('minigame_active_sessions')
          .update({ user_hints: userHintsMap })
          .eq('channel_id', interaction.channelId)
          .catch(e => console.error('[minigames] Error updating user_hints in DB:', e.message));
      }

      // Return Ephemeral Hint response
      return interaction.reply({
        content: hintResult.hintText,
        flags: FLAG_EPHEMERAL
      });
    }
  });

  // 3. Chat Message Listener for Games 1-8 — ULTRA-FAST & CONCURRENCY LOCKED
  client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // Lock check: ignore if another win is currently processing for this channel
    if (processingChannels.has(message.channelId)) return;

    // Find which game belongs to this channel
    let matchedGameId = null;
    for (const [gId, gInfo] of Object.entries(GAME_CHANNELS)) {
      if (gInfo.id === message.channelId) {
        matchedGameId = parseInt(gId, 10);
        break;
      }
    }

    // Ignore if not a game channel or if it's game 9-13 (which use buttons)
    if (!matchedGameId || [9, 10, 11, 12, 13].includes(matchedGameId)) return;

    const session = activeSessions.get(message.channelId);
    if (!session || session.gameId !== matchedGameId) {
      // Auto-Heal: หากเซสชันหลุดไป ให้เปิดเกมและส่งโจทย์ข้อใหม่เข้าช่องนี้ให้อัตโนมัติทันที
      sendNextGameQuestion(client, supabase, message.channelId, matchedGameId).catch(() => {});
      return;
    }

    const userText = message.content.trim();
    const correctAnswer = String(session.questionData.answer).trim();

    // Check correctness: exact comparison for Thai, case-insensitive for English
    const isThaiGame = matchedGameId === 1 || matchedGameId === 5 || matchedGameId === 7;
    const isCorrect = isThaiGame
      ? userText === correctAnswer
      : userText.toLowerCase() === correctAnswer.toLowerCase();

    if (!isCorrect) {
      trackUserDailyQuestProgress(message.author.id, "MINIGAME_PLAY", 1);
      // Delete wrong text message asynchronously
      message.delete().catch(() => {});

      const userId = message.author.id;
      const penalty = Math.floor(Math.random() * 11) + 5; // 5-15
      if (supabase) {
        deductPoints(supabase, userId, penalty).catch(err => {
          console.error('[minigames] deductPoints error (text game):', err.message);
        });
      }

      // Send penalty notice (auto-delete after 5s)
      const penaltyMsg = await message.channel.send({
        content: `${message.author} ❌ ตอบผิดค่ะ! ถูกหักแต้ม **${penalty} แต้ม** 🔻`
      });
      setTimeout(() => penaltyMsg.delete().catch(() => {}), 5000);
      return;
    }

    // Right Answer! Lock channel & clear session immediately
    processingChannels.add(message.channelId);
    activeSessions.delete(message.channelId);
    trackUserDailyQuestProgress(message.author.id, "MINIGAME_PLAY", 1);
    trackUserDailyQuestProgress(message.author.id, "MINIGAME_WIN", 1);
    if (supabase) {
      Promise.resolve(supabase.from('minigame_active_sessions').delete().eq('channel_id', message.channelId)).catch(() => {});
    }

    const safetyLockTimeout = setTimeout(() => {
      if (processingChannels.has(message.channelId)) {
        console.warn(`[minigames] Auto-releasing stuck lock for channel ${message.channelId}`);
        processingChannels.delete(message.channelId);
      }
    }, 10000);

    try {
      // 1. Instantly react checkmark to winner message (non-blocking UI)
      message.react(CHECKMARK_EMOJI_ID).catch(() => {});

      // 2. Edit previous question message to show solved state
      if (session.messageId) {
        const winnerName = message.member?.displayName || message.author.username;
        message.channel.messages.fetch(session.messageId)
          .then(oldMsg => {
            if (oldMsg) {
              const gameTitle = GAME_CHANNELS[matchedGameId]?.name || 'มินิเกม';
              oldMsg.edit({
                flags: FLAG_V2,
                components: [{
                  type: 17,
                  components: [
                    {
                      type: 9,
                      components: [{
                        type: 10,
                        content: `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ ${gameTitle} 𓂃 \`__\n# ${correctAnswer}\n-# ✅ @${winnerName} ตอบถูกเรียบร้อยแล้วค่ะ`
                      }]
                    }
                  ]
                }]
              }).catch(() => {});
            }
          })
          .catch(() => {});
      }

      // 3. Award points and record win stats asynchronously in background
      if (supabase) {
        const rewardPoints = session.questionData.rewardPoints || 3;
        addPointsWithCap(supabase, message.member, message.author.id, rewardPoints)
          .then((pointResult) => {
            const awarded = pointResult && typeof pointResult.awarded === 'number' ? pointResult.awarded : 0;
            return supabase.from('minigame_wins').insert({
              discord_id: message.author.id,
              game_id: matchedGameId,
              points_earned: awarded
            });
          })
          .catch(err => {
            console.error('[minigames] Error processing win points for Game 1-8:', err.message);
            supabase.from('minigame_wins').insert({
              discord_id: message.author.id,
              game_id: matchedGameId,
              points_earned: 0
            }).catch(e => console.error('[minigames] Fallback win stat insert failed:', e.message));
          });
      }

      // 4. Post next question Component V2 with minimal delay
      setTimeout(() => {
        sendNextGameQuestion(client, supabase, message.channelId, matchedGameId)
          .finally(() => clearTimeout(safetyLockTimeout))
          .catch((err) => {
            console.error(`[minigames] Error in sendNextGameQuestion for Game ${matchedGameId}:`, err);
            clearTimeout(safetyLockTimeout);
            processingChannels.delete(message.channelId);
          });
      }, 350);
    } catch (err) {
      console.error('[minigames] Error processing correct answer message:', err.message);
      clearTimeout(safetyLockTimeout);
      processingChannels.delete(message.channelId);
    }
  });

  console.log('[minigames] Module loaded successfully with State Persistence & Speed Optimization');
}

module.exports = { setupMinigames };
