// src/features/minigames/canvasGenerator.js — สร้างภาพตัวหนังสือสีแดง พื้นหลังโปร่งใส สำหรับเกม 7 และ 8

const { createCanvas } = require('@napi-rs/canvas');
require('../../utils/fontLoader');

// In-memory LRU Cache สำหรับเก็บผลลัพธ์ PNG Buffer (สูงสุด 300 คำ)
const CANVAS_IMAGE_CACHE = new Map();
const MAX_CANVAS_CACHE_SIZE = 300;

/**
 * Creates an image buffer containing text in red font with transparent background
 * @param {string} text - The text to render
 * @returns {Buffer} - PNG buffer
 */
function createTextImageBuffer(text) {
  const cacheKey = String(text || '').trim();
  if (CANVAS_IMAGE_CACHE.has(cacheKey)) {
    const cached = CANVAS_IMAGE_CACHE.get(cacheKey);
    // Refresh LRU position
    CANVAS_IMAGE_CACHE.delete(cacheKey);
    CANVAS_IMAGE_CACHE.set(cacheKey, cached);
    return cached;
  }

  const fontSize = 42;
  const paddingX = 40;
  const paddingY = 30;

  // Measure text width using an initial canvas
  const tempCanvas = createCanvas(800, 200);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.font = `bold ${fontSize}px "Noto Sans Thai", "Thai", "TLWG", "Garuda", "Leelawadee UI", "Segoe UI", Tahoma, sans-serif`;
  const textMetrics = tempCtx.measureText(text);

  const width = Math.max(350, Math.ceil(textMetrics.width) + paddingX * 2);
  const height = Math.ceil(fontSize * 1.8) + paddingY * 2;

  // Create actual canvas
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Clear background for transparency
  ctx.clearRect(0, 0, width, height);

  // Configure text style
  ctx.font = `bold ${fontSize}px "Noto Sans Thai", "Thai", "TLWG", "Garuda", "Leelawadee UI", "Segoe UI", Tahoma, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  // Red text color
  ctx.fillStyle = '#E53935';

  // Subtle text shadow for high contrast on light/dark mode
  ctx.shadowColor = 'rgba(0, 0, 0, 0.4)';
  ctx.shadowBlur = 6;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 2;

  // Draw text in center
  ctx.fillText(text, width / 2, height / 2);

  const buffer = canvas.toBuffer('image/png');

  // เก็บลง LRU Cache
  if (CANVAS_IMAGE_CACHE.size >= MAX_CANVAS_CACHE_SIZE) {
    const oldestKey = CANVAS_IMAGE_CACHE.keys().next().value;
    CANVAS_IMAGE_CACHE.delete(oldestKey);
  }
  CANVAS_IMAGE_CACHE.set(cacheKey, buffer);

  return buffer;
}

/**
 * Creates an image buffer for Game 13 Sentence Builder (White minimal card)
 * @param {string} thaiPrompt - Thai sentence/proverb
 * @param {string} englishTemplate - English template with {1}, {2}, etc.
 * @returns {Buffer} - PNG buffer
 */
function createSentenceBuilderImageBuffer(thaiPrompt, englishTemplate) {
  const cacheKey = `sb:${thaiPrompt}:${englishTemplate}`.trim();
  if (CANVAS_IMAGE_CACHE.has(cacheKey)) {
    const cached = CANVAS_IMAGE_CACHE.get(cacheKey);
    CANVAS_IMAGE_CACHE.delete(cacheKey);
    CANVAS_IMAGE_CACHE.set(cacheKey, cached);
    return cached;
  }

  const width = 960;
  const height = 340;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Background: Clean white card with subtle rounded border
  ctx.fillStyle = '#FFFFFF';
  ctx.beginPath();
  const radius = 16;
  ctx.roundRect(4, 4, width - 8, height - 8, radius);
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = '#E2E8F0';
  ctx.stroke();

  // Top: Thai prompt
  ctx.font = 'bold 36px "Noto Sans Thai", "Thai", "TLWG", "Garuda", "Leelawadee UI", "Segoe UI", Tahoma, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#1E293B';
  ctx.fillText(thaiPrompt, width / 2, 95);

  // Middle: English sentence with empty blank boxes
  const enFontSize = 38;
  ctx.font = `bold ${enFontSize}px "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans Thai", sans-serif`;
  ctx.textBaseline = 'middle';

  const parts = String(englishTemplate || '').split(/(\{\d+\})/g).filter(Boolean);

  const boxWidth = 85;
  const boxHeight = 44;
  const boxRadius = 8;

  let totalWidth = 0;
  const measuredTokens = [];

  for (const part of parts) {
    if (/^\{\d+\}$/.test(part)) {
      measuredTokens.push({ type: 'blank', width: boxWidth, raw: part });
      totalWidth += boxWidth;
    } else {
      const w = ctx.measureText(part).width;
      measuredTokens.push({ type: 'text', width: w, text: part });
      totalWidth += w;
    }
  }

  // Auto-scale font and boxes if text is longer than card width
  const maxWidth = width - 60;
  let finalBoxWidth = boxWidth;
  if (totalWidth > maxWidth) {
    const scale = maxWidth / totalWidth;
    const scaledEnFontSize = Math.max(22, Math.floor(enFontSize * scale));
    ctx.font = `bold ${scaledEnFontSize}px "Segoe UI", Roboto, "Helvetica Neue", "Noto Sans Thai", sans-serif`;
    finalBoxWidth = Math.max(50, Math.floor(boxWidth * scale));

    totalWidth = 0;
    measuredTokens.length = 0;
    for (const part of parts) {
      if (/^\{\d+\}$/.test(part)) {
        measuredTokens.push({ type: 'blank', width: finalBoxWidth, raw: part });
        totalWidth += finalBoxWidth;
      } else {
        const w = ctx.measureText(part).width;
        measuredTokens.push({ type: 'text', width: w, text: part });
        totalWidth += w;
      }
    }
  }

  // Centering X
  let startX = (width - totalWidth) / 2;
  const lineY = 220;

  for (const token of measuredTokens) {
    if (token.type === 'blank') {
      const bX = startX;
      const bY = lineY - boxHeight / 2;

      ctx.fillStyle = '#F1F5F9';
      ctx.beginPath();
      ctx.roundRect(bX, bY, token.width, boxHeight, boxRadius);
      ctx.fill();

      ctx.lineWidth = 2;
      ctx.strokeStyle = '#CBD5E1';
      ctx.stroke();

      startX += boxWidth;
    } else {
      ctx.fillStyle = '#0F172A';
      ctx.textAlign = 'left';
      ctx.fillText(token.text, startX, lineY);
      startX += token.width;
    }
  }

  const buffer = canvas.toBuffer('image/png');

  if (CANVAS_IMAGE_CACHE.size >= MAX_CANVAS_CACHE_SIZE) {
    const oldestKey = CANVAS_IMAGE_CACHE.keys().next().value;
    CANVAS_IMAGE_CACHE.delete(oldestKey);
  }
  CANVAS_IMAGE_CACHE.set(cacheKey, buffer);

  return buffer;
}

module.exports = {
  createTextImageBuffer,
  createSentenceBuilderImageBuffer,
  CANVAS_IMAGE_CACHE,
};
