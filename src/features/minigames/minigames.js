// src/features/minigames/minigames.js — ระบบมินิเกม 10 เกม พร้อมการตอบสนอง Component V2 & State Persistence

const { createClient } = require('@supabase/supabase-js');
const { MessageFlags, AttachmentBuilder } = require('discord.js');
const sharedConfig = require('../../sharedSettings.json');
const { addPointsWithCap } = require('../../utils/pointManager');
const { getNextQuestion, maskWord, scrambleWord } = require('./questionBank');
const { createTextImageBuffer } = require('./canvasGenerator');
const { setupResetTop } = require('./resetTop');

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
  10: { id: '1534647589121818795', name: 'ทายคำแปลภาษาไทย' }
};

// Memory cache for active game session per channel ID
const activeSessions = new Map();

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
    // For Games 1-6, 9-10: Section Component (9) comes FIRST
    containerComponents.push({
      type: 9,
      components: [{ type: 10, content: contentText }],
      accessory: accessoryButton
    });
  }

  // 3. Choice Buttons (for Game 9 & 10) — Primary (1), Danger (4), Success (3)
  if ((gameId === 9 || gameId === 10) && Array.isArray(questionData.options) && questionData.options.length > 0) {
    containerComponents.push({ type: 14, spacing: 2 });
    const choiceStyles = [1, 4, 3]; // Primary (Blue), Danger (Red), Success (Green)
    const buttonComponents = questionData.options.map((optionLabel, idx) => ({
      style: choiceStyles[idx % choiceStyles.length],
      type: 2,
      label: optionLabel,
      custom_id: `mg_opt_${gameId}_${idx}_${Date.now()}`
    }));

    containerComponents.push({
      type: 1,
      components: buttonComponents
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
 * Build winner disabled payload for Game 9 & 10
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

  const titleText = gameId === 9 ? 'ทายคำแปลภาษาอังกฤษ' : 'ทายคำแปลภาษาไทย';
  const contentText = `### <:bee20000:1256669436350562355>︲__\` 𝖦𝖺𝗆𝖾 ₊ ${titleText} 𓂃 \`__\n` +
    `# ${questionData.answer} = ${questionData.wordOrQuestion}`;

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
async function sendNextGameQuestion(supabase, channel, gameId) {
  try {
    const questionData = await getNextQuestion(supabase, gameId);
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

    activeSessions.set(channel.id, {
      gameId,
      questionData,
      messageId: sentMsg.id,
      channelId: channel.id
    });

    // Record active session in Supabase DB for crash/restart recovery
    if (supabase) {
      await supabase.from('minigame_active_sessions').upsert({
        channel_id: channel.id,
        game_id: gameId,
        current_question: questionData,
        message_id: sentMsg.id,
        updated_at: new Date().toISOString()
      });
    }
  } catch (err) {
    console.error(`[minigames] Error sending question for Game ${gameId}:`, err.message);
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
    // 1. Restore active game sessions from Supabase Database
    await restoreActiveSessions(supabase);

    // 2. Register slash command
    try {
      const guild = client.guilds.cache.get('1144251788493602848');
      if (guild) {
        await guild.commands.create({
          name: 'เปิดเกม',
          description: 'เปิดใช้งานมินิเกมประจำช่อง (สำหรับผู้ดูแลระบบ)',
          options: [
            {
              name: 'เกม',
              description: 'เลือกชื่อมินิเกม 1-10',
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
      await sendNextGameQuestion(supabase, targetChannel, gameId);
    }

    // 2. Button Interactions (Game 9 & 10) — INSTANT RESPONSE OPTIMIZED
    if (interaction.isButton() && interaction.customId.startsWith('mg_opt_')) {
      const parts = interaction.customId.split('_'); // mg_opt_{gameId}_{choiceIndex}_{timestamp}
      const gameId = parseInt(parts[2], 10);
      const choiceIndex = parseInt(parts[3], 10);

      const session = activeSessions.get(interaction.channelId);
      if (!session || session.gameId !== gameId) {
        return interaction.reply({ content: 'โจทย์ข้อนี้จบไปแล้วค่ะ หรือเริ่มข้อใหม่แล้วนะคะ', flags: FLAG_EPHEMERAL });
      }

      const questionData = session.questionData;
      const selectedChoice = questionData.options[choiceIndex];
      const isCorrect = String(selectedChoice).trim().toLowerCase() === String(questionData.answer).trim().toLowerCase();

      if (!isCorrect) {
        return interaction.reply({
          content: '❌ คำตอบยังไม่ถูกต้องนะคะ ลองใหม่อีกครั้งค่ะ!',
          flags: FLAG_EPHEMERAL
        });
      }

      // Correct Answer!
      // Instantly delete session from memory & DB to prevent double claims
      activeSessions.delete(interaction.channelId);
      if (supabase) {
        Promise.resolve(supabase.from('minigame_active_sessions').delete().eq('channel_id', interaction.channelId)).catch(() => {});
      }

      // 1. Immediately update interaction UI to show winner (Ultra-Fast response!)
      const winnerName = interaction.user.displayName || interaction.user.username;
      const winnerPayload = buildWinnerPayload(gameId, questionData, winnerName);
      await interaction.update(winnerPayload);

      // 2. Process points and DB recording asynchronously in background
      const userId = interaction.user.id;
      const member = interaction.member;
      const pointsEarned = questionData.rewardPoints;

      addPointsWithCap(supabase, member, userId, pointsEarned)
        .then((pointResult) => {
          if (supabase) {
            return supabase.from('minigame_wins').insert({
              discord_id: userId,
              game_id: gameId,
              points_earned: pointResult.awarded
            });
          }
        })
        .catch(err => console.error('[minigames] Error processing win points:', err.message));

      // 3. Post next question with minimal 400ms delay (Instant transition!)
      setTimeout(() => {
        sendNextGameQuestion(supabase, interaction.channel, gameId).catch(console.error);
      }, 400);
    }
  });

  // 3. Chat Message Listener for Games 1-8 — ULTRA-FAST RESPONSE OPTIMIZED
  client.on('messageCreate', async (message) => {
    if (message.author.bot || !message.guild) return;

    // Find which game belongs to this channel
    let matchedGameId = null;
    for (const [gId, gInfo] of Object.entries(GAME_CHANNELS)) {
      if (gInfo.id === message.channelId) {
        matchedGameId = parseInt(gId, 10);
        break;
      }
    }

    // Ignore if not a game channel or if it's game 9/10 (which use buttons)
    if (!matchedGameId || matchedGameId === 9 || matchedGameId === 10) return;

    const session = activeSessions.get(message.channelId);
    if (!session || session.gameId !== matchedGameId) return;

    const userText = message.content.trim();
    const correctAnswer = String(session.questionData.answer).trim();

    // Check correctness: exact comparison for Thai, case-insensitive for English
    const isThaiGame = matchedGameId === 1 || matchedGameId === 5 || matchedGameId === 7;
    const isCorrect = isThaiGame
      ? userText === correctAnswer
      : userText.toLowerCase() === correctAnswer.toLowerCase();

    if (!isCorrect) {
      // Delete wrong text message asynchronously
      message.delete().catch(() => {});
      return;
    }

    // Right Answer!
    // Instantly remove active session from memory and DB to prevent duplicate wins
    activeSessions.delete(message.channelId);
    if (supabase) {
      Promise.resolve(supabase.from('minigame_active_sessions').delete().eq('channel_id', message.channelId)).catch(() => {});
    }

    // 1. Instantly react checkmark to winner message (non-blocking UI)
    message.react(CHECKMARK_EMOJI_ID).catch(() => {});

    // 2. Award points and record win stats asynchronously in background
    addPointsWithCap(supabase, message.member, message.author.id, session.questionData.rewardPoints)
      .then((pointResult) => {
        if (supabase) {
          return supabase.from('minigame_wins').insert({
            discord_id: message.author.id,
            game_id: matchedGameId,
            points_earned: pointResult.awarded
          });
        }
      })
      .catch(err => console.error('[minigames] Error processing win points:', err.message));

    // 3. Post next question Component V2 with minimal 350ms delay (Ultra-Fast!)
    setTimeout(() => {
      sendNextGameQuestion(supabase, message.channel, matchedGameId).catch(console.error);
    }, 350);
  });

  console.log('[minigames] Module loaded successfully with State Persistence & Speed Optimization');
}

module.exports = { setupMinigames };
