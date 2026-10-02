// ===================================================
// src/features/ai/aiCommands.js
// Slash Commands: /ai-status & /ai-reload (Admin/Owner)
// ===================================================

const { SlashCommandBuilder, PermissionFlagsBits, MessageFlags, EmbedBuilder } = require("discord.js");
const { getAIEngineStats, loadPersona } = require("./aiEngine");
const { loadKnowledge, getKnowledgeStats } = require("./knowledgeManager");
const { loadStickerTriggers, getTriggerStats } = require("./stickerManager");

// 1. /ai-reload Command
const aiReloadCommand = new SlashCommandBuilder()
  .setName("ai-reload")
  .setDescription("รีโหลด Persona, Knowledge Base และ Sticker Triggers เข้าสู่ RAM")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

// 2. /ai-status Command
const aiStatusCommand = new SlashCommandBuilder()
  .setName("ai-status")
  .setDescription("ตรวจสอบสถานะการทำงาน, Daily Budget และ Cache ของระบบ AI")
  .setDefaultMemberPermissions(PermissionFlagsBits.Administrator);

async function handleAIReload(interaction) {
  const isOwner = interaction.user.id === process.env.OWNER_ID;
  const isAdmin = interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);

  if (!isOwner && !isAdmin) {
    return interaction.reply({
      content: "❌ คำสั่งนี้สงวนสิทธิ์เฉพาะผู้ดูแลระบบ (Admin) หรือ Owner เท่านั้นค่ะ!",
      flags: MessageFlags.Ephemeral,
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  try {
    loadPersona();
    const knowledgeCount = await loadKnowledge();
    const triggerCount = await loadStickerTriggers();

    return interaction.editReply({
      content: `✅ **[Hot-Reload สำเร็จ]**\n- 🐻 Persona: รีโหลดเรียบร้อย\n- 📚 Server Knowledge: ${knowledgeCount} รายการ\n- 🎨 Sticker Triggers: ${triggerCount} คำ\nพี่หมีพร้อมทำงานด้วยข้อมูลชุดใหม่ทันทีค่ะ! ☕✨`,
    });
  } catch (err) {
    return interaction.editReply({
      content: `❌ เกิดข้อผิดพลาดในการรีโหลดข้อมูล: ${err.message}`,
    });
  }
}

async function handleAIStatus(interaction) {
  const engineStats = getAIEngineStats();
  const knowledgeStats = getKnowledgeStats();
  const triggerStats = getTriggerStats();

  const embed = new EmbedBuilder()
    .setColor(0x8b5a2b)
    .setTitle("🐻 สถานะระบบผู้ช่วย AI (Bear Cafe AI Status)")
    .setDescription("ข้อมูลการใช้งาน Internal Budget และ Cache ภายใน RAM")
    .addFields(
      {
        name: "📊 Daily Request Budget",
        value: `**ใช้งาน:** ${engineStats.dailyUsageCount} / ${engineStats.budgetLimit} Requests\n**สถานะ Tier:** \`${engineStats.tier}\`\n**วันที่บันทึก:** ${engineStats.trackingDate}`,
        inline: false,
      },
      {
        name: "📚 Knowledge Base (RAM)",
        value: `**จำนวน:** ${knowledgeStats.totalEntries} รายการ\n**หมวดหมู่:** ${knowledgeStats.categories.join(", ") || "ไม่มี"}`,
        inline: true,
      },
      {
        name: "🎨 Sticker Triggers (RAM)",
        value: `**จำนวน:** ${triggerStats.totalTriggers} คำ\n**คีย์เวิร์ด:** ${triggerStats.keywords.join(", ") || "ไม่มี"}`,
        inline: true,
      }
    )
    .setFooter({ text: "Bear Cafe AI Engine v2 · Single-Pass Architecture" })
    .setTimestamp();

  return interaction.reply({
    embeds: [embed],
    flags: MessageFlags.Ephemeral,
  });
}

module.exports = {
  aiReloadCommand,
  aiStatusCommand,
  handleAIReload,
  handleAIStatus,
};
