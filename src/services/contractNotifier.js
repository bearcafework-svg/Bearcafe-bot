// src/services/contractNotifier.js
// ระบบแจ้งเตือนสัญญาเช่าบ้านอัตโนมัติเมื่อใกล้หมดอายุ (Auto Contract Notifier)

const { createClient } = require("@supabase/supabase-js");

let supabaseClient;
function getSupabase() {
  if (!supabaseClient && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return supabaseClient;
}

const BANNER_URL = "https://cdn.discordapp.com/attachments/1144675871798591569/1517912045306118395/1.png";
const CHECK_INTERVAL_MS = 60 * 60 * 1000; // ตรวจสอบทุกๆ 1 ชั่วโมง

/**
 * ดึง Channel ID จาก room_link (เช่น https://discord.com/channels/guild_id/channel_id)
 */
function extractChannelId(roomLink) {
  if (!roomLink) return null;
  const match = roomLink.match(/channels\/\d+\/(\d+)/);
  if (match) return match[1];
  if (/^\d{17,20}$/.test(roomLink.trim())) return roomLink.trim();
  return null;
}

/**
 * ฟังก์ชันตรวจสอบและส่งแจ้งเตือนสัญญาเช่าบ้านใกล้หมดอายุ
 */
async function checkAndNotifyContracts(client) {
  const supabase = getSupabase();
  if (!supabase) {
    console.log("[contractNotifier] Skip check: Supabase environment variables not set.");
    return;
  }

  try {
    const { data: contracts, error } = await supabase
      .from("contracts")
      .select("*")
      .eq("type", "house")
      .not("end_at", "is", null);

    if (error) throw error;
    if (!contracts || contracts.length === 0) return;

    const now = Date.now();

    for (const contract of contracts) {
      const endMs = new Date(contract.end_at).getTime();
      const remainingMs = endMs - now;
      const remainingDays = remainingMs / (1000 * 60 * 60 * 24);

      const editLog = Array.isArray(contract.edit_log) ? contract.edit_log : [];
      const notifiedTags = editLog.map((log) => log.tag).filter(Boolean);

      let notificationTier = null;
      let alertReason = "";

      if (remainingMs <= 0 && !notifiedTags.includes("notified_expired")) {
        notificationTier = "expired";
        alertReason = "สัญญาเช่าบ้านหมีของคุณหมดอายุแล้วค่ะ! กรุณาติดต่อต่อสัญญาเช่ากับทางทีมงานนะคะ";
      } else if (remainingDays <= 1 && remainingDays > 0 && !notifiedTags.includes("notified_1d")) {
        notificationTier = "1d";
        alertReason = "สัญญาเช่าบ้านหมีของคุณกำลังจะหมดอายุภายใน **24 ชั่วโมง** นี้ค่ะ! ต่อด่วนก่อนห้องโดนปิดบริการนะคะ";
      } else if (remainingDays <= 3 && remainingDays > 1 && !notifiedTags.includes("notified_3d")) {
        notificationTier = "3d";
        alertReason = "สัญญาเช่าบ้านหมีของคุณกำลังจะหมดอายุภายใน **3 วัน** นี้ค่ะ! สามารถคลิกปุ่มด้านล่างเพื่อต่อสัญญาเช่าได้เลยนะคะ";
      }

      if (!notificationTier) continue;

      // หาเป้าหมายการส่งข้อความ
      const targetChannelId = extractChannelId(contract.room_link) || process.env.DISCORD_CONTRACT_NOTIFY_CHANNEL_ID;
      if (!targetChannelId) continue;

      const targetChannel = await client.channels.fetch(targetChannelId).catch(() => null);
      if (!targetChannel) continue;

      const endUnix = Math.floor(endMs / 1000);
      const textContent = [
        `## <a:bearg11:1396016056035840140>︲__\` 𝖭𝗈𝗍𝗂𝖼𝖾 ₊ แจ้งเตือนสัญญาเช่าบ้านหมี 𓂃 \`__`,
        `-# **สาเหตุ:** ${alertReason}`,
        ``,
        `> (👤)︰<@${contract.member_id}> — \`${contract.member_id}\``,
        `> (⏰)︰<t:${endUnix}:F> (<t:${endUnix}:R>)`,
        `> (🏡)︰${contract.room_link || "-"}`,
      ].join("\n");

      const payload = {
        flags: 32768,
        components: [
          {
            type: 17,
            components: [
              {
                type: 12,
                items: [{ media: { url: BANNER_URL } }],
              },
              { type: 14, spacing: 2 },
              { type: 10, content: textContent },
              { type: 14, spacing: 2 },
              {
                type: 1,
                components: [
                  {
                    type: 2,
                    style: 5,
                    label: "คลิกเพื่อต่อบ้านเช่า",
                    url: "https://discord.com/channels/1144251788493602848/1202239170219868190",
                  },
                ],
              },
            ],
          },
        ],
      };

      try {
        await targetChannel.send(payload);
        console.log(`[contractNotifier] Sent ${notificationTier} alert for member ${contract.member_id}`);

        // บันทึก Log การส่งแจ้งเตือนลง edit_log เพื่อไม่ให้ส่งซ้ำ
        const newLogEntry = {
          tag: `notified_${notificationTier}`,
          timestamp: new Date().toISOString(),
          note: `Auto notified ${notificationTier} expiration alert`,
        };
        const updatedEditLog = [...editLog, newLogEntry];

        await supabase
          .from("contracts")
          .update({ edit_log: updatedEditLog, updated_at: new Date().toISOString() })
          .eq("id", contract.id);
      } catch (sendErr) {
        console.error(`[contractNotifier] Failed to send notification to channel ${targetChannelId}:`, sendErr.message);
      }
    }
  } catch (err) {
    console.error("[contractNotifier] Error running contract check:", err.message);
  }
}

/**
 * เริ่มต้นระบบ Auto Contract Notifier
 */
function setupContractNotifier(client) {
  client.once("ready", () => {
    console.log("[contractNotifier] ✅ ระบบแจ้งเตือนสัญญาเช่าอัตโนมัติพร้อมทำงานแล้ว");
    // สแกนทันทีเมื่อบอทออนไลน์
    checkAndNotifyContracts(client).catch(console.error);
    // ตั้งเวลาสแกนซ้ำทุก 1 ชั่วโมง
    setInterval(() => {
      checkAndNotifyContracts(client).catch(console.error);
    }, CHECK_INTERVAL_MS);
  });
}

module.exports = { setupContractNotifier, checkAndNotifyContracts };
