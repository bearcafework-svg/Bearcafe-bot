// shared/tarotComponents.js
// รวม Components ที่ใช้ซ้ำหลายคำสั่ง แก้ที่นี่ที่เดียว

const { MessageFlags } = require('discord.js');
const cfg = require('../horoscope/settingtarot.json');

const FLAG_V2 = MessageFlags.IsComponentsV2; // 32768

// ─── Blacklist Payload ────────────────────────────────────────────────────────
function blacklistPayload(memberId) {
  return {
    flags: FLAG_V2,
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

// ─── Cooldown Content ─────────────────────────────────────────────────────────
function cooldownContent(memberId, readyTimestamp) {
  return `## ${cfg.emojis.star}︲<@${memberId}> ใช้คำสั่งได้อีก <t:${readyTimestamp}:R>`;
}

// ─── Other Commands Payload ───────────────────────────────────────────────────
// คืน { flags, components } ตรงๆ ให้ caller ประกอบ flags เพิ่มเองได้
// (เช่น tarot1.js รวม FLAG_V2 | FLAG_EPHEMERAL เองก่อน reply)
function otherCommandsPayload() {
  return {
    flags: FLAG_V2,
    components: [{
      type: 17,
      components: [
        { type: 14, spacing: 2 },
        {
          type: 10,
          content:
            `## ${cfg.emojis.bee}︲__\` 𝖢𝗈𝗆𝗆𝖺𝗇𝖽𝗌 ₊ คำสั่งอื่น ๆ 𓂃 \`__\n\n` +
            `1. พิมพ์ **"ดูคำทำนาย"** สุ่มไพ่รับคำทำนายจากหมี\n` +
            `2. พิมพ์ **"คำทำนายของฉันคือ"** เช็กดวงความรักของคุณ\n` +
            `3. พิมพ์ **"รูนประจำตัว"** ปิ้งขนมปังสุ่มรูนทำนาย\n` +
            `4. พิมพ์ **"เขย่าเซียมซี"** เขย่าเซียมซีลุ้นคำทำนาย\n` +
            `5. พิมพ์ **"เลือกหมี"** เลือกเค้กรับดวงประจำวัน\n` +
            `6. พิมพ์ **"เกิดใหม่เป็นอะไร"** ดูว่าชาติหน้าจะเป็นสัตว์อะไร\n`
        },
        { type: 14, spacing: 2 }
      ]
    }]
  };
}

module.exports = { blacklistPayload, cooldownContent, otherCommandsPayload };
