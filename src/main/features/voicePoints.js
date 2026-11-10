const axios = require("axios");
const crypto = require("crypto");
const { getSupabaseClient } = require("../../services/supabaseClient");
const { isSupabaseQuotaError, shouldLogThrottledError } = require("../../../utils/errorThrottler");
const sharedSettings = require("../sharedSettings.json");
const roleBlacklist = sharedSettings.role_blacklist || [];

const EXCLUDED_CATEGORY_ID = "1524122689604816986";
const HEARTBEAT_INTERVAL_MS = 15 * 60 * 1000;
const CYCLE_SECONDS = 600;
const BASE_PER_CYCLE = 8;
const MAX_EARNED = 150;
const NOTIFY_CHANNEL_ID = "1524123147987714158";
const NOTIFY_COOLDOWN_MS = 15 * 60 * 1000;

/**
 * ส่งการ์ดแจ้งเตือน Component V2 ผ่าน Webhook โดยแนบ ?with_components=true
 * เพื่อให้ Discord API ยอมรับ MessageFlags.IS_COMPONENTS_V2 (32768) โดยไม่ต้องมี content
 */
async function sendComponentV2Webhook(webhookUrl, payload) {
  if (!webhookUrl) return false;
  const separator = webhookUrl.includes("?") ? "&" : "?";
  const targetUrl = webhookUrl.includes("with_components=true")
    ? webhookUrl
    : `${webhookUrl}${separator}with_components=true`;
  const res = await axios.post(targetUrl, payload, { timeout: 10000 });
  return res.status === 200 || res.status === 204;
}

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
  const isLimited = maxCap >= 15000;
  const baseCap = isLimited ? (maxCap - 15000) : maxCap;
  const baseDaily = DAILY_CAP_MAP[baseCap] ?? (baseCap >= 12000 ? 1000 : 150);
  return isLimited ? (baseDaily + 1500) : baseDaily;
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
  if (duration < CYCLE_SECONDS) return 0;
  const cycles = duration / CYCLE_SECONDS;
  const base = Math.round(cycles * BASE_PER_CYCLE);
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

        const session = voiceJoinTimes.get(userId);
        const joinedAt = session?.joinedAt ? new Date(session.joinedAt).toISOString() : new Date().toISOString();

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
  async function awardVoicePoints(userId, durationSeconds, userCount, channelName, parentId, member = null, isRealtimeCycle = false) {
    if (parentId === EXCLUDED_CATEGORY_ID) return;

    // 🚫 ตรวจสอบ role_blacklist (ข้ามสมาชิกที่ติด blacklist)
    if (member && member.roles?.cache) {
      const isBlacklisted = member.roles.cache.some((r) => roleBlacklist.includes(r.id));
      if (isBlacklisted) {
        console.log(`[voice-points] ⏭️ Skipped points for ${member.user?.tag || userId} (role_blacklist)`);
        return;
      }
    }

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
          // แม้แต้มหลักเต็ม ยังเปิดโอกาสสุ่มดรอป Star Coin ในรอบเรียลไทม์ได้
          if (isRealtimeCycle) {
            try {
              const { checkVoiceStarCoinDrop } = require("./starCoin");
              if (typeof checkVoiceStarCoinDrop === "function") {
                checkVoiceStarCoinDrop(client, supabase, userId, member?.guild);
              }
            } catch {}
          }
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

        // แจ้งเตือนลงห้อง Discord (สะสมแต้มไว้ใน Buffer ระหว่างอยู่ในห้อง)
        await handleVoiceNotification(userId, actualEarned, channelName, isRealtimeCycle);

        // 🌟 สุ่มดรอป Star Coin (Gacha Coin) เฉพาะรอบเรียลไทม์
        if (isRealtimeCycle) {
          try {
            const { checkVoiceStarCoinDrop } = require("./starCoin");
            if (typeof checkVoiceStarCoinDrop === "function") {
              checkVoiceStarCoinDrop(client, supabase, userId, member?.guild);
            }
          } catch {}
        }
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

  async function handleVoiceNotification(userId, earned, channelName, isRealtimeCycle = false) {
    try {
      if (!supabase) return;
      const { data: buf } = await supabase
        .from("user_notify_buffer")
        .select("pending_points, last_sent_at")
        .eq("user_id", userId)
        .maybeSingle();

      const now = new Date();
      const pending = (buf?.pending_points ?? 0) + (earned || 0);

      // 1. ระหว่างที่ยังอยู่ในห้องเสียง (รอบคำนวณเรียลไทม์): สะสมแต้มไว้ใน Buffer เท่านั้น ไม่ส่งแจ้งเตือน
      if (isRealtimeCycle) {
        if (earned > 0) {
          await supabase.from("user_notify_buffer").upsert(
            { user_id: userId, pending_points: pending, last_sent_at: buf?.last_sent_at || now.toISOString() },
            { onConflict: "user_id" }
          );
        }
        return;
      }

      // 2. เมื่อออกจากห้องเสียง หรือย้ายห้อง: เคลียร์ยอดสะสมใน Buffer คืนค่า 0
      await supabase.from("user_notify_buffer").upsert(
        { user_id: userId, pending_points: 0, last_sent_at: now.toISOString() },
        { onConflict: "user_id" }
      );

      // 3. เงื่อนไข: ต้องได้รับแต้มสะสมใน Session นั้นอย่างน้อย 1 แต้มขึ้นไป ถึงจะส่งการ์ดสรุปยอด
      if (pending < 1) {
        return;
      }

      let avatarUrl = null;
      try {
        // 1. ดึงจาก Guild Member Cache ก่อนเพื่อลดการยิง Discord API
        const notifyChannel = client.channels.cache.get(NOTIFY_CHANNEL_ID);
        const targetGuild = notifyChannel?.guild || client.guilds.cache.first();
        if (targetGuild) {
          const cachedMember = targetGuild.members.cache.get(userId);
          const member = cachedMember || (await targetGuild.members.fetch(userId).catch(() => null));
          if (member) {
            avatarUrl = member.displayAvatarURL({ extension: "png", size: 256, forceStatic: true });
          }
        }

        // 2. ถ้าไม่มีใน Guild ให้ลองดึงจาก User Cache หรือ User API
        if (!avatarUrl) {
          const cachedUser = client.users.cache.get(userId);
          const user = cachedUser || (await client.users.fetch(userId).catch(() => null));
          if (user) {
            avatarUrl = user.displayAvatarURL({ extension: "png", size: 256, forceStatic: true });
          }
        }
      } catch (err) {
        console.warn(`[voice-points] Error fetching Discord avatar for ${userId}:`, err.message);
      }

      // 3. Fallback: ถ้า Discord API ดึงไม่ได้ ให้ลองดึงจาก profiles ใน Supabase
      if (!avatarUrl) {
        try {
          const { data: profile } = await supabase
            .from("profiles").select("avatar_url").eq("discord_id", userId).maybeSingle();
          if (profile?.avatar_url) avatarUrl = profile.avatar_url;
        } catch { /* silent */ }
      }

      // 4. Default Fallback
      if (!avatarUrl) {
        avatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";
      }

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
                    label: "︲คลิกเพื่อเช็กแต้ม",
                    emoji: {
                      id: "1522154708200849449",
                      name: "bagpack_icon",
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

      const voiceWebhookUrl = process.env.VOICE_POINTS_WEBHOOK_URL;
      let sentViaWebhook = false;

      if (voiceWebhookUrl) {
        try {
          await sendComponentV2Webhook(voiceWebhookUrl, componentPayload);
          sentViaWebhook = true;
        } catch (webhookErr) {
          console.error("[voice-points] Webhook notification failed, falling back to channel.send:", webhookErr.response?.data?.message || webhookErr.message);
        }
      }

      if (!sentViaWebhook) {
        const targetChannel = client?.channels?.cache?.get(NOTIFY_CHANNEL_ID) ||
          await client?.channels?.fetch(NOTIFY_CHANNEL_ID).catch(() => null);

        if (targetChannel && typeof targetChannel.send === "function") {
          await targetChannel.send(componentPayload).catch(() => {});
        } else if (client?.rest) {
          await client.rest.post(`/channels/${NOTIFY_CHANNEL_ID}/messages`, { body: componentPayload }).catch(() => {});
        }
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
    const statesToUpsert = [];
    const now = Date.now();
    const nowIso = new Date(now).toISOString();

    for (const [memberId, voiceState] of guild.voiceStates.cache) {
      if (!voiceState.channelId || voiceState.member?.user?.bot) continue;
      if (voiceJoinTimes.has(memberId)) continue;

      voiceJoinTimes.set(memberId, {
        joinedAt: now,
        lastRewardAt: now,
        channelId: voiceState.channelId,
        channelName: voiceState.channel?.name ?? null,
        parentId: voiceState.channel?.parentId ?? null,
      });

      statesToUpsert.push({
        discord_user_id: memberId,
        channel_id: voiceState.channelId,
        channel_name: voiceState.channel?.name ?? null,
        guild_id: guild.id,
        is_connected: true,
        joined_at: nowIso,
        updated_at: nowIso,
      });
    }

    if (statesToUpsert.length > 0 && supabase) {
      try {
        const CHUNK_SIZE = 50;
        for (let i = 0; i < statesToUpsert.length; i += CHUNK_SIZE) {
          const chunk = statesToUpsert.slice(i, i + CHUNK_SIZE);
          await supabase.from("voice_states").upsert(chunk, { onConflict: "discord_user_id" });
        }
      } catch (err) {
        console.error("[voice-points] Batch voice_states sync error:", err.message);
      }
    }
  }

  const { isIgnoredGuild } = require("../../../utils/guildFilter");

  // ── 3. ตรวจเช็กและแจกแต้ม/เหรียญแบบเรียลไทม์ทุก 15 นาที ──
  const REALTIME_INTERVAL_SECONDS = 15 * 60; // 900 วินาที

  async function processRealtimeVoiceRewards() {
    if (!client.isReady()) return;
    const now = Date.now();

    for (const guild of client.guilds.cache.values()) {
      if (isIgnoredGuild(guild.id)) continue;

      for (const [memberId, voiceState] of guild.voiceStates.cache) {
        if (!voiceState.channelId || voiceState.member?.user?.bot) continue;

        const parentId = voiceState.channel?.parentId;
        if (parentId && parentId === EXCLUDED_CATEGORY_ID) continue;

        // 🚫 ตรวจสอบ Anti-AFK: ไมค์แดง หูฟังแดง (ทั้งปิดเอง selfMute/selfDeaf และโดนเซิร์ฟเวอร์ปิด serverMute/serverDeaf)
        const isMuted = Boolean(voiceState.selfMute || voiceState.serverMute || voiceState.mute);
        const isDeaf = Boolean(voiceState.selfDeaf || voiceState.serverDeaf || voiceState.deaf);

        let session = voiceJoinTimes.get(memberId);
        if (!session) {
          session = {
            joinedAt: now,
            lastRewardAt: now,
            channelId: voiceState.channelId,
            channelName: voiceState.channel?.name ?? null,
            parentId: parentId ?? null,
          };
          voiceJoinTimes.set(memberId, session);
          continue;
        }

        // หากปิดไมค์หรือหูฟัง ให้เลื่อน lastRewardAt มารอเริ่มนับ 15 นาทีใหม่เมื่อเปิดไมค์/หูฟัง
        if (isMuted || isDeaf) {
          session.lastRewardAt = now;
          continue;
        }

        const elapsedSinceLast = Math.floor((now - (session.lastRewardAt || session.joinedAt)) / 1000);
        if (elapsedSinceLast >= REALTIME_INTERVAL_SECONDS) {
          const userCount = getUserCountInChannel(guild, voiceState.channelId);
          const channelName = voiceState.channel?.name ?? session.channelName ?? "ห้องพูดคุย";
          const member = voiceState.member;

          // แจกแต้มสตรอว์เบอร์รี่และลุ้น Star Coin รอบเรียลไทม์
          await awardVoicePoints(memberId, REALTIME_INTERVAL_SECONDS, userCount, channelName, parentId, member, true);

          // อัปเดตเวลารอบล่าสุด
          session.lastRewardAt = now;
        }
      }
    }
  }

  client.once("clientReady", async () => {
    for (const guild of client.guilds.cache.values()) {
      if (isIgnoredGuild(guild.id)) continue;
      await trackJoinState(guild);
    }
  });

  // รัน Voice State Sync ทุก 15 นาทีตามเดิม
  setInterval(async () => {
    if (!client.isReady()) return;
    for (const guild of client.guilds.cache.values()) {
      if (isIgnoredGuild(guild.id)) continue;
      await trackJoinState(guild);
    }
  }, HEARTBEAT_INTERVAL_MS);

  // รันตรวจสอบเรียลไทม์ทุก 1 นาที (0% CPU load เช็กใน RAM)
  setInterval(async () => {
    try {
      await processRealtimeVoiceRewards();
    } catch (err) {
      console.error("[voice-points] processRealtimeVoiceRewards error:", err.message);
    }
  }, 60 * 1000);

  client.on("voiceStateUpdate", async (oldState, newState) => {
    if (oldState.channelId === newState.channelId) return;

    const userId = newState.id;
    const isBot = newState.member?.user?.bot ?? oldState.member?.user?.bot ?? false;
    if (isBot) return;

    if (oldState.channelId) {
      const session = voiceJoinTimes.get(userId);
      const channelName = oldState.channel?.name ?? session?.channelName ?? "ห้องพูดคุย";
      if (session) {
        const remainingSeconds = Math.floor((Date.now() - (session.lastRewardAt || session.joinedAt)) / 1000);
        const userCount = getUserCountInChannel(oldState.guild, oldState.channelId) + 1;
        const parentId = oldState.channel?.parentId ?? session.parentId ?? null;
        const member = oldState.member || newState.member;

        const isMuted = Boolean(oldState.selfMute || oldState.serverMute || oldState.mute);
        const isDeaf = Boolean(oldState.selfDeaf || oldState.serverDeaf || oldState.deaf);

        // ถ้ามีเศษเวลาเกิน 10 นาที (CYCLE_SECONDS) และไมค์/หูฟังไม่แดง ให้คิดแต้มสตรอว์เบอร์รี่ส่วนที่เหลือ
        if (remainingSeconds >= CYCLE_SECONDS && !isMuted && !isDeaf) {
          await awardVoicePoints(userId, remainingSeconds, userCount, channelName, parentId, member, false);
        }
      }

      // สรุปยอดแต้มที่สะสมมาทั้งหมดใน Session และส่งการ์ดแจ้งเตือนตอนออกจากห้อง (ถ้าได้รับแต้มสะสม >= 1)
      await handleVoiceNotification(userId, 0, channelName, false);
      voiceJoinTimes.delete(userId);
    }

    if (newState.channelId) {
      const now = Date.now();
      voiceJoinTimes.set(userId, {
        joinedAt: now,
        lastRewardAt: now,
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
