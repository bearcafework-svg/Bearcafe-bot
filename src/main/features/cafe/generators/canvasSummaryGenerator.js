// src/features/cafe/generators/canvasSummaryGenerator.js
// Shift Completion Certificate Canvas Generator for Bear Café

const { createCanvas } = require("@napi-rs/canvas");
require("../../../utils/fontLoader");
const { calculateShiftSummary } = require("../systems/rewardSystem");

/**
 * สร้างภาพการ์ดประเมินผลกะดึก (Shift Summary Certificate)
 * @param {Object} session - ข้อมูล CafeSession
 * @returns {Buffer} - PNG Image Buffer
 */
async function generateShiftSummaryCanvas(session) {
  const width = 560;
  const height = 340;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  const summary = calculateShiftSummary(session);

  // 1. พื้นหลังการ์ดสไตล์กระดาษวินเทจและขอบทอง
  const bgGrad = ctx.createLinearGradient(0, 0, width, height);
  bgGrad.addColorStop(0, "#231a14");
  bgGrad.addColorStop(1, "#150e09");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // กรอบสีทองประดับขอบ
  ctx.strokeStyle = "#ffb300";
  ctx.lineWidth = 3;
  ctx.strokeRect(15, 15, width - 30, height - 30);

  ctx.strokeStyle = "#8d6e63";
  ctx.lineWidth = 1;
  ctx.strokeRect(20, 20, width - 40, height - 40);

  // 2. ส่วนหัวใบประเมิน
  ctx.font = 'bold 15px "Noto Sans Thai", sans-serif';
  ctx.fillStyle = "#ffb300";
  ctx.fillText("☕ BEAR CAFÉ ₊ SHIFT EVALUATION REPORT", 40, 52);

  ctx.font = 'bold 22px "Noto Sans Thai", sans-serif';
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`ใบประเมินผลงานกะดึก — 5 Rounds Completed`, 40, 84);

  // 3. รายละเอียดสถิติฝั่งซ้าย
  ctx.font = '16px "Noto Sans Thai", sans-serif';
  ctx.fillStyle = "#d7ccc8";

  const statY = 125;
  const lineHeight = 30;

  ctx.fillText(`💰 เหรียญที่ได้รับทั้งหมด:`, 40, statY);
  ctx.fillStyle = "#ffeb3b";
  ctx.font = 'bold 17px "Noto Sans Thai", sans-serif';
  ctx.fillText(`+${summary.finalCoins} Coins`, 225, statY);

  ctx.font = '16px "Noto Sans Thai", sans-serif';
  ctx.fillStyle = "#d7ccc8";
  ctx.fillText(`👁️ Anomaly Tokens:`, 40, statY + lineHeight);
  ctx.fillStyle = "#81d4fa";
  ctx.font = 'bold 17px "Noto Sans Thai", sans-serif';
  ctx.fillText(`+${summary.anomalyTokens} ชิ้น`, 225, statY + lineHeight);

  ctx.font = '16px "Noto Sans Thai", sans-serif';
  ctx.fillStyle = "#d7ccc8";
  ctx.fillText(`🎯 ตรวจจับความผิดปกติ:`, 40, statY + lineHeight * 2);
  ctx.fillStyle = "#a5d6a7";
  ctx.font = 'bold 17px "Noto Sans Thai", sans-serif';
  ctx.fillText(`${summary.correctDetections} ครั้ง`, 225, statY + lineHeight * 2);

  ctx.font = '16px "Noto Sans Thai", sans-serif';
  ctx.fillStyle = "#d7ccc8";
  ctx.fillText(`❌ ข้อผิดพลาดที่เกิดขึ้น:`, 40, statY + lineHeight * 3);
  ctx.fillStyle = summary.mistakes === 0 ? "#a5d6a7" : "#ef9a9a";
  ctx.font = 'bold 17px "Noto Sans Thai", sans-serif';
  ctx.fillText(`${summary.mistakes} ครั้ง`, 225, statY + lineHeight * 3);

  ctx.font = '16px "Noto Sans Thai", sans-serif';
  ctx.fillStyle = "#d7ccc8";
  ctx.fillText(`❤️ ความไว้ใจคงเหลือ (Trust):`, 40, statY + lineHeight * 4);
  ctx.fillStyle = "#ff8a80";
  ctx.font = 'bold 17px "Noto Sans Thai", sans-serif';
  ctx.fillText(`${summary.trust}%`, 225, statY + lineHeight * 4);

  // 4. ตรายางประทับ Grade (Stamp Badge) ฝั่งขวา
  const stampX = 425;
  const stampY = 190;

  ctx.save();
  ctx.translate(stampX, stampY);
  ctx.rotate(-12 * (Math.PI / 180)); // หมุนเอียง 12 องศาให้เหมือนตรายางประทับจริง

  const gradeColors = {
    S: { stroke: "#ffd700", fill: "rgba(255, 215, 0, 0.15)", text: "#ffd700" },
    A: { stroke: "#4caf50", fill: "rgba(76, 175, 80, 0.15)", text: "#81c784" },
    B: { stroke: "#29b6f6", fill: "rgba(41, 182, 246, 0.15)", text: "#4fc3f7" },
    C: { stroke: "#ff9800", fill: "rgba(255, 152, 0, 0.15)", text: "#ffb74d" },
    F: { stroke: "#e53935", fill: "rgba(229, 57, 53, 0.15)", text: "#ef5350" }
  };

  const gColor = gradeColors[summary.rating] || gradeColors.B;

  // วงแหวนตรายาง
  ctx.strokeStyle = gColor.stroke;
  ctx.lineWidth = 5;
  ctx.fillStyle = gColor.fill;
  ctx.beginPath();
  ctx.arc(0, 0, 68, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, 60, 0, Math.PI * 2);
  ctx.stroke();

  // ตัวอักษร Grade ขนาดใหญ่
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = 'bold 48px "Noto Sans Thai", sans-serif';
  ctx.fillStyle = gColor.text;
  ctx.fillText(summary.rating, 0, -8);

  // คำว่า GRADE ด้านบน และ PASSED / FAILED ด้านล่าง
  ctx.font = 'bold 13px "Noto Sans Thai", sans-serif';
  ctx.fillText("GRADE", 0, -42);
  ctx.fillText(summary.rating === "F" ? "FAILED" : "VERIFIED", 0, 36);

  ctx.restore();

  return canvas.toBuffer("image/png");
}

module.exports = {
  generateShiftSummaryCanvas
};
