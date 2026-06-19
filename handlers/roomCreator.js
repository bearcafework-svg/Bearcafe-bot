const { ChannelType } = require("discord.js");
const { generateRoomName } = require("../utils/nameGenerator");
const { acquireLock, deleteRoom, getAllRooms, releaseLock, saveRoom } = require("../state/redisClient");
const { syncAllSeparators } = require("../utils/separatorManager");
const { applyRoomPermissions, sendRoomPanel } = require("./roomPanel");
const { sendRoomLog } = require("../utils/roomLogger");
const { getSmartRoomPreset, normalizePresetSettings } = require("../utils/smartRoomPresets");
const config = require("../config");

let isCreating = false;
const queue = [];
const pendingOwners = new Set();

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
  const existingChannel = guild.channels.cache.get(existingChannelId);
  if (!existingChannel) {
    await deleteRoom(existingChannelId);
    return null;
  }

  if (existingRoom.zoneId !== zone.id) return existingChannel;

  if (member.voice.channelId !== existingChannel.id) {
    await member.voice.setChannel(existingChannel).catch(() => {});
  }

  return existingChannel;
}

async function waitForExistingOwnerRoom(guild, member, zone) {
  for (let attempt = 0; attempt < 12; attempt += 1) {
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
  }

  isCreating = false;
  processQueue();
}

function createRoom(guild, member, zone) {
  return new Promise((resolve) => {
    const ownerKey = `${guild.id}:${member.id}`;
    if (pendingOwners.has(ownerKey)) {
      resolve(null);
      return;
    }

    pendingOwners.add(ownerKey);
    queue.push({ guild, member, zone, resolve });
    processQueue();
  });
}

async function _createRoom(guild, member, zone) {
  const lockKey = `smart-room:create:${guild.id}:${member.id}`;
  const lock = await acquireLock(lockKey, 30000);

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
  const lobbyChannel = guild.channels.cache.get(zone.lobbyChannelId);
  const categoryId = getRoomsCategoryId(guild, zone);

  if (!lobbyChannel) {
    console.error(`Cannot create room for zone "${zone.name}": lobby not found`);
    return null;
  }

  if (member.voice.channelId !== zone.lobbyChannelId) {
    console.log(`Skip create room for ${member.user.tag}: no longer in lobby "${zone.name}"`);
    return null;
  }

  const activeRooms = await getAllRooms();
  const existingRoomEntry = Object.entries(activeRooms).find(([, room]) => room.ownerId === member.id);
  if (existingRoomEntry) {
    const [existingChannelId] = existingRoomEntry;
    const [, existingRoom] = existingRoomEntry;
    const existingChannel = guild.channels.cache.get(existingChannelId);
    if (existingChannel && existingRoom.zoneId === zone.id) {
      await member.voice.setChannel(existingChannel).catch(() => {});
      console.log(`Skip duplicate room for ${member.user.tag}: moved to existing room "${existingChannel.name}"`);
      return existingChannel;
    }

    if (existingChannel && existingChannel.members.size === 0) {
      await existingChannel.delete("Owner created a new smart room in another zone").catch(() => {});
      await deleteRoom(existingChannelId);
    } else if (!existingChannel) {
      await deleteRoom(existingChannelId);
    }
  }

  const category = categoryId ? guild.channels.cache.get(categoryId) : null;
  if (!category || category.type !== ChannelType.GuildCategory) {
    console.error(`Cannot create room for zone "${zone.name}": rooms category not found`);
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
    userLimit: Number.isInteger(settings.limit) ? settings.limit : config.softCap,
  });

  if (zone.id !== "vip") {
    await newChannel.lockPermissions();
  }

  const room = {
    zoneId: zone.id,
    ownerId: member.id,
    settings,
  };

  await saveRoom(newChannel.id, zone.id, member.id, settings);
  await applyRoomPermissions(newChannel, room);

  try {
    await member.voice.setChannel(newChannel);
    console.log(`Created room "${roomName}" and moved ${member.user.tag}`);
    await sendRoomLog("create", member, { channel: newChannel });
  } catch (e) {
    console.error("Could not move member:", e.message);
  }

  try {
    await sendRoomPanel(newChannel, member, room);
  } catch (e) {
    console.error(`Could not send room panel for "${roomName}":`, e.message);
  }

  const rooms = await getAllRooms();
  await syncAllSeparators(guild, rooms);

  return newChannel;
}

module.exports = { createRoom };
