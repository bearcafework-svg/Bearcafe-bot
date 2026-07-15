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

// ─── DM Closed Payload ────────────────────────────────────────────────────────
function dmClosedPayload() {
  return {
    flags: 32768 | 64, // Ephemeral V2
    components: [
      {
        type: 17,
        components: [
          {
            type: 14,
            spacing: 2,
            divider: true
          },
          {
            type: 10,
            content: "# 📱︲__` 𝖧𝗈𝗐 𝟤 𝖮𝗉𝖾𝗇 ₊ วิธีเปิด Dm บนโทรศัพท์ 𓂃 `__"
          },
          {
            type: 14,
            divider: false
          },
          {
            type: 12,
            items: [
              {
                media: {
                  url: "https://cdn.discordapp.com/attachments/1524704267015819274/1526895013403955300/4.png?ex=6a58af4b&is=6a575dcb&hm=cc5985ef076c0a64d6a184fc6f07765a849960a5f2c38052c5b66f9053eb16c0&"
                },
                description: "[มือถือ] — กดไปที่โปรไฟล์ตัวเอง"
              },
              {
                media: {
                  url: "https://cdn.discordapp.com/attachments/1524704267015819274/1526895013751947306/5.png?ex=6a58af4b&is=6a575dcb&hm=1f2c292c7b7ec047fc745c54797f87af0e1190531c2561fea5d158997b77d34b&"
                },
                description: "[มือถือ] — กดไปที่ \"การตั้งค่า\""
              },
              {
                media: {
                  url: "https://cdn.discordapp.com/attachments/1524704267015819274/1526895013999677450/6.png?ex=6a58af4b&is=6a575dcb&hm=0617775b51f36f28776df209bff1b3f9edb8787bf491d9c6164c82491e1463d4&"
                },
                description: "[มือถือ] — กดไปที่ \"เนื้อหาและโซเชียลมีเดีย\""
              },
              {
                media: {
                  url: "https://cdn.discordapp.com/attachments/1524704267015819274/1526895014242943026/7.png?ex=6a58af4b&is=6a575dcb&hm=407f65e07a409cb4f26681ed23f63998032e04eb75c742ba4d742f26dd9d052e&"
                },
                description: "[มือถือ] — กดเปิด \"ข้อความส่วนตัว\""
              }
            ]
          },
          {
            type: 14,
            spacing: 2
          },
          {
            type: 10,
            content: "# 🖥️︲__` 𝖧𝗈𝗐 𝟤 𝖮𝗉𝖾𝗇 ₊ วิธีเปิด Dm บนคอมพิวเตอร์ 𓂃 `__"
          },
          {
            type: 14,
            spacing: 1,
            divider: false
          },
          {
            type: 12,
            items: [
              {
                media: {
                  url: "https://cdn.discordapp.com/attachments/1524704267015819274/1526895012619751636/1.png?ex=6a58af4b&is=6a575dcb&hm=9e4519753419d74811233d688d838c1893b3f6665727a949598eac8a2e11f72a&"
                },
                description: "[คอมพิวเตอร์] — กดไปที่ \"ฟันเฟือง\""
              },
              {
                media: {
                  url: "https://cdn.discordapp.com/attachments/1524704267015819274/1526895012845981786/2.png?ex=6a58af4b&is=6a575dcb&hm=de4fcfa54f8b9c05490119fe632d722e2e447d81622c548107bb7b1584be20ad&"
                },
                description: "[คอมพิวเตอร์] — กดไปที่ \"เนื้อหาและโซเชียลมีเดีย\""
              },
              {
                media: {
                  url: "https://cdn.discordapp.com/attachments/1524704267015819274/1526895013139710073/3.png?ex=6a58af4b&is=6a575dcb&hm=f27a12cc4f2168779f0fe4de86b1f8a74f06731c5ba545e9458ba49ef5155401&"
                },
                description: "[คอมพิวเตอร์] — กดเปิด \"ข้อความส่วนตัว\""
              }
            ]
          },
          {
            type: 14,
            spacing: 2,
            divider: true
          }
        ]
      }
    ]
  };
}

module.exports = { blacklistPayload, cooldownContent, otherCommandsPayload, dmClosedPayload };
