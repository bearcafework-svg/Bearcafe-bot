// src/utils/fontLoader.js — โหลดและลงทะเบียนฟอนต์ภาษาไทยสำหรับ @napi-rs/canvas
const { GlobalFonts } = require("@napi-rs/canvas");
const path = require("path");
const fs = require("fs");

let fontsRegistered = false;

function initFonts() {
  if (fontsRegistered) return;

  try {
    const fontsDir = path.join(process.cwd(), "assets", "fonts");
    const fontRegular = path.join(fontsDir, "NotoSansThai-Regular.ttf");
    const fontBold = path.join(fontsDir, "NotoSansThai-Bold.ttf");

    if (fs.existsSync(fontRegular)) {
      GlobalFonts.registerFromPath(fontRegular, "Noto Sans Thai");
    }
    if (fs.existsSync(fontBold)) {
      GlobalFonts.registerFromPath(fontBold, "Noto Sans Thai");
    }

    fontsRegistered = true;
    console.log("[FontLoader] Registered Noto Sans Thai fonts successfully.");
  } catch (err) {
    console.error("[FontLoader] Error registering fonts:", err.message);
  }
}

// Auto init on import
initFonts();

module.exports = { initFonts };
