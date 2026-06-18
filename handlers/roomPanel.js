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

const CUSTOM_IDS = {
  name: "p_314732019948982291",
  limit: "p_314732597651443713",
  lock: "p_314732736411602947",
  hide: "p_314732859879329797",
  trust: "p_314732993098813448",
  block: "p_314733274586943489",
  kick: "p_314733387149479938",
  transfer: "p_314733566908960771",
  delete: "p_314733640162480141",
  selectTrust: "room_panel_select_trust",
  selectBlock: "room_panel_select_block",
  selectKick: "room_panel_select_kick",
  selectTransfer: "room_panel_select_transfer",
  modalName: "room_panel_modal_name",
  modalLimit: "room_panel_modal_limit",
};

const EPHEMERAL_FLAG = 64;
const PANEL_BUTTON_IDS = new Set(Object.values(CUSTOM_IDS).filter((id) => id.startsWith("p_")));

function ephemeral(options) {
  return { ...options, flags: EPHEMERAL_FLAG };
}

async function handleRoomPanel(message) {
  if (message.author.bot || !message.guild) return false;
  if (!message.mentions.users.has(message.client.user.id)) return false;

  const context = await getOwnedRoomContextFromMessage(message);
  if (!context) {
    await message.reply("ใช้ได้เฉพาะเจ้าของห้องที่กำลังอยู่ในห้องของตัวเองเท่านั้นค่ะ");
    return true;
  }

  await sendRoomPanel(context.channel, message.member, context.room);
  return true;
}

async function handleRoomPanelInteraction(interaction) {
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
  if (!context) return await replyOwnerOnly(interaction);

  if (interaction.customId === CUSTOM_IDS.lock) {
    const settings = getSettings(context.room);
    const room = await updateRoom(context.channel.id, {
      settings: { ...settings, locked: !settings.locked },
    });
    await applyRoomPermissions(context.channel, room);
    return await respondEphemeral(interaction, {
      content: `อัปเดตแล้วค่ะ ตอนนี้ห้อง **${room.settings.locked ? "ล็อค" : "ไม่ล็อค"}**`,
    });
  }

  if (interaction.customId === CUSTOM_IDS.hide) {
    const settings = getSettings(context.room);
    const room = await updateRoom(context.channel.id, {
      settings: { ...settings, hidden: !settings.hidden },
    });
    await applyRoomPermissions(context.channel, room);
    return await respondEphemeral(interaction, {
      content: `อัปเดตแล้วค่ะ ตอนนี้ห้อง **${room.settings.hidden ? "ซ่อน" : "มองเห็นได้"}**`,
    });
  }

  if (interaction.customId === CUSTOM_IDS.trust) {
    return await replyWithUserSelect(interaction, CUSTOM_IDS.selectTrust, "เลือกสมาชิกเพื่อเพิ่ม/ลบสิทธิ์เข้าห้อง");
  }

  if (interaction.customId === CUSTOM_IDS.block) {
    return await replyWithUserSelect(interaction, CUSTOM_IDS.selectBlock, "เลือกสมาชิกเพื่อซ่อน/เลิกซ่อนห้อง");
  }

  if (interaction.customId === CUSTOM_IDS.kick) {
    return await replyWithUserSelect(interaction, CUSTOM_IDS.selectKick, "เลือกสมาชิกที่จะตัดออกจากห้อง", 1);
  }

  if (interaction.customId === CUSTOM_IDS.transfer) {
    return await replyWithUserSelect(interaction, CUSTOM_IDS.selectTransfer, "เลือกเจ้าของห้องคนใหม่", 1);
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
  if (!context) return await replyOwnerOnly(interaction);

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
    if (member.voice.channelId !== context.channel.id) {
      return await respondEphemeral(interaction, { content: "สมาชิกคนนั้นไม่ได้อยู่ในห้องนี้ค่ะ" });
    }
    await member.voice.disconnect("Room owner kicked member");
    return await respondEphemeral(interaction, { content: `ตัด ${member} ออกจากห้องแล้วค่ะ` });
  }

  if (interaction.customId === CUSTOM_IDS.selectTransfer) {
    const member = members[0];
    const room = await updateRoom(context.channel.id, { ownerId: member.id });
    await applyRoomPermissions(context.channel, room);
    return await respondEphemeral(interaction, { content: `โอนเจ้าของห้องให้ ${member} แล้วค่ะ` });
  }

  const settings = getSettings(context.room);
  const trustedUserIds = new Set(settings.trustedUserIds);
  const blockedUserIds = new Set(settings.blockedUserIds);

  for (const member of members) {
    if (member.id === context.room.ownerId) continue;

    if (interaction.customId === CUSTOM_IDS.selectTrust) {
      if (trustedUserIds.has(member.id)) {
        trustedUserIds.delete(member.id);
      } else {
        trustedUserIds.add(member.id);
        blockedUserIds.delete(member.id);
      }
    }

    if (interaction.customId === CUSTOM_IDS.selectBlock) {
      if (blockedUserIds.has(member.id)) {
        blockedUserIds.delete(member.id);
      } else {
        blockedUserIds.add(member.id);
        trustedUserIds.delete(member.id);
      }
    }
  }

  const room = await updateRoom(context.channel.id, {
    settings: {
      ...settings,
      trustedUserIds: [...trustedUserIds],
      blockedUserIds: [...blockedUserIds],
    },
  });

  await applyRoomPermissions(context.channel, room);
  return await respondEphemeral(interaction, { content: "อัปเดตสิทธิ์สมาชิกแล้วค่ะ" });
}

async function handlePanelModal(interaction) {
  await deferEphemeral(interaction);

  const context = await getOwnedRoomContextFromInteraction(interaction);
  if (!context) return await replyOwnerOnly(interaction);

  if (interaction.customId === CUSTOM_IDS.modalName) {
    const name = interaction.fields.getTextInputValue("room_name").trim();
    if (!name || name.length > 100) {
      return await respondEphemeral(interaction, { content: "ชื่อห้องต้องมีความยาว 1-100 ตัวอักษรค่ะ" });
    }

    await context.channel.setName(name);
    await updateRoom(context.channel.id, {
      settings: { ...getSettings(context.room), name },
    });
    return await respondEphemeral(interaction, { content: `เปลี่ยนชื่อห้องเป็น **${name}** แล้วค่ะ` });
  }

  if (interaction.customId === CUSTOM_IDS.modalLimit) {
    const rawLimit = interaction.fields.getTextInputValue("room_limit").trim();
    const userLimit = Number.parseInt(rawLimit, 10);
    if (!Number.isInteger(userLimit) || userLimit < 0 || userLimit > 99) {
      return await respondEphemeral(interaction, { content: "ลิมิตต้องเป็นตัวเลข 0-99 ค่ะ" });
    }

    await context.channel.setUserLimit(userLimit);
    await updateRoom(context.channel.id, {
      settings: { ...getSettings(context.room), limit: userLimit },
    });
    return await respondEphemeral(interaction, {
      content: `ตั้งลิมิตห้องเป็น ${userLimit || "ไม่จำกัด"} แล้วค่ะ`,
    });
  }

  return false;
}

async function getOwnedRoomContextFromMessage(message) {
  const voiceChannel = message.member.voice.channel;
  if (!voiceChannel) return null;

  const room = await getRoom(voiceChannel.id);
  if (!room || room.ownerId !== message.author.id) return null;

  return { channel: voiceChannel, room };
}

async function getOwnedRoomContextFromInteraction(interaction) {
  const room = await getRoom(interaction.channelId);
  const channel = interaction.channel;

  if (!room || !channel || room.ownerId !== interaction.user.id) return null;
  return { channel, room };
}

async function showNameModal(interaction) {
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

  await interaction.showModal(modal);
  return true;
}

async function showLimitModal(interaction) {
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

  await interaction.showModal(modal);
  return true;
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

async function deferEphemeral(interaction) {
  if (interaction.replied || interaction.deferred) return true;
  try {
    await interaction.deferReply({ flags: EPHEMERAL_FLAG });
    return true;
  } catch (err) {
    if (err.code !== 40060 && err.code !== 10062 && err.code !== 10003) {
      console.error("[roomPanel] defer interaction error:", err);
    }
    return false;
  }
}

async function respondEphemeral(interaction, payload) {
  try {
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply(payload);
    } else if (interaction.replied || interaction.deferred) {
      await interaction.followUp(ephemeral(payload));
    } else {
      await interaction.reply(ephemeral(payload));
    }
  } catch (err) {
    if (err.code !== 40060 && err.code !== 10062 && err.code !== 10003) {
      console.error("[roomPanel] respond interaction error:", err);
    }
  }
  return true;
}

async function deleteOwnedRoom(interaction, context) {
  const channelId = context.channel.id;
  const member = interaction.guild.members.cache.get(interaction.user.id);
  await member?.voice?.disconnect("Room owner deleted room").catch(() => null);
  await context.channel.delete("Room owner deleted room");
  await deleteRoom(channelId);

  const rooms = await getAllRooms();
  await syncAllSeparators(interaction.guild, rooms);
  return true;
}

function createComponentV2PanelPayload(ownerMember, room) {
  const status = getStatusText(room);
  return {
    flags: 32768,
    components: [
      {
        type: 17,
        components: [
          { type: 14, spacing: 2 },
          {
            type: 10,
            content: `${ownerMember} ห้องของคุณพร้อมแล้วค่ะ ถ้าคุณกับเพื่อนคุยกันจนการตั้งค่าถูกดันไปข้างบนให้แท็ก <@${ownerMember.guild.client.user.id}> อีกรอบนะคะ <:cuteplant:1152834055528783872>\nสถานะห้อง: **${status}**`,
          },
          { type: 14, spacing: 1, divider: false },
          {
            type: 1,
            components: [
              button(ButtonStyle.Secondary, CUSTOM_IDS.name, "เปลี่ยนชื่อห้อง", "✏️"),
              button(ButtonStyle.Secondary, CUSTOM_IDS.limit, "เปลี่ยนจำนวนคน", "👥"),
              button(ButtonStyle.Secondary, CUSTOM_IDS.lock, "ล็อคหรือปลดล็อคห้อง", "🔓"),
              button(ButtonStyle.Secondary, CUSTOM_IDS.hide, "ซ่อนหรือเปิดการมองเห็นห้อง", "👀"),
              button(ButtonStyle.Secondary, CUSTOM_IDS.trust, "เพิ่ม-ลบเพื่อนเข้าห้อง", "➕"),
            ],
          },
          {
            type: 1,
            components: [
              button(ButtonStyle.Secondary, CUSTOM_IDS.block, "ซ่อนหรือเลิกซ่อนจากสมาชิก", "😶‍🌫️"),
              button(ButtonStyle.Secondary, CUSTOM_IDS.kick, "ตัดสมาชิกออกจากห้อง", "📤"),
              button(ButtonStyle.Primary, CUSTOM_IDS.transfer, "เปลี่ยนเจ้าของห้อง", "👑"),
              button(ButtonStyle.Danger, CUSTOM_IDS.delete, "ลบห้อง", "🗑️"),
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
    content: `${ownerMember} ห้องของคุณพร้อมแล้วค่ะ ถ้าต้องการเปิดแผงตั้งค่าอีกครั้ง ให้แท็ก <@${ownerMember.guild.client.user.id}>\nสถานะห้อง: **${getStatusText(room)}**`,
    components: [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(CUSTOM_IDS.name).setLabel("เปลี่ยนชื่อห้อง").setEmoji("✏️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(CUSTOM_IDS.limit).setLabel("เปลี่ยนจำนวนคน").setEmoji("👥").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(CUSTOM_IDS.lock).setLabel("ล็อค/ปลดล็อค").setEmoji("🔓").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(CUSTOM_IDS.hide).setLabel("ซ่อน/เปิดมองเห็น").setEmoji("👀").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(CUSTOM_IDS.trust).setLabel("เพิ่ม-ลบเพื่อน").setEmoji("➕").setStyle(ButtonStyle.Secondary)
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(CUSTOM_IDS.block).setLabel("ซ่อนสมาชิก").setEmoji("😶‍🌫️").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(CUSTOM_IDS.kick).setLabel("ตัดออก").setEmoji("📤").setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(CUSTOM_IDS.transfer).setLabel("เปลี่ยนเจ้าของ").setEmoji("👑").setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(CUSTOM_IDS.delete).setLabel("ลบห้อง").setEmoji("🗑️").setStyle(ButtonStyle.Danger)
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
    PermissionFlagsBits.AttachFiles,
    PermissionFlagsBits.AddReactions,
    PermissionFlagsBits.ReadMessageHistory,
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
