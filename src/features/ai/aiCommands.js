// ===================================================
// src/features/ai/aiCommands.js
// Slash Command: /ai-reload (สำหรับ Admin/Owner เพื่อ Hot-reload ความรู้เข้า RAM)
// ===================================================

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags } = require("discord.js");
const { loadKnowledgeFiles } = require("./aiEngine");

const aiReloadCommand = new SlashCommandBuilder()
  .setName("ai-reload")
  .setDescription("รีโหลดไฟล์ความรู้และบุคลิกของ AI (Hot-Reload) เข้าสู่ RAM ทันที")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function handleAIReload(interaction) {
  // ตรวจสอบสิทธิ์ Administrator หรือ Owner
  const ownerId = process.env.OWNER_ID;
  const isOwner = interaction.user.id === ownerId;
  const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);

  if (!isOwner && !isAdmin) {
    return interaction.reply({
      content: "❌ คำสั่งนี้สงวนสิทธิ์เฉพาะผู้ดูแลระบบ (Admin) หรือ Owner เท่านั้นค่ะ!",
      flags: MessageFlags.Ephemeral,
    });
  }

  const success = loadKnowledgeFiles();
  if (success) {
    return interaction.reply({
      content: "✅ **[Hot-Reload สำเร็จ]** รีโหลดเนื้อหาจาก `persona.md` และ `serverKnowledge.md` เข้าสู่ RAM เรียบร้อยแล้วค่ะ! พี่หมีพร้อมใช้ข้อมูลชุดใหม่ตอบทันที 🐻☕",
      flags: MessageFlags.Ephemeral,
    });
  } else {
    return interaction.reply({
      content: "❌ เกิดข้อผิดพลาดในการอ่านไฟล์ความรู้ โปรดตรวจสอบ Log ของบอทนะคะ",
      flags: MessageFlags.Ephemeral,
    });
  }
}

module.exports = {
  aiReloadCommand,
  handleAIReload,
};
