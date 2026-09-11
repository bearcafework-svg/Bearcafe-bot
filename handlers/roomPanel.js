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
  StringSelectMenuBuilder,
  OverwriteType,
} = require("discord.js");
const config = require("../config");
const { deleteRoom, getAllRooms, getRoom, updateRoom } = require("../state/redisClient");
const { syncAllSeparators } = require("../utils/separatorManager");
const { saveSmartRoomPreset, getSmartRoomPreset } = require("../utils/smartRoomPresets");
const {
  EPHEMERAL_FLAG,
  safeDeferReply,
  safeDeleteChannel,
  safeDisconnectMember,
  safeRespond,
} = require("../utils/discordSafety");
const { getSupabaseClient } = require("../src/services/supabaseClient");

const CUSTOM_IDS = {
  panelSelect: "vip_panel_select_action",
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
  image: "p_panel_custom_image",
  permissionsList: "p_permissions_list",
  selectTrust: "room_panel_select_trust",
  selectUntrust: "room_panel_select_untrust",
  selectBlock: "room_panel_select_block",
  selectUnblock: "room_panel_select_unblock",
  selectKick: "room_panel_select_kick",
  modalName: "room_panel_modal_name",
  modalLimit: "room_panel_modal_limit",
  modalImage: "room_panel_modal_image",
};

const VIP_SELECT_OPTIONS = [
  {
    label: "เปลี่ยนชื่อห้อง",
    description: "ตั้งชื่อห้อง VIP ของคุณใหม่",
    value: "vip_opt_name",
    emoji: { name: "✏️" },
  },
  {
    label: "เปลี่ยนจำนวนคน",
    description: "ปรับเปลี่ยนจำนวนสมาชิกสูงสุดที่เข้าห้องได้ (0-99)",
    value: "vip_opt_limit",
    emoji: { name: "👥" },
  },
  {
    label: "ล็อค / ปลดล็อคห้อง",
    description: "สลับสถานะล็อคห้อง (เปิด/ปิด ให้สมาชิกทั่วไปเข้า)",
    value: "vip_opt_lock",
    emoji: { name: "🔓" },
  },
  {
    label: "ซ่อน / เปิดมองเห็นห้อง",
    description: "สลับสถานะการซ่อนห้องจากรายชื่อห้อง",
    value: "vip_opt_hide",
    emoji: { name: "👀" },
  },
  {
    label: "อนุญาตสมาชิก (Trust)",
    description: "เพิ่มสมาชิกที่อนุญาตให้เข้าห้องได้เป็นพิเศษ",
    value: "vip_opt_trust",
    emoji: { name: "➕" },
  },
  {
    label: "ยกเลิกอนุญาตสมาชิก",
    description: "ถอดสิทธิ์พิเศษของสมาชิกที่เคยอนุญาตไว้",
    value: "vip_opt_untrust",
    emoji: { name: "➖" },
  },
  {
    label: "ซ่อนห้องจากสมาชิก (Block)",
    description: "ซ่อนห้องไม่ให้สมาชิกที่เลือกมองเห็น",
    value: "vip_opt_block",
    emoji: { name: "🙈" },
  },
  {
    label: "เลิกซ่อนห้องจากสมาชิก",
    description: "ยกเลิกการซ่อนห้อง ให้สมาชิกกลับมาเห็นห้องได้",
    value: "vip_opt_unblock",
    emoji: { name: "👁️" },
  },
  {
    label: "เตะสมาชิกออกจากห้อง",
    description: "เตะสมาชิกที่ไม่ต้องการออกจากห้องเสียงทันที",
    value: "vip_opt_kick",
    emoji: { name: "📤" },
  },
  {
    label: "ตรวจสอบสิทธิ์สมาชิก",
    description: "ดูรายชื่อสมาชิกที่ได้รับสิทธิ์หรือถูกบล็อคในห้อง",
    value: "vip_opt_permissions",
    emoji: { name: "📋" },
  },
  {
    label: "ตั้งค่ารูปภาพแผง",
    description: "กำหนดรูปภาพแบนเนอร์ของแผงควบคุมห้อง VIP",
    value: "vip_opt_image",
    emoji: { name: "🖼️" },
  },
  {
    label: "ลบห้อง VIP",
    description: "ลบห้องและตัดการเชื่อมต่อทุกคนออกจากห้องทันที",
    value: "vip_opt_delete",
    emoji: { name: "🗑️" },
  },
];

const { getRandomSessionAd, getGlobalCtaButton } = require("../src/services/sessionAdsService");

const PANEL_BUTTON_IDS = new Set(Object.values(CUSTOM_IDS).filter((id) => id.startsWith("p_")));
const SET_VOICE_CHANNEL_STATUS = PermissionFlagsBits.SetVoiceChannelStatus || (1n << 48n);
const PANEL_ZONE_ID = "vip";
const DEPRECATED_TRANSFER_ID = "p_314733566908960771";
const SPECIAL_IMAGE_ROLE_ID = "1383998275711012956";
const DEFAULT_VIP_IMAGE_URL =
  "https://cdn.discordapp.com/attachments/1524704267015819274/1532018949703729234/NewsBoard_-_bearcafe_17.png?ex=6a6b5355&is=6a6a01d5&hm=7f51d2a4e6791f5046fe887f0a1a23d91bc64806712520785e0209fd7c701b17&";

function ephemeral(options) {
  return { ...options, flags: EPHEMERAL_FLAG };
}

async function handleRoomPanel(message) {
  if (message.author.bot || !message.guild) return false;
  if (!message.mentions.users.has(message.client.user.id)) return false;

  const context = await getOwnedRoomContextFromMessage(message);
  if (!context) {
    // แจ้งเตือนเฉพาะเมื่อผู้ใช้พิมพ์คำสั่งที่สื่อถึงการเรียกแผงตั้งค่าเท่านั้น (เช่น panel, แผง, ตั้งค่า)
    const isPanelKeyword = /panel|แผง|ตั้งค่า/i.test(message.content);
    if (isPanelKeyword) {
      try {
        await message.reply("แผงตั้งค่าใช้ได้เฉพาะเจ้าของห้อง VIP ที่กำลังอยู่ในห้องของตัวเองเท่านั้นค่ะ");
      } catch (err) {
        if (err.code !== 10062) console.error("[roomPanel] reply error:", err.message);
      }
      return true;
    }
    return false;
  }

  await sendRoomPanel(context.channel, message.member, context.room);
  return true;
}

async function handleRoomPanelInteraction(interaction) {
  if (!interaction.customId || typeof interaction.customId !== "string") return false;

  if (interaction.isButton() && interaction.customId === DEPRECATED_TRANSFER_ID) {
    return await respondEphemeral(interaction, { content: "ปุ่มเปลี่ยนเจ้าของห้องถูกปิดใช้งานแล้วค่ะ" });
  }

  if (interaction.isStringSelectMenu() && interaction.customId === CUSTOM_IDS.panelSelect) {
    return await handleVipPanelSelect(interaction);
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

  let customImageUrl = null;
  const isSpecialRole = ownerMember?.roles?.cache?.has(SPECIAL_IMAGE_ROLE_ID);
  if (isSpecialRole) {
    if (room.settings?.imageUrl) {
      customImageUrl = room.settings.imageUrl;
    } else {
      const preset = await getSmartRoomPreset(room.ownerId, room.zoneId);
      if (preset?.imageUrl) {
        customImageUrl = preset.imageUrl;
      }
    }
  }

  let randomAd = null;
  let ctaBtn = null;
  if (!customImageUrl) {
    randomAd = await getRandomSessionAd();
    ctaBtn = await getGlobalCtaButton();
  }

  const payload = createComponentV2PanelPayload(ownerMember, room, customImageUrl, randomAd, ctaBtn);

  try {
    await channel.send(payload);
  } catch (e) {
    console.error("Component v2 panel send failed, using fallback:", e.message);
    await channel.send(createFallbackPanelPayload(ownerMember, room, customImageUrl, randomAd, ctaBtn)).catch((fallbackError) => {
      console.error("Fallback room panel send failed:", fallbackError.message);
      throw fallbackError;
    });
  }
}

async function buildUpdatedVipPanelPayload(member, room, channel, forcedImageUrl = null) {
  if (!room && channel) {
    room = await getRoom(channel.id);
  }
  if (!room) return null;

  let ownerMember = member;
  const targetGuild = channel?.guild || member?.guild;
  if (room.ownerId && targetGuild && (!ownerMember || ownerMember.id !== room.ownerId)) {
    const fetched = targetGuild.members.cache.get(room.ownerId) || (await targetGuild.members.fetch(room.ownerId).catch(() => null));
    if (fetched) {
      ownerMember = fetched;
    } else if (!ownerMember) {
      ownerMember = `<@${room.ownerId}>`;
    }
  }

  let customImageUrl = forcedImageUrl;
  const isSpecialRole = ownerMember?.roles?.cache?.has(SPECIAL_IMAGE_ROLE_ID);
  if (isSpecialRole && !customImageUrl) {
    if (room.settings?.imageUrl) {
      customImageUrl = room.settings.imageUrl;
    } else {
      const preset = await getSmartRoomPreset(room.ownerId, room.zoneId);
      if (preset?.imageUrl) {
        customImageUrl = preset.imageUrl;
      }
    }
  }

  let randomAd = null;
  let ctaBtn = null;
  if (!customImageUrl) {
    randomAd = await getRandomSessionAd();
    ctaBtn = await getGlobalCtaButton();
  }

  return createComponentV2PanelPayload(ownerMember, room, customImageUrl, randomAd, ctaBtn);
}

async function handleVipPanelSelect(interaction) {
  const context = await getOwnedRoomContextFromInteraction(interaction);
  if (!context) {
    const resetPayload = await buildUpdatedVipPanelPayload(null, null, interaction.channel);
    if (resetPayload) await interaction.update(resetPayload).catch(() => {});
    return await replyOwnerOnly(interaction);
  }

  const selected = interaction.values[0];
  const member = interaction.member;
  const room = context.room;
  const channel = context.channel;

  if (selected === "vip_opt_name") {
    await showNameModal(interaction);
    const updatedPayload = await buildUpdatedVipPanelPayload(member, room, channel);
    if (updatedPayload) await interaction.message?.edit(updatedPayload).catch(() => {});
    return true;
  }

  if (selected === "vip_opt_limit") {
    await showLimitModal(interaction);
    const updatedPayload = await buildUpdatedVipPanelPayload(member, room, channel);
    if (updatedPayload) await interaction.message?.edit(updatedPayload).catch(() => {});
    return true;
  }

  if (selected === "vip_opt_image") {
    const hasImageRole = member?.roles?.cache?.has(SPECIAL_IMAGE_ROLE_ID);
    if (!hasImageRole) {
      const updatedPayload = await buildUpdatedVipPanelPayload(member, room, channel);
      if (updatedPayload) await interaction.update(updatedPayload).catch(() => {});
      return await respondEphemeral(interaction, {
        content: `❌ ขออภัยค่ะ ฟังก์ชันตั้งค่ารูปภาพแผงสงวนสิทธิ์เฉพาะสมาชิกที่มีบทบาท <@&${SPECIAL_IMAGE_ROLE_ID}> เท่านั้นนะคะ`,
      });
    }

    await showImageModal(interaction);
    const updatedPayload = await buildUpdatedVipPanelPayload(member, room, channel);
    if (updatedPayload) await interaction.message?.edit(updatedPayload).catch(() => {});
    return true;
  }

  const updatedPayload = await buildUpdatedVipPanelPayload(member, room, channel);
  if (updatedPayload) {
    await interaction.update(updatedPayload).catch(() => {});
  } else {
    await interaction.deferUpdate().catch(() => {});
  }

  if (selected === "vip_opt_lock") {
    const settings = getSettings(room);
    const updatedRoom = await updateRoom(channel.id, {
      settings: { ...settings, locked: !settings.locked },
    });
    await persistRoomPreset(channel, updatedRoom);
    await applyRoomPermissions(channel, updatedRoom);
    const refreshed = await buildUpdatedVipPanelPayload(member, updatedRoom, channel);
    if (refreshed) await interaction.message?.edit(refreshed).catch(() => {});
    return await respondEphemeral(interaction, {
      content: `อัปเดตแล้วค่ะ\n${getPanelSummary(updatedRoom)}`,
    });
  }

  if (selected === "vip_opt_hide") {
    const settings = getSettings(room);
    const updatedRoom = await updateRoom(channel.id, {
      settings: { ...settings, hidden: !settings.hidden },
    });
    await persistRoomPreset(channel, updatedRoom);
    await applyRoomPermissions(channel, updatedRoom);
    const refreshed = await buildUpdatedVipPanelPayload(member, updatedRoom, channel);
    if (refreshed) await interaction.message?.edit(refreshed).catch(() => {});
    return await respondEphemeral(interaction, {
      content: `อัปเดตแล้วค่ะ\n${getPanelSummary(updatedRoom)}`,
    });
  }

  if (selected === "vip_opt_trust") {
    return await replyWithUserSelect(interaction, CUSTOM_IDS.selectTrust, "เลือกสมาชิกที่จะอนุญาตให้เข้าห้อง");
  }

  if (selected === "vip_opt_untrust") {
    return await replyWithUserSelect(interaction, CUSTOM_IDS.selectUntrust, "เลือกสมาชิกที่จะยกเลิกสิทธิ์เข้าห้อง");
  }

  if (selected === "vip_opt_block") {
    return await replyWithUserSelect(interaction, CUSTOM_IDS.selectBlock, "เลือกสมาชิกที่จะซ่อนห้องจากเขา");
  }

  if (selected === "vip_opt_unblock") {
    return await replyWithUserSelect(interaction, CUSTOM_IDS.selectUnblock, "เลือกสมาชิกที่จะเลิกซ่อนห้อง");
  }

  if (selected === "vip_opt_kick") {
    return await replyWithUserSelect(interaction, CUSTOM_IDS.selectKick, "เลือกสมาชิกที่จะเตะออกจากห้อง", 1);
  }

  if (selected === "vip_opt_permissions") {
    const settings = getSettings(room);
    const ownerId = room.ownerId;

    const trustedList = settings.trustedUserIds.length > 0
      ? settings.trustedUserIds.map((id) => `<@${id}>`).join(", ")
      : "ไม่มี";

    const blockedList = settings.blockedUserIds.length > 0
      ? settings.blockedUserIds.map((id) => `<@${id}>`).join(", ")
      : "ไม่มี";

    const content = [
      `📋 **รายละเอียดสิทธิ์สมาชิกภายในห้อง VIP**`,
      `👑 **เจ้าของห้อง**: <@${ownerId}>`,
      `🟢 **อนุญาตให้เข้า (มองเห็น)**: ${trustedList}`,
      `🔴 **ถูกซ่อน/บล็อค (ถูกบล็อค)**: ${blockedList}`,
    ].join("\n");

    return await respondEphemeral(interaction, { content });
  }

  if (selected === "vip_opt_delete") {
    await respondEphemeral(interaction, { content: "กำลังลบห้องค่ะ" });
    return await deleteOwnedRoom(interaction, context);
  }

  return false;
}

async function handlePanelButton(interaction) {
  if (interaction.customId === CUSTOM_IDS.name) {
    return await showNameModal(interaction);
  }

  if (interaction.customId === CUSTOM_IDS.limit) {
    return await showLimitModal(interaction);
  }

  if (interaction.customId === CUSTOM_IDS.image) {
    return await showImageModal(interaction);
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

  if (interaction.customId === CUSTOM_IDS.permissionsList) {
    const settings = getSettings(context.room);
    const ownerId = context.room.ownerId;

    const trustedList = settings.trustedUserIds.length > 0
      ? settings.trustedUserIds.map((id) => `<@${id}>`).join(", ")
      : "ไม่มี";

    const blockedList = settings.blockedUserIds.length > 0
      ? settings.blockedUserIds.map((id) => `<@${id}>`).join(", ")
      : "ไม่มี";

    const content = [
      `📋 **รายละเอียดสิทธิ์สมาชิกภายในห้อง**`,
      `👑 **เจ้าของห้อง**: <@${ownerId}>`,
      `🟢 **อนุญาตให้เข้า (มองเห็น)**: ${trustedList}`,
      `🔴 **ถูกซ่อน/บล็อค (ถูกบล็อค)**: ${blockedList}`,
    ].join("\n");

    return await respondEphemeral(interaction, { content });
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

  if (interaction.customId === CUSTOM_IDS.modalImage) {
    const member = interaction.member;
    if (!member || !member.roles.cache.has(SPECIAL_IMAGE_ROLE_ID)) {
      return await respondEphemeral(interaction, {
        content: `❌ ขออภัยค่ะ ฟังก์ชันตั้งค่ารูปภาพแผงสงวนสิทธิ์เฉพาะสมาชิกที่มีบทบาท <@&${SPECIAL_IMAGE_ROLE_ID}> เท่านั้นนะคะ`,
      });
    }

    const input = interaction.fields.getTextInputValue("panel_image_url").trim();
    let newImageUrl = null;
    const isReset = input.toLowerCase() === "reset" || input.toLowerCase() === "default";

    if (!isReset) {
      if (!input.startsWith("https://")) {
        return await respondEphemeral(interaction, {
          content: "❌ ลิงก์รูปภาพไม่ถูกต้องค่ะ ต้องขึ้นต้นด้วย `https://` เท่านั้นนะคะ",
        });
      }
      newImageUrl = input;
    }

    // 1. บันทึกลงใน smart_room_presets
    const currentSettings = getSettings(context.room);
    const updatedSettings = {
      ...currentSettings,
      imageUrl: newImageUrl,
    };
    const room = await updateRoom(context.channel.id, {
      settings: updatedSettings,
    });
    await persistRoomPreset(context.channel, room);

    // 2. Auto-Sync ไปยัง rent_house_settings สำหรับ owner_id เดียวกัน
    try {
      const { getSupabase } = require("../src/features/rentHouse/services/rentHouseService");
      const supabase = getSupabase ? getSupabase() : null;
      if (supabase) {
        await supabase
          .from("rent_house_settings")
          .update({ image_url: newImageUrl, updated_at: new Date().toISOString() })
          .eq("owner_id", context.room.ownerId);
      }
    } catch (err) {
      console.warn("[roomPanel] Auto-sync to rent_house_settings failed:", err.message);
    }

    // 3. รีเฟรชรูปบนข้อความแผงควบคุมในห้องทันที
    try {
      const messages = await context.channel.messages.fetch({ limit: 10 });
      const botMsg = messages.find((m) => m.author.id === interaction.client.user.id && (m.flags?.has(32768) || m.flags?.bitfield === 32768));
      if (botMsg) {
        const updatedPayload = createComponentV2PanelPayload(member, room, newImageUrl);
        await botMsg.edit(updatedPayload);
      }
    } catch (err) {
      console.warn("[roomPanel] Failed to edit existing panel message:", err.message);
    }

    return await respondEphemeral(interaction, {
      content: isReset
        ? "✅ รีเซ็ตรูปภาพแผงควบคุมกลับเป็นภาพเริ่มต้นเรียบร้อยแล้วค่ะ"
        : `✅ ตั้งค่ารูปภาพแผงควบคุมเรียบร้อยแล้วค่ะ! (มีผลกับทั้งห้อง VIP และบ้านเช่าของคุณ)\n🔗 ลิงก์: ${newImageUrl}`,
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

async function showImageModal(interaction) {
  if (interaction.replied || interaction.deferred) return false;

  const member = interaction.member;
  if (!member || !member.roles.cache.has(SPECIAL_IMAGE_ROLE_ID)) {
    return await respondEphemeral(interaction, {
      content: `❌ ขออภัยค่ะ ฟังก์ชันตั้งค่ารูปภาพแผงสงวนสิทธิ์เฉพาะสมาชิกที่มีบทบาท <@&${SPECIAL_IMAGE_ROLE_ID}> เท่านั้นนะคะ`,
    });
  }

  const modal = new ModalBuilder()
    .setCustomId(CUSTOM_IDS.modalImage)
    .setTitle("ตั้งค่ารูปภาพแผงควบคุม")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("panel_image_url")
          .setLabel("ลิงก์รูปภาพ (Image URL)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("https://... หรือพิมพ์ reset เพื่อใช้ภาพเดิม")
          .setRequired(true)
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

function createComponentV2PanelPayload(ownerMember, room, customImageUrl = null, ad = null, ctaBtn = null) {
  const settings = getSettings(room);
  const limit = Number.isInteger(settings.limit) ? settings.limit : "ค่าเริ่มต้น";
  const statusText = getStatusText(room);

  // ถ้ามียศลิมิเต็ดและตั้งภาพเฉพาะของตัวเองไว้ จะใช้ภาพนั้น และไม่แสดงโฆษณา
  const isCustomImageActive = Boolean(customImageUrl);
  const imageUrl = isCustomImageActive ? customImageUrl : (ad?.image_url || DEFAULT_VIP_IMAGE_URL);

  const containerComponents = [
    {
      type: 12,
      items: [
        {
          media: {
            url: imageUrl,
          },
          spoiler: false,
          description: null,
        },
      ],
    },
    { type: 14, spacing: 2 },
    {
      type: 10,
      content:
        `## <:618492diamond:1521245223311769673>︲__\` 𝖵𝖨𝖯 𝖱𝗈𝗈𝗆 𝖢𝗈𝗇𝗍𝗋𝗈𝗅 𝖯𝖺𝗇𝖾𝗅 ₊ ห้องวีไอพี 𓂃 \`__\n` +
        `-# ยินดีต้อนรับสู่ห้อง VIP นะคะ ${ownerMember} หากต้องการเรียก **พาเนลตั้งค่า** อีกครั้ง สามารถแท็กบอทภายในห้องนี้ได้เลยนะคะ <:cuteplant:1152834055528783872>\n\n` +
        `> (🔊)⠀สถานะห้อง: **${statusText}**\n` +
        `> (👥)⠀จำนวนคน: **${limit}**\n` +
        `> (📥)⠀อนุญาตให้เข้า: **${settings.trustedUserIds?.length || 0} คน**\n` +
        `> (🙈)⠀ซ่อนจาก: **${settings.blockedUserIds?.length || 0} คน**`,
    },
    { type: 14, spacing: 2 },
    {
      type: 1,
      components: [
        {
          type: 3,
          custom_id: CUSTOM_IDS.panelSelect,
          placeholder: "⚙️︲เลือกรายการที่ต้องการจัดการห้อง VIP...",
          options: VIP_SELECT_OPTIONS,
        },
      ],
    },
  ];

  // ปุ่มแถวล่าง: ลิงก์โฆษณา (ถ้าไม่ได้ใช้รูปคัสตอม) + ปุ่ม CTA สนใจลงโฆษณา
  const bottomButtons = [];
  if (!isCustomImageActive && ad && ad.has_button !== false && ad.link_url) {
    const adBtn = {
      type: 2,
      style: 5,
      url: ad.link_url,
      label: ad.button_label || "ดูรายละเอียด",
    };
    if (ad.button_emoji_id) {
      adBtn.emoji = {
        id: ad.button_emoji_id,
        name: ad.button_emoji_name || "emoji",
        animated: Boolean(ad.button_emoji_animated),
      };
    } else if (ad.button_emoji) {
      adBtn.emoji = { name: ad.button_emoji };
    }
    bottomButtons.push(adBtn);
  }

  if (!isCustomImageActive && ctaBtn) {
    bottomButtons.push(ctaBtn);
  }

  if (bottomButtons.length > 0) {
    containerComponents.push({ type: 14, spacing: 1, divider: false });
    containerComponents.push({
      type: 1,
      components: bottomButtons,
    });
  }

  return {
    flags: 32768,
    components: [
      {
        type: 17,
        components: containerComponents,
      },
    ],
  };
}

function createFallbackPanelPayload(ownerMember, room, customImageUrl = null, ad = null, ctaBtn = null) {
  const isCustomImageActive = Boolean(customImageUrl);
  const imageUrl = isCustomImageActive ? customImageUrl : (ad?.image_url || DEFAULT_VIP_IMAGE_URL);
  const settings = getSettings(room);
  const limit = Number.isInteger(settings.limit) ? settings.limit : "ค่าเริ่มต้น";
  const statusText = getStatusText(room);

  const selectRow = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(CUSTOM_IDS.panelSelect)
      .setPlaceholder("⚙️︲เลือกรายการที่ต้องการจัดการห้อง VIP...")
      .addOptions(VIP_SELECT_OPTIONS)
  );

  const components = [selectRow];

  const bottomButtons = [];
  if (!isCustomImageActive && ad && ad.has_button !== false && ad.link_url) {
    const btn = new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL(ad.link_url)
      .setLabel(ad.button_label || "ดูรายละเอียด");
    if (ad.button_emoji_id) {
      btn.setEmoji({
        id: ad.button_emoji_id,
        name: ad.button_emoji_name || "emoji",
        animated: Boolean(ad.button_emoji_animated),
      });
    } else if (ad.button_emoji) {
      btn.setEmoji(ad.button_emoji);
    }
    bottomButtons.push(btn);
  }

  if (!isCustomImageActive && ctaBtn) {
    const btn = new ButtonBuilder()
      .setStyle(ButtonStyle.Link)
      .setURL(ctaBtn.url)
      .setLabel(ctaBtn.label);
    if (ctaBtn.emoji) btn.setEmoji(ctaBtn.emoji);
    bottomButtons.push(btn);
  }

  if (bottomButtons.length > 0) {
    components.push(new ActionRowBuilder().addComponents(bottomButtons));
  }

  return {
    content:
      `## <:618492diamond:1521245223311769673>︲__\` 𝖵𝖨𝖯 𝖱𝗈𝗈𝗆 𝖢𝗈𝗇𝗍𝗋𝗈𝗅 𝖯𝖺𝗇𝖾𝗅 ₊ ห้องวีไอพี 𓂃 \`__\n` +
      `-# ยินดีต้อนรับสู่ห้อง VIP นะคะ ${ownerMember} หากต้องการเรียก **พาเนลตั้งค่า** อีกครั้ง สามารถแท็กบอทภายในห้องนี้ได้เลยนะคะ <:cuteplant:1152834055528783872>\n\n` +
      `> (🔊)⠀สถานะห้อง: **${statusText}**\n` +
      `> (👥)⠀จำนวนคน: **${limit}**\n` +
      `> (📥)⠀อนุญาตให้เข้า: **${settings.trustedUserIds?.length || 0} คน**\n` +
      `> (🙈)⠀ซ่อนจาก: **${settings.blockedUserIds?.length || 0} คน**`,
    embeds: [
      {
        image: {
          url: imageUrl,
        },
      },
    ],
    components,
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
    imageUrl: settings.imageUrl,
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
    `อนุญาตให้เข้า: **${settings.trustedUserIds?.length || 0} คน**`,
    `ซ่อนจาก: **${settings.blockedUserIds?.length || 0} คน**`,
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
      type: overwrite.type,
      allow: overwrite.allow.bitfield,
      deny: overwrite.deny.bitfield,
    });
  }

  const everyoneId = channel.guild.roles.everyone.id;
  const current = overwrites.get(everyoneId) || { id: everyoneId, allow: [], deny: [] };
  overwrites.set(everyoneId, {
    id: everyoneId,
    type: OverwriteType.Role,
    allow: current.allow,
    deny: [
      current.deny,
      ...(settings.hidden ? [PermissionFlagsBits.ViewChannel] : []),
      ...(settings.locked ? [PermissionFlagsBits.Connect] : []),
    ],
  });

  overwrites.set(room.ownerId, {
    id: room.ownerId,
    type: OverwriteType.Member,
    allow: ownerAllowPermissions(),
  });

  const trustedIds = (settings.trustedUserIds || []).filter(id => typeof id === "string" && /^\d{17,20}$/.test(id));
  for (const userId of trustedIds) {
    overwrites.set(userId, {
      id: userId,
      type: OverwriteType.Member,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
    });
  }

  const blockedIds = (settings.blockedUserIds || []).filter(id => typeof id === "string" && /^\d{17,20}$/.test(id));
  for (const userId of blockedIds) {
    overwrites.set(userId, {
      id: userId,
      type: OverwriteType.Member,
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
      type: OverwriteType.Role,
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.SendMessages],
    },
  ];

  if (vipPermissions.memberId && channel.guild.roles.cache.has(vipPermissions.memberId)) {
    const deniedPermissions = [
      ...(settings.hidden ? [PermissionFlagsBits.ViewChannel] : []),
      ...(settings.locked ? [PermissionFlagsBits.Connect] : []),
    ];

    overwrites.push({
      id: vipPermissions.memberId,
      type: OverwriteType.Role,
      allow: ownerAllowPermissions().filter((permission) => !deniedPermissions.includes(permission)),
      deny: deniedPermissions,
    });
  }

  if (vipPermissions.coffee1Id && channel.guild.roles.cache.has(vipPermissions.coffee1Id)) {
    overwrites.push({
      id: vipPermissions.coffee1Id,
      type: OverwriteType.Role,
      allow: [PermissionFlagsBits.ViewChannel],
      deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
    });
  }

  if (vipPermissions.coffee2Id && channel.guild.roles.cache.has(vipPermissions.coffee2Id)) {
    overwrites.push({
      id: vipPermissions.coffee2Id,
      type: OverwriteType.Role,
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
    });
  }

  overwrites.push({
    id: room.ownerId,
    type: OverwriteType.Member,
    allow: vipOwnerAllowPermissions(),
  });

  const trustedIds = (settings.trustedUserIds || []).filter(id => typeof id === "string" && /^\d{17,20}$/.test(id));
  for (const userId of trustedIds) {
    overwrites.push({
      id: userId,
      type: OverwriteType.Member,
      allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect],
    });
  }

  const blockedIds = (settings.blockedUserIds || []).filter(id => typeof id === "string" && /^\d{17,20}$/.test(id));
  for (const userId of blockedIds) {
    overwrites.push({
      id: userId,
      type: OverwriteType.Member,
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

// เฉพาะเจ้าของห้อง VIP — มีสิทธิ์จัดการสมาชิกเพิ่มเติม
function vipOwnerAllowPermissions() {
  return [
    ...ownerAllowPermissions(),
    PermissionFlagsBits.MuteMembers,
    PermissionFlagsBits.DeafenMembers,
    PermissionFlagsBits.MoveMembers,
  ];
}

function ensureBotOverwrite(channel, overwrites) {
  const botId = channel.guild.members.me?.id || channel.client.user?.id;
  if (!botId) return;

  const botOverwrite = {
    id: botId,
    type: OverwriteType.Member,
    allow: botPanelPermissions(),
  };

  if (Array.isArray(overwrites)) {
    const existingIndex = overwrites.findIndex((overwrite) => overwrite.id === botId);
    if (existingIndex >= 0) {
      overwrites[existingIndex] = {
        ...overwrites[existingIndex],
        type: OverwriteType.Member,
        allow: mergePermissions(overwrites[existingIndex].allow, botOverwrite.allow),
      };
    } else {
      overwrites.push(botOverwrite);
    }
    return;
  }

  const existing = overwrites.get(botId);
  overwrites.set(botId, existing
    ? { ...existing, type: OverwriteType.Member, allow: mergePermissions(existing.allow, botOverwrite.allow) }
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
