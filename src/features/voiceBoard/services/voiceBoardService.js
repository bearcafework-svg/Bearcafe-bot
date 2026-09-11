// ===================================================
// src/features/voiceBoard/services/voiceBoardService.js
// บริการรวบรวมข้อมูลห้องเสียง คัดกรองหมวดหมู่ และตรวจจับสถานะเกมจาก User Presence
// ===================================================

const { PermissionFlagsBits, ActivityType } = require("discord.js");

// Category ID ที่อนุญาตให้ดึงข้อมูล
const ALLOWED_CATEGORY_IDS = new Set([
  "1524122788015636682", // ห้อง Dynamic ทั่วไป
  "1543974947561537646", // โซน Point x2
  "1524122746504745011", // หมวดพิเศษ
  "1524122726917472341", // หมวดพิเศษ 2
]);

// Voice Channel ID ที่ห้ามแสดงเด็ดขาด (Blacklist)
const EXCLUDED_VOICE_IDS = new Set([
  "1524123176303464498",
]);

/**
 * ตรวจสอบว่าห้องถูกล็อคไม่ให้คนทั่วไปเข้าหรือไม่
 */
function isChannelLocked(channel) {
  if (!channel.guild) return false;
  const everyoneRole = channel.guild.roles.everyone;
  const overwrite = channel.permissionOverwrites?.cache.get(everyoneRole.id);
  if (overwrite && overwrite.deny.has(PermissionFlagsBits.Connect)) {
    return true;
  }
  return false;
}

/**
 * ดึงสถานะเกมหรือกิจกรรมเด่นของสมาชิกในห้องเสียง
 */
function extractRoomActivities(members) {
  const gameCounts = new Map();
  let streamingCount = 0;

  const memberList = Array.isArray(members)
    ? members
    : (typeof members.values === "function" ? [...members.values()] : []);

  for (const member of memberList) {
    if (member.voice?.streaming) {
      streamingCount++;
    }

    const activities = member.presence?.activities || [];
    for (const act of activities) {
      // ActivityType.Playing = 0
      if ((act.type === 0 || act.type === ActivityType.Playing) && act.name) {
        const name = act.name.trim();
        // ไม่นับ Spotify หรือ Rich Presence ทั่วไปที่ไม่ใช่เกม
        if (name.toLowerCase() !== "spotify" && name.toLowerCase() !== "custom status") {
          gameCounts.set(name, (gameCounts.get(name) || 0) + 1);
        }
      }
    }
  }

  // เรียงลำดับเกมที่มีคนเล่นมากที่สุดในห้อง
  const sortedGames = [...gameCounts.entries()].sort((a, b) => b[1] - a[1]);
  const primaryGame = sortedGames.length > 0 ? sortedGames[0][0] : null;

  return {
    primaryGame,
    allGames: sortedGames.map(([name]) => name),
    isStreaming: streamingCount > 0,
  };
}

/**
 * สแกนและรวบรวมห้องเสียงที่เปิดรับเพื่อนทั้งหมดใน Guild
 * @param {import("discord.js").Guild} guild
 * @param {string} [filter="all"] - 'all' | 'looking' | 'game' | 'chill'
 */
async function getVoiceBoardData(guild, filter = "all") {
  if (!guild) return null;

  const channels = guild.channels.cache;
  const rooms = [];
  const emptyRooms = [];
  let totalOnlineCount = 0;
  let gameRoomsCount = 0;
  let chillRoomsCount = 0;
  let lookingRoomsCount = 0;

  for (const [, channel] of channels) {
    // 1. กรองเฉพาะ Voice Channel (และ Stage Channel)
    if (!channel.isVoiceBased()) continue;

    // 2. กรองเฉพาะ Category ID ที่อนุญาต
    if (!channel.parentId || !ALLOWED_CATEGORY_IDS.has(channel.parentId)) continue;

    // 3. กรองห้องที่อยู่ใน Blacklist
    if (EXCLUDED_VOICE_IDS.has(channel.id)) continue;

    // 4. กรองห้องที่ล็อคกุญแจสำหรับคนนอก
    if (isChannelLocked(channel)) continue;

    // 5. คัดกรองสมาชิกมนุษย์ในห้อง (ตัดบอทออก)
    const rawMembers = channel.members;
    const humanMembers = rawMembers
      ? (typeof rawMembers.filter === "function"
          ? [...rawMembers.filter((m) => !m.user?.bot).values()]
          : [...rawMembers.values()].filter((m) => !m.user?.bot))
      : [];

    if (humanMembers.length === 0) {
      emptyRooms.push({
        id: channel.id,
        name: channel.name,
        userLimit: channel.userLimit || 0,
      });
      continue;
    }

    const memberCount = humanMembers.length;
    totalOnlineCount += memberCount;

    const userLimit = channel.userLimit || 0;
    const isFull = userLimit > 0 && memberCount >= userLimit;
    const availableSlots = userLimit > 0 ? Math.max(0, userLimit - memberCount) : null;

    // 6. ตรวจสอบกิจกรรมและเกมจาก Presence
    const { primaryGame, allGames, isStreaming } = extractRoomActivities(humanMembers);

    // กำหนดหมวดหมู่ห้อง (เกม vs คุยชิล)
    const isGameZone = channel.name.toLowerCase().includes("เกม") ||
      channel.name.toLowerCase().includes("game") ||
      Boolean(primaryGame);

    const roomType = isGameZone ? "game" : "chill";
    if (roomType === "game") gameRoomsCount++;
    else chillRoomsCount++;

    // 7. สถานะหาเพื่อน (Looking for Buddies):
    // ห้องที่ยังมีที่ว่าง และมีคนอยู่ 1-3 คน หรือเปิดรับคนเพิ่ม
    const isLooking = !isFull && (memberCount <= 4 || availableSlots > 0);
    if (isLooking) lookingRoomsCount++;

    // ดึงชื่อสมาชิกสั้นๆ 3 คนแรก
    const memberNames = humanMembers.map(
      (m) => m.displayName || m.user.username
    );

    rooms.push({
      id: channel.id,
      name: channel.name,
      guildId: guild.id,
      url: `https://discord.com/channels/${guild.id}/${channel.id}`,
      memberCount,
      userLimit,
      isFull,
      availableSlots,
      primaryGame,
      allGames,
      isStreaming,
      roomType,
      isLooking,
      memberNames,
    });
  }

  // เรียงลำดับห้อง: ห้องที่กำลังหาเพื่อน/มีที่ว่างขึ้นก่อน ตามด้วยจำนวนคน
  rooms.sort((a, b) => {
    if (a.isLooking && !b.isLooking) return -1;
    if (!a.isLooking && b.isLooking) return 1;
    return b.memberCount - a.memberCount;
  });

  return {
    guildId: guild.id,
    guildName: guild.name,
    totalOnlineCount,
    totalRoomsCount: rooms.length,
    gameRoomsCount,
    chillRoomsCount,
    lookingRoomsCount,
    emptyRoomsCount: emptyRooms.length,
    emptyRooms: emptyRooms.slice(0, 6),
    rooms,
    updatedAt: Date.now(),
  };
}

module.exports = {
  ALLOWED_CATEGORY_IDS,
  EXCLUDED_VOICE_IDS,
  getVoiceBoardData,
  isChannelLocked,
};
