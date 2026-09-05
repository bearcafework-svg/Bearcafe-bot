// src/features/cafe/components/cafeCompletePayload.js
// Shift Completed Summary UI (Component V2)

const FLAG_V2 = 32768; // MessageFlags.IsComponentsV2
const { calculateShiftSummary } = require("../systems/rewardSystem");

function buildCafeCompletePayload(session) {
  const summary = calculateShiftSummary(session);
  const innerComponents = [];

  // 1. Top Image Banner
  innerComponents.push({
    type: 12,
    items: [
      {
        media: {
          url: "attachment://shift_summary.png"
        }
      }
    ]
  });

  innerComponents.push({ type: 14, spacing: 2 });

  // 2. Header Section
  innerComponents.push({
    type: 10,
    content:
      `## ☕︲__\` CAFÉ SHIFT COMPLETE ₊ สรุปผลกะดึก 𓂃 \`__\n` +
      `> บาริสต้า: <@${session.userId}> ︲ เสร็จสิ้นภารกิจ 5 รอบการทำงาน`
  });

  innerComponents.push({ type: 14, spacing: 2 });

  // 2. Score & Rating Summary Card
  const perfectText = summary.isPerfect ? `\n🌟 **Perfect Shift Bonus:** \`+${summary.perfectBonus} Coins\` (ไม่ทำพลาดเลย!)` : "";
  const discoveredText = session.discoveredAnomalies.length > 0
    ? session.discoveredAnomalies.map((id) => `\`${id}\``).join(", ")
    : "ไม่มี";

  innerComponents.push({
    type: 10,
    content:
      `### 🏆︰__\` ผลการประเมินการทำงาน (Shift Rating) \`__\n` +
      `- 🌟 เกรดประเมิน: **\` [ Grade ${summary.rating} ] \`** — *${summary.ratingTitle}*\n` +
      `- 💰 เหรียญที่ได้รับทั้งหมด: **\` +${summary.finalCoins} Coins \`**${perfectText}\n` +
      `- 👁️ Anomaly Tokens: **\` +${summary.anomalyTokens} ชิ้น \`**\n` +
      `- 🎯 ตรวจจับถูกต้อง: **\` ${summary.correctDetections} ครั้ง \`**\n` +
      `- ❌ ข้อผิดพลาด: **\` ${summary.mistakes} ครั้ง \`**\n` +
      `- ❤️ ความไว้ใจคงเหลือ (Trust): **\` ${summary.trust}% \`**\n` +
      `- 🌀 ระดับมิติความจริง (Reality): **\` ${summary.reality}% \`**\n` +
      `- 📖 สิ่งผิดปกติที่บันทึกได้ในกะนี้: ${discoveredText}`
  });

  innerComponents.push({ type: 14, divider: true });

  // 3. Action Buttons (Continue Shift / Exit Cafe)
  const actionButtons = [
    {
      style: 3, // Green / Success
      type: 2,
      label: "🔄 เริ่มกะใหม่ (เล่นต่อ)",
      custom_id: "cafe_continue",
      flow: { actions: [] }
    },
    {
      style: 2, // Secondary / Grey
      type: 2,
      label: "🚪 ออกจากร้าน",
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
  buildCafeCompletePayload
};
