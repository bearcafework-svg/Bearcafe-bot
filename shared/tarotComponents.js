// shared/tarotComponents.js
// รวม Components ที่ใช้ซ้ำหลายคำสั่ง แก้ที่นี่ที่เดียว

const cfg = require('../Horoscope/settingtarot.json');

// ─── Blacklist Response ───────────────────────────────────────────────────────
// คืน { flags, components } ตรงๆ (ไม่ wrap ใน data)
function blacklistPayload(memberId) {
  return {
    flags: 32768,
    components: [{
      type: 17,
      components: [
        { type: 14, spacing: 2 },
        {
          type: 10,
          content:
            `## ${cfg.emojis.bear}︲<@${memberId}> คุณมีความผิดอยู่นะ *!*\n` +
            `- เนื่องจากคุณมีความผิดทำให้ทางคาเฟ่ได้ทำการปิดกั้นการใช้บางฟังก์ชั่นของคุณ ` +
            `รบกวนแก้ถ้วยกาแฟก่อนน้า (<#${cfg.channels.punishment_channel}>) ${cfg.emojis.plant}`
        },
        { type: 14, spacing: 2 }
      ]
    }]
  };
}

// ─── Cooldown Response ────────────────────────────────────────────────────────
function cooldownContent(memberId, readyTimestamp) {
  return `## ${cfg.emojis.star}︲<@${memberId}> ใช้คำสั่งได้อีก <t:${readyTimestamp}:R>`;
}

// ─── "ดูดวงแบบอื่น" Ephemeral Payload ───────────────────────────────────────
// คืน { flags, components } ตรงๆ (ไม่ wrap ใน data)
// ✅ ลบ type:12 ที่มี url ว่างออก → Discord reject เพราะ url required
function otherCommandsPayload() {
  return {
    flags: 32768,
    components: [{
      type: 17,
      components: [
        { type: 14, spacing: 2 },
        {
          type: 10,
          content:
            `## ${cfg.emojis.bee}︲__\` 𝖢𝗈𝗆𝗆𝖺𝗇𝖽𝗌 ₊ คำสั่งอื่น ๆ 𓂃 \`__\n\n` +
            `1. พิมพ์ **"ดูคำทำนาย"** สุ่มไพ่รับคำทำนายจากหมี\n` +
            `2. พิมพ์ **"คำทำนายของฉัน"** เช็กดวงความรักของคุณ\n` +
            `3. พิมพ์ **"ปิ้งขนมปัง"** ปิ้งขนมปังสุ่มรูนทำนาย\n` +
            `4. พิมพ์ **"หมีราศี วัน/เดือน"** ดูดวงตามวันเกิดและราศี\n` +
            `5. พิมพ์ **"เขย่าเซียมซี"** เขย่าเซียมซีลุ้นคำทำนาย\n` +
            `6. พิมพ์ **"เลือกเค้ก"** เลือกเค้กรับดวงประจำวัน\n` +
            `7. พิมพ์ **"เกิดใหม่เป็นอะไร"** ดูว่าชาติหน้าจะเป็นสัตว์อะไร\n`
        },
        { type: 14, spacing: 2 }
      ]
    }]
  };
}

module.exports = { blacklistPayload, cooldownContent, otherCommandsPayload };
