// src/features/cafe/components/cafeMainPayload.js
// Main Round UI Payload for Bear Café (Component V2)

const FLAG_V2 = 32768; // MessageFlags.IsComponentsV2

function buildCafeMainPayload(session) {
  const customer = session.currentCustomer || { name: "ลูกค้าปริศนา", emoji: "🐻", dialogue: "..." };
  const order = session.currentOrder || { itemName: "กาแฟคุยยาว", icon: "☕" };

  const obsLeft = Math.max(0, session.observationsLimit - session.observationsUsed);

  const innerComponents = [];

  // 1. Header Section
  innerComponents.push({
    type: 9,
    components: [
      {
        type: 10,
        content:
          `## ☕︲__\` BEAR CAFÉ ₊ กะดึกส่องมิติ 𓂃 \`__\n` +
          `> 🌙 **กะดึก — Round ${session.round}/${session.maxRounds}** ︲ บาริสต้า: <@${session.userId}>`
      }
    ],
    accessory: {
      type: 11,
      media: {
        url: customer.avatar || "https://cdn.discordapp.com/attachments/1524704267015819274/1534568886135947415/IMG_25680923184720328.png"
      }
    }
  });

  innerComponents.push({ type: 14, spacing: 2 });

  // 2. Customer & Dialogue Card
  innerComponents.push({
    type: 10,
    content:
      `### ${customer.emoji}︰__\` ลูกค้า: ${customer.name} \`__\n` +
      `- บุคลิก: *${customer.personality}*\n` +
      `- พฤติกรรม: ${customer.behavior}\n` +
      `> 💬 **"${customer.dialogue}"**`
  });

  innerComponents.push({ type: 14, divider: true });

  // 3. Order Information Card
  innerComponents.push({
    type: 10,
    content:
      `### 📋︰__\` รายการสั่งซื้อ (Order) \`__\n` +
      `> ${order.icon} **${order.itemName}**\n` +
      `- 📏 ขนาด: \`${order.size}\`\n` +
      `- 🍬 ความหวาน: \`${order.sugar}\`\n` +
      `- 🌡️ อุณหภูมิ: \`${order.temperature}\`\n` +
      `- 🍯 ท็อปปิ้ง: \`${order.topping}\``
  });

  innerComponents.push({ type: 14, divider: true });

  // 4. Café Status (Reality, Trust, Anomaly Level, Coins, Tokens)
  const realityBar = "█".repeat(Math.round(session.reality / 10)) + "░".repeat(10 - Math.round(session.reality / 10));
  const trustBar = "█".repeat(Math.round(session.trust / 10)) + "░".repeat(10 - Math.round(session.trust / 10));

  innerComponents.push({
    type: 10,
    content:
      `### 🏪︰__\` สถานะคาเฟ่ (Café Status) \`__\n` +
      `❤️ **Trust:** \`${session.trust}%\` ︲ \`[${trustBar}]\`\n` +
      `🌀 **Reality:** \`${session.reality}%\` ︲ \`[${realityBar}]\`\n` +
      `⚠️ **Anomaly Threat:** \`Level ${session.anomalyLevel}\` ︲ 🔎 **สิทธิ์ตรวจสอบคงเหลือ:** \`${obsLeft}/${session.observationsLimit}\`\n` +
      `💰 **Coins:** \`${session.coins}\` ︲ 👁️ **Tokens:** \`${session.anomalyTokens}\` ︲ 🎯 **จับถูก:** \`${session.correctDetections}\` ︲ ❌ **พลาด:** \`${session.mistakes}\``
  });

  innerComponents.push({ type: 14, spacing: 2 });

  // 5. Action Buttons (Observe, Serve, Detect Anomaly)
  const actionButtons = [
    {
      style: 2, // Secondary / Grey
      type: 2,
      label: `🔎 ตรวจสอบ (${obsLeft})`,
      custom_id: "cafe_observe_menu",
      disabled: obsLeft <= 0,
      flow: { actions: [] }
    },
    {
      style: 1, // Blurple
      type: 2,
      label: "☕ ไปที่เคาน์เตอร์ชง",
      custom_id: "cafe_brew_menu",
      flow: { actions: [] }
    },
    {
      style: 4, // Danger / Red
      type: 2,
      label: "🚨 ตรวจจับ Anomaly",
      custom_id: "cafe_anomaly",
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
  buildCafeMainPayload
};
