// ===================================================
// src/akari/commands/storeCommands.js
// ระบบคำสั่งและการจัดการร้านค้าแลกของรางวัล Akari Bot (/setting-store, /open-store)
// รองรับการทำงานแบบ Multi-Tenant และตรวจสอบสิทธิ์ Premium Plan
// ===================================================

const {
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  RoleSelectMenuBuilder,
  ChannelSelectMenuBuilder,
  StringSelectMenuBuilder,
} = require("discord.js");
const { getTenantPlan } = require("../minigames/minigamesEngine");
const { isExcludedGuild } = require("../filters/guildIgnoreFilter");
const {
  getTenantStoreConfig,
  saveTenantStoreConfig,
  getTenantStoreItems,
  saveTenantStoreItem,
  checkUserRedemptionEligibility,
  executeRedemption,
} = require("../store/storeEngine");
const {
  buildPremiumStoreWarningPayload,
  buildStoreSettingsDashboard,
  buildPublicStoreCard,
  buildRedeemConfirmCard,
  buildRedeemSuccessCard,
} = require("../store/storePayloads");

const FLAG_V2 = MessageFlags.IsComponentsV2 || 32768;

const STORE_SLASH_COMMANDS = [
  {
    name: "setting-store",
    description: "ตั้งค่าร้านค้าแลกของรางวัลมินิเกม สูงสุด 3 รายการ (เฉพาะผู้ดูแลระบบ Premium)",
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
  },
  {
    name: "open-store",
    description: "เปิดหน้าร้านค้าแลกของรางวัลมินิเกมในห้องนี้ (เฉพาะผู้ดูแลระบบ Premium)",
    default_member_permissions: PermissionFlagsBits.Administrator.toString(),
  },
];

/**
 * ตรวจสอบสิทธิ์ Admin และสถานะ Premium ของเซิร์ฟเวอร์
 */
async function checkAdminAndPremium(interaction, supabase) {
  if (isExcludedGuild(interaction.guildId)) return { allowed: false, reason: "excluded" };

  if (!interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)) {
    return {
      allowed: false,
      reason: "permission",
      payload: {
        flags: FLAG_V2,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ คุณไม่มีสิทธิ์ใช้คำสั่งนี้ 𓂃 \`__\n> คุณต้องมีสิทธิ์ **ผู้ดูแลระบบ (Administrator)** เพื่อใช้คำสั่งนี้นะคะ!`,
              },
            ],
          },
        ],
      },
    };
  }

  const planInfo = await getTenantPlan(interaction.guildId, supabase);
  if (!planInfo.isPremium) {
    return {
      allowed: false,
      reason: "premium",
      payload: buildPremiumStoreWarningPayload(),
    };
  }

  return { allowed: true, planInfo };
}

/**
 * จัดการคำสั่ง /setting-store
 */
async function handleSettingStore(interaction, supabase) {
  const check = await checkAdminAndPremium(interaction, supabase);
  if (!check.allowed) {
    if (check.reason === "excluded") return;
    return interaction.reply({ ...check.payload, flags: MessageFlags.Ephemeral | FLAG_V2 });
  }

  const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
  const items = await getTenantStoreItems(supabase, interaction.guildId);

  const payload = buildStoreSettingsDashboard(interaction.guild, storeConfig, items);
  return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral | FLAG_V2 });
}

/**
 * จัดการคำสั่ง /open-store
 */
async function handleOpenStore(interaction, supabase, client) {
  const check = await checkAdminAndPremium(interaction, supabase);
  if (!check.allowed) {
    if (check.reason === "excluded") return;
    return interaction.reply({ ...check.payload, flags: MessageFlags.Ephemeral | FLAG_V2 });
  }

  const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
  const items = await getTenantStoreItems(supabase, interaction.guildId);

  // ส่งการ์ด Component V2 แท้ลงในห้องข้อความโดยตรง (ไม่มีแถบ /open-store)
  const storePayload = buildPublicStoreCard(interaction.guild, storeConfig, items);
  await interaction.channel.send(storePayload).catch((err) => {
    console.error("[akari-store] Failed to send store card to channel:", err.message);
  });

  // ตอบกลับแอดมินลับๆ (Ephemeral)
  return interaction.reply({
    flags: MessageFlags.Ephemeral | FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `## <:strawberryv2:1520439075100688614>︲__\` 𝖲𝗍𝗈𝗋𝖾 ₊ เปิดร้านค้าสำเร็จ 𓂃 \`__\n` +
              `> ระบบได้ส่งการ์ดร้านค้าแลกของรางวัลลงในห้อง ${interaction.channel} เรียบร้อยแล้วค่ะ!\n` +
              `-# สมาชิกในเซิร์ฟเวอร์สามารถเริ่มกดแลกของรางวัลตามแต้มที่สะสมได้ทันทีค่ะ ✨`,
          },
        ],
      },
    ],
  });
}

/**
 * จัดการปุ่มกดต่างๆ ของระบบร้านค้า (Store Buttons)
 */
async function handleStoreButtonInteraction(interaction, supabase, client) {
  const customId = interaction.customId;

  // 1. ปุ่มแก้ไขข้อมูลไอเทม Modal: akari_store_edit_modal_1/2/3
  if (customId.startsWith("akari_store_edit_modal_")) {
    const slot = parseInt(customId.replace("akari_store_edit_modal_", ""), 10);
    const items = await getTenantStoreItems(supabase, interaction.guildId);
    const item = items.find((i) => i.slot === slot);

    const modal = new ModalBuilder()
      .setCustomId(`akari_store_modal_submit_${slot}`)
      .setTitle(`ตั้งค่าของรางวัลช่องที่ ${slot}`);

    const nameInput = new TextInputBuilder()
      .setCustomId("item_name")
      .setLabel("ชื่อของรางวัล")
      .setStyle(TextInputStyle.Short)
      .setValue(item?.name || `ของรางวัลช่องที่ ${slot}`)
      .setRequired(true)
      .setMaxLength(50);

    const descInput = new TextInputBuilder()
      .setCustomId("item_desc")
      .setLabel("คำอธิบายของรางวัล")
      .setStyle(TextInputStyle.Paragraph)
      .setValue(item?.description || "")
      .setRequired(false)
      .setMaxLength(100);

    const pointsInput = new TextInputBuilder()
      .setCustomId("item_points")
      .setLabel("แต้มที่ต้องใช้แลก (ตัวเลข)")
      .setStyle(TextInputStyle.Short)
      .setValue(String(item?.points_cost ?? 100))
      .setRequired(true);

    const winsInput = new TextInputBuilder()
      .setCustomId("item_wins")
      .setLabel("จำนวนครั้งที่ชนะขั้นต่ำ (0 หากไม่จำกัด)")
      .setStyle(TextInputStyle.Short)
      .setValue(String(item?.wins_required ?? 0))
      .setRequired(false);

    const emojiInput = new TextInputBuilder()
      .setCustomId("item_emoji")
      .setLabel("อิโมจิไอเทม (เช่น 🎁, 👑, ☕, 🎟️)")
      .setStyle(TextInputStyle.Short)
      .setValue(item?.emoji || "🎁")
      .setRequired(false)
      .setMaxLength(5);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(descInput),
      new ActionRowBuilder().addComponents(pointsInput),
      new ActionRowBuilder().addComponents(winsInput),
      new ActionRowBuilder().addComponents(emojiInput),
    );

    return interaction.showModal(modal);
  }

  // 2. ปุ่มเปิด/ปิด ไอเทม: akari_store_toggle_1/2/3
  if (customId.startsWith("akari_store_toggle_")) {
    const slot = parseInt(customId.replace("akari_store_toggle_", ""), 10);
    const items = await getTenantStoreItems(supabase, interaction.guildId);
    const item = items.find((i) => i.slot === slot);
    if (!item) return;

    await saveTenantStoreItem(supabase, interaction.guildId, slot, {
      is_active: !item.is_active,
    });

    const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
    const updatedItems = await getTenantStoreItems(supabase, interaction.guildId);
    const updatedPayload = buildStoreSettingsDashboard(interaction.guild, storeConfig, updatedItems);
    return interaction.update(updatedPayload);
  }

  // 3. ปุ่มเลือกผูกยศ Discord: akari_store_role_select_btn
  if (customId === "akari_store_role_select_btn") {
    const items = await getTenantStoreItems(supabase, interaction.guildId);
    const slotSelect = new StringSelectMenuBuilder()
      .setCustomId("akari_store_role_slot_target")
      .setPlaceholder("เลือกช่องไอเทมที่ต้องการผูกยศ...")
      .addOptions([
        { label: `ช่องที่ 1: ${items[0].name}`, value: "1", description: "ตั้งค่ายศที่จะมอบให้เมื่อแลกช่อง 1", emoji: "🎁" },
        { label: `ช่องที่ 2: ${items[1].name}`, value: "2", description: "ตั้งค่ายศที่จะมอบให้เมื่อแลกช่อง 2", emoji: "👑" },
        { label: `ช่องที่ 3: ${items[2].name}`, value: "3", description: "ตั้งค่ายศที่จะมอบให้เมื่อแลกช่อง 3", emoji: "☕" },
      ]);

    return interaction.reply({
      flags: MessageFlags.Ephemeral | FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## 🎭︲__\` 𝖲𝗍𝗈𝗋𝖾 𝗋𝗈𝗅𝖾 ₊ เลือกช่องที่ต้องการผูกยศ 𓂃 \`__\n> กรุณาเลือกช่องของรางวัลที่ต้องการเปลี่ยนประเภทเป็น **ยศ Discord** ค่ะ:`,
            },
            {
              type: 1,
              components: [slotSelect],
            },
          ],
        },
      ],
    });
  }

  // 4. ปุ่มเลือกห้องแจ้งเตือน Log: akari_store_channel_select_btn
  if (customId === "akari_store_channel_select_btn") {
    const channelSelect = new ChannelSelectMenuBuilder()
      .setCustomId("akari_store_log_channel_selected")
      .setPlaceholder("เลือกห้องข้อความสำหรับส่งใบเสร็จ Log...")
      .setChannelTypes([ChannelType.GuildText]);

    return interaction.reply({
      flags: MessageFlags.Ephemeral | FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## 🔔︲__\` 𝖲𝗍𝗈𝗋𝖾 𝗅𝗈𝗀 ₊ เลือกห้องส่งประวัติการแลก 𓂃 \`__\n> เมื่อมีผู้เล่นแลกของรางวัล บอทจะส่งใบเสร็จแจ้งเตือนพร้อมข้อมูลผู้แลกลงในห้องนี้ค่ะ:`,
            },
            {
              type: 1,
              components: [channelSelect],
            },
          ],
        },
      ],
    });
  }

  // 5. ปุ่มกดแลกของรางวัลจากหน้าร้าน: akari_store_redeem_btn_1/2/3
  if (customId.startsWith("akari_store_redeem_btn_")) {
    const slot = parseInt(customId.replace("akari_store_redeem_btn_", ""), 10);
    const items = await getTenantStoreItems(supabase, interaction.guildId);
    const item = items.find((i) => i.slot === slot);

    if (!item || !item.is_active) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral | FLAG_V2,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ ของรางวัลไม่พร้อมใช้งาน 𓂃 \`__\n> ของรางวัลชิ้นนี้ยังไม่เปิดให้แลกในขณะนี้ค่ะ!`,
              },
            ],
          },
        ],
      });
    }

    const eligibility = await checkUserRedemptionEligibility(supabase, interaction.guildId, interaction.user.id, slot, item);
    if (!eligibility.eligible) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral | FLAG_V2,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ ไม่สามารถแลกของรางวัลได้ 𓂃 \`__\n> ${eligibility.reason}\n\n` +
                  `📊 **แต้มสะสมของคุณ:** **${eligibility.currentPoints.toLocaleString()}** แต้ม\n` +
                  `🏆 **จำนวนครั้งที่ชนะ:** **${eligibility.currentWins.toLocaleString()}** ครั้ง`,
              },
            ],
          },
        ],
      });
    }

    // แสดงการ์ดยืนยัน (Ephemeral)
    const confirmPayload = buildRedeemConfirmCard(interaction.guild, interaction.user, item, eligibility);
    return interaction.reply({ ...confirmPayload, flags: MessageFlags.Ephemeral | FLAG_V2 });
  }

  // 6. ปุ่มยืนยันการแลก: akari_store_confirm_1/2/3
  if (customId.startsWith("akari_store_confirm_")) {
    const slot = parseInt(customId.replace("akari_store_confirm_", ""), 10);
    const items = await getTenantStoreItems(supabase, interaction.guildId);
    const item = items.find((i) => i.slot === slot);

    if (!item) {
      return interaction.update({
        content: "❌ ไม่พบข้อมูลของรางวัลชิ้นนี้ค่ะ",
        components: [],
      });
    }

    // ดำเนินการแลก
    const result = await executeRedemption(client, supabase, interaction.guild, interaction.member, slot, item);
    if (!result.success) {
      return interaction.update({
        flags: MessageFlags.Ephemeral | FLAG_V2,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ เกิดข้อผิดพลาด 𓂃 \`__\n> ${result.error}`,
              },
            ],
          },
        ],
      });
    }

    const successPayload = buildRedeemSuccessCard(item, result.newPoints, result.roleAdded, result.roleError);
    return interaction.update(successPayload);
  }

  // 7. ปุ่มยกเลิกการแลก: akari_store_cancel
  if (customId === "akari_store_cancel") {
    return interaction.update({
      flags: MessageFlags.Ephemeral | FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## ❌︲__\` 𝖢𝖺𝗇𝖼𝖾𝗅 ₊ ยกเลิกการแลกของรางวัลแล้ว 𓂃 \`__\n> ไม่มีการหักแต้มสะสมใดๆ คุณสามารถกลับมาแลกใหม่ได้ทุกเมื่อค่ะ ✨`,
            },
          ],
        },
      ],
    });
  }
}

/**
 * จัดการ Modal Submit สำหรับแก้ไขข้อมูลไอเทม
 */
async function handleStoreModalSubmit(interaction, supabase) {
  const customId = interaction.customId;
  if (!customId.startsWith("akari_store_modal_submit_")) return;

  const slot = parseInt(customId.replace("akari_store_modal_submit_", ""), 10);
  const name = interaction.fields.getTextInputValue("item_name").trim() || `ของรางวัลช่องที่ ${slot}`;
  const desc = interaction.fields.getTextInputValue("item_desc")?.trim() || "";
  const pointsStr = interaction.fields.getTextInputValue("item_points").trim();
  const winsStr = interaction.fields.getTextInputValue("item_wins")?.trim() || "0";
  const emoji = interaction.fields.getTextInputValue("item_emoji")?.trim() || "🎁";

  const pointsCost = Math.max(0, parseInt(pointsStr, 10) || 100);
  const winsRequired = Math.max(0, parseInt(winsStr, 10) || 0);

  await saveTenantStoreItem(supabase, interaction.guildId, slot, {
    name,
    description: desc,
    points_cost: pointsCost,
    wins_required: winsRequired,
    emoji,
  });

  return interaction.reply({
    flags: MessageFlags.Ephemeral | FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `## <:strawberryv2:1520439075100688614>︲__\` 𝖲𝗎𝖼𝖼𝖾𝗌𝗌 ₊ บันทึกไอเทมช่องที่ ${slot} เรียบร้อย 𓂃 \`__\n` +
              `> 🎁 **ชื่อ:** **${emoji} ${name}**\n` +
              `> 💰 **ราคา:** **${pointsCost.toLocaleString()}** แต้ม\n` +
              `> 🏆 **ชนะขั้นต่ำ:** ${winsRequired > 0 ? `${winsRequired.toLocaleString()} ครั้ง` : "ไม่จำกัด"}\n` +
              `> 📝 **คำอธิบาย:** ${desc || "ไม่มีคำอธิบาย"}\n\n` +
              `-# ข้อมูลได้รับการอัปเดตเรียบร้อยแล้วค่ะ`,
          },
        ],
      },
    ],
  });
}

/**
 * จัดการ Select Menus ของระบบร้านค้า
 */
async function handleStoreSelectMenus(interaction, supabase) {
  const customId = interaction.customId;

  // เมนูเลือกช่องเป้าหมายที่จะผูกยศ: akari_store_role_slot_target
  if (customId === "akari_store_role_slot_target") {
    const targetSlot = interaction.values[0];
    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId(`akari_store_role_selected_slot_${targetSlot}`)
      .setPlaceholder("เลือกยศ Discord ที่ต้องการมอบให้...");

    return interaction.update({
      flags: MessageFlags.Ephemeral | FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## 🎭︲__\` 𝖲𝗍𝗈𝗋𝖾 𝗋𝗈𝗅𝖾 ₊ ผูกยศสำหรับช่องที่ ${targetSlot} 𓂃 \`__\n> กรุณาเลือกบทบาท Discord ที่ผู้เล่นจะได้รับเมื่อแลกไอเทมช่องที่ ${targetSlot}:`,
            },
            {
              type: 1,
              components: [roleSelect],
            },
          ],
        },
      ],
    });
  }

  // เมนูเลือกยศ Discord สำหรับช่องที่ระบุ: akari_store_role_selected_slot_1/2/3
  if (customId.startsWith("akari_store_role_selected_slot_")) {
    const slot = parseInt(customId.replace("akari_store_role_selected_slot_", ""), 10);
    const selectedRoleId = interaction.values[0];

    await saveTenantStoreItem(supabase, interaction.guildId, slot, {
      reward_type: "role",
      role_id: selectedRoleId,
      limit_type: "once_per_user", // รางวัลยศกำหนดให้แลกได้ครั้งเดียวต่อคนเป็นค่าเริ่มต้น
    });

    return interaction.update({
      flags: MessageFlags.Ephemeral | FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## <:strawberryv2:1520439075100688614>︲__\` 𝖲𝗎𝖼𝖼𝖾𝗌𝗌 ₊ ผูกยศสำเร็จ 𓂃 \`__\n` +
                `> ระบบได้ผูกยศ <@&${selectedRoleId}> เข้ากับของรางวัลช่องที่ **${slot}** เรียบร้อยแล้วค่ะ!\n` +
                `-# เมื่อผู้เล่นแลกไอเทมช่องนี้ บอทจะมอบยศให้อัตโนมัติทันที`,
            },
          ],
        },
      ],
    });
  }

  // เมนูเลือกห้อง Log Channel: akari_store_log_channel_selected
  if (customId === "akari_store_log_channel_selected") {
    const selectedChannelId = interaction.values[0];

    await saveTenantStoreConfig(supabase, interaction.guildId, {
      log_channel_id: selectedChannelId,
    });

    return interaction.update({
      flags: MessageFlags.Ephemeral | FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## <:strawberryv2:1520439075100688614>︲__\` 𝖲𝗎𝖼𝖼𝖾𝗌𝗌 ₊ ตั้งห้องแจ้งเตือนสำเร็จ 𓂃 \`__\n` +
                `> ระบบได้ตั้งห้อง <#${selectedChannelId}> เป็นห้องรับใบเสร็จแจ้งเตือนประวัติการแลกของรางวัลเรียบร้อยแล้วค่ะ! 🔔✨`,
            },
          ],
        },
      ],
    });
  }
}

module.exports = {
  STORE_SLASH_COMMANDS,
  handleSettingStore,
  handleOpenStore,
  handleStoreButtonInteraction,
  handleStoreModalSubmit,
  handleStoreSelectMenus,
};
