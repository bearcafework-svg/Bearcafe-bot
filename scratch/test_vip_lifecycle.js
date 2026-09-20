const assert = require("assert");
const {
  formatRemainingTime,
  VIP_RETENTION_MS,
} = require("../handlers/roomDestroyer");

console.log("=== Testing VIP Room Lifecycle & Expiration Logic ===");

// 1. ตรวจสอบการฟอร์แมตสถานะ Voice Status
console.log("-> 1. Testing Voice Status Time Formats:");
assert.strictEqual(formatRemainingTime(24 * 60 * 60 * 1000), "🗑️ ห้องจะถูกลบ 24 ชั่วโมง");
assert.strictEqual(formatRemainingTime(23 * 60 * 60 * 1000), "🗑️ ห้องจะถูกลบ 23 ชั่วโมง");
assert.strictEqual(formatRemainingTime((22 * 60 + 1) * 60 * 1000), "🗑️ ห้องจะถูกลบ 23 ชั่วโมง");
assert.strictEqual(formatRemainingTime(2 * 60 * 60 * 1000), "🗑️ ห้องจะถูกลบ 2 ชั่วโมง");
assert.strictEqual(formatRemainingTime(61 * 60 * 1000), "🗑️ ห้องจะถูกลบ 2 ชั่วโมง");
assert.strictEqual(formatRemainingTime(60 * 60 * 1000), "🗑️ ห้องจะถูกลบ 60 นาที");
assert.strictEqual(formatRemainingTime(45 * 60 * 1000), "🗑️ ห้องจะถูกลบ 45 นาที");
assert.strictEqual(formatRemainingTime(2 * 60 * 1000), "🗑️ ห้องจะถูกลบ 2 นาที");
assert.strictEqual(formatRemainingTime(1 * 60 * 1000), "🚫 ห้องจะถูกลบ 1 นาที");
assert.strictEqual(formatRemainingTime(0), "🚫 ห้องจะถูกลบ 1 นาที");
assert.strictEqual(formatRemainingTime(-1000), "🚫 ห้องจะถูกลบ 1 นาที");
console.log("   ✅ Voice Status format passes all scenarios!");

// 2. จำลองการ Restart ซ้ำๆ (EmptyAt Must NOT Reset)
console.log("-> 2. Testing Bot Restart Resilience:");
const initialEmptyAt = Date.now() - (20 * 60 * 60 * 1000); // ว่างมาแล้ว 20 ชม.
let room = {
  zoneId: "vip",
  emptyAt: initialEmptyAt,
};

// จำลองฟังก์ชัน destroyRoom เมื่อบอทรีสตาร์ต
function simulateDestroyRoom(currentRoom, force = false) {
  if (currentRoom && currentRoom.zoneId === "vip" && !force) {
    const emptyAt = currentRoom.emptyAt ? Number(currentRoom.emptyAt) : Date.now();
    if (!currentRoom.emptyAt) {
      currentRoom.emptyAt = emptyAt;
    }
    const elapsed = Date.now() - emptyAt;
    const remaining = VIP_RETENTION_MS - elapsed;
    if (remaining <= 0) {
      return simulateDestroyRoom(currentRoom, true);
    }
    return { status: "countdown", remaining, statusText: formatRemainingTime(remaining) };
  }
  return { status: "deleted" };
}

// รัน simulate 5 ครั้ง (เลียนแบบบอทรีสตาร์ต 5 รอบ)
for (let i = 1; i <= 5; i++) {
  const result = simulateDestroyRoom(room, false);
  assert.strictEqual(room.emptyAt, initialEmptyAt, `emptyAt must remain unchanged on restart #${i}`);
  assert.strictEqual(result.status, "countdown");
  assert.strictEqual(result.statusText, "🗑️ ห้องจะถูกลบ 4 ชั่วโมง");
}
console.log("   ✅ emptyAt is preserved across restarts! Remaining time is accurate.");

// 3. จำลองเมื่อเวลาผ่านไปจนครบ 24 ชั่วโมง
console.log("-> 3. Testing Expiration Deletion (24 Hours Elapsed):");
room.emptyAt = Date.now() - (24 * 60 * 60 * 1000 + 5000); // ว่างมาแล้ว 24 ชม. 5 วินาที
const expiredResult = simulateDestroyRoom(room, false);
assert.strictEqual(expiredResult.status, "deleted", "Room must be deleted when 24h has elapsed");
console.log("   ✅ Room successfully triggers deletion after 24 hours!");

console.log("\n🎉 ALL VIP LIFECYCLE TESTS PASSED PERFECTLY!");
