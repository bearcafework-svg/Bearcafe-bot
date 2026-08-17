// src/features/cafe/cafeSession.js
// Data model for Bear Café in-memory game session

class CafeSession {
  constructor({ userId, channelId, messageId = null, sessionId = null }) {
    this.sessionId = sessionId || `cafe_${userId}_${Date.now()}`;
    this.userId = userId;
    this.channelId = channelId;
    this.messageId = messageId;

    this.round = 1;
    this.maxRounds = 5;

    this.coins = 0;
    this.anomalyTokens = 0;

    this.mistakes = 0;
    this.correctDetections = 0;

    this.anomalyLevel = 1;
    this.reality = 100;
    this.trust = 100;

    this.currentCustomer = null;
    this.currentOrder = null;
    this.currentAnomaly = null; // null if Normal customer, or Anomaly object

    this.observationsUsed = 0;
    this.observationsLimit = 3;
    this.observationHistory = []; // list of { target, label, text, hasClue }

    this.discoveredAnomalies = [];
    this.lastDecision = null; // { action: 'SERVE' | 'ANOMALY', success: boolean, message: string, coinsDelta, tokensDelta, realityDelta, trustDelta }

    this.status = "ACTIVE"; // 'ACTIVE' | 'OBSERVING' | 'BREWING' | 'RESULT' | 'COMPLETED' | 'CANCELLED'
    this.createdAt = Date.now();
    this.updatedAt = Date.now();

    this.isProcessing = false; // anti double-click lock

    this.resetBrew();
  }

  resetBrew() {
    this.currentBrew = {
      itemId: "long_coffee",
      itemName: "กาแฟคุยยาว",
      icon: "☕",
      temperature: "ร้อน (Hot)",
      sugar: "หวานปกติ (100%)",
      topping: "ไม่มี (None)"
    };
  }

  resetForNewRound() {
    this.observationsUsed = 0;
    this.observationHistory = [];
    this.lastDecision = null;
    this.status = "ACTIVE";
    this.isProcessing = false;
    this.resetBrew();
    this.updatedAt = Date.now();
  }

  resetForNewShift() {
    this.round = 1;
    this.coins = 0;
    this.anomalyTokens = 0;
    this.mistakes = 0;
    this.correctDetections = 0;
    this.anomalyLevel = 1;
    this.reality = 100;
    this.trust = 100;
    this.observationsUsed = 0;
    this.observationHistory = [];
    this.discoveredAnomalies = [];
    this.lastDecision = null;
    this.status = "ACTIVE";
    this.isProcessing = false;
    this.createdAt = Date.now();
    this.updatedAt = Date.now();
  }
}

module.exports = { CafeSession };
