// src/features/cafe/components/cafeObservationPayload.js
// Observation Menu & Inspection Clues UI (Component V2)

const FLAG_V2 = 32768; // MessageFlags.IsComponentsV2

function buildCafeObservationPayload(session) {
  const obsLeft = Math.max(0, session.observationsLimit - session.observationsUsed);
  const innerComponents = [];

  // 1. Header Section
  innerComponents.push({
    type: 9,
    components: [
      {
        type: 10,
        content:
          `## 🔎︲__\` OBSERVATION MODE ₊ สำรวจสิ่งผิดปกติ 𓂃 \`__\n` +
          `> 🌙 **Round ${session.round}/${session.maxRounds}** ︲ สิทธิ์การสำรวจคงเหลือ: **\` ${obsLeft}/${session.observationsLimit} ครั้ง \`**`
      }
    ],
    accessory: {
      type: 11,
      media: {
        url: "https://cdn.discordapp.com/attachments/1524704267015819274/1534568886135947415/IMG_25680923184720328.png"
      }
    }
  });

  innerComponents.push({ type: 14, spacing: 2 });

  // 2. Observation History / Latest Observation Clues
  if (session.observationHistory.length > 0) {
    let historyText = `### 📜︰__\` บันทึกการสังเกตในรอบนี้ \`__\n`;
    session.observationHistory.forEach((item, index) => {
      historyText += `**${index + 1}. ${item.label}**\n> "${item.text}"\n\n`;
    });
    innerComponents.push({
      type: 10,
      content: historyText.trim()
    });
  } else {
    innerComponents.push({
      type: 10,
      content:
        `### 🧭︰__\` กรุณาเลือกจุดที่ต้องการสังเกตการณ์ \`__\n` +
        `- สังเกตสิ่งแวดล้อมเพื่อมองหาเบาะแสความผิดปกติ (Anomaly) ที่อาจซ่อนอยู่\n` +
        `- *คำเตือน: คุณมีสิทธิ์สังเกตการณ์จำกัดต่อหนึ่งรอบ โปรดเลือกอย่างระมัดระวัง*`
    });
  }

  innerComponents.push({ type: 14, divider: true });

  // 3. Observation Target Buttons Row 1 (Customer, Order, Table)
  const row1 = [
    {
      style: 2,
      type: 2,
      label: "👤 ลูกค้า",
      custom_id: "cafe_obs_customer",
      disabled: obsLeft <= 0,
      flow: { actions: [] }
    },
    {
      style: 2,
      type: 2,
      label: "📋 ออเดอร์",
      custom_id: "cafe_obs_order",
      disabled: obsLeft <= 0,
      flow: { actions: [] }
    },
    {
      style: 2,
      type: 2,
      label: "🪑 โต๊ะและรอบๆ",
      custom_id: "cafe_obs_table",
      disabled: obsLeft <= 0,
      flow: { actions: [] }
    }
  ];

  // Observation Target Buttons Row 2 (Clock, Mirror, Back)
  const row2 = [
    {
      style: 2,
      type: 2,
      label: "⏰ เวลา/นาฬิกา",
      custom_id: "cafe_obs_clock",
      disabled: obsLeft <= 0,
      flow: { actions: [] }
    },
    {
      style: 2,
      type: 2,
      label: "🪞 กระจกเงา",
      custom_id: "cafe_obs_mirror",
      disabled: obsLeft <= 0,
      flow: { actions: [] }
    },
    {
      style: 1, // Blurple
      type: 2,
      label: "⬅️ กลับไปตัดสินใจ",
      custom_id: "cafe_back_main",
      flow: { actions: [] }
    }
  ];

  innerComponents.push({
    type: 1,
    components: row1
  });

  innerComponents.push({
    type: 1,
    components: row2
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
  buildCafeObservationPayload
};
