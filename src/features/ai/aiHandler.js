// ===================================================
// src/features/ai/aiHandler.js
// Bear Cafe AI Message Listener
// ดักฟังเฉพาะห้อง 1544088196332134491 และไม่ตอบสนองกับห้องอื่นโดยเด็ดขาด
// ===================================================

const { CONFIG, handleIncomingUserMessage } = require("./aiEngine");

function setupAIHandler(client) {
  if (!client) return;

  client.on("messageCreate", async (message) => {
    // 1. กรองข้อความจากบอท หรือข้อความที่ไม่มี Guild
    if (!message.guild || message.author.bot) return;

    // 2. ตรวจสอบห้อง: ต้องเป็นห้องที่กำหนดไว้เท่านั้น (1544088196332134491)
    // ไม่ตอบสนองกับห้องอื่นโดยเด็ดขาด (แม้จะมีการแท็กบอท เพื่อป้องกันการรบกวนห้องอื่น)
    if (message.channel.id !== CONFIG.DEDICATED_CHANNEL_ID) return;

    // 3. กรองข้อความว่าง
    if (!message.content || !message.content.trim()) return;

    // 4. ส่งต่อให้ AI Engine จัดการ (Debounce + FIFO Queue + Gemini)
    try {
      handleIncomingUserMessage(message);
    } catch (err) {
      console.error("❌ [AIHandler] Message handling error:", err.message);
    }
  });

  console.log(`🐻 [AIHandler] ระบบผู้ช่วย AI พร้อมทำงานในห้อง ${CONFIG.DEDICATED_CHANNEL_ID} (คุยได้โดยไม่ต้องแท็ก)`);
}

module.exports = {
  setupAIHandler,
};
