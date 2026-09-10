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

module.exports = {
  createTextImageBuffer,
  CANVAS_IMAGE_CACHE,
};
