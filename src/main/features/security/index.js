// ===================================================
// src/features/security/index.js — จุดเชื่อมต่อฟีเจอร์ความปลอดภัยทั้งหมด
// ===================================================

const {
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
  PermissionFlagsBits,
  ApplicationCommandOptionType,
} = require("discord.js");
const {
  serializeGuildStructure,
  saveBackupToSupabase,
  listBackupsFromSupabase,
  restoreGuildStructure,
} = require("./backupManager");
const { handleChannelDelete, handleRoleDelete } = require("./antiNuke");
const { handleGuildMemberAdd } = require("./antiRaid");
const { handleMessageSecurityCheck } = require("./phishingFilter");
const { auditGuildPermissions } = require("./permissionAuditor");
const logger = require("../../../utils/logger");
const { getValidGuild } = require("../../../utils/guildFilter");

/**
 * ติดตั้ง Security Feature ทั้งหมดใน Client
 */
function setupSecurity(client) {
  logger.info("[security] Initializing Security Features (Anti-Nuke, Anti-Raid, Backup/Restore)...");

  // 1. ลงทะเบียน Event Listeners
  client.on(Events.ChannelDelete, handleChannelDelete);
  client.on(Events.RoleDelete, handleRoleDelete);
  client.on(Events.GuildMemberAdd, handleGuildMemberAdd);
  client.on(Events.MessageCreate, handleMessageSecurityCheck);
  client.on(Events.MessageUpdate, async (oldMsg, newMsg) => {
    if (newMsg) handleMessageSecurityCheck(newMsg);
  });

  // 2. ดักฟัง Slash Commands & Button Interactions
  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isChatInputCommand()) {
      const { commandName } = interaction;

      if (commandName === "backup") {
        await handleBackupCommand(interaction);
      } else if (commandName === "restore") {
        await handleRestoreCommand(interaction);
      }
    } else if (interaction.isButton()) {
      if (interaction.customId.startsWith("confirm_restore:")) {
        await handleConfirmRestoreButton(interaction);
      }
    }
  });

  // 3. รัน Audit และลงทะเบียน Slash Commands เมื่อพร้อม
  client.once(Events.ClientReady, async () => {
    try {
      const guildId = process.env.GUILD_ID || "1144251788493602848";
      const guild = getValidGuild(client, guildId);

      if (guild) {
        // 3.1 ลงทะเบียน /backup
        await guild.commands.create({
          name: "backup",
          description: "สำรองโครงสร้างเซิร์ฟเวอร์เฉพาะห้องถาวร (เฉพาะ Server Owner)",
          options: [
            {
              name: "create",
              description: "สร้าง Backup ใหม่",
              type: ApplicationCommandOptionType.Subcommand,
              options: [
                {
                  name: "name",
                  description: "ตั้งชื่อภาพสำรองข้อมูล (Optional)",
                  type: ApplicationCommandOptionType.String,
                  required: false,
                },
              ],
            },
            {
              name: "list",
              description: "ดูรายการ Backup ทั้งหมด",
              type: ApplicationCommandOptionType.Subcommand,
            },
          ],
        });

        // 3.2 ลงทะเบียน /restore
        await guild.commands.create({
          name: "restore",
          description: "เรียกคืนโครงสร้างเซิร์ฟเวอร์จาก Backup ID (เฉพาะ Server Owner)",
          options: [
            {
              name: "backup_id",
              description: "ระบุ Backup ID ที่ต้องการ Restore (ดูได้จาก /backup list)",
              type: ApplicationCommandOptionType.String,
              required: true,
            },
          ],
        });

        logger.info(`[security] Slash commands /backup & /restore registered on guild ${guild.name}.`);
        await auditGuildPermissions(guild);
      }
    } catch (err) {
      logger.error(`[security] Failed registering slash commands or running audit: ${err.message}`);
    }
  });
}

/**
 * จัดการคำสั่ง /backup
 */
async function handleBackupCommand(interaction) {
  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply({ content: "คำสั่งนี้ใช้ได้เฉพาะในเซิร์ฟเวอร์เท่านั้น", flags: 64 });
  }

  // 🔒 ตรวจสอบสิทธิ์เฉพาะ Server Owner เท่านั้น
  if (interaction.user.id !== guild.ownerId) {
    return interaction.reply({
      content: "❌ **ปฏิเสธการเข้าถึง:** คำสั่งนี้สงวนสิทธิ์การใช้งานสำหรับ **เจ้าของเซิร์ฟเวอร์ (Server Owner)** เท่านั้น",
      flags: 64,
    });
  }

  const subcommand = interaction.options.getSubcommand(false) || "create";

  if (subcommand === "list") {
    await interaction.deferReply({ flags: 64 });
    try {
      const backups = await listBackupsFromSupabase(guild.id);
      if (backups.length === 0) {
        return interaction.editReply({ content: "ℹ️ ยังไม่มีประวัติ Backup ในเซิร์ฟเวอร์นี้" });
      }

      const embed = new EmbedBuilder()
        .setTitle(`📜 รายการ Backup เซิร์ฟเวอร์ ${guild.name}`)
        .setColor(0x00aaff)
        .setTimestamp();

      backups.forEach((b, idx) => {
        const dateStr = new Date(b.createdAt).toLocaleString("th-TH");
        embed.addFields({
          name: `${idx + 1}. ${b.name} (\`${b.id.substring(0, 8)}\`)`,
          value: `🕒 **วันที่:** ${dateStr}\n👤 **ผู้บันทึก:** <@${b.createdBy}>\n📁 **หมวดหมู่:** ${b.categoryCount} | **ช่อง:** ${b.channelCount} | **บทบาท:** ${b.roleCount}\n🆔 \`${b.id}\``,
        });
      });

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      logger.error(`[securityCommand] Failed to list backups: ${err.message}`);
      return interaction.editReply({ content: `❌ เกิดข้อผิดพลาดในการดึงข้อมูล: ${err.message}` });
    }
  } else {
    // Default: create
    await interaction.deferReply({ flags: 64 });
    const backupName = interaction.options.getString("name") || `Manual Backup ${new Date().toLocaleDateString("th-TH")}`;

    try {
      const data = await serializeGuildStructure(guild);
      const saved = await saveBackupToSupabase(guild.id, backupName, interaction.user.id, data);

      const embed = new EmbedBuilder()
        .setTitle("✅ สำรองข้อมูลโครงสร้างเซิร์ฟเวอร์สำเร็จ!")
        .setColor(0x00ff88)
        .setDescription(`ระบบทำการ Backup โครงสร้างห้องถาวร หมวดหมู่ และบทบาทเรียบร้อยแล้ว`)
        .addFields(
          { name: "ชื่อ Backup", value: `\`${saved.backup_name}\``, inline: true },
          { name: "Backup ID", value: `\`${saved.id}\``, inline: true },
          { name: "หมวดหมู่ (Categories)", value: `${data.categories.length} หมวดหมู่`, inline: true },
          { name: "ช่องถาวร (Channels)", value: `${data.channels.length} ช่อง`, inline: true },
          { name: "บทบาท (Roles)", value: `${data.roles.length} บทบาท`, inline: true }
        )
        .setFooter({ text: "ข้อมูลถูกเก็บบันทึกบน Supabase อย่างถาวร" })
        .setTimestamp();

      return interaction.editReply({ embeds: [embed] });
    } catch (err) {
      logger.error(`[securityCommand] Backup creation failed: ${err.message}`);
      return interaction.editReply({ content: `❌ เกิดข้อผิดพลาดในการ Backup: ${err.message}` });
    }
  }
}

/**
 * จัดการคำสั่ง /restore
 */
async function handleRestoreCommand(interaction) {
  const guild = interaction.guild;
  if (!guild) {
    return interaction.reply({ content: "คำสั่งนี้ใช้ได้เฉพาะในเซิร์ฟเวอร์เท่านั้น", flags: 64 });
  }

  // 🔒 ตรวจสอบสิทธิ์เฉพาะ Server Owner เท่านั้น
  if (interaction.user.id !== guild.ownerId) {
    return interaction.reply({
      content: "❌ **ปฏิเสธการเข้าถึง:** คำสั่งนี้สงวนสิทธิ์การใช้งานสำหรับ **เจ้าของเซิร์ฟเวอร์ (Server Owner)** เท่านั้น",
      flags: 64,
    });
  }

  const backupId = interaction.options.getString("backup_id");
  if (!backupId) {
    return interaction.reply({ content: "กรุณาระบุ Backup ID ที่ต้องการ Restore (ดูได้จาก `/backup list`)", flags: 64 });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm_restore:${backupId}`)
      .setLabel("⚠️ ยืนยันการ Restore โครงสร้างเซิร์ฟเวอร์")
      .setStyle(ButtonStyle.Danger)
  );

  return interaction.reply({
    content: `⚠️ **คำเตือนความปลอดภัย:** ท่านกำลังจะ Restore โครงสร้างเซิร์ฟเวอร์จาก Backup ID: \`${backupId}\`\nระบบจะทำการสร้างหมวดหมู่, ช่องถาวร และบทบาทที่สูญหายกลับคืนมาในลำดับเดิม หากแน่ใจแล้วโปรดกดปุ่มยืนยันด้านล่าง:`,
    components: [row],
    flags: 64,
  });
}

/**
 * จัดการปุ่มยืนยันการ Restore
 */
async function handleConfirmRestoreButton(interaction) {
  const guild = interaction.guild;
  if (!guild || interaction.user.id !== guild.ownerId) {
    return interaction.reply({ content: "ปฏิเสธสิทธิ์การใช้งานเฉพาะ Server Owner เท่านั้น", flags: 64 });
  }

  const backupId = interaction.customId.split(":")[1];
  await interaction.deferUpdate();

  try {
    const result = await restoreGuildStructure(guild, backupId);

    const embed = new EmbedBuilder()
      .setTitle("🎉 Restore โครงสร้างเซิร์ฟเวอร์สำเร็จ!")
      .setColor(0x00ff88)
      .setDescription(`ทำการ Restore โครงสร้างจาก Backup \`${result.backupName}\` เรียบร้อยแล้ว`)
      .addFields(
        { name: "Categories คืนค่า", value: `${result.restoredCategories} หมวดหมู่`, inline: true },
        { name: "Channels คืนค่า", value: `${result.restoredChannels} ช่อง`, inline: true },
        { name: "Roles คืนค่า", value: `${result.restoredRoles} บทบาท`, inline: true }
      )
      .setTimestamp();

    await interaction.editReply({
      content: "✅ **Restore โครงสร้างเรียบร้อยแล้ว**",
      embeds: [embed],
      components: [],
    });
  } catch (err) {
    logger.error(`[securityCommand] Restore failed: ${err.message}`);
    await interaction.editReply({
      content: `❌ เกิดข้อผิดพลาดในการ Restore: ${err.message}`,
      components: [],
    });
  }
}

module.exports = {
  setupSecurity,
};
