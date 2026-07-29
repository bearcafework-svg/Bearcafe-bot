// ===================================================
// events/voiceStateUpdate.js — จับ event เข้า/ออกห้อง
// ===================================================

const { resolveZoneFromLobby } = require("../utils/zoneResolver");
const { createRoom } = require("../handlers/roomCreator");
const { markRoomActive, destroyRoom } = require("../handlers/roomDestroyer");
const { getAllRooms, deleteRoom } = require("../state/redisClient");
const { sendRoomLog } = require("../utils/roomLogger");
const { sendRentHousePanel, isRentHouseOwner, RENT_HOUSE_CATEGORY_ID } = require("../handlers/rentHousePanel");

module.exports = {
  name: "voiceStateUpdate",

  async execute(oldState, newState) {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return; // ไม่สนใจบอท

    const guild = newState.guild || oldState.guild;
    const joinedChannel = newState.channelId; // ช่องที่เข้ามาใหม่
    const leftChannel = oldState.channelId; // ช่องที่ออกไป

    const rooms = await getAllRooms();

    // ── 1. คนเข้า Lobby → สร้างห้องใหม่ ──────────────────────────
    if (joinedChannel && joinedChannel !== leftChannel) {
      const zone = resolveZoneFromLobby(joinedChannel);
      if (zone) {
        console.log(`👤 ${member.user.tag} เข้า Lobby โซน "${zone.name}"`);

        // ตรวจลบห้องเดิมก่อน แม้จะกำลังเข้า Lobby
        if (leftChannel && rooms[leftChannel]) {
          const leftCh = guild.channels.cache.get(leftChannel);
          if (leftCh && leftCh.members.size === 0) {
            console.log(`🔕 "${leftCh.name}" ว่างแล้ว (ออกไปเข้า Lobby) — ลบ`);
            await destroyRoom(guild, leftChannel);
          }
        }

        await createRoom(guild, member, zone);
        return;
      }

      // ถ้าเข้าห้องที่บอทสร้าง → mark ว่ามีคนอยู่ (ยกเลิกนับถอยหลังลบ)
      if (rooms[joinedChannel]) {
        await markRoomActive(joinedChannel);
      }

      // ── 1.1 เจ้าของห้องบ้านเช่า เข้าห้องบ้านเช่าของตัวเอง → ส่งแผงควบคุม Rent House Panel ทันที ──
      const joinedCh = guild.channels.cache.get(joinedChannel);
      if (joinedCh && joinedCh.parentId === RENT_HOUSE_CATEGORY_ID) {
        const isOwner = await isRentHouseOwner(joinedCh, member.id);
        if (isOwner) {
          console.log(`🏠 เจ้าของบ้านเช่า "${member.user.tag}" เข้าห้องตัวเอง (${joinedCh.name}) — ส่งแผงควบคุมบ้านเช่าอัตโนมัติ`);
          await sendRentHousePanel(joinedCh, member).catch(console.error);
        }
      }
    }

    if (joinedChannel !== leftChannel) {
      const oldRoom = rooms[leftChannel];
      const newRoom = rooms[joinedChannel];
      const oldChannel = leftChannel ? guild.channels.cache.get(leftChannel) : null;
      const newChannel = joinedChannel ? guild.channels.cache.get(joinedChannel) : null;

      if (oldRoom && newRoom) {
        await sendRoomLog("move", member, { oldChannel, newChannel });
      } else if (newRoom) {
        await sendRoomLog("join", member, { channel: newChannel });
      } else if (oldRoom) {
        await sendRoomLog("leave", member, { channel: oldChannel });
      }
    }

    // ── 2. คนออกจากห้อง → เช็คว่าว่างไหม ─────────────────────────
    if (leftChannel) {
      if (!rooms[leftChannel]) return; // ไม่ใช่ห้องที่บอทสร้าง

      const channel = guild.channels.cache.get(leftChannel);
      if (!channel) {
        await deleteRoom(leftChannel); // channel หายไปจาก cache แต่ยังอยู่ใน Redis
        return;
      }

      if (channel.members.size === 0) {
        console.log(`🔕 "${channel.name}" ว่างแล้ว — ลบทันที`);
        await destroyRoom(channel.guild, leftChannel);
      }
    }
  },
};
