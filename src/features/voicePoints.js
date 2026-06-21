const axios = require("axios");
const crypto = require("crypto");

const EXCLUDED_CATEGORY_ID = "1145057060686397611";
const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000;

const webhookQueue = [];
const recentWebhookEvents = new Map();
let webhookProcessing = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setupVoicePoints(client) {
  const webhookUrl = process.env.WEBHOOK_URL;
  const voicePointsUrl = process.env.VOICE_POINTS_URL;
  const voiceJoinTimes = new Map();

  function getUserCountInChannel(guild, channelId) {
    if (!channelId) return 0;
    return guild.voiceStates.cache.filter(
      (vs) => vs.channelId === channelId && !vs.member?.user?.bot
    ).size;
  }

  async function sendWebhook(payload) {
    if (!webhookUrl) return;

    const key = `${payload.event}:${payload.data?.user_id}:${payload.data?.channel_id || "none"}`;
    const now = Date.now();
    const previous = recentWebhookEvents.get(key);
    recentWebhookEvents.set(key, now);
    for (const [eventKey, timestamp] of recentWebhookEvents) {
      if (now - timestamp > 10000) recentWebhookEvents.delete(eventKey);
    }
    if (previous && now - previous < 3000) return;

    webhookQueue.push(payload);
    processWebhookQueue().catch((err) => {
      console.error("[voice-points] webhook queue:", err.message);
    });
  }

  async function processWebhookQueue() {
    if (webhookProcessing) return;
    webhookProcessing = true;

    while (webhookQueue.length > 0) {
      const payload = webhookQueue.shift();
      await postWebhook(payload);
      await delay(350);
    }

    webhookProcessing = false;
  }

  async function postWebhook(payload, attempt = 0) {
    try {
      if (payload.isPointsApi && voicePointsUrl) {
        // Use voice points API
        const res = await axios.post(voicePointsUrl, payload.data, { timeout: 10000 });
        const data = res.data;
        if (data.skipped) {
          console.log(`[voice-points] ${payload.data.userId} skipped: ${data.reason}`);
        } else {
          console.log(`[voice-points] ${payload.data.userId} +${data.earned} pts`);
        }
      } else if (webhookUrl) {
        // Use webhook URL
        await axios.post(webhookUrl, payload, { timeout: 10000 });
      }
    } catch (err) {
      const status = err.response?.status;
      const retryAfterSeconds = Number(err.response?.data?.retry_after);
      const retryAfterMs = Number.isFinite(retryAfterSeconds)
        ? Math.ceil(retryAfterSeconds * 1000)
        : 1000 * (attempt + 1);

      if (status === 429 && attempt < 3) {
        await delay(Math.min(retryAfterMs + 250, 10000));
        return await postWebhook(payload, attempt + 1);
      }

      console.error("[voice-points] webhook:", err.response?.data ?? err.message);
    }
  }

  async function awardVoicePoints(userId, durationSeconds, userCount, channelName, parentId) {
    if (!voicePointsUrl) return;
    if (parentId === EXCLUDED_CATEGORY_ID) return;

    const eventId = `voice-${userId}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    
    // Add to webhook queue for rate limiting
    webhookQueue.push({
      event: "AWARD_VOICE_POINTS",
      data: {
        eventId,
        userId,
        duration: durationSeconds,
        userCount,
        channelName,
      },
      isPointsApi: true,
    });
    processWebhookQueue().catch((err) => {
      console.error("[voice-points] webhook queue:", err.message);
    });
  }

  async function trackJoinState(guild) {
    for (const [memberId, voiceState] of guild.voiceStates.cache) {
      if (!voiceState.channelId || voiceState.member?.user?.bot) continue;

      voiceJoinTimes.set(memberId, {
        joinedAt: Date.now(),
        channelId: voiceState.channelId,
        channelName: voiceState.channel?.name ?? null,
        parentId: voiceState.channel?.parentId ?? null,
      });

      await sendWebhook({
        event: "VOICE_STATE_UPDATE",
        data: {
          user_id: memberId,
          channel_id: voiceState.channelId,
          channel_name: voiceState.channel?.name ?? null,
          guild_id: guild.id,
        },
      });
    }
  }

  client.once("clientReady", async () => {
    for (const guild of client.guilds.cache.values()) {
      await trackJoinState(guild);
    }
  });

  setInterval(async () => {
    if (!client.isReady()) return;
    for (const guild of client.guilds.cache.values()) {
      await trackJoinState(guild);
    }
  }, HEARTBEAT_INTERVAL_MS);

  client.on("voiceStateUpdate", async (oldState, newState) => {
    if (oldState.channelId === newState.channelId) return;

    const userId = newState.id;
    const isBot = newState.member?.user?.bot ?? oldState.member?.user?.bot ?? false;
    if (isBot) return;

    if (oldState.channelId) {
      const session = voiceJoinTimes.get(userId);
      if (session) {
        const durationSeconds = Math.floor((Date.now() - session.joinedAt) / 1000);
        const userCount = getUserCountInChannel(oldState.guild, oldState.channelId) + 1;
        const channelName = oldState.channel?.name ?? session.channelName ?? "ห้องพูดคุย";
        const parentId = oldState.channel?.parentId ?? session.parentId ?? null;
        await awardVoicePoints(userId, durationSeconds, userCount, channelName, parentId);
      }
      voiceJoinTimes.delete(userId);
    }

    if (newState.channelId) {
      voiceJoinTimes.set(userId, {
        joinedAt: Date.now(),
        channelId: newState.channelId,
        channelName: newState.channel?.name ?? null,
        parentId: newState.channel?.parentId ?? null,
      });
    }

    await sendWebhook({
      event: "VOICE_STATE_UPDATE",
      data: {
        user_id: userId,
        channel_id: newState.channelId || null,
        channel_name: newState.channel?.name ?? null,
        guild_id: newState.guild.id,
      },
    });
  });

  console.log("[voice-points] Module loaded successfully");
}

module.exports = { setupVoicePoints };
