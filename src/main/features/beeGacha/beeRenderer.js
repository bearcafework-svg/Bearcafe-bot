// src/features/beeGacha/beeRenderer.js — วาดซ้อนเลเยอร์ภาพผึ้งใส่ชุด (Layered Canvas Compositing)
const { createCanvas } = require('@napi-rs/canvas');
require('../../utils/fontLoader');
const cfg = require('./settingGacha.json');

/**
 * Render equipped bee cosmetics on a 500x500 canvas
 * @param {Object} equipped - { BACKGROUND, OUTFIT, HAT, ACCESSORY }
 * @param {string} username - Optional username to display
 * @returns {Buffer} - PNG buffer
 */
async function renderEquippedBee(equipped = {}, username = 'Bee Friend') {
  const width = 500;
  const height = 500;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // ── Layer 1: Background ──────────────────────────────────────────────────
  const bgCosmetic = cfg.cosmetics.find(c => c.id === equipped.BACKGROUND);
  const bgColor = bgCosmetic?.color || '#FFF9C4'; // Soft Yellow background default
  
  // Radial Gradient Background
  const gradient = ctx.createRadialGradient(250, 250, 50, 250, 250, 300);
  gradient.addColorStop(0, '#FFFFFF');
  gradient.addColorStop(1, bgColor);
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);

  // Background pattern details
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
  ctx.lineWidth = 4;
  for (let i = -200; i < 700; i += 40) {
    ctx.beginPath();
    ctx.moveTo(i, 0);
    ctx.lineTo(i + 300, 500);
    ctx.stroke();
  }

  // ── Layer 2: Base Bee (เจ้าผึ้งอ้วนตัวกลม) ───────────────────────────────
  const centerX = 250;
  const centerY = 260;

  // Wings (ปีกใส 2 ข้าง)
  ctx.fillStyle = 'rgba(224, 247, 250, 0.85)';
  ctx.strokeStyle = '#B2EBF2';
  ctx.lineWidth = 3;

  // Left wing
  ctx.beginPath();
  ctx.ellipse(centerX - 80, centerY - 60, 45, 25, -Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Right wing
  ctx.beginPath();
  ctx.ellipse(centerX + 80, centerY - 60, 45, 25, Math.PI / 4, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Bee Body (ตัวผึ้งเหลือง)
  ctx.fillStyle = '#FFD54F';
  ctx.strokeStyle = '#F57F17';
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.ellipse(centerX, centerY, 100, 90, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Bee Stripes (ลายดำ 2 ลาย)
  ctx.fillStyle = '#3E2723';
  // Stripe 1
  ctx.beginPath();
  ctx.ellipse(centerX, centerY - 20, 92, 18, 0, 0, Math.PI);
  ctx.fill();
  // Stripe 2
  ctx.beginPath();
  ctx.ellipse(centerX, centerY + 30, 88, 18, 0, 0, Math.PI);
  ctx.fill();

  // Bee Eyes (ตาหวาน)
  ctx.fillStyle = '#212121';
  ctx.beginPath();
  ctx.arc(centerX - 35, centerY - 25, 12, 0, Math.PI * 2);
  ctx.arc(centerX + 35, centerY - 25, 12, 0, Math.PI * 2);
  ctx.fill();

  // Eye highlights
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  ctx.arc(centerX - 38, centerY - 28, 4, 0, Math.PI * 2);
  ctx.arc(centerX + 32, centerY - 28, 4, 0, Math.PI * 2);
  ctx.fill();

  // Cheek blush (แก้มอมชมพู)
  ctx.fillStyle = 'rgba(240, 98, 146, 0.45)';
  ctx.beginPath();
  ctx.arc(centerX - 55, centerY - 5, 14, 0, Math.PI * 2);
  ctx.arc(centerX + 55, centerY - 5, 14, 0, Math.PI * 2);
  ctx.fill();

  // Smile (รอยยิ้ม)
  ctx.strokeStyle = '#3E2723';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(centerX, centerY - 5, 12, 0.1 * Math.PI, 0.9 * Math.PI);
  ctx.stroke();

  // ── Layer 3: Outfit / Body Layer ────────────────────────────────────────
  const outfit = cfg.cosmetics.find(c => c.id === equipped.OUTFIT);
  if (outfit) {
    ctx.fillStyle = outfit.color || '#90A4AE';
    ctx.strokeStyle = '#37474F';
    ctx.lineWidth = 4;

    if (outfit.id === 'outfit_chef') {
      // Apron
      ctx.beginPath();
      ctx.roundRect(centerX - 50, centerY + 10, 100, 65, 10);
      ctx.fill();
      ctx.stroke();
      // Apron Pocket
      ctx.fillStyle = '#FFFFFF';
      ctx.fillRect(centerX - 20, centerY + 35, 40, 30);
    } else if (outfit.id === 'outfit_doctor') {
      // Doctor Coat
      ctx.beginPath();
      ctx.roundRect(centerX - 60, centerY + 5, 120, 70, 12);
      ctx.fill();
      ctx.stroke();
      // Red Cross
      ctx.fillStyle = '#E53935';
      ctx.fillRect(centerX - 5, centerY + 25, 10, 30);
      ctx.fillRect(centerX - 15, centerY + 35, 30, 10);
    } else if (outfit.id === 'outfit_knight') {
      // Armor Chest
      ctx.beginPath();
      ctx.roundRect(centerX - 65, centerY, 130, 75, 15);
      ctx.fill();
      ctx.stroke();
      // Shield Badge
      ctx.fillStyle = '#FFD700';
      ctx.beginPath();
      ctx.arc(centerX, centerY + 35, 15, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Layer 4: Head / Hat Layer ───────────────────────────────────────────
  const hat = cfg.cosmetics.find(c => c.id === equipped.HAT);
  if (hat) {
    ctx.fillStyle = hat.color || '#795548';
    ctx.strokeStyle = '#3E2723';
    ctx.lineWidth = 4;

    if (hat.id === 'hat_straw') {
      // Straw Hat Brim
      ctx.beginPath();
      ctx.ellipse(centerX, centerY - 95, 85, 15, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Hat Dome
      ctx.beginPath();
      ctx.arc(centerX, centerY - 110, 45, Math.PI, 0);
      ctx.fill();
      ctx.stroke();
    } else if (hat.id === 'hat_cowboy') {
      // Cowboy Hat Brim
      ctx.beginPath();
      ctx.ellipse(centerX, centerY - 95, 95, 18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // Dome
      ctx.beginPath();
      ctx.roundRect(centerX - 40, centerY - 145, 80, 50, [15, 15, 0, 0]);
      ctx.fill();
      ctx.stroke();
    } else if (hat.id === 'hat_crown') {
      // Gold Crown
      ctx.fillStyle = '#FFD700';
      ctx.strokeStyle = '#FF8F00';
      ctx.beginPath();
      ctx.moveTo(centerX - 45, centerY - 90);
      ctx.lineTo(centerX - 45, centerY - 140);
      ctx.lineTo(centerX - 22, centerY - 110);
      ctx.lineTo(centerX, centerY - 150);
      ctx.lineTo(centerX + 22, centerY - 110);
      ctx.lineTo(centerX + 45, centerY - 140);
      ctx.lineTo(centerX + 45, centerY - 90);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // Jewels
      ctx.fillStyle = '#E53935';
      ctx.beginPath();
      ctx.arc(centerX, centerY - 140, 6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Layer 5: Accessory Layer ────────────────────────────────────────────
  const acc = cfg.cosmetics.find(c => c.id === equipped.ACCESSORY);
  if (acc) {
    if (acc.id === 'acc_glasses') {
      // Sunglasses
      ctx.fillStyle = '#212121';
      ctx.strokeStyle = '#757575';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(centerX - 55, centerY - 38, 45, 28, 8);
      ctx.roundRect(centerX + 10, centerY - 38, 45, 28, 8);
      ctx.fill();
      ctx.stroke();
      // Bridge
      ctx.beginPath();
      ctx.moveTo(centerX - 10, centerY - 25);
      ctx.lineTo(centerX + 10, centerY - 25);
      ctx.stroke();
    } else if (acc.id === 'acc_wand') {
      // Magic Wand
      ctx.strokeStyle = '#8D6E63';
      ctx.lineWidth = 6;
      ctx.beginPath();
      ctx.moveTo(centerX + 80, centerY + 80);
      ctx.lineTo(centerX + 115, centerY - 10);
      ctx.stroke();
      // Star top
      ctx.fillStyle = '#FFEB3B';
      ctx.beginPath();
      ctx.arc(centerX + 115, centerY - 10, 12, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Header Tag Banner (ชื่อผู้เล่น) ──────────────────────────────────────
  ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
  ctx.roundRect(20, 20, 460, 45, 12);
  ctx.fill();

  ctx.font = 'bold 22px "Noto Sans Thai", sans-serif';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(`🐝 ผึ้งของ: ${username}`, 35, 42);

  return canvas.toBuffer('image/png');
}

module.exports = {
  renderEquippedBee
};
