// src/features/cafe/generators/canvasCustomerGenerator.js
// Generates the Main Customer Scene Canvas using @napi-rs/canvas

const { createCanvas } = require("@napi-rs/canvas");
require("../../../utils/fontLoader");

const BEAR_STYLES = {
  brown_bear: { body: "#6d4c41", snout: "#d7ccc8", innerEar: "#a1887f", accessory: "#43a047", accessoryType: "scarf" },
  polar_bear: { body: "#eceff1", snout: "#cfd8dc", innerEar: "#b0bec5", accessory: "#0288d1", accessoryType: "scarf" },
  panda_bear: { body: "#fafafa", snout: "#f5f5f5", innerEar: "#212121", patch: "#212121", accessoryType: "bamboo" },
  grizzly_bear: { body: "#4e342e", snout: "#bcaaa4", innerEar: "#8d6e63", accessory: "#ef6c00", accessoryType: "backpack" },
  spectacled_bear: { body: "#37474f", snout: "#cfd8dc", innerEar: "#78909c", glasses: "#ffd54f", accessoryType: "glasses" },
  sun_bear: { body: "#263238", snout: "#ffb74d", innerEar: "#455a64", chestPatch: "#ffa000", accessoryType: "sun_patch" }
};

/**
 * วาดภาพบรรยากาศคาเฟ่กะดึกพร้อมลูกค้าหมีที่มาเยือน
 * @param {Object} customer - ข้อมูลลูกค้า
 * @param {Object} session - ข้อมูล CafeSession (สำหรับวาด Anomaly Effect หากมี)
 * @returns {Buffer} - PNG Image Buffer
 */
async function generateCustomerSceneCanvas(customer, session) {
  const width = 560;
  const height = 320;

  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  const isAnomaly = session.currentAnomaly !== null;
  const bearStyle = BEAR_STYLES[customer.id] || BEAR_STYLES.brown_bear;

  // ── 1. วาดบรรยากาศร้านคาเฟ่กะดึก (Café Atmosphere Background) ──────────
  const bgGrad = ctx.createRadialGradient(width / 2, height / 2 - 40, 60, width / 2, height / 2, 380);
  if (isAnomaly && session.mistakes >= 1) {
    bgGrad.addColorStop(0, "#2a1515"); // โทนลึกลับปนแดงเมื่อมีความผิดปกติ
    bgGrad.addColorStop(1, "#0f0808");
  } else {
    bgGrad.addColorStop(0, "#2c1e16"); // โทนอบอุ่นยามค่ำคืน
    bgGrad.addColorStop(1, "#120b08");
  }
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // หน้าต่างร้านด้านหลังมองเห็นท้องฟ้ายามค่ำคืนและดวงดาว
  const winX = 340;
  const winY = 30;
  const winW = 180;
  const winH = 140;

  ctx.fillStyle = "#090d16";
  ctx.beginPath();
  ctx.roundRect(winX, winY, winW, winH, 12);
  ctx.fill();

  // พระจันทร์และดวงดาวนอกหน้าต่าง
  ctx.fillStyle = "#fff9c4";
  ctx.beginPath();
  ctx.arc(winX + winW - 40, winY + 45, 18, 0, Math.PI * 2);
  ctx.fill();

  // ดวงดาวระยิบระยับ
  ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
  const stars = [
    { x: winX + 30, y: winY + 30 },
    { x: winX + 70, y: winY + 60 },
    { x: winX + 45, y: winY + 90 },
    { x: winX + 110, y: winY + 40 }
  ];
  stars.forEach((s) => {
    ctx.fillRect(s.x, s.y, 2.5, 2.5);
  });

  // กรอบหน้าต่างไม้
  ctx.strokeStyle = "#4e342e";
  ctx.lineWidth = 6;
  ctx.strokeRect(winX, winY, winW, winH);
  ctx.beginPath();
  ctx.moveTo(winX + winW / 2, winY);
  ctx.lineTo(winX + winW / 2, winY + winH);
  ctx.moveTo(winX, winY + winH / 2);
  ctx.lineTo(winX + winW, winY + winH / 2);
  ctx.stroke();

  // โคมไฟอบอุ่นห้อยจากเพดาน
  ctx.strokeStyle = "#ffd54f";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(180, 0);
  ctx.lineTo(180, 45);
  ctx.stroke();

  // แสงไฟนวลตา
  const lampGrad = ctx.createRadialGradient(180, 55, 5, 180, 55, 85);
  lampGrad.addColorStop(0, "rgba(255, 213, 79, 0.4)");
  lampGrad.addColorStop(1, "rgba(255, 213, 79, 0)");
  ctx.fillStyle = lampGrad;
  ctx.beginPath();
  ctx.arc(180, 55, 85, 0, Math.PI * 2);
  ctx.fill();

  // ตัวโคมไฟ
  ctx.fillStyle = "#ffb300";
  ctx.beginPath();
  ctx.arc(180, 48, 14, Math.PI, 0);
  ctx.closePath();
  ctx.fill();

  // ── 2. วาดลูกค้าหมี (Bear Customer Character) ──────────────────────
  const bearX = 180;
  const bearY = 195;

  // เงาใต้ตัวหมี (ถ้าเป็น Anomaly missing_shadow จะไม่วาดเงา!)
  const hasShadow = !(isAnomaly && session.currentAnomaly?.id === "missing_shadow");
  if (hasShadow) {
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.beginPath();
    ctx.ellipse(bearX, height - 40, 80, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // ตัวหมี (Body)
  ctx.fillStyle = bearStyle.body;
  ctx.beginPath();
  ctx.ellipse(bearX, bearY + 45, 65, 55, 0, 0, Math.PI * 2);
  ctx.fill();

  // หูหมี (Ears)
  ctx.beginPath();
  ctx.arc(bearX - 45, bearY - 45, 22, 0, Math.PI * 2);
  ctx.arc(bearX + 45, bearY - 45, 22, 0, Math.PI * 2);
  ctx.fill();

  // ใบหูด้านใน
  ctx.fillStyle = bearStyle.innerEar || "#bcaaa4";
  ctx.beginPath();
  ctx.arc(bearX - 45, bearY - 45, 12, 0, Math.PI * 2);
  ctx.arc(bearX + 45, bearY - 45, 12, 0, Math.PI * 2);
  ctx.fill();

  // หัวหมี (Head)
  ctx.fillStyle = bearStyle.body;
  ctx.beginPath();
  ctx.arc(bearX, bearY, 52, 0, Math.PI * 2);
  ctx.fill();

  // จุดเด่นเฉพาะสายพันธุ์ (Panda eye patches / Sun bear patch)
  if (bearStyle.patch) {
    ctx.fillStyle = bearStyle.patch;
    ctx.beginPath();
    ctx.ellipse(bearX - 22, bearY - 8, 15, 18, -0.2, 0, Math.PI * 2);
    ctx.ellipse(bearX + 22, bearY - 8, 15, 18, 0.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // จมูกและปาก (Snout)
  ctx.fillStyle = bearStyle.snout;
  ctx.beginPath();
  ctx.ellipse(bearX, bearY + 12, 28, 20, 0, 0, Math.PI * 2);
  ctx.fill();

  // จมูกสีดำ (Nose)
  ctx.fillStyle = "#212121";
  ctx.beginPath();
  ctx.ellipse(bearX, bearY + 4, 10, 7, 0, 0, Math.PI * 2);
  ctx.fill();

  // ปากยิ้ม
  ctx.strokeStyle = "#212121";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(bearX - 6, bearY + 16, 6, 0.2, Math.PI * 0.9);
  ctx.arc(bearX + 6, bearY + 16, 6, 0.1, Math.PI * 0.8);
  ctx.stroke();

  // ดวงตา (Eyes)
  const isBlinkReverse = isAnomaly && session.currentAnomaly?.id === "blinking_eyes_reverse";
  if (isBlinkReverse) {
    // ดวงตาปิดสนิท (Blinking Reverse Anomaly)
    ctx.strokeStyle = "#212121";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(bearX - 20, bearY - 6, 8, 0.1, Math.PI * 0.9);
    ctx.arc(bearX + 20, bearY - 6, 8, 0.1, Math.PI * 0.9);
    ctx.stroke();
  } else {
    // ดวงตากลมโตปกติ
    ctx.fillStyle = "#212121";
    ctx.beginPath();
    ctx.arc(bearX - 20, bearY - 6, 5.5, 0, Math.PI * 2);
    ctx.arc(bearX + 20, bearY - 6, 5.5, 0, Math.PI * 2);
    ctx.fill();

    // ประกายตา
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.arc(bearX - 22, bearY - 8, 2, 0, Math.PI * 2);
    ctx.arc(bearX + 18, bearY - 8, 2, 0, Math.PI * 2);
    ctx.fill();
  }

  // อุปกรณ์เสริม (แว่นตา / ผ้าพันคอ)
  if (bearStyle.glasses) {
    ctx.strokeStyle = bearStyle.glasses;
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.arc(bearX - 20, bearY - 6, 15, 0, Math.PI * 2);
    ctx.arc(bearX + 20, bearY - 6, 15, 0, Math.PI * 2);
    ctx.moveTo(bearX - 5, bearY - 6);
    ctx.lineTo(bearX + 5, bearY - 6);
    ctx.stroke();
  } else if (bearStyle.accessory && bearStyle.accessoryType === "scarf") {
    ctx.fillStyle = bearStyle.accessory;
    ctx.beginPath();
    ctx.roundRect(bearX - 42, bearY + 28, 84, 18, 9);
    ctx.fill();
  }

  // ── 3. วาดเคาน์เตอร์บาร์คาเฟ่ด้านหน้า ────────────────────────────────
  const counterGrad = ctx.createLinearGradient(0, height - 65, 0, height);
  counterGrad.addColorStop(0, "#4e342e");
  counterGrad.addColorStop(1, "#271610");
  ctx.fillStyle = counterGrad;
  ctx.fillRect(0, height - 65, width, 65);

  ctx.strokeStyle = "#8d6e63";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(0, height - 65);
  ctx.lineTo(width, height - 65);
  ctx.stroke();

  // ── 4. ข้อมูลและ Badge บนภาพ ────────────────────────────────────────
  // ป้ายบอกรอบด้านบนซ้าย
  ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
  ctx.strokeStyle = "#ffb300";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(20, 20, 160, 36, 8);
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 15px "Noto Sans Thai", sans-serif';
  ctx.fillStyle = "#ffb300";
  ctx.fillText(`🌙 Round ${session.round}/${session.maxRounds}`, 35, 43);

  // ป้ายชื่อลูกค้าด้านล่างขวา
  ctx.fillStyle = "rgba(0, 0, 0, 0.75)";
  ctx.strokeStyle = "#d7ccc8";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect(width - 220, height - 52, 200, 38, 8);
  ctx.fill();
  ctx.stroke();

  ctx.font = 'bold 16px "Noto Sans Thai", sans-serif';
  ctx.fillStyle = "#ffffff";
  ctx.fillText(`${customer.emoji} ${customer.name}`, width - 205, height - 28);

  return canvas.toBuffer("image/png");
}

module.exports = {
  generateCustomerSceneCanvas
};
