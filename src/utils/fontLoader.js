// src/utils/fontLoader.js — โหลดและลงทะเบียนฟอนต์ภาษาไทยสำหรับ @napi-rs/canvas
const { GlobalFonts } = require("@napi-rs/canvas");
const path = require("path");
const fs = require("fs");

let fontsRegistered = false;

function initFonts() {
  if (fontsRegistered) return;

  try {
    const candidateDirs = [
      path.join(process.cwd(), "assets", "fonts"),
      path.resolve(__dirname, "../../assets/fonts"),
      path.resolve(__dirname, "../../../assets/fonts")
    ];
    const fontsDir = candidateDirs.find(d => fs.existsSync(d)) || candidateDirs[0];
    const fontRegular = path.join(fontsDir, "NotoSansThai-Regular.ttf");
    const fontBold = path.join(fontsDir, "NotoSansThai-Bold.ttf");

    // โหลด System Fonts ของเครื่อง (รวมถึง Emoji fonts เช่น Segoe UI Emoji, Noto Color Emoji, etc.)
    try {
      GlobalFonts.loadSystemFonts();
    } catch (e) {
      console.warn("[FontLoader] Warning loading system fonts:", e.message);
    }

    if (fs.existsSync(fontRegular)) {
      GlobalFonts.registerFromPath(fontRegular, "Noto Sans Thai");
    }
    if (fs.existsSync(fontBold)) {
      GlobalFonts.registerFromPath(fontBold, "Noto Sans Thai");
    }

    fontsRegistered = true;
    console.log("[FontLoader] Registered Noto Sans Thai and loaded system emoji fonts successfully.");
  } catch (err) {
    console.error("[FontLoader] Error registering fonts:", err.message);
  }
}

// Auto init on import
initFonts();

module.exports = { initFonts };
