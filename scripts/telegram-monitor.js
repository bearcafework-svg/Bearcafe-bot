/**
 * scripts/telegram-monitor.js
 * 
 * ระบบแจ้งเตือน PM2 Log & Process Event เข้าสู่ Telegram
 * - ดักจับ stderr / console.error จากแอปที่ระบุ
 * - ดักจับเหตุการณ์ Crash / Restart / Stop
 * - มีระบบ Cooldown ป้องกันข้อความสแปมรัว
 * - ปลอดภัย ไม่กวนการทำงานของบอทหลัก
 */

require('dotenv').config();
const path = require('path');
const { execSync } = require('child_process');

// 1. โหลดโมดูล PM2 (รองรับทั้งแบบติดตั้งในโปรเจกต์ และแบบ Global บน VPS)
let pm2;
try {
  pm2 = require('pm2');
} catch {
  try {
    const globalModulesPath = execSync('npm root -g').toString().trim();
    pm2 = require(path.join(globalModulesPath, 'pm2'));
  } catch (err) {
    console.error('❌ ไม่พบโมดูล pm2 กรุณารันคำสั่ง: npm install pm2');
    process.exit(1);
  }
}

// 2. ตั้งค่า Configuration
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const CHAT_ID = process.env.TELEGRAM_CHAT_ID;
// ระบุชื่อแอปที่ต้องการดักจับ (คั่นด้วยจุลภาค) หรือปล่อยว่างเพื่อดักจับทุกแอปใน PM2
const TARGET_APPS = (process.env.MONITOR_TARGETS || 'bearcafe-bot,bearcafe-prod,bearcafe-dev,kuma-bot')
  .split(',')
  .map(name => name.trim().toLowerCase())
  .filter(Boolean);

const SELF_NAME = 'bearcafe-monitor';
const COOLDOWN_MS = 15000; // ป้องกันข้อความซ้ำสแปมภายใน 15 วินาที
const lastSentMap = new Map();

if (!BOT_TOKEN || !CHAT_ID) {
  console.error('❌ กรุณาตั้งค่า TELEGRAM_BOT_TOKEN และ TELEGRAM_CHAT_ID ในไฟล์ .env');
  console.error('   ตัวอย่าง:');
  console.error('   TELEGRAM_BOT_TOKEN="123456789:ABC..."');
  console.error('   TELEGRAM_CHAT_ID="123456789"');
  process.exit(1);
}

// แปลงอักขระพิเศษสำหรับ Telegram HTML Mode
function escapeHtml(text) {
  return String(text || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// ฟังก์ชันส่งข้อความเข้า Telegram
async function sendTelegram(htmlMessage) {
  try {
    const res = await fetch(`https://api.telegram.org/bot${BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: CHAT_ID,
        text: htmlMessage,
        parse_mode: 'HTML',
        disable_web_page_preview: true
      })
    });

    const result = await res.json();
    if (!result.ok) {
      console.error('[TelegramMonitor] API Error:', result.description);
    }
  } catch (err) {
    console.error('[TelegramMonitor] Network Error:', err.message);
  }
}

// ตรวจสอบว่าแอปนี้อยู่ในกลุ่มที่ต้องดักจับหรือไม่
function isTargetApp(appName) {
  if (!appName) return false;
  const name = appName.toLowerCase();
  if (name === SELF_NAME) return false; // ไม่ดักจับตัวเอง
  if (TARGET_APPS.length === 0 || TARGET_APPS.includes('*')) return true;
  return TARGET_APPS.includes(name);
}

// ฟิลเตอร์คัดกรอง Warning ที่ไม่จำเป็นออกจาก Alert
function shouldIgnoreError(logText) {
  if (!logText) return true;
  const ignoredPatterns = [
    'Warning: Accessing non-existent property',
    'DeprecationWarning:',
    'ExperimentalWarning:'
  ];
  return ignoredPatterns.some(pattern => logText.includes(pattern));
}

// เริ่มการเชื่อมต่อกับ PM2
pm2.connect((err) => {
  if (err) {
    console.error('❌ Failed to connect to PM2:', err);
    process.exit(1);
  }

  pm2.launchBus((err, bus) => {
    if (err) {
      console.error('❌ Failed to launch PM2 bus:', err);
      process.exit(1);
    }

    console.log('=============================================');
    console.log('🚀 Telegram Monitor is active!');
    console.log(`🎯 Targets: ${TARGET_APPS.length > 0 ? TARGET_APPS.join(', ') : 'ALL APPS'}`);
    console.log('=============================================');

    // แจ้งเตือนเมื่อตัว Monitor เริ่มทำงาน
    sendTelegram(
      `🟢 <b>[PM2 Monitor] Started</b>\n` +
      `⏰ <i>${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</i>\n` +
      `🎯 Monitoring: <code>${TARGET_APPS.join(', ')}</code>`
    );

    // 1. ดักจับ Error Logs (stderr / console.error)
    bus.on('log:err', (packet) => {
      const appName = packet.process?.name;
      const rawData = String(packet.data || '').trim();

      if (!isTargetApp(appName) || !rawData) return;
      if (shouldIgnoreError(rawData)) return;

      // ระบบ Cooldown ป้องกันการสแปมข้อความซ้ำ
      const errorKey = `${appName}:${rawData.slice(0, 80)}`;
      const now = Date.now();
      if (lastSentMap.has(errorKey) && now - lastSentMap.get(errorKey) < COOLDOWN_MS) {
        return;
      }
      lastSentMap.set(errorKey, now);

      // ตัดทอนความยาวไม่ให้เกิน Limit ของ Telegram (4,096 ตัวอักษร)
      const truncatedLog = rawData.length > 3500 ? rawData.slice(0, 3500) + '... (truncated)' : rawData;

      const message = 
        `🚨 <b>[${appName}] Error Alert</b>\n` +
        `⏰ <i>${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</i>\n\n` +
        `<pre><code>${escapeHtml(truncatedLog)}</code></pre>`;

      sendTelegram(message);
    });

    // 2. ดักจับเหตุการณ์ระดับ Process (restart, crash, exit, stop)
    bus.on('process:event', (packet) => {
      const appName = packet.process?.name;
      const event = packet.event;

      if (!isTargetApp(appName)) return;

      const criticalEvents = ['restart', 'exit', 'stop', 'restart overlimit'];
      if (!criticalEvents.includes(event)) return;

      const icon = event === 'restart' ? '🔄' : '⚠️';
      const message = 
        `${icon} <b>[${appName}] Process Event</b>\n` +
        `⏰ <i>${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}</i>\n` +
        `📌 Event: <b>${event.toUpperCase()}</b>`;

      sendTelegram(message);
    });
  });
});

