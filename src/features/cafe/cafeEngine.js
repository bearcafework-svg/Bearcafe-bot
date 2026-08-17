// src/features/cafe/cafeEngine.js
// Game Engine สำหรับจัดการสถานะและลอจิกของ Bear Café

const { CafeSession } = require("./cafeSession");
const { MemoryCafeSessionStore } = require("./stores/memoryCafeSessionStore");
const { generateCustomer } = require("./generators/customerGenerator");
const { generateOrder } = require("./generators/orderGenerator");
const { rollAnomaly } = require("./generators/anomalyGenerator");
const { performObservation } = require("./systems/observationSystem");
const { processDecision } = require("./systems/decisionSystem");

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
}

module.exports = { CafeEngine };
