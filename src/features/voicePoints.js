const axios = require("axios");
const crypto = require("crypto");
const { getSupabaseClient } = require("../services/supabaseClient");
const { isSupabaseQuotaError, shouldLogThrottledError } = require("../../utils/errorThrottler");

const EXCLUDED_CATEGORY_ID = "1524122689604816986";
const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000;
const CYCLE_SECONDS = 600;
const BASE_PER_CYCLE = 8;
const MAX_EARNED = 150;
const NOTIFY_CHANNEL_ID = "1524123147987714158";
const NOTIFY_COOLDOWN_MS = 15 * 60 * 1000;

const MULTIPLIER_TABLE = [
  { weight: 50, value: 1.0 },
  { weight: 30, value: 1.2 },
  { weight: 15, value: 1.5 },
  { weight: 4, value: 2.0 },
  { weight: 1, value: 3.0 },
];

const DAILY_CAP_MAP = {
  750: 150, 1000: 200, 1500: 250, 2000: 300, 2500: 350,
  3000: 400, 4000: 450, 5000: 500, 6000: 550, 7500: 600,
  9000: 700, 10000: 800, 12000: 1000,
};

function getDailyCap(maxCap) {
  return DAILY_CAP_MAP[maxCap] ?? 150;
}

function getTodayBangkok() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

function pickMultiplier() {
  const roll = Math.random() * 100;
  let cum = 0;
  for (const e of MULTIPLIER_TABLE) {
    cum += e.weight;
    if (roll < cum) return e.value;
  }
  return 1.0;
}

function calculateReward(duration, userCount) {
  const cycles = Math.floor(duration / CYCLE_SECONDS);
  if (cycles === 0) return 0;
  const base = cycles * BASE_PER_CYCLE;
  let earned = Math.round(base * pickMultiplier());
  if (userCount >= 3) earned = Math.round(earned * 1.1);
  if (duration >= 3600) earned += 20;
  return Math.min(earned, MAX_EARNED);
}

function applyDiminishing(current, maxCap, earned) {
  const r = current / maxCap;
  if (r >= 0.8) return Math.round(earned * 0.5);
  if (r >= 0.7) return Math.round(earned * 0.7);
  return earned;
}

const webhookQueue = [];
const recentWebhookEvents = new Map();
let webhookProcessing = false;

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function setupVoicePoints(client) {
  const supabase = getSupabaseClient();
  const webhookUrl = process.env.WEBHOOK_URL;
  const voicePointsUrl = process.env.VOICE_POINTS_URL;
  const voiceJoinTimes = new Map();

  function getUserCountInChannel(guild, channelId) {
    if (!channelId) return 0;
    return guild.voiceStates.cache.filter(
      (vs) => vs.channelId === channelId && !vs.member?.user?.bot
    ).size;
  }

  // ── 1. บันทึกสถานะห้องเสียง (Direct Supabase Bypass) ──
  async function syncVoiceState(userId, channelId, channelName, guildId) {
    if (supabase) {
      try {
        if (!channelId) {
          await supabase.from("voice_states").delete().eq("discord_user_id", userId);
          return;
        }

        const { data: existingRecord } = await supabase
          .from("voice_states")
          .select("channel_id, joined_at")
          .eq("discord_user_id", userId)
          .maybeSingle();

        const shouldUpdateJoinedAt = !existingRecord || existingRecord.channel_id !== channelId;
        const joinedAt = shouldUpdateJoinedAt ? new Date().toISOString() : existingRecord.joined_at;

        await supabase.from("voice_states").upsert({
          discord_user_id: userId,
          channel_id: channelId,
          channel_name: channelName,
          guild_id: guildId,
          is_connected: true,
          joined_at: joinedAt,
          updated_at: new Date().toISOString(),
        }, { onConflict: "discord_user_id" });
        return;
      } catch (err) {
        console.error("[voice-points] Direct voice_states sync error:", err.message);
      }
    }

    // Fallback เข้า Webhook เดิมหากไม่มี Supabase Client
    await sendWebhook({
      event: "VOICE_STATE_UPDATE",
      data: { user_id: userId, channel_id: channelId, channel_name: channelName, guild_id: guildId },
    });
  }

  // ── 2. แจกแต้มกิจกรรมเสียง (Direct Supabase Bypass) ──
  async function awardVoicePoints(userId, durationSeconds, userCount, channelName, parentId) {
    if (parentId === EXCLUDED_CATEGORY_ID) return;

    if (supabase) {
      try {
        const rawEarned = calculateReward(durationSeconds, userCount);
        if (rawEarned <= 0) return;

        const { data: row, error: fetchErr } = await supabase
          .from("user_points")
          .select("points, max_cap, daily_points, last_reset_date")
          .eq("discord_id", userId)
          .maybeSingle();

        if (fetchErr) {
          console.error("[voice-points] fetch user_points error:", fetchErr.message);
          return;
        }

        const current = row?.points ?? 0;
        const maxCap = row?.max_cap ?? 500;
        const dailyCap = getDailyCap(maxCap);
        const today = getTodayBangkok();
        const lastReset = row?.last_reset_date ?? "";
        const needsReset = lastReset !== today;
        const dailyPoints = needsReset ? 0 : (row?.daily_points ?? 0);

        if (current >= maxCap || dailyPoints >= dailyCap) {
          return;
        }

        let adjusted = applyDiminishing(current, maxCap, rawEarned);
        const dailyRemaining = dailyCap - dailyPoints;
        adjusted = Math.min(adjusted, dailyRemaining);

        const newPoints = Math.min(current + adjusted, maxCap);
        const actualEarned = newPoints - current;
        if (actualEarned <= 0) return;

        const newDailyPoints = dailyPoints + actualEarned;

        if (row) {
          await supabase.from("user_points").update({
            points: newPoints,
            daily_points: newDailyPoints,
            last_reset_date: today,
          }).eq("discord_id", userId);
        } else {
          await supabase.from("user_points").insert({
            discord_id: userId,
            points: actualEarned,
            max_cap: 500,
            daily_points: actualEarned,
            last_reset_date: today,
          });
        }

        console.log(`[voice-points] ${userId} +${actualEarned} pts (total: ${newPoints}/${maxCap})`);

        // แจ้งเตือนลงห้อง Discord
        await handleVoiceNotification(userId, actualEarned, channelName);
        return;
      } catch (err) {
        console.error("[voice-points] Direct award points error:", err.message);
      }
    }

    // Fallback เข้า Edge Function เดิมหากไม่มี Supabase Client
    if (!voicePointsUrl) return;
    const eventId = `voice-${userId}-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
    webhookQueue.push({
      event: "AWARD_VOICE_POINTS",
      data: { eventId, userId, duration: durationSeconds, userCount, channelName },
      isPointsApi: true,
    });
    processWebhookQueue().catch((err) => {
      console.error("[voice-points] webhook queue:", err.message);
    });
  }

  async function handleVoiceNotification(userId, earned, channelName) {
    try {
      if (!supabase) return;
      const { data: buf } = await supabase
        .from("user_notify_buffer")
        .select("pending_points, last_sent_at")
        .eq("user_id", userId)
        .maybeSingle();

      const now = new Date();
      const pending = (buf?.pending_points ?? 0) + earned;
      const lastSentAt = buf?.last_sent_at ? new Date(buf.last_sent_at) : new Date(0);
      const msSinceLast = now.getTime() - lastSentAt.getTime();

      if (msSinceLast < NOTIFY_COOLDOWN_MS) {
        await supabase.from("user_notify_buffer").upsert(
          { user_id: userId, pending_points: pending, last_sent_at: lastSentAt.toISOString() },
          { onConflict: "user_id" }
        );
        return;
      }

      await supabase.from("user_notify_buffer").upsert(
        { user_id: userId, pending_points: 0, last_sent_at: now.toISOString() },
        { onConflict: "user_id" }
      );

      let avatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";
      try {
        const { data: profile } = await supabase
          .from("profiles").select("avatar_url").eq("discord_id", userId).maybeSingle();
        if (profile?.avatar_url) avatarUrl = profile.avatar_url;
      } catch { /* silent */ }

      const componentPayload = {
        flags: 32768,
        components: [
          {
            type: 17,
            accent_color: null,
            components: [
              {
                type: 9,
                components: [
                  {
                    type: 10,
                    content: `## <:strawberryv2:1520439075100688614>︲__\` 𝖠𝖼𝗍𝗂𝗏𝗂𝗍𝗒 𝗉𝗈𝗂𝗇𝗍𝗌 ₊ แต้มลงห้อง 𓂃 \`__\n  - ยินดีด้วยนะคะ : <@${userId}> *!*\n  - คุณได้รับ **+${pending}** จากการลงห้อง **\`"${channelName}"\`** <:cuteplant:1152834055528783872>`,
                  },
                ],
                accessory: {
                  type: 11,
                  media: {
                    url: avatarUrl,
                  },
                },
              },
              {
                type: 14,
                spacing: 2,
              },
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 5,
                    label: "︲เช็กแต้มของคุณ",
                    emoji: {
                      id: "1212856675053346897",
                      name: "bearcafe_star",
                      animated: false,
                    },
                    url: "https://discord.com/channels/1144251788493602848/1524123727724417276",
                  },
                ],
              },
            ],
          },
        ],
      };

      const targetChannel = client?.channels?.cache?.get(NOTIFY_CHANNEL_ID) ||
        await client?.channels?.fetch(NOTIFY_CHANNEL_ID).catch(() => null);

      if (targetChannel && typeof targetChannel.send === "function") {
        await targetChannel.send(componentPayload).catch(() => {});
      } else if (client?.rest) {
        await client.rest.post(`/channels/${NOTIFY_CHANNEL_ID}/messages`, { body: componentPayload }).catch(() => {});
      }
    } catch (err) {
      console.error("[voice-points] handleVoiceNotification error:", err.message);
    }
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
        const res = await axios.post(voicePointsUrl, payload.data, { timeout: 10000 });
        const data = res.data;
        if (data.skipped) {
          console.log(`[voice-points] ${payload.data.userId} skipped: ${data.reason}`);
        } else {
          console.log(`[voice-points] ${payload.data.userId} +${data.earned} pts`);
        }
      } else if (webhookUrl) {
        await axios.post(webhookUrl, payload, { timeout: 10000 });
      }
    } catch (err) {
      const status = err.response?.status;
      const responseData = err.response?.data;
      const errorCode = responseData?.code;
      const isDegraded = errorCode === "SUPABASE_EDGE_RUNTIME_SERVICE_DEGRADED" || (typeof responseData?.message === "string" && responseData.message.includes("Service is temporarily unavailable"));

      const isQuota = isSupabaseQuotaError(err) || isSupabaseQuotaError(responseData);
      const isRetryable = !isQuota && (status === 429 || !status || status >= 500 || isDegraded);

      const retryAfterSeconds = Number(responseData?.retry_after);
      const retryWaitMs = Number.isFinite(retryAfterSeconds)
        ? Math.ceil(retryAfterSeconds * 1000)
        : Math.min(1000 * Math.pow(2, attempt) + Math.floor(Math.random() * 500), 10000);

      if (isRetryable && attempt < 3) {
        console.warn(`[voice-points] Webhook attempt ${attempt + 1}/3 failed (${status || errorCode || err.message}). Retrying in ${retryWaitMs}ms...`);
        await delay(retryWaitMs);
        return await postWebhook(payload, attempt + 1);
      }

      const { shouldLog, message } = shouldLogThrottledError("voice_points_webhook", responseData ?? err.message, 5 * 60 * 1000);
      if (shouldLog) {
        console.error("[voice-points] webhook:", message);
      }
    }
  }

  async function trackJoinState(guild) {
    for (const [memberId, voiceState] of guild.voiceStates.cache) {
      if (!voiceState.channelId || voiceState.member?.user?.bot) continue;
      if (voiceJoinTimes.has(memberId)) continue;

      voiceJoinTimes.set(memberId, {
        joinedAt: Date.now(),
        channelId: voiceState.channelId,
        channelName: voiceState.channel?.name ?? null,
        parentId: voiceState.channel?.parentId ?? null,
      });

      await syncVoiceState(
        memberId,
        voiceState.channelId,
        voiceState.channel?.name ?? null,
        guild.id
      );
    }
  }

  const { isIgnoredGuild } = require("../../utils/guildFilter");

  client.once("clientReady", async () => {
    for (const guild of client.guilds.cache.values()) {
      if (isIgnoredGuild(guild.id)) continue;
      await trackJoinState(guild);
    }
  });

  setInterval(async () => {
    if (!client.isReady()) return;
    for (const guild of client.guilds.cache.values()) {
      if (isIgnoredGuild(guild.id)) continue;
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

    await syncVoiceState(
      userId,
      newState.channelId || null,
      newState.channel?.name ?? null,
      newState.guild.id
    );
  });

  console.log("[voice-points] Module loaded successfully");
}

module.exports = { setupVoicePoints };
