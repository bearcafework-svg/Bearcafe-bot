// src/commands/slashCommandRegistry.js
// ศูนย์กลางจัดการและลงทะเบียน Slash Commands ของทุกบอท (Hub & Router)
// แยกชุดคำสั่งออกเป็น 3 ไฟล์:
// 1. bearcafeSlashCommands.js — บอทหลัก Bear Café
// 2. healjaiSlashCommands.js  — บอทฮีลใจ (Heal Jai) และ Dev Sandbox
// 3. kumaSlashCommands.js     — บอทคุมะ (Kuma Bot)

const { BEARCAFE_SLASH_COMMANDS, GUILD_SLASH_COMMANDS } = require("./bearcafeSlashCommands");
const { HEAL_JAI_SLASH_COMMANDS, DEV_ONLY_SLASH_COMMANDS } = require("./healjaiSlashCommands");
const { KUMA_SLASH_COMMANDS, AKARI_SLASH_COMMANDS } = require("./kumaSlashCommands");

/**
 * เปรียบเทียบชุดคำสั่งที่มีอยู่ใน Discord กับคำสั่งเป้าหมายว่าตรงกันหรือไม่
 */
function areCommandsEqual(existingCollection, targetCommands) {
  if (!existingCollection || existingCollection.size !== targetCommands.length) return false;
  for (const cmd of targetCommands) {
    const existingCmd = existingCollection.find((c) => c.name === cmd.name);
    if (!existingCmd) return false;
    const existingOpts = existingCmd.options || [];
    const targetOpts = cmd.options || [];
    if (existingOpts.length !== targetOpts.length) return false;

    for (let i = 0; i < targetOpts.length; i++) {
      const tOpt = targetOpts[i];
      const eOpt = existingOpts[i];
      if (
        !eOpt ||
        tOpt.name !== eOpt.name ||
        tOpt.type !== eOpt.type ||
        Boolean(tOpt.required) !== Boolean(eOpt.required) ||
        Boolean(tOpt.autocomplete) !== Boolean(eOpt.autocomplete)
      ) {
        return false;
      }
      const tChoices = tOpt.choices || [];
      const eChoices = eOpt.choices || [];
      if (tChoices.length !== eChoices.length) return false;
      for (let c = 0; c < tChoices.length; c++) {
        if (tChoices[c].name !== eChoices[c].name || tChoices[c].value !== eChoices[c].value) {
          return false;
        }
      }
    }
  }
  return true;
}

/**
 * ลงทะเบียน Guild Slash Commands ทั้งหมดในครั้งเดียว (Bulk Set)
 * แยกคำสั่งระหว่าง Guild Bear Cafe และ Guild HealJai อย่างเด็ดขาด
 * @param {import("discord.js").Guild} guild
 */
async function registerAllGuildCommands(guild) {
  if (!guild || !guild.commands) {
    console.warn("[slash] Cannot register guild commands: guild not provided or missing commands manager.");
    return;
  }

  const isDevMode = process.env.DEV_MODE === "true";
  const healJaiGuildId = process.env.HEALJAI_GUILD_ID || "1536199707922141254";

  try {
    const startTime = Date.now();
    const isHealJaiGuild = guild.id === healJaiGuildId;

    // 🛑 บอทหลัก (Production Mode: DEV_MODE=false) ห้ามแตะต้องคำสั่งบนเซิร์ฟเวอร์ฮิลใจโดยเด็ดขาด
    if (!isDevMode && isHealJaiGuild) {
      console.log(`[slash] 🛑 Main Bot does not manage commands on Heal Jai Guild ("${guild.name}"). Skipping.`);
      return;
    }

    let targetCommands = isHealJaiGuild ? HEAL_JAI_SLASH_COMMANDS : GUILD_SLASH_COMMANDS;

    if (isDevMode) {
      if (isHealJaiGuild) {
        // บนเซิร์ฟเวอร์ฮิลใจ: บอท Dev ดูแลคำสั่งของฮิลใจทั้งหมด + คำสั่ง Dev
        targetCommands = [...HEAL_JAI_SLASH_COMMANDS, ...DEV_ONLY_SLASH_COMMANDS];
      } else if (guild.id === "1144251788493602848") {
        // 🛑 บนกิลด์ Bear Cafe (1144251788493602848): ห้ามมีคำสั่ง /slash ของบอท Dev โดยเด็ดขาด
        targetCommands = [];
      } else {
        // บนเซิร์ฟเวอร์อื่นๆ: หากมีการระบุ DEV_SLASH_COMMANDS ให้กรองตามนั้น หากไม่ระบุให้ลงทะเบียนคำสั่งทั้งหมด
        if (process.env.DEV_SLASH_COMMANDS) {
          const allowedDevCommands = process.env.DEV_SLASH_COMMANDS
            .split(",")
            .map((s) => s.trim().toLowerCase())
            .filter(Boolean);

          targetCommands = [...targetCommands, ...DEV_ONLY_SLASH_COMMANDS].filter((cmd) =>
            allowedDevCommands.includes(cmd.name.toLowerCase())
          );
        } else {
          targetCommands = [...targetCommands, ...DEV_ONLY_SLASH_COMMANDS];
        }
      }
      if (guild.id !== "1144251788493602848") {
        console.log(
          `🛠️ [slash] DEV_MODE is active: Synchronizing [${targetCommands.map((c) => c.name).join(", ")}] on "${guild.name}"`
        );
      }
    }

    // ⚡ Smart Command Check: ตรวจสอบคำสั่งเดิมก่อน ถ้าตรงกันอยู่แล้วให้ข้ามทันทีเพื่อไม่ให้ติด 429
    const existing = await guild.commands.fetch().catch(() => null);
    if (existing && areCommandsEqual(existing, targetCommands)) {
      if (!isDevMode || guild.id !== "1144251788493602848") {
        const duration = Date.now() - startTime;
        console.log(
          `⚡ [slash] Commands on "${guild.name}" are already up to date (${targetCommands.length} commands, ${duration}ms, skipped API call to avoid 429)`
        );
      }
      return;
    }

    await guild.commands.set(targetCommands);
    if (!isDevMode || guild.id !== "1144251788493602848") {
      const duration = Date.now() - startTime;
      console.log(
        `⚡ [slash] Synchronized ${targetCommands.length} guild slash commands on "${guild.name}" (${duration}ms)`
      );
    }
  } catch (err) {
    console.error(`❌ [slash] Failed to bulk set slash commands on "${guild.name}":`, err.message);
  }
}

module.exports = {
  BEARCAFE_SLASH_COMMANDS,
  GUILD_SLASH_COMMANDS,
  HEAL_JAI_SLASH_COMMANDS,
  DEV_ONLY_SLASH_COMMANDS,
  KUMA_SLASH_COMMANDS,
  AKARI_SLASH_COMMANDS,
  registerAllGuildCommands,
  areCommandsEqual,
};
