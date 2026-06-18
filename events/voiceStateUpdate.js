// ===================================================
// events/voiceStateUpdate.js — จับ event เข้า/ออกห้อง
// ===================================================

const { resolveZoneFromLobby } = require("../utils/zoneResolver");
const { createRoom } = require("../handlers/roomCreator");
const { markRoomActive, destroyRoom } = require("../handlers/roomDestroyer");
const { getAllRooms } = require("../state/redisClient");

module.exports = {
  name: "voiceStateUpdate",

  async execute(oldState, newState) {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return; // ไม่สนใจบอท

    const guild = newState.guild || oldState.guild;
    const joinedChannel = newState.channelId; // ช่องที่เข้ามาใหม่
    const leftChannel = oldState.channelId; // ช่องที่ออกไป

    // ── 1. คนเข้า Lobby → สร้างห้องใหม่ ──────────────────────────
    if (joinedChannel) {
      const zone = resolveZoneFromLobby(joinedChannel);
      if (zone) {
        console.log(`👤 ${member.user.tag} เข้า Lobby โซน "${zone.name}"`);
        await createRoom(guild, member, zone);
      }

      // ถ้าเข้าห้องที่บอทสร้าง → mark ว่ามีคนอยู่ (ยกเลิกนับถอยหลังลบ)
      const rooms = await getAllRooms();
      if (rooms[joinedChannel]) {
        await markRoomActive(joinedChannel);
      }
    }

    // ── 2. คนออกจากห้อง → เช็คว่าว่างไหม ─────────────────────────
    if (leftChannel) {
      const rooms = await getAllRooms();
      if (!rooms[leftChannel]) return; // ไม่ใช่ห้องที่บอทสร้าง

      const channel = guild.channels.cache.get(leftChannel);
      if (!channel) return;

      if (channel.members.size === 0) {
        console.log(`🔕 "${channel.name}" ว่างแล้ว — ลบทันที`);
        await destroyRoom(channel.guild, leftChannel);
      }
    }
  },
};
