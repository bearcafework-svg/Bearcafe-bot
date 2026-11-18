// src/features/coinGacha/coinGachaWebhook.js
// ส่ง Log การสุ่มรางวัลแบบ Real-time ไปยัง Discord Webhook

const axios = require("axios");
const { WEBHOOK_URL } = require("./coinGachaConfig");

/**
 * ส่งแจ้งเตือนการสุ่มรางวัลไปยัง Webhook
 * @param {Object} params
 * @param {string} params.discordId - ID ของผู้เล่น
 * @param {string} params.userAvatar - URL รูปโปรไฟล์
 * @param {string} params.tier - ระดับรางวัล (god, epic, rare, common)
 * @param {string} params.rewardName - ชื่อรางวัล
 * @param {number} params.timestamp - Unix Timestamp (วินาที)
 */
async function sendRollLogWebhook({ discordId, userAvatar, tier, rewardName, timestamp }) {
  if (!WEBHOOK_URL) return;

  const ts = timestamp || Math.floor(Date.now() / 1000);
  const avatar = userAvatar || "https://cdn.discordapp.com/embed/avatars/0.png";

  const tierDisplayMap = {
    god: "God 🌟",
    epic: "Epic 🔮",
    rare: "Rare 💎",
    common: "Common 🍃"
  };

  const payload = {
    embeds: [
      {
        color: 16711422,
        title: "แจ้งเตือนรางวัล",
        thumbnail: {
          url: avatar
        },
        fields: [
          {
            name: "ชื่อ",
            value: `<@${discordId}>`,
            inline: true
          },
          {
            name: "ระดับของรางวัล",
            value: tierDisplayMap[tier.toLowerCase()] || tier,
            inline: true
          },
          {
            name: "รางวัล",
            value: rewardName
          },
          {
            name: "เวลา",
            value: `<t:${ts}:F> — <t:${ts}:R>`
          }
        ]
      }
    ]
  };

  try {
    await axios.post(WEBHOOK_URL, payload, { timeout: 8000 });
  } catch (err) {
    console.error("[coinGachaWebhook] Failed to send roll log:", err.message);
  }
}

module.exports = {
  sendRollLogWebhook
};
