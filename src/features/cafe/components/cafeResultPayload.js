// src/features/cafe/components/cafeResultPayload.js
// Round Decision Result UI (Component V2)

const FLAG_V2 = 32768; // MessageFlags.IsComponentsV2

function buildCafeResultPayload(session) {
  const result = session.lastDecision || { success: true, message: "ผลลัพธ์ได้รับการบันทึกแล้ว" };
  const isFinalRound = session.round >= session.maxRounds;

  const innerComponents = [];

  // 1. Header Section
  innerComponents.push({
    type: 9,
    components: [
      {
        type: 10,
        content:
          `## 📢︲__\` ROUND RESULT ₊ ผลลัพธ์รอบที่ ${session.round}/${session.maxRounds} 𓂃 \`__\n` +
          `> ${result.success ? "✨ **การตัดสินใจถูกต้อง!**" : "⚠️ **เกิดข้อผิดพลาดในการสังเกต!**"}`
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

  // 2. Result Detail Message
  innerComponents.push({
    type: 10,
    content:
      `### 📝︰__\` รายละเอียดผลลัพธ์ \`__\n` +
      `${result.message}\n\n` +
      `- 💰 เหรียญสะสมปัจจุบัน: **\` ${session.coins} Coins \`**\n` +
      `- 👁️ Anomaly Tokens: **\` ${session.anomalyTokens} ชิ้น \`**\n` +
      `- ❤️ Trust: **\` ${session.trust}% \`** ︲ 🌀 Reality: **\` ${session.reality}% \`**`
  });

  innerComponents.push({ type: 14, divider: true });

  // 3. Next Action Button
  const nextButtonLabel = isFinalRound ? "🏆 ดูสรุปผลการทำงาน (Shift Summary)" : `➡️ ลูกค้าคนถัดไป (Round ${session.round + 1}/${session.maxRounds})`;
  const nextButton = {
    style: 3, // Success / Green
    type: 2,
    label: nextButtonLabel,
    custom_id: "cafe_next_round",
    flow: { actions: [] }
  };

  innerComponents.push({
    type: 1,
    components: [nextButton]
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
  buildCafeResultPayload
};
