// ===================================================
// scripts/dev-both.js — สคริปต์รันบอททั้ง 2 ตัวพร้อมกันในโหมด Dev (--watch)
// ===================================================

const { spawn } = require("child_process");

console.log("🚀 [DevAll] กำลังเริ่มรันบอททั้ง 2 ตัวพร้อมกันในโหมด Dev (Trigger File watch)...");

// 1. รัน Bear Cafe Main Bot (index.js)
const mainBot = spawn("npx", ["nodemon", "--config", "nodemon.main.json", "index.js"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env },
});

// 2. รัน Kuma Public Bot (index-akari.js)
const kumaBot = spawn("npx", ["nodemon", "--config", "nodemon.kuma.json", "index-akari.js"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env },
});

mainBot.on("close", (code) => {
  console.log(`🐻 [MainBot] Process exited with code ${code}`);
});

kumaBot.on("close", (code) => {
  console.log(`🐻 [KumaBot] Process exited with code ${code}`);
});

process.on("SIGINT", () => {
  console.log("\n🛑 [DevAll] กำลังปิดการทำงานของบอททั้ง 2 ตัว...");
  mainBot.kill();
  kumaBot.kill();
  process.exit();
});
