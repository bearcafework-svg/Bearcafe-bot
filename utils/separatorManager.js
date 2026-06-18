const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { saveSeparator } = require("../state/redisClient");
const config = require("../config");

function getSeparatorNames(zone) {
  return [
    zone.separatorName,
    "𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃",
    `\u23af\u23af\u23af ${zone.name} \u23af\u23af\u23af`,
  ].filter(Boolean);
}

function isLastZone(zone) {
  return config.zones[config.zones.length - 1]?.id === zone.id;
}

function getZoneCategoryId(guild, zone) {
  if (zone.roomsCategoryId) return zone.roomsCategoryId;
  if (config.roomsCategoryId) return config.roomsCategoryId;

  const lobbyChannel = guild.channels.cache.get(zone.lobbyChannelId);
  return lobbyChannel ? lobbyChannel.parentId : null;
}

function hasUniqueSeparatorName(zone) {
  if (!zone.separatorName) return false;
  return config.zones.filter((z) => z.separatorName === zone.separatorName).length === 1;
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
      .map((zone) => getZoneCategoryId(guild, zone))
      .filter(Boolean)
  );

  for (const categoryId of categoryIds) {
    const zonesInCategory = config.zones.filter(
      (zone) => getZoneCategoryId(guild, zone) === categoryId
    );

    let nextPosition = 0;

    for (const zone of zonesInCategory) {
      const roomEntries = getZoneRoomEntries(guild, rooms, zone);
      if (roomEntries.length === 0) continue;

      for (const { channel } of roomEntries) {
        await moveChannel(channel, nextPosition++);
      }

      const separator = findSeparator(guild, zone);
      if (separator && !isLastZone(zone)) {
        await moveChannel(separator, nextPosition++);
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

async function syncAllSeparators(guild, roomsInput) {
  const rooms = normalizeRooms(roomsInput);

  for (const zone of config.zones) {
    const roomEntries = getZoneRoomEntries(guild, rooms, zone);

    if (roomEntries.length > 0 && !isLastZone(zone)) {
      await showSeparator(guild, zone);
    } else {
      await hideSeparator(guild, zone);
    }
  }

  await syncCategoryLayout(guild, rooms);
}

module.exports = {
  findSeparator,
  showSeparator,
  hideSeparator,
  syncAllSeparators,
  syncCategoryLayout,
};
