// ===================================================
// src/features/security/antiRaid.js — ระบบป้องกัน Mass Raid และ Auto-Ban
// ===================================================

const { Redis } = require("@upstash/redis");
const logger = require("../../../utils/logger");

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

const RAID_JOIN_THRESHOLD = 10; // 10 บัญชี
const RAID_WINDOW_SECONDS = 10; // ใน 10 วินาที

/**
 * ดักฟังเมื่อมีสมาชิกใหม่เข้ามาใน Server
 */
async function handleGuildMemberAdd(member) {
  const guild = member.guild;
  if (!guild) return;

  try {
    const r = getRedis();
    const key = `antiraid:${guild.id}:joins`;
    const count = await r.incr(key);

    if (count === 1) {
      await r.expire(key, RAID_WINDOW_SECONDS);
    }

    // หากเกิน Threshold สำหรับ Mass Raid ให้ทำการ Auto-Ban บัญชี Raid ทันที
    if (count >= RAID_JOIN_THRESHOLD) {
      logger.warn(
        `[antiRaid] Mass Raid detected in ${guild.name}! (Count: ${count} in ${RAID_WINDOW_SECONDS}s). Auto-banning ${member.user.tag}`
      );

      try {
        await member.ban({
          deleteMessageSeconds: 86400, // ลบข้อความย้อนหลัง 1 วัน
          reason: "[Anti-Raid Auto-Ban] Mass Raid Botnet detection triggered",
        });
      } catch (banErr) {
        logger.error(`[antiRaid] Failed to auto-ban raid user ${member.id}: ${banErr.message}`);
      }

      // หากเพิ่งแตะ Threshold เป็นคนแรก ให้ส่งสัญญานเตือน Owner
      if (count === RAID_JOIN_THRESHOLD) {
        try {
          const owner = await guild.fetchOwner();
          if (owner) {
            await owner.send({
              content: `🚨 **[MASS RAID ALERT] 检测到 Mass Raid ใน ${guild.name}**\n\nระบบตรวจพบสถิติบัญชีเข้าใหม่เกิน ${RAID_JOIN_THRESHOLD} บัญชีภายใน ${RAID_WINDOW_SECONDS} วินาที และได้ทำการ **Auto-Ban** บัญชี Raid เหล่านั้นเรียบร้อยแล้ว`,
            });
          }
        } catch (e) {
          logger.warn(`[antiRaid] Failed to notify owner of Mass Raid: ${e.message}`);
        }
      }
    }
  } catch (err) {
    logger.error(`[antiRaid] Error handling guildMemberAdd: ${err.message}`);
  }
}

module.exports = {
  handleGuildMemberAdd,
};
