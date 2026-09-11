// ===================================================
// src/features/voiceBoard/index.js
// Main Controller สำหรับระบบบอร์ดห้องเสียงหาเพื่อน (Live Voice Board)
// ===================================================

const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");
const {
  getVoiceBoardData,
  ALLOWED_CATEGORY_IDS,
} = require("./services/voiceBoardService");
const {
  loadVoiceBoardConfig,
  saveVoiceBoardConfig,
  getActiveVoiceBoardConfig,
  getLastEditTimestamp,
  performVoiceBoardUpdate,
  queueVoiceBoardUpdate,
  checkLfgCooldown,
  recordLfgCooldown,
  setSpotlight,
  getSpotlight,
  clearSpotlight,
} = require("./services/voiceBoardState");
const {
  VOICE_BOARD_CUSTOM_IDS,
  LFG_ROLES,
  buildVoiceBoardPayload,
  buildLfgRoleSelectPayload,
} = require("./components/voiceBoardPayloads");

let discordClient = null;

/**
 * ติดตั้งระบบ Voice Board เข้ากับ Discord Client
 */
async function setupVoiceBoard(client) {
  discordClient = client;

  const isEnabled = process.env.ENABLE_VOICE_BOARD === "true";
  if (!isEnabled) {
    console.log("[voiceBoard] ⏸️ ระบบ Voice Board ถูกปิดการทำงานชั่วคราว (ENABLE_VOICE_BOARD != 'true')");
    return;
  }

  const isLocal =
    process.env.LOCAL_FAST_START === "true" ||
    process.env.DISABLE_BACKGROUND_SERVICES === "true";

  if (isLocal) {
    console.log("[voiceBoard] ⏭️ Skipping background voice board loop in Local/Dev fast mode.");
  } else {
    // วนรอบตรวจสอบและอัปเดตสถานะเกม/สมาชิกทุก 60 วินาที (Heartbeat Sync)
    setInterval(() => {
      if (discordClient) {
        performVoiceBoardUpdate(discordClient).catch(() => {});
      }
    }, 60000);
  }

  // รับ Interaction เมื่อสมาชิกกดปุ่ม, เลือกฟิลเตอร์, หรือส่ง Modal
  client.on("interactionCreate", async (interaction) => {
    try {
      await handleVoiceBoardInteraction(interaction);
    } catch (err) {
      console.error("[voiceBoard] Interaction handling error:", err.message);
    }
  });

  // รับ Presence Update เมื่อสมาชิกในห้องเสียงเริ่มเล่นเกมหรือเปลี่ยนเกม
  client.on("presenceUpdate", (oldPresence, newPresence) => {
    try {
      const member = newPresence?.member;
      if (member?.voice?.channelId) {
        triggerVoiceBoardUpdate(member.guild);
      }
    } catch (e) {}
  });

  // โหลดการตั้งค่าบอร์ดที่เคยบันทึกไว้
  const config = await loadVoiceBoardConfig().catch(() => null);
  if (config?.channelId && config?.messageId) {
    console.log(
      `[voiceBoard] Found active voice board config: channel=${config.channelId} message=${config.messageId}`
    );
    // อัปเดตบอร์ดครั้งแรกเมื่อบอทพร้อมทำงาน
    setTimeout(() => {
      performVoiceBoardUpdate(client).catch(console.error);
    }, 5000);
  } else {
    console.log("[voiceBoard] No active voice board registered yet. Use /send-component to deploy.");
  }
}

/**
 * ฟังก์ชันสำหรับทริกเกอร์อัปเดตบอร์ดเมื่อมี Voice Event หรือ Presence Event
 */
function triggerVoiceBoardUpdate(guild) {
  const client = guild?.client || discordClient;
  if (!client) return;
  queueVoiceBoardUpdate(client);
}

/**
 * จัดการ Interaction ทั้งหมดของระบบ Voice Board (ปุ่ม, Select Menu, Modal)
 */
async function handleVoiceBoardInteraction(interaction) {
  if (!interaction.customId) return false;

  const { lfgBtn, refreshBtn, lfgRoleSelect, lfgModalPrefix } = VOICE_BOARD_CUSTOM_IDS;

  // ── 1. ปุ่มกด "หาตี้ / เรียกเพื่อน" (LFG) ───────────────────────────
  if (interaction.isButton() && interaction.customId === lfgBtn) {
    const voiceChannel = interaction.member?.voice?.channel;

    // ต้องอยู่ในห้องเสียงก่อน
    if (!voiceChannel) {
      return interaction.reply({
        content: "❌ คุณต้องเชื่อมต่ออยู่ในห้องเสียงก่อนจึงจะกดเรียกเพื่อนได้นะคะ ✨",
        flags: 64, // Ephemeral
      });
    }

    // ต้องอยู่ใน Category ที่กำหนด
    if (!voiceChannel.parentId || !ALLOWED_CATEGORY_IDS.has(voiceChannel.parentId)) {
      return interaction.reply({
        content: "⚠️ ห้องเสียงที่คุณอยู่ไม่ได้อยู่ในโซนห้องที่เปิดให้เรียกเพื่อนได้ค่ะ",
        flags: 64,
      });
    }

    // ตรวจสอบ Cooldown (15 นาที/คน, 30 นาที/ห้อง)
    const cooldownCheck = checkLfgCooldown(interaction.user.id, voiceChannel.id);
    if (!cooldownCheck.allowed) {
      return interaction.reply({
        content: cooldownCheck.reason,
        flags: 64,
      });
    }

    // ส่ง Ephemeral Select Menu ให้เลือก 1 ใน 6 หมวดหมู่ยศ
    return interaction.reply(buildLfgRoleSelectPayload());
  }

  // ── 2. เลือกยศในเมนูดรอปดาวน์ LFG ────────────────────────────────
  if (interaction.isStringSelectMenu() && interaction.customId === lfgRoleSelect) {
    const selectedRoleId = interaction.values[0];
    const roleObj = LFG_ROLES.find((r) => r.id === selectedRoleId);
    if (!roleObj) {
      return interaction.reply({
        content: "❌ ไม่พบหมวดหมู่ยศที่เลือกค่ะ",
        flags: 64,
      });
    }

    // เปิด Modal ให้กรอกข้อความชวนเล่น
    const modalTitle = `📢 ชวนเพื่อน: ${roleObj.name}`.slice(0, 45);
    const modal = new ModalBuilder()
      .setCustomId(`${lfgModalPrefix}${selectedRoleId}`)
      .setTitle(modalTitle);

    const textInput = new TextInputBuilder()
      .setCustomId("vb_lfg_msg")
      .setLabel("ข้อความชวนเล่น / ชวนคุย (สั้นๆ)")
      .setStyle(TextInputStyle.Short)
      .setMaxLength(80)
      .setPlaceholder("เช่น หาตี้ Valorant 2 ที่ค่ะ / นั่งคุยงานฟังเพลง")
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(textInput));
    return interaction.showModal(modal);
  }

  // ── 3. ส่งฟอร์ม Modal เพื่อเริ่มหาตี้ (Ghost Ping & Spotlight) ──────
  if (interaction.isModalSubmit() && interaction.customId.startsWith(lfgModalPrefix)) {
    const roleId = interaction.customId.replace(lfgModalPrefix, "");
    const roleObj = LFG_ROLES.find((r) => r.id === roleId) || {
      id: roleId,
      name: "หาเพื่อน",
      emoji: "🎙️",
    };

    const msg = (interaction.fields.getTextInputValue("vb_lfg_msg") || "").trim();
    const voiceChannel = interaction.member?.voice?.channel;

    if (!voiceChannel) {
      return interaction.reply({
        content: "❌ คุณไม่ได้อยู่ในห้องเสียงแล้วค่ะ",
        flags: 64,
      });
    }

    // บันทึก Cooldown ทันที
    recordLfgCooldown(interaction.user.id, voiceChannel.id);

    // ส่ง Ghost Ping ในห้องที่ตั้งบอร์ด แล้วลบทิ้งใน 1.5 วินาที
    const boardConfig = getActiveVoiceBoardConfig();
    const boardChannel = boardConfig?.channelId
      ? interaction.guild.channels.cache.get(boardConfig.channelId) ||
        (await interaction.guild.channels.fetch(boardConfig.channelId).catch(() => null))
      : interaction.channel;

    if (boardChannel && boardChannel.isTextBased()) {
      boardChannel
        .send({
          content: `<@&${roleId}> 📢 **${
            interaction.member.displayName || interaction.user.username
          }** กำลังหาเพื่อนเข้าห้อง <#${voiceChannel.id}>: "${msg}"`,
        })
        .then((sentPing) => {
          setTimeout(() => {
            sentPing.delete().catch(() => {});
          }, 1500); // Ghost Ping ลบออกใน 1.5 วินาที
        })
        .catch(() => {});
    }

    // บันทึกสถานะ Spotlight (หมดอายุใน 20 นาที)
    setSpotlight({
      userId: interaction.user.id,
      voiceChannelId: voiceChannel.id,
      roleId: roleObj.id,
      roleName: roleObj.name,
      roleEmoji: roleObj.emoji,
      message: msg,
      expiresAt: Date.now() + 20 * 60 * 1000,
    });

    // ตอบกลับผู้ใช้แบบ Ephemeral
    await interaction.reply({
      content: `✅ ปิงเรียกเพื่อนยศ **${roleObj.emoji} ${roleObj.name}** และขึ้นป้าย Spotlight บนบอร์ดเรียบร้อยแล้วค่ะ! ✨`,
      flags: 64,
    });

    // ทริกเกอร์อัปเดตบอร์ดทันที
    performVoiceBoardUpdate(interaction.client, true).catch(console.error);
    return true;
  }

  // ── 4. กดปุ่มรีเฟรชข้อมูล ──────────────────────────────────────────
  if (interaction.isButton() && interaction.customId === refreshBtn) {
    const now = Date.now();
    const timeSinceLastEdit = now - getLastEditTimestamp();

    // หากเพิ่งอัปเดตไปไม่ถึง 10 วินาที ให้ตอบกลับแบบ Ephemeral ป้องกันการกดสแปม
    if (timeSinceLastEdit < 10000) {
      return interaction.reply({
        content: `⏱️ ข้อมูลบนบอร์ดเพิ่งได้รับการอัปเดตไปเมื่อสักครู่นี้ค่ะ (ระบบจะตรวจจับและอัปเดตอัตโนมัติทุก 30 วินาที)`,
        flags: 64, // Ephemeral
      });
    }

    await interaction.deferUpdate().catch(() => {});
    await performVoiceBoardUpdate(interaction.client, true).catch(() => {});
    return true;
  }

  return false;
}

/**
 * สร้างและส่งบอร์ดห้องเสียงไปยัง Channel ที่กำหนด (สำหรับ /send-component)
 */
async function createAndSendVoiceBoard(channel) {
  if (!channel || !channel.isTextBased()) return null;

  const data = await getVoiceBoardData(channel.guild, "all");
  const payload = buildVoiceBoardPayload(
    data || {
      guildId: channel.guild.id,
      guildName: channel.guild.name,
      totalOnlineCount: 0,
      totalRoomsCount: 0,
      gameRoomsCount: 0,
      chillRoomsCount: 0,
      lookingRoomsCount: 0,
      emptyRoomsCount: 0,
      emptyRooms: [],
      spotlight: getSpotlight(),
      rooms: [],
      updatedAt: Date.now(),
    }
  );

  const msg = await channel.send(payload);
  if (msg) {
    // บันทึก Message ID และ Channel ID ไว้ทันที เพื่อให้ระบบอัปเดต 24 ชม. ต่อเนื่อง
    await saveVoiceBoardConfig(channel.id, msg.id, channel.guild.id);
    console.log(
      `[voiceBoard] Successfully deployed voice board to channel #${channel.name} (${channel.id}), msgId=${msg.id}`
    );
  }
  return msg;
}

module.exports = {
  setupVoiceBoard,
  triggerVoiceBoardUpdate,
  handleVoiceBoardInteraction,
  createAndSendVoiceBoard,
  getVoiceBoardData,
  buildVoiceBoardPayload,
  VOICE_BOARD_CUSTOM_IDS,
};
