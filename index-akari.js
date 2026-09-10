// ===================================================
// index-akari.js — จุดเริ่มต้นสำหรับ Akari Bot (Public Multi-Tenant Engine)
// ===================================================

require("dotenv").config();

const { Client, GatewayIntentBits, ActivityType, MessageFlags } = require("discord.js");
const { createClient } = require("@supabase/supabase-js");
const { setupAkariGuildFilter } = require("./src/akari/filters/guildIgnoreFilter");
const { setupAkariMinigames, flushAllTenantPoints } = require("./src/akari/minigames/minigamesEngine");
const {
  registerAkariCommands,
  handleSetupGames,
  handleSettingGames,
  handleSettingToggle,
  handleSettingReset,
  handleClearCategory,
} = require("./src/akari/commands/minigamesCommands");

const botToken = process.env.AKARI_BOT_TOKEN;

if (!botToken) {
  console.error("❌ [AkariBot] AKARI_BOT_TOKEN is missing in .env. Refusing to start Akari Bot.");
  process.exit(1);
}

// 1. สร้าง Supabase Client สำหรับ Akari Database
let akariSupabase = null;
if (process.env.AKARI_SUPABASE_URL && process.env.AKARI_SUPABASE_SERVICE_ROLE_KEY) {
  akariSupabase = createClient(
    process.env.AKARI_SUPABASE_URL,
    process.env.AKARI_SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false },
    }
  );
  console.log("⚡ [AkariBot] เชื่อมต่อ Akari Supabase Database สำเร็จแล้ว!");
} else {
  console.warn("⚠️ [AkariBot] AKARI_SUPABASE_URL หรือ AKARI_SUPABASE_SERVICE_ROLE_KEY ยังไม่ได้กรอก (ทำงานแบบ RAM Fallback Mode)");
}

// 2. สร้าง Discord Client สำหรับ Akari Bot (ปรับลด Intents เพื่อประหยัด CPU/Network และเปิด Message Cache Sweeper)
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  sweepers: {
    messages: {
      interval: 1800, // กวาดแคชทุก 30 นาที
      lifetime: 900,  // ลบข้อความที่เก่ากว่า 15 นาทีออกจาก RAM
    },
  },
});
client.setMaxListeners(50);

// 3. ติดตั้ง Guild Ignore Filter (ปฏิเสธการตอบสนองทุกชนิดต่อ Bear Cafe Main Guild ID)
setupAkariGuildFilter(client);

// 4. ติดตั้งระบบมินิเกม Multi-Tenant
setupAkariMinigames(client, akariSupabase);

// 5. ติดตั้งและลงทะเบียน Slash Commands สำหรับ Akari Bot
registerAkariCommands(client);

// 6. ดักฟัง Slash Commands และ Select Menus
client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "setup-games") {
        return await handleSetupGames(interaction, akariSupabase, client);
      }
      if (interaction.commandName === "setting-games") {
        return await handleSettingGames(interaction, akariSupabase);
      }
      if (interaction.commandName === "clear") {
        return await handleClearCategory(interaction, akariSupabase);
      }
    }

    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === "akari_setting_toggle_menu") {
        return await handleSettingToggle(interaction, akariSupabase);
      }
      if (interaction.customId === "akari_setting_reset_menu") {
        return await handleSettingReset(interaction, akariSupabase, client);
      }
    }
  } catch (error) {
    if ([10008, 10062, 10003, 40060].includes(error?.code) || [10008, 10062, 10003, 40060].includes(error?.rawError?.code)) {
      return;
    }
    console.error("❌ [AkariBot] Interaction Handling Error:", error.message);
    const replyPayload = {
      content: `❌ เกิดข้อผิดพลาดในการทำคำสั่ง: ${error.message}`,
      flags: MessageFlags.Ephemeral,
    };
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp(replyPayload).catch(() => {});
    } else {
      await interaction.reply(replyPayload).catch(() => {});
    }
  }
});

// 7. clientReady Event
client.once("clientReady", () => {
  console.log(`🏮 Akari Public Bot "${client.user.tag}" พร้อมใช้งานแล้ว! (ID: ${client.user.id})`);

  client.user.setPresence({
    activities: [{ name: "🏮 Akari Minigames V2 | Multi-Tenant Engine", type: ActivityType.Playing }],
    status: "online",
  });
});

// 8. Login เข้า Discord Gateway
client.login(botToken).catch((err) => {
  console.error("❌ [AkariBot] Login failed:", err.message);
});

// 9. Graceful Shutdown (บันทึกคะแนนค้างท่อลง DB และตัด Gateway สวยงามเมื่อรีสตาร์ต)
let isShuttingDown = false;
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n🛑 [AkariBot] ได้รับสัญญาณ ${signal} กำลังบันทึกข้อมูลและปิดระบบอย่างปลอดภัย...`);

  try {
    if (akariSupabase) {
      console.log("💾 [AkariBot] กำลัง Flush คะแนนที่ค้างใน RAM ทั้งหมดลง Supabase...");
      await flushAllTenantPoints(akariSupabase);
      console.log("✅ [AkariBot] Flush คะแนนสำเร็จเรียบร้อย");
    }
    console.log("🔌 [AkariBot] กำลังตัดการเชื่อมต่อ Discord Client...");
    await client.destroy();
    console.log("👋 [AkariBot] ปิดโปรเซสอย่างสมบูรณ์ ข้อมูลไม่สูญหาย");
  } catch (err) {
    console.error("❌ [AkariBot] Shutdown error:", err.message);
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
