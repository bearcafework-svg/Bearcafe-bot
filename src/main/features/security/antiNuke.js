// ===================================================
// src/features/security/antiNuke.js — ระบบดักจับและหยุด Server Nuke
// ===================================================

const { AuditLogEvent, PermissionFlagsBits } = require("discord.js");
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

const THRESHOLD_COUNT = 3;
const THRESHOLD_WINDOW_SECONDS = 10;

/**
 * นับจำนวนการกระทำของผู้ใช้ใน Sliding Window 10 วินาที
 */
async function trackAndCheckThreshold(guildId, userId, actionType) {
  try {
    const r = getRedis();
    const key = `antinuke:${guildId}:${userId}:${actionType}`;
    const count = await r.incr(key);
    if (count === 1) {
      await r.expire(key, THRESHOLD_WINDOW_SECONDS);
    }
    return count > THRESHOLD_COUNT;
  } catch (err) {
    logger.warn(`[antiNuke] Redis error checking threshold: ${err.message}`);
    return false;
  }
}

/**
 * ปลดสิทธิ์อันตรายทั้งหมดจากผู้ก่อเหตุ
 */
async function revokeDangerousPermissions(guild, executorMember, reason) {
  if (!executorMember || executorMember.id === guild.ownerId) return;

  try {
    const dangerousRoles = executorMember.roles.cache.filter((role) => {
      if (role.id === guild.id) return false;
      const p = role.permissions;
      return (
        p.has(PermissionFlagsBits.Administrator) ||
        p.has(PermissionFlagsBits.ManageGuild) ||
        p.has(PermissionFlagsBits.ManageChannels) ||
        p.has(PermissionFlagsBits.ManageRoles) ||
        p.has(PermissionFlagsBits.BanMembers) ||
        p.has(PermissionFlagsBits.KickMembers)
      );
    });

    if (dangerousRoles.size > 0) {
      await executorMember.roles.remove(dangerousRoles, reason);
      logger.warn(
        `[antiNuke] Revoked ${dangerousRoles.size} dangerous roles from executor ${executorMember.user.tag}`
      );
    }
  } catch (err) {
    logger.error(`[antiNuke] Failed to revoke permissions from ${executorMember.id}: ${err.message}`);
  }
}

/**
 * แจ้งเตือน Server Owner ทาง DM
 */
async function notifyOwner(guild, executorTag, actionDescription) {
  try {
    const owner = await guild.fetchOwner();
    if (owner) {
      await owner.send({
        content: `🚨 **[SECURITY ALERT] Anti-Nuke Triggered in ${guild.name}**\n\n**ผู้ก่อเหตุ:** \`${executorTag}\`\n**พฤติกรรม:** ${actionDescription}\n**การดำเนินการระบบ:** ปลดสิทธิ์ผู้ก่อเหตุเรียบร้อยแล้ว ท่านสามารถใช้คำสั่ง \`/restore\` เพื่อดึงโครงสร้างเซิร์ฟเวอร์กลับคืนมาได้ทันที`,
      });
    }
  } catch (err) {
    logger.warn(`[antiNuke] Failed to DM server owner: ${err.message}`);
  }
}

/**
 * ดักฟัง Audit Log เมื่อมีการลบ Channel
 */
async function handleChannelDelete(channel) {
  if (!channel.guild) return;
  const guild = channel.guild;

  try {
    const auditLogs = await guild.fetchAuditLogs({
      type: AuditLogEvent.ChannelDelete,
      limit: 1,
    });
    const entry = auditLogs.entries.first();
    if (!entry || Date.now() - entry.createdTimestamp > 5000) return;

    const executor = entry.executor;
    if (!executor || executor.id === guild.client.user.id || executor.id === guild.ownerId) return;

    const isExceeded = await trackAndCheckThreshold(guild.id, executor.id, "channel_delete");
    if (isExceeded) {
      const executorMember = await guild.members.fetch(executor.id).catch(() => null);
      await revokeDangerousPermissions(
        guild,
        executorMember,
        "[Anti-Nuke] Exceeded channel deletion threshold (>3 in 10s)"
      );
      await notifyOwner(guild, executor.tag, `ลบช่องเกินกว่า ${THRESHOLD_COUNT} รายการ ภายใน ${THRESHOLD_WINDOW_SECONDS} วินาที`);
    }
  } catch (err) {
    logger.error(`[antiNuke] Error in handleChannelDelete: ${err.message}`);
  }
}

/**
 * ดักฟัง Audit Log เมื่อมีการลบ Role
 */
async function handleRoleDelete(role) {
  const guild = role.guild;
  if (!guild) return;

  try {
    const auditLogs = await guild.fetchAuditLogs({
      type: AuditLogEvent.RoleDelete,
      limit: 1,
    });
    const entry = auditLogs.entries.first();
    if (!entry || Date.now() - entry.createdTimestamp > 5000) return;

    const executor = entry.executor;
    if (!executor || executor.id === guild.client.user.id || executor.id === guild.ownerId) return;

    const isExceeded = await trackAndCheckThreshold(guild.id, executor.id, "role_delete");
    if (isExceeded) {
      const executorMember = await guild.members.fetch(executor.id).catch(() => null);
      await revokeDangerousPermissions(
        guild,
        executorMember,
        "[Anti-Nuke] Exceeded role deletion threshold (>3 in 10s)"
      );
      await notifyOwner(guild, executor.tag, `ลบบทบาท (Role) เกินกว่า ${THRESHOLD_COUNT} รายการ ภายใน ${THRESHOLD_WINDOW_SECONDS} วินาที`);
    }
  } catch (err) {
    logger.error(`[antiNuke] Error in handleRoleDelete: ${err.message}`);
  }
}

module.exports = {
  handleChannelDelete,
  handleRoleDelete,
};
