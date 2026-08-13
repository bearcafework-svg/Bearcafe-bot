// utils/voiceLogger.js
// ระบบบันทึกประวัติห้องเสียงลง Redis Buffer Queue เพื่อความเสถียร
// ป้องกันการค้างจาก API latency และ bot restarts

const { getRedis } = require("../state/redisClient");

/**
 * ดักจับ Event เข้า/ออก/ย้ายห้องเสียง และผลักเข้า Redis queue
 * @param {VoiceState} oldState 
 * @param {VoiceState} newState 
 */
async function logVoiceEvent(oldState, newState) {
  try {
    const member = newState.member || oldState.member;
    if (!member || member.user.bot) return; // ไม่สนใจบอท

    const joinedChannelId = newState.channelId;
    const leftChannelId = oldState.channelId;

    // ตรวจเช็คว่าเกิดการเปลี่ยนห้องจริงๆ (เข้า, ออก, ย้าย) 
    // และไม่ใช่การ Mute/Deafen หรือแชร์หน้าจอ
    if (joinedChannelId === leftChannelId) return;

    let eventType;
    let channelId;
    let channelName;
    let fromChannelId = null;
    let fromChannelName = null;

    const guild = newState.guild || oldState.guild;

    if (joinedChannelId && leftChannelId) {
      eventType = "move";
      channelId = joinedChannelId;
      const joinedChannel = guild.channels.cache.get(joinedChannelId);
      channelName = joinedChannel ? joinedChannel.name : "unknown";

      fromChannelId = leftChannelId;
      const leftChannel = guild.channels.cache.get(leftChannelId);
      fromChannelName = leftChannel ? leftChannel.name : "unknown";
    } else if (joinedChannelId) {
      eventType = "join";
      channelId = joinedChannelId;
      const joinedChannel = guild.channels.cache.get(joinedChannelId);
      channelName = joinedChannel ? joinedChannel.name : "unknown";
    } else if (leftChannelId) {
      eventType = "leave";
      channelId = leftChannelId;
      const leftChannel = guild.channels.cache.get(leftChannelId);
      channelName = leftChannel ? leftChannel.name : "unknown";
    } else {
      return;
    }

    const logItem = {
      user_id: member.id,
      username: member.user.tag,
      channel_id: channelId,
      channel_name: channelName,
      event_type: eventType,
      from_channel_id: fromChannelId,
      from_channel_name: fromChannelName,
      timestamp: new Date().toISOString(),
      retry_count: 0
    };

    const redis = getRedis();
    await redis.lpush("voice_logs:queue", JSON.stringify(logItem));
    console.log(`[voiceLogger] 📥 Queued voice event: ${member.user.tag} [${eventType}] in "${channelName}"`);
  } catch (err) {
    console.error("[voiceLogger] ❌ Error processing voice log event:", err.message);
  }
}

module.exports = { logVoiceEvent };
