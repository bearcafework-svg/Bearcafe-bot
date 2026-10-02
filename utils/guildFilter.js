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

  // 6. ดึงจาก Custom Guild IDs ที่กำหนดในโค้ด (Bear Cafe & HealJai)
  allowedSet.add(BEARCAFE_GUILD_ID);
  allowedSet.add(HEALJAI_GUILD_ID);

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
 * ดึง ChannelID จากอาร์กิวเมนต์ของ event
 * @param {Array} args 
 * @returns {string|null}
 */
function extractChannelIdFromArgs(args) {
  if (!args || args.length === 0) return null;

  for (const arg of args) {
    if (!arg) continue;

    if (typeof arg.channelId === "string" && arg.channelId) {
      return arg.channelId;
    }

    if (arg.channel && typeof arg.channel.id === "string" && arg.channel.id) {
      return arg.channel.id;
    }

    if (typeof arg.id === "string" && arg.id && (arg.constructor?.name === "TextChannel" || arg.constructor?.name === "VoiceChannel" || arg.type !== undefined)) {
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

  const guildId = extractGuildIdFromArgs(args);
  if (guildId && String(guildId).trim() === HEALJAI_GUILD_ID) {
    return true;
  }

  if (eventName === "interactionCreate") {
    const interaction = args[0];
    if (!interaction) return false;

    // 1. ตรวจสอบ Component Buttons / Select Menus / Modals ของ HealJai
    if (
      typeof interaction.customId === "string" &&
      (interaction.customId.startsWith("heal_jai_") ||
       interaction.customId.startsWith("btn_cancel_order") ||
       interaction.customId.startsWith("btn_call_admin") ||
       interaction.customId.startsWith("p_"))
    ) {
      return true;
    }

    // 2. ตรวจสอบ Slash Commands ของ HealJai
    if (typeof interaction.isChatInputCommand === "function" && interaction.isChatInputCommand()) {
      const name = interaction.commandName ? interaction.commandName.toLowerCase() : "";
      if (
        name.startsWith("heal") ||
        name.startsWith("ฮิลใจ") ||
        name === "ยืนยันการโอน" ||
        name === "อนุมัติสลิป" ||
        name === "บัตรพนักงาน" ||
        name === "แก้ไขพนักงาน" ||
        name === "แก้ไขที่ปรึกษา" ||
        name === "ส่งเมนู" ||
        name === "ข้อตกลง" ||
        name === "heal-component" ||
        name === "send-component"
      ) {
        return true;
      }
    }
    // 3. ตรวจสอบ Autocomplete ของ HealJai
    if (typeof interaction.isAutocomplete === "function" && interaction.isAutocomplete()) {
      const name = interaction.commandName ? interaction.commandName.toLowerCase() : "";
      if (
        name === "บัตรพนักงาน" ||
        name === "แก้ไขพนักงาน" ||
        name === "แก้ไขที่ปรึกษา" ||
        name === "อนุมัติสลิป" ||
        name.startsWith("heal") ||
        name.startsWith("ฮิลใจ")
      ) {
        return true;
      }
    }

    // 4. ตรวจสอบจากชื่อห้องหรือ channelId
    const chName = interaction?.channel?.name || "";
    if (
      chName.includes("พักใจ") ||
      chName.includes("ฮิลใจ") ||
      chName.includes("เลือกเมนู") ||
      chName.startsWith("🌱") ||
      chName.startsWith("☕")
    ) {
      return true;
    }
  }

  if (eventName === "messageCreate") {
    const message = args[0];
    const chName = message?.channel?.name || "";
    if (
      chName.includes("พักใจ") ||
      chName.includes("ฮิลใจ") ||
      chName.includes("เลือกเมนู") ||
      chName.startsWith("🌱") ||
      chName.startsWith("☕") ||
      (message?.attachments && message.attachments.size > 0)
    ) {
      return true;
    }
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
    // ── DEV SANDBOX RESTRICTION ─────────────────────────────────────
    if (process.env.DEV_MODE === "true") {
      // 1. Mute all voice state updates to prevent voice points collision with prod
      if (eventName === "voiceStateUpdate") {
        if (process.env.ENABLE_VOICE_BOARD === "true") {
          try {
            const { triggerVoiceBoardUpdate } = require("../src/features/voiceBoard");
            const newState = args[1] || args[0];
            if (newState?.guild) triggerVoiceBoardUpdate(newState.guild);
          } catch (e) {}
        }
        return false;
      }

      // 2. Channel-scoped check for message & interaction events
      const devChannels = (process.env.DEV_CHANNEL_IDS || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

      if (devChannels.length > 0) {
        const guildId = extractGuildIdFromArgs(args);
        const cleanGuildId = guildId ? String(guildId).trim() : null;

        // บังคับจำกัดช่องเฉพาะเมื่ออยู่ในเซิร์ฟเวอร์ Bear Cafe หลัก (เพื่อไม่ให้บอททดสอบไปกวนห้องสาธารณะ)
        // หากเกิดในเซิร์ฟเวอร์ฮิลใจ (HEALJAI_GUILD_ID) หรือเป็น HealJai Event จะปล่อยผ่าน
        if (!cleanGuildId || cleanGuildId === BEARCAFE_GUILD_ID) {
          const channelId = extractChannelIdFromArgs(args);
          if (channelId && !devChannels.includes(channelId)) {
            // หากเป็น HealJai Event หรือข้อความในห้องพักใจ Ticket ให้ปล่อยผ่าน
            if (isHealJaiEvent(eventName, args)) {
              return originalEmit.apply(this, [eventName, ...args]);
            }

            if (eventName === "messageCreate") {
              const message = args[0];
              const chName = message?.channel?.name || "";
              if (
                chName.startsWith("🌱︲") ||
                chName.startsWith("🌱") ||
                chName.startsWith("☕・พักใจ-") ||
                chName.startsWith("☕-พักใจ-") ||
                chName.startsWith("☕・") ||
                chName.startsWith("☕︰")
              ) {
                return originalEmit.apply(this, [eventName, ...args]);
              }
            }

            // ข้อยกเว้นสำหรับ Interaction ในโหมด DEV:
            if (eventName === "interactionCreate") {
              const interaction = args[0];

              // 0. Interaction ในห้องพักใจ Ticket ของ HealJai
              const chName = interaction?.channel?.name || "";
              if (
                chName.startsWith("🌱︲") ||
                chName.startsWith("🌱") ||
                chName.startsWith("☕・พักใจ-") ||
                chName.startsWith("☕-พักใจ-") ||
                chName.startsWith("☕・") ||
                chName.startsWith("☕︰")
              ) {
                return originalEmit.apply(this, [eventName, ...args]);
              }

              // 1. คำสั่งทดสอบ เช่น /test_bee, /send-component, /หมุนกาชา อนุญาตให้ทำงานได้ในทุกห้อง
              if (interaction && typeof interaction.isChatInputCommand === "function" && interaction.isChatInputCommand()) {
                const allowedDevCommands = (process.env.DEV_SLASH_COMMANDS || "test_bee,send-component,ยืนยันการโอน,อนุมัติสลิป,บัตรพนักงาน,แก้ไขพนักงาน,แก้ไขที่ปรึกษา,หมุนกาชา,gacha")
                  .split(",")
                  .map((s) => s.trim().toLowerCase())
                  .filter(Boolean);
                if (allowedDevCommands.includes((interaction.commandName || "").toLowerCase())) {
                  return originalEmit.apply(this, [eventName, ...args]);
                }
              }

              // 2. Autocomplete ของคำสั่งทดสอบ
              if (interaction && typeof interaction.isAutocomplete === "function" && interaction.isAutocomplete()) {
                return originalEmit.apply(this, [eventName, ...args]);
              }

              // 3. การกดปุ่ม/ส่งฟอร์มของระบบผึ้ง (bee_*), Voice Board (vb_*), Gachapon (gacha_*), หรือ HealJai (heal_jai_*, p_*)
              if (interaction && typeof interaction.customId === "string" && (interaction.customId.startsWith("bee_") || interaction.customId.startsWith("vb_") || interaction.customId.startsWith("gacha_") || interaction.customId.startsWith("heal_jai_") || interaction.customId.startsWith("p_"))) {
                return originalEmit.apply(this, [eventName, ...args]);
              }

              // 4. Interaction อื่นๆ นอกเหนือจากช่อง DEV: ตอบกลับแบบ Ephemeral ป้องกัน Discord ขึ้นว่าไม่ตอบสนอง
              if (interaction && typeof interaction.isRepliable === "function" && interaction.isRepliable() && !interaction.replied && !interaction.deferred) {
                interaction.reply({
                  content: `⚠️ [DEV MODE] บอททดสอบเปิดให้ใช้งานเฉพาะในช่องที่กำหนด: <#${devChannels.join(">, <#")}>`,
                  ephemeral: true,
                }).catch(() => {});
              }
            }

            return false;
          }
        }
      }
    }

    // 🛡️ ป้องกันไม่ให้บอทหลักตอบสนองต่อ Event ใดๆ ของฮีลใจโดยเด็ดขาด
    if (process.env.DEV_MODE !== "true" && isHealJaiEvent(eventName, args)) {
      return false;
    }

    const guildId = extractGuildIdFromArgs(args);
    if (guildId) {
      const cleanGuildId = String(guildId).trim();

      // ── 1. กรณีเกิดในกิลด์ HealJai (1536199707922141254) ───────────
      if (cleanGuildId === HEALJAI_GUILD_ID) {
        // หากเป็นบอทหลัก (Production Mode) ห้ามตอบสนองกิลด์ HealJai โดยเด็ดขาด
        if (process.env.DEV_MODE !== "true") {
          return false;
        }
        return originalEmit.apply(this, [eventName, ...args]);
      }

      // ── 2. กรณีเกิดในกิลด์ Bear Cafe หลัก (1144251788493602848) ────
      if (cleanGuildId === BEARCAFE_GUILD_ID) {
        if (eventName === "interactionCreate") {
          const interaction = args[0];
          if (interaction?.isChatInputCommand?.() && interaction.commandName?.toLowerCase() === "send-component") {
            return originalEmit.apply(this, [eventName, ...args]);
          }
          if (typeof interaction?.customId === "string" && (interaction.customId.startsWith("vb_") || interaction.customId.startsWith("gacha_"))) {
            return originalEmit.apply(this, [eventName, ...args]);
          }
        }
        // บอทหลัก (ไม่ใช่ DEV_MODE) ห้ามตอบสนอง HealJai ใน Bear Cafe guild
        if (process.env.DEV_MODE !== "true" && isHealJaiEvent(eventName, args)) {
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
  if (process.env.DEV_MODE === "true") {
    console.log(`   🛠️ Dev Sandbox     : Channel-scoped to ${process.env.DEV_CHANNEL_IDS || "ALL"}`);
  }
}

module.exports = {
  BEARCAFE_GUILD_ID,
  HEALJAI_GUILD_ID,
  getAllowedGuildIds,
  isAllowedGuild,
  isIgnoredGuild,
  isHealJaiEvent,
  extractGuildIdFromArgs,
  extractChannelIdFromArgs,
  getValidGuild,
  setupGuildFilter,
};
