// handlers/rentHousePanel.js
// ระบบแผงตั้งค่าและจัดการสิทธิ์สำหรับห้อง "บ้านเช่าหมี" (Rent House Room Panel)
// ออกแบบโดยใช้ Component v2 และควบคุมผ่าน Select Menu สำหรับบ้านเช่าโดยเฉพาะ

const {
  ActionRowBuilder,
  ComponentType,
  ModalBuilder,
  PermissionFlagsBits,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} = require("discord.js");
const { createClient } = require("@supabase/supabase-js");
const {
  EPHEMERAL_FLAG,
  safeShowModal,
  safeMoveMember,
} = require("../utils/discordSafety");
const { safeSetChannelName } = require("../utils/channelRenameGuard");

const MEMBER_ROLE_ID = "1144700895020462200";
const RENT_HOUSE_CATEGORY_ID = "1524122689604816986";

let supabaseClient;
function getSupabase() {
  if (!supabaseClient && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return supabaseClient;
}

const RENT_HOUSE_IMAGE_URL =
  "https://cdn.discordapp.com/attachments/1524704267015819274/1532018949703729234/NewsBoard_-_bearcafe_17.png?ex=6a6b5355&is=6a6a01d5&hm=7f51d2a4e6791f5046fe887f0a1a23d91bc64806712520785e0209fd7c701b17&";

const RENT_CUSTOM_IDS = {
  panelSelect: "rh_panel_select_action",
  selectTrust: "rh_select_trust",
  selectUntrust: "rh_select_untrust",
  selectKick: "rh_select_kick",
  modalName: "rh_modal_name",
  modalLimit: "rh_modal_limit",
};

/**
 * ฟังก์ชันสร้าง Response รูปแบบ Component v2 Container Card
 */
function createV2CardResponse(title, textContent, icon = "ℹ️") {
  return {
    flags: 32768 | 64, // Component v2 Ephemeral
    components: [
      {
        type: 17, // Container
        components: [
          {
            type: 10, // Text Section
            content: `## ${icon}︲__\` ${title} \`__\n${textContent}`,
          },
        ],
      },
    ],
  };
}

/**
 * สร้าง Payload แผงควบคุมบ้านเช่า รูปแบบ Component v2 + Select Menu
 */
function createRentHousePanelPayload(ownerMember) {
  const options = [
    {
      label: "ดูข้อมูลสัญญาเช่า",
      description: "ตรวจสอบรายละเอียดและวันหมดอายุสัญญาเช่าบ้าน",
      value: "rh_opt_info",
      emoji: { name: "📜" },
    },
    {
      label: "เปลี่ยนชื่อห้อง",
      description: "ตั้งชื่อห้องบ้านเช่าของคุณใหม่",
      value: "rh_opt_name",
      emoji: { name: "📝" },
    },
    {
      label: "เปลี่ยนจำนวนคน",
      description: "ปรับเปลี่ยนจำนวนสมาชิกสูงสุดที่เข้าห้องได้",
      value: "rh_opt_limit",
      emoji: { name: "👥" },
    },
    {
      label: "ล็อค / ปลดล็อคห้อง",
      description: "สลับสถานะล็อคห้อง (เปิด/ปิด ให้สมาชิกทั่วไปเข้า)",
      value: "rh_opt_lock",
      emoji: { name: "🔓" },
    },
    {
      label: "ซ่อน / เปิดมองเห็นห้อง",
      description: "สลับสถานะการซ่อนห้องจากรายชื่อห้อง",
      value: "rh_opt_hide",
      emoji: { name: "👀" },
    },
    {
      label: "อนุญาตสมาชิก (Trust)",
      description: "เพิ่มสมาชิกที่อนุญาตให้เข้าห้องได้เป็นพิเศษ",
      value: "rh_opt_trust",
      emoji: { name: "➕" },
    },
    {
      label: "ยกเลิกอนุญาตสมาชิก",
      description: "ถอดสิทธิ์พิเศษของสมาชิกที่เคยอนุญาตไว้",
      value: "rh_opt_untrust",
      emoji: { name: "➖" },
    },
    {
      label: "เตะสมาชิกออกจากห้อง",
      description: "เตะสมาชิกที่ไม่ต้องการออกจากห้องเสียงทันที",
      value: "rh_opt_kick",
      emoji: { name: "📤" },
    },
    {
      label: "ตรวจสอบสิทธิ์สมาชิก",
      description: "ดูรายชื่อสมาชิกที่ได้รับสิทธิ์พิเศษในห้อง",
      value: "rh_opt_permissions",
      emoji: { name: "📋" },
    },
  ];

  return {
    flags: 32768, // Component v2 Container
    components: [
      {
        type: 17, // Container
        components: [
          {
            type: 12, // Media
            items: [
              {
                media: {
                  url: RENT_HOUSE_IMAGE_URL,
                },
              },
            ],
          },
          { type: 14, spacing: 2 },
          {
            type: 10, // Text Section
            content:
              `## 🏠︲__\` 𝖱𝖾𝗇𝗍 𝖧𝗈𝗎𝗌𝖾 𝖢𝗈𝗇𝗍𝗋𝗈𝗅 𝖯𝖺𝗇𝖾𝗅 ₊ บ้านเช่าหมี 𓂃 \`__\n` +
              `> ยินดีต้อนรับสู่บ้านเช่าหมีค่ะ ${ownerMember}\n` +
              `> คุณสามารถตั้งค่าห้อง จัดการสิทธิ์ และดูข้อมูลสัญญาผ่านเมนูด้านล่างนี้ได้เลยนะคะ`,
          },
          { type: 14, spacing: 2 },
          {
            type: 1, // ActionRow
            components: [
              {
                type: 3, // StringSelectMenu
                custom_id: RENT_CUSTOM_IDS.panelSelect,
                placeholder: "⚙️ เลือกรายการที่ต้องการจัดการห้อง...",
                options: options,
              },
            ],
          },
          { type: 14, spacing: 2 },
        ],
      },
    ],
  };
}

async function sendRentHousePanel(channel, ownerMember) {
  if (!channel || typeof channel.send !== "function") return null;

  try {
    const payload = createRentHousePanelPayload(ownerMember || "เจ้าของบ้านเช่า");
    const msg = await channel.send(payload);
    return msg;
  } catch (err) {
    console.error(`[rentHousePanel] Failed to send rent house panel to channel ${channel.id}:`, err.message);
    return null;
  }
}

async function sendInteractionResponse(interaction, payload) {
  if (interaction.replied || interaction.deferred) {
    return await interaction.followUp(payload);
  } else {
    return await interaction.reply(payload);
  }
}

/**
 * จัดการ Interaction ทั้งหมดของแผงควบคุมบ้านเช่า
 */
async function handleRentHousePanelInteraction(interaction) {
  if (!interaction.guild) return false;
  if (!interaction.isUserSelectMenu() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return false;

  const customId = interaction.customId;
  if (!customId || typeof customId !== "string") return false;

  const channel = interaction.channel;
  if (!channel || channel.parentId !== RENT_HOUSE_CATEGORY_ID) return false;

  // ตรวจสอบว่าเป็น Interaction ของระบบบ้านเช่าจริง
  const isRentHouseCustomId = customId === RENT_CUSTOM_IDS.panelSelect || customId.startsWith("rh_");
  if (!isRentHouseCustomId) return false;

  // ตรวจสอบสิทธิ์เจ้าของห้องสำหรับทุกปุ่ม/เมนู/มอดัล
  const isOwner = await isRentHouseOwner(channel, interaction.user.id);
  if (!isOwner) {
    if (interaction.isModalSubmit()) {
      return await interaction.reply({
        content: "❌ ขออภัยค่ะ เฉพาะเจ้าของบ้านเช่าหลังนี้เท่านั้นที่สามารถตั้งค่าและจัดการห้องได้นะคะ",
        flags: 64
      });
    }

    if (interaction.isStringSelectMenu() && customId === RENT_CUSTOM_IDS.panelSelect) {
      await interaction.update(createRentHousePanelPayload(interaction.member)).catch(() => {});
    } else {
      await interaction.deferUpdate().catch(() => {});
    }

    return await interaction.followUp({
      ...createV2CardResponse("การเข้าถึงถูกปฏิเสธ", "> ❌ ขออภัยค่ะ เฉพาะเจ้าของบ้านเช่าหลังนี้เท่านั้นที่สามารถใช้งานแผงควบคุมได้ค่ะ", "🔒"),
      flags: 64
    });
  }

  // 1. Select Menu หลักของแผงควบคุมบ้านเช่า
  if (interaction.isStringSelectMenu() && customId === RENT_CUSTOM_IDS.panelSelect) {
    const selected = interaction.values[0];

    if (selected === "rh_opt_name") {
      const res = await showRentNameModal(interaction);
      await interaction.message?.edit(createRentHousePanelPayload(interaction.member)).catch(() => {});
      return res;
    }

    if (selected === "rh_opt_limit") {
      const res = await showRentLimitModal(interaction);
      await interaction.message?.edit(createRentHousePanelPayload(interaction.member)).catch(() => {});
      return res;
    }

    // รีเซ็ต Select Menu บนข้อความแผงควบคุมให้กลับเป็นค่าเริ่มต้น (Placeholder) ทันที
    await interaction.update(createRentHousePanelPayload(interaction.member)).catch(() => {});

    switch (selected) {
      case "rh_opt_info":
        return await handleShowContractInfo(interaction);
      case "rh_opt_lock":
        return await handleRentLockToggle(interaction);
      case "rh_opt_hide":
        return await handleRentHideToggle(interaction);
      case "rh_opt_trust":
        return await showUserSelectMenu(interaction, RENT_CUSTOM_IDS.selectTrust, "เลือกสมาชิกที่ต้องการให้อนุญาตเข้าห้อง (เลือกได้หลายคน)", 25);
      case "rh_opt_untrust":
        return await showUserSelectMenu(interaction, RENT_CUSTOM_IDS.selectUntrust, "เลือกสมาชิกที่ต้องการยกเลิกการอนุญาต (เลือกได้หลายคน)", 25);
      case "rh_opt_kick":
        return await showUserSelectMenu(interaction, RENT_CUSTOM_IDS.selectKick, "เลือกสมาชิกที่ต้องการเตะออกจากห้อง (เลือกได้หลายคน)", 25);
      case "rh_opt_permissions":
        return await handleRentPermissionsList(interaction);
      default:
        return false;
    }
  }

  // 2. User Select Menus & Modals
  if (interaction.isUserSelectMenu() && customId.startsWith("rh_select_")) {
    return await handleRentUserSelect(interaction);
  }

  if (interaction.isModalSubmit() && customId.startsWith("rh_modal_")) {
    return await handleRentModalSubmit(interaction);
  }

  return false;
}

/**
 * ดึงและแสดงข้อมูลสัญญาเช่าบ้าน (Component v2)
 */
async function handleShowContractInfo(interaction) {
  const supabase = getSupabase();
  if (!supabase) {
    return await sendInteractionResponse(interaction, createV2CardResponse("ข้อผิดพลาดระบบ", "> ❌ ไม่สามารถเชื่อมต่อกับฐานข้อมูล Supabase ได้ในขณะนี้", "⚠️"));
  }

  const channelId = interaction.channelId;

  try {
    const { data: contracts, error } = await supabase
      .from("contracts")
      .select("*")
      .eq("type", "house")
      .ilike("room_link", `%${channelId}%`)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw error;

    if (!contracts || contracts.length === 0) {
      return await sendInteractionResponse(interaction, createV2CardResponse("ข้อมูลสัญญาเช่า", "> ℹ️ ไม่พบข้อมูลสัญญาเช่าบ้านสำหรับห้องนี้ในระบบตาราง `contracts` ค่ะ", "📜"));
    }

    const contract = contracts[0];
    const startUnix = contract.start_at ? Math.floor(new Date(contract.start_at).getTime() / 1000) : null;
    const endUnix = contract.end_at ? Math.floor(new Date(contract.end_at).getTime() / 1000) : null;
    const createdUnix = contract.created_at ? Math.floor(new Date(contract.created_at).getTime() / 1000) : null;

    const infoLines = [
      `> (👤)︰**ผู้เช่า:** <@${contract.member_id}> (\`${contract.member_id}\`)`,
      `> (📅)︰**วันเริ่มสัญญา:** ${startUnix ? `<t:${startUnix}:F>` : "ไม่ได้ระบุ"}`,
      `> (⏳)︰**วันหมดสัญญา:** ${endUnix ? `<t:${endUnix}:F> (<t:${endUnix}:R>)` : "ไม่มีกำหนดวันหมดอายุ"}`,
      `> (🔗)︰**ลิงก์ห้อง:** ${contract.room_link ? `${contract.room_link}` : "ไม่ได้ระบุ"}`,
      `> (🛠️)︰**ผู้ทำรายการ:** ${contract.operator_name || "ระบบอัตโนมัติ"}`,
      `> (📝)︰**วันที่สร้างสัญญา:** ${createdUnix ? `<t:${createdUnix}:F>` : "ไม่ได้ระบุ"}`,
    ];

    return await sendInteractionResponse(interaction, createV2CardResponse("ข้อมูลสัญญาเช่าบ้าน (Contract Info)", infoLines.join("\n"), "📜"));
  } catch (err) {
    console.error("[rentHousePanel] Error fetching contract info:", err.message);
    return await sendInteractionResponse(interaction, createV2CardResponse("เกิดข้อผิดพลาด", `> ❌ เกิดข้อผิดพลาดในการดึงข้อมูลสัญญา: ${err.message}`, "⚠️"));
  }
}

async function showRentNameModal(interaction) {
  if (interaction.replied || interaction.deferred) return false;
  const modal = new ModalBuilder()
    .setCustomId(RENT_CUSTOM_IDS.modalName)
    .setTitle("เปลี่ยนชื่อบ้านเช่า")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("room_name")
          .setLabel("ชื่อบ้านเช่าใหม่")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true)
          .setValue((interaction.channel?.name ?? "").slice(0, 100))
      )
    );
  await safeShowModal(interaction, modal);
  return true;
}

async function showRentLimitModal(interaction) {
  if (interaction.replied || interaction.deferred) return false;
  const currentLimit = interaction.channel?.userLimit ?? 0;
  const modal = new ModalBuilder()
    .setCustomId(RENT_CUSTOM_IDS.modalLimit)
    .setTitle("เปลี่ยนจำนวนคนเข้าห้อง")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("user_limit")
          .setLabel("จำกัดจำนวนคน (0 = ไม่จำกัด, สูงสุด 99)")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(2)
          .setRequired(true)
          .setValue(String(currentLimit))
      )
    );
  await safeShowModal(interaction, modal);
  return true;
}

async function showUserSelectMenu(interaction, customId, placeholder, maxValues = 25) {
  const selectMenu = new UserSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setMinValues(1)
    .setMaxValues(maxValues);

  const row = new ActionRowBuilder().addComponents(selectMenu);
  return await sendInteractionResponse(interaction, {
    flags: 32768 | 64, // Component v2 Ephemeral
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `## 👤︲__\` การจัดการสิทธิ์สมาชิก \`__\n> เลือกสมาชิกที่ต้องการจัดการสิทธิ์ในเมนูด้านล่างนี้ได้เลยค่ะ:`,
          },
          { type: 14, spacing: 2 },
          row,
        ],
      },
    ],
  });
}

const MEMBER_ALLOW_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.Stream,
  PermissionFlagsBits.UseVAD,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.UseSoundboard,
  PermissionFlagsBits.UseApplicationCommands,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.UseExternalEmojis,
  PermissionFlagsBits.UseExternalStickers,
  PermissionFlagsBits.SendVoiceMessages,
];

/**
 * ซิงค์ Permission Overwrites บน Discord ให้ตรงตามข้อมูลใน Supabase (rent_house_settings)
 */
async function syncRentHousePermissions(channel, setting = null) {
  if (!channel) return;

  const supabase = getSupabase();
  let currentSetting = setting;

  if (!currentSetting && supabase) {
    try {
      const { data } = await supabase
        .from("rent_house_settings")
        .select("*")
        .eq("channel_id", channel.id)
        .maybeSingle();
      currentSetting = data;
    } catch (e) {
      console.error("[rentHousePanel] Error loading setting for sync:", e.message);
    }
  }

  const memberRole = channel.guild.roles.cache.get(MEMBER_ROLE_ID) || MEMBER_ROLE_ID;
  const isHidden = !!currentSetting?.hidden;
  const isLocked = !!currentSetting?.locked;

  // 1. กำหนดสิทธิ์ให้ยศสมาชิกหลัก (MEMBER_ROLE_ID)
  const deniedPermissions = [
    ...(isHidden ? [PermissionFlagsBits.ViewChannel] : []),
    ...(isLocked ? [PermissionFlagsBits.Connect] : []),
  ];

  const editOptions = {};
  for (const perm of MEMBER_ALLOW_PERMISSIONS) {
    const key = Object.keys(PermissionFlagsBits).find((k) => PermissionFlagsBits[k] === perm);
    if (key) {
      editOptions[key] = !deniedPermissions.includes(perm);
    }
  }
  await channel.permissionOverwrites.edit(memberRole, editOptions).catch(() => {});

  // 2. ซิงค์สิทธิ์รายบุคคลสำหรับ Trusted Users (trusted_user_ids)
  const trustedIds = new Set(currentSetting?.trusted_user_ids || []);
  for (const tId of trustedIds) {
    await channel.permissionOverwrites.edit(tId, {
      ViewChannel: true,
      Connect: true,
      Speak: true,
      Stream: true,
      SendMessages: true,
      ReadMessageHistory: true,
    }).catch(() => {});
  }
}

async function handleRentLockToggle(interaction) {
  const channel = interaction.channel;
  if (!channel) return false;

  const supabase = getSupabase();
  let currentSetting = null;
  if (supabase) {
    const { data } = await supabase
      .from("rent_house_settings")
      .select("*")
      .eq("channel_id", channel.id)
      .maybeSingle();
    currentSetting = data;
  }

  const roleOverwrite = channel.permissionOverwrites.cache.get(MEMBER_ROLE_ID);
  const isCurrentlyLocked = currentSetting ? !!currentSetting.locked : (roleOverwrite?.deny.has(PermissionFlagsBits.Connect) ?? false);
  const willLock = !isCurrentlyLocked;

  try {
    const newSetting = {
      channel_id: channel.id,
      owner_id: currentSetting?.owner_id || interaction.user.id,
      locked: willLock,
      hidden: currentSetting?.hidden || false,
      trusted_user_ids: currentSetting?.trusted_user_ids || [],
      updated_at: new Date().toISOString(),
    };

    if (supabase) {
      await supabase.from("rent_house_settings").upsert(newSetting);
    }

    await syncRentHousePermissions(channel, newSetting);

    return await sendInteractionResponse(
      interaction,
      createV2CardResponse(
        willLock ? "สถานะห้อง: ล็อค" : "สถานะห้อง: ปลดล็อค",
        willLock
          ? "> 🔒 ล็อคบ้านเช่าเรียบร้อยแล้วค่ะ สมาชิกทั่วไปจะไม่สามารถเข้าได้"
          : "> 🔓 ปลดล็อคบ้านเช่าเรียบร้อยแล้วค่ะ สมาชิกทั่วไปสามารถเข้าได้",
        willLock ? "🔒" : "🔓"
      )
    );
  } catch (err) {
    return await sendInteractionResponse(
      interaction,
      createV2CardResponse("เกิดข้อผิดพลาด", `> ❌ เกิดข้อผิดพลาดในการเปลี่ยนสิทธิ์ล็อค: ${err.message}`, "⚠️")
    );
  }
}

async function handleRentHideToggle(interaction) {
  const channel = interaction.channel;
  if (!channel) return false;

  const supabase = getSupabase();
  let currentSetting = null;
  if (supabase) {
    const { data } = await supabase
      .from("rent_house_settings")
      .select("*")
      .eq("channel_id", channel.id)
      .maybeSingle();
    currentSetting = data;
  }

  const roleOverwrite = channel.permissionOverwrites.cache.get(MEMBER_ROLE_ID);
  const isCurrentlyHidden = currentSetting ? !!currentSetting.hidden : (roleOverwrite?.deny.has(PermissionFlagsBits.ViewChannel) ?? false);
  const willHide = !isCurrentlyHidden;

  try {
    const newSetting = {
      channel_id: channel.id,
      owner_id: currentSetting?.owner_id || interaction.user.id,
      locked: currentSetting?.locked || false,
      hidden: willHide,
      trusted_user_ids: currentSetting?.trusted_user_ids || [],
      updated_at: new Date().toISOString(),
    };

    if (supabase) {
      await supabase.from("rent_house_settings").upsert(newSetting);
    }

    await syncRentHousePermissions(channel, newSetting);

    return await sendInteractionResponse(
      interaction,
      createV2CardResponse(
        willHide ? "สถานะห้อง: ซ่อน" : "สถานะห้อง: เปิดมองเห็น",
        willHide
          ? "> 👀 ซ่อนบ้านเช่าเรียบร้อยแล้วค่ะ สมาชิกทั่วไปจะไม่เห็นห้องนี้"
          : "> 👁️ เปิดมองเห็นบ้านเช่าเรียบร้อยแล้วค่ะ สมาชิกทั่วไปสามารถเห็นห้องนี้ได้",
        willHide ? "👀" : "👁️"
      )
    );
  } catch (err) {
    return await sendInteractionResponse(
      interaction,
      createV2CardResponse("เกิดข้อผิดพลาด", `> ❌ เกิดข้อผิดพลาดในการซ่อนห้อง: ${err.message}`, "⚠️")
    );
  }
}

async function handleRentPermissionsList(interaction) {
  const channel = interaction.channel;
  if (!channel) return false;

  const supabase = getSupabase();
  let setting = null;
  if (supabase) {
    const { data } = await supabase
      .from("rent_house_settings")
      .select("*")
      .eq("channel_id", channel.id)
      .maybeSingle();
    setting = data;
  }

  const trustedIds = setting?.trusted_user_ids || [];
  const trustedList = trustedIds.length > 0 ? trustedIds.map((id) => `<@${id}> (\`${id}\`)`).join("\n> ") : "*ไม่มี*";

  const contentLines = [
    `> (🏠)︰**ชื่อห้อง:** <#${channel.id}>`,
    `> (🔒)︰**สถานะล็อค:** ${setting?.locked ? "🔒 ล็อคอยู่" : "🔓 เปิดปกติ"}`,
    `> (👀)︰**สถานะซ่อน:** ${setting?.hidden ? "👀 ซ่อนอยู่" : "👁️ มองเห็นปกติ"}`,
    ``,
    `### ➕ สมาชิกที่ได้รับอนุญาตพิเศษ (Trust):`,
    `> ${trustedList}`,
  ];

  return await sendInteractionResponse(
    interaction,
    createV2CardResponse("รายการสิทธิ์สมาชิกในบ้านเช่า", contentLines.join("\n"), "📋")
  );
}

async function handleRentUserSelect(interaction) {
  const channel = interaction.channel;
  const targetUserIds = interaction.values;
  if (!targetUserIds || targetUserIds.length === 0) return false;

  const supabase = getSupabase();
  let currentSetting = null;
  if (supabase) {
    const { data } = await supabase
      .from("rent_house_settings")
      .select("*")
      .eq("channel_id", channel.id)
      .maybeSingle();
    currentSetting = data;
  }

  let trustedSet = new Set(currentSetting?.trusted_user_ids || []);
  const kickedNames = [];
  const processedNames = [];

  for (const userId of targetUserIds) {
    const userMention = `<@${userId}>`;
    processedNames.push(userMention);

    if (interaction.customId === RENT_CUSTOM_IDS.selectTrust) {
      trustedSet.add(userId);
    } else if (interaction.customId === RENT_CUSTOM_IDS.selectUntrust) {
      trustedSet.delete(userId);
    } else if (interaction.customId === RENT_CUSTOM_IDS.selectKick) {
      trustedSet.delete(userId);
      const member = interaction.guild.members.cache.get(userId);
      if (member && member.voice.channelId === channel.id) {
        await member.voice.disconnect("Kicked by rent house owner").catch(() => {});
        kickedNames.push(userMention);
      }
    }
  }

  const updatedSetting = {
    channel_id: channel.id,
    owner_id: currentSetting?.owner_id || interaction.user.id,
    locked: currentSetting?.locked || false,
    hidden: currentSetting?.hidden || false,
    trusted_user_ids: Array.from(trustedSet),
    updated_at: new Date().toISOString(),
  };

  if (supabase) {
    await supabase.from("rent_house_settings").upsert(updatedSetting);
  }

  await syncRentHousePermissions(channel, updatedSetting);

  const formattedNames = processedNames.join(", ");

  if (interaction.customId === RENT_CUSTOM_IDS.selectTrust) {
    return await sendInteractionResponse(interaction, createV2CardResponse("การจัดการสิทธิ์สำเร็จ", `> ➕ เพิ่มสิทธิ์อนุญาตให้ ${formattedNames} เรียบร้อยแล้วค่ะ`, "➕"));
  }
  if (interaction.customId === RENT_CUSTOM_IDS.selectUntrust) {
    return await sendInteractionResponse(interaction, createV2CardResponse("การจัดการสิทธิ์สำเร็จ", `> ➖ ลบสิทธิ์พิเศษของ ${formattedNames} เรียบร้อยแล้วค่ะ`, "➖"));
  }
  if (interaction.customId === RENT_CUSTOM_IDS.selectKick) {
    const msg = kickedNames.length > 0
      ? `> 📤 เตะและถอดสิทธิ์ชั่วคราวของ ${formattedNames} ออกจากบ้านเช่าเรียบร้อยแล้วค่ะ`
      : `> 📤 ถอดสิทธิ์ชั่วคราวของ ${formattedNames} เรียบร้อยแล้วค่ะ`;
    return await sendInteractionResponse(interaction, createV2CardResponse("เตะสมาชิกสำเร็จ", msg, "📤"));
  }
  return false;
}

async function handleRentModalSubmit(interaction) {
  const channel = interaction.channel;

  // 1. เปลี่ยนชื่อบ้านเช่า
  if (interaction.customId === RENT_CUSTOM_IDS.modalName) {
    const newName = interaction.fields.getTextInputValue("room_name").trim();
    if (newName) {
      await safeSetChannelName(channel, newName);
      return await sendInteractionResponse(interaction, createV2CardResponse("เปลี่ยนชื่อห้องสำเร็จ", `> ✏️ เปลี่ยนชื่อบ้านเช่าเป็น **${newName}** เรียบร้อยแล้วค่ะ`, "✏️"));
    }
  }

  // 2. เปลี่ยนจำนวนคน
  if (interaction.customId === RENT_CUSTOM_IDS.modalLimit) {
    const rawLimit = interaction.fields.getTextInputValue("user_limit").trim();
    const limit = parseInt(rawLimit, 10);
    if (!isNaN(limit) && limit >= 0 && limit <= 99) {
      await channel.setUserLimit(limit);
      return await sendInteractionResponse(interaction, createV2CardResponse("เปลี่ยนจำนวนคนสำเร็จ", `> 👥 เปลี่ยนจำนวนคนที่เข้าบ้านเช่าเป็น **${limit || "ไม่จำกัด"}** เรียบร้อยแล้วค่ะ`, "👥"));
    }
    return await sendInteractionResponse(interaction, createV2CardResponse("ข้อมูลไม่ถูกต้อง", "> ❌ กรุณาระบุตัวเลขจำนวนคนระหว่าง 0 ถึง 99 ค่ะ", "⚠️"));
  }

  return false;
}

async function isRentHouseOwner(channel, userId) {
  if (!channel || channel.parentId !== RENT_HOUSE_CATEGORY_ID) return false;

  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data: setting } = await supabase
        .from("rent_house_settings")
        .select("owner_id")
        .eq("channel_id", channel.id)
        .maybeSingle();

      if (setting) {
        return setting.owner_id === userId;
      }

      const { data: contracts } = await supabase
        .from("contracts")
        .select("member_id")
        .eq("type", "house")
        .ilike("room_link", `%${channel.id}%`)
        .limit(1);

      if (contracts && contracts.length > 0) {
        return contracts[0].member_id === userId;
      }
    } catch (e) {
      console.error("[rentHousePanel] Error checking rent house owner:", e.message);
    }
  }

  const ow = channel.permissionOverwrites.cache.get(userId);
  if (ow && (ow.allow.has(PermissionFlagsBits.MuteMembers) || ow.allow.has(PermissionFlagsBits.MoveMembers))) return true;

  return false;
}

async function handleRentHousePanelMessage(message) {
  if (!message || !message.guild || message.author.bot) return false;
  const channel = message.channel;
  const content = (message.content || "").toLowerCase().trim();

  if (!channel || channel.parentId !== RENT_HOUSE_CATEGORY_ID) return false;

  const botUser = message.client.user;
  const isMentioned = botUser && message.mentions.has(botUser);
  const isKeyword = content.includes("แผงควบคุม") || content.includes("เรียกแผง") || content === "!panel" || content === "/panel";

  if (!isMentioned && !isKeyword) return false;

  const isOwner = await isRentHouseOwner(channel, message.author.id);
  if (!isOwner) {
    await message.reply(createV2CardResponse("การเข้าถึงถูกปฏิเสธ", "> ❌ ขออภัยค่ะ เฉพาะเจ้าของบ้านเช่าหลังนี้เท่านั้นที่สามารถเรียกแผงควบคุมได้ค่ะ", "🔒")).catch(() => {});
    return true;
  }

  try {
    await sendRentHousePanel(channel, message.member || message.author);
    if (message.deletable) {
      await message.delete().catch(() => {});
    }
    return true;
  } catch (err) {
    console.error(`[rentHousePanel] Error handling message panel trigger:`, err.message);
    return false;
  }
}

module.exports = {
  sendRentHousePanel,
  handleRentHousePanelInteraction,
  handleRentHousePanelMessage,
  isRentHouseOwner,
  RENT_HOUSE_CATEGORY_ID,
};
