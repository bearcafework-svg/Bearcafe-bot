require("dotenv").config();
const assert = require("assert");
const { saveRoom, getRoom, setRoomEmpty, updateRoom, deleteRoom } = require("../state/redisClient");
const { resendVipRoomPanel, deleteExistingRoomPanels } = require("../handlers/roomPanel");

async function runTests() {
  console.log("=== Testing VIP Room Panel Re-send & Message Cleanup ===");

  const testChannelId = "test_vip_voice_111122223333";
  const ownerId = "owner_user_12345";
  const guestId = "guest_user_67890";
  const botId = "bot_user_99999";

  try {
    // ----------------------------------------------------
    // Test 1: setRoomEmpty sets needsOwnerPanel = true for VIP room
    // ----------------------------------------------------
    console.log("-> 1. Testing setRoomEmpty flag setting:");
    await saveRoom(testChannelId, "vip", ownerId, {});
    let room = await getRoom(testChannelId);
    assert.strictEqual(room.needsOwnerPanel, undefined);

    // เมื่อห้องว่าง -> นับถอยหลังลบ
    await setRoomEmpty(testChannelId, Date.now());
    room = await getRoom(testChannelId);
    assert.strictEqual(room.needsOwnerPanel, true, "needsOwnerPanel must be true when VIP room becomes empty");
    console.log("   ✅ needsOwnerPanel successfully set to true on empty!");

    // ----------------------------------------------------
    // Test 2: Guest enters empty/countdown room
    // ----------------------------------------------------
    console.log("-> 2. Testing guest entering countdown room:");
    // จำลอง guest เข้าห้อง
    const guestState = {
      isOwner: room.ownerId === guestId,
      wasCountingDown: Boolean(room.emptyAt),
      needsPanel: Boolean(room.needsOwnerPanel || room.emptyAt),
    };
    assert.strictEqual(guestState.isOwner, false);
    assert.strictEqual(guestState.wasCountingDown, true);

    // เคลียร์เวลานับถอยหลัง แต่คง flag needsOwnerPanel ไว้
    await setRoomEmpty(testChannelId, null);
    await updateRoom(testChannelId, { needsOwnerPanel: true });

    room = await getRoom(testChannelId);
    assert.strictEqual(room.emptyAt, null, "emptyAt must be cleared");
    assert.strictEqual(room.needsOwnerPanel, true, "needsOwnerPanel must still be true for the owner");
    console.log("   ✅ Countdown cleared and needsOwnerPanel preserved for owner!");

    // ----------------------------------------------------
    // Test 3: Owner enters room with needsOwnerPanel = true
    // ----------------------------------------------------
    console.log("-> 3. Testing owner entering room with needsOwnerPanel = true:");
    const ownerState = {
      isOwner: room.ownerId === ownerId,
      needsPanel: Boolean(room.needsOwnerPanel || room.emptyAt),
    };
    assert.strictEqual(ownerState.isOwner, true);
    assert.strictEqual(ownerState.needsPanel, true);

    // จำลอง Mock Discord Channel และข้อความแชท
    let deletedMessageIds = [];
    let sentPayloads = [];

    const mockMessages = new Map([
      ["msg_user_chat_1", { id: "msg_user_chat_1", author: { id: guestId }, content: "สวัสดีครับ", flags: { has: () => false, bitfield: 0 }, components: [], delete: async () => deletedMessageIds.push("msg_user_chat_1") }],
      ["msg_old_panel", { id: "msg_old_panel", author: { id: botId }, content: "", flags: { has: (f) => f === 32768, bitfield: 32768 }, components: [{ components: [{ customId: "vip_panel_select_action" }] }], delete: async () => deletedMessageIds.push("msg_old_panel") }],
      ["msg_user_chat_2", { id: "msg_user_chat_2", author: { id: ownerId }, content: "มาแล้วๆ", flags: { has: () => false, bitfield: 0 }, components: [], delete: async () => deletedMessageIds.push("msg_user_chat_2") }],
    ]);

    const mockChannel = {
      id: testChannelId,
      name: "VIP ★ Sweet Lounge",
      client: { user: { id: botId } },
      messages: {
        fetch: async () => mockMessages,
      },
      send: async (payload) => {
        sentPayloads.push(payload);
        return { id: "msg_new_panel" };
      },
    };

    const mockOwnerMember = {
      id: ownerId,
      user: { tag: "Owner#0001", id: ownerId },
      roles: { cache: new Map() },
      toString: () => `<@${ownerId}>`,
    };

    const success = await resendVipRoomPanel(mockChannel, mockOwnerMember, room);
    assert.strictEqual(success, true, "resendVipRoomPanel must return true");

    // ตรวจสอบว่าลบเฉพาะ msg_old_panel และไม่ลบข้อความแชทของสมาชิก
    assert.deepStrictEqual(deletedMessageIds, ["msg_old_panel"], "Must delete ONLY the old bot panel message");
    assert.strictEqual(sentPayloads.length, 1, "Must send exactly 1 new panel");

    // ตรวจสอบว่า flag needsOwnerPanel ใน Redis ถูกเคลียร์แล้ว
    room = await getRoom(testChannelId);
    assert.strictEqual(room.needsOwnerPanel, false, "needsOwnerPanel must be reset to false");
    console.log("   ✅ Old panel cleanly deleted, new panel sent, and needsOwnerPanel reset to false!");

    // ----------------------------------------------------
    // Test 4: Anti-spam: Owner disconnects and reconnects while room is still active
    // ----------------------------------------------------
    console.log("-> 4. Testing anti-spam when owner rejoins an already-active room:");
    room = await getRoom(testChannelId);
    const rejoiningState = {
      isOwner: room.ownerId === ownerId,
      needsPanel: Boolean(room.needsOwnerPanel || room.emptyAt),
    };
    assert.strictEqual(rejoiningState.isOwner, true);
    assert.strictEqual(rejoiningState.needsPanel, false, "needsPanel must be false while room was continuously active");
    console.log("   ✅ Panel is NOT resent when owner rejoins an active room!");

    // ----------------------------------------------------
    // Test 5: deleteExistingRoomPanels isolation test
    // ----------------------------------------------------
    console.log("-> 5. Testing deleteExistingRoomPanels isolation:");
    let directDeletes = [];
    const directMockMessages = new Map([
      ["user_msg", { author: { id: "another_user" }, delete: async () => directDeletes.push("user_msg") }],
      ["bot_panel", { author: { id: botId }, flags: { bitfield: 32768, has: () => true }, components: [], delete: async () => directDeletes.push("bot_panel") }],
    ]);
    const isolationChannel = {
      id: testChannelId,
      client: { user: { id: botId } },
      messages: { fetch: async () => directMockMessages },
    };
    const deletedCount = await deleteExistingRoomPanels(isolationChannel);
    assert.strictEqual(deletedCount, 1);
    assert.deepStrictEqual(directDeletes, ["bot_panel"]);
    console.log("   ✅ Isolated panel message deletion verified successfully!");

    // Cleanup test room
    await deleteRoom(testChannelId);
    console.log("\n🎉 ALL VIP PANEL RE-SEND & CLEANUP TESTS PASSED 100%!");
  } catch (err) {
    console.error("❌ Test failed:", err);
    process.exit(1);
  }
}

runTests();
