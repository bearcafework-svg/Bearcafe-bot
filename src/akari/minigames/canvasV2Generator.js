// ===================================================
// src/akari/minigames/canvasV2Generator.js
// ระบบสร้างรูปภาพ Canvas V2 สำหรับมินิเกม Akari Bot (Multi-Tenant)
// รองรับธีมสีหลากหลาย (Cyber, Neon, Pastel, Minimal, Dark) และการใส่โลโก้เซิร์ฟเวอร์
// ===================================================

const { createCanvas, loadImage } = require('@napi-rs/canvas');
const fontLoader = require('../../shared/utils/fontLoader');

const THEMES = {
  cyber: {
    bgGradient: ['#0f172a', '#1e1b4b'],
    cardBg: 'rgba(30, 41, 59, 0.85)',
    borderColor: '#38bdf8',
    titleColor: '#38bdf8',
    questionColor: '#f8fafc',
    subTextColor: '#94a3b8',
    accentColor: '#818cf8',
  },
  neon: {
    bgGradient: ['#09090b', '#18181b'],
    cardBg: 'rgba(24, 24, 27, 0.85)',
    borderColor: '#f43f5e',
    titleColor: '#fb7185',
    questionColor: '#ffffff',
    subTextColor: '#a1a1aa',
    accentColor: '#38bdf8',
  },
  pastel: {
    bgGradient: ['#2e1065', '#3b0764'],
    cardBg: 'rgba(88, 28, 135, 0.85)',
    borderColor: '#c084fc',
    titleColor: '#e879f9',
    questionColor: '#fdf4ff',
    subTextColor: '#d8b4fe',
    accentColor: '#f472b6',
  },
  minimal: {
    bgGradient: ['#18181b', '#27272a'],
    cardBg: 'rgba(39, 39, 42, 0.9)',
    borderColor: '#a1a1aa',
    titleColor: '#e4e4e7',
    questionColor: '#ffffff',
    subTextColor: '#71717a',
    accentColor: '#e4e4e7',
  },
  dark: {
    bgGradient: ['#050505', '#121212'],
    cardBg: 'rgba(20, 20, 20, 0.9)',
    borderColor: '#22c55e',
    titleColor: '#4ade80',
    questionColor: '#f0fdf4',
    subTextColor: '#86efac',
    accentColor: '#10b981',
  },
};

/**
 * วาดสี่เหลี่ยมมุมโค้ง (Rounded Rectangle)
 */
function drawRoundedRect(ctx, x, y, width, height, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

/**
 * ตัดข้อความขึ้นบรรทัดใหม่อัตโนมัติ (Word Wrap)
 */
function wrapText(ctx, text, maxWidth) {
  const str = String(text || '');
  const words = str.split(' ');
  const lines = [];
  let currentLine = words[0] || '';

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + ' ' + word).width;
    if (width < maxWidth) {
      currentLine += ' ' + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
}

/**
 * สร้าง Buffer รูปภาพโจทย์มินิเกม V2
 * @param {Object} options 
 * @returns {Promise<Buffer>}
 */
async function createAkariMinigameV2Buffer({
  gameTitle = '🎮 AKARI MINIGAME',
  questionText = '',
  subText = 'พิมพ์ตอบในช่องข้อความได้เลย!',
  themeName = 'cyber',
  serverName = 'AKARI BOT',
  iconUrl = null,
}) {
  const width = 900;
  const height = 450;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  const theme = THEMES[themeName] || THEMES.cyber;

  // 1. วาด Background Gradient
  const bgGradient = ctx.createLinearGradient(0, 0, width, height);
  bgGradient.addColorStop(0, theme.bgGradient[0]);
  bgGradient.addColorStop(1, theme.bgGradient[1]);
  ctx.fillStyle = bgGradient;
  ctx.fillRect(0, 0, width, height);

  // 2. วาด Card Container หลัก
  ctx.save();
  drawRoundedRect(ctx, 30, 30, width - 60, height - 60, 24);
  ctx.fillStyle = theme.cardBg;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = theme.borderColor;
  ctx.stroke();
  ctx.restore();

  // 3. วาด Header (ชื่อเกม + โลโก้เซิร์ฟเวอร์)
  ctx.fillStyle = theme.titleColor;
  ctx.font = 'bold 30px "FC Lamphun", "Sarabun", sans-serif';
  ctx.fillText(gameTitle, 65, 85);

  ctx.fillStyle = theme.subTextColor;
  ctx.font = '18px "FC Lamphun", "Sarabun", sans-serif';
  ctx.fillText(`SERVER: ${serverName.toUpperCase()}`, 65, 115);

  // โหลดและวาดโลโก้เซิร์ฟเวอร์ (ถ้ามี)
  if (iconUrl) {
    try {
      const serverIcon = await loadImage(iconUrl);
      ctx.save();
      ctx.beginPath();
      ctx.arc(width - 85, 85, 30, 0, Math.PI * 2, true);
      ctx.closePath();
      ctx.clip();
      ctx.drawImage(serverIcon, width - 115, 55, 60, 60);
      ctx.restore();
    } catch (e) {
      // Fallback
    }
  }

  // 4. เส้นแบ่ง Header
  ctx.beginPath();
  ctx.moveTo(65, 135);
  ctx.lineTo(width - 65, 135);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
  ctx.lineWidth = 2;
  ctx.stroke();

  // 5. วาดโจทย์ (Question Body)
  ctx.fillStyle = theme.questionColor;
  let fontSize = 38;
  if (questionText.length > 50) fontSize = 30;
  if (questionText.length > 100) fontSize = 24;

  ctx.font = `bold ${fontSize}px "FC Lamphun", "Sarabun", sans-serif`;

  const maxTextWidth = width - 130;
  const lines = wrapText(ctx, questionText, maxTextWidth);

  let startY = 220 - ((lines.length - 1) * (fontSize * 1.3)) / 2;

  lines.forEach((line) => {
    const textWidth = ctx.measureText(line).width;
    const startX = (width - textWidth) / 2;
    ctx.fillText(line, startX, startY);
    startY += fontSize * 1.3;
  });

  // 6. วาด Footer (คำใบ้ / ข้อความเสริม)
  if (subText) {
    ctx.fillStyle = theme.subTextColor;
    ctx.font = '20px "FC Lamphun", "Sarabun", sans-serif';
    const subWidth = ctx.measureText(subText).width;
    ctx.fillText(subText, (width - subWidth) / 2, height - 70);
  }

  return canvas.toBuffer('image/png');
}

module.exports = {
  createAkariMinigameV2Buffer,
  THEMES,
};
