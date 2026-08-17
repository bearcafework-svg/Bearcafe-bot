// src/features/cafe/components/cafeActivePromptPayload.js
// Active session detection prompt UI (Component V2)

const FLAG_V2 = 32768; // MessageFlags.IsComponentsV2

function buildCafeActivePromptPayload(session) {
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
      `## ☕︲__\` BEAR CAFÉ ₊ คุณมีรอบการทำงานค้างอยู่ 𓂃 \`__\n` +
      `> <@${session.userId}> คุณมี Café Session ที่กำลังดำเนินอยู่ที่ **Round ${session.round}/${session.maxRounds}**\n` +
      `> ต้องการเล่นต่อจากจุดเดิม หรือยกเลิกเพื่อเริ่มใหม่หรือไม่?`
  });

  innerComponents.push({ type: 14, spacing: 2 });

  const actionButtons = [
    {
      style: 3, // Green
      type: 2,
      label: "▶️ เล่นต่อ",
      custom_id: "cafe_resume",
      flow: { actions: [] }
    },
    {
      style: 4, // Red
      type: 2,
      label: "❌ ยกเลิกกะนี้",
      custom_id: "cafe_cancel",
      flow: { actions: [] }
    }
  ];

  innerComponents.push({
    type: 1,
    components: actionButtons
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
  buildCafeActivePromptPayload
};
