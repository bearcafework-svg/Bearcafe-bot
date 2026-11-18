// src/commands/coinGachaClaimCommand.js
// Slash Command: /รับแต้มครั้งแรก สำหรับทีมงานแจกโบนัสแต้มครั้งแรก 500 แต้มให้แก่สมาชิก

const { MessageFlags } = require("discord.js");
const { registerCommand } = require("../interactions/router");
const { claimFirstTimeBonus } = require("../features/coinGacha/coinGachaService");

function setupCoinGachaClaimCommand(client) {
  registerCommand("รับแต้มครั้งแรก", async (interaction) => {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

    const targetUser = interaction.options.getUser("user");
    if (!targetUser) {
      return interaction.editReply({
        content: "⚠️ กรุณาระบุสมาชิกที่ต้องการมอบแต้มครั้งแรกค่ะ"
      });
    }

    try {
      const result = await claimFirstTimeBonus(interaction.member, targetUser);
      return interaction.editReply({
        content: result.message
      });
    } catch (err) {
      console.error("[coinGachaClaimCommand] Error executing /รับแต้มครั้งแรก:", err);
      return interaction.editReply({
        content: `❌ เกิดข้อผิดพลาดในการประมวลผลคำสั่ง: \`${err.message}\``
      });
    }
  });

  console.log("🪙 [coinGachaClaimCommand] Slash command /รับแต้มครั้งแรก ลงทะเบียนเรียบร้อยแล้ว");
}

module.exports = {
  setupCoinGachaClaimCommand
};
