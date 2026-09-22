// ===================================================
// handlers/roomDestroyer.js — จัดการการลบห้องและนับถอยหลัง VIP
// ===================================================

const { deleteRoom, setRoomEmpty, getAllRooms, getRoom } = require("../state/redisClient");
const { isSeparatorChannel, isLobbyChannel } = require("../utils/zoneResolver");
const { safeDeleteChannel } = require("../utils/discordSafety");
const {
  updateVipRoomEmptyStateInDatabase,
  removeVipRoomFromDatabase,
} = require("../src/services/vipRoomService");
const config = require("../config");

const deletingChannels = new Set();
const VIP_RETENTION_MS = 24 * 60 * 60 * 1000; // 24 ชั่วโมง (86,400,000 ms)
const VIP_ACTIVE_CATEGORY_ID = config.roomsCategoryId || "1524122788015636682";
const VIP_INACTIVE_CATEGORY_ID = config.vipInactiveCategoryId || "1549723895936979004";

/**
 * ย้าย Category ของห้อง VIP อย่างปลอดภัย โดยรักษาสิทธิ์เดิมไว้ทั้งหมด
 */
async function moveVipRoomCategory(channel, targetCategoryId, label = "") {
  if (!channel || !targetCategoryId) return;
  if (channel.parentId === targetCategoryId) return;

  try {
    await channel.setParent(targetCategoryId, { lockPermissions: false });
    console.log(`📂 [VIP] ย้ายห้อง "${channel.name}" ไปยัง Category ${label} (${targetCategoryId}) สำเร็จ`);
  } catch (err) {
    console.error(`❌ [VIP] ย้ายห้อง "${channel?.name}" ไปยัง Category ${label} (${targetCategoryId}) ล้มเหลว:`, err.message);
  }
}

/**
 * คำนวณและจัดรูปแบบข้อความนับถอยหลังของสถานะ Voice Status
 * - เหลือมากกว่า 60 นาที: แสดงเป็นชั่วโมงเท่านั้น (ไม่แสดงนาที) เช่น 24 ชั่วโมง, 23 ชั่วโมง, 2 ชั่วโมง
 * - 60 นาทีสุดท้าย: แสดงเป็นนาที เช่น 60 นาที, 59 นาที ... 1 นาที
 */
function formatRemainingTime(ms) {
  if (ms <= 0) return "🚫 ห้องจะถูกลบ 1 นาที";
  const totalMinutes = Math.floor(ms / (60 * 1000));

  // 60 นาทีสุดท้าย: แสดงเป็นนาที
  if (totalMinutes <= 1) {
    return "🚫 ห้องจะถูกลบ 1 นาที";
  }
  if (totalMinutes <= 60) {
    return `🗑️ ห้องจะถูกลบ ${totalMinutes} นาที`;
  }

  // มากกว่า 60 นาที: นับเฉพาะชั่วโมง (ไม่เอานาที)
  const hours = Math.ceil(totalMinutes / 60);
  return `🗑️ ห้องจะถูกลบ ${hours} ชั่วโมง`;
}

/**
 * ส่งคำขออัปเดต Voice Channel Status ไปยัง Discord REST API
 */
async function setVoiceChannelStatus(guild, channelId, statusText) {
  if (!guild || !guild.client || !guild.client.rest) return;
  try {
    await guild.client.rest.put(`/channels/${channelId}/voice-status`, {
      body: { status: statusText || "" },
    });
  } catch (err) {
    // ข้ามกรณีติด Rate limit หรือห้องไม่อยู่แล้ว
  }
}

/**
 * มาร์กสถานะห้องว่าง
 */
async function markRoomEmpty(channelId) {
  await setRoomEmpty(channelId, Date.now());
}

/**
 * มาร์กสถานะห้องมีคนอยู่ (เคลียร์เวลานับถอยหลัง)
 */
async function markRoomActive(channelId) {
  await setRoomEmpty(channelId, null);
}

/**
 * ล้างเวลานับถอยหลัง เคลียร์ข้อความ Voice Status และย้ายห้อง VIP กลับมาหมวดหมู่ใช้งาน (Active)
 */
async function clearVipRoomCountdown(guild, channelId) {
  await setRoomEmpty(channelId, null);
  updateVipRoomEmptyStateInDatabase(channelId, null).catch(() => {});
  await setVoiceChannelStatus(guild, channelId, "");

  const channel = guild?.channels?.cache?.get(channelId)
    || (guild?.channels?.fetch ? await guild.channels.fetch(channelId).catch(() => null) : null);

  if (channel) {
    await moveVipRoomCategory(channel, VIP_ACTIVE_CATEGORY_ID, "ใช้งาน (Active)");
  }
}

/**
 * ฟังก์ชันหลักในการทำลายหรือเริ่มนับถอยหลังห้อง
 * @param {Guild} guild 
 * @param {string} channelId 
 * @param {boolean} force บังคับลบทันที (สำหรับปุ่มแผงควบคุม หรือหมดเวลา 24 ชั่วโมง)
 */
async function destroyRoom(guild, channelId, force = false) {
  if (deletingChannels.has(channelId)) return;

  if (isLobbyChannel(channelId) || isSeparatorChannel(channelId)) {
    return;
  }

  const channel = guild.channels.cache.get(channelId)
    || await guild.channels.fetch(channelId).catch(() => null);
  const rooms = await getAllRooms();
  const room = rooms[channelId];

  if (!channel) {
    await deleteRoom(channelId);
    return;
  }

  const nonBotCount = channel.members ? channel.members.filter((m) => !m.user?.bot).size : 0;
  if (nonBotCount > 0) {
    return;
  }

  // หากเป็นห้อง VIP และไม่ใช่การสั่งลบแบบ force -> ให้นับถอยหลัง 24 ชั่วโมง และย้ายไปยัง Inactive Category
  if (room && room.zoneId === "vip" && !force) {
    const emptyAt = room.emptyAt ? Number(room.emptyAt) : Date.now();
    if (!room.emptyAt) {
      await setRoomEmpty(channelId, emptyAt);
      updateVipRoomEmptyStateInDatabase(channelId, emptyAt).catch(() => {});
      console.log(`⏳ ห้อง VIP "${channel.name}" ว่างแล้ว — เริ่มนับถอยหลังลบห้อง 24 ชั่วโมง`);
    }

    const elapsed = Date.now() - emptyAt;
    const remaining = VIP_RETENTION_MS - elapsed;

    // ถ้าเวลาว่างเกิน 24 ชั่วโมงแล้ว (เช่น ระหว่างบอทดับหรือรีสตาร์ต) ให้ลบห้องทันที
    if (remaining <= 0) {
      console.log(`⏰ ห้อง VIP "${channel.name}" ว่างครบ 24 ชั่วโมงแล้ว (ตรวจพบใน destroyRoom) — ทำการลบห้อง`);
      return await destroyRoom(guild, channelId, true);
    }

    await setVoiceChannelStatus(guild, channelId, formatRemainingTime(remaining));
    await moveVipRoomCategory(channel, VIP_INACTIVE_CATEGORY_ID, "พักห้อง (Inactive)");
    return;
  }

  // สำหรับห้องนอน หรือสั่งลบแบบ force
  deletingChannels.add(channelId);
  try {
    await safeDeleteChannel(channel, force ? "VIP room expired or owner requested delete" : "Smart room is empty");
    await deleteRoom(channelId);
    if (room?.zoneId === "vip") {
      removeVipRoomFromDatabase(channelId).catch(() => {});
    }
    console.log(`Deleted room "${channel.name}"`);
  } catch (e) {
    console.error(`Could not delete room ${channelId}:`, e.message);
  } finally {
    deletingChannels.delete(channelId);
  }
}

/**
 * ตรวจสอบห้อง VIP ที่ว่างอยู่ทั้งหมดเพื่ออัปเดต Voice Status หรือลบเมื่อครบ 24 ชั่วโมง
 * รันเป็นรอบ Background Loop ทุก 1 นาที
 */
async function checkVipRoomsExpiry(client) {
  try {
    const rooms = await getAllRooms();
    const now = Date.now();

    for (const [channelId, room] of Object.entries(rooms)) {
      if (room.zoneId !== "vip") continue;

      // ค้นหาห้องใน Guilds ทั้งหมดของ Client (ค้นหาใน Cache ก่อน และ Fetch สำรองหากยังไม่โหลด Cache)
      let channel = null;
      let guild = null;
      for (const g of client.guilds.cache.values()) {
        channel = g.channels.cache.get(channelId)
          || (g.channels.fetch ? await g.channels.fetch(channelId).catch(() => null) : null);
        if (channel) {
          guild = g;
          break;
        }
      }

      if (!channel) {
        await deleteRoom(channelId);
        continue;
      }

      const nonBotCount = channel.members ? channel.members.filter((m) => !m.user?.bot).size : 0;

      // ถ้ามีคนเข้าห้อง -> หยุดนับถอยหลังและเคลียร์สถานะ พร้อมย้ายกลับหมวดหมู่ใช้งาน
      if (nonBotCount > 0) {
        const wasInactive = Boolean(room.emptyAt || channel.parentId !== VIP_ACTIVE_CATEGORY_ID || room.needsOwnerPanel);
        if (room.emptyAt || channel.parentId !== VIP_ACTIVE_CATEGORY_ID) {
          console.log(`👥 มีสมาชิกเข้าห้อง VIP "${channel.name}" — รีเซ็ตและย้ายกลับหมวดหมู่ใช้งาน`);
          await clearVipRoomCountdown(guild, channelId);
        }

        if (wasInactive) {
          const isOwnerInside = Boolean(channel.members?.has(room.ownerId));
          if (isOwnerInside) {
            const ownerMember = channel.members.get(room.ownerId);
            const { resendVipRoomPanel } = require("./roomPanel");
            await resendVipRoomPanel(channel, ownerMember, room).catch(console.error);
          } else {
            const { updateRoom } = require("../state/redisClient");
            await updateRoom(channelId, { needsOwnerPanel: true });
          }
        }
        continue;
      }

      // ถ้าห้องว่างแต่ยังไม่ได้ย้ายไปหมวดหมู่พักห้อง ให้ย้ายทันที
      if (channel.parentId !== VIP_INACTIVE_CATEGORY_ID) {
        await moveVipRoomCategory(channel, VIP_INACTIVE_CATEGORY_ID, "พักห้อง (Inactive)");
      }

      // ถ้าห้องว่างแต่ยังไม่มี emptyAt ให้บันทึกเวลาปัจจุบัน
      if (!room.emptyAt) {
        await setRoomEmpty(channelId, now);
        updateVipRoomEmptyStateInDatabase(channelId, now).catch(() => {});
        await setVoiceChannelStatus(guild, channelId, formatRemainingTime(VIP_RETENTION_MS));
        continue;
      }

      const elapsed = now - Number(room.emptyAt);
      const remaining = VIP_RETENTION_MS - elapsed;

      // ถ้าครบ 24 ชั่วโมงแล้ว ให้ลบห้องทันที
      if (remaining <= 0) {
        console.log(`⏰ ห้อง VIP "${channel.name}" ว่างครบ 24 ชั่วโมงแล้ว — ทำการลบห้อง`);
        await destroyRoom(guild, channelId, true);
        continue;
      }

      // อัปเดต Voice Status ตามเวลาคงเหลือ
      const statusText = formatRemainingTime(remaining);
      await setVoiceChannelStatus(guild, channelId, statusText);
    }
  } catch (err) {
    console.error("[roomDestroyer] Error in checkVipRoomsExpiry:", err.message);
  }
}

module.exports = {
  markRoomEmpty,
  markRoomActive,
  clearVipRoomCountdown,
  destroyRoom,
  checkVipRoomsExpiry,
  moveVipRoomCategory,
  formatRemainingTime,
  VIP_ACTIVE_CATEGORY_ID,
  VIP_INACTIVE_CATEGORY_ID,
  VIP_RETENTION_MS,
};
