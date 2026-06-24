const axios = require("axios");

const EVENT_CONFIG = {
  create: { color: 0x57f287, title: "สร้างห้อง" },
  join: { color: 0x5865f2, title: "เข้าห้อง" },
  leave: { color: 0xed4245, title: "ออกห้อง" },
  move: { color: 0xfee75c, title: "ย้ายห้อง" },
};

const queue = [];
const recentMessages = new Map();
let processing = false;
let globalBlockUntil = 0; // ถ้าถูก Discord block ชั่วคราว หยุดส่งจนกว่าจะพ้นเวลา
const QUEUE_MAX = 50; // cap queue ไม่ให้พองไม่หยุด

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function dedupeKey(eventType, member, details) {
  const oldChannelId = details.oldChannel?.id || "";
  const newChannelId = details.newChannel?.id || details.channel?.id || "";
  return [eventType, member.id, oldChannelId, newChannelId].join(":");
}

function shouldSkipDuplicate(key) {
  const now = Date.now();
  const previous = recentMessages.get(key);
  recentMessages.set(key, now);

  for (const [entryKey, timestamp] of recentMessages) {
    if (now - timestamp > 10000) recentMessages.delete(entryKey);
  }

  return previous && now - previous < 3000;
}

async function postWebhook(webhookUrl, payload, attempt = 0) {
  try {
    await axios.post(webhookUrl, payload, { timeout: 5000 });
  } catch (err) {
    const status = err.response?.status;
    const data = err.response?.data;

    // Discord global block (code: 0) — หยุดส่ง queue 30 วินาที
    if (data?.code === 0) {
      globalBlockUntil = Date.now() + 30000;
      console.warn("[roomLogger] Discord global rate limit — หยุดส่ง 30 วินาที");
      return;
    }

    const retryAfterSeconds = Number(data?.retry_after);
    const retryAfterMs = Number.isFinite(retryAfterSeconds)
      ? Math.ceil(retryAfterSeconds * 1000)
      : 1000 * (attempt + 1);

    if (status === 429 && attempt < 3) {
      await delay(Math.min(retryAfterMs + 250, 10000));
      return await postWebhook(webhookUrl, payload, attempt + 1);
    }

    console.error("[roomLogger] webhook error:", data ?? err.message);
  }
}

async function processQueue() {
  if (processing) return;
  processing = true;

  while (queue.length > 0) {
    // ถ้าถูก block อยู่ — รอจนพ้นเวลาแล้วค่อยส่งต่อ
    const waitMs = globalBlockUntil - Date.now();
    if (waitMs > 0) {
      await delay(waitMs);
    }

    const item = queue.shift();
    await postWebhook(item.webhookUrl, item.payload);
    await delay(350);
  }

  processing = false;
}

async function sendRoomLog(eventType, member, details = {}) {
  const webhookUrl = getWebhookUrl();
  if (!webhookUrl) return;

  const config = EVENT_CONFIG[eventType];
  if (!config || !member?.user) return;

  const key = dedupeKey(eventType, member, details);
  if (shouldSkipDuplicate(key)) return;

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

  // ไม่รับ log ใหม่ถ้า queue เต็มหรือถูก block อยู่
  if (queue.length >= QUEUE_MAX || Date.now() < globalBlockUntil) return;

  queue.push({
    webhookUrl,
    payload: {
      username: "Smart Rooms Logs",
      embeds: [embed],
    },
  });
  processQueue().catch((err) => console.error("[roomLogger] queue error:", err.message));
}

module.exports = { sendRoomLog };
