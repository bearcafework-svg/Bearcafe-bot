// src/features/cafe/components/cafeBrewingPayload.js
// Brewing Station UI Payload (Component V2)

const FLAG_V2 = 32768; // MessageFlags.IsComponentsV2
const { evaluateBrewMatch } = require("../systems/brewingSystem");

function buildCafeBrewingPayload(session) {
  const order = session.currentOrder || { itemName: "กาแฟคุยยาว", icon: "☕" };
  const brew = session.currentBrew || { itemName: "กาแฟคุยยาว", icon: "☕" };
  const evaluation = evaluateBrewMatch(order, brew);

  const innerComponents = [];

  // 1. Top Image Banner
  innerComponents.push({
    type: 12,
    items: [
      {
        media: {
          url: "attachment://brew_cup.png"
        }
      }
    ]
  });

  innerComponents.push({ type: 14, spacing: 2 });

  // 2. Header Section
  innerComponents.push({
    type: 10,
    content:
      `## ☕︲__\` BREWING STATION ₊ เคาน์เตอร์ชงเครื่องดื่ม 𓂃 \`__\n` +
      `> 🌙 **Round ${session.round}/${session.maxRounds}** ︲ ผสมส่วนผสมตามออเดอร์ของลูกค้าให้ถูกต้อง`
  });

  innerComponents.push({ type: 14, spacing: 2 });

  // 2. Customer Order Reminder & Current Brew Recipe
  const matchIndicator = evaluation.isPerfectMatch
    ? `✨ **สูตรตรงเป๊ะ 100%! (พร้อมเสิร์ฟ)**`
    : `⚠️ ความถูกต้องของสูตร: **${evaluation.matchScore}%**`;

  innerComponents.push({
    type: 10,
    content:
      `### 📋︰__\` ออเดอร์ที่ลูกค้าสั่ง \`__\n` +
      `> ${order.icon} **${order.itemName}** (${order.temperature})\n` +
      `> 🍬 ${order.sugar} ︲ 🍯 ${order.topping}\n\n` +
      `━━━━━━━━━━━━━━━━━━\n` +
      `### 🥛︰__\` แก้วที่กำลังชงอยู่บนเคาน์เตอร์ \`__\n` +
      `- ☕ **เบสเครื่องดื่ม:** \`${brew.itemName}\`\n` +
      `- 🌡️ **อุณหภูมิ:** \`${brew.temperature}\`\n` +
      `- 🍬 **ระดับความหวาน:** \`${brew.sugar}\`\n` +
      `- 🍯 **ท็อปปิ้ง:** \`${brew.topping}\`\n\n` +
      `> ${matchIndicator}`
  });

  innerComponents.push({ type: 14, divider: true });

  // 3. Ingredient Control Buttons (Row 1)
  const row1 = [
    {
      style: 2, // Secondary
      type: 2,
      label: `☕ เมนู: ${brew.itemName.split(" ")[0]}`,
      custom_id: "cafe_brew_base",
      flow: { actions: [] }
    },
    {
      style: 2,
      type: 2,
      label: `🌡️ ${brew.temperature.split(" ")[0]}`,
      custom_id: "cafe_brew_temp",
      flow: { actions: [] }
    },
    {
      style: 2,
      type: 2,
      label: `🍬 ${brew.sugar.split(" ")[0]}`,
      custom_id: "cafe_brew_sugar",
      flow: { actions: [] }
    },
    {
      style: 2,
      type: 2,
      label: `🍯 ${brew.topping.split(" ")[0]}`,
      custom_id: "cafe_brew_topping",
      flow: { actions: [] }
    }
  ];

  // 4. Action Buttons (Row 2)
  const row2 = [
    {
      style: 3, // Success / Green
      type: 2,
      label: "✨ เสิร์ฟแก้วนี้ให้ลูกค้า",
      custom_id: "cafe_brew_serve",
      flow: { actions: [] }
    },
    {
      style: 2, // Grey
      type: 2,
      label: "🧹 รีเซ็ตแก้ว",
      custom_id: "cafe_brew_reset",
      flow: { actions: [] }
    },
    {
      style: 1, // Blurple
      type: 2,
      label: "⬅️ กลับหน้าร้าน",
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
  buildCafeBrewingPayload
};
