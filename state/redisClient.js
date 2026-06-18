// ===================================================
// state/redisClient.js — เชื่อมต่อ Upstash Redis
// ===================================================
// Redis ใช้เก็บ state ห้องที่บอทสร้าง
// เพื่อให้บอท restart แล้วยังจำได้ว่ามีห้องอะไรอยู่บ้าง

const { Redis } = require("@upstash/redis");

let redis;

function getRedis() {
  if (!redis) {
    redis = new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL,
      token: process.env.UPSTASH_REDIS_REST_TOKEN,
    });
  }
  return redis;
}

// บันทึกห้องที่บอทสร้างลง Redis
async function saveRoom(channelId, zoneId, ownerId) {
  const r = getRedis();
  await r.hset("rooms:active", {
    [channelId]: JSON.stringify({
      zoneId,
      ownerId,
      createdAt: Date.now(),
      emptyAt: null,
      settings: {
        locked: false,
        hidden: false,
        trustedUserIds: [],
        blockedUserIds: [],
      },
    }),
  });
}

async function getRoom(channelId) {
  const r = getRedis();
  const raw = await r.hget("rooms:active", channelId);
  if (!raw) return null;
  return typeof raw === "string" ? JSON.parse(raw) : raw;
}

async function updateRoom(channelId, patch) {
  const r = getRedis();
  const room = await getRoom(channelId);
  if (!room) return null;

  const nextRoom = {
    ...room,
    ...patch,
    settings: {
      ...(room.settings || {}),
      ...(patch.settings || {}),
    },
  };

  await r.hset("rooms:active", { [channelId]: JSON.stringify(nextRoom) });
  return nextRoom;
}

// อัปเดตว่าห้องว่างตั้งแต่เมื่อไร (เริ่มนับถอยหลังลบ)
async function setRoomEmpty(channelId, emptyAt) {
  const r = getRedis();
  const raw = await r.hget("rooms:active", channelId);
  if (!raw) return;

  const room = typeof raw === "string" ? JSON.parse(raw) : raw;
  room.emptyAt = emptyAt;
  await r.hset("rooms:active", { [channelId]: JSON.stringify(room) });
}

// ลบห้องออกจาก Redis
async function deleteRoom(channelId) {
  const r = getRedis();
  await r.hdel("rooms:active", channelId);
}

// ดึงห้องทั้งหมดที่บอทสร้าง
async function getAllRooms() {
  const r = getRedis();
  const raw = await r.hgetall("rooms:active");
  if (!raw) return {};

  const result = {};
  for (const [channelId, value] of Object.entries(raw)) {
    result[channelId] = typeof value === "string" ? JSON.parse(value) : value;
  }
  return result;
}

// บันทึก separatorChannelId ลง Redis
async function saveSeparator(zoneId, channelId) {
  const r = getRedis();
  if (!channelId) {
    await r.hdel("separators", zoneId);
    return;
  }
  await r.hset("separators", { [zoneId]: channelId });
}

// ดึง separatorChannelId ของโซน
async function getSeparator(zoneId) {
  const r = getRedis();
  return await r.hget("separators", zoneId);
}

// ดึง separator ทั้งหมด
async function getAllSeparators() {
  const r = getRedis();
  const raw = await r.hgetall("separators");
  return raw || {};
}

module.exports = {
  saveRoom,
  getRoom,
  updateRoom,
  setRoomEmpty,
  deleteRoom,
  getAllRooms,
  saveSeparator,
  getSeparator,
  getAllSeparators,
};
