const axios = require("axios");

const EVENT_CONFIG = {
  create: { color: 0x57f287, title: "สร้างห้อง" },
  join: { color: 0x5865f2, title: "เข้าห้อง" },
  leave: { color: 0xed4245, title: "ออกห้อง" },
  move: { color: 0xfee75c, title: "ย้ายห้อง" },
};

function getWebhookUrl() {
  return process.env.ROOM_LOG_WEBHOOK_URL || "";
}

function avatarUrl(member) {
  return member.displayAvatarURL?.({ extension: "png", size: 128 })
    || member.user?.displayAvatarURL?.({ extension: "png", size: 128 })
    || null;
}

function roomName(channel) {
  return channel?.name || "unknown";
}

async function sendRoomLog(eventType, member, details = {}) {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) return;

  const config = EVENT_CONFIG[eventType];
  if (!config || !member?.user) return;

  const fields = [
    { name: "แท็ก", value: `<@${member.id}>`, inline: true },
    { name: "ไอดี", value: member.id, inline: true },
  ];

  if (eventType === "move") {
    fields.push(
      { name: "จากห้อง", value: roomName(details.oldChannel), inline: false },
      { name: "ไปห้อง", value: roomName(details.newChannel), inline: false },
    );
  } else {
    fields.push({ name: "ชื่อห้อง", value: roomName(details.channel), inline: false });
  }

  const avatar = avatarUrl(member);
  const embed = {
    title: config.title,
    color: config.color,
    thumbnail: avatar ? { url: avatar } : undefined,
    fields,
    timestamp: new Date().toISOString(),
  };

  try {
    await axios.post(webhookUrl, {
      username: "Smart Rooms Logs",
      embeds: [embed],
    }, { timeout: 10000 });
  } catch (err) {
    console.error("[roomLogger] webhook error:", err.message);
  }
}

module.exports = { sendRoomLog };
