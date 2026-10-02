// ===================================================
// src/features/ai/index.js
// Bear Cafe AI Assistant Feature Initializer
// ===================================================

const { setupAIHandler } = require("./aiHandler");
const {
  aiReloadCommand,
  aiStatusCommand,
  handleAIReload,
  handleAIStatus,
} = require("./aiCommands");
const { initializeAIEngine } = require("./aiEngine");

async function setupAI(client) {
  // 1. โหลดข้อมูลความรู้, บุคลิก และ Triggers เข้าสู่ RAM
  await initializeAIEngine();

  // 2. ติดตั้ง Message Handler ดักฟังห้องที่กำหนด
  setupAIHandler(client);

  // 3. ติดตั้ง Slash Command Interaction Handlers
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === "ai-reload") {
      return await handleAIReload(interaction);
    }

    if (interaction.commandName === "ai-status") {
      return await handleAIStatus(interaction);
    }
  });

  console.log("🐻 [AI] ติดตั้งระบบ Bear Cafe AI Assistant v2 เรียบร้อยแล้ว!");
}

module.exports = {
  setupAI,
  aiReloadCommand,
  aiStatusCommand,
  handleAIReload,
  handleAIStatus,
};
