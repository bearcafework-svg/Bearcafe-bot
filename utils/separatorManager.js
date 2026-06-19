const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { acquireLock, getAllRooms, releaseLock, saveSeparator } = require("../state/redisClient");
const config = require("../config");

const syncLocks = new Set();
const syncPending = new Set();
const retryTimers = new Set();

function getSeparatorNames(zone) {
  return [
    zone.separatorName,
    "𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃",
    `\u23af\u23af\u23af ${zone.name} \u23af\u23af\u23af`,
  ].filter(Boolean);
}

function isFirstZone(zone) {
  return config.zones[0]?.id === zone.id;
}

function shouldSkipSeparator(zone) {
  return isFirstZone(zone);
}

function getZoneCategoryId(guild, zone) {
  if (zone.roomsCategoryId) return zone.roomsCategoryId;
  if (config.roomsCategoryId) return config.roomsCategoryId;

  const lobbyChannel = guild.channels.cache.get(zone.lobbyChannelId);
  return lobbyChannel ? lobbyChannel.parentId : null;
}

function getLayoutCategoryId(guild, zone) {
  const lobbyChannel = guild.channels.cache.get(zone.lobbyChannelId);
  return lobbyChannel?.parentId || getZoneCategoryId(guild, zone);
}

function getSeparatorPermissionOverwrites(guild) {
  const separatorPermissions = config.separatorPermissions || {};
  const visibleNoConnectIds = separatorPermissions.visibleNoConnectIds || [];
  const hiddenIds = separatorPermissions.hiddenIds || [];

  return [
    {
      id: guild.roles.everyone,
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
    },
    ...visibleNoConnectIds.map((id) => ({
      id,
      allow: [PermissionFlagsBits.ViewChannel],
      deny: [PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
    })),
    ...hiddenIds.map((id) => ({
      id,
      deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect, PermissionFlagsBits.Speak],
    })),
  ];
}

function hasUniqueSeparatorName(zone) {
  if (!zone.separatorName) return false;
  return config.zones.filter((item) => item.separatorName === zone.separatorName).length === 1;
}

function findSeparator(guild, zone) {
  if (zone.separatorChannelId) {
    const byId = guild.channels.cache.get(zone.separatorChannelId);
    if (byId) return byId;
  }

  if (!hasUniqueSeparatorName(zone)) return null;

  const categoryId = getZoneCategoryId(guild, zone);
  if (!categoryId) return null;

  const names = getSeparatorNames(zone);
  return guild.channels.cache.find(
    (channel) => channel.parentId === categoryId && names.includes(channel.name)
  ) || null;
}

function findAdoptableSeparator(guild, zone) {
  const categoryId = getZoneCategoryId(guild, zone);
  if (!categoryId) return null;

  const knownIds = getKnownSeparatorIds();
  const names = getSeparatorNames(zone);
  return guild.channels.cache.find(
    (channel) =>
      channel.parentId === categoryId &&
      !knownIds.has(channel.id) &&
      channel.type === ChannelType.GuildVoice &&
      names.includes(channel.name)
  ) || null;
}

function getKnownSeparatorIds() {
  return new Set(config.zones.map((zone) => zone.separatorChannelId).filter(Boolean));
}

function isSeparatorLikeChannel(channel) {
  if (channel.type !== ChannelType.GuildVoice) return false;
  return config.zones.some((zone) => getSeparatorNames(zone).includes(channel.name));
}

async function cleanupOrphanSeparators(guild) {
  const knownIds = getKnownSeparatorIds();
  const categoryIds = new Set(
    config.zones
      .map((zone) => getZoneCategoryId(guild, zone))
      .filter(Boolean)
  );

  const orphanSeparators = guild.channels.cache.filter((channel) => {
    if (!categoryIds.has(channel.parentId)) return false;
    if (!isSeparatorLikeChannel(channel)) return false;
    return !knownIds.has(channel.id);
  });

  for (const channel of orphanSeparators.values()) {
    try {
      await channel.delete("Remove duplicate smart-room separator");
      console.log(`Deleted duplicate separator "${channel.name}"`);
    } catch (e) {
      console.error(`Could not delete duplicate separator "${channel.name}":`, e.message);
    }
  }
}

function normalizeRooms(rooms) {
  if (!rooms) return {};
  if (!Array.isArray(rooms)) return rooms;

  const result = {};
  for (const channelId of rooms) {
    result[channelId] = {};
  }
  return result;
}

function getZoneRoomEntries(guild, rooms, zone) {
  return Object.entries(rooms)
    .filter(([, room]) => room.zoneId === zone.id)
    .map(([channelId, room]) => ({
      channel: guild.channels.cache.get(channelId),
      room,
    }))
    .filter(({ channel }) => channel)
    .sort((a, b) => {
      const createdDiff = (a.room.createdAt || 0) - (b.room.createdAt || 0);
      return createdDiff || a.channel.position - b.channel.position;
    });
}

async function hideSeparator(guild, zone) {
  const channel = findSeparator(guild, zone);
  if (!channel) {
    if (zone.separatorChannelId) {
      zone.separatorChannelId = null;
      await saveSeparator(zone.id, null);
    }
    return;
  }

  try {
    await channel.delete();
    zone.separatorChannelId = null;
    await saveSeparator(zone.id, null);
    console.log(`Deleted separator for zone "${zone.name}"`);
  } catch (e) {
    console.error(`hideSeparator error (${zone.name}):`, e.message);
  }
}

async function showSeparator(guild, zone) {
  const categoryId = getZoneCategoryId(guild, zone);
  const category = categoryId ? guild.channels.cache.get(categoryId) : null;
  if (!category || category.type !== ChannelType.GuildCategory) return null;

  const existing = findSeparator(guild, zone);
  if (existing) {
    if (existing.parentId !== categoryId) {
      await existing.setParent(categoryId);
    }

    if (existing.name !== zone.separatorName) {
      await existing.setName(zone.separatorName);
    }

    await existing.permissionOverwrites.set(getSeparatorPermissionOverwrites(guild));

    if (zone.separatorChannelId !== existing.id) {
      zone.separatorChannelId = existing.id;
      await saveSeparator(zone.id, existing.id);
    }
    return existing;
  }

  const adoptable = findAdoptableSeparator(guild, zone);
  if (adoptable) {
    await adoptable.permissionOverwrites.set(getSeparatorPermissionOverwrites(guild));
    zone.separatorChannelId = adoptable.id;
    await saveSeparator(zone.id, adoptable.id);
    return adoptable;
  }

  const separator = await guild.channels.create({
    name: zone.separatorName || `\u23af\u23af\u23af ${zone.name} \u23af\u23af\u23af`,
    type: ChannelType.GuildVoice,
    parent: categoryId,
    permissionOverwrites: getSeparatorPermissionOverwrites(guild),
  });

  zone.separatorChannelId = separator.id;
  await saveSeparator(zone.id, separator.id);
  console.log(`Created separator for zone "${zone.name}"`);

  return separator;
}

async function syncCategoryLayout(guild, rooms) {
  const categoryIds = new Set(
    config.zones
      .map((zone) => getLayoutCategoryId(guild, zone))
      .filter(Boolean)
  );

  for (const categoryId of categoryIds) {
    const zonesInCategory = config.zones.filter(
      (zone) => getLayoutCategoryId(guild, zone) === categoryId
    );

    for (const zone of zonesInCategory) {
      const lobbyChannel = guild.channels.cache.get(zone.lobbyChannelId);
      if (!lobbyChannel) continue;

      let nextPosition = lobbyChannel.position + 1;

      const roomEntries = getZoneRoomEntries(guild, rooms, zone);

      const separator = findSeparator(guild, zone);
      if (separator && !shouldSkipSeparator(zone)) {
        await moveChannel(separator, nextPosition++);
      }

      for (const { channel } of roomEntries) {
        await moveChannel(channel, nextPosition++);
      }
    }
  }
}

async function moveChannel(channel, position) {
  if (channel.position === position) return;

  try {
    await channel.setPosition(position);
  } catch (e) {
    console.error(`Could not position "${channel.name}":`, e.message);
  }
}

function scheduleSyncRetry(guild) {
  if (retryTimers.has(guild.id)) return;

  retryTimers.add(guild.id);
  setTimeout(() => {
    retryTimers.delete(guild.id);
    syncAllSeparators(guild).catch((e) => {
      console.error(`syncAllSeparators retry error (${guild.id}):`, e.message);
    });
  }, 2000);
}

async function runSeparatorSync(guild, roomsInput) {
  const rooms = normalizeRooms(roomsInput || (await getAllRooms()));
  const lock = await acquireLock(`smart-room:layout:${guild.id}`, 20000);

  if (!lock) {
    syncPending.add(guild.id);
    scheduleSyncRetry(guild);
    return;
  }

  try {
    for (const zone of config.zones) {
      const roomEntries = getZoneRoomEntries(guild, rooms, zone);

      if (roomEntries.length > 0 && !shouldSkipSeparator(zone)) {
        await showSeparator(guild, zone);
      } else {
        await hideSeparator(guild, zone);
      }
    }

    await cleanupOrphanSeparators(guild);
    await syncCategoryLayout(guild, rooms);
  } finally {
    await releaseLock(lock).catch((e) => {
      console.error(`Could not release layout lock (${guild.id}):`, e.message);
    });
  }
}

async function syncAllSeparators(guild, roomsInput) {
  if (syncLocks.has(guild.id)) {
    syncPending.add(guild.id);
    return;
  }

  syncLocks.add(guild.id);

  try {
    let nextRoomsInput = roomsInput;

    do {
      syncPending.delete(guild.id);
      await runSeparatorSync(guild, nextRoomsInput);
      nextRoomsInput = null;
    } while (syncPending.has(guild.id) && !retryTimers.has(guild.id));
  } finally {
    syncLocks.delete(guild.id);
  }
}

module.exports = {
  findSeparator,
  showSeparator,
  hideSeparator,
  syncAllSeparators,
  syncCategoryLayout,
};
