// ===================================================
// utils/guildFilter.js — ตัวกรองและปฏิเสธ Guild ที่ไม่ต้องการให้บอททำงาน
// ===================================================

const config = require("../config");

/**
 * ดึงรายการ Guild IDs ที่ต้องปฏิเสธ/ข้ามการทำงาน
 * @returns {Set<string>}
 */
function getIgnoredGuildIds() {
  const set = new Set();

  if (config.ignoredGuildIds && Array.isArray(config.ignoredGuildIds)) {
    for (const id of config.ignoredGuildIds) {
      if (id) set.add(String(id).trim());
    }
  }

  if (process.env.IGNORED_GUILD_IDS) {
    for (const id of process.env.IGNORED_GUILD_IDS.split(",")) {
      if (id.trim()) set.add(id.trim());
    }
  }

  // GuildID เริ่มต้นตามที่กำหนด
  set.add("1536199707922141254");

  return set;
}

/**
 * ตรวจสอบว่า GuildID นี้อยู่ในรายการปฏิเสธหรือไม่
 * @param {string|null|undefined} guildId 
 * @returns {boolean}
 */
function isIgnoredGuild(guildId) {
  if (!guildId) return false;
  const ignored = getIgnoredGuildIds();
  return ignored.has(String(guildId).trim());
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
 * ค้นหา Guild ที่ไม่ใช่ Ignored Guild จาก client.guilds.cache
 * @param {import('discord.js').Client} client 
 * @param {string} [targetGuildId] 
 * @returns {import('discord.js').Guild|null}
 */
function getValidGuild(client, targetGuildId) {
  if (!client || !client.guilds || !client.guilds.cache) return null;

  const defaultGuildId = targetGuildId || process.env.GUILD_ID || "1144251788493602848";
  const targetGuild = client.guilds.cache.get(defaultGuildId);

  if (targetGuild && !isIgnoredGuild(targetGuild.id)) {
    return targetGuild;
  }

  return client.guilds.cache.find((g) => !isIgnoredGuild(g.id)) || null;
}

/**
 * ตรวจสอบว่า Event นี้เกี่ยวข้องกับระบบ HealJai หรือไม่ (ยกเว้นไม่ต้องโดน Guild Filter)
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
 * ติดตั้ง Event Interceptor เพื่อปฏิเสธ Event ทุกชนิดที่มาจาก Ignored Guilds (ยกเว้น HealJai)
 * @param {import('discord.js').Client} client 
 */
function setupGuildFilter(client) {
  const originalEmit = client.emit;

  client.emit = function (eventName, ...args) {
    const guildId = extractGuildIdFromArgs(args);
    if (guildId && isIgnoredGuild(guildId)) {
      // ยกเว้นฟีเจอร์ HealJai ให้ทำงานได้ตามปกติ
      if (isHealJaiEvent(eventName, args)) {
        return originalEmit.apply(this, [eventName, ...args]);
      }
      // ปฏิเสธการส่ง Event สำหรับระบบอื่นใน Guild ที่ถูกระบุข้าม
      return false;
    }
    return originalEmit.apply(this, [eventName, ...args]);
  };

  const ignoredList = Array.from(getIgnoredGuildIds()).join(", ");
  console.log(`🛡️ [GuildFilter] ระบบป้องกัน Guild Filter ทำงานแล้ว — บล็อก Guilds: ${ignoredList} (ยกเว้น HealJai)`);
}

module.exports = {
  getIgnoredGuildIds,
  isIgnoredGuild,
  extractGuildIdFromArgs,
  getValidGuild,
  setupGuildFilter,
};
