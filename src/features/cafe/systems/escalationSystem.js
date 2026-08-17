// src/features/cafe/systems/escalationSystem.js
// Escalation System สำหรับปรับระดับความผิดปกติและผลกระทบของข้อผิดพลาด

function applyEscalation(session, isMistake) {
  if (!isMistake) return;

  // เพิ่มจำนวนข้อผิดพลาด
  session.mistakes += 1;

  if (session.mistakes === 1) {
    session.reality = Math.max(0, session.reality - 5);
  } else if (session.mistakes === 2) {
    session.anomalyLevel = Math.min(3, session.anomalyLevel + 1);
    session.reality = Math.max(0, session.reality - 10);
  } else if (session.mistakes >= 3) {
    session.anomalyLevel = 3;
    session.reality = Math.max(0, session.reality - 15);
  }
}

module.exports = {
  applyEscalation
};
