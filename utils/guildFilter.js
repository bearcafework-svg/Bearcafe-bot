// ===================================================
// utils/guildFilter.js — ตัวกรองและอนุญาตเฉพาะ GuildID ที่กำหนด (Allowlist Filter)
// ===================================================

const config = require("../config");

/**
 * Custom Guild IDs ที่กำหนดในโค้ดให้สิทธิ์ทำงานเสมอ
 */
const CUSTOM_ALLOWED_GUILD_IDS = [
  "1144251788493602848", // Bear Cafe Server หลัก
  "1536199707922141254", // Custom Guild ID
];

/**
 * ดึงรายการ Guild IDs ที่อนุญาตให้บอททำงาน (Allowlist)
 * @returns {Set<string>}
 */
function getAllowedGuildIds() {
  const allowedSet = new Set();

  // 1. ดึงจาก DISCORD_GUILD_ID ใน process.env (จาก Supabase / .env)
  if (process.env.DISCORD_GUILD_ID) {
    for (const id of process.env.DISCORD_GUILD_ID.split(",")) {
      if (id.trim()) allowedSet.add(id.trim());
    }
  }

  // 2. ดึงจาก GUILD_ID ใน process.env
  if (process.env.GUILD_ID) {
    for (const id of process.env.GUILD_ID.split(",")) {
      if (id.trim()) allowedSet.add(id.trim());
    }
  }

  // 3. ดึงจาก ALLOWED_GUILD_IDS ใน process.env
  if (process.env.ALLOWED_GUILD_IDS) {
    for (const id of process.env.ALLOWED_GUILD_IDS.split(",")) {
      if (id.trim()) allowedSet.add(id.trim());
    }
  }

  // 4. ดึงจาก config.allowedGuildIds (ถ้ามี)
  if (config.allowedGuildIds && Array.isArray(config.allowedGuildIds)) {
    for (const id of config.allowedGuildIds) {
      if (id) allowedSet.add(String(id).trim());
    }
  }

  // 5. ดึงจาก Custom Guild IDs ที่กำหนดในโค้ด
  for (const id of CUSTOM_ALLOWED_GUILD_IDS) {
    if (id) allowedSet.add(String(id).trim());
  }

  return allowedSet;
}

/**
 * ตรวจสอบว่า GuildID นี้ได้รับอนุญาตให้ทำงานหรือไม่ (Allowlist Check)
 * @param {string|null|undefined} guildId 
 * @returns {boolean}
 */
function isAllowedGuild(guildId) {
  if (!guildId) return true; // หากไม่มี guildId (เช่น DM) ให้ถือว่าอนุญาต
  const allowed = getAllowedGuildIds();
  return allowed.has(String(guildId).trim());
}

/**
 * ฟังก์ชันสำหรับ Backward Compatibility (ตรงข้ามกับ isAllowedGuild)
 * @param {string|null|undefined} guildId 
 * @returns {boolean}
 */
function isIgnoredGuild(guildId) {
  if (!guildId) return false;
  return !isAllowedGuild(guildId);
}

/**
 * ดึง GuildID จากอาร์กิวเมนต์ของ event
 * @param {Array} args 
 * @returns {string|null}
 */
function extractGuildIdFromArgs(args) {
  if (!args || args.length === 0) return null;

  for (const arg of args) {
    if (!arg) continue;

    // Direct guildId property (e.g. Interaction, Message, VoiceState, GuildChannel, Role, etc.)
    if (typeof arg.guildId === "string" && arg.guildId) {
      return arg.guildId;
    }

    // Nested guild property (e.g. message.guild, voiceState.guild, member.guild, channel.guild)
    if (arg.guild && typeof arg.guild.id === "string" && arg.guild.id) {
      return arg.guild.id;
    }

    // Argument itself is a Guild object
    if (typeof arg.id === "string" && arg.id && (arg.constructor?.name === "Guild" || arg.memberCount !== undefined)) {
      return arg.id;
    }
  }

  return null;
}

/**
 * ค้นหา Guild ที่ได้รับอนุญาตจาก client.guilds.cache
 * @param {import('discord.js').Client} client 
 * @param {string} [targetGuildId] 
 * @returns {import('discord.js').Guild|null}
 */
function getValidGuild(client, targetGuildId) {
  if (!client || !client.guilds || !client.guilds.cache) return null;

  const defaultGuildId = targetGuildId || process.env.DISCORD_GUILD_ID || process.env.GUILD_ID || "1144251788493602848";
  const targetGuild = client.guilds.cache.get(defaultGuildId);

  if (targetGuild && isAllowedGuild(targetGuild.id)) {
    return targetGuild;
  }

  return client.guilds.cache.find((g) => isAllowedGuild(g.id)) || null;
}

/**
 * ตรวจสอบว่า Event นี้เกี่ยวข้องกับระบบ HealJai หรือไม่
 * @param {string} eventName 
 * @param {Array} args 
 * @returns {boolean}
 */
function isHealJaiEvent(eventName, args) {
  if (!args || args.length === 0) return false;

  if (eventName === "interactionCreate") {
    const interaction = args[0];
    if (interaction && typeof interaction.customId === "string" && interaction.customId.startsWith("heal_jai_")) {
      return true;
    }
  }

  if (eventName === "messageCreate") {
    const message = args[0];
    if (message && typeof message.content === "string") {
      const text = message.content.trim().toLowerCase();
      if (text.startsWith("b!reset-menu") || text.startsWith("b!heal")) {
        return true;
      }
    }
  }

  return false;
}

/**
 * ติดตั้ง Event Interceptor เพื่ออนุญาตเฉพาะ GuildIDs ใน Allowlist
 * @param {import('discord.js').Client} client 
 */
function setupGuildFilter(client) {
  const originalEmit = client.emit;

  client.emit = function (eventName, ...args) {
    const guildId = extractGuildIdFromArgs(args);
    if (guildId && !isAllowedGuild(guildId)) {
      // ยกเว้นฟีเจอร์ HealJai ให้ทำงานได้ตามปกติ
      if (isHealJaiEvent(eventName, args)) {
        return originalEmit.apply(this, [eventName, ...args]);
      }
      // ปฏิเสธการส่ง Event สำหรับ Guild ที่ไม่อยู่ใน Allowlist
      return false;
    }
    return originalEmit.apply(this, [eventName, ...args]);
  };

  const allowedList = Array.from(getAllowedGuildIds()).join(", ");
  console.log(`🛡️ [GuildFilter] ระบบกรอง Guild Filter ทำงานแล้ว — อนุญาตเฉพาะ Guilds: ${allowedList}`);
}

module.exports = {
  getAllowedGuildIds,
  isAllowedGuild,
  isIgnoredGuild,
  extractGuildIdFromArgs,
  getValidGuild,
  setupGuildFilter,
};
