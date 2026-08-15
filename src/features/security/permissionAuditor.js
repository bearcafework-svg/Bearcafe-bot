// ===================================================
// src/features/security/permissionAuditor.js — ตรวจสอบสิทธิ์อันตรายและ Role Hierarchy
// ===================================================

const { PermissionFlagsBits } = require("discord.js");
const logger = require("../../../utils/logger");

/**
 * ตรวจสอบ Role Hierarchy และสิทธิ์อันตรายใน Server
 */
async function auditGuildPermissions(guild) {
  try {
    const me = await guild.members.fetchMe();
    const highestBotRole = me.roles.highest;
    const roles = await guild.roles.fetch();

    const dangerousRoles = roles.filter((role) => {
      if (role.id === guild.id || role.managed) return false;
      const p = role.permissions;
      return (
        p.has(PermissionFlagsBits.Administrator) ||
        p.has(PermissionFlagsBits.ManageGuild) ||
        p.has(PermissionFlagsBits.ManageRoles) ||
        p.has(PermissionFlagsBits.ManageChannels)
      );
    });

    logger.info(
      `[permissionAuditor] Guild ${guild.name}: Bot Highest Role: "${highestBotRole.name}" (Pos: ${highestBotRole.position}). Found ${dangerousRoles.size} roles with elevated permissions.`
    );

    return {
      highestBotRoleName: highestBotRole.name,
      highestBotRolePos: highestBotRole.position,
      dangerousRoleCount: dangerousRoles.size,
      dangerousRoleNames: dangerousRoles.map((r) => r.name),
    };
  } catch (err) {
    logger.error(`[permissionAuditor] Error auditing permissions: ${err.message}`);
    return null;
  }
}

module.exports = {
  auditGuildPermissions,
};
