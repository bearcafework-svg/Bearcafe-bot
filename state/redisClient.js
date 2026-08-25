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

function defaultRoomSettings(settings = {}) {
  return {
    locked: false,
    hidden: false,
    trustedUserIds: [],
    blockedUserIds: [],
    ...settings,
  };
}

let roomsCache = {};
let roomsCacheTime = 0;
const ROOMS_CACHE_TTL_MS = 5000;
let separatorsCache = {};

async function saveRoom(channelId, zoneId, ownerId, settings = {}) {
  const roomObj = {
    zoneId,
    ownerId,
    createdAt: Date.now(),
    emptyAt: null,
    settings: defaultRoomSettings(settings),
  };
  roomsCache[channelId] = roomObj;
  try {
    const r = getRedis();
    await r.hset("rooms:active", {
      [channelId]: JSON.stringify(roomObj),
    });
  } catch (err) {
    console.warn("[redisClient] saveRoom fallback to RAM cache:", err.message);
  }
}

async function getRoom(channelId) {
  if (roomsCache[channelId]) {
    return roomsCache[channelId];
  }
  try {
    const r = getRedis();
    const raw = await r.hget("rooms:active", channelId);
    if (!raw) return null;
    const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
    roomsCache[channelId] = parsed;
    return parsed;
  } catch (err) {
    console.warn("[redisClient] getRoom fallback to RAM cache:", err.message);
    return roomsCache[channelId] || null;
  }
}

async function updateRoom(channelId, patch) {
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

  roomsCache[channelId] = nextRoom;
  try {
    const r = getRedis();
    await r.hset("rooms:active", { [channelId]: JSON.stringify(nextRoom) });
  } catch (err) {
    console.warn("[redisClient] updateRoom fallback to RAM cache:", err.message);
  }
  return nextRoom;
}

async function setRoomEmpty(channelId, emptyAt) {
  const room = await getRoom(channelId);
  if (!room) return;

  room.emptyAt = emptyAt;
  roomsCache[channelId] = room;
  try {
    const r = getRedis();
    await r.hset("rooms:active", { [channelId]: JSON.stringify(room) });
  } catch (err) {
    console.warn("[redisClient] setRoomEmpty fallback to RAM cache:", err.message);
  }
}

async function deleteRoom(channelId) {
  delete roomsCache[channelId];
  try {
    const r = getRedis();
    await r.hdel("rooms:active", channelId);
  } catch (err) {
    console.warn("[redisClient] deleteRoom fallback to RAM cache:", err.message);
  }
}

async function getAllRooms() {
  if (Object.keys(roomsCache).length > 0 && (Date.now() - roomsCacheTime < ROOMS_CACHE_TTL_MS)) {
    return roomsCache;
  }
  try {
    const r = getRedis();
    const raw = await r.hgetall("rooms:active");
    if (!raw) {
      roomsCacheTime = Date.now();
      return roomsCache;
    }

    const result = {};
    for (const [channelId, value] of Object.entries(raw)) {
      result[channelId] = typeof value === "string" ? JSON.parse(value) : value;
    }
    roomsCache = { ...result, ...roomsCache };
    roomsCacheTime = Date.now();
    return roomsCache;
  } catch (err) {
    console.warn("[redisClient] getAllRooms fallback to RAM cache:", err.message);
    return roomsCache;
  }
}

async function saveSeparator(zoneId, channelId) {
  if (!channelId) {
    delete separatorsCache[zoneId];
  } else {
    separatorsCache[zoneId] = channelId;
  }
  try {
    const r = getRedis();
    if (!channelId) {
      await r.hdel("separators", zoneId);
    } else {
      await r.hset("separators", { [zoneId]: channelId });
    }
  } catch (err) {
    console.warn("[redisClient] saveSeparator fallback:", err.message);
  }
}

async function getSeparator(zoneId) {
  if (separatorsCache[zoneId]) return separatorsCache[zoneId];
  try {
    const r = getRedis();
    const res = await r.hget("separators", zoneId);
    if (res) separatorsCache[zoneId] = res;
    return res;
  } catch (err) {
    console.warn("[redisClient] getSeparator fallback:", err.message);
    return separatorsCache[zoneId] || null;
  }
}

async function getAllSeparators() {
  try {
    const r = getRedis();
    const raw = await r.hgetall("separators");
    if (raw) separatorsCache = { ...raw, ...separatorsCache };
    return separatorsCache;
  } catch (err) {
    console.warn("[redisClient] getAllSeparators fallback:", err.message);
    return separatorsCache;
  }
}

async function acquireLock(key, ttlMs = 30000) {
  const token = crypto.randomUUID();
  try {
    const r = getRedis();
    const result = await r.set(key, token, { nx: true, px: ttlMs });
    if (result !== "OK") return null;
    return { key, token };
  } catch (err) {
    console.warn("[redisClient] acquireLock fallback (Redis limit):", err.message);
    return { key, token, fallback: true };
  }
}

async function releaseLock(lock) {
  if (!lock?.key || !lock?.token) return false;
  if (lock.fallback) return true;
  try {
    const r = getRedis();
    const released = await r.eval(
      "if redis.call('get', KEYS[1]) == ARGV[1] then return redis.call('del', KEYS[1]) else return 0 end",
      [lock.key],
      [lock.token]
    );
    return released === 1;
  } catch (err) {
    console.warn("[redisClient] releaseLock fallback:", err.message);
    return true;
  }
}

module.exports = {
  getRedis,
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
