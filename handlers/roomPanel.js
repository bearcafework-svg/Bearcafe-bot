const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ComponentType,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} = require("discord.js");
const config = require("../config");
const { deleteRoom, getAllRooms, getRoom, updateRoom } = require("../state/redisClient");
const { syncAllSeparators } = require("../utils/separatorManager");
const { saveSmartRoomPreset } = require("../utils/smartRoomPresets");
const {
  EPHEMERAL_FLAG,
  safeDeferReply,
  safeDeleteChannel,
  safeDisconnectMember,
  safeRespond,
} = require("../utils/discordSafety");

const CUSTOM_IDS = {
  name: "p_314732019948982291",
  limit: "p_314732597651443713",
  lock: "p_314732736411602947",
  hide: "p_314732859879329797",
  trust: "p_314732993098813448",
  untrust: "p_314733100921708544",
  block: "p_314733274586943489",
  unblock: "p_314733300217905153",
  kick: "p_314733387149479938",
  delete: "p_314733640162480141",
  selectTrust: "room_panel_select_trust",
  selectUntrust: "room_panel_select_untrust",
  selectBlock: "room_panel_select_block",
  selectUnblock: "room_panel_select_unblock",
  selectKick: "room_panel_select_kick",
  modalName: "room_panel_modal_name",
  modalLimit: "room_panel_modal_limit",
};

const PANEL_BUTTON_IDS = new Set(Object.values(CUSTOM_IDS).filter((id) => id.startsWith("p_")));
const SET_VOICE_CHANNEL_STATUS = PermissionFlagsBits.SetVoiceChannelStatus || (1n << 48n);
const PANEL_ZONE_ID = "vip";
const DEPRECATED_TRANSFER_ID = "p_314733566908960771";

function ephemeral(options) {
  return { ...options, flags: EPHEMERAL_FLAG };
}

async function handleRoomPanel(message) {
  if (message.author.bot || !message.guild) return false;
  if (!message.mentions.users.has(message.client.user.id)) return false;

  const context = await getOwnedRoomContextFromMessage(message);
  if (!context) {
    await message.reply("แผงตั้งค่าใช้ได้เฉพาะเจ้าของห้อง VIP ที่กำลังอยู่ในห้องของตัวเองเท่านั้นค่ะ");
    return true;
  }

  await sendRoomPanel(context.channel, message.member, context.room);
  return true;
}

async function handleRoomPanelInteraction(interaction) {
  if (interaction.isButton() && interaction.customId === DEPRECATED_TRANSFER_ID) {
    return await respondEphemeral(interaction, { content: "ปุ่มเปลี่ยนเจ้าของห้องถูกปิดใช้งานแล้วค่ะ" });
  }

  if (interaction.isButton() && PANEL_BUTTON_IDS.has(interaction.customId)) {
    return await handlePanelButton(interaction);
  }

  if (interaction.isUserSelectMenu() && interaction.customId.startsWith("room_panel_select_")) {
    return await handlePanelUserSelect(interaction);
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith("room_panel_modal_")) {
    return await handlePanelModal(interaction);
  }

  return false;
}

async function sendRoomPanel(channel, ownerMember, room) {
  if (room.zoneId !== PANEL_ZONE_ID) {
    console.warn(`[roomPanel] blocked non-VIP panel send channel=${channel.id} zone=${room.zoneId} owner=${room.ownerId}`);
    return false;
  }

  const payload = createComponentV2PanelPayload(ownerMember, room);

  try {
    await channel.send(payload);
  } catch (e) {
    console.error("Component v2 panel send failed, using fallback:", e.message);
    await channel.send(createFallbackPanelPayload(ownerMember, room)).catch((fallbackError) => {
      console.error("Fallback room panel send failed:", fallbackError.message);
      throw fallbackError;
    });
  }
}

async function handlePanelButton(interaction) {
  if (interaction.customId === CUSTOM_IDS.name) {
    return await showNameModal(interaction);
  }

  if (interaction.customId === CUSTOM_IDS.limit) {
    return await showLimitModal(interaction);
  }

  await deferEphemeral(interaction);

  const context = await getOwnedRoomContextFromInteraction(interaction);
  if (!context) return await replyVipOnly(interaction);

  if (interaction.customId === CUSTOM_IDS.lock) {
    const settings = getSettings(context.room);
    const room = await updateRoom(context.channel.id, {
      settings: { ...settings, locked: !settings.locked },
    });
    await persistRoomPreset(context.channel, room);
    await applyRoomPermissions(context.channel, room);
    return await respondEphemeral(interaction, {
      content: `อัปเดตแล้วค่ะ\n${getPanelSummary(room)}`,
    });
  }

  if (interaction.customId === CUSTOM_IDS.hide) {
    const settings = getSettings(context.room);
    const room = await updateRoom(context.channel.id, {
      settings: { ...settings, hidden: !settings.hidden },
    });
    await persistRoomPreset(context.channel, room);
    await applyRoomPermissions(context.channel, room);
    return await respondEphemeral(interaction, {
      content: `อัปเดตแล้วค่ะ\n${getPanelSummary(room)}`,
    });
  }

  if (interaction.customId === CUSTOM_IDS.trust) {
    return await replyWithUserSelect(interaction, CUSTOM_IDS.selectTrust, "เลือกสมาชิกที่จะอนุญาตให้เข้าห้อง");
  }

  if (interaction.customId === CUSTOM_IDS.untrust) {
    return await replyWithUserSelect(interaction, CUSTOM_IDS.selectUntrust, "เลือกสมาชิกที่จะยกเลิกสิทธิ์เข้าห้อง");
  }

  if (interaction.customId === CUSTOM_IDS.block) {
    return await replyWithUserSelect(interaction, CUSTOM_IDS.selectBlock, "เลือกสมาชิกที่จะซ่อนห้องจากเขา");
  }

  if (interaction.customId === CUSTOM_IDS.unblock) {
    return await replyWithUserSelect(interaction, CUSTOM_IDS.selectUnblock, "เลือกสมาชิกที่จะเลิกซ่อนห้อง");
  }

  if (interaction.customId === CUSTOM_IDS.kick) {
    return await replyWithUserSelect(interaction, CUSTOM_IDS.selectKick, "เลือกสมาชิกที่จะเตะออกจากห้อง", 1);
  }

  if (interaction.customId === CUSTOM_IDS.delete) {
    await respondEphemeral(interaction, { content: "กำลังลบห้องค่ะ" });
    return await deleteOwnedRoom(interaction, context);
  }

  return false;
}

async function handlePanelUserSelect(interaction) {
  await deferEphemeral(interaction);

  const context = await getOwnedRoomContextFromInteraction(interaction);
  if (!context) return await replyVipOnly(interaction);

  const userIds = interaction.values;
  const members = [];
  for (const userId of userIds) {
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    if (member) members.push(member);
  }

  if (members.length === 0) {
    return await respondEphemeral(interaction, { content: "ไม่พบสมาชิกที่เลือกค่ะ" });
  }

  if (interaction.customId === CUSTOM_IDS.selectKick) {
    const member = members[0];
    if (!member.voice.channel || member.voice.channelId !== context.channel.id) {
      return await respondEphemeral(interaction, { content: "สมาชิกคนนั้นไม่ได้อยู่ในห้องนี้ค่ะ" });
    }
    const disconnected = await safeDisconnectMember(member, "Room owner kicked member");
    if (!disconnected) {
      return await respondEphemeral(interaction, { content: "สมาชิกคนนั้นไม่ได้อยู่ในห้องแล้วค่ะ" });
    }
    return await respondEphemeral(interaction, { content: `เตะ ${member} ออกจากห้องแล้วค่ะ` });
  }

  const settings = getSettings(context.room);
  const trustedUserIds = new Set(settings.trustedUserIds);
  const blockedUserIds = new Set(settings.blockedUserIds);

  for (const member of members) {
    if (member.id === context.room.ownerId) continue;

    if (interaction.customId === CUSTOM_IDS.selectTrust) {
      trustedUserIds.add(member.id);
      blockedUserIds.delete(member.id);
    }

    if (interaction.customId === CUSTOM_IDS.selectUntrust) {
      trustedUserIds.delete(member.id);
    }

    if (interaction.customId === CUSTOM_IDS.selectBlock) {
      blockedUserIds.add(member.id);
      trustedUserIds.delete(member.id);
    }

    if (interaction.customId === CUSTOM_IDS.selectUnblock) {
      blockedUserIds.delete(member.id);
    }
  }

  const room = await updateRoom(context.channel.id, {
    settings: {
      ...settings,
      trustedUserIds: [...trustedUserIds],
      blockedUserIds: [...blockedUserIds],
    },
  });

  await persistRoomPreset(context.channel, room);
  await applyRoomPermissions(context.channel, room);
  return await respondEphemeral(interaction, { content: `อัปเดตสิทธิ์สมาชิกแล้วค่ะ\n${getPanelSummary(room)}` });
}

async function handlePanelModal(interaction) {
  await deferEphemeral(interaction);

  const context = await getOwnedRoomContextFromInteraction(interaction);
  if (!context) return await replyVipOnly(interaction);

  if (interaction.customId === CUSTOM_IDS.modalName) {
    const name = interaction.fields.getTextInputValue("room_name").trim();
    if (!name || name.length > 100) {
      return await respondEphemeral(interaction, { content: "ชื่อห้องต้องมีความยาว 1-100 ตัวอักษรค่ะ" });
    }

    await context.channel.setName(name);
    const room = await updateRoom(context.channel.id, {
      settings: { ...getSettings(context.room), name },
    });
    await persistRoomPreset(context.channel, room);
    return await respondEphemeral(interaction, { content: `เปลี่ยนชื่อห้องเป็น **${name}** แล้วค่ะ\n${getPanelSummary(room)}` });
  }

  if (interaction.customId === CUSTOM_IDS.modalLimit) {
    const rawLimit = interaction.fields.getTextInputValue("room_limit").trim();
    const userLimit = Number.parseInt(rawLimit, 10);
    if (!Number.isInteger(userLimit) || userLimit < 0 || userLimit > 99) {
      return await respondEphemeral(interaction, { content: "ลิมิตต้องเป็นตัวเลข 0-99 ค่ะ" });
    }

    await context.channel.setUserLimit(userLimit);
    const room = await updateRoom(context.channel.id, {
      settings: { ...getSettings(context.room), limit: userLimit },
    });
    await persistRoomPreset(context.channel, room);
    return await respondEphemeral(interaction, {
      content: `ตั้งลิมิตห้องเป็น ${userLimit || "ไม่จำกัด"} แล้วค่ะ\n${getPanelSummary(room)}`,
    });
  }

  return false;
}

async function getOwnedRoomContextFromMessage(message) {
  const voiceChannel = message.member.voice.channel;
  if (!voiceChannel) return null;

  const room = await getRoom(voiceChannel.id);
  if (!room || room.ownerId !== message.author.id) return null;
  if (room.zoneId !== PANEL_ZONE_ID) {
    console.warn(`[roomPanel] blocked non-VIP panel request channel=${voiceChannel.id} zone=${room.zoneId} owner=${room.ownerId}`);
    return null;
  }

  return { channel: voiceChannel, room };
}

async function getOwnedRoomContextFromInteraction(interaction) {
  const room = await getRoom(interaction.channelId);
  const channel = interaction.channel;

  if (!room || !channel || room.ownerId !== interaction.user.id) return null;
  if (room.zoneId !== PANEL_ZONE_ID) {
    console.warn(`[roomPanel] blocked non-VIP panel interaction channel=${channel.id} zone=${room.zoneId} owner=${room.ownerId} customId=${interaction.customId}`);
    return null;
  }
  return { channel, room };
}

async function showNameModal(interaction) {
  if (interaction.replied || interaction.deferred) return false;

  const modal = new ModalBuilder()
    .setCustomId(CUSTOM_IDS.modalName)
    .setTitle("เปลี่ยนชื่อห้อง")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("room_name")
          .setLabel("ชื่อห้องใหม่")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true)
          .setValue((interaction.channel?.name ?? "").slice(0, 100))
      )
    );

  await safeShowModal(interaction, modal);
  return true;
}

async function showLimitModal(interaction) {
  if (interaction.replied || interaction.deferred) return false;

  const modal = new ModalBuilder()
    .setCustomId(CUSTOM_IDS.modalLimit)
    .setTitle("เปลี่ยนจำนวนคน")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("room_limit")
          .setLabel("จำนวนคนสูงสุด 0-99")
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setValue(String(interaction.channel?.userLimit || 0))
      )
    );

  await safeShowModal(interaction, modal);
  return true;
}

async function safeShowModal(interaction, modal) {
  try {
    await interaction.showModal(modal);
    return true;
  } catch (err) {
    if (err.code !== 40060 && err.code !== 10062 && err.code !== 10003) {
      console.error("[roomPanel] show modal error:", err);
    }
    return false;
  }
}

async function replyWithUserSelect(interaction, customId, placeholder, maxValues = 10) {
  const row = new ActionRowBuilder().addComponents(
    new UserSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .setMinValues(1)
      .setMaxValues(maxValues)
  );

  await respondEphemeral(interaction, {
    content: placeholder,
    components: [row],
  });
  return true;
}

async function replyOwnerOnly(interaction) {
  await respondEphemeral(interaction, {
    content: "ใช้ได้เฉพาะเจ้าของห้องเท่านั้นค่ะ",
  });
  return true;
}

async function replyVipOnly(interaction) {
  await respondEphemeral(interaction, {
    content: "แผงตั้งค่าใช้ได้เฉพาะห้อง VIP เท่านั้นค่ะ",
  });
  return true;
}

async function deferEphemeral(interaction) {
  return await safeDeferReply(interaction, { flags: EPHEMERAL_FLAG });
}

async function respondEphemeral(interaction, payload) {
  await safeRespond(interaction, ephemeral(payload));
  return true;
}

async function deleteOwnedRoom(interaction, context) {
  const channelId = context.channel.id;
  const member = interaction.guild.members.cache.get(interaction.user.id);
  await safeDisconnectMember(member, "Room owner deleted room");
  await safeDeleteChannel(context.channel, "Room owner deleted room");
  await deleteRoom(channelId);

  const rooms = await getAllRooms();
  await syncAllSeparators(interaction.guild, rooms);
  return true;
}

function createComponentV2PanelPayload(ownerMember, room) {
  const summary = getPanelSummary(room);
  return {
    flags: 32768,
    components: [
      {
        type: 17,
        components: [
          { type: 14, spacing: 2 },
          {
            type: 10,
            content: `${ownerMember} ห้อง VIP ของคุณพร้อมแล้วค่ะ\n${summary}`,
          },
          { type: 14, spacing: 1, divider: false },
          {
            type: 1,
            components: [
              button(ButtonStyle.Secondary, CUSTOM_IDS.name, "เปลี่ยนชื่อห้อง", "✏️"),
              button(ButtonStyle.Secondary, CUSTOM_IDS.limit, "เปลี่ยนจำนวนคน", "👥"),
              button(ButtonStyle.Secondary, CUSTOM_IDS.lock, "ล็อค/ปลดล็อค", "🔓"),
              button(ButtonStyle.Secondary, CUSTOM_IDS.hide, "ซ่อน/เปิดมองเห็น", "👀"),
              button(ButtonStyle.Danger, CUSTOM_IDS.delete, "ลบห้อง", "🗑️"),
            ],
          },
          {
            type: 1,
            components: [
              button(ButtonStyle.Secondary, CUSTOM_IDS.trust, "อนุญาตสมาชิก", "➕"),
              button(ButtonStyle.Secondary, CUSTOM_IDS.untrust, "ยกเลิกอนุญาต", "➖"),
              button(ButtonStyle.Secondary, CUSTOM_IDS.block, "ซ่อนสมาชิก", "🙈"),
              button(ButtonStyle.Secondary, CUSTOM_IDS.unblock, "เลิกซ่อนสมาชิก", "👁️"),
              button(ButtonStyle.Secondary, CUSTOM_IDS.kick, "เตะสมาชิกออกจากห้อง", "📤"),
            ],
          },
          { type: 14, spacing: 2 },
        ],
      },
    ],
  };
}

function createFallbackPanelPayload(ownerMember, room) {
  return {
    content: `${ownerMember} ห้อง VIP ของคุณพร้อมแล้วค่ะ\n${getPanelSummary(room)}`,
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(CUSTOM_IDS.name).setLabel("เปลี่ยนชื่อห้อง").setEmoji("✏️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(CUSTOM_IDS.limit).setLabel("เปลี่ยนจำนวนคน").setEmoji("👥").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(CUSTOM_IDS.lock).setLabel("ล็อค/ปลดล็อค").setEmoji("🔓").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(CUSTOM_IDS.hide).setLabel("ซ่อน/เปิดมองเห็น").setEmoji("👀").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(CUSTOM_IDS.delete).setLabel("ลบห้อง").setEmoji("🗑️").setStyle(ButtonStyle.Danger)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(CUSTOM_IDS.trust).setLabel("อนุญาตสมาชิก").setEmoji("➕").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(CUSTOM_IDS.untrust).setLabel("ยกเลิกอนุญาต").setEmoji("➖").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(CUSTOM_IDS.block).setLabel("ซ่อนสมาชิก").setEmoji("🙈").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(CUSTOM_IDS.unblock).setLabel("เลิกซ่อนสมาชิก").setEmoji("👁️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(CUSTOM_IDS.kick).setLabel("เตะสมาชิกออกจากห้อง").setEmoji("📤").setStyle(ButtonStyle.Secondary)
      ),
    ],
  };
}

function button(style, customId, label, emoji) {
  return {
    style,
    type: ComponentType.Button,
    label,
    emoji: { name: emoji },
    custom_id: customId,
  };
}

function getSettings(room) {
  const settings = room.settings || {};
  return {
    locked: Boolean(settings.locked),
    hidden: Boolean(settings.hidden),
    trustedUserIds: settings.trustedUserIds || [],
    blockedUserIds: settings.blockedUserIds || [],
    limit: settings.limit,
    name: settings.name,
  };
}

function getStatusText(room) {
  const settings = getSettings(room);
  return `${settings.locked ? "ล็อค" : "ไม่ล็อค"} / ${settings.hidden ? "ซ่อน" : "มองเห็นได้"}`;
}

function getPanelSummary(room) {
  const settings = getSettings(room);
  const limit = Number.isInteger(settings.limit) ? settings.limit : "ค่าเริ่มต้น";

  return [
    `สถานะห้อง: **${getStatusText(room)}**`,
    `จำนวนคน: **${limit}**`,
    `อนุญาตให้เข้า: ${formatUserList(settings.trustedUserIds)}`,
    `ซ่อนจาก: ${formatUserList(settings.blockedUserIds)}`,
  ].join("\n");
}

function formatUserList(userIds = []) {
  if (!Array.isArray(userIds) || userIds.length === 0) return "ไม่มี";
  return userIds.slice(0, 10).map((id) => `<@${id}>`).join(", ");
}

async function persistRoomPreset(channel, room) {
  if (!room?.ownerId || !room?.zoneId) return false;
  return await saveSmartRoomPreset(room.ownerId, room.zoneId, getSettings(room));
}

async function applyRoomPermissions(channel, room) {
  const settings = getSettings(room);
  const overwrites = room.zoneId === "vip"
    ? getVipRoomOverwrites(channel, room, settings)
    : getDefaultRoomOverwrites(channel, room, settings);

  ensureBotOverwrite(channel, overwrites);
  await channel.permissionOverwrites.set(overwrites);
}

function getDefaultRoomOverwrites(channel, room, settings) {
  const overwrites = new Map();

  for (const overwrite of channel.parent?.permissionOverwrites.cache.values() || []) {
    overwrites.set(overwrite.id, {
      id: overwrite.id,
      allow: overwrite.allow.bitfield,
      deny: overwrite.deny.bitfield,
    });
  }

  const everyoneId = channel.guild.roles.everyone.id;
  const current = overwrites.get(everyoneId) || { id: everyoneId, allow: [], deny: [] };
  overwrites.set(everyoneId, {
    id: everyoneId,
    allow: current.allow,
    deny: [
      current.deny,
      ...(settings.hidden ? [PermissionFlagsBits.ViewChannel] : []),
      ...(settings.locked ? [PermissionFlagsBits.Connect] : []),
    ],
  });

  overwrites.set(room.ownerId, {
    id: room.ownerId,
    allow: ownerAllowPermissions(),
  });

  for (const userId of settings.trustedUserIds) {
    overwrites.set(userId, {
      id: userId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
    });
  }

  for (const userId of settings.blockedUserIds) {
    overwrites.set(userId, {
      id: userId,
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
    });
  }

  return [...overwrites.values()];
}

function getVipRoomOverwrites(channel, room, settings) {
  const vipPermissions = config.vipRoomPermissions || {};
  const overwrites = [
    {
      id: channel.guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.SendMessages],
    },
  ];

  if (vipPermissions.memberId) {
    const deniedPermissions = [
      ...(settings.hidden ? [PermissionFlagsBits.ViewChannel] : []),
      ...(settings.locked ? [PermissionFlagsBits.Connect] : []),
    ];

    overwrites.push({
      id: vipPermissions.memberId,
      allow: ownerAllowPermissions().filter((permission) => !deniedPermissions.includes(permission)),
      deny: deniedPermissions,
    });
  }

  if (vipPermissions.coffee1Id) {
    overwrites.push({
      id: vipPermissions.coffee1Id,
      allow: [PermissionFlagsBits.ViewChannel],
      deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
    });
  }

  if (vipPermissions.coffee2Id) {
    overwrites.push({
      id: vipPermissions.coffee2Id,
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
    });
  }

  overwrites.push({
    id: room.ownerId,
    allow: ownerAllowPermissions(),
  });

  for (const userId of settings.trustedUserIds) {
    overwrites.push({
      id: userId,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
    });
  }

  for (const userId of settings.blockedUserIds) {
    overwrites.push({
      id: userId,
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
    });
  }

  return overwrites;
}

function ownerAllowPermissions() {
  return [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.Connect,
    PermissionFlagsBits.Speak,
    PermissionFlagsBits.Stream,
    PermissionFlagsBits.UseVAD,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.ReadMessageHistory,
    SET_VOICE_CHANNEL_STATUS,
    PermissionFlagsBits.CreateEvents,
    PermissionFlagsBits.UseEmbeddedActivities,
    PermissionFlagsBits.ManageEvents,
    PermissionFlagsBits.UseExternalApps,
  ];
}

function ensureBotOverwrite(channel, overwrites) {
  const botId = channel.guild.members.me?.id || channel.client.user?.id;
  if (!botId) return;

  const botOverwrite = {
    id: botId,
    allow: botPanelPermissions(),
  };

  if (Array.isArray(overwrites)) {
    const existingIndex = overwrites.findIndex((overwrite) => overwrite.id === botId);
    if (existingIndex >= 0) {
      overwrites[existingIndex] = {
        ...overwrites[existingIndex],
        allow: mergePermissions(overwrites[existingIndex].allow, botOverwrite.allow),
      };
    } else {
      overwrites.push(botOverwrite);
    }
    return;
  }

  const existing = overwrites.get(botId);
  overwrites.set(botId, existing
    ? { ...existing, allow: mergePermissions(existing.allow, botOverwrite.allow) }
    : botOverwrite
  );
}

function botPanelPermissions() {
  return [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
    PermissionFlagsBits.EmbedLinks,
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.ManageChannels,
  ];
}

function mergePermissions(current = [], extra = []) {
  return [...new Set([current, extra].flat())];
}

module.exports = {
  applyRoomPermissions,
  handleRoomPanel,
  handleRoomPanelInteraction,
  sendRoomPanel,
};
