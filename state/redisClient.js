// ===================================================
// state/redisClient.js — เชื่อมต่อ Upstash Redis
// ===================================================
// Redis ใช้เก็บ state ห้องที่บอทสร้าง
// เพื่อให้บอท restart แล้วยังจำได้ว่ามีห้องอะไรอยู่บ้าง

const { Redis } = require("@upstash/redis");
const crypto = require("crypto");

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
function defaultRoomSettings(settings = {}) {
  return {
    locked: false,
    hidden: false,
    trustedUserIds: [],
    blockedUserIds: [],
    ...settings,
  };
}

async function saveRoom(channelId, zoneId, ownerId, settings = {}) {
  const r = getRedis();
  await r.hset("rooms:active", {
    [channelId]: JSON.stringify({
      zoneId,
      ownerId,
      createdAt: Date.now(),
      emptyAt: null,
      settings: defaultRoomSettings(settings),
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

async function acquireLock(key, ttlMs = 30000) {
  const r = getRedis();
  const token = crypto.randomUUID();
  const result = await r.set(key, token, { nx: true, px: ttlMs });

  if (result !== "OK") return null;
  return { key, token };
}

async function releaseLock(lock) {
  if (!lock?.key || !lock?.token) return false;

  const r = getRedis();
  const released = await r.eval(
    "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
    [lock.key],
    [lock.token]
  );

  return released === 1;
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
  acquireLock,
  releaseLock,
};
