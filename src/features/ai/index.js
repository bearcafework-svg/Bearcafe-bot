// ===================================================
// src/features/ai/index.js
// Bear Cafe AI Assistant Feature Initializer
// ===================================================

const { setupAIHandler } = require("./aiHandler");
const { aiReloadCommand, handleAIReload } = require("./aiCommands");
const { loadKnowledgeFiles } = require("./aiEngine");

function setupAI(client) {
  // 1. โหลดข้อมูลความรู้เริ่มต้น
  loadKnowledgeFiles();

  // 2. ติดตั้ง Message Handler ดักฟังเฉพาะห้อง 1544088196332134491
  setupAIHandler(client);

  // 3. ติดตั้ง Slash Command Interaction Handler สำหรับ /ai-reload
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName === "ai-reload") {
      return await handleAIReload(interaction);
    }
  });

  console.log("🐻 [AI] ติดตั้งระบบ Bear Cafe AI Assistant เรียบร้อยแล้ว!");
}

module.exports = {
  setupAI,
  aiReloadCommand,
  handleAIReload,
};
