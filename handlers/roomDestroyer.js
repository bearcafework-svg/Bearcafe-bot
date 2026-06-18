const { deleteRoom, setRoomEmpty, getAllRooms } = require("../state/redisClient");
const { isSeparatorChannel, isLobbyChannel } = require("../utils/zoneResolver");
const { syncAllSeparators } = require("../utils/separatorManager");

async function markRoomEmpty(channelId) {
  await setRoomEmpty(channelId, Date.now());
}

async function markRoomActive(channelId) {
  await setRoomEmpty(channelId, null);
}

async function destroyRoom(guild, channelId) {
  if (isLobbyChannel(channelId) || isSeparatorChannel(channelId)) {
    console.log(`Skip ${channelId}: lobby or separator`);
    return;
  }

  const channel = guild.channels.cache.get(channelId);
  if (!channel) {
    await deleteRoom(channelId);
    return;
  }

  if (channel.members.size > 0) {
    console.log(`Skip "${channel.name}": still has members`);
    return;
  }

  try {
    await channel.delete("Smart room is empty");
    await deleteRoom(channelId);
    console.log(`Deleted room "${channel.name}"`);
  } catch (e) {
    console.error(`Could not delete room ${channelId}:`, e.message);
  }

  const rooms = await getAllRooms();
  await syncAllSeparators(guild, rooms);
}

module.exports = { markRoomEmpty, markRoomActive, destroyRoom };
