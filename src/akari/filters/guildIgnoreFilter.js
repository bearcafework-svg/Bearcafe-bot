// ===================================================
// src/akari/filters/guildIgnoreFilter.js
// ตัวกรองความปลอดภัยสำหรับ Akari Bot (Public Multi-Tenant Engine)
// ทำหน้าที่ตรวจสอบและปฏิเสธการตอบสนองทุกชนิดต่อ GUILD_ID ของ Bear Cafe (และ Guilds ใน Excluded list)
// ===================================================

const excludedGuildIds = new Set();

function initExcludedGuilds() {
  excludedGuildIds.clear();
  
  // 0. ค่าเริ่มต้น: เซิร์ฟเวอร์หลัก Bear Cafe (1144251788493602848)
  excludedGuildIds.add("1144251788493602848");

  // 1. ดึงจาก AKARI_EXCLUDED_GUILD_IDS
  if (process.env.AKARI_EXCLUDED_GUILD_IDS) {
    for (const id of process.env.AKARI_EXCLUDED_GUILD_IDS.split(",")) {
      if (id.trim()) excludedGuildIds.add(id.trim());
    }
  }

  // 2. ดึงจาก GUILD_ID หรือ DISCORD_GUILD_ID (เซิร์ฟหลัก Bear Cafe)
  if (process.env.GUILD_ID) {
    excludedGuildIds.add(process.env.GUILD_ID.trim());
  }
  if (process.env.DISCORD_GUILD_ID) {
    excludedGuildIds.add(process.env.DISCORD_GUILD_ID.trim());
  }

  // 3. ดึงจาก HEALJAI_GUILD_ID (เซิร์ฟเวอร์โปรเจกต์ฮิลใจ)
  if (process.env.HEALJAI_GUILD_ID) {
    excludedGuildIds.add(process.env.HEALJAI_GUILD_ID.trim());
  }
}

initExcludedGuilds();

/**
 * ดึง GuildID จาก Event arguments ของ Discord.js
 * @param {Array} args 
 * @returns {string|null}
 */
function extractGuildId(args) {
  if (!args || args.length === 0) return null;

  for (const arg of args) {
    if (!arg) continue;

    if (typeof arg.guildId === "string" && arg.guildId) {
      return arg.guildId;
    }

    if (arg.guild && typeof arg.guild.id === "string" && arg.guild.id) {
      return arg.guild.id;
    }

    if (typeof arg.id === "string" && arg.id && (arg.constructor?.name === "Guild" || arg.memberCount !== undefined)) {
      return arg.id;
    }
  }

  return null;
}

/**
 * ตรวจสอบว่า GuildID นี้อยู่ในรายการที่ต้อง Ignore 100% หรือไม่
 * @param {string|null|undefined} guildId 
 * @returns {boolean} Returns true if the guild MUST BE IGNORED
 */
function isExcludedGuild(guildId) {
  if (!guildId) return false;
  return excludedGuildIds.has(String(guildId).trim());
}

/**
 * ติดตั้ง Event Interceptor เพื่อดักและดรอป Event ของ Bear Cafe ทันที
 * @param {import('discord.js').Client} client 
 */
function setupAkariGuildFilter(client) {
  initExcludedGuilds();
  const originalEmit = client.emit;

  client.emit = function (eventName, ...args) {
    const guildId = extractGuildId(args);
    if (guildId && isExcludedGuild(guildId)) {
      // 🛑 Ignore 100% — ปฏิเสธการทำงานและไม่ส่ง Event ต่อไปให้ Feature อื่นของ Akari Bot
      return false;
    }
    return originalEmit.apply(this, [eventName, ...args]);
  };

  const listStr = Array.from(excludedGuildIds).join(", ");
  console.log(`🛡️ [AkariGuildFilter] ระบบกรองยิงผ่านเฉพาะ Public Guilds — เมินเฉย Guilds: [${listStr}]`);
}

module.exports = {
  isExcludedGuild,
  extractGuildId,
  setupAkariGuildFilter,
};
