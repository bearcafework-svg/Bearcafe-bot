// src/features/cafe/index.js
// Main entry point for Bear Café — Customer & Anomaly Game System

const { CafeEngine } = require("./cafeEngine");
const { buildCafeActivePromptPayload } = require("./components/cafeActivePromptPayload");
const { buildCafeExpiredPayload, buildCafeCancelledPayload } = require("./components/cafeErrorPayload");

const FLAG_EPHEMERAL = 64; // MessageFlags.Ephemeral

function setupCafe(client) {
  const engine = new CafeEngine();

  // ── 1. Message Command Listener (b!cafe) ──────────────────────────────
  client.on("messageCreate", async (message) => {
    if (!message.guild || message.author.bot) return;

    const content = message.content.trim().toLowerCase();
    if (content !== "b!cafe") return;

    const userId = message.author.id;
    const channelId = message.channel.id;

    try {
      // ตรวจสอบว่าผู้เล่นมี Session เดิมที่กำลังเล่นอยู่หรือไม่
      const existingSession = await engine.store.getSessionByUserId(userId);
      if (existingSession && existingSession.status !== "COMPLETED" && existingSession.status !== "CANCELLED") {
        const promptPayload = buildCafeActivePromptPayload(existingSession);
        return message.channel.send(promptPayload);
      }

      // สร้าง Session ใหม่
      const session = await engine.startNewSession(userId, channelId);
      const mainPayload = engine.renderPayload(session);

      // ส่ง Single Interactive Component V2 Message
      const sentMessage = await message.channel.send(mainPayload);

      // บันทึก messageId ลงใน session
      session.messageId = sentMessage.id;
      await engine.store.updateSession(session);
    } catch (err) {
      console.error("[cafe] Error starting session:", err);
    }
  });

  // ── 2. Interaction Listener (Buttons) ──────────────────────────────────
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    const customId = interaction.customId;
    if (!customId.startsWith("cafe_")) return;

    try {
      // ค้นหา Session จาก messageId หรือ userId
      let session = await engine.store.getSessionByMessageId(interaction.message.id);
      if (!session) {
        session = await engine.store.getSessionByUserId(interaction.user.id);
      }

      // ── ตรวจสอบ Session หมดอายุ / ไม่พบ ────────────────────────────────
      if (!session) {
        return interaction.update(buildCafeExpiredPayload(interaction.user.id));
      }

      // ── ตรวจสอบความเป็นเจ้าของ Session (Ownership) ───────────────────────
      if (session.userId !== interaction.user.id) {
        return interaction.reply({
          content: `☕ เกมนี้เป็นของ <@${session.userId}> ค่ะ (พิมพ์ \`b!cafe\` เพื่อเริ่มเกมของคุณนะคะ)`,
          flags: FLAG_EPHEMERAL
        });
      }

      // ── Concurrency & Anti-Double-Click Lock ───────────────────────────
      if (session.isProcessing) {
        return interaction.deferUpdate().catch(() => {});
      }
      session.isProcessing = true;
      const safetyLock = setTimeout(() => {
        session.isProcessing = false;
      }, 5000);

      try {
        // ── 3. Router ปุ่มต่างๆ ───────────────────────────────────────────

        // A. สลับไปเมนูตรวจสอบ (Observation Mode)
        if (customId === "cafe_observe_menu") {
          session.status = "OBSERVING";
          await engine.store.updateSession(session);
          return await interaction.update(engine.renderPayload(session));
        }

        // B. ทำการสำรวจจุดต่างๆ (5 จุด)
        if (customId.startsWith("cafe_obs_")) {
          const targetId = customId.replace("cafe_obs_", "");
          await engine.observeTarget(session, targetId);
          return await interaction.update(engine.renderPayload(session));
        }

        // C. กลับจากเมนูตรวจสอบไปหน้าตัดสินใจหลัก
        if (customId === "cafe_back_main") {
          session.status = "ACTIVE";
          await engine.store.updateSession(session);
          return await interaction.update(engine.renderPayload(session));
        }

        // D. เข้าสู่โหมดเคาน์เตอร์ชงเครื่องดื่ม (Brewing Mode)
        if (customId === "cafe_brew_menu") {
          session.status = "BREWING";
          await engine.store.updateSession(session);
          return await interaction.update(engine.renderPayload(session));
        }

        // D.1 ปรับแต่งส่วนผสม (Base, Temp, Sugar, Topping)
        if (customId === "cafe_brew_base") {
          await engine.cycleBrew(session, "base");
          return await interaction.update(engine.renderPayload(session));
        }
        if (customId === "cafe_brew_temp") {
          await engine.cycleBrew(session, "temp");
          return await interaction.update(engine.renderPayload(session));
        }
        if (customId === "cafe_brew_sugar") {
          await engine.cycleBrew(session, "sugar");
          return await interaction.update(engine.renderPayload(session));
        }
        if (customId === "cafe_brew_topping") {
          await engine.cycleBrew(session, "topping");
          return await interaction.update(engine.renderPayload(session));
        }

        // D.2 รีเซ็ตแก้วที่กำลังชง
        if (customId === "cafe_brew_reset") {
          await engine.resetBrew(session);
          return await interaction.update(engine.renderPayload(session));
        }

        // D.3 เสิร์ฟเครื่องดื่มที่ชงเสร็จแล้ว
        if (customId === "cafe_brew_serve" || customId === "cafe_serve") {
          await engine.makeDecision(session, "SERVE");
          return await interaction.update(engine.renderPayload(session));
        }

        // E. ตัดสินใจ: ตรวจจับ Anomaly
        if (customId === "cafe_anomaly") {
          await engine.makeDecision(session, "ANOMALY");
          return await interaction.update(engine.renderPayload(session));
        }

        // F. ก้าวสู่รอบถัดไป (Next Round)
        if (customId === "cafe_next_round") {
          await engine.nextRound(session);
          return await interaction.update(engine.renderPayload(session));
        }

        // G. เริ่มกะใหม่ (เล่นต่อจากข้อความเดิม)
        if (customId === "cafe_continue") {
          await engine.continueShift(session);
          return await interaction.update(engine.renderPayload(session));
        }

        // H. เล่นต่อจากหน้าเตือน Session ค้าง (Resume)
        if (customId === "cafe_resume") {
          session.status = "ACTIVE";
          await engine.store.updateSession(session);
          return await interaction.update(engine.renderPayload(session));
        }

        // I. ยกเลิก Session / ออกจากร้าน
        if (customId === "cafe_cancel") {
          await engine.cancelSession(session.sessionId);
          return await interaction.update(buildCafeCancelledPayload(session.userId));
        }
      } finally {
        clearTimeout(safetyLock);
        session.isProcessing = false;
        await engine.store.updateSession(session).catch(() => {});
      }
    } catch (err) {
      console.error("[cafe] Error handling button interaction:", err);
    }
  });

  console.log("☕ [cafe] Bear Café System (Customer & Anomaly) loaded successfully.");
}

module.exports = {
  setupCafe
};
