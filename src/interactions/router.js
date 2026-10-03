// src/interactions/router.js
// ศูนย์กลางกระจาย Interaction (Centralized Interaction Router)
// เพิ่มความเร็วในการประมวลผล (O(1) Map Lookup) และแก้ปัญหา MaxListenersExceededWarning

const { Events } = require("discord.js");

const chatCommands = new Map();
const autocompletes = new Map();
const buttonHandlers = [];
const modalHandlers = [];
const selectMenuHandlers = [];

/**
 * ลงทะเบียนตัวจัดการคำสั่ง Slash Command (isChatInputCommand)
 * @param {string} commandName ชื่อคำสั่ง
 * @param {Function} handler ฟังก์ชันจัดการ interaction
 */
function registerCommand(commandName, handler) {
  chatCommands.set(commandName, handler);
}

/**
 * ลงทะเบียนตัวจัดการ Autocomplete (isAutocomplete)
 * @param {string} commandName ชื่อคำสั่ง
 * @param {Function} handler ฟังก์ชันจัดการ interaction
 */
function registerAutocomplete(commandName, handler) {
  autocompletes.set(commandName, handler);
}

/**
 * ลงทะเบียนตัวจัดการปุ่ม (isButton)
 * @param {string|RegExp|Function} matcher ข้อความนำหน้า (Prefix), RegExp, หรือ ฟังก์ชันตรวจสอบ customId
 * @param {Function} handler ฟังก์ชันจัดการ interaction
 */
function registerButton(matcher, handler) {
  buttonHandlers.push({ matcher, handler });
}

/**
 * ลงทะเบียนตัวจัดการ Modal (isModalSubmit)
 * @param {string|RegExp|Function} matcher ข้อความนำหน้า (Prefix), RegExp, หรือ ฟังก์ชันตรวจสอบ customId
 * @param {Function} handler ฟังก์ชันจัดการ interaction
 */
function registerModal(matcher, handler) {
  modalHandlers.push({ matcher, handler });
}

/**
 * ลงทะเบียนตัวจัดการ Select Menu (Select Menus)
 * @param {string|RegExp|Function} matcher ข้อความนำหน้า (Prefix), RegExp, หรือ ฟังก์ชันตรวจสอบ customId
 * @param {Function} handler ฟังก์ชันจัดการ interaction
 */
function registerSelectMenu(matcher, handler) {
  selectMenuHandlers.push({ matcher, handler });
}

function matchHandler(list, interaction) {
  const customId = interaction.customId || "";
  for (const entry of list) {
    if (typeof entry.matcher === "string") {
      if (customId === entry.matcher || customId.startsWith(entry.matcher)) {
        return entry.handler;
      }
    } else if (entry.matcher instanceof RegExp) {
      if (entry.matcher.test(customId)) {
        return entry.handler;
      }
    } else if (typeof entry.matcher === "function") {
      if (entry.matcher(customId, interaction)) {
        return entry.handler;
      }
    }
  }
  return null;
}

let isInitialized = false;

/**
 * เริ่มต้นระบบ Interaction Router กับ Discord Client
 * @param {import("discord.js").Client} client
 */
function initInteractionRouter(client) {
  if (isInitialized) return;
  isInitialized = true;

  const isDevMode = process.env.DEV_MODE === "true";
  const devAllowedChannels = (process.env.DEV_CHANNEL_IDS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      if (isDevMode) {
        const currentGuildId = interaction.guildId || interaction.guild?.id;
        // 🛑 บอท Dev (DEV_MODE=true) ห้ามรับหรือตอบสนองคำสั่ง /slash บนกิลด์ Bear Cafe (1144251788493602848) โดยเด็ดขาด
        if (currentGuildId === "1144251788493602848" && (interaction.isChatInputCommand?.() || interaction.isAutocomplete?.())) {
          return;
        }
      }

      if (isDevMode && devAllowedChannels.length > 0) {
        const chId = interaction.channelId || interaction.channel?.id;
        const guildId = interaction.guildId || interaction.guild?.id;
        const isHealJaiGuild = guildId && (guildId === process.env.HEALJAI_GUILD_ID || guildId === "1536199707922141254");
        const customId = interaction.customId || "";
        const cmdName = (interaction.commandName || "").toLowerCase();
        const allowedDevCommands = (process.env.DEV_SLASH_COMMANDS || "test_bee,heal-component,ยืนยันการโอน,อนุมัติสลิป,บัตรพนักงาน,แก้ไขพนักงาน,แก้ไขที่ปรึกษา,หมุนกาชา,gacha,clear")
          .split(",")
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);

        const isHealJaiInteraction =
          isHealJaiGuild ||
          customId.startsWith("heal_jai_") ||
          customId.startsWith("btn_cancel_order") ||
          customId.startsWith("btn_call_admin") ||
          cmdName.startsWith("heal") ||
          cmdName.startsWith("ฮิลใจ") ||
          cmdName === "clear" ||
          allowedDevCommands.includes(cmdName) ||
          ["heal-component", "แก้ไขพนักงาน", "แก้ไขที่ปรึกษา", "บัตรพนักงาน", "ยืนยันการโอน", "อนุมัติสลิป", "clear"].includes(cmdName);

        if (chId && !devAllowedChannels.includes(chId) && !isHealJaiInteraction) {
          return;
        }
      }

      if (typeof interaction.isChatInputCommand === "function" && interaction.isChatInputCommand()) {
        const handler = chatCommands.get(interaction.commandName);
        if (handler) {
          await handler(interaction);
        }
        return;
      }

      if (typeof interaction.isAutocomplete === "function" && interaction.isAutocomplete()) {
        const handler = autocompletes.get(interaction.commandName);
        if (handler) {
          await handler(interaction);
        }
        return;
      }

      if (typeof interaction.isButton === "function" && interaction.isButton()) {
        const handler = matchHandler(buttonHandlers, interaction);
        if (handler) {
          await handler(interaction);
        }
        return;
      }

      if (typeof interaction.isModalSubmit === "function" && interaction.isModalSubmit()) {
        const handler = matchHandler(modalHandlers, interaction);
        if (handler) {
          await handler(interaction);
        }
        return;
      }

      if (typeof interaction.isAnySelectMenu === "function" && interaction.isAnySelectMenu()) {
        const handler = matchHandler(selectMenuHandlers, interaction);
        if (handler) {
          await handler(interaction);
        }
        return;
      }
    } catch (err) {
      console.error(`[interactionRouter] ❌ Error handling interaction (${interaction.commandName || interaction.customId}):`, err);
    }
  });

  console.log("⚡ [interactionRouter] Centralized Interaction Router initialized.");
}

module.exports = {
  registerCommand,
  registerAutocomplete,
  registerButton,
  registerModal,
  registerSelectMenu,
  initInteractionRouter,
};
