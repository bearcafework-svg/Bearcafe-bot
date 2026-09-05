// src/features/cafe/systems/rewardSystem.js
// Reward and Rating calculation for Bear Café

function randomInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function calculateServeReward(isAnomaly, evaluation = null) {
  if (isAnomaly) {
    // เสิร์ฟ Anomaly ถือว่าผิดพลาด: โดนหักเหรียญและ Reality ลด
    const penaltyCoins = randomInt(20, 50);
    return {
      coinsDelta: -penaltyCoins,
      tokensDelta: 0,
      realityDelta: -10,
      trustDelta: -5,
      success: false,
      message: `😱 **คุณเผลอเสิร์ฟให้สิ่งผิดปกติ (Anomaly)!**\nร้านเกิดความปั่นป่วน เหรียญลดลง -${penaltyCoins} 💰 และ Reality -10% 🌀`
    };
  } else {
    // เสิร์ฟลูกค้าปกติ
    const isPerfect = evaluation ? evaluation.isPerfectMatch : true;
    if (isPerfect) {
      const rewardCoins = randomInt(35, 65); // โบนัสชงเป๊ะ
      return {
        coinsDelta: rewardCoins,
        tokensDelta: 0,
        realityDelta: 0,
        trustDelta: +4,
        success: true,
        message: `☕ **เสิร์ฟเครื่องดื่มเรียบร้อย! ✨ (Perfect Brew 100%)**\nคุณชงได้ตรงตามที่ลูกค้าสั่งเป๊ะทุกประการ! ลูกค้าประทับใจมาก\nได้รับ +${rewardCoins} Coins 💰 (รวม Perfect Bonus)`
      };
    } else {
      const rewardCoins = randomInt(10, 25);
      const mismatchText = evaluation.mismatches.map((m) => `- ${m}`).join("\n");
      return {
        coinsDelta: rewardCoins,
        tokensDelta: 0,
        realityDelta: 0,
        trustDelta: -2,
        success: true,
        message: `☕ **เสิร์ฟเครื่องดื่มเรียบร้อย (สูตรคลาดเคลื่อนเล็กน้อย)**\n${mismatchText}\nลูกค้าดื่มแบบงงๆ นิดหน่อย ได้รับ +${rewardCoins} Coins 💰`
      };
    }
  }
}

function calculateAnomalyDetection(anomaly) {
  if (anomaly) {
    // ตรวจจับ Anomaly ถูกต้อง
    let coins = 0;
    let tokens = 1;

    if (anomaly.tier === "CRITICAL") {
      coins = randomInt(250, 500);
      tokens = 2;
    } else if (anomaly.tier === "MAJOR") {
      coins = randomInt(100, 250);
    } else {
      coins = randomInt(50, 150);
    }

    return {
      coinsDelta: coins,
      tokensDelta: tokens,
      realityDelta: +5,
      trustDelta: +5,
      success: true,
      anomalyName: anomaly.name,
      anomalyId: anomaly.id,
      anomalyTier: anomaly.tier,
      message: `🚨 **ตรวจจับสิ่งผิดปกติถูกต้อง!**\nคุณตรวจพบ **[${anomaly.tier}] ${anomaly.name}** และควบคุมสถานการณ์ได้ทันท่วงที!\nได้รับ +${coins} Coins 💰 และ +${tokens} Anomaly Token 👁️`
    };
  } else {
    // กล่าวหาลูกค้าปกติผิดคน (False Accusation)
    return {
      coinsDelta: 0,
      tokensDelta: 0,
      realityDelta: 0,
      trustDelta: -10,
      success: false,
      message: `⚠️ **กล่าวหาลูกค้าผิดคน!**\nลูกค้าคนนี้คือลูกค้าปกติทั่วไป ทำให้ลูกค้าไม่พอใจและเดินออกจากร้านไป...\nความเชื่อมั่น Trust ลดลง -10% ❤️`
    };
  }
}

function calculateShiftSummary(session) {
  const isPerfect = session.mistakes === 0;
  const perfectBonus = isPerfect ? 100 : 0;
  const finalCoins = Math.max(0, session.coins + perfectBonus);

  let rating = "B";
  let ratingTitle = "บาริสต้าฝึกหัด";

  if (session.reality <= 0 || session.trust <= 0 || session.mistakes >= 4) {
    rating = "F";
    ratingTitle = "ถูกมิติกลืนกิน / โดนไล่ออก";
  } else if (session.mistakes === 0) {
    rating = "S";
    ratingTitle = "บาริสต้าผู้พิทักษ์มิติ (Master Barista)";
  } else if (session.mistakes === 1) {
    rating = "A";
    ratingTitle = "บาริสต้ามือโปร (Senior Barista)";
  } else if (session.mistakes === 2) {
    rating = "B";
    ratingTitle = "บาริสต้ามาตรฐาน (Regular Barista)";
  } else {
    rating = "C";
    ratingTitle = "บาริสต้ามือใหม่ (Junior Barista)";
  }

  return {
    isPerfect,
    perfectBonus,
    finalCoins,
    rating,
    ratingTitle,
    correctDetections: session.correctDetections,
    mistakes: session.mistakes,
    anomalyTokens: session.anomalyTokens,
    reality: session.reality,
    trust: session.trust
  };
}

module.exports = {
  calculateServeReward,
  calculateAnomalyDetection,
  calculateShiftSummary
};
