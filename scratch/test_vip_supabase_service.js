require("dotenv").config();
const assert = require("assert");
const {
  syncVipRoomToDatabase,
  updateVipRoomEmptyStateInDatabase,
  removeVipRoomFromDatabase,
  fetchVipActiveRoomsFromDatabase,
  restoreVipRoomsFromDatabaseToRedis,
} = require("../src/services/vipRoomService");
const { getRoom, deleteRoom } = require("../state/redisClient");

async function runTest() {
  console.log("=== Testing VIP Room Supabase Service & Hybrid Architecture ===");

  const testChannelId = "test_vip_channel_9999999999";
  const testOwnerId = "test_owner_8888888888";
  const testGuildId = "test_guild_7777777777";
  const testChannelName = "VIP ★ Test Room";

  try {
    // 1. ทดสอบบันทึกห้องใหม่
    console.log("-> 1. Testing syncVipRoomToDatabase (Insert/Upsert):");
    const syncSuccess = await syncVipRoomToDatabase(testChannelId, {
      ownerId: testOwnerId,
      guildId: testGuildId,
      channelName: testChannelName,
      emptyAt: null,
    });
    assert.strictEqual(syncSuccess, true, "syncVipRoomToDatabase must return true");
    console.log("   ✅ Saved to Supabase successfully!");

    // 2. ทดสอบอัปเดตเวลาว่าง emptyAt
    console.log("-> 2. Testing updateVipRoomEmptyStateInDatabase:");
    const emptyTime = Date.now() - (10 * 60 * 60 * 1000); // จำลองว่างมาแล้ว 10 ชม.
    const updateSuccess = await updateVipRoomEmptyStateInDatabase(testChannelId, emptyTime);
    assert.strictEqual(updateSuccess, true, "updateVipRoomEmptyStateInDatabase must return true");
    console.log("   ✅ Updated empty_at in Supabase successfully!");

    // 3. ทดสอบดึงข้อมูลจากตาราง
    console.log("-> 3. Testing fetchVipActiveRoomsFromDatabase:");
    const rooms = await fetchVipActiveRoomsFromDatabase();
    const found = rooms.find(r => r.channel_id === testChannelId);
    assert(found, "Test room must be present in fetched rooms");
    assert.strictEqual(found.owner_id, testOwnerId);
    assert.strictEqual(Number(found.empty_at), emptyTime);
    console.log(`   ✅ Found test room in Supabase! empty_at=${found.empty_at}`);

    // 4. ทดสอบกู้คืนเข้าสู่ Redis (Disaster Recovery)
    console.log("-> 4. Testing restoreVipRoomsFromDatabaseToRedis:");
    // ลบออกจาก Redis ก่อนเพื่อเลียนแบบ Redis memory flush
    await deleteRoom(testChannelId);
    const beforeRestore = await getRoom(testChannelId);
    assert.strictEqual(beforeRestore, null, "Room should not exist in Redis before restore");

    // รันการกู้คืน
    const restoredCount = await restoreVipRoomsFromDatabaseToRedis();
    assert(restoredCount >= 1, "At least 1 room should be restored");

    // ตรวจสอบข้อมูลใน Redis หลังกู้คืน
    const afterRestore = await getRoom(testChannelId);
    assert(afterRestore, "Room must exist in Redis after restore");
    assert.strictEqual(afterRestore.ownerId, testOwnerId);
    assert.strictEqual(Number(afterRestore.emptyAt), emptyTime);
    console.log("   ✅ Successfully restored room & emptyAt into Redis from Supabase Table!");

    // 5. ทดสอบลบห้องเมื่อเสร็จสิ้น
    console.log("-> 5. Testing removeVipRoomFromDatabase:");
    const removeSuccess = await removeVipRoomFromDatabase(testChannelId);
    assert.strictEqual(removeSuccess, true, "removeVipRoomFromDatabase must return true");
    await deleteRoom(testChannelId);

    const roomsAfterDelete = await fetchVipActiveRoomsFromDatabase();
    const stillExists = roomsAfterDelete.find(r => r.channel_id === testChannelId);
    assert.strictEqual(stillExists, undefined, "Room must be deleted from Supabase");
    console.log("   ✅ Room successfully cleaned up from Supabase!");

    console.log("\n🎉 ALL SUPABASE TABLE & HYBRID TESTS PASSED 100%!");
  } catch (err) {
    console.error("❌ Test Failed:", err);
    process.exit(1);
  }
}

runTest();
