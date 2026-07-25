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
  // Match any number followed by 'times', 'ครั้ง', 'เม็ด', or 'time'
  const match = content.match(/(\d+)\s*(?:times|ครั้ง|เม็ด|time)/i);
  if (match) {
    return parseInt(match[1], 10);
  }
  return 1; // Default to 1 boost if no number pattern is matched
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
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
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

    // 1. Add +500 points to user_points database
    try {
      const newPoints = await addPoints(supabase, userId, BOOST_POINTS_REWARD);
      console.log(`[boostNotification] Successfully added +${BOOST_POINTS_REWARD} points to ${booster.tag}. New points: ${newPoints}`);
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
            type: 17, // Section
            components: [
              {
                type: 12, // Media
                items: [
                  {
                    media: {
                      url: "https://cdn.discordapp.com/attachments/1524704267015819274/1525765533411180615/NewsBoard_-_bearcafe_7.png?ex=6a549362&is=6a5341e2&hm=43aebb540236f29a52ded101dec434a61d9e1902c447b25b2800fa7f97643a50&"
                    }
                  }
                ]
              },
              { type: 14, spacing: 2 }, // Separator
              {
                type: 10, // Text
                content: `## <:bee20000:1256669436350562355>︲__\` 𝖳𝗁𝗑 𝟦 𝖻𝗈𝗈𝗌𝗍 ₊ ขอบคุณสำหรับบูสต์นะ! 𓂃 \`__\n-# ขอบคุณที่มอบบูสต์ให้กับคาเฟ่หมีนะคะ การสนับสนุนของเธอมีความหมายกับพวกเรามาก ขอให้รวย สาธุ สาธุ สาธุ! <:cuteplant:1152834055528783872>\n\n> (👤)︰<@${userId}>\n> (<a:3dboost:1144706367433756672>)︰ตอนนี้คุณบูสต์ไปแล้ว **${boostCount} เม็ด**\n> (${iconStr})︰รับแต้ม +500 ต่อการบูสต์ 1 ครั้ง`
              },
              { type: 14, spacing: 2 }, // Separator
              {
                type: 1, // Container / ActionRow
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
                    label: "︲เช็กแต้มของคุณ",
                    emoji: { id: "1256669436350562355", name: "bee20000", animated: false },
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
