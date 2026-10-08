// ===================================================
// index-kuma.js — จุดเริ่มต้นสำหรับ Kuma Bot (Public Multi-Tenant Engine)
// เชื่อมต่อตรงกับ Main Supabase Database (ลด Egress, ใช้คลังโจทย์ร่วมกับบอทหลัก)
// ===================================================

require("dotenv").config();

const { Client, GatewayIntentBits, ActivityType, MessageFlags } = require("discord.js");
const { createClient } = require("@supabase/supabase-js");
const ws = require("ws");

// Polyfill WebSocket สำหรับ Node.js < 22 เพื่อให้ @supabase/realtime-js ทำงานได้
if (!globalThis.WebSocket) {
  globalThis.WebSocket = ws;
}

const { setupAkariGuildFilter } = require("./src/akari/filters/guildIgnoreFilter");
const { setupAkariMinigames, flushAllTenantPoints } = require("./src/akari/minigames/minigamesEngine");
const { setupServerActivitySync } = require("./src/akari/services/serverActivitySync");
const { setupWelcomeService } = require("./src/akari/services/welcomeService");
const {
  registerAkariCommands,
  handleSetupGames,
  handleSettingGames,
  handleSettingToggle,
  handleSettingReset,
  handleClearCategory,
  handleSetGame,
  handleRemoveGame,
  handleKumaAdmin,
  handleRevealAnswer,
  handleSettingStore,
  handleOpenStore,
  handleStoreButtonInteraction,
  handleStoreModalSubmit,
  handleStoreSelectMenus,
  handleSettingCurrencyButton,
  handleSettingCurrencyModalSubmit,
  handlePointsCommand,
  handleLeaderboardCommand,
  handlePointsButtonInteraction,
  handleHelpCommand,
  handlePreviewCommand,
  handlePreviewButtonInteraction,
} = require("./src/akari/commands/minigamesCommands");

const botToken = process.env.KUMA_BOT_TOKEN || process.env.AKARI_BOT_TOKEN;

if (!botToken) {
  console.error("❌ [KumaBot] KUMA_BOT_TOKEN (หรือ AKARI_BOT_TOKEN) is missing in .env. Refusing to start Kuma Bot.");
  process.exit(1);
}

// 1. สร้าง Supabase Client เชื่อมต่อตรงกับ Main Supabase (หรือ KUMA_SUPABASE)
const supabaseUrl = process.env.KUMA_SUPABASE_URL || process.env.SUPABASE_URL || process.env.AKARI_SUPABASE_URL;
const supabaseKey = process.env.KUMA_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.AKARI_SUPABASE_SERVICE_ROLE_KEY;

let kumaSupabase = null;
if (supabaseUrl && supabaseKey) {
  kumaSupabase = createClient(
    supabaseUrl,
    supabaseKey,
    {
      auth: { persistSession: false },
      realtime: { transport: ws },
    }
  );
  console.log("⚡ [KumaBot] เชื่อมต่อ Main Supabase Database สำเร็จแล้ว!");
} else {
  console.warn("⚠️ [KumaBot] SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY ยังไม่ได้กรอก (ทำงานแบบ RAM Fallback Mode)");
}

// 2. สร้าง Discord Client สำหรับ Kuma Bot
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildVoiceStates,
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
setupAkariMinigames(client, kumaSupabase);

// 5. ติดตั้งระบบต้อนรับเมื่อบอทเข้าสู่เซิร์ฟเวอร์ใหม่ (guildCreate)
setupWelcomeService(client);

// 6. ติดตั้งและลงทะเบียน Slash Commands สำหรับ Kuma Bot
registerAkariCommands(client);

// 7. ดักฟัง Slash Commands และ Interactions
client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.isChatInputCommand()) {
      if (interaction.commandName === "setup-games") {
        return await handleSetupGames(interaction, kumaSupabase, client);
      }
      if (interaction.commandName === "setting-games" || interaction.commandName === "setting-game") {
        return await handleSettingGames(interaction, kumaSupabase);
      }
      if (interaction.commandName === "clear") {
        return await handleClearCategory(interaction, kumaSupabase);
      }
      if (interaction.commandName === "set-game") {
        return await handleSetGame(interaction, kumaSupabase, client);
      }
      if (interaction.commandName === "remove-game") {
        return await handleRemoveGame(interaction, kumaSupabase);
      }
      if (interaction.commandName === "points") {
        return await handlePointsCommand(interaction, kumaSupabase);
      }
      if (interaction.commandName === "leaderboard") {
        return await handleLeaderboardCommand(interaction, kumaSupabase);
      }
      if (interaction.commandName === "reveal-answer") {
        return await handleRevealAnswer(interaction, kumaSupabase);
      }
      if (interaction.commandName === "help") {
        return await handleHelpCommand(interaction, client);
      }
      if (interaction.commandName === "preview") {
        return await handlePreviewCommand(interaction, kumaSupabase);
      }
    }

    // Button Interactions
    if (interaction.isButton()) {
      if (
        interaction.customId === "kuma_view_leaderboard" ||
        interaction.customId === "akari_view_leaderboard" ||
        interaction.customId.startsWith("kuma_lb_") ||
        interaction.customId.startsWith("akari_lb_")
      ) {
        return await handlePointsButtonInteraction(interaction, kumaSupabase);
      }
      if (
        interaction.customId === "kuma_setting_currency_btn" ||
        interaction.customId === "akari_setting_currency_btn"
      ) {
        return await handleSettingCurrencyButton(interaction, kumaSupabase);
      }
      if (
        interaction.customId.startsWith("kuma_preview_btn") ||
        interaction.customId.startsWith("akari_preview_btn")
      ) {
        return await handlePreviewButtonInteraction(interaction);
      }
      if (
        interaction.customId.startsWith("kuma_store_") ||
        interaction.customId.startsWith("akari_store_") ||
        interaction.customId.startsWith("store_")
      ) {
        return await handleStoreButtonInteraction(interaction, kumaSupabase, client);
      }
    }

    // Modal Submissions
    if (interaction.isModalSubmit()) {
      if (
        interaction.customId.startsWith("kuma_currency_modal_submit") ||
        interaction.customId.startsWith("akari_currency_modal_submit")
      ) {
        return await handleSettingCurrencyModalSubmit(interaction, kumaSupabase);
      }
      if (
        interaction.customId.startsWith("kuma_store_") ||
        interaction.customId.startsWith("akari_store_") ||
        interaction.customId.startsWith("store_")
      ) {
        return await handleStoreModalSubmit(interaction, kumaSupabase);
      }
    }

    // Select Menus (String, Role, Channel)
    if (typeof interaction.isAnySelectMenu === "function" && interaction.isAnySelectMenu()) {
      if (
        interaction.customId.startsWith("kuma_store_") ||
        interaction.customId.startsWith("akari_store_") ||
        interaction.customId.startsWith("store_")
      ) {
        return await handleStoreSelectMenus(interaction, kumaSupabase);
      }
      if (
        interaction.customId === "kuma_setting_toggle_menu" ||
        interaction.customId === "akari_setting_toggle_menu"
      ) {
        return await handleSettingToggle(interaction, kumaSupabase);
      }
      if (
        interaction.customId === "kuma_setting_reset_menu" ||
        interaction.customId === "akari_setting_reset_menu"
      ) {
        return await handleSettingReset(interaction, kumaSupabase, client);
      }
    } else if (interaction.isStringSelectMenu()) {
      if (
        interaction.customId.startsWith("kuma_store_") ||
        interaction.customId.startsWith("akari_store_") ||
        interaction.customId.startsWith("store_")
      ) {
        return await handleStoreSelectMenus(interaction, kumaSupabase);
      }
      if (
        interaction.customId === "kuma_setting_toggle_menu" ||
        interaction.customId === "akari_setting_toggle_menu"
      ) {
        return await handleSettingToggle(interaction, kumaSupabase);
      }
      if (
        interaction.customId === "kuma_setting_reset_menu" ||
        interaction.customId === "akari_setting_reset_menu"
      ) {
        return await handleSettingReset(interaction, kumaSupabase, client);
      }
    }
  } catch (error) {
    if ([10008, 10062, 10003, 40060].includes(error?.code) || [10008, 10062, 10003, 40060].includes(error?.rawError?.code)) {
      return;
    }
    console.error("❌ [KumaBot] Interaction Handling Error:", error.message);
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

// 7. clientReady Event & Custom User Status
client.once("clientReady", () => {
  console.log(`🐻 Kuma Public Bot "${client.user.tag}" พร้อมใช้งานแล้ว! (ID: ${client.user.id})`);

  client.user.setPresence({
    activities: [
      {
        name: "custom",
        type: ActivityType.Custom,
        state: "🎮 บอทมินิเกมอันดับ #1 — พัฒนาโดย Bear Cafe ครับ",
      },
    ],
    status: "online",
  });

  // 7.1 เริ่มการทำงานของ Server Activity Sync (ซิงค์ Live Voice & Joins ทุก 5 นาที)
  if (kumaSupabase) {
    setupServerActivitySync(client, kumaSupabase);
  }
});

// 8. Login เข้า Discord Gateway
client.login(botToken).catch((err) => {
  console.error("❌ [KumaBot] Login failed:", err.message);
});

// 9. Graceful Shutdown (บันทึกคะแนนค้างท่อลง DB และตัด Gateway สวยงามเมื่อรีสตาร์ต)
let isShuttingDown = false;
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n🛑 [KumaBot] ได้รับสัญญาณ ${signal} กำลังบันทึกข้อมูลและปิดระบบอย่างปลอดภัย...`);

  try {
    if (kumaSupabase) {
      console.log("💾 [KumaBot] กำลัง Flush คะแนนที่ค้างใน RAM ทั้งหมดลง Supabase...");
      await flushAllTenantPoints(kumaSupabase);
      console.log("✅ [KumaBot] Flush คะแนนสำเร็จเรียบร้อย");
    }
    console.log("🔌 [KumaBot] กำลังตัดการเชื่อมต่อ Discord Client...");
    await client.destroy();
    console.log("👋 [KumaBot] ปิดโปรเซสอย่างสมบูรณ์ ข้อมูลไม่สูญหาย");
  } catch (err) {
    console.error("❌ [KumaBot] Shutdown error:", err.message);
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
