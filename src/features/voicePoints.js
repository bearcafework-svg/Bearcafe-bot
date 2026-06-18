const axios = require("axios");
const crypto = require("crypto");

const EXCLUDED_CATEGORY_ID = "1145057060686397611";
const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000;

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
    try {
      await axios.post(webhookUrl, payload, { timeout: 10000 });
    } catch (err) {
      console.error("[voice-points] webhook:", err.response?.data ?? err.message);
    }
  }

  async function awardVoicePoints(userId, durationSeconds, userCount, channelName, parentId) {
    if (!voicePointsUrl) return;
    if (parentId === EXCLUDED_CATEGORY_ID) return;

    const eventId = `voice-${userId}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    try {
      const res = await axios.post(
        voicePointsUrl,
        { eventId, userId, duration: durationSeconds, userCount, channelName },
        { timeout: 10000 }
      );
      const data = res.data;
      if (data.skipped) {
        console.log(`[voice-points] ${userId} skipped: ${data.reason}`);
      } else {
        console.log(`[voice-points] ${userId} +${data.earned} pts`);
      }
    } catch (err) {
      console.error(`[voice-points] ${userId}:`, err.response?.data ?? err.message);
    }
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
