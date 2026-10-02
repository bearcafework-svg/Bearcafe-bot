// src/commands/clearMessages.js
// คำสั่ง Slash Command /clear สำหรับลบข้อความตามจำนวนที่ต้องการในห้อง (Admin/Dev Only)

const { PermissionFlagsBits, MessageFlags } = require("discord.js");
const { registerCommand } = require("../interactions/router");
const config = require("../../config");

const FLAG_EPHEMERAL = MessageFlags.Ephemeral;

function setupClearMessages(client) {
  // คำสั่งนี้ทำงานเฉพาะเมื่อรันในโหมด Dev เท่านั้น
  const isDevMode = process.env.DEV_MODE === "true";
  if (!isDevMode) return;

  registerCommand("clear", async (interaction) => {
    // 1. ตรวจสอบสิทธิ์แอดมิน / ManageMessages
    const isOwner = (process.env.OWNER_ID && interaction.user.id === process.env.OWNER_ID) ||
                    (interaction.guild && interaction.guild.ownerId === interaction.user.id);
    const staffRoleId = (config.healJai && config.healJai.staffRoleId) || "1536208040582316032";
    const hasStaffRole = interaction.member?.roles?.cache?.some((r) =>
      [staffRoleId, "1144701361448038512", "1144697989986791576", "1144698080239829092"].includes(r.id)
    );
    const hasPermission = interaction.member?.permissions?.has(PermissionFlagsBits.ManageMessages) ||
                          interaction.member?.permissions?.has(PermissionFlagsBits.ManageChannels) ||
                          interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);

    if (!isOwner && !hasStaffRole && !hasPermission && !isDevMode) {
      return interaction.reply({
        content: "❌ ขออภัยค่ะ เฉพาะแอดมินหรือผู้มีสิทธิ์จัดการข้อความเท่านั้นที่สามารถใช้คำสั่งนี้ได้นะคะ",
        flags: FLAG_EPHEMERAL,
      });
    }

    const channel = interaction.channel;
    if (!channel || !channel.isTextBased() || typeof channel.bulkDelete !== "function") {
      return interaction.reply({
        content: "⚠️ ไม่สามารถลบข้อความในห้องนี้ได้ค่ะ (ต้องเป็น Text Channel)",
        flags: FLAG_EPHEMERAL,
      });
    }

    const amount = interaction.options.getInteger("amount");
    if (!amount || amount < 1 || amount > 100) {
      return interaction.reply({
        content: "⚠️ กรุณาระบุจำนวนข้อความที่ต้องการลบระหว่าง 1 ถึง 100 ข้อความค่ะ",
        flags: FLAG_EPHEMERAL,
      });
    }

    await interaction.deferReply({ flags: FLAG_EPHEMERAL }).catch(() => {});

    try {
      // bulkDelete(amount, filterOld) - filterOld: true ป้องกัน error ข้อความที่เก่ากว่า 14 วัน
      const deleted = await channel.bulkDelete(amount, true);
      const count = deleted ? deleted.size : 0;

      return interaction.editReply({
        content: `🧹 **ลบข้อความเรียบร้อยแล้วค่ะ!**\n> 🗑️ จำนวนที่ลบสำเร็จ: **${count}** ข้อความ\n-# *หมายเหตุ: Discord ไม่อนุญาตให้บอทลบข้อความที่มีอายุเกิน 14 วันแบบรวดเดียว (Bulk Delete) ค่ะ*`,
      });
    } catch (err) {
      console.error("[clearMessages] Failed to bulk delete messages:", err);
      return interaction.editReply({
        content: `❌ เกิดข้อผิดพลาดในการลบข้อความ: \`${err.message}\``,
      });
    }
  });

  console.log("🧹 [clearMessages] Registered /clear command (Dev Bot Exclusive).");
}

module.exports = { setupClearMessages };
