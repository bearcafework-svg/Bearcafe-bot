// src/features/dailyQuest/index.js — ระบบภารกิจประจำวัน (Daily Quests)
const { createClient } = require("@supabase/supabase-js");
const { MessageFlags, StringSelectMenuBuilder, ActionRowBuilder } = require("discord.js");
const { buildDailyQuestPayload } = require("./payloadBuilder");
const {
  ensureMasterQuestsSeeded,
  getOrAssignDailyQuests,
  addProgress,
  claimReward,
  claimAllRewards,
  rerollQuest,
  runAutoCleanup,
  flushVoiceProgressRealtime,
  flushGameProgressRealtime,
  toggleGameQuestPreference,
  getWeeklyProgress,
  claimWeeklyMilestone
} = require("./dailyQuestManager");
const { safeRespond, safeDeferReply, safeUpdate, safeDeferUpdate } = require("../../../utils/discordSafety");
const sharedConfig = require("../../sharedSettings.json");

const FLAG_V2 = 32768; // MessageFlags.IsComponentsV2
const FLAG_EPHEMERAL = 64; // MessageFlags.Ephemeral

// Map สำหรับเก็บ Cooldown การนับแชทป้องกันการสแปม (User ID -> timestamp)
const chatCooldowns = new Map();
// Map สำหรับเก็บเวลาเข้าห้องเสียง (User ID -> timestamp)
const voiceJoinTimes = new Map();
// Map สำหรับเก็บเวลาเล่นเกม (User ID -> { gameName, startTime })
const gameSessions = new Map();

let globalSupabase = null;

// ── Helper: ตรวจสอบสิทธิ์ Owner ──────────────────────────────────────────
function isOwnerUser(userId, guild) {
  if (!userId) return false;
  const envOwnerId = process.env.OWNER_ID;
  if (envOwnerId && userId === envOwnerId) return true;
  if (guild && guild.ownerId === userId) return true;
  return false;
}

function setupDailyQuest(client) {
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    globalSupabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    );
  }
  const supabase = globalSupabase;

  // ── A. Client Ready Event & Slash Command Registration ──────────────────
  client.once("clientReady", async () => {
    try {
      if (supabase) {
        await ensureMasterQuestsSeeded(supabase);
      }

      // (Slash command /เควสของฉัน ลงทะเบียนรวมที่ slashCommandRegistry)

      // ตั้งเวลา Cleanup ขยะข้อมูลทุก 24 ชั่วโมง
      setInterval(() => runAutoCleanup(supabase), 24 * 60 * 60 * 1000);
    } catch (err) {
      console.error("[dailyQuest] Error registering slash commands on ready:", err);
    }
  });

  function isServerOwner(interactionOrMessage) {
    const userId = interactionOrMessage.user?.id || interactionOrMessage.author?.id;
    const guild = interactionOrMessage.guild;
    return isOwnerUser(userId, guild);
  }

  // ── B. Slash Command & Message Trigger Handler ───────────────────────────
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const cmd = interaction.commandName.toLowerCase();
    if (cmd !== "เควสของฉัน") return;

    const userId = interaction.user.id;
    if (!isOwnerUser(userId, interaction.guild)) {
      return await safeRespond(interaction, {
        content: "🔒 **ระบบภารกิจประจำวัน (Daily Quests)** ขณะนี้อยู่ในช่วงทดสอบระบบเฉพาะ Owner ค่ะ",
        flags: FLAG_EPHEMERAL
      });
    }

    await safeDeferReply(interaction);

    try {
      // 🔄 Real-time Flush: ถ้าผู้เล่นนั่งอยู่ในห้องเสียงอยู่ ให้คำนวณเวลานาทีสะสมทันที
      const voiceChannel = interaction.member?.voice?.channel;
      const joinTime = voiceJoinTimes.get(userId);
      if (voiceChannel) {
        if (!joinTime) {
          // หากผู้ใช้นั่งอยู่ในห้องเสียงอยู่ก่อนแล้ว (เช่น ก่อนรีสตาร์ทบอท) ให้เริ่มจับเวลา ณ ปัจจุบันทันที
          voiceJoinTimes.set(userId, Date.now());
        } else {
          const flushedMinutes = await flushVoiceProgressRealtime(supabase, userId, voiceChannel, joinTime);
          if (flushedMinutes >= 1) {
            // เลื่อนเวลาเริ่มต้นขึ้นเฉพาะจำนวนนาทีที่บันทึกแล้ว เพื่อรักษาวินาทีเศษไม่ให้โดนล้างทิ้ง
            voiceJoinTimes.set(userId, joinTime + (flushedMinutes * 60 * 1000));
          }
        }
      }

      // 🔄 Real-time Game Flush: ถ้าผู้เล่นกำลังเปิดเกมอยู่ ให้คำนวณเวลานาทีสะสมทันที
      const memberPresence = interaction.member?.presence;
      const gameActivity = memberPresence?.activities?.find(a => a.type === 0 && a.name);
      if (gameActivity && !gameSessions.has(userId)) {
        gameSessions.set(userId, { gameName: gameActivity.name, startTime: Date.now() });
      }
      await flushGameProgressRealtime(supabase, userId, gameSessions);

      const { quests, summary } = await getOrAssignDailyQuests(supabase, userId);
      const weeklyInfo = await getWeeklyProgress(supabase, userId);
      const payload = buildDailyQuestPayload(userId, quests, summary, weeklyInfo);

      await safeRespond(interaction, payload);
    } catch (err) {
      console.error("[dailyQuest] Error handling slash command /เควสของฉัน:", err);
      await safeRespond(interaction, {
        content: "❌ เกิดข้อผิดพลาดในการโหลดภารกิจประจำวัน กรุณาลองใหม่อีกครั้งค่ะ",
        flags: FLAG_EPHEMERAL
      });
    }
  });

  // ── C. Chat Progress Tracker ──────────────────────────────────────────
  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;
    const userId = message.author.id;
    if (!isOwnerUser(userId, message.guild)) return; // จำกัดเฉพาะ Owner ตามคำสั่ง
    const now = Date.now();
    const lastChatTime = chatCooldowns.get(userId) || 0;

    // Cooldown 5 วินาทีต่อข้อความ เพื่อป้องกันการสแปม
    if (now - lastChatTime >= 5000) {
      chatCooldowns.set(userId, now);

      // อัปเดตภารกิจประเภท MESSAGE_COUNT
      await addProgress(supabase, userId, "MESSAGE_COUNT", 1);

      // เช็คกรณีเป็น Reply ตอบกลับ
      if (message.reference && message.reference.messageId) {
        try {
          const repliedMsg = await message.channel.messages.fetch(message.reference.messageId);
          if (repliedMsg && repliedMsg.author.id !== userId && !repliedMsg.author.bot) {
            // สมาชิกที่โดน Reply จะได้ Progress ในภารกิจ CHAT-03 (MESSAGE_REPLIED)
            await addProgress(supabase, repliedMsg.author.id, "MESSAGE_REPLIED", 1);
          }
        } catch (e) {
          // Ignore fetch error
        }
      }
    }
  });

  // ── E. Voice Progress Tracker ───────────────────────────────────────────
  client.on("voiceStateUpdate", async (oldState, newState) => {
    const userId = newState.id || oldState.id;
    const member = newState.member || oldState.member;

    if (!member || member.user.bot) return;
    if (!isOwnerUser(userId, member.guild)) return; // จำกัดเฉพาะ Owner ตามคำสั่ง

    // กรณีสมาชิกร่วมเข้าห้องเสียง
    if (!oldState.channelId && newState.channelId) {
      voiceJoinTimes.set(userId, Date.now());
      await addProgress(supabase, userId, "VOICE_CHANNELS", 1);
    }
    // กรณีสมาชิกออกจากห้องเสียง หรือย้ายห้องเสียง
    else if (oldState.channelId) {
      const joinTime = voiceJoinTimes.get(userId);
      if (joinTime) {
        const durationMinutes = Math.floor((Date.now() - joinTime) / (1000 * 60));

        if (durationMinutes >= 1) {
          await addProgress(supabase, userId, "VOICE_MINUTES", durationMinutes);

          if (durationMinutes >= 3) {
            await addProgress(supabase, userId, "VOICE_SESSIONS", 1);
          }

          const oldChannel = oldState.channel;
          if (oldChannel) {
            const size = oldChannel.members.size;
            if (size >= 2) {
              await addProgress(supabase, userId, "VOICE_WITH_FRIENDS", durationMinutes);
            }
            if (size >= 3) {
              await addProgress(supabase, userId, "VOICE_CROWD", durationMinutes);
            }
          }
        }
      }

      if (newState.channelId) {
        // ย้ายห้องเสียง -> เริ่มนับเวลาใหม่ในห้องใหม่
        voiceJoinTimes.set(userId, Date.now());
        await addProgress(supabase, userId, "VOICE_CHANNELS", 1);
      } else {
        // ออกจากห้องเสียงโดยสมบูรณ์
        voiceJoinTimes.delete(userId);
      }
    }
  });

  // ── F. Component Button & Selection Interactions ────────────────────────
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
    const customId = interaction.customId;

    if (!customId.startsWith("dq_")) return;

    // ตรวจสอบ Ownership ของการ์ดข้อความสาธารณะ
    const parts = customId.split("_");
    const targetUserId = parts[parts.length - 1];
    if (targetUserId && /^\d{17,20}$/.test(targetUserId)) {
      if (interaction.user.id !== targetUserId) {
        return await safeRespond(interaction, {
          content: `❌ เมนูภารกิจนี้เป็นของ <@${targetUserId}> ค่ะ (พิมพ์ \`/เควสของฉัน\` เพื่อเปิดเมนูของคุณนะคะ)`,
          flags: FLAG_EPHEMERAL
        });
      }
    }

    const userId = interaction.user.id;

    // 0. กดปุ่มรีเฟรชข้อมูล (dq_refresh)
    if (customId.startsWith("dq_refresh")) {
      await safeDeferUpdate(interaction);
      // 🔄 Real-time Voice Flush: ถ้าผู้เล่นนั่งอยู่ในห้องเสียงอยู่ ให้คำนวณเวลานาทีสะสมทันที
      const voiceChannel = interaction.member?.voice?.channel;
      const joinTime = voiceJoinTimes.get(userId);
      if (voiceChannel) {
        if (!joinTime) {
          voiceJoinTimes.set(userId, Date.now());
        } else {
          const flushedMinutes = await flushVoiceProgressRealtime(supabase, userId, voiceChannel, joinTime);
          if (flushedMinutes >= 1) {
            voiceJoinTimes.set(userId, joinTime + (flushedMinutes * 60 * 1000));
          }
        }
      }

      // 🔄 Real-time Game Flush: ถ้าผู้เล่นเปิดเกมอยู่ ให้คำนวณเวลานาทีสะสมทันที
      const memberPresence = interaction.member?.presence;
      const gameActivity = memberPresence?.activities?.find(a => a.type === 0 && a.name);
      if (gameActivity && !gameSessions.has(userId)) {
        gameSessions.set(userId, { gameName: gameActivity.name, startTime: Date.now() });
      }
      await flushGameProgressRealtime(supabase, userId, gameSessions);

      const { quests, summary } = await getOrAssignDailyQuests(supabase, userId);
      const weeklyInfo = await getWeeklyProgress(supabase, userId);
      const payload = buildDailyQuestPayload(userId, quests, summary, weeklyInfo);
      return safeRespond(interaction, payload);
    }

    // 0.5 กดปุ่มสลับเปิด-ปิดเควสเกม (dq_toggle_game)
    if (customId.startsWith("dq_toggle_game")) {
      await safeDeferUpdate(interaction);
      await toggleGameQuestPreference(supabase, userId);
      const { quests, summary } = await getOrAssignDailyQuests(supabase, userId);
      const weeklyInfo = await getWeeklyProgress(supabase, userId);
      const payload = buildDailyQuestPayload(userId, quests, summary, weeklyInfo);
      return safeRespond(interaction, payload);
    }

    // 1. กดรับรางวัลข้อเดียว (dq_claim_QUESTID)
    if (customId.startsWith("dq_claim_") && !customId.startsWith("dq_claim_all") && !customId.startsWith("dq_claim_weekly")) {
      await safeDeferUpdate(interaction);
      // dq_claim_QUESTID_USERID -> parts[2]
      const questId = parts[2];
      const res = await claimReward(supabase, userId, questId);

      if (res.success) {
        const { quests, summary } = await getOrAssignDailyQuests(supabase, userId);
        const weeklyInfo = await getWeeklyProgress(supabase, userId);
        const payload = buildDailyQuestPayload(userId, quests, summary, weeklyInfo);
        return safeRespond(interaction, payload);
      } else {
        return safeRespond(interaction, {
          content: "❌ ไม่สามารถรับรางวัลได้ หรือกดรับรางวัลไปแล้วค่ะ",
          flags: FLAG_EPHEMERAL
        });
      }
    }

    // 2. กดรับรางวัลทั้งหมด (dq_claim_all)
    if (customId.startsWith("dq_claim_all")) {
      await safeDeferUpdate(interaction);
      const res = await claimAllRewards(supabase, userId);

      if (res.success) {
        const { quests, summary } = await getOrAssignDailyQuests(supabase, userId);
        const weeklyInfo = await getWeeklyProgress(supabase, userId);
        const payload = buildDailyQuestPayload(userId, quests, summary, weeklyInfo);
        return safeRespond(interaction, payload);
      } else {
        return safeRespond(interaction, {
          content: "⚠️ ไม่มีภารกิจที่รอการรับรางวัลในขณะนี้ค่ะ",
          flags: FLAG_EPHEMERAL
        });
      }
    }

    // 2.5 กดรับโบนัสสะสมประจำสัปดาห์ (dq_claim_weekly)
    if (customId.startsWith("dq_claim_weekly")) {
      await safeDeferUpdate(interaction);
      const res = await claimWeeklyMilestone(supabase, userId);

      if (res.success) {
        const { quests, summary } = await getOrAssignDailyQuests(supabase, userId);
        const weeklyInfo = await getWeeklyProgress(supabase, userId);
        const payload = buildDailyQuestPayload(userId, quests, summary, weeklyInfo);
        return safeRespond(interaction, payload);
      } else {
        return safeRespond(interaction, {
          content: `⚠️ ${res.message}`,
          flags: FLAG_EPHEMERAL
        });
      }
    }

    // 3. กดปุ่มเปลี่ยนภารกิจ (dq_reroll_menu) ➔ เปิด Select Menu ให้เลือกข้อที่จะเปลี่ยน
    if (customId.startsWith("dq_reroll_menu")) {
      const { quests, summary } = await getOrAssignDailyQuests(supabase, userId);

      if ((summary.reroll_used || 0) >= 1) {
        return safeRespond(interaction, {
          content: "⚠️ คุณได้ใช้สิทธิ์เปลี่ยนภารกิจของวันนี้ไปแล้วค่ะ",
          flags: FLAG_EPHEMERAL
        });
      }

      // ดึงเฉพาะภารกิจที่ยังไม่สำเร็จ
      const incompleteQuests = quests.filter(q => !q.is_completed);
      if (incompleteQuests.length === 0) {
        return safeRespond(interaction, {
          content: "🎉 คุณทำภารกิจสำเร็จครบทุกข้อแล้ว ไม่สามารถสุ่มเปลี่ยนได้ค่ะ",
          flags: FLAG_EPHEMERAL
        });
      }

      const options = incompleteQuests.map(q => ({
        label: `${q.title} (${q.reward_points} แต้ม)`,
        description: `สุ่มเปลี่ยนภารกิจหมวด ${q.category}`,
        value: q.quest_id
      }));

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId("dq_reroll_select")
        .setPlaceholder("เลือกภารกิจที่ต้องการสุ่มเปลี่ยนใหม่...")
        .addOptions(options);

      const row = new ActionRowBuilder().addComponents(selectMenu);

      return safeRespond(interaction, {
        content: "🔄 **เลือกภารกิจที่คุณต้องการเปลี่ยนใหม่ (เลือกได้ 1 ครั้ง/วัน):**",
        components: [row],
        flags: FLAG_EPHEMERAL
      });
    }

    // 4. เลือกภารกิจใน Select Menu (dq_reroll_select)
    if (customId === "dq_reroll_select" && interaction.isStringSelectMenu()) {
      await safeDeferUpdate(interaction);
      const selectedQuestId = interaction.values[0];
      const success = await rerollQuest(supabase, userId, selectedQuestId);

      if (success) {
        const { quests, summary } = await getOrAssignDailyQuests(supabase, userId);
        const weeklyInfo = await getWeeklyProgress(supabase, userId);
        const payload = buildDailyQuestPayload(userId, quests, summary, weeklyInfo);
        return safeRespond(interaction, payload);
      } else {
        return safeRespond(interaction, {
          content: "❌ ไม่สามารถเปลี่ยนภารกิจนี้ได้ค่ะ (อาจใช้สิทธิ์ไปแล้วหรือภารกิจสำเร็จไปแล้ว)",
          flags: FLAG_EPHEMERAL
        });
      }
    }
  });

  // ── G. Gaming Presence Tracker (Any Game - 30 Minutes) ──────────────────
  client.on("presenceUpdate", async (oldPresence, newPresence) => {
    if (!newPresence || !newPresence.userId) return;
    const userId = newPresence.userId;
    if (!isOwnerUser(userId, newPresence.guild)) return; // จำกัดเฉพาะ Owner ในช่วงทดสอบ

    const activities = newPresence.activities || [];
    // ค้นหา Activity ประเภท Playing (type 0)
    const gameActivity = activities.find(a => a.type === 0 && a.name);
    const existingSession = gameSessions.get(userId);

    if (gameActivity) {
      if (!existingSession) {
        // เริ่มเปิดเกมใหม่
        gameSessions.set(userId, { gameName: gameActivity.name, startTime: Date.now() });
      } else if (existingSession.gameName !== gameActivity.name) {
        // สลับเกมเล่น ➔ flush เวลาเกมเดิม แล้วเริ่มนับเกมใหม่
        const elapsedMinutes = Math.floor((Date.now() - existingSession.startTime) / (1000 * 60));
        if (elapsedMinutes >= 1) {
          await addProgress(supabase, userId, "GAME_MINUTES", elapsedMinutes);
        }
        gameSessions.set(userId, { gameName: gameActivity.name, startTime: Date.now() });
      }
    } else if (existingSession) {
      // ปิดเกม / หยุดเล่น
      const elapsedMinutes = Math.floor((Date.now() - existingSession.startTime) / (1000 * 60));
      gameSessions.delete(userId);
      if (elapsedMinutes >= 1) {
        await addProgress(supabase, userId, "GAME_MINUTES", elapsedMinutes);
      }
    }
  });
}

function trackUserDailyQuestProgress(userId, trackerType, amount = 1, guild = null) {
  if (!userId || !trackerType) return;
  // จำกัดการเก็บข้อมูลเฉพาะ Server / Bot Owner ตามความต้องการของผู้ใช้
  if (!isOwnerUser(userId, guild)) return;

  addProgress(globalSupabase, userId, trackerType, amount).catch(() => {});
}

module.exports = {
  setupDailyQuest,
  trackUserDailyQuestProgress
};
