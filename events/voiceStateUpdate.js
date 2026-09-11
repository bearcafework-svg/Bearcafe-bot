// ===================================================
// events/voiceStateUpdate.js — จับ event เข้า/ออกห้อง
// ===================================================

const { resolveZoneFromLobby } = require("../utils/zoneResolver");
const { createRoom } = require("../handlers/roomCreator");
const { markRoomActive, destroyRoom } = require("../handlers/roomDestroyer");
const { getAllRooms, deleteRoom } = require("../state/redisClient");
const { sendRoomLog } = require("../utils/roomLogger");
const { sendRentHousePanel, isRentHouseOwner, RENT_HOUSE_CATEGORY_ID } = require("../handlers/rentHousePanel");
const { logVoiceEvent } = require("../utils/voiceLogger");

module.exports = {
  name: "voiceStateUpdate",

  async execute(oldState, newState) {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return; // ไม่สนใจบอท

    const joinedChannel = newState.channelId; // ช่องที่เข้ามาใหม่
    const leftChannel = oldState.channelId; // ช่องที่ออกไป

    // ⚡ Short-circuit: หากไม่ได้เปลี่ยนห้อง (เช่น Mute/Unmute/เปิดกล้อง) ให้ข้ามทันที
    if (joinedChannel === leftChannel) return;

    // บันทึกประวัติห้องเสียงลง Redis Buffer Queue
    logVoiceEvent(oldState, newState).catch(console.error);

    const guild = newState.guild || oldState.guild;
    const rooms = await getAllRooms();

    // ทริกเกอร์อัปเดตบอร์ดห้องเสียงหาเพื่อน (Voice Board 24 ชม.)
    if (process.env.ENABLE_VOICE_BOARD === "true") {
      try {
        const { triggerVoiceBoardUpdate } = require("../src/features/voiceBoard");
        triggerVoiceBoardUpdate(guild);
      } catch (e) {}
    }

    // ── 1. คนเข้า Lobby → สร้างห้องใหม่ ──────────────────────────
    if (joinedChannel && joinedChannel !== leftChannel) {
      const zone = resolveZoneFromLobby(joinedChannel);
      if (zone) {
        console.log(`👤 ${member.user.tag} เข้า Lobby โซน "${zone.name}"`);

        // ตรวจลบห้องเดิมก่อน แม้จะกำลังเข้า Lobby (รันแบบ Background ไม่บล็อกการสร้างห้องใหม่)
        if (leftChannel && rooms[leftChannel]) {
          const leftCh = guild.channels.cache.get(leftChannel);
          if (leftCh && leftCh.members.size === 0) {
            console.log(`🔕 "${leftCh.name}" ว่างแล้ว (ออกไปเข้า Lobby) — เริ่มลบในพื้นหลัง`);
            destroyRoom(guild, leftChannel).catch((err) => {
              console.error(`[voiceStateUpdate] destroyRoom error for ${leftChannel}:`, err.message);
            });
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
      if (joinedCh) {
        if (joinedCh.parentId === RENT_HOUSE_CATEGORY_ID) {
          const isOwner = await isRentHouseOwner(joinedCh, member.id);
          if (isOwner) {
            console.log(`🏠 เจ้าของบ้านเช่า "${member.user.tag}" เข้าห้องตัวเอง (${joinedCh.name}) — ส่งแผงควบคุมบ้านเช่าอัตโนมัติ`);
            await sendRentHousePanel(joinedCh, member).catch(console.error);
          }
        }

        // ── 1.2 ตั้งค่า Voice Status สำหรับห้องในหมวดหมู่ Point x2 (แสดงเมื่อมีสมาชิก 2 คนขึ้นไป) ──
        if (joinedCh.parentId === "1543974947561537646") {
          const nonBotCount = joinedCh.members ? joinedCh.members.filter(m => !m.user?.bot).size : 0;
          const statusText = nonBotCount >= 2 ? "<a:59217leaf:1512014878796152862> ลงห้องรับ 𝐏𝐨𝐢𝐧𝐭 𝐱𝟐 มาเลย!" : "";
          guild.client.rest.put(`/channels/${joinedChannel}/voice-status`, {
            body: { status: statusText }
          }).catch(() => {});
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

    // ── 2. คนออกจากห้อง ─────────────────────────────────────────
    if (leftChannel && joinedChannel !== leftChannel) {
      const leftCh = guild.channels.cache.get(leftChannel);
      if (leftCh && leftCh.parentId === "1543974947561537646") {
        const nonBotCount = leftCh.members ? leftCh.members.filter(m => !m.user?.bot).size : 0;
        const statusText = nonBotCount >= 2 ? "<a:59217leaf:1512014878796152862> ลงห้องรับ 𝐏𝐨𝐢𝐧𝐭 𝐱𝟐 มาเลย!" : "";
        guild.client.rest.put(`/channels/${leftChannel}/voice-status`, {
          body: { status: statusText }
        }).catch(() => {});
      }

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
