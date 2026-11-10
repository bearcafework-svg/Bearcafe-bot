// src/features/starCoin/index.js
// ระบบ Star Coin ₊ เหรียญดาวตก (Gacha Coin)
// สุ่มดรอปจากการพิมพ์แชทและการลงห้องเสียง พร้อมการ์ดแจ้งเตือน Component V2

const axios = require("axios");
const { getSupabaseClient } = require("../../services/supabaseClient");
const sharedSettings = require("../../sharedSettings.json");
const roleBlacklist = sharedSettings.role_blacklist || [];

const NOTIFY_CHANNEL_ID = "1569377817131487374"; // ห้องแจ้งเตือน Star Coin

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
const CHAT_COOLDOWN_MS = 60 * 1000; // 60 วินาที คูลดาวน์รายบุคคลใน RAM (0% DB load)
const CHAT_DROP_CHANCE = 0.04;      // โอกาสดรอป 4% ต่อข้อความที่ผ่านเกณฑ์
const VOICE_DROP_CHANCE = 0.15;     // โอกาสดรอป 15% ต่อรอบแต้มเสียง
const MIN_CHAT_LENGTH = 5;          // ความยาวข้อความขั้นต่ำ ป้องกันพิมพ์สแปม
const DAILY_CAP = 5;                // เพดานสูงสุด 5 เหรียญต่อวัน

// In-Memory Cooldown Tracking (เก็บใน RAM ป้องกันการต่อ Database ซ้ำซ้อน)
const lastChatCheckByUser = new Map();

// เคลียร์ RAM ทุก 10 นาทีสำหรับผู้ใช้ที่ไม่ได้พิมพ์นานแล้ว
setInterval(() => {
  const now = Date.now();
  for (const [uid, ts] of lastChatCheckByUser.entries()) {
    if (now - ts > 10 * 60 * 1000) {
      lastChatCheckByUser.delete(uid);
    }
  }
}, 10 * 60 * 1000).unref();

/**
 * สุ่มจำนวนเหรียญ 1 - 5 เหรียญตามตารางน้ำหนัก
 * 1 เหรียญ: 80% (800)
 * 2 เหรียญ: 13% (130)
 * 3 เหรียญ: 5% (50)
 * 4 เหรียญ: 1.5% (15)
 * 5 เหรียญ: 0.5% (5)
 */
function rollCoinAmount() {
  const roll = Math.random() * 1000;
  if (roll < 800) return 1;
  if (roll < 930) return 2;
  if (roll < 980) return 3;
  if (roll < 995) return 4;
  return 5;
}

/**
 * สร้าง Discord Component V2 Payload สำหรับการแจ้งเตือน
 */
function buildStarCoinPayload(userId, amount, avatarUrl) {
  return {
    flags: 32768,
    components: [
      {
        type: 17,
        components: [
          {
            type: 9,
            components: [
              {
                type: 10,
                content: `## <a:flowingstar:1569355609805951026>︲__\` 𝖲𝗍𝖺𝗋 𝖼𝗈𝗂𝗇 ₊ เหรียญดาวตก 𓂃 \`__\n  - ยินดีด้วยนะคะ : <@${userId}> *!*\n  - คุณได้รับ **+${amount}** จากการพิมพ์และลงห้องบนคาเฟ่หมี <:cuteplant:1152834055528783872>`,
              },
            ],
            accessory: {
              type: 11,
              media: {
                url: avatarUrl || "https://cdn.discordapp.com/embed/avatars/0.png",
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
                label: "︲โยนเหรียญลุ้นโชค",
                emoji: {
                  id: "1292889186403090482",
                  name: "GachaCoin_bearcafe",
                  animated: false,
                },
                url: "https://discord.com/channels/1144251788493602848/1556376052647993374",
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * สุ่มและเพิ่ม Star Coin ให้ผู้ใช้ พร้อมส่งการ์ดแจ้งเตือน
 */
async function tryAwardStarCoin(client, supabase, userId, source = "chat", guild = null) {
  if (!supabase || !userId) return;

  try {
    const coinAmount = rollCoinAmount();

    // 1. เรียก Atomic RPC ฟังก์ชันบน Supabase 2
    const { data, error } = await supabase.rpc("add_gacha_coins", {
      p_user_id: userId,
      p_amount: coinAmount,
      p_daily_cap: DAILY_CAP
    });

    if (error) {
      console.error("[starCoin] add_gacha_coins RPC error:", error.message);
      return;
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || !row.success || row.coins_added <= 0) {
      // ติด Daily Cap หรือไม่สำเร็จ
      return;
    }

    console.log(`[starCoin] 🌟 ${userId} received +${row.coins_added} Star Coins via ${source}! (Total: ${row.total_coins}, Daily: ${row.daily_coins}/${DAILY_CAP})`);

    // 2. ดึง Avatar ผู้ใช้ (ตรวจ Cache ก่อนเพื่อลดการยิง Discord API)
    let avatarUrl = null;
    try {
      const targetGuild = guild || client.guilds.cache.first();
      if (targetGuild) {
        const cachedMember = targetGuild.members.cache.get(userId);
        const member = cachedMember || (await targetGuild.members.fetch(userId).catch(() => null));
        if (member) {
          avatarUrl = member.displayAvatarURL({ extension: "png", size: 256, forceStatic: true });
        }
      }
      if (!avatarUrl) {
        const cachedUser = client.users.cache.get(userId);
        const user = cachedUser || (await client.users.fetch(userId).catch(() => null));
        if (user) {
          avatarUrl = user.displayAvatarURL({ extension: "png", size: 256, forceStatic: true });
        }
      }
    } catch {
      avatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png";
    }

    // 3. ส่งการ์ดแจ้งเตือน Component V2 ผ่าน Webhook (พร้อม Fallback ไปยัง channel.send)
    const payload = buildStarCoinPayload(userId, row.coins_added, avatarUrl);
    const starCoinWebhookUrl = process.env.STAR_COIN_WEBHOOK_URL;
    let sentViaWebhook = false;

    if (starCoinWebhookUrl) {
      try {
        await sendComponentV2Webhook(starCoinWebhookUrl, payload);
        sentViaWebhook = true;
      } catch (webhookErr) {
        console.error("[starCoin] Webhook notification failed, falling back to channel.send:", webhookErr.response?.data?.message || webhookErr.message);
      }
    }

    if (!sentViaWebhook) {
      const channel = client.channels.cache.get(NOTIFY_CHANNEL_ID) ||
                      await client.channels.fetch(NOTIFY_CHANNEL_ID).catch(() => null);

      if (channel && typeof channel.send === "function") {
        await channel.send(payload).catch((sendErr) => {
          console.error("[starCoin] Failed to send notification card:", sendErr.message);
        });
      }
    }
  } catch (err) {
    console.error("[starCoin] tryAwardStarCoin error:", err.message);
  }
}

/**
 * เช็กสุ่มดรอปจากการลงห้องเสียง (เรียกจาก voicePoints)
 */
function checkVoiceStarCoinDrop(client, supabase, userId, guild = null) {
  if (Math.random() <= VOICE_DROP_CHANCE) {
    tryAwardStarCoin(client, supabase, userId, "voice", guild).catch(() => {});
  }
}

/**
 * ติดตั้งระบบ Star Coin บน Discord Client
 */
function setupStarCoin(client) {
  const supabase = getSupabaseClient(2);

  // ดักจับข้อความแชท
  client.on("messageCreate", async (message) => {
    try {
      if (!message || message.author?.bot || !message.guild) return;
      if (!message.content || message.content.length < MIN_CHAT_LENGTH) return;

      // กรองคำสั่ง prefix หรือ slash command
      const trimmed = message.content.trim();
      if (trimmed.startsWith("/") || trimmed.startsWith("!") || trimmed.startsWith(".") || trimmed.startsWith("?")) {
        return;
      }

      const userId = message.author.id;

      // ตรวจสอบ Role Blacklist
      if (message.member?.roles?.cache?.some((r) => roleBlacklist.includes(r.id))) {
        return;
      }

      // ตรวจสอบ Cooldown รายคนใน RAM (ป้องกันสแปมข้อความ)
      const now = Date.now();
      const last = lastChatCheckByUser.get(userId) || 0;
      if (now - last < CHAT_COOLDOWN_MS) {
        return;
      }
      lastChatCheckByUser.set(userId, now);

      // ทอยเต๋าโอกาสติดดรอป (3-5%)
      if (Math.random() > CHAT_DROP_CHANCE) {
        return;
      }

      // ติดดรอป! บันทึก DB และส่งการ์ด
      await tryAwardStarCoin(client, supabase, userId, "chat", message.guild);
    } catch (err) {
      console.error("[starCoin] messageCreate error:", err.message);
    }
  });

  console.log("🌟 [starCoin] Star Coin (Gacha Coin) system initialized with In-Memory Cooldown & Component V2.");
}

module.exports = {
  setupStarCoin,
  tryAwardStarCoin,
  checkVoiceStarCoinDrop,
  buildStarCoinPayload,
  rollCoinAmount,
};

