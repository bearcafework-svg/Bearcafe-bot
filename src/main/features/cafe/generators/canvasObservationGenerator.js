// src/features/cafe/generators/canvasObservationGenerator.js
// Generates Dynamic Observation Clue Scene Canvas using @napi-rs/canvas

const { createCanvas } = require("@napi-rs/canvas");
require("../../../utils/fontLoader");

/**
 * วาดภาพบรรยากาศการสำรวจเบาะแส 5 จุด
 * @param {string} targetId - จุดที่สำรวจ ('customer', 'order', 'table', 'clock', 'mirror')
 * @param {Object} entry - ผลลัพธ์การสำรวจ { label, text, hasClue }
 * @param {Object} session - ข้อมูล CafeSession
 * @returns {Buffer} - PNG Image Buffer
 */
async function generateObservationSceneCanvas(targetId = "table", entry = null, session = null) {
  const width = 560;
  const height = 300;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const hasClue = entry && entry.hasClue;

  // 1. พื้นหลังบรรยากาศสำรวจ
  const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 40, width / 2, height / 2, 350);
  if (hasClue) {
    bgGrad.addColorStop(0, "#2c1515"); // แดงสลัวเมื่อพบความผิดปกติ
    bgGrad.addColorStop(1, "#0d0606");
  } else {
    bgGrad.addColorStop(0, "#221913"); // น้ำตาลคาเฟ่อบอุ่น
    bgGrad.addColorStop(1, "#0f0a07");
  }
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // 2. วาดไอคอนและวัตถุตามจุดสำรวจ
  const centerX = width / 2;
  const centerY = 110;

  if (targetId === "mirror") {
    // กรอบกระจกโบราณ (Antique Mirror)
    ctx.strokeStyle = hasClue ? "#e53935" : "#ffd54f";
    ctx.lineWidth = 8;
    ctx.fillStyle = "#1a237e";
    ctx.beginPath();
    ctx.ellipse(centerX, centerY, 85, 75, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // เงาสะท้อนในกระจก
    ctx.fillStyle = hasClue ? "rgba(229, 57, 53, 0.4)" : "rgba(255, 255, 255, 0.2)";
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 10, 45, 50, 0, 0, Math.PI * 2);
    ctx.fill();

    // ลายสะท้อนกระจก
    ctx.strokeStyle = "rgba(255, 255, 255, 0.5)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(centerX - 40, centerY - 45);
    ctx.lineTo(centerX - 25, centerY - 60);
    ctx.moveTo(centerX + 35, centerY + 30);
    ctx.lineTo(centerX + 50, centerY + 45);
    ctx.stroke();
  } else if (targetId === "clock") {
    // นาฬิกาโบราณ (Antique Wall Clock)
    ctx.fillStyle = "#4e342e";
    ctx.strokeStyle = hasClue ? "#e53935" : "#ffb300";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.arc(centerX, centerY, 70, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // หน้าปัดนาฬิกา
    ctx.fillStyle = "#fff8e1";
    ctx.beginPath();
    ctx.arc(centerX, centerY, 58, 0, Math.PI * 2);
    ctx.fill();

    // ตัวเลขโรมันและขีดบอกเวลา
    ctx.fillStyle = "#212121";
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("XII", centerX, centerY - 42);
    ctx.fillText("III", centerX + 42, centerY);
    ctx.fillText("VI", centerX, centerY + 42);
    ctx.fillText("IX", centerX - 42, centerY);

    // เข็มนาฬิกา (ถ้า Anomaly เข็มจะหมุนประหลาด)
    ctx.strokeStyle = "#212121";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX + 25, centerY - 15);
    ctx.moveTo(centerX, centerY);
    ctx.lineTo(centerX - 10, centerY + 30);
    ctx.stroke();

    ctx.fillStyle = "#e53935";
    ctx.beginPath();
    ctx.arc(centerX, centerY, 4, 0, Math.PI * 2);
    ctx.fill();
  } else if (targetId === "order") {
    // ใบสั่งซื้อกาแฟ (Order Paper Ticket)
    ctx.fillStyle = "#fffde7";
    ctx.strokeStyle = hasClue ? "#e53935" : "#bcaaa4";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(centerX - 75, centerY - 65, 150, 130, 8);
    ctx.fill();
    ctx.stroke();

    // ลายเส้นตัวหนังสือในใบเสร็จ
    ctx.fillStyle = "#424242";
    ctx.font = 'bold 13px "Noto Sans Thai", sans-serif';
    ctx.textAlign = "center";
    ctx.fillText("☕ BEAR CAFÉ ORDER", centerX, centerY - 40);

    ctx.strokeStyle = "#9e9e9e";
    ctx.lineWidth = 2;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.moveTo(centerX - 50, centerY - 15 + i * 20);
      ctx.lineTo(centerX + 50, centerY - 15 + i * 20);
      ctx.stroke();
    }
  } else {
    // โต๊ะและเก้าอี้ (Table & Surroundings)
    ctx.fillStyle = "#5d4037";
    ctx.beginPath();
    ctx.ellipse(centerX, centerY + 35, 110, 35, 0, 0, Math.PI * 2);
    ctx.fill();

    // แก้วกาแฟบนโต๊ะ
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(centerX, centerY + 10, 24, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#3e2723";
    ctx.beginPath();
    ctx.arc(centerX, centerY + 10, 18, 0, Math.PI * 2);
    ctx.fill();
  }

  // 3. แบนเนอร์ด้านล่างบอกข้อความสำรวจ
  ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
  ctx.strokeStyle = hasClue ? "#e53935" : "#ffb300";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(25, height - 80, width - 50, 60, 8);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.font = 'bold 16px "Noto Sans Thai", sans-serif';
  ctx.fillStyle = hasClue ? "#ff8a80" : "#ffecb3";
  const headerText = entry ? entry.label : "🔎 กำลังสังเกตการณ์";
  ctx.fillText(headerText, 45, height - 58);

  ctx.font = '14px "Noto Sans Thai", sans-serif';
  ctx.fillStyle = "#e0e0e0";
  const clueStatus = hasClue ? "⚠️ พบเบาะแสความผิดปกติ!" : "✨ ทุกอย่างดูปกติดี";
  ctx.fillText(clueStatus, 45, height - 35);

  return canvas.toBuffer("image/png");
}

module.exports = {
  generateObservationSceneCanvas
};
