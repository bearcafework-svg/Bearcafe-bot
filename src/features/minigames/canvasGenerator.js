// src/features/minigames/canvasGenerator.js — สร้างภาพตัวหนังสือสีแดง พื้นหลังโปร่งใส สำหรับเกม 7 และ 8

const { createCanvas } = require('@napi-rs/canvas');

/**
 * Creates an image buffer containing text in red font with transparent background
 * @param {string} text - The text to render
 * @returns {Buffer} - PNG buffer
 */
function createTextImageBuffer(text) {
  const fontSize = 42;
  const paddingX = 40;
  const paddingY = 30;

  // Measure text width using an initial canvas
  const tempCanvas = createCanvas(800, 200);
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.font = `bold ${fontSize}px sans-serif, "Leelawadee UI", "Segoe UI", Tahoma`;
  const textMetrics = tempCtx.measureText(text);

  const width = Math.max(350, Math.ceil(textMetrics.width) + paddingX * 2);
  const height = Math.ceil(fontSize * 1.8) + paddingY * 2;

  // Create actual canvas
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext('2d');

  // Clear background for transparency
  ctx.clearRect(0, 0, width, height);

  // Configure text style
  ctx.font = `bold ${fontSize}px sans-serif, "Leelawadee UI", "Segoe UI", Tahoma`;
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

  return canvas.toBuffer('image/png');
}

module.exports = {
  createTextImageBuffer
};
