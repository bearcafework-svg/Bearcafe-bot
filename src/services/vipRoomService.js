// ===================================================
// src/services/vipRoomService.js
// บริการจัดการฐานข้อมูล Supabase สำหรับห้อง VIP (Hybrid Storage ร่วมกับ Redis)
// ===================================================

const { getSupabaseClient } = require("./supabaseClient");
const { getRoom, saveRoom, setRoomEmpty, getAllRooms } = require("../../state/redisClient");

/**
 * บันทึกหรืออัปเดตข้อมูลห้อง VIP ลงตาราง vip_active_rooms ใน Supabase
 */
async function syncVipRoomToDatabase(channelId, { ownerId, guildId = null, channelName = null, emptyAt = null } = {}) {
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  try {
    const payload = {
      channel_id: channelId,
      owner_id: ownerId,
      guild_id: guildId,
      channel_name: channelName,
      empty_at: emptyAt ? Number(emptyAt) : null,
      updated_at: new Date().toISOString(),
    };

    const { error } = await supabase
      .from("vip_active_rooms")
      .upsert(payload, { onConflict: "channel_id" });

    if (error) {
      console.warn(`[vipRoomService] syncVipRoomToDatabase error for ${channelId}:`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[vipRoomService] syncVipRoomToDatabase exception for ${channelId}:`, err.message);
    return false;
  }
}

/**
 * อัปเดตสถานะ empty_at ของห้อง VIP ลงในตาราง Supabase
 * @param {string} channelId 
 * @param {number|null} emptyAt Timestamp ms หรือ null (เมื่อมีคนอยู่ในห้อง)
 */
async function updateVipRoomEmptyStateInDatabase(channelId, emptyAt) {
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from("vip_active_rooms")
      .update({
        empty_at: emptyAt ? Number(emptyAt) : null,
        updated_at: new Date().toISOString(),
      })
      .eq("channel_id", channelId);

    if (error) {
      console.warn(`[vipRoomService] updateVipRoomEmptyStateInDatabase error for ${channelId}:`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[vipRoomService] updateVipRoomEmptyStateInDatabase exception for ${channelId}:`, err.message);
    return false;
  }
}

/**
 * ลบข้อมูลห้อง VIP ออกจากตาราง Supabase เมื่อห้องถูกลบสำเร็จ
 * @param {string} channelId 
 */
async function removeVipRoomFromDatabase(channelId) {
  const supabase = getSupabaseClient();
  if (!supabase) return false;

  try {
    const { error } = await supabase
      .from("vip_active_rooms")
      .delete()
      .eq("channel_id", channelId);

    if (error) {
      console.warn(`[vipRoomService] removeVipRoomFromDatabase error for ${channelId}:`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.warn(`[vipRoomService] removeVipRoomFromDatabase exception for ${channelId}:`, err.message);
    return false;
  }
}

/**
 * ดึงรายการห้อง VIP ทั้งหมดที่ยัง Active อยู่จาก Supabase
 */
async function fetchVipActiveRoomsFromDatabase() {
  const supabase = getSupabaseClient();
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from("vip_active_rooms")
      .select("*");

    if (error) {
      console.warn("[vipRoomService] fetchVipActiveRoomsFromDatabase error:", error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.warn("[vipRoomService] fetchVipActiveRoomsFromDatabase exception:", err.message);
    return [];
  }
}

/**
 * ซิงค์และกู้คืนห้อง VIP จาก Supabase Table กลับเข้าสู่ Redis
 * ใช้ตอนบอทเริ่มทำงาน (Startup) เผื่อกรณี Redis ถูกรีสตาร์ตหรือแคชหลุด
 */
async function restoreVipRoomsFromDatabaseToRedis() {
  try {
    const dbRooms = await fetchVipActiveRoomsFromDatabase();
    if (!dbRooms || dbRooms.length === 0) return 0;

    const redisRooms = await getAllRooms();
    let restoredCount = 0;

    for (const row of dbRooms) {
      const existing = redisRooms[row.channel_id];
      if (!existing) {
        // หากไม่มีใน Redis ให้กู้คืนกลับมา
        await saveRoom(row.channel_id, "vip", row.owner_id, {});
        if (row.empty_at) {
          await setRoomEmpty(row.channel_id, Number(row.empty_at));
        }
        restoredCount++;
        console.log(`♻️ [VIP Recovery] กู้คืนห้อง VIP "${row.channel_name || row.channel_id}" จาก Supabase เข้า Redis สำเร็จ`);
      } else if (!existing.emptyAt && row.empty_at) {
        // หากใน Redis ไม่มี emptyAt แต่ใน Supabase มี ให้ใช้ค่าเดิมของ Supabase
        await setRoomEmpty(row.channel_id, Number(row.empty_at));
      }
    }

    if (restoredCount > 0) {
      console.log(`✅ [VIP Recovery] กู้คืนห้อง VIP จาก Supabase รวม ${restoredCount} ห้อง`);
    }
    return restoredCount;
  } catch (err) {
    console.error("[vipRoomService] restoreVipRoomsFromDatabaseToRedis error:", err.message);
    return 0;
  }
}

module.exports = {
  syncVipRoomToDatabase,
  updateVipRoomEmptyStateInDatabase,
  removeVipRoomFromDatabase,
  fetchVipActiveRoomsFromDatabase,
  restoreVipRoomsFromDatabaseToRedis,
};
