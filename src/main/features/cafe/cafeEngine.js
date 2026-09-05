const { AttachmentBuilder } = require("discord.js");
const { CafeSession } = require("./cafeSession");
const { MemoryCafeSessionStore } = require("./stores/memoryCafeSessionStore");
const { generateCustomer } = require("./generators/customerGenerator");
const { generateOrder } = require("./generators/orderGenerator");
const { rollAnomaly } = require("./generators/anomalyGenerator");
const { performObservation } = require("./systems/observationSystem");
const { generateCustomerSceneCanvas } = require("./generators/canvasCustomerGenerator");
const { generateObservationSceneCanvas } = require("./generators/canvasObservationGenerator");
const { generateBrewCupCanvas } = require("./generators/canvasBrewGenerator");
const { generateResultSceneCanvas } = require("./generators/canvasResultGenerator");
const { generateShiftSummaryCanvas } = require("./generators/canvasSummaryGenerator");

const { buildCafeMainPayload } = require("./components/cafeMainPayload");
const { buildCafeObservationPayload } = require("./components/cafeObservationPayload");
const { buildCafeBrewingPayload } = require("./components/cafeBrewingPayload");
const { buildCafeResultPayload } = require("./components/cafeResultPayload");
const { buildCafeCompletePayload } = require("./components/cafeCompletePayload");
const { buildCafeCancelledPayload, buildCafeExpiredPayload } = require("./components/cafeErrorPayload");
const {
  cycleBrewBase,
  cycleBrewTemperature,
  cycleBrewSugar,
  cycleBrewTopping
} = require("./systems/brewingSystem");

class CafeEngine {
  constructor(store = null) {
    this.store = store || new MemoryCafeSessionStore();
  }

  /**
   * สร้างหรือเริ่ม Session ใหม่สำหรับ User
   */
  async startNewSession(userId, channelId, messageId = null) {
    const session = new CafeSession({ userId, channelId, messageId });
    this.prepareRound(session);
    await this.store.createSession(session);
    return session;
  }

  /**
   * สุ่มสร้างข้อมูล Customer, Order, และ Anomaly สำหรับรอบปัจจุบัน
   */
  prepareRound(session) {
    session.resetForNewRound();

    // สุ่มลูกค้าและออเดอร์
    const customer = generateCustomer();
    const order = generateOrder(customer);

    // สุ่มความผิดปกติ Anomaly (ซ่อนอยู่)
    const anomaly = rollAnomaly(session.round, session.anomalyLevel);

    // ถ้ามี Anomaly และมีการ Override Dialogue หรือ Order ให้ปรับปรุง
    if (anomaly) {
      if (anomaly.dialogueOverride) {
        customer.dialogue = anomaly.dialogueOverride;
      }
      if (anomaly.behaviorOverride) {
        customer.behavior = anomaly.behaviorOverride;
      }
      if (anomaly.orderOverride) {
        Object.assign(order, anomaly.orderOverride);
      }
    }

    session.currentCustomer = customer;
    session.currentOrder = order;
    session.currentAnomaly = anomaly;
  }

  /**
   * ทำการสังเกตการณ์จุดต่างๆ
   */
  async observeTarget(session, targetId) {
    const res = performObservation(session, targetId);
    if (res.success) {
      await this.store.updateSession(session);
    }
    return res;
  }

  /**
   * ตัดสินใจ (SERVE หรือ ANOMALY)
   */
  async makeDecision(session, action) {
    const res = processDecision(session, action);
    if (res.success) {
      await this.store.updateSession(session);
    }
    return res;
  }

  /**
   * ก้าวสู่รอบถัดไป หรือเปลี่ยนสถานะเป็น COMPLETED
   */
  async nextRound(session) {
    if (session.round >= session.maxRounds) {
      session.status = "COMPLETED";
      await this.store.updateSession(session);
      return { completed: true, session };
    }

    session.round += 1;
    this.prepareRound(session);
    await this.store.updateSession(session);
    return { completed: false, session };
  }

  /**
   * เริ่มกะใหม่ (เล่นต่อจาก Message เดิม)
   */
  async continueShift(session) {
    session.resetForNewShift();
    this.prepareRound(session);
    await this.store.updateSession(session);
    return session;
  }

  /**
   * ยกเลิก Session
   */
  async cancelSession(sessionId) {
    return await this.store.deleteSession(sessionId);
  }

  /**
   * ปรับเปลี่ยนส่วนผสมการชงเครื่องดื่ม
   */
  async cycleBrew(session, type) {
    if (type === "base") cycleBrewBase(session);
    else if (type === "temp") cycleBrewTemperature(session);
    else if (type === "sugar") cycleBrewSugar(session);
    else if (type === "topping") cycleBrewTopping(session);
    await this.store.updateSession(session);
    return session.currentBrew;
  }

  /**
   * รีเซ็ตแก้วที่กำลังชง
   */
  async resetBrew(session) {
    session.resetBrew();
    await this.store.updateSession(session);
    return session.currentBrew;
  }

  /**
   * คืน Payload ตามสถานะปัจจุบันของ Session
   */
  renderPayload(session) {
    switch (session.status) {
      case "ACTIVE":
        return buildCafeMainPayload(session);
      case "OBSERVING":
        return buildCafeObservationPayload(session);
      case "BREWING":
        return buildCafeBrewingPayload(session);
      case "RESULT":
        return buildCafeResultPayload(session);
      case "COMPLETED":
        return buildCafeCompletePayload(session);
      case "CANCELLED":
        return buildCafeCancelledPayload(session.userId);
      default:
        return buildCafeMainPayload(session);
    }
  }

  /**
   * คืน Payload พร้อม Attachment ไฟล์รูปภาพ Canvas ที่เกี่ยวข้อง
   */
  async renderMessageOptions(session) {
    const payload = this.renderPayload(session);
    const files = [];

    try {
      if (session.status === "ACTIVE") {
        const buffer = await generateCustomerSceneCanvas(session.currentCustomer, session);
        files.push(new AttachmentBuilder(buffer, { name: "customer_scene.png" }));
      } else if (session.status === "OBSERVING") {
        const lastEntry = session.observationHistory.length > 0 ? session.observationHistory[session.observationHistory.length - 1] : null;
        const targetId = lastEntry ? lastEntry.target : "table";
        const buffer = await generateObservationSceneCanvas(targetId, lastEntry, session);
        files.push(new AttachmentBuilder(buffer, { name: "observation_scene.png" }));
      } else if (session.status === "BREWING") {
        const buffer = await generateBrewCupCanvas(session.currentBrew, session.currentOrder);
        files.push(new AttachmentBuilder(buffer, { name: "brew_cup.png" }));
      } else if (session.status === "RESULT") {
        const buffer = await generateResultSceneCanvas(session);
        files.push(new AttachmentBuilder(buffer, { name: "result_scene.png" }));
      } else if (session.status === "COMPLETED") {
        const buffer = await generateShiftSummaryCanvas(session);
        files.push(new AttachmentBuilder(buffer, { name: "shift_summary.png" }));
      }
    } catch (err) {
      console.error("[cafe] Error generating canvas image:", err);
    }

    return {
      ...payload,
      files
    };
  }
}

module.exports = { CafeEngine };
