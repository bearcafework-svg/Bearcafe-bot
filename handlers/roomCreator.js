const { ChannelType } = require("discord.js");
const { generateRoomName } = require("../utils/nameGenerator");
const { saveRoom, getAllRooms } = require("../state/redisClient");
const { syncAllSeparators } = require("../utils/separatorManager");
const { applyRoomPermissions, sendRoomPanel } = require("./roomPanel");
const config = require("../config");

let isCreating = false;
const queue = [];

function getRoomsCategoryId(guild, zone) {
  if (zone.roomsCategoryId) return zone.roomsCategoryId;
  if (config.roomsCategoryId) return config.roomsCategoryId;

  const lobbyChannel = guild.channels.cache.get(zone.lobbyChannelId);
  return lobbyChannel ? lobbyChannel.parentId : null;
}

async function processQueue() {
  if (isCreating || queue.length === 0) return;
  isCreating = true;

  const { guild, member, zone, resolve } = queue.shift();
  try {
    const result = await _createRoom(guild, member, zone);
    resolve(result);
  } catch (e) {
    console.error("roomCreator error:", e);
    resolve(null);
  }

  isCreating = false;
  processQueue();
}

function createRoom(guild, member, zone) {
  return new Promise((resolve) => {
    queue.push({ guild, member, zone, resolve });
    processQueue();
  });
}

async function _createRoom(guild, member, zone) {
  const lobbyChannel = guild.channels.cache.get(zone.lobbyChannelId);
  const categoryId = getRoomsCategoryId(guild, zone);

  if (!lobbyChannel) {
    console.error(`Cannot create room for zone "${zone.name}": lobby not found`);
    return null;
  }

  const category = categoryId ? guild.channels.cache.get(categoryId) : null;
  if (!category || category.type !== ChannelType.GuildCategory) {
    console.error(`Cannot create room for zone "${zone.name}": rooms category not found`);
    return null;
  }

  const existingNames = guild.channels.cache
    .filter((channel) => channel.parentId === categoryId)
    .map((channel) => channel.name);

  const roomName = generateRoomName(zone, existingNames, member);
  const newChannel = await guild.channels.create({
    name: roomName,
    type: ChannelType.GuildVoice,
    parent: categoryId,
    userLimit: config.softCap,
  });

  if (zone.id !== "vip") {
    await newChannel.lockPermissions();
  }

  await saveRoom(newChannel.id, zone.id, member.id);
  await applyRoomPermissions(newChannel, {
    zoneId: zone.id,
    ownerId: member.id,
    settings: {
      locked: false,
      hidden: false,
      trustedUserIds: [],
      blockedUserIds: [],
    },
  });

  const rooms = await getAllRooms();
  await syncAllSeparators(guild, rooms);

  try {
    await member.voice.setChannel(newChannel);
    await sendRoomPanel(newChannel, member, {
      zoneId: zone.id,
      ownerId: member.id,
      settings: {
        locked: false,
        hidden: false,
        trustedUserIds: [],
        blockedUserIds: [],
      },
    });
    console.log(`Created room "${roomName}" and moved ${member.user.tag}`);
  } catch (e) {
    console.error("Could not move member:", e.message);
  }

  return newChannel;
}

module.exports = { createRoom };
