// ===================================================
// utils/guildFilter.js — ตัวกรองและแยกสภาพแวดล้อมระดับ Guild (Two-Domain Isolation Router)
// ===================================================

const config = require("../config");

const BEARCAFE_GUILD_ID = process.env.GUILD_ID || (config.bearCafeGuildId || "1144251788493602848");
const HEALJAI_GUILD_ID = process.env.HEALJAI_GUILD_ID || (config.healJai && config.healJai.guildId) || "1536199707922141254";

/**
 * Custom Guild IDs ที่กำหนดในโค้ดให้สิทธิ์ทำงาน
 */
const CUSTOM_ALLOWED_GUILD_IDS = [
  BEARCAFE_GUILD_ID,
  HEALJAI_GUILD_ID,
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

  // 3. ดึงจาก HEALJAI_GUILD_ID ใน process.env
  if (process.env.HEALJAI_GUILD_ID) {
    for (const id of process.env.HEALJAI_GUILD_ID.split(",")) {
      if (id.trim()) allowedSet.add(id.trim());
    }
  }

  // 4. ดึงจาก ALLOWED_GUILD_IDS ใน process.env
  if (process.env.ALLOWED_GUILD_IDS) {
    for (const id of process.env.ALLOWED_GUILD_IDS.split(",")) {
      if (id.trim()) allowedSet.add(id.trim());
    }
  }

  // 5. ดึงจาก config.allowedGuildIds (ถ้ามี)
  if (config.allowedGuildIds && Array.isArray(config.allowedGuildIds)) {
    for (const id of config.allowedGuildIds) {
      if (id) allowedSet.add(String(id).trim());
    }
  }

  // 6. ดึงจาก Custom Guild IDs ที่กำหนดในโค้ด
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

  const defaultGuildId = targetGuildId || process.env.DISCORD_GUILD_ID || BEARCAFE_GUILD_ID;
  const targetGuild = client.guilds.cache.get(defaultGuildId);

  if (targetGuild && isAllowedGuild(targetGuild.id)) {
    return targetGuild;
  }

  return client.guilds.cache.find((g) => isAllowedGuild(g.id)) || null;
}

/**
 * ตรวจสอบว่า Event นี้เกี่ยวข้องกับระบบ HealJai (ฮิลใจ) หรือไม่
 * @param {string} eventName 
 * @param {Array} args 
 * @returns {boolean}
 */
function isHealJaiEvent(eventName, args) {
  if (!args || args.length === 0) return false;

  if (eventName === "interactionCreate") {
    const interaction = args[0];
    if (!interaction) return false;

    // 1. ตรวจสอบ Component Buttons / Select Menus / Modals ของ HealJai
    if (typeof interaction.customId === "string" && interaction.customId.startsWith("heal_jai_")) {
      return true;
    }

    // 2. ตรวจสอบ Slash Commands ของ HealJai
    if (typeof interaction.isChatInputCommand === "function" && interaction.isChatInputCommand()) {
      const name = interaction.commandName ? interaction.commandName.toLowerCase() : "";
      if (name.startsWith("heal") || name.startsWith("ฮิลใจ") || name === "send-component") {
        return true;
      }
    }
  }

  if (eventName === "messageCreate") {
    const message = args[0];
    if (message && typeof message.content === "string") {
      const text = message.content.trim().toLowerCase();
      // คำสั่ง Prefix ประจำโปรเจกต์ฮิลใจ
      if (text.startsWith("b!reset-menu") || text.startsWith("b!heal") || text.startsWith("!heal")) {
        return true;
      }
    }
  }

  return false;
}

/**
 * ติดตั้ง Event Interceptor เพื่อแยกสภาพแวดล้อม (Two-Domain Isolation Router)
 * @param {import('discord.js').Client} client 
 */
function setupGuildFilter(client) {
  const originalEmit = client.emit;

  client.emit = function (eventName, ...args) {
    const guildId = extractGuildIdFromArgs(args);
    if (guildId) {
      const cleanGuildId = String(guildId).trim();

      // ── 1. กรณีเกิดในกิลด์ HealJai (1536199707922141254) ───────────
      // อนุญาตเฉพาะ Event ของฮิลใจเท่านั้น!
      // คำสั่งของ Bear Cafe ทั้งหมด (b!cafe, b!box, b!reset-verify, slash commands, voice ฯลฯ) จะถูกบล็อกทันที
      if (cleanGuildId === HEALJAI_GUILD_ID) {
        if (!isHealJaiEvent(eventName, args)) {
          return false;
        }
        return originalEmit.apply(this, [eventName, ...args]);
      }

      // ── 2. กรณีเกิดในกิลด์ Bear Cafe หลัก (1144251788493602848) ────
      // ห้าม Event ของ HealJai (b!reset-menu, ปุ่มกด heal_jai_*) เข้ามาทำงานในเซิร์ฟเวอร์ Bear Cafe เด็ดขาด
      if (cleanGuildId === BEARCAFE_GUILD_ID) {
        if (isHealJaiEvent(eventName, args)) {
          return false;
        }
        return originalEmit.apply(this, [eventName, ...args]);
      }

      // ── 3. กรณีเป็น Guild อื่นๆ ตรวจสอบตาม Allowlist ปกติ ──────────
      if (!isAllowedGuild(cleanGuildId)) {
        return false;
      }
    }

    return originalEmit.apply(this, [eventName, ...args]);
  };

  console.log(`🛡️ [GuildFilter] Two-Domain Isolation Router พร้อมทำงาน:`);
  console.log(`   ☕ Bear Cafe Guild : ${BEARCAFE_GUILD_ID}`);
  console.log(`   💚 HealJai Guild   : ${HEALJAI_GUILD_ID}`);
}

module.exports = {
  BEARCAFE_GUILD_ID,
  HEALJAI_GUILD_ID,
  getAllowedGuildIds,
  isAllowedGuild,
  isIgnoredGuild,
  isHealJaiEvent,
  extractGuildIdFromArgs,
  getValidGuild,
  setupGuildFilter,
};
