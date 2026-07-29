// handlers/rentHousePanel.js
// ระบบแผงตั้งค่าและจัดการสิทธิ์สำหรับห้อง "บ้านเช่าหมี" (Rent House Room Panel)
// รองรับระบบรหัสผ่านดิจิทัล (Digital Password Lock) & ลำดับสิทธิ์ความปลอดภัย

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
  OverwriteType,
} = require("discord.js");
const { createClient } = require("@supabase/supabase-js");
const {
  EPHEMERAL_FLAG,
  safeShowModal,
  safeMoveMember,
} = require("../utils/discordSafety");

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
  info: "rh_info",
  setPassword: "rh_set_password",
  enterPassword: "rh_enter_password",
  name: "rh_name",
  limit: "rh_limit",
  lock: "rh_lock",
  hide: "rh_hide",
  trust: "rh_trust",
  untrust: "rh_untrust",
  block: "rh_block",
  unblock: "rh_unblock",
  kick: "rh_kick",
  permissionsList: "rh_permissions_list",
  selectTrust: "rh_select_trust",
  selectUntrust: "rh_select_untrust",
  selectBlock: "rh_select_block",
  selectUnblock: "rh_select_unblock",
  selectKick: "rh_select_kick",
  modalSetPassword: "rh_modal_set_password",
  modalEnterPassword: "rh_modal_enter_password",
  modalName: "rh_modal_name",
  modalLimit: "rh_modal_limit",
};

const RENT_PANEL_IDS = new Set(Object.values(RENT_CUSTOM_IDS));

function createRentHousePanelPayload(ownerMember) {
  return {
    flags: 32768,
    components: [
      {
        type: 17,
        components: [
          {
            type: 12,
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
            type: 10,
            content: `## 🏠︲ยินดีต้อนรับสู่บ้านเช่าหมีค่ะ ${ownerMember}\nคุณสามารถปรับแต่ง ตั้งรหัสผ่านบ้าน และจัดการสิทธิ์ผ่านแผงควบคุมด้านล่างนี้ได้เลยนะคะ`,
          },
          { type: 14, spacing: 1, divider: false },
          {
            type: 1,
            components: [
              button(ButtonStyle.Primary, RENT_CUSTOM_IDS.info, "ดูข้อมูลสัญญาเช่า", "📜"),
              button(ButtonStyle.Success, RENT_CUSTOM_IDS.enterPassword, "กรอกรหัสผ่านเข้าบ้าน", "🔑"),
            ],
          },
          {
            type: 1,
            components: [
              button(ButtonStyle.Secondary, RENT_CUSTOM_IDS.setPassword, "ตั้ง/เปลี่ยนรหัสผ่าน", "🔐"),
              button(ButtonStyle.Secondary, RENT_CUSTOM_IDS.name, "เปลี่ยนชื่อห้อง", "✏️"),
              button(ButtonStyle.Secondary, RENT_CUSTOM_IDS.limit, "เปลี่ยนจำนวนคน", "👥"),
              button(ButtonStyle.Secondary, RENT_CUSTOM_IDS.lock, "ล็อค/ปลดล็อค", "🔓"),
              button(ButtonStyle.Secondary, RENT_CUSTOM_IDS.hide, "ซ่อน/เปิดมองเห็น", "👀"),
            ],
          },
          {
            type: 1,
            components: [
              button(ButtonStyle.Secondary, RENT_CUSTOM_IDS.trust, "อนุญาตสมาชิก", "➕"),
              button(ButtonStyle.Secondary, RENT_CUSTOM_IDS.untrust, "ยกเลิกอนุญาต", "➖"),
              button(ButtonStyle.Secondary, RENT_CUSTOM_IDS.block, "ซ่อนสมาชิก (BL)", "🙈"),
              button(ButtonStyle.Secondary, RENT_CUSTOM_IDS.unblock, "เลิกซ่อนสมาชิก", "👁️"),
              button(ButtonStyle.Secondary, RENT_CUSTOM_IDS.kick, "เตะสมาชิกออกจากห้อง", "📤"),
            ],
          },
          {
            type: 1,
            components: [
              button(ButtonStyle.Primary, RENT_CUSTOM_IDS.permissionsList, "ตรวจสอบสิทธิ์สมาชิก", "📋"),
            ],
          },
          { type: 14, spacing: 2 },
        ],
      },
    ],
  };
}

function button(style, customId, label, emoji) {
  return {
    style,
    type: ComponentType.Button,
    custom_id: customId,
    label,
    emoji: emoji ? { name: emoji } : undefined,
  };
}

async function sendRentHousePanel(channel, ownerMember) {
  const payload = createRentHousePanelPayload(ownerMember);
  try {
    await channel.send(payload);
  } catch (err) {
    console.error("[rentHousePanel] Error sending panel:", err.message);
  }
}

async function handleRentHousePanelInteraction(interaction) {
  if (!interaction.guild) return false;

  const customId = interaction.customId;
  const isRentPanelAction =
    RENT_PANEL_IDS.has(customId) ||
    customId.startsWith("rh_select_") ||
    customId.startsWith("rh_modal_");

  if (!isRentPanelAction) return false;

  // 1. ปุ่มดูข้อมูลสัญญาเช่า
  if (customId === RENT_CUSTOM_IDS.info) {
    return await handleShowContractInfo(interaction);
  }

  // 2. ระบบรหัสผ่าน (ตั้งรหัส / กรอกรหัส)
  if (customId === RENT_CUSTOM_IDS.setPassword) {
    return await showSetPasswordModal(interaction);
  }
  if (customId === RENT_CUSTOM_IDS.enterPassword) {
    return await showEnterPasswordModal(interaction);
  }

  // 3. ปุ่มอื่นๆ (เปลี่ยนชื่อ / ล็อค / สิทธิ์)
  if (customId === RENT_CUSTOM_IDS.name) {
    return await showRentNameModal(interaction);
  }
  if (customId === RENT_CUSTOM_IDS.limit) {
    return await showRentLimitModal(interaction);
  }
  if (customId === RENT_CUSTOM_IDS.lock) {
    return await handleRentLockToggle(interaction);
  }
  if (customId === RENT_CUSTOM_IDS.hide) {
    return await handleRentHideToggle(interaction);
  }
  if (customId === RENT_CUSTOM_IDS.trust) {
    return await showUserSelectMenu(interaction, RENT_CUSTOM_IDS.selectTrust, "เลือกสมาชิกที่ต้องการให้อนุญาตเข้าห้อง");
  }
  if (customId === RENT_CUSTOM_IDS.untrust) {
    return await showUserSelectMenu(interaction, RENT_CUSTOM_IDS.selectUntrust, "เลือกสมาชิกที่ต้องการยกเลิกการอนุญาต");
  }
  if (customId === RENT_CUSTOM_IDS.block) {
    return await showUserSelectMenu(interaction, RENT_CUSTOM_IDS.selectBlock, "เลือกสมาชิกที่ต้องการซ่อนห้อง/บล็อก (Blacklist)");
  }
  if (customId === RENT_CUSTOM_IDS.unblock) {
    return await showUserSelectMenu(interaction, RENT_CUSTOM_IDS.selectUnblock, "เลือกสมาชิกที่ต้องการยกเลิกซ่อนห้อง");
  }
  if (customId === RENT_CUSTOM_IDS.kick) {
    return await showUserSelectMenu(interaction, RENT_CUSTOM_IDS.selectKick, "เลือกสมาชิกที่ต้องการเตะออกจากห้อง");
  }
  if (customId === RENT_CUSTOM_IDS.permissionsList) {
    return await handleRentPermissionsList(interaction);
  }

  // Modals & Select Menus
  if (interaction.isUserSelectMenu() && customId.startsWith("rh_select_")) {
    return await handleRentUserSelect(interaction);
  }
  if (interaction.isModalSubmit() && customId.startsWith("rh_modal_")) {
    return await handleRentModalSubmit(interaction);
  }

  return false;
}

/**
 * ดึงข้อมูลสัญญาจากตาราง contracts ใน Supabase
 */
async function handleShowContractInfo(interaction) {
  const supabase = getSupabase();
  if (!supabase) {
    return await interaction.reply({
      content: "❌ ไม่สามารถเชื่อมต่อกับฐานข้อมูล Supabase ได้ในขณะนี้",
      flags: EPHEMERAL_FLAG,
    });
  }

  const channelId = interaction.channelId;
  const userId = interaction.user.id;

  try {
    const { data: contracts, error } = await supabase
      .from("contracts")
      .select("*")
      .eq("type", "house")
      .or(`room_link.ilike.%${channelId}%,member_id.eq.${userId}`)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw error;

    if (!contracts || contracts.length === 0) {
      return await interaction.reply({
        content: "ℹ️ ไม่พบข้อมูลสัญญาเช่าบ้านสำหรับห้องนี้ในระบบตาราง `contracts` ค่ะ",
        flags: EPHEMERAL_FLAG,
      });
    }

    const contract = contracts[0];
    const startUnix = contract.start_at ? Math.floor(new Date(contract.start_at).getTime() / 1000) : null;
    const endUnix = contract.end_at ? Math.floor(new Date(contract.end_at).getTime() / 1000) : null;
    const createdUnix = contract.created_at ? Math.floor(new Date(contract.created_at).getTime() / 1000) : null;

    const infoLines = [
      `## 📜︲ข้อมูลสัญญาเช่าบ้าน (Contract Info)`,
      `> (👤)︰**ผู้เช่า:** <@${contract.member_id}> (\`${contract.member_id}\`)`,
      `> (📅)︰**วันเริ่มสัญญา:** ${startUnix ? `<t:${startUnix}:F>` : "ไม่ได้ระบุ"}`,
      `> (⏳)︰**วันหมดสัญญา:** ${endUnix ? `<t:${endUnix}:F> (<t:${endUnix}:R>)` : "ไม่มีกำหนดวันหมดอายุ"}`,
      `> (🔗)︰**ลิงก์ห้อง:** ${contract.room_link ? `${contract.room_link}` : "ไม่ได้ระบุ"}`,
      `> (🛠️)︰**ผู้ทำรายการ:** ${contract.operator_name || "ระบบอัตโนมัติ"}`,
      `> (📝)︰**วันที่สร้างสัญญา:** ${createdUnix ? `<t:${createdUnix}:F>` : "ไม่ได้ระบุ"}`,
    ];

    return await interaction.reply({
      content: infoLines.join("\n"),
      flags: EPHEMERAL_FLAG,
    });
  } catch (err) {
    console.error("[rentHousePanel] Error fetching contract info:", err.message);
    return await interaction.reply({
      content: `❌ เกิดข้อผิดพลาดในการดึงข้อมูลสัญญา: ${err.message}`,
      flags: EPHEMERAL_FLAG,
    });
  }
}

async function showSetPasswordModal(interaction) {
  if (interaction.replied || interaction.deferred) return false;
  const modal = new ModalBuilder()
    .setCustomId(RENT_CUSTOM_IDS.modalSetPassword)
    .setTitle("ตั้งค่า / เปลี่ยนรหัสผ่านบ้าน")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("house_password")
          .setLabel("กำหนดรหัสผ่านบ้าน (4-10 หลัก หรือเว้นว่างเพื่อยกเลิก)")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(10)
          .setRequired(false)
          .setPlaceholder("เช่น 1234 หรือ passcode")
      )
    );
  await safeShowModal(interaction, modal);
  return true;
}

async function showEnterPasswordModal(interaction) {
  if (interaction.replied || interaction.deferred) return false;
  const modal = new ModalBuilder()
    .setCustomId(RENT_CUSTOM_IDS.modalEnterPassword)
    .setTitle("กรอกรหัสผ่านเข้าบ้าน")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("entered_password")
          .setLabel("กรุณากรอกรหัสผ่านบ้าน")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(10)
          .setRequired(true)
          .setPlaceholder("กรอกรหัสผ่านที่ได้รับจากเจ้าของบ้าน")
      )
    );
  await safeShowModal(interaction, modal);
  return true;
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
  const modal = new ModalBuilder()
    .setCustomId(RENT_CUSTOM_IDS.modalLimit)
    .setTitle("เปลี่ยนจำนวนคนที่เข้าได้")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("user_limit")
          .setLabel("จำนวนคน (0 = ไม่จำกัด, สูงสุด 99)")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(2)
          .setRequired(true)
          .setValue(String(interaction.channel?.userLimit ?? 0))
      )
    );
  await safeShowModal(interaction, modal);
  return true;
}

async function showUserSelectMenu(interaction, customId, placeholder) {
  if (interaction.replied || interaction.deferred) return false;
  const select = new UserSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setMinValues(1)
    .setMaxValues(1);
  await interaction.reply({
    components: [new ActionRowBuilder().addComponents(select)],
    flags: EPHEMERAL_FLAG,
  });
  return true;
}

async function handleRentLockToggle(interaction) {
  const channel = interaction.channel;
  if (!channel) return false;

  const @everyone = interaction.guild.roles.everyone;
  const currentConnect = channel.permissionsFor(@everyone)?.has(PermissionFlagsBits.Connect);
  const willLock = currentConnect !== false;

  try {
    await channel.permissionOverwrites.edit(@everyone, { Connect: willLock ? false : null });
    return await interaction.reply({
      content: willLock ? "🔒 ล็อคบ้านเช่าเรียบร้อยแล้วค่ะ สมาชิกทั่วไปจะไม่สามารถเข้าได้" : "🔓 ปลดล็อคบ้านเช่าเรียบร้อยแล้วค่ะ สมาชิกทั่วไปสามารถเข้าได้",
      flags: EPHEMERAL_FLAG,
    });
  } catch (err) {
    return await interaction.reply({
      content: `❌ เกิดข้อผิดพลาดในการเปลี่ยนสิทธิ์ล็อค: ${err.message}`,
      flags: EPHEMERAL_FLAG,
    });
  }
}

async function handleRentHideToggle(interaction) {
  const channel = interaction.channel;
  if (!channel) return false;

  const @everyone = interaction.guild.roles.everyone;
  const currentView = channel.permissionsFor(@everyone)?.has(PermissionFlagsBits.ViewChannel);
  const willHide = currentView !== false;

  try {
    await channel.permissionOverwrites.edit(@everyone, { ViewChannel: willHide ? false : null });
    return await interaction.reply({
      content: willHide ? "👀 ซ่อนบ้านเช่าเรียบร้อยแล้วค่ะ สมาชิกทั่วไปจะไม่เห็นห้องนี้" : "👁️ เปิดมองเห็นบ้านเช่าเรียบร้อยแล้วค่ะ สมาชิกทั่วไปสามารถเห็นห้องนี้ได้",
      flags: EPHEMERAL_FLAG,
    });
  } catch (err) {
    return await interaction.reply({
      content: `❌ เกิดข้อผิดพลาดในการซ่อนห้อง: ${err.message}`,
      flags: EPHEMERAL_FLAG,
    });
  }
}

async function handleRentPermissionsList(interaction) {
  const channel = interaction.channel;
  if (!channel) return false;

  const overwrites = channel.permissionOverwrites.cache.filter((ow) => ow.type === OverwriteType.Member);
  if (overwrites.size === 0) {
    return await interaction.reply({
      content: "📋 ไม่มีสิทธิ์เฉพาะของสมาชิกในบ้านเช่าหลังนี้ค่ะ",
      flags: EPHEMERAL_FLAG,
    });
  }

  const lines = [];
  overwrites.forEach((ow) => {
    const member = interaction.guild.members.cache.get(ow.id);
    const name = member ? `${member.user.tag}` : `<@${ow.id}>`;
    const allows = [];
    if (ow.allow.has(PermissionFlagsBits.Connect)) allows.push("เข้าห้องได้");
    if (ow.allow.has(PermissionFlagsBits.ViewChannel)) allows.push("เห็นห้อง");
    const denies = [];
    if (ow.deny.has(PermissionFlagsBits.Connect)) denies.push("ห้ามเข้า");
    if (ow.deny.has(PermissionFlagsBits.ViewChannel)) denies.push("ห้ามเห็นห้อง (BL)");

    lines.push(`• **${name}**: ${allows.concat(denies).join(", ") || "กำหนดสิทธิ์แล้ว"}`);
  });

  return await interaction.reply({
    content: `## 📋 รายชื่อสมาชิกที่มีสิทธิ์เฉพาะในบ้านเช่า:\n${lines.join("\n")}`,
    flags: EPHEMERAL_FLAG,
  });
}

async function handleRentUserSelect(interaction) {
  const channel = interaction.channel;
  const targetId = interaction.values[0];
  const targetMember = interaction.guild.members.cache.get(targetId);
  const targetName = targetMember ? targetMember.user.tag : `<@${targetId}>`;

  if (interaction.customId === RENT_CUSTOM_IDS.selectTrust) {
    await channel.permissionOverwrites.edit(targetId, { Connect: true, ViewChannel: true });
    return await interaction.update({ content: `➕ อนุญาตสิทธิ์ถาวรให้ **${targetName}** เข้าบ้านเช่าได้เรียบร้อยแล้วค่ะ`, components: [] });
  }
  if (interaction.customId === RENT_CUSTOM_IDS.selectUntrust) {
    await channel.permissionOverwrites.delete(targetId);
    return await interaction.update({ content: `➖ ลบสิทธิ์พิเศษของ **${targetName}** เรียบร้อยแล้วค่ะ`, components: [] });
  }
  if (interaction.customId === RENT_CUSTOM_IDS.selectBlock) {
    await channel.permissionOverwrites.edit(targetId, { Connect: false, ViewChannel: false });
    return await interaction.update({ content: `🙈 ซ่อนบ้านเช่าและจัดใส่ **Blacklist (BL)** ให้ **${targetName}** เรียบร้อยแล้วค่ะ (แม้รู้รหัสผ่านก็ไม่สามารถเข้าได้)`, components: [] });
  }
  if (interaction.customId === RENT_CUSTOM_IDS.selectUnblock) {
    await channel.permissionOverwrites.delete(targetId);
    return await interaction.update({ content: `👁️ ยกเลิก Blacklist ให้ **${targetName}** เรียบร้อยแล้วค่ะ`, components: [] });
  }
  if (interaction.customId === RENT_CUSTOM_IDS.selectKick) {
    await channel.permissionOverwrites.delete(targetId);
    if (targetMember && targetMember.voice.channelId === channel.id) {
      await targetMember.voice.disconnect("Kicked from rent house");
      return await interaction.update({ content: `📤 เตะและถอดสิทธิ์ชั่วคราวของ **${targetName}** ออกจากบ้านเช่าเรียบร้อยแล้วค่ะ`, components: [] });
    }
    return await interaction.update({ content: `📤 ถอดสิทธิ์ชั่วคราวของ **${targetName}** เรียบร้อยแล้วค่ะ`, components: [] });
  }
  return false;
}

async function handleRentModalSubmit(interaction) {
  const channel = interaction.channel;
  const supabase = getSupabase();

  // 1. ตั้ง/เปลี่ยนรหัสผ่านบ้าน
  if (interaction.customId === RENT_CUSTOM_IDS.modalSetPassword) {
    const rawPass = interaction.fields.getTextInputValue("house_password").trim();
    if (supabase) {
      await supabase.from("rent_house_settings").upsert({
        channel_id: channel.id,
        owner_id: interaction.user.id,
        password: rawPass || null,
        updated_at: new Date().toISOString(),
      });
    }

    if (!rawPass) {
      return await interaction.reply({
        content: "🔓 ยกเลิกรหัสผ่านบ้านเช่าเรียบร้อยแล้วค่ะ สมาชิกทั่วไปสามารถเข้าได้ตามปกติ",
        flags: EPHEMERAL_FLAG,
      });
    }

    // ล็อคห้องอัตโนมัติเมื่อตั้งรหัสผ่าน
    const @everyone = interaction.guild.roles.everyone;
    await channel.permissionOverwrites.edit(@everyone, { Connect: false });

    return await interaction.reply({
      content: `🔑 ตั้งรหัสผ่านบ้านเช่าเรียบร้อยแล้วค่ะ!\n- **รหัสผ่านของคุณ:** \`${rawPass}\`\n*(สมาชิกสามารถกดปุ่ม "กรอกรหัสผ่านเข้าบ้าน" เพื่อพิมพ์รหัสผ่านนี้ในการเข้าห้องได้เลยค่ะ)*`,
      flags: EPHEMERAL_FLAG,
    });
  }

  // 2. กรอกรหัสผ่านเข้าบ้าน
  if (interaction.customId === RENT_CUSTOM_IDS.modalEnterPassword) {
    const enteredPass = interaction.fields.getTextInputValue("entered_password").trim();
    const userId = interaction.user.id;

    // 🔴 1. ตรวจสอบ Blacklist ก่อนเป็นอันดับแรก (Hierarchy Check)
    const permissions = channel.permissionsFor(userId);
    if (permissions && (!permissions.has(PermissionFlagsBits.Connect) || !permissions.has(PermissionFlagsBits.ViewChannel))) {
      const ow = channel.permissionOverwrites.cache.get(userId);
      if (ow && ow.deny.has(PermissionFlagsBits.Connect)) {
        return await interaction.reply({
          content: "❌ คุณติดรายการ **Blacklist (BL)** ของบ้านหลังนี้ ไม่สามารถใช้รหัสผ่านเพื่อเข้าห้องได้ค่ะ",
          flags: EPHEMERAL_FLAG,
        });
      }
    }

    // ดึงรหัสผ่านจาก Supabase
    let savedPass = null;
    if (supabase) {
      const { data } = await supabase
        .from("rent_house_settings")
        .select("password")
        .eq("channel_id", channel.id)
        .single();
      if (data) savedPass = data.password;
    }

    if (!savedPass) {
      return await interaction.reply({
        content: "ℹ️ บ้านเช่าหลังนี้ยังไม่ได้เปิดใช้งานรหัสผ่านค่ะ",
        flags: EPHEMERAL_FLAG,
      });
    }

    if (enteredPass !== savedPass) {
      return await interaction.reply({
        content: "❌ รหัสผ่านไม่ถูกต้อง กรุณาขอรหัสผ่านที่ถูกต้องจากเจ้าของบ้านนะคะ",
        flags: EPHEMERAL_FLAG,
      });
    }

    // 🟢 รหัสผ่านถูกต้อง -> ให้สิทธิ์เข้าห้อง + Move สมาชิกเข้าห้องหากอยู่ใน voice
    await channel.permissionOverwrites.edit(userId, { Connect: true, ViewChannel: true });

    const member = interaction.guild.members.cache.get(userId);
    let movedMessage = "";
    if (member && member.voice.channelId) {
      const moved = await safeMoveMember(member, channel, "Password authenticated");
      if (moved) movedMessage = " และดึงคุณเข้าห้องเสียงเรียบร้อยแล้วค่ะ";
    }

    return await interaction.reply({
      content: `🎉 **รหัสผ่านถูกต้อง!** ยินดีต้อนรับเข้าสู่บ้านเช่าหมีค่ะ 🚪✨${movedMessage}`,
      flags: EPHEMERAL_FLAG,
    });
  }

  // 3. เปลี่ยนชื่อห้อง
  if (interaction.customId === RENT_CUSTOM_IDS.modalName) {
    const newName = interaction.fields.getTextInputValue("room_name").trim();
    if (newName) {
      await channel.setName(newName);
      return await interaction.reply({ content: `✏️ เปลี่ยนชื่อบ้านเช่าเป็น **${newName}** เรียบร้อยแล้วค่ะ`, flags: EPHEMERAL_FLAG });
    }
  }

  // 4. เปลี่ยนจำนวนคน
  if (interaction.customId === RENT_CUSTOM_IDS.modalLimit) {
    const rawLimit = interaction.fields.getTextInputValue("user_limit").trim();
    const limit = parseInt(rawLimit, 10);
    if (!isNaN(limit) && limit >= 0 && limit <= 99) {
      await channel.setUserLimit(limit);
      return await interaction.reply({ content: `👥 เปลี่ยนจำนวนคนที่เข้าบ้านเช่าเป็น **${limit || "ไม่จำกัด"}** เรียบร้อยแล้วค่ะ`, flags: EPHEMERAL_FLAG });
    }
    return await interaction.reply({ content: "❌ กรุณาระบุตัวเลขจำนวนคนระหว่าง 0 ถึง 99 ค่ะ", flags: EPHEMERAL_FLAG });
  }

  return false;
}

module.exports = {
  sendRentHousePanel,
  handleRentHousePanelInteraction,
};
