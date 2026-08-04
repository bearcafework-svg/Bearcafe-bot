// src/commands/checkRole.js
// ระบบตรวจสอบและจัดการบทบาท (Check Role System)
// ใช้ Discord Component V2 อนุญาตเฉพาะ Owner และบทบาท 1144696486815342673

const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  Events,
  MessageFlags
} = require("discord.js");

// Discord Message Flags
const FLAG_V2 = MessageFlags?.IsComponentsV2 || 32768;
const FLAG_EPHEMERAL = MessageFlags?.Ephemeral || 64;
const FLAG_V2_EPH = FLAG_V2 | FLAG_EPHEMERAL;

// ID ของบทบาทที่อนุญาตให้ใช้งานคำสั่งนี้นอกเหนือจาก Owner
const ALLOWED_ROLE_ID = "1144696486815342673";

// Emojis ธีม Bear Cafe Bot
const EMOJIS = {
  bee: "<:bee20000:1256669436350562355>",
  line: "<:line:1144701793989840997>",
  exclamation: "<a:3602exclamationmarkbubble:1372837492205555812>",
  backpack: "<:bagpack_icon:1522154708200849449>",
  pass: "<:50121checkmark:1358584609087946867>",
  fail: "<:68440x:1358584606911369226>",
  plant: "<:cuteplant:1152834055528783872>"
};

/**
 * ตรวจสอบสิทธิ์ว่าผู้ใช้เป็น Owner ของเซิร์ฟเวอร์ หรือมียศ 1144696486815342673 หรือไม่
 * @param {Interaction} interaction
 * @returns {boolean}
 */
function isAuthorized(interaction) {
  if (!interaction.guild || !interaction.member) return false;
  // เป็น Owner ของเซิร์ฟเวอร์
  if (interaction.guild.ownerId === interaction.user.id) return true;
  // มียศตามที่กำหนด
  return interaction.member.roles.cache.has(ALLOWED_ROLE_ID);
}

/**
 * สร้าง Component V2 Payload แสดงรายละเอียดบทบาทตามโครงสร้างใหม่
 * @param {Role} role 
 * @returns {object}
 */
function buildRolePayload(role) {
  const iconUrl = role.iconURL({ extension: "png", size: 512 });

  // รายชื่อสมาชิกที่ใส่อยศนี้
  let membersListText = "";
  const membersArray = Array.from(role.members.values());

  if (membersArray.length === 0) {
    membersListText = "-# ไม่มีสมาชิกในบทบาทนี้";
  } else {
    const maxDisplay = 15;
    const displayedMembers = membersArray.slice(0, maxDisplay);
    membersListText = displayedMembers.map((m, index) => `${index + 1}. <@${m.id}>`).join("\n");

    if (membersArray.length > maxDisplay) {
      membersListText += `\n-# ...และอีก ${membersArray.length - maxDisplay} คน`;
    }
  }

  const textContent =
    `## ${EMOJIS.bee}︲ข้อมูลบทบาท: <@&${role.id}>\n` +
    `${EMOJIS.line}\n` +
    `> (${EMOJIS.exclamation})⠀ไอดีบทบาท: \`${role.id}\` \n` +
    `> (${EMOJIS.backpack})⠀จำนวนคน: **${role.members.size} คน**\n\n` +
    `${membersListText}\n`;

  const sectionComponent = {
    type: 9,
    components: [
      {
        type: 10,
        content: textContent
      }
    ]
  };

  // แนบ accessory แสดงรูปภาพยศหากมี
  if (iconUrl) {
    sectionComponent.accessory = {
      type: 11,
      media: {
        url: iconUrl
      }
    };
  }

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          sectionComponent,
          {
            type: 14,
            spacing: 2
          },
          {
            type: 1,
            components: [
              {
                style: 1, // Primary
                type: 2,
                custom_id: `checkrole_edit_${role.id}`,
                label: "︲แก้ไขบทบาท",
                emoji: { name: "✏️" }
              },
              {
                style: 3, // Success
                type: 2,
                custom_id: `checkrole_add_btn_${role.id}`,
                label: "︲เพิ่มคนใส่อยศ",
                emoji: { name: "➕" }
              },
              {
                style: 4, // Danger
                type: 2,
                custom_id: `checkrole_remove_btn_${role.id}`,
                label: "︲ลบคนใส่อยศ",
                emoji: { name: "➖" }
              },
              {
                style: 2, // Secondary
                type: 2,
                custom_id: `checkrole_refresh_${role.id}`,
                label: "︲รีเฟรช",
                emoji: { name: "🔄" }
              }
            ]
          }
        ]
      }
    ]
  };
}

/**
 * สร้าง Component V2 Payload สำหรับ User Select Menu เพิ่มสมาชิกเข้าบทบาท
 * @param {Role} role 
 * @returns {object}
 */
function buildAddUserSelectPayload(role) {
  return {
    flags: FLAG_V2_EPH,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `## ${EMOJIS.bee}︲__\` เพิ่มสมาชิกเข้าบทบาท \`__\n` +
              `กรุณาเลือกสมาชิกที่ต้องการมอบบทบาท <@&${role.id}> (${EMOJIS.plant} เลือกได้สูงสุด 10 คน)`
          },
          { type: 14, spacing: 2 },
          {
            type: 1,
            components: [
              {
                type: 5, // User Select Menu
                custom_id: `checkrole_add_select_${role.id}`,
                placeholder: "เลือกสมาชิกที่ต้องการเพิ่มบทบาท...",
                min_values: 1,
                max_values: 10
              }
            ]
          }
        ]
      }
    ]
  };
}

/**
 * สร้าง Component V2 Payload สำหรับ User Select Menu ถอดสมาชิกออกจากบทบาท
 * @param {Role} role 
 * @returns {object}
 */
function buildRemoveUserSelectPayload(role) {
  return {
    flags: FLAG_V2_EPH,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `## ${EMOJIS.bee}︲__\` ถอดสมาชิกออกจากบทบาท \`__\n` +
              `กรุณาเลือกสมาชิกที่ต้องการถอดบทบาท <@&${role.id}> ออก (${EMOJIS.plant} เลือกได้สูงสุด 10 คน)`
          },
          { type: 14, spacing: 2 },
          {
            type: 1,
            components: [
              {
                type: 5, // User Select Menu
                custom_id: `checkrole_remove_select_${role.id}`,
                placeholder: "เลือกสมาชิกที่ต้องการถอดบทบาท...",
                min_values: 1,
                max_values: 10
              }
            ]
          }
        ]
      }
    ]
  };
}

/**
 * ตั้งค่าระบบตรวจสอบบทบาท
 * @param {Client} client 
 */
function setupCheckRole(client) {
  // 1. ลงทะเบียน Slash Command เมื่อบอทพร้อม
  client.once("clientReady", async () => {
    try {
      const guildId = process.env.GUILD_ID || "1144251788493602848";
      const guild = client.guilds.cache.get(guildId) || client.guilds.cache.first();

      if (guild) {
        await guild.commands.create({
          name: "เช็กบทบาท",
          description: "ตรวจสอบและจัดการข้อมูลบทบาท (เฉพาะ Owner และทีมงาน)",
          options: [
            {
              name: "role",
              description: "เลือกบทบาทที่ต้องการตรวจสอบ",
              type: 8, // ROLE
              required: true
            }
          ]
        });
        console.log(`[checkRole] Command /เช็กบทบาท registered on guild ${guild.name}.`);
      } else {
        console.warn("[checkRole] No guild found for slash command registration.");
      }
    } catch (err) {
      console.error("[checkRole] Failed to register slash command:", err.message);
    }
  });

  // 2. จัดการ Interactions ทั้งหมดของคำสั่ง /เช็กบทบาท
  client.on(Events.InteractionCreate, async (interaction) => {
    // ── 2.1 จัดการ Slash Command /เช็กบทบาท ────────────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === "เช็กบทบาท") {
      if (!isAuthorized(interaction)) {
        return interaction.reply({
          content: `## ${EMOJIS.fail}︲__\` ไม่มีสิทธิ์ใช้งาน \`__\nขออภัยค่ะ คำสั่งนี้สามารถใช้งานได้เฉพาะ **Owner** หรือสมาชิกที่มีบทบาท <@&${ALLOWED_ROLE_ID}> เท่านั้นนะคะ`,
          flags: FLAG_EPHEMERAL
        });
      }

      const role = interaction.options.getRole("role");
      if (!role) {
        return interaction.reply({
          content: `## ${EMOJIS.fail}︲ไม่พบบทบาทที่เลือกในระบบ`,
          flags: FLAG_EPHEMERAL
        });
      }

      const payload = buildRolePayload(role);
      return interaction.reply(payload);
    }

    // ── 2.2 จัดการปุ่มกด (Buttons) ──────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith("checkrole_")) {
      if (!isAuthorized(interaction)) {
        return interaction.reply({
          content: `## ${EMOJIS.fail}︲__\` ไม่มีสิทธิ์ใช้งาน \`__\nขออภัยค่ะ คำสั่งนี้สามารถใช้งานได้เฉพาะ **Owner** หรือสมาชิกที่มีบทบาท <@&${ALLOWED_ROLE_ID}> เท่านั้นนะคะ`,
          flags: FLAG_EPHEMERAL
        });
      }

      // ปุ่มแก้ไขบทบาท -> แสดง Modal แก้ไขเฉพาะชื่อบทบาท
      if (interaction.customId.startsWith("checkrole_edit_")) {
        const roleId = interaction.customId.replace("checkrole_edit_", "");
        const role = interaction.guild?.roles.cache.get(roleId);

        if (!role) {
          return interaction.reply({
            content: `## ${EMOJIS.fail}︲ไม่พบบทบาทนี้ในเซิร์ฟเวอร์แล้ว`,
            flags: FLAG_EPHEMERAL
          });
        }

        const modal = new ModalBuilder()
          .setCustomId(`checkrole_modal_${role.id}`)
          .setTitle("แก้ไขชื่อบทบาท");

        const nameInput = new TextInputBuilder()
          .setCustomId("role_name")
          .setLabel("ชื่อบทบาทใหม่")
          .setStyle(TextInputStyle.Short)
          .setValue(role.name)
          .setRequired(true);

        modal.addComponents(new ActionRowBuilder().addComponents(nameInput));

        return interaction.showModal(modal);
      }

      // ปุ่มเพิ่มคนใส่อยศ -> แสดง User Select Menu
      if (interaction.customId.startsWith("checkrole_add_btn_")) {
        const roleId = interaction.customId.replace("checkrole_add_btn_", "");
        const role = interaction.guild?.roles.cache.get(roleId);
        if (!role) {
          return interaction.reply({
            content: `## ${EMOJIS.fail}︲ไม่พบบทบาทนี้ในเซิร์ฟเวอร์แล้ว`,
            flags: FLAG_EPHEMERAL
          });
        }
        return interaction.reply(buildAddUserSelectPayload(role));
      }

      // ปุ่มลบคนใส่อยศ -> แสดง User Select Menu
      if (interaction.customId.startsWith("checkrole_remove_btn_")) {
        const roleId = interaction.customId.replace("checkrole_remove_btn_", "");
        const role = interaction.guild?.roles.cache.get(roleId);
        if (!role) {
          return interaction.reply({
            content: `## ${EMOJIS.fail}︲ไม่พบบทบาทนี้ในเซิร์ฟเวอร์แล้ว`,
            flags: FLAG_EPHEMERAL
          });
        }
        return interaction.reply(buildRemoveUserSelectPayload(role));
      }

      // ปุ่มรีเฟรชข้อมูล
      if (interaction.customId.startsWith("checkrole_refresh_")) {
        const roleId = interaction.customId.replace("checkrole_refresh_", "");
        const role = interaction.guild?.roles.cache.get(roleId);
        if (!role) {
          return interaction.reply({
            content: `## ${EMOJIS.fail}︲ไม่พบบทบาทนี้ในเซิร์ฟเวอร์แล้ว`,
            flags: FLAG_EPHEMERAL
          });
        }
        return interaction.update(buildRolePayload(role));
      }
    }

    // ── 2.3 จัดการ Modal Submit ─────────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith("checkrole_modal_")) {
      if (!isAuthorized(interaction)) {
        return interaction.reply({
          content: `## ${EMOJIS.fail}︲__\` ไม่มีสิทธิ์ใช้งาน \`__\nขออภัยค่ะ คุณไม่มีสิทธิ์จัดการบทบาทนี้นะคะ`,
          flags: FLAG_EPHEMERAL
        });
      }

      const roleId = interaction.customId.replace("checkrole_modal_", "");
      const role = interaction.guild?.roles.cache.get(roleId);

      if (!role) {
        return interaction.reply({
          content: `## ${EMOJIS.fail}︲ไม่พบบทบาทนี้ในเซิร์ฟเวอร์แล้ว`,
          flags: FLAG_EPHEMERAL
        });
      }

      const newName = interaction.fields.getTextInputValue("role_name").trim();

      try {
        if (newName) {
          await role.setName(newName);
        }
        // อัปเดตการแสดงผลบนข้อความหลัก
        return interaction.update(buildRolePayload(role));
      } catch (err) {
        console.error("[checkRole] Failed to edit role name:", err.message);
        return interaction.reply({
          content: `## ${EMOJIS.fail}︲__\` ไม่สามารถแก้ไขบทบาทได้ \`__\n${err.message.includes("Privilege") || err.message.includes("Hierarchy") ? "บทบาทนี้อยู่สูงกว่าหรือเท่ากับบทบาทของบอท จึงไม่สามารถแก้ไขได้ค่ะ" : err.message}`,
          flags: FLAG_EPHEMERAL
        });
      }
    }

    // ── 2.4 จัดการ User Select Menus (เพิ่ม/ลบคนใส่อยศ) ───────────────────
    if (interaction.isUserSelectMenu() && interaction.customId.startsWith("checkrole_")) {
      if (!isAuthorized(interaction)) {
        return interaction.reply({
          content: `## ${EMOJIS.fail}︲__\` ไม่มีสิทธิ์ใช้งาน \`__\nขออภัยค่ะ คุณไม่มีสิทธิ์จัดการบทบาทนี้นะคะ`,
          flags: FLAG_EPHEMERAL
        });
      }

      // เพิ่มคนใส่อยศ
      if (interaction.customId.startsWith("checkrole_add_select_")) {
        const roleId = interaction.customId.replace("checkrole_add_select_", "");
        const role = interaction.guild?.roles.cache.get(roleId);

        if (!role) {
          return interaction.reply({
            content: `## ${EMOJIS.fail}︲ไม่พบบทบาทนี้ในเซิร์ฟเวอร์แล้ว`,
            flags: FLAG_EPHEMERAL
          });
        }

        await interaction.deferReply({ flags: FLAG_EPHEMERAL });

        const selectedUserIds = interaction.values;
        let successCount = 0;
        const failedUsers = [];

        for (const userId of selectedUserIds) {
          try {
            const member = await interaction.guild.members.fetch(userId);
            if (member) {
              await member.roles.add(role);
              successCount++;
            }
          } catch (err) {
            console.error(`[checkRole] Error adding role ${roleId} to user ${userId}:`, err.message);
            failedUsers.push(`<@${userId}>`);
          }
        }

        let resultMsg = `## ${EMOJIS.pass}︲__\` เพิ่มบทบาทเรียบร้อย \`__\n` +
          `เพิ่มบทบาท <@&${role.id}> ให้กับสมาชิกเรียบร้อยแล้ว **${successCount}/${selectedUserIds.length}** คน`;

        if (failedUsers.length > 0) {
          resultMsg += `\n-# ไม่สามารถเพิ่มยศให้: ${failedUsers.join(", ")} (ยศบอทต่ำกว่า หรือเกิดข้อผิดพลาด)`;
        }

        return interaction.editReply({ content: resultMsg });
      }

      // ลบคนใส่อยศ
      if (interaction.customId.startsWith("checkrole_remove_select_")) {
        const roleId = interaction.customId.replace("checkrole_remove_select_", "");
        const role = interaction.guild?.roles.cache.get(roleId);

        if (!role) {
          return interaction.reply({
            content: `## ${EMOJIS.fail}︲ไม่พบบทบาทนี้ในเซิร์ฟเวอร์แล้ว`,
            flags: FLAG_EPHEMERAL
          });
        }

        await interaction.deferReply({ flags: FLAG_EPHEMERAL });

        const selectedUserIds = interaction.values;
        let successCount = 0;
        const failedUsers = [];

        for (const userId of selectedUserIds) {
          try {
            const member = await interaction.guild.members.fetch(userId);
            if (member) {
              await member.roles.remove(role);
              successCount++;
            }
          } catch (err) {
            console.error(`[checkRole] Error removing role ${roleId} from user ${userId}:`, err.message);
            failedUsers.push(`<@${userId}>`);
          }
        }

        let resultMsg = `## ${EMOJIS.pass}︲__\` ถอดบทบาทเรียบร้อย \`__\n` +
          `ถอดบทบาท <@&${role.id}> ออกจากสมาชิกเรียบร้อยแล้ว **${successCount}/${selectedUserIds.length}** คน`;

        if (failedUsers.length > 0) {
          resultMsg += `\n-# ไม่สามารถถอดยศให้: ${failedUsers.join(", ")} (ยศบอทต่ำกว่า หรือเกิดข้อผิดพลาด)`;
        }

        return interaction.editReply({ content: resultMsg });
      }
    }
  });

  console.log("[checkRole] ✅ ระบบตรวจสอบและจัดการบทบาท /เช็กบทบาท พร้อมใช้งาน");
}

module.exports = { setupCheckRole };
