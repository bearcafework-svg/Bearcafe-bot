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
  runAutoCleanup
} = require("./dailyQuestManager");
const sharedConfig = require("../../sharedSettings.json");

const FLAG_V2 = 32768; // MessageFlags.IsComponentsV2
const FLAG_EPHEMERAL = 64; // MessageFlags.Ephemeral

// Map สำหรับเก็บ Cooldown การนับแชทป้องกันการสแปม (User ID -> timestamp)
const chatCooldowns = new Map();
// Map สำหรับเก็บเวลาเข้าห้องเสียง (User ID -> timestamp)
const voiceJoinTimes = new Map();

let globalSupabase = null;

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

      const { getValidGuild } = require("../../../utils/guildFilter");
      const guildId = process.env.GUILD_ID || "1144251788493602848";
      const guild = getValidGuild(client, guildId);

      if (guild) {
        // ลงทะเบียน Slash Command /quest และ /daily
        await guild.commands.create({
          name: "quest",
          description: "☕ เปิดเมนูภารกิจคาเฟ่ประจำวัน (Daily Quests)"
        });

        await guild.commands.create({
          name: "daily",
          description: "☕ เปิดเมนูภารกิจคาเฟ่ประจำวัน (Daily Quests)"
        });

        console.log("[dailyQuest] Registered Slash Commands /quest and /daily successfully.");
      }

      // ตั้งเวลา Cleanup ขยะข้อมูลทุก 24 ชั่วโมง
      setInterval(() => runAutoCleanup(supabase), 24 * 60 * 60 * 1000);
    } catch (err) {
      console.error("[dailyQuest] Error registering slash commands on ready:", err);
    }
  });

  // ── Helper: ตรวจสอบสิทธิ์ Owner ──────────────────────────────────────────
  function isServerOwner(interactionOrMessage) {
    const userId = interactionOrMessage.user?.id || interactionOrMessage.author?.id;
    const guild = interactionOrMessage.guild;
    const envOwnerId = process.env.OWNER_ID;

    if (envOwnerId && userId === envOwnerId) return true;
    if (guild && guild.ownerId === userId) return true;

    // เช็คกรณีเป็น Admin / Staff จาก sharedConfig
    const member = interactionOrMessage.member;
    if (member && sharedConfig.staff_roles) {
      const isStaff = sharedConfig.staff_roles.some(roleId => member.roles.cache?.has(roleId));
      if (isStaff) return true;
    }

    return false;
  }

  // ── B. Slash Command & Message Trigger Handler ───────────────────────────
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    const cmd = interaction.commandName.toLowerCase();
    if (cmd !== "quest" && cmd !== "daily") return;

    // ตรวจสอบสิทธิ์ Owner / Staff ก่อน
    if (!isServerOwner(interaction)) {
      return interaction.reply({
        content: "⚠️ **คำสั่งนี้เปิดใช้งานเฉพาะ Owner / Staff ของเซิร์ฟเวอร์ในขณะนี้ค่ะ**",
        flags: FLAG_EPHEMERAL
      });
    }

    const userId = interaction.user.id;

    try {
      const { quests, summary } = await getOrAssignDailyQuests(supabase, userId);
      const payload = buildDailyQuestPayload(userId, quests, summary);

      await interaction.reply(payload);
    } catch (err) {
      console.error("[dailyQuest] Error handling slash command /quest:", err);
      await interaction.reply({
        content: "❌ เกิดข้อผิดพลาดในการโหลดภารกิจประจำวัน กรุณาลองใหม่อีกครั้งค่ะ",
        flags: FLAG_EPHEMERAL
      });
    }
  });

  // ── C. Text Command (b!quest, b!daily) ──────────────────────────────────
  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;
    const content = message.content.trim().toLowerCase();

    if (content === "b!quest" || content === "b!daily") {
      if (!isServerOwner(message)) {
        return message.reply({
          content: "⚠️ **คำสั่งนี้เปิดใช้งานเฉพาะ Owner ของเซิร์ฟเวอร์ในขณะนี้ค่ะ**"
        });
      }

      const userId = message.author.id;
      const { quests, summary } = await getOrAssignDailyQuests(supabase, userId);
      const payload = buildDailyQuestPayload(userId, quests, summary);

      return message.reply(payload);
    }

    // ── D. Chat Progress Tracker ──────────────────────────────────────────
    const userId = message.author.id;
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

    // กรณีสมาชิกร่วมเข้าห้องเสียง
    if (!oldState.channelId && newState.channelId) {
      voiceJoinTimes.set(userId, Date.now());
      await addProgress(supabase, userId, "VOICE_CHANNELS", 1);
    }
    // กรณีสมาชิกออกจากห้องเสียง
    else if (oldState.channelId && !newState.channelId) {
      const joinTime = voiceJoinTimes.get(userId);
      if (joinTime) {
        const durationMinutes = Math.floor((Date.now() - joinTime) / (1000 * 60));
        voiceJoinTimes.delete(userId);

        if (durationMinutes >= 1) {
          await addProgress(supabase, userId, "VOICE_MINUTES", durationMinutes);

          if (durationMinutes >= 30) {
            await addProgress(supabase, userId, "VOICE_CONTINUOUS", durationMinutes);
          }

          // เช็คว่ามีสมาชิกคนอื่นในห้องด้วยหรือไม่
          const oldChannel = oldState.channel;
          if (oldChannel && oldChannel.members.size >= 2) {
            await addProgress(supabase, userId, "VOICE_WITH_FRIENDS", durationMinutes);
          }
        }
      }
    }
  });

  // ── F. Component Button & Selection Interactions ────────────────────────
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;
    const customId = interaction.customId;

    if (!customId.startsWith("dq_")) return;

    const userId = interaction.user.id;

    // 1. กดรับรางวัลข้อเดียว (dq_claim_QUESTID)
    if (customId.startsWith("dq_claim_") && customId !== "dq_claim_all") {
      const questId = customId.replace("dq_claim_", "");
      const res = await claimReward(supabase, userId, questId);

      if (res.success) {
        const { quests, summary } = await getOrAssignDailyQuests(supabase, userId);
        const payload = buildDailyQuestPayload(userId, quests, summary);
        return interaction.update(payload);
      } else {
        return interaction.reply({
          content: "❌ ไม่สามารถรับรางวัลได้ หรือกดรับรางวัลไปแล้วค่ะ",
          flags: FLAG_EPHEMERAL
        });
      }
    }

    // 2. กดรับรางวัลทั้งหมด (dq_claim_all)
    if (customId === "dq_claim_all") {
      const res = await claimAllRewards(supabase, userId);

      if (res.success) {
        const { quests, summary } = await getOrAssignDailyQuests(supabase, userId);
        const payload = buildDailyQuestPayload(userId, quests, summary);
        await interaction.update(payload);
        return interaction.followUp({
          content: `🎉 **ยินดีด้วยค่ะ! คุณได้รับแต้มสะสมทั้งหมด +${res.totalEarned} แต้มเรียบร้อยแล้วค่ะ!** 🍓`,
          flags: FLAG_EPHEMERAL
        });
      } else {
        return interaction.reply({
          content: "⚠️ ไม่มีภารกิจที่รอการรับรางวัลในขณะนี้ค่ะ",
          flags: FLAG_EPHEMERAL
        });
      }
    }

    // 3. กดปุ่มเปลี่ยนภารกิจ (dq_reroll_menu) ➔ เปิด Select Menu ให้เลือกข้อที่จะเปลี่ยน
    if (customId === "dq_reroll_menu") {
      const { quests, summary } = await getOrAssignDailyQuests(supabase, userId);

      if ((summary.reroll_used || 0) >= 1) {
        return interaction.reply({
          content: "⚠️ คุณได้ใช้สิทธิ์เปลี่ยนภารกิจของวันนี้ไปแล้วค่ะ",
          flags: FLAG_EPHEMERAL
        });
      }

      // ดึงเฉพาะภารกิจที่ยังไม่สำเร็จ
      const incompleteQuests = quests.filter(q => !q.is_completed);
      if (incompleteQuests.length === 0) {
        return interaction.reply({
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

      return interaction.reply({
        content: "🔄 **เลือกภารกิจที่คุณต้องการเปลี่ยนใหม่ (เลือกได้ 1 ครั้ง/วัน):**",
        components: [row],
        flags: FLAG_EPHEMERAL
      });
    }

    // 4. เลือกภารกิจใน Select Menu (dq_reroll_select)
    if (customId === "dq_reroll_select" && interaction.isStringSelectMenu()) {
      const selectedQuestId = interaction.values[0];
      const success = await rerollQuest(supabase, userId, selectedQuestId);

      if (success) {
        return interaction.reply({
          content: "✅ **สุ่มเปลี่ยนภารกิจใหม่สำเร็จเรียบร้อยแล้วค่ะ! กรุณากดปุ่มอัปเดตเพื่อดูภารกิจใหม่ค่ะ** 🐻✨",
          flags: FLAG_EPHEMERAL
        });
      } else {
        return interaction.reply({
          content: "❌ ไม่สามารถเปลี่ยนภารกิจนี้ได้ค่ะ (อาจใช้สิทธิ์ไปแล้วหรือภารกิจสำเร็จไปแล้ว)",
          flags: FLAG_EPHEMERAL
        });
      }
    }
  });
}

function trackUserDailyQuestProgress(userId, trackerType, amount = 1) {
  if (globalSupabase && userId && trackerType) {
    addProgress(globalSupabase, userId, trackerType, amount).catch(() => {});
  }
}

module.exports = {
  setupDailyQuest,
  trackUserDailyQuestProgress
};
