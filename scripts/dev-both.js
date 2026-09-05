// ===================================================
// scripts/dev-both.js — สคริปต์รันบอททั้ง 2 ตัวพร้อมกันในโหมด Dev (--watch)
// ===================================================

const { spawn } = require("child_process");

console.log("🚀 [DevAll] กำลังเริ่มรันบอททั้ง 2 ตัวพร้อมกันในโหมด Dev (--watch)...");

// 1. รัน Bear Cafe Main Bot (index.js)
const mainBot = spawn("node", ["--watch", "index.js"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env },
});

// 2. รัน Akari Public Bot (index-akari.js)
const akariBot = spawn("node", ["--watch", "index-akari.js"], {
  stdio: "inherit",
  shell: true,
  env: { ...process.env },
});

mainBot.on("close", (code) => {
  console.log(`🐻 [MainBot] Process exited with code ${code}`);
});

akariBot.on("close", (code) => {
  console.log(`🏮 [AkariBot] Process exited with code ${code}`);
});

process.on("SIGINT", () => {
  console.log("\n🛑 [DevAll] กำลังปิดการทำงานของบอททั้ง 2 ตัว...");
  mainBot.kill();
  akariBot.kill();
  process.exit();
});
