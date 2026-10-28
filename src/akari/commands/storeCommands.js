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

const KUMA_STORE_ALLOWED_GUILD_ID = "1493110432347459627";

const STORE_SLASH_COMMANDS = [
  {
    name: "setting-store",
    description: "ตั้งค่าร้านค้าแลกของรางวัลมินิเกม สูงสุด 3 รายการ (เฉพาะผู้ดูแลระบบ Premium)",
    default_member_permissions: PermissionFlagsBits.ManageChannels.toString(),
  },
  {
    name: "open-store",
    description: "เปิดหน้าร้านค้าแลกของรางวัลมินิเกมในห้องนี้ (เฉพาะผู้ดูแลระบบ Premium)",
    default_member_permissions: PermissionFlagsBits.ManageChannels.toString(),
  },
];

/**
 * ตรวจสอบสิทธิ์ผู้ดูแลระบบ (ManageChannels หรือ Administrator)
 */
function hasAdminPermission(interaction) {
  const member = interaction.member;
  return Boolean(
    member?.permissions?.has(PermissionFlagsBits.ManageChannels) ||
    member?.permissions?.has(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.ManageChannels) ||
    interaction.memberPermissions?.has(PermissionFlagsBits.Administrator)
  );
}

/**
 * ตรวจสอบสิทธิ์ Admin และสถานะ Premium ของเซิร์ฟเวอร์
 */
async function checkAdminAndPremium(interaction, supabase) {
  if (isExcludedGuild(interaction.guildId)) return { allowed: false, reason: "excluded" };

  if (KUMA_STORE_ALLOWED_GUILD_ID && interaction.guildId !== KUMA_STORE_ALLOWED_GUILD_ID) {
    return {
      allowed: false,
      reason: "guild_not_allowed",
      payload: {
        content: "❌ คำสั่งระบบร้านค้าเปิดให้ใช้งานเฉพาะในเซิร์ฟเวอร์ที่ได้รับอนุญาตเท่านั้นครับ",
        flags: MessageFlags.Ephemeral,
      },
    };
  }

  if (!hasAdminPermission(interaction)) {
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
                content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ คุณไม่มีสิทธิ์ใช้คำสั่งนี้ 𓂃 \`__\n` +
                  `> คุณต้องมีสิทธิ์ **จัดการช่อง (Manage Channels)** หรือ **ผู้ดูแลระบบ (Administrator)** เพื่อใช้คำสั่งนี้นะครับ!\n\n` +
                  `-# เฉพาะผู้ดูแลระบบที่ได้รับอนุญาตเท่านั้นที่สามารถจัดการร้านค้าได้ <:cuteplant:1152834055528783872>`,
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
 * จัดการคำสั่ง /setting-store (แสดงผลแบบ Public ตามที่แอดมินต้องการ)
 */
async function handleSettingStore(interaction, supabase) {
  if (isExcludedGuild(interaction.guildId)) return;

  if (KUMA_STORE_ALLOWED_GUILD_ID && interaction.guildId !== KUMA_STORE_ALLOWED_GUILD_ID) {
    return interaction.reply({
      content: "❌ คำสั่งนี้เปิดให้ใช้งานเฉพาะในเซิร์ฟเวอร์ที่กำหนดเท่านั้นครับ",
      flags: MessageFlags.Ephemeral,
    });
  }

  if (!hasAdminPermission(interaction)) {
    return interaction.reply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ คุณไม่มีสิทธิ์ใช้คำสั่งนี้ 𓂃 \`__\n` +
                `> คุณต้องมีสิทธิ์ **จัดการช่อง (Manage Channels)** หรือ **ผู้ดูแลระบบ (Administrator)** เพื่อใช้คำสั่งนี้นะครับ!\n\n` +
                `-# เฉพาะผู้ดูแลระบบที่ได้รับอนุญาตเท่านั้นที่สามารถจัดการร้านค้าได้ <:cuteplant:1152834055528783872>`,
            },
          ],
        },
      ],
    });
  }

  // Defer ทันทีแบบ Public เพื่อป้องกันปัญหา Discord 3-second timeout ระหว่างติดต่อ Supabase
  await interaction.deferReply();

  const planInfo = await getTenantPlan(interaction.guildId, supabase);
  if (!planInfo.isPremium) {
    return interaction.editReply(buildPremiumStoreWarningPayload());
  }

  const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
  const items = await getTenantStoreItems(supabase, interaction.guildId);

  const payload = buildStoreSettingsDashboard(interaction.guild, storeConfig, items);
  return interaction.editReply(payload);
}

/**
 * จัดการคำสั่ง /open-store (ตอบรับทันทีเพื่อแก้ปัญหาคำสั่งไม่ตอบสนอง และลบทิ้งเพื่อความสะอาด)
 */
async function handleOpenStore(interaction, supabase, client) {
  // ตอบรับ interaction ทันทีแบบ Ephemeral เพื่อป้องกันปัญหา Discord 3-second timeout
  await interaction.deferReply({ ephemeral: true });

  const check = await checkAdminAndPremium(interaction, supabase);
  if (!check.allowed) {
    if (check.reason === "excluded") {
      return interaction.deleteReply().catch(() => {});
    }
    return interaction.editReply(check.payload);
  }

  const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
  const items = await getTenantStoreItems(supabase, interaction.guildId);

  // ส่งการ์ด Component V2 แท้ลงในห้องข้อความโดยตรง (ไม่มีแถบ /open-store)
  const storePayload = buildPublicStoreCard(interaction.guild, storeConfig, items);
  await interaction.channel.send(storePayload).catch((err) => {
    console.error("[akari-store] Failed to send store card to channel:", err.message);
  });

  // ลบ interaction reply ทิ้งเพื่อความสะอาด ไม่ให้เหลือข้อความ /slash หรือแถบไม่ตอบสนอง
  return interaction.deleteReply().catch(() => {});
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
    const msgId = interaction.message?.id || "";

    const modal = new ModalBuilder()
      .setCustomId(`akari_store_modal_submit_${slot}:${msgId}`)
      .setTitle(`ตั้งค่าของรางวัลช่องที่ ${slot}`);

    const nameInput = new TextInputBuilder()
      .setCustomId("item_name")
      .setLabel("ชื่อของรางวัล")
      .setStyle(TextInputStyle.Short)
      .setValue(item?.name || "")
      .setPlaceholder("เช่น ยศ VIP, บัตรเครื่องดื่ม, ของพรีเมียม")
      .setRequired(true)
      .setMaxLength(50);

    const descInput = new TextInputBuilder()
      .setCustomId("item_desc")
      .setLabel("คำอธิบายของรางวัล")
      .setStyle(TextInputStyle.Paragraph)
      .setValue(item?.description || "")
      .setPlaceholder("ระบุรายละเอียดหรือสิ่งที่ผู้เล่นจะได้รับ...")
      .setRequired(false)
      .setMaxLength(100);

    const pointsInput = new TextInputBuilder()
      .setCustomId("item_points")
      .setLabel("แต้มที่ต้องใช้แลก (ตัวเลข)")
      .setStyle(TextInputStyle.Short)
      .setValue(item?.points_cost ? String(item.points_cost) : "100")
      .setRequired(true);

    const winsInput = new TextInputBuilder()
      .setCustomId("item_wins")
      .setLabel("จำนวนครั้งที่ชนะขั้นต่ำ (0 หากไม่จำกัด)")
      .setStyle(TextInputStyle.Short)
      .setValue(String(item?.wins_required ?? 0))
      .setRequired(false);

    const stockInput = new TextInputBuilder()
      .setCustomId("item_stock")
      .setLabel("จำนวนสต็อกคงเหลือ (0 = ไม่จำกัด)")
      .setStyle(TextInputStyle.Short)
      .setValue(item?.stock === -1 || item?.stock === undefined ? "0" : String(item.stock))
      .setPlaceholder("ใส่ 0 หากไม่จำกัด หรือใส่จำนวนชิ้น เช่น 10")
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(descInput),
      new ActionRowBuilder().addComponents(pointsInput),
      new ActionRowBuilder().addComponents(winsInput),
      new ActionRowBuilder().addComponents(stockInput),
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

    // ตรวจสอบว่ามีรางวัลที่ตั้งค่าแล้วอย่างน้อย 1 ช่องหรือไม่
    if (!items.some((i) => i.is_configured)) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral | FLAG_V2,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ ยังไม่มีของรางวัลที่ตั้งค่า 𓂃 \`__\n` +
                  `> ยังไม่มีของรางวัลใดถูกตั้งค่าในระบบ กรุณากรอกข้อมูลรางวัลผ่านปุ่มแก้ไข (📝) ก่อนทำการผูกยศนะครับ! ✨`,
              },
            ],
          },
        ],
      });
    }

    const msgId = interaction.message?.id || "";
    const slotSelect = new StringSelectMenuBuilder()
      .setCustomId(`akari_store_role_slot_target:${msgId}`)
      .setPlaceholder("📦︲เลือกช่องไอเทมที่ต้องการผูกยศ...")
      .addOptions([
        {
          label: `รางวัล 1: ${items[0].name || "(ว่าง — ยังไม่ตั้งชื่อ)"}`,
          value: "1",
          description: items[0].is_configured
            ? "ตั้งค่ายศที่จะมอบให้เมื่อแลกช่อง 1"
            : "⚠️ ยังไม่ได้ตั้งค่า — กรุณาตั้งค่ารางวัลก่อน",
          emoji: { id: "1548948434982141993", name: "minecraft1yellow" },
        },
        {
          label: `รางวัล 2: ${items[1].name || "(ว่าง — ยังไม่ตั้งชื่อ)"}`,
          value: "2",
          description: items[1].is_configured
            ? "ตั้งค่ายศที่จะมอบให้เมื่อแลกช่อง 2"
            : "⚠️ ยังไม่ได้ตั้งค่า — กรุณาตั้งค่ารางวัลก่อน",
          emoji: { id: "1548948476182798416", name: "minecraft2yellow" },
        },
        {
          label: `รางวัล 3: ${items[2].name || "(ว่าง — ยังไม่ตั้งชื่อ)"}`,
          value: "3",
          description: items[2].is_configured
            ? "ตั้งค่ายศที่จะมอบให้เมื่อแลกช่อง 3"
            : "⚠️ ยังไม่ได้ตั้งค่า — กรุณาตั้งค่ารางวัลก่อน",
          emoji: { id: "1548948499846926346", name: "minecraft3yellow" },
        },
      ]);

    return interaction.reply({
      flags: MessageFlags.Ephemeral | FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## <a:643900sevlev:1548947725133942824>︲__\` 𝖲𝗍𝗈𝗋𝖾 𝗋𝗈𝗅𝖾 ₊ เลือกช่องที่ต้องการผูกยศ 𓂃 \`__\n` +
                `> กรุณาเลือกช่องของรางวัลที่ต้องการเปลี่ยนประเภทเป็น **ยศ Discord** เมื่อผู้เล่นแลกของรางวัล บอทจะมอบยศนี้ให้อัตโนมัติ:`,
            },
            {
              type: 14,
              spacing: 2,
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
    const msgId = interaction.message?.id || "";
    const channelSelect = new ChannelSelectMenuBuilder()
      .setCustomId(`akari_store_log_channel_selected:${msgId}`)
      .setPlaceholder("💭︲เลือกห้องแชทสำหรับส่งแจ้งเตือน...")
      .setChannelTypes([ChannelType.GuildText]);

    return interaction.reply({
      flags: MessageFlags.Ephemeral | FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## 🔔︲__\` 𝖲𝗍𝗈𝗋𝖾 𝗅𝗈𝗀 ₊ เลือกห้องส่งประวัติการแลก 𓂃 \`__\n` +
                `> เมื่อมีผู้เล่นแลกของรางวัล บอทจะส่งแจ้งเตือนพร้อมข้อมูลผู้แลกลงในห้องนี้ครับ:`,
            },
            {
              type: 14,
              spacing: 2,
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

  // 4.5 ปุ่มเลือกสลับการจำกัด 1 ครั้ง/คน: akari_store_limit_select_btn
  if (customId === "akari_store_limit_select_btn") {
    const items = await getTenantStoreItems(supabase, interaction.guildId);

    if (!items.some((i) => i.is_configured)) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral | FLAG_V2,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ ยังไม่มีของรางวัลที่ตั้งค่า 𓂃 \`__\n` +
                  `> ยังไม่มีของรางวัลใดถูกตั้งค่าในระบบ กรุณากรอกข้อมูลรางวัลผ่านปุ่มแก้ไข (📝) ก่อนนะครับ! ✨`,
              },
            ],
          },
        ],
      });
    }

    const msgId = interaction.message?.id || "";
    const slotSelect = new StringSelectMenuBuilder()
      .setCustomId(`akari_store_limit_slot_target:${msgId}`)
      .setPlaceholder("🔒︲เลือกช่องของรางวัลที่ต้องการสลับการจำกัดสิทธิ์...")
      .addOptions(
        items.map((it, idx) => {
          const s = idx + 1;
          const isRole = it.reward_type === "role";
          const currentLimit = isRole
            ? "ตรวจยศซ้ำอัตโนมัติ"
            : (it.limit_type === "once_per_user" ? "จำกัด 1 ครั้ง/คน" : "แลกได้ไม่จำกัด");

          const emojiMap = {
            1: { id: "1548948434982141993", name: "minecraft1yellow" },
            2: { id: "1548948476182798416", name: "minecraft2yellow" },
            3: { id: "1548948499846926346", name: "minecraft3yellow" },
          };

          return {
            label: `รางวัล ${s}: ${it.name || "(ว่าง — ยังไม่ตั้งชื่อ)"}`,
            value: String(s),
            description: `สถานะ: ${currentLimit}${isRole ? " (ประเภทยศ)" : ""}`,
            emoji: emojiMap[s],
          };
        })
      );

    return interaction.reply({
      flags: MessageFlags.Ephemeral | FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## 🔒︲__\` 𝖲𝗍𝗈𝗋𝖾 𝗅𝗂𝗆𝗂𝗍 ₊ เลือกช่องที่ต้องการสลับการจำกัดสิทธิ์ 𓂃 \`__\n` +
                `> กรุณาเลือกช่องของรางวัลเพื่อสลับระหว่าง **จำกัด 1 ครั้ง/คน** กับ **แลกได้ไม่จำกัด**:\n` +
                `-# *หมายเหตุ: สำหรับของรางวัลประเภทยศ ระบบจะตรวจยศซ้ำอัตโนมัติอยู่แล้วครับ*`,
            },
            {
              type: 14,
              spacing: 2,
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
                content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ ของรางวัลไม่พร้อมใช้งาน 𓂃 \`__\n> ของรางวัลชิ้นนี้ยังไม่เปิดให้แลกในขณะนี้ครับ!`,
              },
            ],
          },
        ],
      });
    }

    const eligibility = await checkUserRedemptionEligibility(supabase, interaction.guildId, interaction.user.id, slot, item, interaction.member);
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
                  `📊 **แต้มสะสมของคุณ:** **${(Number(eligibility.currentPoints ?? eligibility.points) || 0).toLocaleString()}** แต้ม\n` +
                  `🏆 **จำนวนครั้งที่ชนะ:** **${(Number(eligibility.currentWins ?? eligibility.wins) || 0).toLocaleString()}** ครั้ง`,
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
        flags: MessageFlags.Ephemeral | FLAG_V2,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ ไม่พบข้อมูลของรางวัล 𓂃 \`__\n> ไม่พบข้อมูลของรางวัลชิ้นนี้ในระบบครับ!`,
              },
            ],
          },
        ],
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
              content: `## <:68440x:1358584606911369226>︲__\` 𝖢𝖺𝗇𝖼𝖾𝗅 ₊ ยกเลิกการแลกของรางวัลแล้ว 𓂃 \`__\n> ไม่มีการหักแต้มสะสมใดๆ คุณสามารถกลับมาแลกใหม่ได้ทุกเมื่อครับ ✨`,
            },
          ],
        },
      ],
    });
  }

  // 8. ปุ่มเปิด Modal ตั้งค่าธีมหน้าร้าน (Custom JSON): akari_store_theme_btn
  if (customId === "akari_store_theme_btn") {
    if (KUMA_STORE_ALLOWED_GUILD_ID && interaction.guildId !== KUMA_STORE_ALLOWED_GUILD_ID) {
      return interaction.reply({
        content: "❌ ฟีเจอร์นี้เปิดให้ใช้งานเฉพาะในเซิร์ฟเวอร์ที่กำหนดเท่านั้นครับ",
        flags: MessageFlags.Ephemeral,
      });
    }

    const currentConfig = await getTenantStoreConfig(supabase, interaction.guildId);
    let existingJsonStr = "";
    if (currentConfig?.custom_layout_json) {
      try {
        existingJsonStr = typeof currentConfig.custom_layout_json === "string"
          ? currentConfig.custom_layout_json
          : JSON.stringify(currentConfig.custom_layout_json, null, 2);
      } catch (_) {}
    }

    const modal = new ModalBuilder()
      .setCustomId("akari_store_theme_modal_submit")
      .setTitle("🎨 ปรับแต่งธีมหน้าร้าน (Discohook)");

    const jsonInput = new TextInputBuilder()
      .setCustomId("theme_json")
      .setLabel("JSON จาก Discohook (เว้นว่างเพื่อรีเซ็ต)")
      .setStyle(TextInputStyle.Paragraph)
      .setPlaceholder("วางโค้ด JSON จาก discohook.app ที่นี่ หรือเว้นว่างเพื่อกลับไปใช้ธีมเริ่มต้น...")
      .setRequired(false)
      .setMaxLength(4000);

    if (existingJsonStr && existingJsonStr.length <= 4000) {
      jsonInput.setValue(existingJsonStr);
    }

    modal.addComponents(new ActionRowBuilder().addComponents(jsonInput));
    return interaction.showModal(modal);
  }
}

/**
 * จัดการ Modal Submit สำหรับแก้ไขข้อมูลไอเทมและธีมหน้าร้าน
 */
async function handleStoreModalSubmit(interaction, supabase) {
  const customId = interaction.customId;

  // 1. จัดการบันทึกธีมหน้าร้าน (Custom JSON): akari_store_theme_modal_submit
  if (customId === "akari_store_theme_modal_submit") {
    if (KUMA_STORE_ALLOWED_GUILD_ID && interaction.guildId !== KUMA_STORE_ALLOWED_GUILD_ID) {
      return interaction.reply({
        content: "❌ ฟีเจอร์นี้เปิดให้ใช้งานเฉพาะในเซิร์ฟเวอร์ที่กำหนดเท่านั้นครับ",
        flags: MessageFlags.Ephemeral,
      });
    }

    await interaction.deferUpdate().catch(() => {});

    const rawJson = interaction.fields.getTextInputValue("theme_json")?.trim();

    // 1.1 ถ้าเว้นว่าง หรือพิมพ์ว่า "reset" -> รีเซ็ตกลับเป็นค่าเริ่มต้น
    if (!rawJson || rawJson.toLowerCase() === "reset") {
      await saveTenantStoreConfig(supabase, interaction.guildId, {
        custom_layout_json: null,
      });

      const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
      const items = await getTenantStoreItems(supabase, interaction.guildId);
      const updatedDashboard = buildStoreSettingsDashboard(interaction.guild, storeConfig, items);
      await interaction.editReply(updatedDashboard);

      return interaction.followUp({
        flags: FLAG_V2 | MessageFlags.Ephemeral,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: "## <:50121checkmark:1358584609087946867>︲__` Reset ₊ รีเซ็ตธีมหน้าร้านสำเร็จ 𓂃 `__\n" +
                  "> ระบบได้ทำการรีเซ็ตธีมหน้าร้านกลับเป็น **เทมเพลตมาตรฐานของบอท Kuma** เรียบร้อยแล้วครับ ✨",
              },
            ],
          },
        ],
      });
    }

    // 1.2 ตรวจสอบความถูกต้องของ JSON
    let parsedJson = null;
    try {
      parsedJson = JSON.parse(rawJson);
    } catch (parseErr) {
      return interaction.followUp({
        flags: FLAG_V2 | MessageFlags.Ephemeral,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## <:lowwarning:1548772721679278180>︲__\` Error ₊ รูปแบบ JSON ไม่ถูกต้อง 𓂃 \`__\n` +
                  `> โค้ดที่คุณวางไม่สามารถแปลงเป็น JSON ได้ กรุณาคัดลอก JSON ทั้งหมดจาก **discohook.app** แล้วลองใหม่อีกครั้งนะครับ! 💡\n\n` +
                  `-# รายละเอียด: ${parseErr.message}`,
              },
            ],
          },
        ],
      });
    }

    if (!parsedJson || !Array.isArray(parsedJson.components) || parsedJson.components.length === 0) {
      return interaction.followUp({
        flags: FLAG_V2 | MessageFlags.Ephemeral,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: "## <:lowwarning:1548772721679278180>︲__` Warning ₊ โครงสร้าง Components ไม่ถูกต้อง 𓂃 `__\n" +
                  "> โค้ด JSON ต้องมีฟิลด์ `components` แบบ Array ตามมาตรฐาน Discord Component V2 ครับ",
              },
            ],
          },
        ],
      });
    }

    // 1.3 บันทึกและอัปเดตหน้าแดชบอร์ด
    await saveTenantStoreConfig(supabase, interaction.guildId, {
      custom_layout_json: parsedJson,
    });

    const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
    const items = await getTenantStoreItems(supabase, interaction.guildId);
    const updatedDashboard = buildStoreSettingsDashboard(interaction.guild, storeConfig, items);
    await interaction.editReply(updatedDashboard);

    return interaction.followUp({
      flags: FLAG_V2 | MessageFlags.Ephemeral,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: "## <:50121checkmark:1358584609087946867>︲__` Success ₊ บันทึกธีมหน้าร้านสำเร็จ 𓂃 `__\n" +
                "> บันทึกธีม Custom Component V2 เรียบร้อยแล้ว! เมื่อพิมพ์คำสั่ง `/open-store` บอทจะนำธีมนี้มาส่งพร้อมแนบปุ่มแลกรางวัลให้อัตโนมัติครับ ✨\n\n" +
                "-# 💡 สามารถกดปุ่มเดิมแล้วเว้นว่างเพื่อรีเซ็ตกลับเป็นค่าเริ่มต้นได้ตลอดเวลา",
            },
          ],
        },
      ],
    });
  }

  // 2. จัดการบันทึกข้อมูลไอเทมปกติ
  if (!customId.startsWith("akari_store_modal_submit_")) return;

  const raw = customId.replace("akari_store_modal_submit_", "");
  const [slotStr, msgId] = raw.split(":");
  const slot = parseInt(slotStr, 10);
  const name = interaction.fields.getTextInputValue("item_name")?.trim() || "";
  if (!name || name.length === 0) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral | FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ ชื่อของรางวัลไม่ถูกต้อง 𓂃 \`__\n` +
                `> กรุณาระบุชื่อของรางวัล (ความยาว 1-50 ตัวอักษร) นะครับ!`,
            },
          ],
        },
      ],
    });
  }
  if (name.length > 50) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral | FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ ชื่อของรางวัลยาวเกินไป 𓂃 \`__\n` +
                `> ชื่อของรางวัลต้องมีความยาวไม่เกิน **50** ตัวอักษรครับ (ปัจจุบัน: ${name.length} ตัวอักษร)`,
            },
          ],
        },
      ],
    });
  }

  const desc = interaction.fields.getTextInputValue("item_desc")?.trim() || "";
  if (desc.length > 100) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral | FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ คำอธิบายยาวเกินไป 𓂃 \`__\n` +
                `> คำอธิบายของรางวัลต้องมีความยาวไม่เกิน **100** ตัวอักษรครับ (ปัจจุบัน: ${desc.length} ตัวอักษร)`,
            },
          ],
        },
      ],
    });
  }

  const pointsStr = interaction.fields.getTextInputValue("item_points")?.trim() || "";
  if (!/^\d+$/.test(pointsStr)) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral | FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ แต้มต้องเป็นตัวเลข 𓂃 \`__\n` +
                `> แต้มที่ต้องใช้แลกต้องเป็น **ตัวเลขจำนวนเต็มบวกเท่านั้น** (เช่น 100 หรือ 500) และห้ามมีตัวอักษรหรือทศนิยมครับ!`,
            },
          ],
        },
      ],
    });
  }
  const pointsCost = parseInt(pointsStr, 10);
  if (pointsCost <= 0 || pointsCost > 10000000) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral | FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ แต้มไม่อยู่ในเกณฑ์ที่กำหนด 𓂃 \`__\n` +
                `> แต้มที่ต้องใช้แลกต้องอยู่ระหว่าง **1 ถึง 10,000,000** แต้มครับ!`,
            },
          ],
        },
      ],
    });
  }

  const winsStr = interaction.fields.getTextInputValue("item_wins")?.trim() || "0";
  if (!/^\d+$/.test(winsStr)) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral | FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ จำนวนชนะต้องเป็นตัวเลข 𓂃 \`__\n` +
                `> จำนวนครั้งที่ชนะขั้นต่ำต้องเป็น **ตัวเลขจำนวนเต็ม 0 ขึ้นไป** (เช่น 0 หากไม่จำกัด หรือ 5) ครับ!`,
            },
          ],
        },
      ],
    });
  }
  const winsRequired = parseInt(winsStr, 10);
  if (winsRequired < 0 || winsRequired > 100000) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral | FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ จำนวนชนะไม่อยู่ในเกณฑ์ 𓂃 \`__\n` +
                `> จำนวนครั้งที่ชนะขั้นต่ำต้องอยู่ระหว่าง **0 ถึง 100,000** ครั้งครับ!`,
            },
          ],
        },
      ],
    });
  }

  const stockStr = interaction.fields.getTextInputValue("item_stock")?.trim() || "0";
  if (!/^\d+$/.test(stockStr)) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral | FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ สต็อกต้องเป็นตัวเลข 𓂃 \`__\n` +
                `> จำนวนสต็อกต้องเป็น **ตัวเลขจำนวนเต็ม 0 ขึ้นไป** (เช่น 0 หากไม่จำกัด หรือใส่จำนวนชิ้น เช่น 10) ครับ!`,
            },
          ],
        },
      ],
    });
  }
  const parsedStock = parseInt(stockStr, 10);
  if (parsedStock < 0 || parsedStock > 1000000) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral | FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ สต็อกไม่อยู่ในเกณฑ์ 𓂃 \`__\n` +
                `> จำนวนสต็อกต้องอยู่ระหว่าง **0 ถึง 1,000,000** ชิ้นครับ!`,
            },
          ],
        },
      ],
    });
  }
  const stock = parsedStock === 0 ? -1 : parsedStock;

  // 1. รับทราบ interaction ทันทีเพื่อป้องกัน Timeout 3 วินาทีของ Discord
  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

  const existingItems = await getTenantStoreItems(supabase, interaction.guildId);
  const existingItem = existingItems.find((i) => i.slot === slot);

  // Duplicate Check: หากข้อมูลเหมือนเดิมทุกประการ ไม่ต้องบันทึกซ้ำและไม่ต้องแก้แดชบอร์ด
  if (
    existingItem &&
    existingItem.is_configured &&
    existingItem.name === name &&
    (existingItem.description || "") === desc &&
    existingItem.points_cost === pointsCost &&
    existingItem.wins_required === winsRequired &&
    (existingItem.stock ?? -1) === stock
  ) {
    return interaction.editReply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: "## <:50121checkmark:1358584609087946867>︲__` Successfully fixed ₊ แก้ไขสำเร็จ 𓂃 `__",
            },
          ],
        },
      ],
    });
  }

  const defaultSlotEmojis = { 1: "🎁", 2: "👑", 3: "☕" };
  const emoji = existingItem?.emoji || defaultSlotEmojis[slot] || "🎁";

  await saveTenantStoreItem(supabase, interaction.guildId, slot, {
    name,
    description: desc,
    points_cost: pointsCost,
    wins_required: winsRequired,
    stock,
    emoji,
    is_configured: true,
  });

  // อัปเดต Component V2 ของแดชบอร์ดหลักในห้องแชท
  if (interaction.message) {
    (async () => {
      try {
        const [storeConfig, updatedItems] = await Promise.all([
          getTenantStoreConfig(supabase, interaction.guildId),
          getTenantStoreItems(supabase, interaction.guildId),
        ]);
        await interaction.message.edit(buildStoreSettingsDashboard(interaction.guild, storeConfig, updatedItems)).catch(() => {});
      } catch (err) {}
    })();
  } else if (msgId && interaction.channel) {
    (async () => {
      try {
        const [originalMsg, storeConfig, updatedItems] = await Promise.all([
          interaction.channel.messages.fetch(msgId).catch(() => null),
          getTenantStoreConfig(supabase, interaction.guildId),
          getTenantStoreItems(supabase, interaction.guildId),
        ]);
        if (originalMsg) {
          await originalMsg.edit(buildStoreSettingsDashboard(interaction.guild, storeConfig, updatedItems)).catch(() => {});
        }
      } catch (err) {}
    })();
  }

  // อัปเดตหน้าต่าง Ephemeral เป็นการ์ดแก้ไขสำเร็จ (Component V2)
  return interaction.editReply({
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: "## <:50121checkmark:1358584609087946867>︲__` Successfully fixed ₊ แก้ไขสำเร็จ 𓂃 `__",
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

  // 1. เมนูเลือกช่องเพื่อตั้งค่าไอเทม: akari_store_edit_select
  if (customId === "akari_store_edit_select") {
    const slot = parseInt(interaction.values[0], 10);
    const items = await getTenantStoreItems(supabase, interaction.guildId);
    const item = items.find((i) => i.slot === slot);
    const msgId = interaction.message?.id || "";

    const modal = new ModalBuilder()
      .setCustomId(`akari_store_modal_submit_${slot}:${msgId}`)
      .setTitle(`ตั้งค่าของรางวัลช่องที่ ${slot}`);

    const nameInput = new TextInputBuilder()
      .setCustomId("item_name")
      .setLabel("ชื่อของรางวัล")
      .setStyle(TextInputStyle.Short)
      .setValue(item?.name || "")
      .setPlaceholder("เช่น ยศ VIP, บัตรเครื่องดื่ม, ของพรีเมียม")
      .setRequired(true)
      .setMaxLength(50);

    const descInput = new TextInputBuilder()
      .setCustomId("item_desc")
      .setLabel("คำอธิบายของรางวัล")
      .setStyle(TextInputStyle.Paragraph)
      .setValue(item?.description || "")
      .setPlaceholder("ระบุรายละเอียดหรือสิ่งที่ผู้เล่นจะได้รับ...")
      .setRequired(false)
      .setMaxLength(100);

    const pointsInput = new TextInputBuilder()
      .setCustomId("item_points")
      .setLabel("แต้มที่ต้องใช้แลก (ตัวเลข)")
      .setStyle(TextInputStyle.Short)
      .setValue(item?.points_cost ? String(item.points_cost) : "100")
      .setRequired(true);

    const winsInput = new TextInputBuilder()
      .setCustomId("item_wins")
      .setLabel("จำนวนครั้งที่ชนะขั้นต่ำ (0 หากไม่จำกัด)")
      .setStyle(TextInputStyle.Short)
      .setValue(String(item?.wins_required ?? 0))
      .setRequired(false);

    modal.addComponents(
      new ActionRowBuilder().addComponents(nameInput),
      new ActionRowBuilder().addComponents(descInput),
      new ActionRowBuilder().addComponents(pointsInput),
      new ActionRowBuilder().addComponents(winsInput),
    );

    return interaction.showModal(modal);
  }

  // 2. เมนูสลับสถานะเปิด / ปิด การใช้งาน: akari_store_toggle_select
  if (customId === "akari_store_toggle_select") {
    const slot = parseInt(interaction.values[0], 10);
    const items = await getTenantStoreItems(supabase, interaction.guildId);
    const item = items.find((i) => i.slot === slot);

    if (!item || !item.is_configured) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral | FLAG_V2,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ ช่องนี้ยังไม่ได้ตั้งค่า 𓂃 \`__\n` +
                  `> ช่องที่ ${slot} ยังไม่มีข้อมูลของรางวัล กรุณาเลือกตั้งค่าของรางวัลจากเมนูด้านบนก่อนเปิดใช้งานนะครับ! ✨`,
              },
            ],
          },
        ],
      });
    }

    await saveTenantStoreItem(supabase, interaction.guildId, slot, {
      is_active: !item.is_active,
    });

    const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
    const updatedItems = await getTenantStoreItems(supabase, interaction.guildId);
    const updatedPayload = buildStoreSettingsDashboard(interaction.guild, storeConfig, updatedItems);
    return interaction.update(updatedPayload);
  }

  // เมนูเลือกช่องเป้าหมายที่จะผูกยศ: akari_store_role_slot_target
  if (customId.startsWith("akari_store_role_slot_target")) {
    const parts = customId.split(":");
    const msgId = parts[1] || "";
    const targetSlot = interaction.values[0];
    const targetSlotNum = parseInt(targetSlot, 10);

    const items = await getTenantStoreItems(supabase, interaction.guildId);
    const targetItem = items.find((i) => i.slot === targetSlotNum);

    // ตรวจสอบว่าช่องที่เลือกได้รับการตั้งค่ารางวัลแล้วหรือไม่
    if (!targetItem || !targetItem.is_configured) {
      return interaction.update({
        flags: MessageFlags.Ephemeral | FLAG_V2,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ ช่องนี้ยังไม่ได้ตั้งค่า 𓂃 \`__\n` +
                  `> ช่องที่ ${targetSlot} ยังไม่ได้ตั้งค่า กรุณากรอกข้อมูลรางวัลผ่านปุ่มแก้ไข (📝) ก่อนทำการผูกยศนะครับ! ✨`,
              },
            ],
          },
        ],
      });
    }

    const roleSelect = new RoleSelectMenuBuilder()
      .setCustomId(`akari_store_role_selected_slot_${targetSlot}:${msgId}`)
      .setPlaceholder("📦︲เลือกยศ Discord ที่ต้องการมอบให้...");

    return interaction.update({
      flags: MessageFlags.Ephemeral | FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `##  <a:643900sevlev:1548947725133942824>︲__\` 𝖲𝗍𝗈𝗋𝖾 𝗋𝗈𝗅𝖾 ₊ ผูกยศสำหรับรางวัล ${targetSlot} 𓂃 \`__\n` +
                `> กรุณาเลือกบทบาท Discord ที่ผู้เล่นจะได้รับเมื่อแลกรางวัลช่องที่ ${targetSlot}:`,
            },
            {
              type: 14,
              spacing: 2,
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

  // เมนูเลือกช่องของรางวัลเพื่อสลับการจำกัดสิทธิ์ (1 ครั้ง/คน vs ไม่จำกัด): akari_store_limit_slot_target
  if (customId.startsWith("akari_store_limit_slot_target")) {
    const raw = customId.replace("akari_store_limit_slot_target:", "");
    const msgId = raw;
    const slot = parseInt(interaction.values[0], 10);

    const items = await getTenantStoreItems(supabase, interaction.guildId);
    const item = items.find((i) => i.slot === slot);

    if (!item || !item.is_configured) {
      return interaction.reply({
        flags: MessageFlags.Ephemeral | FLAG_V2,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ ช่องนี้ยังไม่ได้ตั้งค่า 𓂃 \`__\n` +
                  `> ช่องที่ ${slot} ยังไม่ได้ตั้งค่า กรุณากรอกข้อมูลรางวัลผ่านปุ่มแก้ไข (📝) ก่อนนะครับ! ✨`,
              },
            ],
          },
        ],
      });
    }

    if (item.reward_type === "role") {
      return interaction.reply({
        flags: MessageFlags.Ephemeral | FLAG_V2,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## ℹ️︲__\` 𝖲𝗍𝗈𝗋𝖾 𝗅𝗂𝗆𝗂𝗍 ₊ รางวัลประเภทยศ 𓂃 \`__\n` +
                  `> ของรางวัลช่องที่ ${slot} (${item.name}) เป็น **ประเภทยศ Discord**\n` +
                  `> ระบบได้รับการตั้งค่าให้ **ตรวจยศซ้ำอัตโนมัติ** อยู่แล้วครับ ผู้เล่นที่มีบทบาทนี้อยู่แล้วจะไม่สามารถแลกรับซ้ำได้`,
              },
            ],
          },
        ],
      });
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

    const newLimit = item.limit_type === "once_per_user" ? "unlimited" : "once_per_user";
    await saveTenantStoreItem(supabase, interaction.guildId, slot, {
      limit_type: newLimit,
    });

    const editReplyPromise = interaction.editReply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: "## <:50121checkmark:1358584609087946867>︲__` Successfully fixed ₊ แก้ไขสำเร็จ 𓂃 `__",
            },
          ],
        },
      ],
    }).catch(() => {});

    // อัปเดต Component V2 ของแดชบอร์ดหลักในห้องแชท
    if (msgId && interaction.channel) {
      (async () => {
        try {
          const [originalMsg, storeConfig, updatedItems] = await Promise.all([
            interaction.channel.messages.fetch(msgId).catch(() => null),
            getTenantStoreConfig(supabase, interaction.guildId),
            getTenantStoreItems(supabase, interaction.guildId),
          ]);
          if (originalMsg) {
            await originalMsg.edit(buildStoreSettingsDashboard(interaction.guild, storeConfig, updatedItems)).catch(() => {});
          }
        } catch (err) {}
      })();
    }

    return await editReplyPromise;
  }

  // เมนูเลือกยศ Discord สำหรับช่องที่ระบุ: akari_store_role_selected_slot_1/2/3
  if (customId.startsWith("akari_store_role_selected_slot_")) {
    // 1. รับทราบ interaction ทันทีเพื่อป้องกัน Timeout 3 วินาทีของ Discord
    await interaction.deferUpdate().catch(() => {});

    const raw = customId.replace("akari_store_role_selected_slot_", "");
    const [slotStr, msgId] = raw.split(":");
    const slot = parseInt(slotStr, 10);
    const selectedRoleId = interaction.values[0];

    const items = await getTenantStoreItems(supabase, interaction.guildId);
    const item = items.find((i) => i.slot === slot);

    // Safety net: ถ้าช่องนี้ยังไม่ได้ตั้งค่า
    if (!item || !item.is_configured) {
      return interaction.editReply({
        flags: FLAG_V2,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ ช่องนี้ยังไม่ได้ตั้งค่า 𓂃 \`__\n` +
                  `> ช่องที่ ${slot} ยังไม่ได้ตั้งค่า กรุณากรอกข้อมูลรางวัลผ่านปุ่มแก้ไข (📝) ก่อนทำการผูกยศนะครับ! ✨`,
              },
            ],
          },
        ],
      });
    }

    // Duplicate Check: หากช่องนี้ผูกยศเดิมนี้อยู่แล้ว ข้ามการบันทึกและข้ามการแก้แดชบอร์ด
    if (item.reward_type === "role" && item.role_id === selectedRoleId) {
      return interaction.editReply({
        flags: FLAG_V2,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: "## <:50121checkmark:1358584609087946867>︲__` Successfully fixed ₊ แก้ไขสำเร็จ 𓂃 `__",
              },
            ],
          },
        ],
      });
    }

    await saveTenantStoreItem(supabase, interaction.guildId, slot, {
      reward_type: "role",
      role_id: selectedRoleId,
      limit_type: "once_per_user", // รางวัลยศกำหนดให้แลกได้ครั้งเดียวต่อคนเป็นค่าเริ่มต้น
      is_configured: true,
    });

    // อัปเดตหน้าต่าง Ephemeral เป็นการ์ดแก้ไขสำเร็จ (Component V2)
    const editReplyPromise = interaction.editReply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: "## <:50121checkmark:1358584609087946867>︲__` Successfully fixed ₊ แก้ไขสำเร็จ 𓂃 `__",
            },
          ],
        },
      ],
    }).catch(() => {});

    // อัปเดต Component V2 ของแดชบอร์ดหลักในห้องแชท
    if (msgId && interaction.channel) {
      (async () => {
        try {
          const [originalMsg, storeConfig, updatedItems] = await Promise.all([
            interaction.channel.messages.fetch(msgId).catch(() => null),
            getTenantStoreConfig(supabase, interaction.guildId),
            getTenantStoreItems(supabase, interaction.guildId),
          ]);
          if (originalMsg) {
            await originalMsg.edit(buildStoreSettingsDashboard(interaction.guild, storeConfig, updatedItems)).catch(() => {});
          }
        } catch (err) {}
      })();
    }

    return await editReplyPromise;
  }

  // เมนูเลือกห้อง Log Channel โดยตรงบนแดชบอร์ดหลัก (Inline Channel Select Menu)
  if (
    customId === "akari_store_log_channel_select" ||
    customId === "p_361750733613174785" ||
    customId.startsWith("akari_store_log_channel_select")
  ) {
    const selectedChannelId = interaction.values[0];
    await saveTenantStoreConfig(supabase, interaction.guildId, {
      log_channel_id: selectedChannelId,
    });
    const storeConfig = await getTenantStoreConfig(supabase, interaction.guildId);
    const updatedItems = await getTenantStoreItems(supabase, interaction.guildId);
    const updatedPayload = buildStoreSettingsDashboard(interaction.guild, storeConfig, updatedItems);
    return interaction.update(updatedPayload);
  }

  // เมนูเลือกห้อง Log Channel: akari_store_log_channel_selected (Ephemeral Fallback)
  if (customId.startsWith("akari_store_log_channel_selected")) {
    // 1. รับทราบ interaction ทันทีเพื่อป้องกัน Timeout 3 วินาทีของ Discord
    await interaction.deferUpdate().catch(() => {});

    const [_, msgId] = customId.split(":");
    const selectedChannelId = interaction.values[0];

    const currentConfig = await getTenantStoreConfig(supabase, interaction.guildId);

    // Duplicate Check: หากเลือกห้องเดิมที่ตั้งไว้อยู่แล้ว ข้ามการบันทึกและข้ามการแก้แดชบอร์ด
    if (currentConfig?.log_channel_id === selectedChannelId) {
      return interaction.editReply({
        flags: FLAG_V2,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: "## <:50121checkmark:1358584609087946867>︲__` Successfully fixed ₊ แก้ไขสำเร็จ 𓂃 `__",
              },
            ],
          },
        ],
      });
    }

    await saveTenantStoreConfig(supabase, interaction.guildId, {
      log_channel_id: selectedChannelId,
    });

    // อัปเดตหน้าต่าง Ephemeral เป็นการ์ดแก้ไขสำเร็จ (Component V2)
    const editReplyPromise = interaction.editReply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: "## <:50121checkmark:1358584609087946867>︲__` Successfully fixed ₊ แก้ไขสำเร็จ 𓂃 `__",
            },
          ],
        },
      ],
    }).catch(() => {});

    // อัปเดต Component V2 ของแดชบอร์ดหลักในห้องแชท
    if (msgId && interaction.channel) {
      (async () => {
        try {
          const [originalMsg, storeConfig, updatedItems] = await Promise.all([
            interaction.channel.messages.fetch(msgId).catch(() => null),
            getTenantStoreConfig(supabase, interaction.guildId),
            getTenantStoreItems(supabase, interaction.guildId),
          ]);
          if (originalMsg) {
            await originalMsg.edit(buildStoreSettingsDashboard(interaction.guild, storeConfig, updatedItems)).catch(() => {});
          }
        } catch (err) {}
      })();
    }

    return await editReplyPromise;
  }
}

module.exports = {
  STORE_SLASH_COMMANDS,
  KUMA_STORE_SLASH_COMMANDS: STORE_SLASH_COMMANDS,
  KUMA_STORE_ALLOWED_GUILD_ID,
  handleSettingStore,
  handleOpenStore,
  handleStoreButtonInteraction,
  handleStoreModalSubmit,
  handleStoreSelectMenus,
};
