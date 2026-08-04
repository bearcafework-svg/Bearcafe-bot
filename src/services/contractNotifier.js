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

const BANNER_URL = "https://cdn.discordapp.com/attachments/1524704267015819274/1532076197175890202/NewsBoard_-_bearcafe_18.png?ex=6a6b88a6&is=6a6a3726&hm=ef43133d686f69bf503f1714d46b357579a945a28a9011e6827cc491f9ecf503&";
const RENEW_URL = "https://discord.com/channels/1144251788493602848/1524124116053917747";
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

      if (remainingMs <= 0 && !notifiedTags.includes("notified_expired")) {
        notificationTier = "expired";
      } else if (remainingDays <= 1 && remainingDays > 0 && !notifiedTags.includes("notified_1d")) {
        notificationTier = "1d";
      } else if (remainingDays <= 3 && remainingDays > 1 && !notifiedTags.includes("notified_3d")) {
        notificationTier = "3d";
      }

      if (!notificationTier) continue;

      // หาเป้าหมายการส่งข้อความ
      const targetChannelId = extractChannelId(contract.room_link) || process.env.DISCORD_CONTRACT_NOTIFY_CHANNEL_ID;
      if (!targetChannelId) continue;

      const endUnix = Math.floor(endMs / 1000);

      let notifySuccess = false;

      // 1. ลองเรียกใช้ Edge Function "send-contract-notify" เพื่อให้รูปแบบการ์ดตรงกับฝั่งเว็บ 100%
      try {
        const { error: fnError } = await supabase.functions.invoke("send-contract-notify", {
          body: {
            member_id: contract.member_id,
            end_unix: endUnix,
            room_link: contract.room_link || "-",
            channel_id: targetChannelId,
          },
        });
        if (!fnError) {
          notifySuccess = true;
          console.log(`[contractNotifier] Successfully invoked send-contract-notify Edge Function for ${contract.member_id}`);
        } else {
          console.warn("[contractNotifier] Edge Function invoke warning:", fnError.message);
        }
      } catch (invokeErr) {
        console.warn("[contractNotifier] Failed to invoke Edge Function, falling back to direct Discord send:", invokeErr.message);
      }

      // 2. ถ้า Edge Function ไม่ตอบกลับ ให้ส่งตรงผ่าน Discord Bot Payload ล่าสุด
      if (!notifySuccess) {
        const targetChannel = await client.channels.fetch(targetChannelId).catch(() => null);
        if (targetChannel) {
          const textContent = [
            `## <a:bearg11:1396016056035840140>︲__\` 𝖭𝗈𝗍𝗂𝖼𝖾 ₊ จากเซอร์วิส 𓂃 \`__`,
            `-# **สาเหตุ:** บ้านเช่าของคุณใกล้หมดแล้ว หากไม่อยากให้บ้านถูกยึด ต่อด่วน ต่อด่วน ต่อด่วน! <:cuteplant:1152834055528783872>`,
            ``,
            `> (👤)︰<@${contract.member_id}> — ${contract.member_id}`,
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
                        label: "︲คลิกเพื่อต่อบ้านเช่า",
                        emoji: { id: "1520507942842007694", name: "54879croissant", animated: true },
                        url: RENEW_URL,
                      },
                    ],
                  },
                ],
              },
            ],
          };

          try {
            await targetChannel.send(payload);
            notifySuccess = true;
          } catch (sendErr) {
            console.error(`[contractNotifier] Direct send failed for channel ${targetChannelId}:`, sendErr.message);
          }
        }
      }

      if (notifySuccess) {
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
