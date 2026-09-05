// src/features/cafe/generators/canvasResultGenerator.js
// Generates Dynamic Round Decision Result Scene Canvas using @napi-rs/canvas

const { createCanvas } = require("@napi-rs/canvas");
require("../../../utils/fontLoader");

/**
 * วาดภาพผลลัพธ์รอบการตัดสินใจ (Result Scene)
 * @param {Object} session - ข้อมูล CafeSession
 * @returns {Buffer} - PNG Image Buffer
 */
async function generateResultSceneCanvas(session) {
  const width = 560;
  const height = 280;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const result = session.lastDecision || { success: true, message: "" };

  const isSuccess = result.success;

  // 1. พื้นหลังผลลัพธ์ (เขียวอมทองเมื่อสำเร็จ / แดงเข้มเมื่อผิดพลาด)
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  if (isSuccess) {
    bgGrad.addColorStop(0, "#1b3320");
    bgGrad.addColorStop(1, "#0d1a10");
  } else {
    bgGrad.addColorStop(0, "#3b1717");
    bgGrad.addColorStop(1, "#1a0808");
  }
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // กรอบสีทองหรือแดง
  ctx.strokeStyle = isSuccess ? "#4caf50" : "#e53935";
  ctx.lineWidth = 3;
  ctx.strokeRect(12, 12, width - 24, height - 24);

  // 2. ไอคอนและหัวข้อ
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const titleIcon = isSuccess ? "✨" : "⚠️";
  const titleText = isSuccess ? "การตัดสินใจถูกต้อง!" : "เกิดข้อผิดพลาดในการสังเกต!";

  ctx.font = 'bold 24px "Noto Sans Thai", sans-serif';
  ctx.fillStyle = isSuccess ? "#a5d6a7" : "#ef9a9a";
  ctx.fillText(`${titleIcon} ${titleText}`, width / 2, 55);

  // 3. ข้อมูลสรุปตัวเลขเหรียญและสถานะ
  const boxY = 100;
  const boxW = 480;
  const boxH = 135;

  ctx.fillStyle = "rgba(0, 0, 0, 0.4)";
  ctx.strokeStyle = isSuccess ? "rgba(76, 175, 80, 0.4)" : "rgba(229, 57, 53, 0.4)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect((width - boxW) / 2, boxY, boxW, boxH, 10);
  ctx.fill();
  ctx.stroke();

  // ข้อมูลแถว 1: Coins & Tokens
  ctx.font = '17px "Noto Sans Thai", sans-serif';
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`💰 เหรียญสะสม: ${session.coins} Coins  ︲  👁️ Tokens: ${session.anomalyTokens} ชิ้น`, width / 2, boxY + 40);

  // ข้อมูลแถว 2: Trust & Reality
  ctx.fillStyle = "#d7ccc8";
  ctx.fillText(`❤️ Trust: ${session.trust}%  ︲  🌀 Reality: ${session.reality}%`, width / 2, boxY + 80);

  return canvas.toBuffer("image/png");
}

module.exports = {
  generateResultSceneCanvas
};
