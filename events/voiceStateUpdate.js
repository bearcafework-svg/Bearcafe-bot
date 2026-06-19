// ===================================================
// events/voiceStateUpdate.js — จับ event เข้า/ออกห้อง
// ===================================================

const { resolveZoneFromLobby } = require("../utils/zoneResolver");
const { createRoom } = require("../handlers/roomCreator");
const { markRoomActive, destroyRoom } = require("../handlers/roomDestroyer");
const { getAllRooms } = require("../state/redisClient");
const { sendRoomLog } = require("../utils/roomLogger");

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
        if (rooms[leftChannel]) {
          await sendRoomLog("leave", member, { channel: guild.channels.cache.get(leftChannel) });
        }
        await createRoom(guild, member, zone);
        return;
      }

      // ถ้าเข้าห้องที่บอทสร้าง → mark ว่ามีคนอยู่ (ยกเลิกนับถอยหลังลบ)
      if (rooms[joinedChannel]) {
        await markRoomActive(joinedChannel);
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
      if (!channel) return;

      if (channel.members.size === 0) {
        console.log(`🔕 "${channel.name}" ว่างแล้ว — ลบทันที`);
        await destroyRoom(channel.guild, leftChannel);
      }
    }
  },
};
