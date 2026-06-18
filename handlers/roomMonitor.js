// ===================================================
// handlers/roomMonitor.js — วน loop ตรวจห้องว่าง
// ===================================================

const { getAllRooms } = require("../state/redisClient");
const { destroyRoom } = require("./roomDestroyer");
const config = require("../config");

function startMonitor(client) {
  const intervalMs = config.monitorIntervalSeconds * 1000;
  const timeoutMs = config.emptyTimeoutMinutes * 60 * 1000;

  console.log(
    `🔍 เริ่ม Monitor ทุก ${config.monitorIntervalSeconds} วินาที | ลบห้องว่างหลัง ${config.emptyTimeoutMinutes} นาที`
  );

  setInterval(async () => {
    try {
      const rooms = await getAllRooms();
      const now = Date.now();

      for (const [channelId, roomData] of Object.entries(rooms)) {
        // ถ้าห้องไม่ได้ถูก mark ว่าว่าง ข้ามไป
        if (!roomData.emptyAt) continue;

        const emptyDuration = now - roomData.emptyAt;

        if (emptyDuration >= timeoutMs) {
          // หา guild จาก channel
          const channel = client.channels.cache.get(channelId);
          if (!channel) {
            // ลบออกจาก Redis ถ้าหาช่องไม่เจอ
            const { deleteRoom } = require("../state/redisClient");
            await deleteRoom(channelId);
            continue;
          }

          await destroyRoom(channel.guild, channelId);
        }
      }
    } catch (e) {
      console.error("❌ Monitor error:", e.message);
    }
  }, intervalMs);
}

module.exports = { startMonitor };
