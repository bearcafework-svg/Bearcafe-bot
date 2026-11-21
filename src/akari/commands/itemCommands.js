// ===================================================
// src/akari/commands/itemCommands.js
// ระบบจัดการคำสั่ง /item และปฏิสัมพันธ์ร้านค้าแลกยศของบอท Kuma
// รองรับ:
// - /item create, /item edit, /item info, /item delete, /item show
// - Autocomplete ค้นหาไอเทม
// - Modal ป้อนข้อมูล & แก้ไข
// - หน้าร้านค้า Component V2 พร้อม Dropdown และระบบยืนยันแลกยศ
// ===================================================

const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");

const {
  getGuildItems,
  getGuildItemById,
  createGuildItem,
  updateGuildItem,
  deleteGuildItem,
  checkItemRedemptionEligibility,
  executeRoleRedemption,
} = require("../store/itemStoreEngine");

const { getTenantStoreConfig, saveTenantStoreConfig } = require("../store/storeEngine");
const { getTenantPlan } = require("../minigames/minigamesEngine");

const {
  buildMarketPayloads,
  buildItemRedeemConfirmPayload,
  buildItemInfoPayload,
  buildItemDeleteConfirmPayload,
  buildItemDeleteSuccessPayload,
  buildItemEditDashboardPayload,
  buildItemEditSuccessPayload,
  buildRedeemSuccessPayload,
  buildErrorPayload,
  buildSuccessPayload,
  buildItemCreateWizardPayload,
  buildItemCreateSuccessPayload,
  buildItemRoleSelectPayload,
} = require("../store/itemStorePayloads");

// In-Memory Sessions สำหรับ Wizard สร้างไอเทม (/item create)
const itemWizardSessions = new Map(); // sessionId -> sessionData
// In-Memory Sessions สำหรับการแก้ไขไอเทม (/item edit)
const itemEditSessions = new Map(); // sessionId -> sessionData
const WIZARD_TTL_MS = 15 * 60 * 1000; // 15 นาที

function generateWizardSessionId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

// Cleanup sessions ที่หมดอายุทุก 5 นาที
setInterval(() => {
  const now = Date.now();
  for (const [id, sess] of itemWizardSessions.entries()) {
    if (now - sess.createdAt > WIZARD_TTL_MS) {
      itemWizardSessions.delete(id);
    }
  }
  for (const [id, sess] of itemEditSessions.entries()) {
    if (now - sess.createdAt > WIZARD_TTL_MS) {
      itemEditSessions.delete(id);
    }
  }
}, 5 * 60 * 1000).unref();

/**
 * จัดการคำสั่งหลัก /item
 */
async function handleItemCommand(interaction, supabase) {
  if (!interaction.guild) {
    return interaction.reply({
      content: "❌ คำสั่งนี้สามารถใช้งานได้เฉพาะภายในเซิร์ฟเวอร์เท่านั้นครับ",
      flags: MessageFlags.Ephemeral,
    });
  }

  const subcommand = interaction.options.getSubcommand();

  // 1. /item create
  if (subcommand === "create") {
    // สิทธิ์เฉพาะ Admin / ManageGuild
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content: "❌ คุณต้องมีสิทธิ์ `Manage Server` ขึ้นไปจึงจะสามารถสร้างไอเทมได้ครับ",
        flags: MessageFlags.Ephemeral,
      });
    }

    const name = interaction.options.getString("name");
    if (!name || !name.trim()) {
      return interaction.reply({
        content: "❌ กรุณาระบุชื่อไอเทมที่ต้องการสร้างครับ",
        flags: MessageFlags.Ephemeral,
      });
    }

    // ตรวจสอบโควตา: ธรรมดา (Standard) 10 ชิ้น / พรีเมียม (Premium) 30 ชิ้น
    const planInfo = await getTenantPlan(interaction.guildId, supabase);
    const maxQuota = planInfo.isPremium ? 30 : 10;
    const existingItems = await getGuildItems(supabase, interaction.guildId, false);

    if (existingItems.length >= maxQuota) {
      return interaction.reply({
        content:
          `❌ **เซิร์ฟเวอร์ของคุณมีไอเทมครบตามโควตาสูงสุดแล้ว (${existingItems.length}/${maxQuota} ชิ้น)**\n` +
          `> ⚪ **แผนปกติ (Standard):** จำกัด **10 ชิ้น**\n` +
          `> 👑 **แผนพรีเมียม (Premium):** เพิ่มได้สูงสุด **30 ชิ้น**\n` +
          (!planInfo.isPremium
            ? `\n💡 *หากต้องการเพิ่มไอเทมในร้านค้ามากกว่านี้ สามารถติดต่อทีมงานเพื่ออัปเกรดเป็นเซิร์ฟเวอร์ Premium ได้ครับ*`
            : ""),
        flags: MessageFlags.Ephemeral,
      });
    }

    // สร้าง Session สำหรับ Wizard 4 ขั้นตอน
    const sessionId = generateWizardSessionId();
    const session = {
      id: sessionId,
      guildId: interaction.guildId,
      userId: interaction.user.id,
      name: name.trim(),
      points: null,
      roleId: null,
      stock: null,
      mainInteraction: interaction,
      createdAt: Date.now(),
    };
    itemWizardSessions.set(sessionId, session);

    const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
    const payload = buildItemCreateWizardPayload(1, session, storeConfig?.currency_emoji);

    return await interaction.reply(payload);
  }

  // 2. /item edit
  if (subcommand === "edit") {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content: "❌ คุณต้องมีสิทธิ์ `Manage Server` ขึ้นไปจึงจะสามารถแก้ไขไอเทมได้ครับ",
        flags: MessageFlags.Ephemeral,
      });
    }

    const itemId = interaction.options.getString("item");
    const item = await getGuildItemById(supabase, interaction.guildId, itemId);

    if (!item) {
      return interaction.reply({
        content: "❌ ไม่พบข้อมูลไอเทมที่ต้องการแก้ไข (อาจถูกลบไปแล้ว)",
        flags: MessageFlags.Ephemeral,
      });
    }

    const allItems = await getGuildItems(supabase, interaction.guildId, false);
    const itemIndex = allItems.findIndex((i) => String(i.id) === String(item.id));
    const itemNumber = itemIndex >= 0 ? itemIndex + 1 : 1;

    const sessionId = generateWizardSessionId();
    const session = {
      id: sessionId,
      itemId: item.id,
      guildId: interaction.guildId,
      userId: interaction.user.id,
      name: item.name,
      points: item.points_cost,
      roleId: item.role_id,
      stock: item.stock,
      itemNumber,
      mainInteraction: interaction,
      createdAt: Date.now(),
    };
    itemEditSessions.set(sessionId, session);

    const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
    const payload = buildItemEditDashboardPayload(session, itemNumber, storeConfig?.currency_emoji);
    return await interaction.reply(payload);
  }

  // 3. /item info
  if (subcommand === "info") {
    const itemId = interaction.options.getString("item");
    const item = await getGuildItemById(supabase, interaction.guildId, itemId);

    if (!item) {
      return interaction.reply({
        content: "❌ ไม่พบข้อมูลไอเทมที่เลือกครับ",
        flags: MessageFlags.Ephemeral,
      });
    }

    let redemptionCount = 0;
    if (supabase) {
      try {
        const { count, error } = await supabase
          .from("tenant_store_redemptions")
          .select("id", { count: "exact", head: true })
          .eq("guild_id", interaction.guildId)
          .eq("item_id", item.id);

        if (!error && typeof count === "number") {
          redemptionCount = count;
        }
      } catch (err) {
        console.warn(`[itemCommands] redemptionCount error:`, err.message);
      }
    }

    const allItems = await getGuildItems(supabase, interaction.guildId, false);
    const itemIndex = allItems.findIndex((i) => String(i.id) === String(item.id));
    const itemNumber = itemIndex >= 0 ? itemIndex + 1 : 1;

    const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
    const payload = buildItemInfoPayload(item, itemNumber, redemptionCount, storeConfig?.currency_emoji);
    return await interaction.reply(payload);
  }

  // 4. /item delete
  if (subcommand === "delete") {
    if (!interaction.memberPermissions.has(PermissionFlagsBits.ManageGuild)) {
      return interaction.reply({
        content: "❌ คุณต้องมีสิทธิ์ `Manage Server` ขึ้นไปจึงจะสามารถลบไอเทมได้ครับ",
        flags: MessageFlags.Ephemeral,
      });
    }

    const itemId = interaction.options.getString("item");
    const item = await getGuildItemById(supabase, interaction.guildId, itemId);

    if (!item) {
      return interaction.reply({
        content: "❌ ไม่พบข้อมูลไอเทมที่ต้องการลบครับ",
        flags: MessageFlags.Ephemeral,
      });
    }

    const allItems = await getGuildItems(supabase, interaction.guildId, false);
    const itemIndex = allItems.findIndex((i) => String(i.id) === String(item.id));
    const itemNumber = itemIndex >= 0 ? itemIndex + 1 : 1;

    const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
    const payload = buildItemDeleteConfirmPayload(item, itemNumber, storeConfig?.currency_emoji);
    return await interaction.reply(payload);
  }
}

/**
 * ฟังก์ชันซิงค์ข้อความหน้าร้านค้าในดิสคอร์ดแบบอัตโนมัติ (Background Realtime Sync)
 * อัปเดตสต็อกคงเหลือลงในการ์ดหน้าร้านทันทีเมื่อมีสมาชิกกดแลกไอเทม
 */
async function syncMarketMessages(guild, supabase) {
  if (!guild || !supabase) return;
  try {
    const storeConfig = await getTenantStoreConfig(supabase, guild.id);
    const marketChannelId = storeConfig?.market_channel_id;
    const messageIds = Array.isArray(storeConfig?.market_message_ids) ? storeConfig.market_message_ids : [];

    if (!marketChannelId || messageIds.length === 0) return;

    const channel = guild.channels.cache.get(marketChannelId) ||
      await guild.channels.fetch(marketChannelId).catch(() => null);
    if (!channel || typeof channel.send !== "function") return;

    const items = await getGuildItems(supabase, guild.id, true);
    const payloads = buildMarketPayloads(guild, items, storeConfig?.currency_emoji);

    for (let i = 0; i < messageIds.length && i < payloads.length; i++) {
      const msgId = messageIds[i];
      const msg = await channel.messages.fetch(msgId).catch(() => null);
      if (msg) {
        await msg.edit(payloads[i]).catch((err) =>
          console.warn(`[syncMarketMessages] Failed to edit msg ${msgId}:`, err.message)
        );
      }
    }
  } catch (syncErr) {
    console.warn(`[syncMarketMessages] Background sync error:`, syncErr.message);
  }
}

/**
 * จัดการคำสั่ง /open market [channel]
 * ส่งหน้าร้านค้า Component V2 ลงในห้องที่กำหนด โดยไม่ติดคำสั่ง /slash
 */
async function handleOpenMarketCommand(interaction, supabase) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({
      content: "❌ คุณต้องมีสิทธิ์ `Manage Server` ขึ้นไปจึงจะสามารถส่งหน้าร้านค้าได้ครับ",
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const targetChannel = interaction.options.getChannel("channel") || interaction.channel;
  if (!targetChannel || typeof targetChannel.send !== "function") {
    return await interaction.editReply({
      content: "❌ ห้องปลายทางไม่ถูกต้อง หรือบอทไม่มีสิทธิ์ส่งข้อความในห้องดังกล่าวครับ",
    });
  }

  const items = await getGuildItems(supabase, interaction.guildId, true);
  const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
  const payloads = buildMarketPayloads(interaction.guild, items, storeConfig?.currency_emoji);

  try {
    const sentMessageIds = [];
    for (const p of payloads) {
      const sentMsg = await targetChannel.send(p);
      sentMessageIds.push(sentMsg.id);
    }

    await saveTenantStoreConfig(supabase, interaction.guildId, {
      market_channel_id: targetChannel.id,
      market_message_ids: sentMessageIds,
    });

    // ลบ Ephemeral Reply ทิ้งเพื่อให้ไม่มีแถบ /open market ตกค้าง
    return await interaction.deleteReply().catch(() => {});
  } catch (sendErr) {
    console.error(`[handleOpenMarketCommand] Failed to send market messages:`, sendErr);
    return await interaction.editReply({
      content: `❌ ไม่สามารถส่งการ์ดหน้าร้านค้าได้: ${sendErr.message}`,
    });
  }
}

/**
 * จัดการคำสั่ง /reload market
 * ดึงข้อมูลไอเทมล่าสุดแล้วนำไปอัปเดต (edit) ข้อความหน้าร้านค้าเดิมทุกข้อความ
 */
async function handleReloadMarketCommand(interaction, supabase) {
  if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
    return interaction.reply({
      content: "❌ คุณต้องมีสิทธิ์ `Manage Server` ขึ้นไปจึงจะสามารถรีโหลดร้านค้าได้ครับ",
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
  const marketChannelId = storeConfig?.market_channel_id;
  const oldMessageIds = Array.isArray(storeConfig?.market_message_ids) ? storeConfig.market_message_ids : [];

  if (!marketChannelId || oldMessageIds.length === 0) {
    return await interaction.editReply({
      content: "⚠️ ยังไม่พบข้อความหน้าร้านค้าในระบบ กรุณาใช้คำสั่ง </open market:0> เพื่อเปิดหน้าร้านค้าก่อนครับ",
    });
  }

  const channel = interaction.guild.channels.cache.get(marketChannelId) ||
    await interaction.guild.channels.fetch(marketChannelId).catch(() => null);

  if (!channel || typeof channel.send !== "function") {
    return await interaction.editReply({
      content: "⚠️ ไม่พบห้องที่เคยส่งหน้าร้านค้าไว้ (อาจถูกลบไปแล้ว) แนะนำให้ใช้คำสั่ง </open market:0> เพื่อส่งหน้าร้านค้าใหม่อีกครั้งครับ",
    });
  }

  const existingMessages = [];
  for (const id of oldMessageIds) {
    const msg = await channel.messages.fetch(id).catch(() => null);
    if (msg) existingMessages.push(msg);
  }

  if (existingMessages.length === 0) {
    return await interaction.editReply({
      content: "⚠️ ไม่พบข้อความหน้าร้านค้าเดิม (อาจถูกลบไปแล้ว) แนะนำให้ใช้คำสั่ง </open market:0> เพื่อส่งหน้าร้านค้าใหม่อีกครั้งครับ",
    });
  }

  const items = await getGuildItems(supabase, interaction.guildId, true);
  const payloads = buildMarketPayloads(interaction.guild, items, storeConfig?.currency_emoji);

  const updatedMessageIds = [];
  try {
    const maxLen = Math.max(existingMessages.length, payloads.length);
    for (let i = 0; i < maxLen; i++) {
      if (i < payloads.length && i < existingMessages.length) {
        // มีทั้งข้อความเดิมและ payload ใหม่ -> แก้ไขข้อความเดิม
        await existingMessages[i].edit(payloads[i]);
        updatedMessageIds.push(existingMessages[i].id);
      } else if (i < payloads.length && i >= existingMessages.length) {
        // มี chunk เพิ่มขึ้นมา ส่งข้อความใหม่ต่อท้าย
        const newMsg = await channel.send(payloads[i]);
        updatedMessageIds.push(newMsg.id);
      } else if (i >= payloads.length && i < existingMessages.length) {
        // chunk ลดลง ลบข้อความที่เกินทิ้ง
        await existingMessages[i].delete().catch(() => {});
      }
    }

    await saveTenantStoreConfig(supabase, interaction.guildId, {
      market_message_ids: updatedMessageIds,
    });

    return await interaction.editReply({
      content: `✅ อัปเดตข้อมูลหน้าร้านค้าทั้งหมด (${updatedMessageIds.length} ข้อความ) เรียบร้อยแล้วครับ!`,
    });
  } catch (err) {
    console.error(`[handleReloadMarketCommand] Failed to reload market:`, err);
    return await interaction.editReply({
      content: `❌ เกิดข้อผิดพลาดในการอัปเดตหน้าร้านค้า: ${err.message}`,
    });
  }
}

/**
 * แนะนำรายการไอเทมใน Autocomplete
 */
async function handleItemAutocomplete(interaction, supabase) {
  try {
    const focused = interaction.options.getFocused(true);
    if (!focused || focused.name !== "item") return;

    const query = (focused.value || "").toLowerCase().trim();
    const items = await getGuildItems(supabase, interaction.guildId, false);

    const filtered = items
      .filter((item) => {
        if (!query) return true;
        return (
          item.name.toLowerCase().includes(query) ||
          String(item.id) === query ||
          (item.emoji && item.emoji.includes(query))
        );
      })
      .slice(0, 25);

    const choices = filtered.map((item) => ({
      name: `${item.emoji || "🎁"} ${item.name} (${item.points_cost.toLocaleString()} แต้ม)`.slice(0, 100),
      value: String(item.id),
    }));

    return await interaction.respond(choices);
  } catch (err) {
    console.warn(`[itemCommands] Autocomplete error:`, err.message);
  }
}

/**
 * จัดการเมื่อส่ง Modal (สร้าง/แก้ไขไอเทม)
 */
async function handleItemModalSubmit(interaction, supabase) {
  const customId = interaction.customId;

  // 1. Submit Modal Wizard: กำหนดราคาไอเทม (Step 1 -> 2)
  if (customId.startsWith("item_wiz_price_modal:")) {
    const sessionId = customId.split(":")[1];
    const session = itemWizardSessions.get(sessionId);

    if (!session) {
      return await interaction.reply(
        buildErrorPayload("เซสชันหมดอายุ", "ขั้นตอนการตั้งค่าหมดอายุแล้ว กรุณาเริ่มใช้คำสั่ง /item create ใหม่ครับ")
      );
    }

    const pointsRaw = interaction.fields.getTextInputValue("item_points")?.trim();
    const points = parseInt(pointsRaw, 10);

    if (isNaN(points) || points <= 0) {
      return await interaction.reply(
        buildErrorPayload("ข้อมูลไม่ถูกต้อง", "กรุณาระบุราคาไอเทมเป็นตัวเลขจำนวนเต็มตั้งแต่ 1 ขึ้นไปครับ")
      );
    }

    session.points = points;
    const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
    const step2Payload = buildItemCreateWizardPayload(2, session, storeConfig?.currency_emoji);

    return await interaction.update(step2Payload);
  }

  // 2. Submit Modal Wizard: กำหนดการจำกัดการแลก (Step 3 -> 4)
  if (customId.startsWith("item_wiz_stock_modal:")) {
    const sessionId = customId.split(":")[1];
    const session = itemWizardSessions.get(sessionId);

    if (!session) {
      return await interaction.reply(
        buildErrorPayload("เซสชันหมดอายุ", "ขั้นตอนการตั้งค่าหมดอายุแล้ว กรุณาเริ่มใช้คำสั่ง /item create ใหม่ครับ")
      );
    }

    const stockRaw = interaction.fields.getTextInputValue("item_stock")?.trim();
    const stockNum = parseInt(stockRaw, 10);

    if (isNaN(stockNum) || stockNum <= 0) {
      session.stock = -1; // ไม่จำกัดคน
    } else {
      session.stock = stockNum;
    }

    const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
    const step4Payload = buildItemCreateWizardPayload(4, session, storeConfig?.currency_emoji);

    return await interaction.update(step4Payload);
  }

  // 3. Submit Modal แก้ไขไอเทม (ฟอร์มเดี่ยวเดิม)
  if (customId.startsWith("item_edit_modal:")) {
    const itemId = customId.split(":")[1];

    const name = interaction.fields.getTextInputValue("item_name");
    const pointsRaw = interaction.fields.getTextInputValue("item_points");
    const description = interaction.fields.getTextInputValue("item_desc") || "";
    const emoji = interaction.fields.getTextInputValue("item_emoji") || "🎁";
    const stockRaw = interaction.fields.getTextInputValue("item_stock") || "-1";

    const pointsCost = parseInt(pointsRaw, 10);
    if (isNaN(pointsCost) || pointsCost <= 0) {
      return await interaction.reply({
        ...buildErrorPayload("ข้อมูลไม่ถูกต้อง", "จำนวนแต้มที่ต้องใช้ต้องเป็นตัวเลขที่มากกว่า 0 ครับ"),
        ephemeral: true,
      });
    }

    let stock = parseInt(stockRaw, 10);
    if (isNaN(stock) || stock < -1) stock = -1;

    const result = await updateGuildItem(supabase, interaction.guildId, itemId, {
      name,
      points_cost: pointsCost,
      description,
      emoji,
      stock,
    });

    if (!result.success) {
      return await interaction.reply({
        ...buildErrorPayload("แก้ไขไอเทมไม่สำเร็จ", result.error || "เกิดข้อผิดพลาดในการบันทึก"),
        ephemeral: true,
      });
    }

    return await interaction.reply({
      ...buildSuccessPayload(
        "แก้ไขไอเทมเรียบร้อยแล้ว!",
        `อัปเดตข้อมูลไอเทม **${result.item.emoji} ${result.item.name}** สำเร็จ\n> 💰 **ราคาใหม่:** **${result.item.points_cost.toLocaleString()}** แต้ม\n> 📦 **สต็อกใหม่:** ${result.item.stock === -1 ? "ไม่จำกัด" : `${result.item.stock.toLocaleString()} ชิ้น`}`
      ),
      ephemeral: true,
    });
  }

  // 4. Submit Modal Edit Field: ชื่อไอเทม
  if (customId.startsWith("item_edit_name_modal:")) {
    const sessionId = customId.split(":")[1];
    const session = itemEditSessions.get(sessionId);
    if (!session) {
      return await interaction.reply(
        buildErrorPayload("เซสชันหมดอายุ", "เซสชันการแก้ไขหมดอายุแล้ว กรุณาใช้คำสั่ง /item edit ใหม่ครับ")
      );
    }
    const name = interaction.fields.getTextInputValue("item_name")?.trim();
    if (name) session.name = name;
    const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
    const updatedPayload = buildItemEditDashboardPayload(session, session.itemNumber, storeConfig?.currency_emoji);
    return await interaction.update(updatedPayload);
  }

  // 5. Submit Modal Edit Field: ราคาไอเทม
  if (customId.startsWith("item_edit_points_modal:")) {
    const sessionId = customId.split(":")[1];
    const session = itemEditSessions.get(sessionId);
    if (!session) {
      return await interaction.reply(
        buildErrorPayload("เซสชันหมดอายุ", "เซสชันการแก้ไขหมดอายุแล้ว กรุณาใช้คำสั่ง /item edit ใหม่ครับ")
      );
    }
    const pointsRaw = interaction.fields.getTextInputValue("item_points")?.trim();
    const pointsCost = parseInt(pointsRaw, 10);
    if (!isNaN(pointsCost) && pointsCost > 0) {
      session.points = pointsCost;
    }
    const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
    const updatedPayload = buildItemEditDashboardPayload(session, session.itemNumber, storeConfig?.currency_emoji);
    return await interaction.update(updatedPayload);
  }

  // 6. Submit Modal Edit Field: จำกัดการแลก
  if (customId.startsWith("item_edit_stock_modal:")) {
    const sessionId = customId.split(":")[1];
    const session = itemEditSessions.get(sessionId);
    if (!session) {
      return await interaction.reply(
        buildErrorPayload("เซสชันหมดอายุ", "เซสชันการแก้ไขหมดอายุแล้ว กรุณาใช้คำสั่ง /item edit ใหม่ครับ")
      );
    }
    const stockRaw = interaction.fields.getTextInputValue("item_stock")?.trim();
    const stockNum = parseInt(stockRaw, 10);
    if (isNaN(stockNum) || stockNum <= 0) {
      session.stock = -1;
    } else {
      session.stock = stockNum;
    }
    const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
    const updatedPayload = buildItemEditDashboardPayload(session, session.itemNumber, storeConfig?.currency_emoji);
    return await interaction.update(updatedPayload);
  }


}

/**
 * จัดการ Interactions (Select Menu, Buttons สำหรับการแลกและเปลี่ยนหน้า)
 */
async function handleItemInteraction(interaction, supabase, client) {
  const customId = interaction.customId;

  // ── WIZARD /item create INTERACTIONS ───────────────────────────────────────
  // W1. กดปุ่ม 'ราคาไอเทม' (Step 1/4 -> Modal)
  if (interaction.isButton() && customId.startsWith("item_wiz_price:")) {
    const sessionId = customId.split(":")[1];
    const session = itemWizardSessions.get(sessionId);

    if (!session) {
      return await interaction.reply(
        buildErrorPayload("เซสชันหมดอายุ", "ขั้นตอนการตั้งค่าหมดอายุแล้ว กรุณาเริ่มใช้คำสั่ง /item create ใหม่ครับ")
      );
    }

    if (interaction.user.id !== session.userId) {
      return await interaction.reply({
        content: "❌ เฉพาะแอดมินที่สร้างรายการนี้เท่านั้นที่สามารถดำเนินการได้ครับ",
        flags: MessageFlags.Ephemeral,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId(`item_wiz_price_modal:${sessionId}`)
      .setTitle("กำหนดราคาไอเทม");

    const pointsInput = new TextInputBuilder()
      .setCustomId("item_points")
      .setLabel("ราคาไอเทม (จำนวนแต้มที่ต้องใช้)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("กรอกจำนวนแต้ม 1 ขึ้นไป เช่น 150")
      .setValue(session.points ? String(session.points) : "")
      .setRequired(true)
      .setMaxLength(10);

    modal.addComponents(new ActionRowBuilder().addComponents(pointsInput));
    return await interaction.showModal(modal);
  }

  // W2. กดปุ่ม 'ยศที่จะได้รับ' (Step 2/4 -> Ephemeral RoleSelectMenu เพียวๆ)
  if (interaction.isButton() && customId.startsWith("item_wiz_role:")) {
    const sessionId = customId.split(":")[1];
    const session = itemWizardSessions.get(sessionId);

    if (!session) {
      return await interaction.reply(
        buildErrorPayload("เซสชันหมดอายุ", "ขั้นตอนการตั้งค่าหมดอายุแล้ว กรุณาเริ่มใช้คำสั่ง /item create ใหม่ครับ")
      );
    }

    if (interaction.user.id !== session.userId) {
      return await interaction.reply({
        content: "❌ เฉพาะแอดมินที่สร้างรายการนี้เท่านั้นที่สามารถดำเนินการได้ครับ",
        flags: MessageFlags.Ephemeral,
      });
    }

    const me = interaction.guild.members.me;
    if (!me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      return await interaction.reply(
        buildErrorPayload("บอทไม่มีสิทธิ์", "บอทไม่มีสิทธิ์ `Manage Roles` ในเซิร์ฟเวอร์นี้ครับ กรุณาให้สิทธิ์บอทก่อน")
      );
    }

    const roleSelectPayload = buildItemRoleSelectPayload(sessionId);
    return await interaction.reply(roleSelectPayload);
  }

  // W3. เลือกยศจาก RoleSelectMenu (Step 2 -> 3)
  if (interaction.isRoleSelectMenu() && customId.startsWith("item_wiz_select_role:")) {
    const sessionId = customId.split(":")[1];
    const session = itemWizardSessions.get(sessionId);

    if (!session) {
      return await interaction.reply(
        buildErrorPayload("เซสชันหมดอายุ", "ขั้นตอนการตั้งค่าหมดอายุแล้ว กรุณาเริ่มใช้คำสั่ง /item create ใหม่ครับ")
      );
    }

    if (interaction.user.id !== session.userId) {
      return await interaction.reply({
        content: "❌ เฉพาะแอดมินที่สร้างรายการนี้เท่านั้นที่สามารถดำเนินการได้ครับ",
        flags: MessageFlags.Ephemeral,
      });
    }

    const roleId = interaction.values[0];
    const role = interaction.guild.roles.cache.get(roleId);
    const me = interaction.guild.members.me;

    if (role && me.roles.highest.position <= role.position) {
      return await interaction.reply(
        buildErrorPayload(
          "ยศบอทต่ำกว่า",
          `❌ บอทไม่สามารถมอบยศ <@&${role.id}> ได้ เนื่องจากยศนี้อยู่สูงกว่าหรือเท่ากับยศสูงสุดของบอท\n> กรุณาลากตำแหน่งยศของบอทให้อยู่สูงกว่ายศที่ต้องการมอบใน Server Settings -> Roles ครับ`
        )
      );
    }

    session.roleId = roleId;
    const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
    const step3Payload = buildItemCreateWizardPayload(3, session, storeConfig?.currency_emoji);

    // ปิดเมนูเลือกยศ ephemeral
    await interaction.update({
      content: `> ✅ เลือกยศ <@&${roleId}> เรียบร้อยแล้วครับ`,
      components: [],
    });

    // อัปเดตการ์ด Wizard หลักไปยัง Step 3/4
    if (session.mainInteraction) {
      await session.mainInteraction.editReply(step3Payload).catch((err) => {
        console.warn("[itemCommands] editReply step 3 warning:", err.message);
      });
    }
    return;
  }

  // W4. กดปุ่ม 'จำกัดการแลก' (Step 3/4 -> Modal)
  if (interaction.isButton() && customId.startsWith("item_wiz_stock:")) {
    const sessionId = customId.split(":")[1];
    const session = itemWizardSessions.get(sessionId);

    if (!session) {
      return await interaction.reply(
        buildErrorPayload("เซสชันหมดอายุ", "ขั้นตอนการตั้งค่าหมดอายุแล้ว กรุณาเริ่มใช้คำสั่ง /item create ใหม่ครับ")
      );
    }

    if (interaction.user.id !== session.userId) {
      return await interaction.reply({
        content: "❌ เฉพาะแอดมินที่สร้างรายการนี้เท่านั้นที่สามารถดำเนินการได้ครับ",
        flags: MessageFlags.Ephemeral,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId(`item_wiz_stock_modal:${sessionId}`)
      .setTitle("กำหนดการจำกัดการแลก");

    const stockInput = new TextInputBuilder()
      .setCustomId("item_stock")
      .setLabel("จำกัดการแลก (0 = ไม่จำกัดคน)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("กรอก 0 เพื่อไม่จำกัดคน หรือใส่ตัวเลขจำนวนคน")
      .setValue(
        session.stock !== null && session.stock !== undefined
          ? session.stock === -1
            ? "0"
            : String(session.stock)
          : "0"
      )
      .setRequired(true)
      .setMaxLength(8);

    modal.addComponents(new ActionRowBuilder().addComponents(stockInput));
    return await interaction.showModal(modal);
  }

  // W5. กดปุ่มสีเขียว 'ยืนยัน' (Step 4/4 -> บันทึก DB & สำเร็จ)
  if (interaction.isButton() && customId.startsWith("item_wiz_confirm:")) {
    const sessionId = customId.split(":")[1];
    const session = itemWizardSessions.get(sessionId);

    if (!session) {
      return await interaction.reply(
        buildErrorPayload("เซสชันหมดอายุ", "ขั้นตอนการตั้งค่าหมดอายุแล้ว กรุณาเริ่มใช้คำสั่ง /item create ใหม่ครับ")
      );
    }

    if (interaction.user.id !== session.userId) {
      return await interaction.reply({
        content: "❌ เฉพาะแอดมินที่สร้างรายการนี้เท่านั้นที่สามารถดำเนินการได้ครับ",
        flags: MessageFlags.Ephemeral,
      });
    }

    if (!session.name || !session.points || !session.roleId || session.stock === null) {
      return await interaction.reply(
        buildErrorPayload("ข้อมูลไม่ครบถ้วน", "กรุณาระบุข้อมูลให้ครบถ้วนก่อนกดยืนยันครับ")
      );
    }

    // ตรวจสอบโควตา Standard 10 / Premium 30 อีกครั้งก่อนบันทึกจริง
    const planInfo = await getTenantPlan(interaction.guildId, supabase);
    const maxQuota = planInfo.isPremium ? 30 : 10;
    const existingItems = await getGuildItems(supabase, interaction.guildId, false);

    if (existingItems.length >= maxQuota) {
      itemWizardSessions.delete(sessionId);
      return await interaction.reply({
        content:
          `❌ **เซิร์ฟเวอร์ของคุณมีไอเทมครบตามโควตาสูงสุดแล้ว (${existingItems.length}/${maxQuota} ชิ้น)**\n` +
          `> ⚪ **แผนปกติ (Standard):** จำกัด **10 ชิ้น**\n` +
          `> 👑 **แผนพรีเมียม (Premium):** เพิ่มได้สูงสุด **30 ชิ้น**`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const result = await createGuildItem(supabase, interaction.guildId, {
      name: session.name,
      description: "",
      points_cost: session.points,
      role_id: session.roleId,
      emoji: "🎁",
      stock: session.stock,
      is_active: true,
    });

    if (!result.success) {
      return await interaction.reply(
        buildErrorPayload("สร้างไอเทมไม่สำเร็จ", result.error || "เกิดข้อผิดพลาดในการบันทึก")
      );
    }

    const allItems = await getGuildItems(supabase, interaction.guildId, false);
    const itemNumber = allItems.length || 1;
    const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
    const successPayload = buildItemCreateSuccessPayload(
      session,
      itemNumber,
      storeConfig?.currency_emoji
    );

    itemWizardSessions.delete(sessionId);
    return await interaction.update(successPayload);
  }

  // 1. ผู้ใช้เลือกยศจาก Dropdown หน้าร้านค้า (/open market)
  if (interaction.isStringSelectMenu() && (customId === "item_store_select_redeem" || customId === "p_370842049311674369")) {
    const itemId = interaction.values[0];
    const item = await getGuildItemById(supabase, interaction.guildId, itemId);

    if (!item || !item.is_active) {
      return await interaction.reply({
        content: "❌ ขออภัยครับ ไอเทมดังกล่าวได้ถูกลบหรือปิดการจำหน่ายไปแล้ว กรุณาติดต่อทีมงานให้ใช้คำสั่ง </reload market:0> เพื่ออัปเดตหน้าร้านค้าครับ",
        flags: MessageFlags.Ephemeral,
      });
    }

    // ห้ามให้ผู้ที่มีบทบาทอยู่แล้วแลก
    if (item.role_id && interaction.member.roles.cache.has(item.role_id)) {
      return await interaction.reply({
        content: `❌ คุณมีบทบาท <@&${item.role_id}> อยู่แล้ว ไม่สามารถแลกซ้ำได้ครับ`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const eligibility = await checkItemRedemptionEligibility(
      supabase,
      interaction.guild,
      interaction.member,
      item
    );

    if (!eligibility.eligible) {
      return await interaction.reply({
        content: `❌ ${eligibility.reason}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
    const confirmPayload = buildItemRedeemConfirmPayload(
      interaction.guild,
      interaction.member,
      item,
      eligibility.currentPoints,
      storeConfig?.currency_emoji
    );

    return await interaction.reply({
      ...confirmPayload,
      flags: MessageFlags.Ephemeral,
    });
  }

  // 2. ปุ่มกดยืนยันการแลกยศ
  if (interaction.isButton() && customId.startsWith("item_redeem_confirm:")) {
    await interaction.deferUpdate();

    const itemId = customId.split(":")[1];
    const item = await getGuildItemById(supabase, interaction.guildId, itemId);

    if (!item || !item.is_active) {
      return await interaction.editReply({
        flags: 32768,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content:
                  "## ❌︲__` ไม่สามารถแลกได้ 𓂃 `__\n" +
                  "> ขออภัยครับ ไอเทมดังกล่าวได้ถูกลบหรือปิดการจำหน่ายไปแล้ว กรุณาติดต่อทีมงานให้ใช้คำสั่ง </reload market:0> เพื่ออัปเดตหน้าร้านค้าครับ",
              },
            ],
          },
        ],
      });
    }

    // ห้ามให้ผู้ที่มีบทบาทอยู่แล้วแลก (ตรวจสอบซ้ำป้องกันแย่งกันกด)
    if (item.role_id && interaction.member.roles.cache.has(item.role_id)) {
      return await interaction.editReply({
        flags: 32768,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content:
                  "## ❌︲__` ไม่สามารถแลกได้ 𓂃 `__\n" +
                  `> คุณมีบทบาท <@&${item.role_id}> อยู่แล้ว ไม่สามารถแลกซ้ำได้ครับ`,
              },
            ],
          },
        ],
      });
    }

    const redemptionResult = await executeRoleRedemption(
      client,
      supabase,
      interaction.guild,
      interaction.member,
      item
    );

    if (!redemptionResult.success) {
      return await interaction.editReply({
        flags: 32768,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content:
                  "## ❌︲__` แลกรับยศไม่สำเร็จ 𓂃 `__\n" +
                  `> ${redemptionResult.error}`,
              },
            ],
          },
        ],
      });
    }

    const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
    const successPayload = buildRedeemSuccessPayload(
      interaction.member,
      item,
      redemptionResult.newPoints,
      storeConfig?.currency_emoji
    );

    await interaction.editReply(successPayload);

    // Realtime Auto-Update สต็อกคงเหลือบนการ์ดหน้าร้านทันที!
    syncMarketMessages(interaction.guild, supabase).catch(() => {});
    return;
  }

  // 3. ปุ่มยกเลิกการแลก
  if (interaction.isButton() && customId === "item_redeem_cancel") {
    return await interaction.update({
      flags: 32768,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: "## ❌︲__` ยกเลิกการแลกของรางวัล 𓂃 `__\n> ยกเลิกการแลกของรางวัลเรียบร้อยแล้วครับ",
            },
          ],
        },
      ],
    });
  }

  // 4. ปุ่มเปิด/ปิดการแลกชั่วคราว จาก /item info
  if (interaction.isButton() && customId.startsWith("item_info_toggle_active:")) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return await interaction.reply({
        content: "❌ คุณต้องมีสิทธิ์ `Manage Server` ขึ้นไปจึงจะสามารถเปลี่ยนสถานะไอเทมได้ครับ",
        flags: MessageFlags.Ephemeral,
      });
    }

    const itemId = customId.split(":")[1];
    const item = await getGuildItemById(supabase, interaction.guildId, itemId);
    if (!item) {
      return await interaction.reply({
        content: "❌ ไม่พบข้อมูลไอเทมนี้ในระบบ (อาจถูกลบไปแล้ว)",
        flags: MessageFlags.Ephemeral,
      });
    }

    const newActiveStatus = !item.is_active;
    const updateRes = await updateGuildItem(supabase, interaction.guildId, itemId, {
      is_active: newActiveStatus,
    });

    if (!updateRes.success) {
      return await interaction.reply({
        content: `❌ เกิดข้อผิดพลาดในการเปลี่ยนสถานะ: ${updateRes.error}`,
        flags: MessageFlags.Ephemeral,
      });
    }

    let redemptionCount = 0;
    if (supabase) {
      try {
        const { count, error } = await supabase
          .from("tenant_store_redemptions")
          .select("id", { count: "exact", head: true })
          .eq("guild_id", interaction.guildId)
          .eq("item_id", item.id);
        if (!error && typeof count === "number") redemptionCount = count;
      } catch (err) {}
    }

    const allItems = await getGuildItems(supabase, interaction.guildId, false);
    const itemIndex = allItems.findIndex((i) => String(i.id) === String(item.id));
    const itemNumber = itemIndex >= 0 ? itemIndex + 1 : 1;

    const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
    const updatedPayload = buildItemInfoPayload(
      updateRes.item,
      itemNumber,
      redemptionCount,
      storeConfig?.currency_emoji
    );

    await interaction.update(updatedPayload);
    syncMarketMessages(interaction.guild, supabase).catch(() => {});
    return;
  }

  // 5. ปุ่มแก้ไขข้อมูล จาก /item info
  if (interaction.isButton() && customId.startsWith("item_info_quick_edit:")) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return await interaction.reply({
        content: "❌ คุณต้องมีสิทธิ์ `Manage Server` ขึ้นไปจึงจะสามารถแก้ไขไอเทมได้ครับ",
        flags: MessageFlags.Ephemeral,
      });
    }

    const itemId = customId.split(":")[1];
    const item = await getGuildItemById(supabase, interaction.guildId, itemId);
    if (!item) {
      return await interaction.reply({
        content: "❌ ไม่พบข้อมูลไอเทมที่ต้องการแก้ไข (อาจถูกลบไปแล้ว)",
        flags: MessageFlags.Ephemeral,
      });
    }

    const allItems = await getGuildItems(supabase, interaction.guildId, false);
    const itemIndex = allItems.findIndex((i) => String(i.id) === String(item.id));
    const itemNumber = itemIndex >= 0 ? itemIndex + 1 : 1;

    const sessionId = generateWizardSessionId();
    const session = {
      id: sessionId,
      itemId: item.id,
      guildId: interaction.guildId,
      userId: interaction.user.id,
      name: item.name,
      points: item.points_cost,
      roleId: item.role_id,
      stock: item.stock,
      itemNumber,
      mainInteraction: interaction,
      createdAt: Date.now(),
    };
    itemEditSessions.set(sessionId, session);

    const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
    const payload = buildItemEditDashboardPayload(session, itemNumber, storeConfig?.currency_emoji);
    return await interaction.update(payload);
  }

  // 6. ปุ่มลบไอเทม จาก /item info
  if (interaction.isButton() && customId.startsWith("item_info_quick_delete:")) {
    if (!interaction.memberPermissions?.has(PermissionFlagsBits.ManageGuild)) {
      return await interaction.reply({
        content: "❌ คุณต้องมีสิทธิ์ `Manage Server` ขึ้นไปจึงจะสามารถลบไอเทมได้ครับ",
        flags: MessageFlags.Ephemeral,
      });
    }

    const itemId = customId.split(":")[1];
    const item = await getGuildItemById(supabase, interaction.guildId, itemId);
    if (!item) {
      return await interaction.reply({
        content: "❌ ไม่พบข้อมูลไอเทมที่ต้องการลบครับ",
        flags: MessageFlags.Ephemeral,
      });
    }

    const allItems = await getGuildItems(supabase, interaction.guildId, false);
    const itemIndex = allItems.findIndex((i) => String(i.id) === String(item.id));
    const itemNumber = itemIndex >= 0 ? itemIndex + 1 : 1;

    const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
    const payload = buildItemDeleteConfirmPayload(item, itemNumber, storeConfig?.currency_emoji);
    return await interaction.update(payload);
  }

  // 7. ปุ่มแก้ไขฟิลด์: ชื่อไอเทม (/item edit)
  if (interaction.isButton() && customId.startsWith("item_edit_field_name:")) {
    const sessionId = customId.split(":")[1];
    const session = itemEditSessions.get(sessionId);
    if (!session) {
      return await interaction.reply(
        buildErrorPayload("เซสชันหมดอายุ", "เซสชันการแก้ไขหมดอายุแล้ว กรุณาใช้คำสั่ง /item edit ใหม่ครับ")
      );
    }
    if (interaction.user.id !== session.userId) {
      return await interaction.reply({
        content: "❌ เฉพาะแอดมินที่เปิดการแก้ไขนี้เท่านั้นที่สามารถดำเนินการได้ครับ",
        flags: MessageFlags.Ephemeral,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId(`item_edit_name_modal:${sessionId}`)
      .setTitle("แก้ไขชื่อไอเทม");

    const nameInput = new TextInputBuilder()
      .setCustomId("item_name")
      .setLabel("ชื่อไอเทม")
      .setStyle(TextInputStyle.Short)
      .setValue(session.name || "")
      .setRequired(true)
      .setMaxLength(100);

    modal.addComponents(new ActionRowBuilder().addComponents(nameInput));
    return await interaction.showModal(modal);
  }

  // 8. ปุ่มแก้ไขฟิลด์: ราคาไอเทม (/item edit)
  if (interaction.isButton() && customId.startsWith("item_edit_field_points:")) {
    const sessionId = customId.split(":")[1];
    const session = itemEditSessions.get(sessionId);
    if (!session) {
      return await interaction.reply(
        buildErrorPayload("เซสชันหมดอายุ", "เซสชันการแก้ไขหมดอายุแล้ว กรุณาใช้คำสั่ง /item edit ใหม่ครับ")
      );
    }
    if (interaction.user.id !== session.userId) {
      return await interaction.reply({
        content: "❌ เฉพาะแอดมินที่เปิดการแก้ไขนี้เท่านั้นที่สามารถดำเนินการได้ครับ",
        flags: MessageFlags.Ephemeral,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId(`item_edit_points_modal:${sessionId}`)
      .setTitle("แก้ไขราคาไอเทม");

    const pointsInput = new TextInputBuilder()
      .setCustomId("item_points")
      .setLabel("ราคาไอเทม (จำนวนแต้มที่ต้องใช้)")
      .setStyle(TextInputStyle.Short)
      .setValue(session.points ? String(session.points) : "")
      .setRequired(true)
      .setMaxLength(10);

    modal.addComponents(new ActionRowBuilder().addComponents(pointsInput));
    return await interaction.showModal(modal);
  }

  // 9. ปุ่มแก้ไขฟิลด์: ยศที่จะได้รับ (/item edit)
  if (interaction.isButton() && customId.startsWith("item_edit_field_role:")) {
    const sessionId = customId.split(":")[1];
    const session = itemEditSessions.get(sessionId);
    if (!session) {
      return await interaction.reply(
        buildErrorPayload("เซสชันหมดอายุ", "เซสชันการแก้ไขหมดอายุแล้ว กรุณาใช้คำสั่ง /item edit ใหม่ครับ")
      );
    }
    if (interaction.user.id !== session.userId) {
      return await interaction.reply({
        content: "❌ เฉพาะแอดมินที่เปิดการแก้ไขนี้เท่านั้นที่สามารถดำเนินการได้ครับ",
        flags: MessageFlags.Ephemeral,
      });
    }

    const roleSelectPayload = buildItemRoleSelectPayload(sessionId, `item_edit_select_role:${sessionId}`);
    return await interaction.reply(roleSelectPayload);
  }

  // 10. เลือกยศจาก RoleSelectMenu ใน /item edit
  if (interaction.isRoleSelectMenu() && customId.startsWith("item_edit_select_role:")) {
    const sessionId = customId.split(":")[1];
    const session = itemEditSessions.get(sessionId);
    if (!session) {
      return await interaction.reply(
        buildErrorPayload("เซสชันหมดอายุ", "เซสชันการแก้ไขหมดอายุแล้ว กรุณาใช้คำสั่ง /item edit ใหม่ครับ")
      );
    }
    if (interaction.user.id !== session.userId) {
      return await interaction.reply({
        content: "❌ เฉพาะแอดมินที่เปิดการแก้ไขนี้เท่านั้นที่สามารถดำเนินการได้ครับ",
        flags: MessageFlags.Ephemeral,
      });
    }

    const roleId = interaction.values[0];
    const role = interaction.guild.roles.cache.get(roleId);
    const me = interaction.guild.members.me;

    if (role && me.roles.highest.position <= role.position) {
      return await interaction.reply(
        buildErrorPayload(
          "ยศบอทต่ำกว่า",
          `❌ บอทไม่สามารถมอบยศ <@&${role.id}> ได้ เนื่องจากยศนี้อยู่สูงกว่าหรือเท่ากับยศสูงสุดของบอท\n> กรุณาลากตำแหน่งยศของบอทให้อยู่สูงกว่ายศที่ต้องการมอบใน Server Settings -> Roles ครับ`
        )
      );
    }

    session.roleId = roleId;
    const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
    const updatedPayload = buildItemEditDashboardPayload(session, session.itemNumber, storeConfig?.currency_emoji);

    await interaction.update({
      content: `> ✅ เปลี่ยนยศเป็น <@&${roleId}> เรียบร้อยแล้วครับ`,
      components: [],
    });

    if (session.mainInteraction) {
      await session.mainInteraction.editReply(updatedPayload).catch((err) => {
        console.warn("[itemCommands] editReply role warning:", err.message);
      });
    }
    return;
  }

  // 11. ปุ่มแก้ไขฟิลด์: จำกัดการแลก (/item edit)
  if (interaction.isButton() && customId.startsWith("item_edit_field_stock:")) {
    const sessionId = customId.split(":")[1];
    const session = itemEditSessions.get(sessionId);
    if (!session) {
      return await interaction.reply(
        buildErrorPayload("เซสชันหมดอายุ", "เซสชันการแก้ไขหมดอายุแล้ว กรุณาใช้คำสั่ง /item edit ใหม่ครับ")
      );
    }
    if (interaction.user.id !== session.userId) {
      return await interaction.reply({
        content: "❌ เฉพาะแอดมินที่เปิดการแก้ไขนี้เท่านั้นที่สามารถดำเนินการได้ครับ",
        flags: MessageFlags.Ephemeral,
      });
    }

    const modal = new ModalBuilder()
      .setCustomId(`item_edit_stock_modal:${sessionId}`)
      .setTitle("แก้ไขการจำกัดการแลก");

    const stockInput = new TextInputBuilder()
      .setCustomId("item_stock")
      .setLabel("จำกัดการแลก (0 = ไม่จำกัดคน)")
      .setStyle(TextInputStyle.Short)
      .setValue(
        session.stock !== null && session.stock !== undefined
          ? session.stock === -1
            ? "0"
            : String(session.stock)
          : "0"
      )
      .setRequired(true)
      .setMaxLength(8);

    modal.addComponents(new ActionRowBuilder().addComponents(stockInput));
    return await interaction.showModal(modal);
  }

  // 12. ปุ่มบันทึกการแก้ไขไอเทม (/item edit)
  if (interaction.isButton() && customId.startsWith("item_edit_save:")) {
    const sessionId = customId.split(":")[1];
    const session = itemEditSessions.get(sessionId);
    if (!session) {
      return await interaction.reply(
        buildErrorPayload("เซสชันหมดอายุ", "เซสชันการแก้ไขหมดอายุแล้ว กรุณาใช้คำสั่ง /item edit ใหม่ครับ")
      );
    }
    if (interaction.user.id !== session.userId) {
      return await interaction.reply({
        content: "❌ เฉพาะแอดมินที่เปิดการแก้ไขนี้เท่านั้นที่สามารถดำเนินการได้ครับ",
        flags: MessageFlags.Ephemeral,
      });
    }

    const result = await updateGuildItem(supabase, interaction.guildId, session.itemId, {
      name: session.name,
      points_cost: session.points,
      role_id: session.roleId,
      stock: session.stock,
    });

    if (!result.success) {
      return await interaction.reply(
        buildErrorPayload("แก้ไขไอเทมไม่สำเร็จ", result.error || "เกิดข้อผิดพลาดในการบันทึก")
      );
    }

    const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
    const successPayload = buildItemEditSuccessPayload(session, session.itemNumber, storeConfig?.currency_emoji);

    itemEditSessions.delete(sessionId);
    await interaction.update(successPayload);
    syncMarketMessages(interaction.guild, supabase).catch(() => {});
    return;
  }

  // 13. ปุ่มยกเลิกการแก้ไขไอเทม (/item edit)
  if (interaction.isButton() && customId.startsWith("item_edit_cancel:")) {
    const sessionId = customId.split(":")[1];
    const session = itemEditSessions.get(sessionId);
    itemEditSessions.delete(sessionId);

    // หากเปิดมาจาก /item info หรือมี itemId ให้พากลับไปยังการ์ด item info เดิม
    if (session && session.itemId) {
      const item = await getGuildItemById(supabase, interaction.guildId, session.itemId);
      if (item) {
        const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
        const { count } = await supabase
          .from("tenant_store_redemptions")
          .select("*", { count: "exact", head: true })
          .eq("item_id", item.id);

        return await interaction.update(
          buildItemInfoPayload(item, session.itemNumber || 1, count || 0, storeConfig?.currency_emoji)
        );
      }
    }

    return await interaction.update({
      flags: 32768,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: "## ❌︲__` ยกเลิกการแก้ไขไอเทม 𓂃 `__\n> ยกเลิกการแก้ไขไอเทมเรียบร้อยแล้วครับ",
            },
          ],
        },
      ],
    });
  }

  // 14. ปุ่มยืนยันการลบไอเทม (/item delete)
  if (interaction.isButton() && customId.startsWith("item_delete_confirm:")) {
    const itemId = customId.split(":")[1];
    const item = await getGuildItemById(supabase, interaction.guildId, itemId);
    const itemName = item ? item.name : "ไอเทม";
    const deleted = await deleteGuildItem(supabase, interaction.guildId, itemId);

    if (deleted) {
      syncMarketMessages(interaction.guild, supabase).catch(() => {});
      return await interaction.update(buildItemDeleteSuccessPayload(itemName));
    } else {
      return await interaction.update({
        flags: 32768,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: "## ❌︲__` เกิดข้อผิดพลาด 𓂃 `__\n> ไม่สามารถลบไอเทมได้ กรุณาลองใหม่อีกครั้งครับ",
              },
            ],
          },
        ],
      });
    }
  }

  // 15. ปุ่มยกเลิกการลบไอเทม
  if (interaction.isButton() && (customId === "item_delete_cancel" || customId.startsWith("item_delete_cancel:"))) {
    const itemId = customId.includes(":") ? customId.split(":")[1] : null;
    if (itemId) {
      const item = await getGuildItemById(supabase, interaction.guildId, itemId);
      if (item) {
        const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
        const { count } = await supabase
          .from("tenant_store_redemptions")
          .select("*", { count: "exact", head: true })
          .eq("item_id", item.id);
        const allItems = await getGuildItems(supabase, interaction.guildId, false);
        const itemIndex = allItems.findIndex((i) => String(i.id) === String(item.id));
        const itemNumber = itemIndex >= 0 ? itemIndex + 1 : 1;
        return await interaction.update(
          buildItemInfoPayload(item, itemNumber, count || 0, storeConfig?.currency_emoji)
        );
      }
    }

    return await interaction.update({
      flags: 32768,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: "## ❌︲__` ยกเลิกการลบไอเทม 𓂃 `__\n> ยกเลิกการลบไอเทมเรียบร้อยแล้วครับ",
            },
          ],
        },
      ],
    });
  }
}

module.exports = {
  handleItemCommand,
  handleOpenMarketCommand,
  handleReloadMarketCommand,
  syncMarketMessages,
  handleItemAutocomplete,
  handleItemModalSubmit,
  handleItemInteraction,
};
