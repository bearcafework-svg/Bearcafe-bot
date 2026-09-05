// src/features/cafe/generators/canvasBrewGenerator.js
// Dynamic Beverage Cup Canvas Generator for Bear Café

const { createCanvas } = require("@napi-rs/canvas");
require("../../../utils/fontLoader");
const { evaluateBrewMatch } = require("../systems/brewingSystem");

const DRINK_COLORS = {
  long_coffee: { top: "#5d4037", bottom: "#2b170c", crema: "#d7ccc8" },
  comfort_cocoa: { top: "#4e342e", bottom: "#1a0f0a", crema: "#8d6e63" },
  warm_tea: { top: "#f57c00", bottom: "#b23c00", crema: "#ffe082" },
  forest_matcha: { top: "#4caf50", bottom: "#1b5e20", crema: "#a5d6a7" },
  honey_milk: { top: "#fff9c4", bottom: "#ffb300", crema: "#ffffff" },
  caramel_latte: { top: "#d7ccc8", bottom: "#6d4c41", crema: "#ffe082" }
};

/**
 * สร้างภาพแก้วเครื่องดื่มที่กำลังชงแบบ Real-time
 * @param {Object} brew - ข้อมูล currentBrew
 * @param {Object} order - ข้อมูล currentOrder (สำหรับเช็ค Perfect Match)
 * @returns {Buffer} - PNG Image Buffer
 */
async function generateBrewCupCanvas(brew, order = null) {
  const width = 540;
  const height = 320;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // ── 1. วาดพื้นหลังคาเฟ่บรรยากาศอบอุ่น ────────────────────────────────
  const bgGrad = ctx.createRadialGradient(width / 2, height / 2, 50, width / 2, height / 2, 350);
  bgGrad.addColorStop(0, "#2d2017");
  bgGrad.addColorStop(1, "#140e0a");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // วาดพื้นโต๊ะไม้ด้านล่าง
  const tableGrad = ctx.createLinearGradient(0, height - 70, 0, height);
  tableGrad.addColorStop(0, "#3e2723");
  tableGrad.addColorStop(1, "#271610");
  ctx.fillStyle = tableGrad;
  ctx.fillRect(0, height - 70, width, 70);

  // เส้นขอบโต๊ะไม้
  ctx.strokeStyle = "#5d4037";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, height - 70);
  ctx.lineTo(width, height - 70);
  ctx.stroke();

  // แสงเงาตกกระทบใต้แก้ว
  ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
  ctx.beginPath();
  ctx.ellipse(140, height - 60, 65, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  // ── 2. วาดแก้วเครื่องดื่ม ──────────────────────────────────────────
  const colors = DRINK_COLORS[brew.itemId] || DRINK_COLORS.long_coffee;
  const cupX = 85;
  const cupY = 100;
  const cupW = 110;
  const cupH = 150;

  const isHot = brew.temperature.includes("ร้อน");
  const isIced = brew.temperature.includes("เย็น");
  const isFrappe = brew.temperature.includes("ปั่น");

  // A. ตัวแก้ว (Cup Body)
  if (isHot) {
    // หูจับแก้วเซรามิก
    ctx.strokeStyle = "#efebe9";
    ctx.lineWidth = 14;
    ctx.beginPath();
    ctx.arc(cupX + cupW + 8, cupY + cupH / 2, 28, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    // แก้วเซรามิกสีครีม
    ctx.fillStyle = "#f5f5f5";
    ctx.beginPath();
    ctx.moveTo(cupX, cupY);
    ctx.lineTo(cupX + cupW, cupY);
    ctx.quadraticCurveTo(cupX + cupW - 5, cupY + cupH, cupX + cupW - 20, cupY + cupH);
    ctx.lineTo(cupX + 20, cupY + cupH);
    ctx.quadraticCurveTo(cupX + 5, cupY + cupH, cupX, cupY);
    ctx.fill();

    // เครื่องดื่มในแก้ว
    const liquidGrad = ctx.createLinearGradient(cupX, cupY + 10, cupX, cupY + cupH - 10);
    liquidGrad.addColorStop(0, colors.top);
    liquidGrad.addColorStop(1, colors.bottom);
    ctx.fillStyle = liquidGrad;
    ctx.beginPath();
    ctx.ellipse(cupX + cupW / 2, cupY + 18, cupW / 2 - 8, 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // ไอควันความร้อนลอยขึ้น (Steam Swirls)
    ctx.strokeStyle = "rgba(255, 255, 255, 0.4)";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    for (let i = 0; i < 3; i++) {
      const sx = cupX + 30 + i * 25;
      ctx.beginPath();
      ctx.moveTo(sx, cupY - 5);
      ctx.bezierCurveTo(sx - 10, cupY - 30, sx + 10, cupY - 50, sx, cupY - 75);
      ctx.stroke();
    }
  } else {
    // แก้วใสทรงสูง (Iced & Frappe)
    const glassGrad = ctx.createLinearGradient(cupX, cupY, cupX + cupW, cupY);
    glassGrad.addColorStop(0, "rgba(255, 255, 255, 0.3)");
    glassGrad.addColorStop(0.5, "rgba(255, 255, 255, 0.1)");
    glassGrad.addColorStop(1, "rgba(255, 255, 255, 0.3)");

    // ของเหลวในแก้ว
    const liquidGrad = ctx.createLinearGradient(cupX, cupY + 20, cupX, cupY + cupH);
    liquidGrad.addColorStop(0, colors.top);
    liquidGrad.addColorStop(1, colors.bottom);
    ctx.fillStyle = liquidGrad;
    ctx.beginPath();
    ctx.moveTo(cupX + 5, cupY + 20);
    ctx.lineTo(cupX + cupW - 5, cupY + 20);
    ctx.lineTo(cupX + cupW - 18, cupY + cupH - 5);
    ctx.lineTo(cupX + 18, cupY + cupH - 5);
    ctx.closePath();
    ctx.fill();

    // ก้อนน้ำแข็ง (Iced)
    if (isIced) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.35)";
      ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
      ctx.lineWidth = 1.5;

      const icePositions = [
        { x: cupX + 25, y: cupY + 40 },
        { x: cupX + 60, y: cupY + 55 },
        { x: cupX + 35, y: cupY + 85 }
      ];
      icePositions.forEach((ice) => {
        ctx.fillRect(ice.x, ice.y, 24, 24);
        ctx.strokeRect(ice.x, ice.y, 24, 24);
      });
    }

    // เปลือกแก้วใส
    ctx.fillStyle = glassGrad;
    ctx.strokeStyle = "rgba(255, 255, 255, 0.6)";
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cupX, cupY);
    ctx.lineTo(cupX + cupW, cupY);
    ctx.lineTo(cupX + cupW - 15, cupY + cupH);
    ctx.lineTo(cupX + 15, cupY + cupH);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // หลอดดูดเครื่องดื่ม
    ctx.strokeStyle = "#e57373";
    ctx.lineWidth = 6;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(cupX + cupW / 2 + 15, cupY + cupH - 20);
    ctx.lineTo(cupX + cupW + 15, cupY - 35);
    ctx.stroke();
  }

  // B. ท็อปปิ้ง (Topping Layer)
  const topX = cupX + cupW / 2;
  const topY = cupY + 12;

  if (brew.topping.includes("วิปครีม")) {
    // โดมวิปครีมสีขาวนุ่ม
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(topX, topY - 15, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(topX - 18, topY - 5, 20, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(topX + 18, topY - 5, 20, 0, Math.PI * 2);
    ctx.fill();

    // หูน้องหมีช็อกโกแลต 🐻
    ctx.fillStyle = "#3e2723";
    ctx.beginPath();
    ctx.arc(topX - 25, topY - 45, 12, 0, Math.PI * 2);
    ctx.arc(topX + 25, topY - 45, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#d7ccc8";
    ctx.beginPath();
    ctx.arc(topX - 25, topY - 45, 6, 0, Math.PI * 2);
    ctx.arc(topX + 25, topY - 45, 6, 0, Math.PI * 2);
    ctx.fill();
  } else if (brew.topping.includes("น้ำผึ้ง")) {
    // ลายราดน้ำผึ้งสีทอง
    ctx.strokeStyle = "#ffb300";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(topX - 35, topY - 5);
    ctx.quadraticCurveTo(topX - 15, topY + 10, topX, topY - 5);
    ctx.quadraticCurveTo(topX + 15, topY + 10, topX + 35, topY - 5);
    ctx.stroke();
  } else if (brew.topping.includes("ฟองนม")) {
    // ฟองนมหนานุ่ม
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    ctx.ellipse(topX, topY, 45, 16, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (brew.topping.includes("ช็อกโกแลตชิพ")) {
    // เกล็ดช็อกโกแลต
    ctx.fillStyle = "#2c1810";
    const chips = [
      { x: topX - 20, y: topY - 2 },
      { x: topX, y: topY + 4 },
      { x: topX + 18, y: topY - 3 },
      { x: topX - 8, y: topY - 6 }
    ];
    chips.forEach((c) => {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // ── 3. วาดข้อมูล UI ฝั่งขวา (Text Info & Badges) ────────────────────
  const textX = 240;

  // หัวข้อแผงชง
  ctx.font = 'bold 15px "Noto Sans Thai", sans-serif';
  ctx.fillStyle = "#ffb300";
  ctx.fillText("☕ BEAR CAFÉ ₊ BREWING STATION", textX, 48);

  // ชื่อเครื่องดื่มขนาดใหญ่
  ctx.font = 'bold 26px "Noto Sans Thai", sans-serif';
  ctx.fillStyle = "#ffffff";
  ctx.fillText(brew.itemName, textX, 84);

  // ข้อมูลส่วนผสม 3 แถว
  ctx.font = '16px "Noto Sans Thai", sans-serif';
  ctx.fillStyle = "#d7ccc8";
  ctx.fillText(`🌡️ อุณหภูมิ: ${brew.temperature}`, textX, 122);
  ctx.fillText(`🍬 ความหวาน: ${brew.sugar}`, textX, 154);
  ctx.fillText(`🍯 ท็อปปิ้ง: ${brew.topping}`, textX, 186);

  // ป้ายสถานะความแม่นยำของสูตร (Recipe Accuracy Badge)
  if (order) {
    const evalResult = evaluateBrewMatch(order, brew);
    const isPerfect = evalResult.isPerfectMatch;

    const badgeY = 225;
    const badgeW = 265;
    const badgeH = 46;

    // กรอบ Badge
    ctx.fillStyle = isPerfect ? "rgba(46, 125, 50, 0.3)" : "rgba(230, 81, 0, 0.3)";
    ctx.strokeStyle = isPerfect ? "#4caf50" : "#ff9800";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(textX, badgeY, badgeW, badgeH, 10);
    ctx.fill();
    ctx.stroke();

    // ข้อความใน Badge
    ctx.font = 'bold 17px "Noto Sans Thai", sans-serif';
    ctx.fillStyle = isPerfect ? "#a5d6a7" : "#ffcc80";
    const badgeText = isPerfect ? "✨ สูตรตรงเป๊ะ 100% (พร้อมเสิร์ฟ!)" : `⚠️ ความถูกต้องของสูตร: ${evalResult.matchScore}%`;
    ctx.fillText(badgeText, textX + 15, badgeY + 29);
  }

  return canvas.toBuffer("image/png");
}

module.exports = {
  generateBrewCupCanvas
};
