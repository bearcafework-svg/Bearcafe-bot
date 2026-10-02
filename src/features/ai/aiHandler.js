// ===================================================
// src/features/ai/aiHandler.js
// Bear Cafe AI Message Interceptor & Dispatcher
// ===================================================

const { handleIncomingUserMessage } = require("./aiEngine");
const AI_CONFIG = require("./aiConfig");

function setupAIHandler(client) {
  if (!client) return;

  client.on("messageCreate", async (message) => {
    try {
      const botId = client.user ? client.user.id : null;
      await handleIncomingUserMessage(message, botId);
    } catch (err) {
      console.error("❌ [AIHandler] Message handling error:", err.message);
    }
  });

  console.log(`🐻 [AIHandler] ระบบผู้ช่วย AI พร้อมทำงานในห้อง ${AI_CONFIG.DEDICATED_CHANNEL_ID}`);
}

module.exports = {
  setupAIHandler,
};
