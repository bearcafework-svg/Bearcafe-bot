// src/features/boostNotification.js
// ระบบแจ้งเตือนเมื่อสมาชิกทำการบูสต์เซิร์ฟเวอร์ และเพิ่มแต้ม 500 แต้ม

const { createClient } = require("@supabase/supabase-js");
const sharedConfig = require("../sharedSettings.json");

const TARGET_CHANNEL_ID = "1524124428454203553";
const BOOST_POINTS_REWARD = 500;

// Message Types related to Server Boosting
const BOOST_MESSAGE_TYPES = [
  8,  // UserPremiumGuildSubscription / GuildBoost
  9,  // UserPremiumGuildSubscriptionTier1 / GuildBoostTier1
  10, // UserPremiumGuildSubscriptionTier2 / GuildBoostTier2
  11  // UserPremiumGuildSubscriptionTier3 / GuildBoostTier3
];

function extractBoostCount(content) {
  if (!content) return 1;
  const trimmed = String(content).trim();
  if (!trimmed) return 1;

  // 1. ถ้าข้อความเป็นตัวเลขล้วน (Discord API ส่งจำนวนบูสต์มาเป็นตัวเลขโดยตรง เช่น "2", "3")
  if (/^\d+$/.test(trimmed)) {
    const count = parseInt(trimmed, 10);
    return count > 0 ? count : 1;
  }

  // 2. ตรวจจับตัวเลขที่ตามด้วยคำระบุจำนวน (เช่น "2 times", "2 ครั้ง", "2 เม็ด", "2 time")
  const wordMatch = trimmed.match(/(\d+)\s*(?:times?|ครั้ง|เม็ด|รอบ|time|boosts?)/i);
  if (wordMatch) {
    const count = parseInt(wordMatch[1], 10);
    return count > 0 ? count : 1;
  }

  // 3. Fallback: ตรวจจับตัวเลขเดี่ยวที่ปรากฏในข้อความ
  const anyMatch = trimmed.match(/\b(\d+)\b/);
  if (anyMatch) {
    const count = parseInt(anyMatch[1], 10);
    return count > 0 ? count : 1;
  }

  return 1;
}

async function addPoints(supabase, userId, pointsDelta) {
  const { data, error } = await supabase.rpc("add_tarot_points", {
    p_discord_id: userId,
    p_points_delta: pointsDelta,
    p_tarot_delta: 0,
  });

  if (error) {
    console.error("[boostNotification] addPoints RPC error:", error.message);
    // Fallback if RPC fails
    const { data: row } = await supabase
      .from("user_points")
      .select("points")
      .eq("discord_id", userId)
      .single();

    const newPoints = (row?.points ?? 0) + pointsDelta;
    await supabase.from("user_points").upsert(
      { discord_id: userId, points: newPoints },
      { onConflict: "discord_id" }
    );
    return newPoints;
  }
  return data?.[0]?.new_points ?? 0;
}

function setupBoostNotification(client) {
  const supabaseUrl = process.env.POINTS_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.POINTS_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  const supabase = createClient(
    supabaseUrl,
    supabaseKey,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  client.on("messageCreate", async (message) => {
    // Check if it's in a guild, not sent by a user bot (system messages are usually sent by Discord system/user/author)
    if (!message.guild) return;

    // Check if the message type is one of the boost notification types
    if (!BOOST_MESSAGE_TYPES.includes(message.type)) return;

    // The author of the boost system message is the member who boosted
    const booster = message.author;
    if (!booster) return;

    const userId = booster.id;
    const boostCount = extractBoostCount(message.content);

    console.log(`[boostNotification] Detected server boost from ${booster.tag} (${userId}), count: ${boostCount}`);

    const boostPointsReward = BOOST_POINTS_REWARD * boostCount;
    const formattedPoints = boostPointsReward.toLocaleString();
    const formattedBoostCount = boostCount.toLocaleString();

    // 1. Add points to user_points database (500 points per boost)
    try {
      const newPoints = await addPoints(supabase, userId, boostPointsReward);
      console.log(`[boostNotification] Successfully added +${boostPointsReward} points (${boostCount} boosts) to ${booster.tag}. New points: ${newPoints}`);
    } catch (dbError) {
      console.error(`[boostNotification] Failed to add points to database for ${booster.tag}:`, dbError.message);
    }

    // 2. Send Component v2 Notification to TARGET_CHANNEL_ID
    try {
      const channel = client.channels.cache.get(TARGET_CHANNEL_ID) ||
        await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);

      if (!channel) {
        console.error(`[boostNotification] Target channel ${TARGET_CHANNEL_ID} not found.`);
        return;
      }

      const pi = sharedConfig.point_icon;
      const iconStr = pi.animated ? `<a:${pi.name}:${pi.id}>` : `<:${pi.name}:${pi.id}>`;

      await channel.send({
        flags: 32768, // FLAG_V2 / MessageFlags.IsComponentsV2
        components: [
          {
            type: 17, // Container
            components: [
              {
                type: 12, // Media
                items: [
                  {
                    media: {
                      url: "https://cdn.discordapp.com/attachments/1565777850022232075/1566788367277101067/thx.png?ex=6ae9d0e0&is=6ae87f60&hm=ed46ad13aa0916004c0e5d5a4dd1b1fd660ccb89141004e4d24da73d48b217c1&"
                    }
                  }
                ]
              },
              {
                type: 10, // Text Header & Description
                content: "## <:bee20000:1256669436350562355>︲__` 𝖳𝗁𝗑 𝟦 𝖻𝗈𝗈𝗌𝗍 ₊ ขอบคุณสำหรับบูสต์นะ! 𓂃 `__\n-# ขอบคุณที่มอบบูสต์ให้กับคาเฟ่หมีนะคะ การสนับสนุนของเธอมีความหมายกับพวกเรามาก ขอให้รวย สาธุ สาธุ สาธุ! <:cuteplant:1152834055528783872>"
              },
              {
                type: 14, // Separator
                spacing: 2
              },
              {
                type: 10, // Text User Stats
                content: `> (👤)︰<@${userId}>\n> (<a:3dboost:1144706367433756672>)︰ตอนนี้คุณบูสต์ไปแล้ว **${formattedBoostCount} เม็ด**\n> (${iconStr})︰รับแต้ม +${formattedPoints} ต่อการบูสต์ ${formattedBoostCount} ครั้ง`
              },
              {
                type: 14, // Spacer without line
                spacing: 1,
                divider: false
              },
              {
                type: 1, // ActionRow
                components: [
                  {
                    type: 2, // Button
                    style: 5, // Link
                    label: "︲คลิกเพื่อรับสิทธิพิเศษ!",
                    emoji: { id: "1212856675053346897", name: "bearcafe_star", animated: false },
                    url: "https://discord.com/channels/1144251788493602848/1524123002575523892"
                  },
                  {
                    type: 2, // Button
                    style: 5, // Link
                    label: "︲คลิกเพื่อเช็กแต้ม",
                    emoji: { id: "1522154708200849449", name: "bagpack_icon", animated: false },
                    url: "https://discord.com/channels/1144251788493602848/1524123727724417276"
                  }
                ]
              }
            ]
          }
        ]
      });

      console.log(`[boostNotification] Notification sent to channel ${TARGET_CHANNEL_ID}`);
    } catch (channelError) {
      console.error(`[boostNotification] Failed to send notification message:`, channelError.message);
    }
  });

  console.log("[boostNotification] Module loaded successfully");
}

module.exports = { setupBoostNotification };
