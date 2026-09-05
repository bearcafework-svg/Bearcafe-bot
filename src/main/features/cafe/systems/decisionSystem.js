// src/features/cafe/systems/decisionSystem.js
// Decision processing for Bear Café

const { calculateServeReward, calculateAnomalyDetection } = require("./rewardSystem");
const { applyEscalation } = require("./escalationSystem");
const { evaluateBrewMatch } = require("./brewingSystem");

function processDecision(session, action) {
  const isAnomaly = session.currentAnomaly !== null;
  let outcome = null;

  if (action === "SERVE") {
    const evaluation = evaluateBrewMatch(session.currentOrder, session.currentBrew);
    outcome = calculateServeReward(isAnomaly, evaluation);
    if (!outcome.success) {
      applyEscalation(session, true);
    }
  } else if (action === "ANOMALY") {
    outcome = calculateAnomalyDetection(session.currentAnomaly);
    if (outcome.success) {
      session.correctDetections += 1;
      if (session.currentAnomaly && !session.discoveredAnomalies.includes(session.currentAnomaly.id)) {
        session.discoveredAnomalies.push(session.currentAnomaly.id);
      }
    } else {
      applyEscalation(session, true);
    }
  } else {
    return { success: false, error: "Action ไม่ถูกต้อง" };
  }

  // Apply state deltas
  session.coins = Math.max(0, session.coins + outcome.coinsDelta);
  session.anomalyTokens = Math.max(0, session.anomalyTokens + outcome.tokensDelta);
  session.reality = Math.min(100, Math.max(0, session.reality + outcome.realityDelta));
  session.trust = Math.min(100, Math.max(0, session.trust + outcome.trustDelta));

  session.lastDecision = {
    action: action,
    ...outcome
  };

  session.status = "RESULT";
  return { success: true, outcome: session.lastDecision };
}

module.exports = {
  processDecision
};
