// src/main/features/gachapon/gachaPayloads.js
// ตัวสร้าง Discord Component V2 Payloads สำหรับระบบตู้กาชาปอง Bear Cafe

const {
  FLAG_V2,
  FLAG_V2_EPHEMERAL,
  DEFAULT_BANNER_URL,
  RARITY_EMOJIS,
  RARITY_NAMES,
  CATEGORY_EMOJIS,
} = require("./gachaConstants");

/**
 * 1. แผงควบคุมหลักตู้กาชาปอง (Gachapon Main Board Component V2)
 */
function buildGachaMainPayload(user, userPoints, settings, items) {
  const isDev = Boolean(settings?.dev_unlimited);
  const singlePrice = settings?.single_roll_price || 100;
  const tenPrice = settings?.ten_roll_price || 900;
  const bannerUrl = settings?.banner_url || DEFAULT_BANNER_URL;

  const modeBadge = isDev
    ? "> 🟢 **โหมดทดสอบ (Dev Mode):** หมุนฟรีได้ไม่จำกัดจำนวนครั้ง ✨"
    : `> 🪙 **แต้มคงเหลือของคุณ:** \`${userPoints || 0}\` แต้ม`;

  // สรุปไฮไลท์รางวัล
  const rewardHighlights = (items || [])
    .slice(0, 4)
    .map((it) => `- ${RARITY_EMOJIS[it.rarity] || "⚪"} **${it.name}**`)
    .join("\n");

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17, // Container
        components: [
          {
            type: 12, // Media
            items: [{ media: { url: bannerUrl } }]
          },
          { type: 14, spacing: 2 },
          {
            type: 10, // Text
            content:
              `## 🎰︲__\` 𝖡𝖾𝖺𝗋 𝖢𝖺𝖿𝖾 𝖫𝗎𝖼𝗄𝗒 𝖦𝖺𝖼𝗁𝖺 ₊ ตู้สุ่มของรางวัลคาเฟ่ 𓂃 \`__\n` +
              `ยินดีต้อนรับสู่ตู้หมุนกาชาปองนำโชคแห่ง **Bear Cafe** 🐻✨\n` +
              `ลุ้นรับสิทธิ์บ้านเช่าห้องเสียง, ยศสีพิเศษ, ยศบทบาท และแต้มสะสมมากมาย!\n\n` +
              `${modeBadge}\n\n` +
              `**🎁 รางวัลไฮไลท์ในตู้:**\n${rewardHighlights || "- กำลังอัปเดตรายการรางวัล..."}`
          },
          { type: 14, spacing: 2, divider: true },
          {
            type: 1, // ActionRow (Buttons)
            components: [
              {
                type: 2,
                style: 1, // Primary (Blue)
                label: isDev ? "หมุน 1 ครั้ง (ฟรี)" : `หมุน 1 ครั้ง (${singlePrice} แต้ม)`,
                emoji: { name: "🎲" },
                custom_id: "gacha_roll_1"
              },
              {
                type: 2,
                style: 3, // Success (Green)
                label: isDev ? "หมุน 10 ครั้ง (ฟรี)" : `หมุน 10 ครั้ง (${tenPrice} แต้ม)`,
                emoji: { name: "🎰" },
                custom_id: "gacha_roll_10"
              },
              {
                type: 2,
                style: 2, // Secondary (Grey)
                label: "อัตราดรอป",
                emoji: { name: "📊" },
                custom_id: "gacha_view_rates"
              },
              {
                type: 2,
                style: 2,
                label: "ประวัติของฉัน",
                emoji: { name: "📜" },
                custom_id: "gacha_my_history"
              }
            ]
          }
        ]
      }
    ]
  };
}

/**
 * 2. การ์ดแสดงผลลัพธ์การหมุนกาชาปอง (Ephemeral Component V2)
 */
function buildGachaResultPayload(user, rollData, settings) {
  const { results, isDevUnlimited, costPaid, totalBonusPointsGranted, finalPoints } = rollData;
  const count = results.length;

  const resultLines = results.map((r, idx) => {
    const item = r.item;
    const rarityEmoji = RARITY_EMOJIS[item.rarity] || "⚪";
    const catEmoji = CATEGORY_EMOJIS[item.category] || "🎁";
    let statusNote = "";

    if (r.isDuplicate) {
      statusNote = ` *(มีอยู่แล้ว ➔ ได้รับแต้มชดเชย +${r.compensatedPoints} แต้มแทน)*`;
    }

    return `> **#${idx + 1}** ${rarityEmoji} ${catEmoji} **${item.name}**${statusNote}`;
  });

  const costSummary = isDevUnlimited
    ? "⚡ **โหมดทดสอบ:** ฟรี (ไม่หักแต้ม)"
    : `💸 **หักค่าหมุน:** \`-${costPaid}\` แต้ม | 💰 **แต้มคงเหลือ:** \`${finalPoints}\` แต้ม`;

  return {
    flags: FLAG_V2_EPHEMERAL,
    components: [
      {
        type: 17,
        components: [
          { type: 14, spacing: 2 },
          {
            type: 10,
            content:
              `## 🎉︲__\` ผลการหมุนกาชาปอง (${count} ครั้ง) 𓂃 \`__\n` +
              `<@${user.id}> หมุนตู้ไข่สำเร็จแล้วค่ะ! นี่คือสิ่งที่คุณได้รับ:\n\n` +
              `${resultLines.join("\n")}\n\n` +
              `${costSummary}\n` +
              `-# รางวัลที่เป็น Role / แต้ม / วันบ้านเช่า ได้รับการบันทึกและส่งมอบเข้าบัญชีของคุณเรียบร้อยแล้วค่ะ 🐻💖`
          },
          { type: 14, spacing: 2 }
        ]
      }
    ]
  };
}

/**
 * 3. การ์ดแสดงอัตราการดรอปของตู้กาชาปอง (Rates Modal / Card)
 */
function buildGachaRatesPayload(items, settings) {
  const totalWeight = items.reduce((sum, item) => sum + Math.max(1, Number(item.weight || 1)), 0);

  const rateRows = items.map((it) => {
    const percent = ((Number(it.weight || 1) / totalWeight) * 100).toFixed(2);
    const rarityEmoji = RARITY_EMOJIS[it.rarity] || "⚪";
    return `> ${rarityEmoji} **${it.name}** — \`${percent}%\` *(น้ำหนัก ${it.weight})*`;
  });

  return {
    flags: FLAG_V2_EPHEMERAL,
    components: [
      {
        type: 17,
        components: [
          { type: 14, spacing: 2 },
          {
            type: 10,
            content:
              `## 📊︲__\` ตารางอัตราการออกรางวัล (Gacha Drop Rates) 𓂃 \`__\n` +
              `อัตราการออกของรางวัลทั้งหมดคำนวณตามสัดส่วนน้ำหนัก (Total Weight: \`${totalWeight}\`):\n\n` +
              `${rateRows.join("\n") || "> ยังไม่มีรายการของรางวัล"}\n\n` +
              `-# หมายเหตุ: หากสุ่มได้ Role หรือยศสีซ้ำ ระบบจะแปลงเป็นแต้มโบนัสชดเชยให้อัตโนมัติค่ะ`
          },
          { type: 14, spacing: 2 }
        ]
      }
    ]
  };
}

/**
 * 4. การ์ดแสดงประวัติการสุ่มกาชาปองส่วนตัว
 */
function buildGachaHistoryPayload(user, historyList) {
  const lines = (historyList || []).map((h) => {
    const rawDate = h.created_at ? new Date(h.created_at) : new Date();
    const ts = Math.floor(rawDate.getTime() / 1000);
    const rarityEmoji = RARITY_EMOJIS[h.rarity] || "⚪";
    const dupNote = h.is_duplicate ? ` *(ซ้ำ ➔ +${h.compensated_points} แต้ม)*` : "";
    return `> <t:${ts}:R> — ${rarityEmoji} **${h.item_name}**${dupNote}`;
  });

  return {
    flags: FLAG_V2_EPHEMERAL,
    components: [
      {
        type: 17,
        components: [
          { type: 14, spacing: 2 },
          {
            type: 10,
            content:
              `## 📜︲__\` ประวัติการสุ่มกาชาปองล่าสุดของคุณ 𓂃 \`__\n` +
              `<@${user.id}> รายการของรางวัลที่คุณเคยได้รับ 10 ครั้งล่าสุด:\n\n` +
              `${lines.length > 0 ? lines.join("\n") : "> คุณยังไม่มีประวัติการหมุนกาชาปองในระบบค่ะ"}`
          },
          { type: 14, spacing: 2 }
        ]
      }
    ]
  };
}

module.exports = {
  buildGachaMainPayload,
  buildGachaResultPayload,
  buildGachaRatesPayload,
  buildGachaHistoryPayload
};
