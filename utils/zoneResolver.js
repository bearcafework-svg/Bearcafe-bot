// ===================================================
// utils/zoneResolver.js — แปลง channelId → zone
// ===================================================

const config = require("../config");

// รับ channelId มา คืนค่า zone object ถ้าเป็น Lobby
function resolveZoneFromLobby(channelId) {
  return config.zones.find((z) => z.lobbyChannelId === channelId) || null;
}

// เช็คว่า channelId นี้คือ Lobby ของโซนไหนก็ได้ไหม
function isLobbyChannel(channelId) {
  return config.zones.some((z) => z.lobbyChannelId === channelId);
}

// เช็คว่า channelId นี้คือ Separator ไหม (ห้ามลบ)
function isSeparatorChannel(channelId) {
  return config.zones.some((z) => z.separatorChannelId === channelId);
}

module.exports = { resolveZoneFromLobby, isLobbyChannel, isSeparatorChannel };
