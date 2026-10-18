// ===================================================
// serverActivitySync.js — บริการดึงข้อมูลความเคลื่อนไหวเซิร์ฟเวอร์แบบ Periodic Sync
// รองรับการซิงค์ห้องเสียงสด (Active Voice Rooms) เฉพาะสำหรับเซิร์ฟเวอร์ที่มีสิทธิ์ Premium
// และอนุญาตให้แอดมินเลือกหมวดหมู่ผ่าน /setting-voice
// ===================================================

const SYNC_INTERVAL_MS = 5 * 60 * 1000; // ทุก 5 นาที (บาลานซ์ระหว่างความสดใหม่และการประหยัด Supabase Egress)
const BEARCAFE_GUILD_ID = process.env.GUILD_ID || "1144251788493602848";

// Cache ลายเซ็นของแต่ละกิลด์เพื่อทำ Smart Dirty Check ป้องกันการยิง Supabase ซ้ำซ้อน
const guildVoiceSignatures = new Map();

/**
 * ติดตั้งระบบ Periodic Sync สำหรับตรวจสอบสถานะเซิร์ฟเวอร์ในสารบบของ Bear Cafe
 * @param {import('discord.js').Client} client
 * @param {import('@supabase/supabase-js').SupabaseClient} mainSupabase
 */
function setupServerActivitySync(client, mainSupabase) {
  if (!mainSupabase) {
    console.warn("⚠️ [KumaBot:ActivitySync] ขาด Main Supabase Client ระบบ Activity Sync จะไม่ทำงาน");
    return;
  }

  let isSyncing = false;

  const performSync = async () => {
    if (isSyncing) return;
    isSyncing = true;

    try {
      // 1. ดึงข้อมูลเซิร์ฟเวอร์ที่ผ่านการอนุมัติ (approved)
      const { data: servers, error: serverErr } = await mainSupabase
        .from("discord_servers")
        .select("id, discord_id, has_akari_bot, live_voice_count, weekly_joins_count, server_profile")
        .eq("status", "approved");

      if (serverErr) {
        console.error("❌ [KumaBot:ActivitySync] ดึงข้อมูลเซิร์ฟเวอร์ไม่สำเร็จ:", serverErr.message);
        return;
      }

      if (!servers || servers.length === 0) return;

      // 2. ดึงข้อมูล tenant_configs เพื่อตรวจสอบสิทธิ์ Premium และหมวดหมู่ที่ได้รับอนุญาต
      const { data: premiumTenants, error: tenantErr } = await mainSupabase
        .from("tenant_configs")
        .select("guild_id, plan, expires_at, voice_display_categories")
        .eq("plan", "premium");

      if (tenantErr) {
        console.warn("⚠️ [KumaBot:ActivitySync] ดึงข้อมูล tenant_configs ไม่สำเร็จ:", tenantErr.message);
      }

      // สร้าง Map สำหรับค้นหากิลด์ที่เป็น Premium และมีหมวดหมู่ที่เลือกไว้
      const premiumCategoriesMap = new Map();
      const now = new Date();
      if (premiumTenants) {
        for (const t of premiumTenants) {
          const isExpired = t.expires_at && new Date(t.expires_at) < now;
          if (!isExpired && Array.isArray(t.voice_display_categories) && t.voice_display_categories.length > 0) {
            premiumCategoriesMap.set(t.guild_id, t.voice_display_categories);
          }
        }
      }

      const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
      let updatedCount = 0;

      for (const server of servers) {
        try {
          const guild = client.guilds.cache.get(server.discord_id);

          if (!guild) {
            // บอทไม่ได้อยู่ในกิลด์นี้ -> อัปเดตสถานะถ้าเดิมเคยบันทึกไว้ว่ามีบอท
            if (server.has_akari_bot || (server.live_voice_count || 0) > 0) {
              const profile = server.server_profile || {};
              const cleanProfile = { ...profile };
              delete cleanProfile.active_voice_rooms;
              delete cleanProfile.active_voice_rooms_count;

              await mainSupabase
                .from("discord_servers")
                .update({
                  has_akari_bot: false,
                  live_voice_count: 0,
                  server_profile: cleanProfile,
                  activity_synced_at: new Date().toISOString(),
                })
                .eq("id", server.id);
            }
            continue;
          }

          // 3. คำนวณจำนวนคนในห้องเสียงรวมของเซิร์ฟเวอร์ (ไม่นับบอท)
          let totalVoiceCount = 0;
          if (guild.voiceStates && guild.voiceStates.cache) {
            totalVoiceCount = guild.voiceStates.cache.filter((vs) => {
              return vs.channelId && !vs.member?.user?.bot;
            }).size;
          }

          // 4. คำนวณจำนวนสมาชิกที่เข้าร่วมในรอบ 7 วันล่าสุด
          let weeklyJoins = 0;
          if (guild.members && guild.members.cache) {
            weeklyJoins = guild.members.cache.filter((m) => {
              return !m.user?.bot && m.joinedTimestamp && m.joinedTimestamp >= sevenDaysAgo;
            }).size;
          }

          // 5. จัดการห้องเสียงสด (Active Voice Rooms)
          let shouldUpdateProfile = false;
          const currentProfile = server.server_profile || {};
          let updatedProfile = { ...currentProfile };

          // หากเป็นเซิร์ฟเวอร์หลัก Bear Cafe ปล่อยให้ bearCafeActivitySync.js เป็นผู้ดูแล
          const isBearCafe = server.discord_id === BEARCAFE_GUILD_ID;

          if (!isBearCafe) {
            const allowedCategoryIds = premiumCategoriesMap.get(server.discord_id);

            if (allowedCategoryIds && allowedCategoryIds.length > 0) {
              // เซิร์ฟเวอร์มีสิทธิ์ Premium และแอดมินเลือกหมวดหมู่ไว้ -> รวบรวมห้องเสียงที่แอคทีฟ
              const activeRooms = [];

              guild.channels.cache.forEach((channel) => {
                if (
                  channel.isVoiceBased() &&
                  channel.parentId &&
                  allowedCategoryIds.includes(channel.parentId)
                ) {
                  const nonBotMembers = channel.members.filter((m) => !m.user?.bot);
                  const count = nonBotMembers.size;

                  if (count > 0) {
                    const membersList = nonBotMembers.first(15).map((m) => ({
                      id: m.id,
                      name: m.displayName || m.user.username,
                      avatar: m.user.displayAvatarURL({ size: 64, forceStatic: false }),
                      streaming: Boolean(m.voice?.streaming),
                      activity: m.presence?.activities?.[0]?.name || null,
                    }));

                    activeRooms.push({
                      id: channel.id,
                      name: channel.name,
                      category: channel.parent?.name || "ห้องเสียง",
                      count,
                      members: membersList,
                    });
                  }
                }
              });

              activeRooms.sort((a, b) => b.count - a.count);

              // Smart Dirty Check สำหรับห้องเสียง
              const roomSignature = `${totalVoiceCount}:${activeRooms.map((r) => `${r.id}:${r.count}`).join(",")}`;
              const lastSignature = guildVoiceSignatures.get(server.discord_id);

              if (roomSignature !== lastSignature) {
                guildVoiceSignatures.set(server.discord_id, roomSignature);
                updatedProfile = {
                  ...updatedProfile,
                  active_voice_count: totalVoiceCount,
                  active_voice_rooms_count: activeRooms.length,
                  active_voice_rooms: activeRooms,
                  active_voice_updated_at: new Date().toISOString(),
                };
                shouldUpdateProfile = true;
              }
            } else {
              // ไม่มีสิทธิ์ Premium หรือยังไม่ได้เลือกหมวดหมู่ -> เคลียร์ active_voice_rooms หากเคยมีอยู่เดิม
              if (
                Array.isArray(currentProfile.active_voice_rooms) &&
                currentProfile.active_voice_rooms.length > 0
              ) {
                delete updatedProfile.active_voice_rooms;
                delete updatedProfile.active_voice_rooms_count;
                delete updatedProfile.active_voice_updated_at;
                guildVoiceSignatures.delete(server.discord_id);
                shouldUpdateProfile = true;
              }
            }
          }

          // 6. ตรวจสอบว่ามีข้อมูลใดเปลี่ยนแปลงหรือไม่ ก่อนส่งบันทึกไป Supabase (Smart Dirty Check)
          const hasBasicChange =
            server.has_akari_bot !== true ||
            server.live_voice_count !== totalVoiceCount ||
            server.weekly_joins_count !== weeklyJoins;

          if (hasBasicChange || shouldUpdateProfile) {
            const updatePayload = {
              has_akari_bot: true,
              live_voice_count: totalVoiceCount,
              weekly_joins_count: weeklyJoins,
              activity_synced_at: new Date().toISOString(),
            };

            if (shouldUpdateProfile) {
              updatePayload.server_profile = updatedProfile;
            }

            await mainSupabase
              .from("discord_servers")
              .update(updatePayload)
              .eq("id", server.id);

            updatedCount++;
          }
        } catch (serverErr) {
          console.warn(`⚠️ [KumaBot:ActivitySync] ซิงค์กิลด์ ${server.discord_id} ผิดพลาด:`, serverErr.message);
        }
      }

      if (updatedCount > 0) {
        console.log(`📡 [KumaBot:ActivitySync] ซิงค์ Activity สำเร็จ (${updatedCount} เซิร์ฟเวอร์)`);
      }
    } catch (err) {
      console.error("❌ [KumaBot:ActivitySync] เกิดข้อผิดพลาดในรอบการซิงค์:", err.message);
    } finally {
      isSyncing = false;
    }
  };

  // รันรอบแรกหลังจากบอทเชื่อมต่อแล้ว 10 วินาที
  setTimeout(performSync, 10000);

  // ตั้ง Interval รันทุก 5 นาที
  const intervalId = setInterval(performSync, SYNC_INTERVAL_MS);

  console.log("⚡ [KumaBot] ติดตั้งระบบ Activity Sync พร้อมรองรับ Voice Rooms สำหรับ Premium เรียบร้อยแล้ว (รันทุก 5 นาที)");

  return () => clearInterval(intervalId);
}

module.exports = { setupServerActivitySync };
