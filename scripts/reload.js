// ===================================================
// scripts/reload.js — ทริกเกอร์รีสตาร์ทบอทในโหมด Dev ผ่าน Trigger File
// ===================================================

const fs = require("fs");
const path = require("path");

const target = (process.argv[2] || "both").toLowerCase();
const rootDir = path.resolve(__dirname, "..");
const timestamp = Date.now().toString();

try {
  if (target === "akari") {
    const filePath = path.join(rootDir, ".reload-akari");
    fs.writeFileSync(filePath, timestamp, "utf8");
    console.log("🔄 [Reload] ส่งสัญญาณรีสตาร์ท Akari Bot (.reload-akari) เรียบร้อยแล้ว!");
  } else if (target === "main") {
    const filePath = path.join(rootDir, ".reload-main");
    fs.writeFileSync(filePath, timestamp, "utf8");
    console.log("🔄 [Reload] ส่งสัญญาณรีสตาร์ท Main Bot (.reload-main) เรียบร้อยแล้ว!");
  } else {
    // Both bots watch .reload-trigger
    const filePath = path.join(rootDir, ".reload-trigger");
    fs.writeFileSync(filePath, timestamp, "utf8");
    console.log("🔄 [Reload] ส่งสัญญาณรีสตาร์ททั้ง Akari Bot และ Main Bot (.reload-trigger) เรียบร้อยแล้ว!");
  }
} catch (err) {
  console.error("❌ [Reload Error] ไม่สามารถเขียน Trigger File ได้:", err.message);
  process.exit(1);
}
