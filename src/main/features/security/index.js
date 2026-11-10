// ===================================================
// src/features/security/index.js — จุดเชื่อมต่อฟีเจอร์ความปลอดภัยทั้งหมด
// ===================================================

const {
  Events,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  EmbedBuilder,
} = require("discord.js");
const {
  serializeGuildStructure,
  saveBackupToSupabase,
  listBackupsFromSupabase,
  getBackupById,
  restoreGuildStructure,
} = require("./backupManager");
const { handleChannelDelete, handleRoleDelete } = require("./antiNuke");
const { handleGuildMemberAdd } = require("./antiRaid");
const { handleMessageSecurityCheck } = require("./phishingFilter");
const { auditGuildPermissions } = require("./permissionAuditor");
const logger = require("../../../utils/logger");
const { getValidGuild } = require("../../../utils/guildFilter");

/**
 * ตรวจสอบสิทธิ์เฉพาะ Server Owner เท่านั้น
 */
async function isGuildOwner(interaction) {
  const guild = interaction.guild;
  if (!guild) return false;
  if (guild.ownerId) return interaction.user.id === guild.ownerId;
  const fetched = await guild.fetch().catch(() => null);
  return fetched?.ownerId === interaction.user.id;
}

/**
 * สร้าง Embed และ Components สำหรับหน้าแสดงรายการ Backup
 */
function buildBackupListPayload(guild, backups) {
  const embed = new EmbedBuilder()
    .setTitle(`🛡️ จัดการ Backup โครงสร้างเซิร์ฟเวอร์ — ${guild.name}`)
    .setColor(0x00aaff)
    .setDescription(
      "ระบบสำรองโครงสร้างเฉพาะห้องถาวร, หมวดหมู่ และบทบาท (ข้ามห้องชั่วคราวและข้อความ)\n" +
      "ท่านสามารถกดปุ่มเพื่อสร้าง Backup ใหม่ หรือเลือกจากดรอปดาวน์ด้านล่างเพื่อเตรียม Restore ได้ทันที"
    )
    .setTimestamp();

  if (!backups || backups.length === 0) {
    embed.addFields({
      name: "ℹ️ ยังไม่มีประวัติ Backup",
      value: "กดปุ่ม **\"💾 สร้าง Backup ใหม่ทันที\"** ด้านล่างเพื่อเริ่มสำรองข้อมูลชุดแรก",
    });

    const actionRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId("backup_btn_create_now")
        .setLabel("สร้าง Backup ใหม่ทันที")
        .setEmoji("💾")
        .setStyle(ButtonStyle.Success)
    );

    return { embeds: [embed], components: [actionRow] };
  }

  // แสดง 5 รายการล่าสุด
  backups.slice(0, 5).forEach((b, idx) => {
    const dateStr = new Date(b.createdAt).toLocaleString("th-TH");
    embed.addFields({
      name: `${idx + 1}. 📦 ${b.name}`,
      value: `🕒 **วันที่:** ${dateStr}\n👤 **ผู้บันทึก:** <@${b.createdBy}>\n📁 **หมวดหมู่:** ${b.categoryCount} | 💬 **ช่อง:** ${b.channelCount} | 🛡️ **บทบาท:** ${b.roleCount}\n🆔 \`${b.id}\``,
      inline: false,
    });
  });

  // Select menu สำหรับเลือก restore
  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId("backup_select_restore")
    .setPlaceholder("📦 เลือก Backup เพื่อเตรียมกู้คืน (Restore)...")
    .addOptions(
      backups.slice(0, 10).map((b, idx) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(`${idx + 1}. ${b.name.substring(0, 50)}`)
          .setDescription(`${new Date(b.createdAt).toLocaleDateString("th-TH")} • ${b.categoryCount} หมวด | ${b.channelCount} ห้อง | ${b.roleCount} ยศ`.substring(0, 100))
          .setValue(b.id)
          .setEmoji("📦")
      )
    );

  const buttonsRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("backup_btn_create_now")
      .setLabel("สร้าง Backup ใหม่ทันที")
      .setEmoji("💾")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId("backup_btn_refresh")
      .setLabel("รีเฟรชรายการ")
      .setEmoji("🔄")
      .setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder().addComponents(selectMenu),
      buttonsRow,
    ],
  };
}

/**
 * สร้าง Embed และ Confirm Button สำหรับหน้ายืนยัน Restore
 */
function buildRestoreConfirmPayload(guild, backupId, backupInfo) {
  const embed = new EmbedBuilder()
    .setTitle("⚠️ ยืนยันการกู้คืนโครงสร้างเซิร์ฟเวอร์ (Security Restore)")
    .setColor(0xffaa00)
    .setDescription(
      `คุณกำลังจะ Restore โครงสร้างเซิร์ฟเวอร์ **${guild.name}**\n` +
      `ระบบจะสร้างหมวดหมู่, ช่องถาวร และบทบาทที่สูญหายกลับคืนมา พร้อมตั้งค่า Permission Overwrites เดิม`
    )
    .addFields(
      { name: "ชื่อ Backup", value: `\`${backupInfo?.name || "ไม่ทราบชื่อ"}\``, inline: true },
      { name: "Backup ID", value: `\`${backupId}\``, inline: true },
      { name: "บันทึกเมื่อ", value: backupInfo ? new Date(backupInfo.createdAt).toLocaleString("th-TH") : "-", inline: true },
      { name: "หมวดหมู่", value: `${backupInfo?.categoryCount ?? "?"} หมวด`, inline: true },
      { name: "ช่องถาวร", value: `${backupInfo?.channelCount ?? "?"} ช่อง`, inline: true },
      { name: "บทบาท", value: `${backupInfo?.roleCount ?? "?"} ยศ`, inline: true }
    )
    .setFooter({ text: "⚠️ การกระทำนี้ไม่กระทบห้องชั่วคราวและข้อความ แต่โปรดตรวจสอบความถูกต้องก่อนยืนยัน" });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`confirm_restore:${backupId}`)
      .setLabel("⚠️ ยืนยัน Restore โครงสร้างเดี๋ยวนี้")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId("backup_cancel")
      .setLabel("ยกเลิก")
      .setStyle(ButtonStyle.Secondary)
  );

  return { embeds: [embed], components: [row] };
}

/**
 * จัดการ Autocomplete สำหรับ backup_id
 */
async function handleSecurityAutocomplete(interaction) {
  try {
    const focused = interaction.options.getFocused(true);
    if (focused.name === "backup_id") {
      const guild = interaction.guild;
      if (!guild) return interaction.respond([]);
      const backups = await listBackupsFromSupabase(guild.id).catch(() => []);
      const query = (focused.value || "").toLowerCase().trim();
      const filtered = backups.filter(
        (b) =>
          !query ||
          b.name.toLowerCase().includes(query) ||
          b.id.toLowerCase().includes(query)
      );

      return interaction.respond(
        filtered.slice(0, 25).map((b) => {
          const dateStr = new Date(b.createdAt).toLocaleDateString("th-TH");
          return {
            name: `${b.name} (${dateStr}) [${b.id.substring(0, 8)}]`.substring(0, 100),
            value: b.id,
          };
        })
      );
    }
  } catch (err) {
    logger.warn(`[security] Autocomplete failed: ${err.message}`);
    try {
      await interaction.respond([]);
    } catch {}
  }
}

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

  // 2. ดักฟัง Slash Commands, Autocomplete & Components
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // 2.1 Autocomplete
      if (interaction.isAutocomplete()) {
        const { commandName } = interaction;
        if (commandName === "restore" || commandName === "backup") {
          await handleSecurityAutocomplete(interaction);
        }
        return;
      }

      // 2.2 Slash Commands
      if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;
        if (commandName === "backup") {
          await handleBackupCommand(interaction);
        } else if (commandName === "restore") {
          await handleRestoreCommand(interaction);
        }
        return;
      }

      // 2.3 String Select Menu
      if (interaction.isStringSelectMenu()) {
        if (interaction.customId === "backup_select_restore") {
          await handleSelectRestoreMenu(interaction);
        }
        return;
      }

      // 2.4 Button Interactions
      if (interaction.isButton()) {
        if (interaction.customId.startsWith("confirm_restore:")) {
          await handleConfirmRestoreButton(interaction);
        } else if (interaction.customId === "backup_btn_create_now") {
          await handleCreateBackupButton(interaction);
        } else if (interaction.customId === "backup_btn_refresh") {
          await handleRefreshBackupsButton(interaction);
        } else if (interaction.customId === "backup_cancel") {
          await handleCancelButton(interaction);
        }
        return;
      }
    } catch (err) {
      logger.error(`[security] Interaction error: ${err.message}`);
    }
  });

  // 3. รัน Audit เมื่อพร้อม
  client.once(Events.ClientReady, async () => {
    try {
      const guildId = process.env.GUILD_ID || "1144251788493602848";
      const guild = getValidGuild(client, guildId);

      if (guild) {
        await auditGuildPermissions(guild);
      }
    } catch (err) {
      logger.error(`[security] Failed running audit: ${err.message}`);
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
  if (!(await isGuildOwner(interaction))) {
    return interaction.reply({
      content: "❌ **ปฏิเสธการเข้าถึง:** คำสั่งนี้สงวนสิทธิ์การใช้งานสำหรับ **เจ้าของเซิร์ฟเวอร์ (Server Owner)** เท่านั้น",
      flags: 64,
    });
  }

  const subcommand = interaction.options.getSubcommand(false) || "list";

  if (subcommand === "list") {
    await interaction.deferReply({ flags: 64 });
    try {
      const backups = await listBackupsFromSupabase(guild.id);
      const payload = buildBackupListPayload(guild, backups);
      return interaction.editReply(payload);
    } catch (err) {
      logger.error(`[securityCommand] Failed to list backups: ${err.message}`);
      return interaction.editReply({ content: `❌ เกิดข้อผิดพลาดในการดึงข้อมูล: ${err.message}` });
    }
  } else if (subcommand === "restore") {
    const backupId = interaction.options.getString("backup_id");
    return handleRestoreFlow(interaction, backupId);
  } else {
    // create
    await interaction.deferReply({ flags: 64 });
    const backupName =
      interaction.options.getString("name") ||
      `Manual Backup ${new Date().toLocaleDateString("th-TH")}`;

    try {
      const data = await serializeGuildStructure(guild);
      const saved = await saveBackupToSupabase(guild.id, backupName, interaction.user.id, data);

      const embed = new EmbedBuilder()
        .setTitle("✅ สำรองข้อมูลโครงสร้างเซิร์ฟเวอร์สำเร็จ!")
        .setColor(0x00ff88)
        .setDescription("ระบบทำการ Backup โครงสร้างห้องถาวร หมวดหมู่ และบทบาทเรียบร้อยแล้ว")
        .addFields(
          { name: "ชื่อ Backup", value: `\`${saved.backup_name}\``, inline: true },
          { name: "Backup ID", value: `\`${saved.id}\``, inline: true },
          { name: "หมวดหมู่ (Categories)", value: `${data.categories.length} หมวดหมู่`, inline: true },
          { name: "ช่องถาวร (Channels)", value: `${data.channels.length} ช่อง`, inline: true },
          { name: "บทบาท (Roles)", value: `${data.roles.length} บทบาท`, inline: true }
        )
        .setFooter({ text: "ข้อมูลถูกเก็บบันทึกบน Supabase อย่างถาวร" })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("backup_btn_refresh")
          .setLabel("ดูรายการ Backup ทั้งหมด")
          .setEmoji("📜")
          .setStyle(ButtonStyle.Primary)
      );

      return interaction.editReply({ embeds: [embed], components: [row] });
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
  if (!(await isGuildOwner(interaction))) {
    return interaction.reply({
      content: "❌ **ปฏิเสธการเข้าถึง:** คำสั่งนี้สงวนสิทธิ์การใช้งานสำหรับ **เจ้าของเซิร์ฟเวอร์ (Server Owner)** เท่านั้น",
      flags: 64,
    });
  }

  const backupId = interaction.options.getString("backup_id");
  return handleRestoreFlow(interaction, backupId);
}

/**
 * Logic ร่วมสำหรับแสดงหน้ากู้คืน (มี ID -> แสดงปุ่มยืนยัน, ไม่มี ID -> แสดงดรอปดาวน์)
 */
async function handleRestoreFlow(interaction, backupId) {
  const guild = interaction.guild;
  await interaction.deferReply({ flags: 64 });

  try {
    if (backupId) {
      const backupInfo = await getBackupById(guild.id, backupId);
      const payload = buildRestoreConfirmPayload(guild, backupId, backupInfo);
      return interaction.editReply(payload);
    } else {
      const backups = await listBackupsFromSupabase(guild.id);
      const payload = buildBackupListPayload(guild, backups);
      return interaction.editReply(payload);
    }
  } catch (err) {
    logger.error(`[securityCommand] Failed in restore flow: ${err.message}`);
    return interaction.editReply({ content: `❌ เกิดข้อผิดพลาด: ${err.message}` });
  }
}

/**
 * จัดการเลือก Backup จาก String Select Menu
 */
async function handleSelectRestoreMenu(interaction) {
  if (!(await isGuildOwner(interaction))) {
    return interaction.reply({
      content: "❌ **ปฏิเสธการเข้าถึง:** คำสั่งนี้สงวนสิทธิ์การใช้งานสำหรับ **เจ้าของเซิร์ฟเวอร์ (Server Owner)** เท่านั้น",
      flags: 64,
    });
  }

  const backupId = interaction.values[0];
  try {
    const backupInfo = await getBackupById(interaction.guild.id, backupId);
    const payload = buildRestoreConfirmPayload(interaction.guild, backupId, backupInfo);
    await interaction.update(payload);
  } catch (err) {
    logger.error(`[securityCommand] Select menu restore failed: ${err.message}`);
    await interaction.reply({ content: `❌ เกิดข้อผิดพลาด: ${err.message}`, flags: 64 });
  }
}

/**
 * จัดการปุ่ม "สร้าง Backup ใหม่ทันที"
 */
async function handleCreateBackupButton(interaction) {
  if (!(await isGuildOwner(interaction))) {
    return interaction.reply({
      content: "❌ **ปฏิเสธการเข้าถึง:** คำสั่งนี้สงวนสิทธิ์การใช้งานสำหรับ **เจ้าของเซิร์ฟเวอร์ (Server Owner)** เท่านั้น",
      flags: 64,
    });
  }

  await interaction.update({
    content: "⏳ **กำลังสำรองข้อมูลโครงสร้างเซิร์ฟเวอร์ลง Supabase...** กรุณารอสักครู่",
    embeds: [],
    components: [],
  });

  try {
    const guild = interaction.guild;
    const backupName = `Quick Backup ${new Date().toLocaleString("th-TH")}`;
    const data = await serializeGuildStructure(guild);
    await saveBackupToSupabase(guild.id, backupName, interaction.user.id, data);

    const backups = await listBackupsFromSupabase(guild.id);
    const payload = buildBackupListPayload(guild, backups);
    payload.content = "✅ **สร้าง Backup ใหม่สำเร็จเรียบร้อยแล้ว!**";
    await interaction.editReply(payload);
  } catch (err) {
    logger.error(`[securityCommand] Quick backup button failed: ${err.message}`);
    await interaction.editReply({
      content: `❌ เกิดข้อผิดพลาดในการสร้าง Backup: ${err.message}`,
      embeds: [],
      components: [],
    });
  }
}

/**
 * จัดการปุ่ม "รีเฟรชรายการ"
 */
async function handleRefreshBackupsButton(interaction) {
  if (!(await isGuildOwner(interaction))) {
    return interaction.reply({
      content: "❌ **ปฏิเสธการเข้าถึง:** คำสั่งนี้สงวนสิทธิ์การใช้งานสำหรับ **เจ้าของเซิร์ฟเวอร์ (Server Owner)** เท่านั้น",
      flags: 64,
    });
  }

  await interaction.deferUpdate();
  try {
    const backups = await listBackupsFromSupabase(interaction.guild.id);
    const payload = buildBackupListPayload(interaction.guild, backups);
    await interaction.editReply(payload);
  } catch (err) {
    logger.error(`[securityCommand] Refresh backups failed: ${err.message}`);
    await interaction.editReply({ content: `❌ เกิดข้อผิดพลาด: ${err.message}` });
  }
}

/**
 * จัดการปุ่มยกเลิก
 */
async function handleCancelButton(interaction) {
  if (!(await isGuildOwner(interaction))) {
    return interaction.reply({
      content: "❌ **ปฏิเสธการเข้าถึง:** คำสั่งนี้สงวนสิทธิ์การใช้งานสำหรับ **เจ้าของเซิร์ฟเวอร์ (Server Owner)** เท่านั้น",
      flags: 64,
    });
  }

  await interaction.update({
    content: "❌ **ยกเลิกขั้นตอน Restore เรียบร้อยแล้ว**",
    embeds: [],
    components: [],
  });
}

/**
 * จัดการปุ่มยืนยันการ Restore
 */
async function handleConfirmRestoreButton(interaction) {
  const guild = interaction.guild;
  if (!guild || !(await isGuildOwner(interaction))) {
    return interaction.reply({
      content: "❌ **ปฏิเสธการเข้าถึง:** คำสั่งนี้สงวนสิทธิ์การใช้งานสำหรับ **เจ้าของเซิร์ฟเวอร์ (Server Owner)** เท่านั้น",
      flags: 64,
    });
  }

  const backupId = interaction.customId.split(":")[1];
  await interaction.update({
    content: "⏳ **กำลังดำเนินการ Restore โครงสร้างเซิร์ฟเวอร์...** กรุณารอสักครู่ (อาจใช้เวลา 10-30 วินาที)",
    embeds: [],
    components: [],
  });

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
      embeds: [],
      components: [],
    });
  }
}

module.exports = {
  setupSecurity,
};
