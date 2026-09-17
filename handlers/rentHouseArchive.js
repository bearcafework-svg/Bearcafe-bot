// ===================================================
// handlers/rentHouseArchive.js — ระบบจัดเก็บและกู้คืนการตั้งค่าบ้านเช่า (30 วัน)
// ===================================================

const { getSupabaseClient } = require("../src/services/supabaseClient");
const RENT_HOUSE_CATEGORY_ID = "1524122689604816986";

/**
 * สำรองข้อมูลบ้านเช่าเมื่อช่องเสียงถูกลบออกจาก Discord
 * เก็บข้อมูลไว้ในตาราง archived_rent_house_settings นาน 30 วัน
 */
async function archiveRentHouseChannel(channel) {
  if (!channel || channel.parentId !== RENT_HOUSE_CATEGORY_ID) return;

  const client = getSupabaseClient();
  if (!client) return;

  try {
    const { data: currentSetting, error } = await client
      .from("rent_house_settings")
      .select("*")
      .eq("channel_id", channel.id)
      .maybeSingle();

    if (error || !currentSetting) {
      return;
    }

    const ownerId = currentSetting.owner_id;
    console.log(`📦 [RentHouseArchive] ตรวจพบการลบห้องบ้านเช่า ${channel.id} (${channel.name}) — กำลังสำรองข้อมูลของเจ้าของ <@${ownerId}> (30 วัน)...`);

    await client.from("archived_rent_house_settings").insert({
      channel_id: channel.id,
      owner_id: ownerId,
      settings: currentSetting,
      archived_at: new Date().toISOString(),
    });

    // ลบออกจากตารางบ้านเช่าปัจจุบัน
    await client.from("rent_house_settings").delete().eq("channel_id", channel.id);
    console.log(`✅ [RentHouseArchive] สำรองข้อมูลบ้านเช่าของ <@${ownerId}> เรียบร้อยแล้ว`);

    // ทำความสะอาดข้อมูลสำรองที่หมดอายุเกิน 30 วัน
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    await client
      .from("archived_rent_house_settings")
      .delete()
      .lt("archived_at", thirtyDaysAgo);
  } catch (err) {
    console.error(`❌ [RentHouseArchive] เกิดข้อผิดพลาดในการสำรองข้อมูลห้อง ${channel?.id}:`, err.message);
  }
}

/**
 * ตรวจสอบและกู้คืนการตั้งค่าบ้านเช่าเดิมของเจ้าของห้อง (หากมีประวัติภายใน 30 วัน)
 * @param {string} ownerId
 * @param {string} newChannelId
 * @returns {Promise<object|null>}
 */
async function restoreArchivedRentHouse(ownerId, newChannelId) {
  const client = getSupabaseClient();
  if (!client || !ownerId || !newChannelId) return null;

  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    const { data: archived, error } = await client
      .from("archived_rent_house_settings")
      .select("*")
      .eq("owner_id", ownerId)
      .gte("archived_at", thirtyDaysAgo)
      .order("archived_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !archived || !archived.settings) {
      return null;
    }

    console.log(`🔄 [RentHouseArchive] พบข้อมูลบ้านเช่าเดิมของ <@${ownerId}> ที่สำรองไว้ (วันที่ ${archived.archived_at}) — กำลังกู้คืนสู่ห้องใหม่ ${newChannelId}...`);

    const oldSettings = archived.settings;
    const restoredRecord = {
      channel_id: newChannelId,
      owner_id: ownerId,
      password: oldSettings.password || null,
      locked: Boolean(oldSettings.locked),
      hidden: Boolean(oldSettings.hidden),
      trusted_user_ids: oldSettings.trusted_user_ids || [],
      blocked_user_ids: oldSettings.blocked_user_ids || [],
      co_owner_ids: oldSettings.co_owner_ids || [],
      image_url: oldSettings.image_url || null,
      permission_presets: oldSettings.permission_presets || [],
      updated_at: new Date().toISOString(),
    };

    await client.from("rent_house_settings").upsert(restoredRecord);
    // ลบข้อมูลออกจาก Archive หลังจากกู้คืนสำเร็จ
    await client.from("archived_rent_house_settings").delete().eq("id", archived.id);

    console.log(`✨ [RentHouseArchive] กู้คืนการตั้งค่าบ้านเช่าของ <@${ownerId}> สำเร็จเรียบร้อย`);
    return restoredRecord;
  } catch (err) {
    console.error(`❌ [RentHouseArchive] เกิดข้อผิดพลาดในการกู้คืนข้อมูลของ <@${ownerId}>:`, err.message);
    return null;
  }
}

module.exports = {
  RENT_HOUSE_CATEGORY_ID,
  archiveRentHouseChannel,
  restoreArchivedRentHouse,
};
