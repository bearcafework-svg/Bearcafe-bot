const { ChannelType } = require("discord.js");
const { generateRoomName } = require("../utils/nameGenerator");
const { acquireLock, deleteRoom, getAllRooms, releaseLock, saveRoom } = require("../state/redisClient");
const { syncAllSeparators } = require("../utils/separatorManager");
const { applyRoomPermissions, sendRoomPanel } = require("./roomPanel");
const { sendRoomLog } = require("../utils/roomLogger");
const { getSmartRoomPreset, normalizePresetSettings } = require("../utils/smartRoomPresets");
const { safeDeleteChannel, safeMoveMember } = require("../utils/discordSafety");
const config = require("../config");
const { trackUserDailyQuestProgress } = require("../src/features/dailyQuest");

let isCreating = false;
const queue = [];
const pendingOwners = new Map(); // ownerKey -> timestamp (auto-expire 5s)

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getRoomsCategoryId(guild, zone) {
  if (zone.roomsCategoryId) return zone.roomsCategoryId;
  if (config.roomsCategoryId) return config.roomsCategoryId;

  const lobbyChannel = guild.channels.cache.get(zone.lobbyChannelId);
  return lobbyChannel ? lobbyChannel.parentId : null;
}

function getInitialSettings(preset = {}) {
  return normalizePresetSettings({
    locked: false,
    hidden: false,
    trustedUserIds: [],
    blockedUserIds: [],
    ...preset,
  });
}

async function moveToExistingOwnerRoom(guild, member, zone) {
  const activeRooms = await getAllRooms();
  const existingRoomEntry = Object.entries(activeRooms).find(([, room]) => room.ownerId === member.id);
  if (!existingRoomEntry) return null;

  const [existingChannelId, existingRoom] = existingRoomEntry;
  const existingChannel = guild.channels.cache.get(existingChannelId)
    || await guild.channels.fetch(existingChannelId).catch(() => null);
  if (!existingChannel) {
    await deleteRoom(existingChannelId);
    return null;
  }

  if (existingRoom.zoneId !== zone.id) return existingChannel;

  const currentVoiceChannelId = guild.voiceStates.cache.get(member.id)?.channelId || member.voice?.channelId;
  if (currentVoiceChannelId && currentVoiceChannelId !== existingChannel.id) {
    await safeMoveMember(member, existingChannel, "Move owner to existing smart room");
  }

  return existingChannel;
}

async function waitForExistingOwnerRoom(guild, member, zone) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const existingChannel = await moveToExistingOwnerRoom(guild, member, zone);
    if (existingChannel) return existingChannel;
    await delay(500);
  }

  return null;
}

async function processQueue() {
  if (isCreating || queue.length === 0) return;
  isCreating = true;

  const { guild, member, zone, resolve } = queue.shift();
  const ownerKey = `${guild.id}:${member.id}`;
  try {
    const result = await _createRoom(guild, member, zone);
    resolve(result);
  } catch (e) {
    console.error("roomCreator error:", e);
    resolve(null);
  } finally {
    pendingOwners.delete(ownerKey);
    isCreating = false; // ✅ reset เสมอ แม้ error
  }

  processQueue();
}

function createRoom(guild, member, zone) {
  return new Promise((resolve) => {
    const ownerKey = `${guild.id}:${member.id}`;
    const now = Date.now();
    const lastPending = pendingOwners.get(ownerKey);

    // ป้องกันการสแปม แต่ถ้าค้างเกิน 5 วินาทีให้ปลดล็อครับคำขอใหม่ได้
    if (lastPending && now - lastPending < 5000) {
      console.log(`⏳ ${member.user.tag} มีคำขอสร้างห้องค้างอยู่ในคิว (รอไม่เกิน 5 วินาที)`);
      resolve(null);
      return;
    }

    pendingOwners.set(ownerKey, now);
    queue.push({ guild, member, zone, resolve, enqueuedAt: now });
    processQueue();
  });
}

async function _createRoom(guild, member, zone) {
  const lockKey = `smart-room:create:${guild.id}:${member.id}`;
  const lock = await acquireLock(lockKey, 8000); // ลด TTL จาก 30 วินาที เหลือ 8 วินาที

  if (!lock) {
    console.log(`Skip create room for ${member.user.tag}: another bot/process is handling it`);
    return await waitForExistingOwnerRoom(guild, member, zone);
  }

  try {
    return await createRoomWithLock(guild, member, zone);
  } finally {
    await releaseLock(lock).catch((e) => {
      console.error(`Could not release create lock for ${member.user.tag}:`, e.message);
    });
  }
}

async function createRoomWithLock(guild, member, zone) {
  // ดึงห้อง Lobby พร้อม Fetch Fallback ป้องกัน Cache Miss
  const lobbyChannel = guild.channels.cache.get(zone.lobbyChannelId)
    || await guild.channels.fetch(zone.lobbyChannelId).catch(() => null);
  const categoryId = getRoomsCategoryId(guild, zone);

  if (!lobbyChannel) {
    console.error(`Cannot create room for zone "${zone.name}": lobby channel (${zone.lobbyChannelId}) not found in guild`);
    return null;
  }

  // ตรวจสอบห้องเสียงล่าสุดแบบ Real-time จาก guild.voiceStates.cache
  const currentVoiceChannelId = guild.voiceStates.cache.get(member.id)?.channelId || member.voice?.channelId;
  if (currentVoiceChannelId !== zone.lobbyChannelId) {
    console.log(`Skip create room for ${member.user.tag}: no longer in lobby "${zone.name}" (current: ${currentVoiceChannelId || "none"})`);
    return null;
  }

  // ── ตรวจสอบห้องเดิมที่เป็นเจ้าของ ──────────────────────────────────
  const activeRooms = await getAllRooms();
  const existingRoomEntry = Object.entries(activeRooms).find(([, room]) => room.ownerId === member.id);
  if (existingRoomEntry) {
    const [existingChannelId, existingRoom] = existingRoomEntry;
    const existingChannel = guild.channels.cache.get(existingChannelId)
      || await guild.channels.fetch(existingChannelId).catch(() => null);

    if (existingChannel) {
      if (existingChannel.members.size === 0) {
        // ห้องเดิมว่างแล้ว ลบทิ้งและสร้างห้องใหม่ทันที
        console.log(`🧹 ห้องเดิมของ ${member.user.tag} ว่างแล้ว (${existingChannel.name}) — ลบทิ้งเพื่อสร้างห้องใหม่`);
        safeDeleteChannel(existingChannel, "Owner created a new smart room").catch(() => {});
        await deleteRoom(existingChannelId);
      } else {
        // หากห้องเดิมยังมีเพื่อนอยู่ โอนสิทธิ์ความเป็นเจ้าของให้เพื่อนในห้อง เพื่อให้เจ้าของสร้างห้องใหม่ได้อิสระ!
        const remainingMember = existingChannel.members.find((m) => m.id !== member.id && !m.user.bot)
          || existingChannel.members.first();
        if (remainingMember && remainingMember.id !== member.id) {
          console.log(`👑 ${member.user.tag} ออกมาสร้างห้องใหม่ — โอนสิทธิ์ห้องเดิม "${existingChannel.name}" ให้ ${remainingMember.user.tag}`);
          existingRoom.ownerId = remainingMember.id;
          await saveRoom(existingChannelId, existingRoom.zoneId, remainingMember.id, existingRoom.settings || {});
        } else {
          safeDeleteChannel(existingChannel, "Owner left empty room").catch(() => {});
          await deleteRoom(existingChannelId);
        }
      }
    } else {
      await deleteRoom(existingChannelId);
    }
  }

  // ดึง Category พร้อม Fetch Fallback
  const category = categoryId
    ? (guild.channels.cache.get(categoryId) || await guild.channels.fetch(categoryId).catch(() => null))
    : null;

  if (!category || category.type !== ChannelType.GuildCategory) {
    console.error(`Cannot create room for zone "${zone.name}": rooms category (${categoryId}) not found in guild`);
    return null;
  }

  const existingNames = guild.channels.cache
    .filter((channel) => channel.parentId === categoryId)
    .map((channel) => channel.name);

  const preset = await getSmartRoomPreset(member.id, zone.id);
  const settings = getInitialSettings(preset || {});
  const roomName = settings.name || generateRoomName(zone, existingNames, member);
  const newChannel = await guild.channels.create({
    name: roomName,
    type: ChannelType.GuildVoice,
    parent: categoryId,
    userLimit: Number.isInteger(settings.limit)
      ? settings.limit
      : (Number.isInteger(zone.userLimit) ? zone.userLimit : config.softCap),
  });

  if (zone.id !== "vip") {
    await newChannel.lockPermissions();
  }

  const room = {
    guildId: guild.id,
    zoneId: zone.id,
    ownerId: member.id,
    settings,
  };

  await saveRoom(newChannel.id, zone.id, member.id, settings);
  trackUserDailyQuestProgress(member.id, "CREATE_ROOM", 1);
  try {
    await applyRoomPermissions(newChannel, room);
  } catch (e) {
    console.error(`[roomCreator] Failed to apply room permissions for "${roomName}":`, e.message);
  }

  try {
    const moved = await safeMoveMember(member, newChannel, "Create smart room");
    if (!moved) {
      console.log(`Created room "${roomName}" but ${member.user.tag} is no longer connected to voice`);
    } else {
      console.log(`Created room "${roomName}" and moved ${member.user.tag}`);
    }
    await sendRoomLog("create", member, { channel: newChannel });
  } catch (e) {
    console.error("Could not move member:", e.message);
  }

  if (zone.id === "vip") {
    try {
      await sendRoomPanel(newChannel, member, room);
    } catch (e) {
      console.error(`Could not send room panel for "${roomName}":`, e.message);
    }
  } else {
    console.log(`Skip room panel for non-VIP room "${roomName}" zone=${zone.id}`);
  }

  // ⚡ รัน syncAllSeparators ใน Background แบบ Non-blocking เพื่อให้ปล่อยคิวสร้างห้องคนถัดไปได้ทันที!
  getAllRooms().then((rooms) => {
    syncAllSeparators(guild, rooms).catch((e) => {
      console.error(`[roomCreator] Background syncAllSeparators error:`, e.message);
    });
  }).catch(() => {});

  return newChannel;
}

module.exports = { createRoom };
