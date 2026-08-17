// src/features/cafe/components/cafeErrorPayload.js
// Expired / Cancelled session message payload (Component V2)

const FLAG_V2 = 32768; // MessageFlags.IsComponentsV2

function buildCafeExpiredPayload(userId) {
  const innerComponents = [];

  // 1. Top Image Banner
  innerComponents.push({
    type: 12,
    items: [
      {
        media: {
          url: "https://cdn.discordapp.com/attachments/1524704267015819274/1534568886135947415/IMG_25680923184720328.png"
        }
      }
    ]
  });

  innerComponents.push({ type: 14, spacing: 2 });

  // 2. Header Section
  innerComponents.push({
    type: 10,
    content:
      `## ☕︲__\` BEAR CAFÉ ₊ กะการทำงานหมดอายุ 𓂃 \`__\n` +
      `> <@${userId}> Café Session นี้หมดอายุเนื่องจากไม่มีความเคลื่อนไหว\n` +
      `> สามารถเริ่มงานกะใหม่ได้โดยพิมพ์คำสั่ง \`b!cafe\``
  });

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: innerComponents
      }
    ]
  };
}

function buildCafeCancelledPayload(userId) {
  const innerComponents = [];

  innerComponents.push({
    type: 9,
    components: [
      {
        type: 10,
        content:
          `## ☕︲__\` BEAR CAFÉ ₊ สิ้นสุดกะการทำงาน 𓂃 \`__\n` +
          `> <@${userId}> คุณได้ปิดร้านและออกจากงานกะนี้เรียบร้อยแล้ว\n` +
          `> สามารถกลับมาทำงานกะใหม่ได้ทุกเมื่อด้วยคำสั่ง \`b!cafe\``
      }
    ]
  });

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: innerComponents
      }
    ]
  };
}

module.exports = {
  buildCafeExpiredPayload,
  buildCafeCancelledPayload
};
