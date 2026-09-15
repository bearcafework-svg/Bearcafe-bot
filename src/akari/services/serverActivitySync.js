// ===================================================
// serverActivitySync.js — บริการดึงข้อมูลความเคลื่อนไหวเซิร์ฟเวอร์แบบ Periodic Sync
// ===================================================

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // ทุก 5 นาที

/**
 * ติดตั้งระบบ Periodic Sync สำหรับตรวจสอบสถานะเซิร์ฟเวอร์ในสารบบของ Bear Cafe
 * @param {import('discord.js').Client} client
 * @param {import('@supabase/supabase-js').SupabaseClient} mainSupabase
 */
function setupServerActivitySync(client, mainSupabase) {
  if (!mainSupabase) {
    console.warn("⚠️ [AkariBot:ActivitySync] ขาด Main Supabase Client ระบบ Activity Sync จะไม่ทำงาน");
    return;
  }

  let isSyncing = false;

  const performSync = async () => {
    if (isSyncing) return;
    isSyncing = true;

    try {
      // 1. ดึงเฉพาะเซิร์ฟเวอร์ที่ผ่านการอนุมัติ (approved) จาก Main Supabase
      const { data: servers, error } = await mainSupabase
        .from("discord_servers")
        .select("id, discord_id, has_akari_bot, live_voice_count, weekly_joins_count")
        .eq("status", "approved");

      if (error) {
        console.error("❌ [AkariBot:ActivitySync] ดึงข้อมูลเซิร์ฟเวอร์ไม่สำเร็จ:", error.message);
        return;
      }

      if (!servers || servers.length === 0) return;

      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      let updatedCount = 0;

      for (const server of servers) {
        try {
          const guild = client.guilds.cache.get(server.discord_id);

          if (!guild) {
            // บอทไม่ได้อยู่ในกิลด์นี้ -> อัปเดตสถานะถ้าเดิมเคยมีค่า
            if (server.has_akari_bot || server.live_voice_count > 0) {
              await mainSupabase
                .from("discord_servers")
                .update({
                  has_akari_bot: false,
                  live_voice_count: 0,
                  activity_synced_at: new Date().toISOString(),
                })
                .eq("id", server.id);
            }
            continue;
          }

          // 2. นับจำนวนคนที่อยู่ใน Voice Channels (ไม่นับบอท)
          let voiceCount = 0;
          if (guild.voiceStates && guild.voiceStates.cache) {
            voiceCount = guild.voiceStates.cache.filter((vs) => {
              return vs.channelId && !vs.member?.user?.bot;
            }).size;
          }

          // 3. คำนวณจำนวนสมาชิกที่เข้าร่วมในรอบ 7 วันล่าสุด
          let weeklyJoins = 0;
          if (guild.members && guild.members.cache) {
            weeklyJoins = guild.members.cache.filter((m) => {
              return !m.user.bot && m.joinedTimestamp && m.joinedTimestamp >= sevenDaysAgo;
            }).size;
          }

          // 4. บันทึกข้อมูลกลับเข้า Main Supabase
          await mainSupabase
            .from("discord_servers")
            .update({
              has_akari_bot: true,
              live_voice_count: voiceCount,
              weekly_joins_count: weeklyJoins,
              activity_synced_at: new Date().toISOString(),
            })
            .eq("id", server.id);

          updatedCount++;
        } catch (serverErr) {
          console.warn(`⚠️ [AkariBot:ActivitySync] ซิงค์กิลด์ ${server.discord_id} ผิดพลาด:`, serverErr.message);
        }
      }

      if (updatedCount > 0) {
        console.log(`📡 [AkariBot:ActivitySync] ซิงค์ Activity เซิร์ฟเวอร์สำเร็จ (${updatedCount} เซิร์ฟเวอร์)`);
      }
    } catch (err) {
      console.error("❌ [AkariBot:ActivitySync] เกิดข้อผิดพลาดในรอบการซิงค์:", err.message);
    } finally {
      isSyncing = false;
    }
  };

  // รันรอบแรกหลังจากบอทเชื่อมต่อแล้ว 10 วินาที
  setTimeout(performSync, 10000);

  // ตั้ง Interval รันทุก 5 นาที
  const intervalId = setInterval(performSync, SYNC_INTERVAL_MS);

  console.log("⚡ [AkariBot] ติดตั้งระบบ Activity Sync เรียบร้อยแล้ว (รันทุก 5 นาที)");

  return () => clearInterval(intervalId);
}

module.exports = { setupServerActivitySync };
