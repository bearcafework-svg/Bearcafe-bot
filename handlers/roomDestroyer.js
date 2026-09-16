// ===================================================
// handlers/roomDestroyer.js — จัดการการลบห้องและนับถอยหลัง VIP
// ===================================================

const { deleteRoom, setRoomEmpty, getAllRooms, getRoom } = require("../state/redisClient");
const { isSeparatorChannel, isLobbyChannel } = require("../utils/zoneResolver");
const { safeDeleteChannel } = require("../utils/discordSafety");
const config = require("../config");

const deletingChannels = new Set();
const VIP_RETENTION_MS = 3 * 24 * 60 * 60 * 1000; // 3 วัน (259,200,000 ms)
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
 * ตัวอย่าง:
 * - 🗑️ ห้องจะถูกลบ 3 วัน
 * - 🗑️ ห้องจะถูกลบ 2 วัน 18 ชั่วโมง
 * - 🗑️ ห้องจะถูกลบ 1 ชั่วโมง
 * - 🗑️ ห้องจะถูกลบ 12 นาที
 * - 🚫 ห้องจะถูกลบ 1 นาที
 */
function formatRemainingTime(ms) {
  if (ms <= 0) return "🚫 ห้องจะถูกลบ 1 นาที";
  const totalMinutes = Math.floor(ms / (60 * 1000));
  const totalHours = Math.floor(totalMinutes / 60);
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  const minutes = totalMinutes % 60;

  if (days >= 1) {
    if (hours === 0) {
      return `🗑️ ห้องจะถูกลบ ${days} วัน`;
    }
    return `🗑️ ห้องจะถูกลบ ${days} วัน ${hours} ชั่วโมง`;
  }

  if (hours >= 1) {
    if (minutes === 0) {
      return `🗑️ ห้องจะถูกลบ ${hours} ชั่วโมง`;
    }
    return `🗑️ ห้องจะถูกลบ ${hours} ชั่วโมง ${minutes} นาที`;
  }

  if (minutes > 1) {
    return `🗑️ ห้องจะถูกลบ ${minutes} นาที`;
  }

  return `🚫 ห้องจะถูกลบ 1 นาที`;
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
 * @param {boolean} force บังคับลบทันที (สำหรับปุ่มแผงควบคุม หรือหมดเวลา 3 วัน)
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

  // หากเป็นห้อง VIP และไม่ใช่การสั่งลบแบบ force -> ให้นับถอยหลัง 3 วัน และย้ายไปยัง Inactive Category
  if (room && room.zoneId === "vip" && !force) {
    const emptyAt = Date.now();
    await setRoomEmpty(channelId, emptyAt);
    await setVoiceChannelStatus(guild, channelId, "🗑️ ห้องจะถูกลบ 3 วัน");
    console.log(`⏳ ห้อง VIP "${channel.name}" ว่างแล้ว — เริ่มนับถอยหลังลบห้อง 3 วัน`);
    await moveVipRoomCategory(channel, VIP_INACTIVE_CATEGORY_ID, "พักห้อง (Inactive)");
    return;
  }

  // สำหรับห้องนอน หรือสั่งลบแบบ force
  deletingChannels.add(channelId);
  try {
    await safeDeleteChannel(channel, force ? "VIP room expired or owner requested delete" : "Smart room is empty");
    await deleteRoom(channelId);
    console.log(`Deleted room "${channel.name}"`);
  } catch (e) {
    console.error(`Could not delete room ${channelId}:`, e.message);
  } finally {
    deletingChannels.delete(channelId);
  }
}

/**
 * ตรวจสอบห้อง VIP ที่ว่างอยู่ทั้งหมดเพื่ออัปเดต Voice Status หรือลบเมื่อครบ 3 วัน
 * รันเป็นรอบ Background Loop ทุก 1 นาที
 */
async function checkVipRoomsExpiry(client) {
  try {
    const rooms = await getAllRooms();
    const now = Date.now();

    for (const [channelId, room] of Object.entries(rooms)) {
      if (room.zoneId !== "vip") continue;

      // ค้นหาห้องใน Guilds ทั้งหมดของ Client
      let channel = null;
      let guild = null;
      for (const g of client.guilds.cache.values()) {
        channel = g.channels.cache.get(channelId);
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
        if (room.emptyAt || channel.parentId !== VIP_ACTIVE_CATEGORY_ID) {
          console.log(`👥 มีสมาชิกเข้าห้อง VIP "${channel.name}" — รีเซ็ตและย้ายกลับหมวดหมู่ใช้งาน`);
          await clearVipRoomCountdown(guild, channelId);
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
        await setVoiceChannelStatus(guild, channelId, "🗑️ ห้องจะถูกลบ 3 วัน");
        continue;
      }

      const elapsed = now - Number(room.emptyAt);
      const remaining = VIP_RETENTION_MS - elapsed;

      // ถ้าครบ 3 วันแล้ว ให้ลบห้องทันที
      if (remaining <= 0) {
        console.log(`⏰ ห้อง VIP "${channel.name}" ว่างครบ 3 วันแล้ว — ทำการลบห้อง`);
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
  VIP_ACTIVE_CATEGORY_ID,
  VIP_INACTIVE_CATEGORY_ID,
};
