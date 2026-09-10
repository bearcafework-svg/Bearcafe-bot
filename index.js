// ===================================================
// index.js — จุดเริ่มต้นของบอท
// ===================================================

require("dotenv").config();

const http = require("http");
const { Client, GatewayIntentBits, ActivityType, Events } = require("discord.js");
const { startMonitor } = require("./handlers/roomMonitor");
const { destroyRoom } = require("./handlers/roomDestroyer");
const { createRoom } = require("./handlers/roomCreator");
const { handleRoomPanel, handleRoomPanelInteraction } = require("./handlers/roomPanel");
const { handleRentHousePanelInteraction, handleRentHousePanelMessage } = require("./handlers/rentHousePanel");
const { setupContractNotifier } = require("./src/services/contractNotifier");
const { setupBroadcastScheduler } = require("./src/services/broadcastScheduler");
const voiceStateUpdate = require("./events/voiceStateUpdate");
const { getAllRooms, getAllSeparators } = require("./state/redisClient");
const { syncAllSeparators } = require("./utils/separatorManager");
const { registerAllGuildCommands } = require("./src/commands/slashCommandRegistry");
const logger = require("./utils/logger");
const config = require("./config");
const { startVoiceLogWorker } = require("./utils/voiceLogWorker");

const isDevMode = process.env.DEV_MODE === "true";
const isLocalFastStart = isDevMode || process.env.LOCAL_FAST_START === "true" || process.env.DISABLE_BACKGROUND_SERVICES === "true" || process.env.LOCAL_DEV === "true";
const supabaseEnvKeys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

const activeBotToken = isDevMode
  ? (process.env.SECONDARY_BOT_TOKEN || process.env.BOT_TOKEN)
  : process.env.BOT_TOKEN;

if (!activeBotToken) {
  console.error("[env] BOT_TOKEN (or SECONDARY_BOT_TOKEN in DEV_MODE) is missing. Refusing to start.");
  process.exit(1);
}

const devAllowedFeatures = (process.env.DEV_FEATURES || "bees")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

if (isDevMode) {
  console.log("=========================================================");
  console.log("🛠️  [DEV SANDBOX MODE ACTIVATED]");
  console.log("   - Running using SECONDARY_BOT_TOKEN (Zero-Downtime)");
  console.log(`   - Allowed Channel IDs: ${process.env.DEV_CHANNEL_IDS || "ALL"}`);
  console.log(`   - Active Features: ${devAllowedFeatures.join(", ")}`);
  console.log("   - Voice state, General chat & unselected features are muted");
  console.log("=========================================================");
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.DirectMessages,
  ],
  sweepers: {
    messages: {
      interval: 1800, // กวาดแคชทุก 30 นาที
      lifetime: 900,  // ลบข้อความที่เก่ากว่า 15 นาทีออกจาก RAM
    },
    threads: {
      interval: 3600, // กวาดกระทู้ทุก 1 ชั่วโมง
      lifetime: 1800, // ปล่อยกระทู้ที่ไม่ได้ใช้งานเกิน 30 นาที
    },
  },
});
client.setMaxListeners(50);

const { setupGuildFilter, getValidGuild, getAllowedGuildIds } = require("./utils/guildFilter");
setupGuildFilter(client);

const { initInteractionRouter } = require("./src/interactions/router");
initInteractionRouter(client);

setupFeature("donate", "./src/features/donate", "setupDonate", supabaseEnvKeys);
setupFeature("tarot1", "./src/features/horoscope/tarot1", "setupTarot1", supabaseEnvKeys);
setupFeature("tarot2", "./src/features/horoscope/tarot2", "setupTarot2", supabaseEnvKeys);
setupFeature("tarot3", "./src/features/horoscope/tarot3", "setupTarot3", supabaseEnvKeys);
setupFeature("tarot4", "./src/features/horoscope/tarot4", "setupTarot4", supabaseEnvKeys);
setupFeature("tarot5", "./src/features/horoscope/tarot5", "setupTarot5", supabaseEnvKeys);
setupFeature("tarot6", "./src/features/horoscope/tarot6", "setupTarot6", supabaseEnvKeys);
setupFeature("voicePoints", "./src/features/voicePoints", "setupVoicePoints");
setupFeature("checkIn", "./src/points/checkIn", "setupCheckIn", supabaseEnvKeys);
setupFeature("myPoints", "./src/points/myPoints", "setupMyPoints", supabaseEnvKeys);
setupFeature("colorRoles", "./src/commands/colorRoles", "setupColorRoles", supabaseEnvKeys);
setupFeature("totalAmount", "./src/commands/totalAmount", "setupTotalAmount");
setupFeature("createPersonalRole", "./src/commands/createPersonalRole", "setupCreatePersonalRole", supabaseEnvKeys);
setupFeature("createRentHouse", "./src/commands/createRentHouse", "setupCreateRentHouse");

if (!isLocalFastStart && process.env.DISABLE_CONTRACT_NOTIFIER !== "true") {
  setupContractNotifier(client);
} else {
  console.log("[local] ⏭️ Skipping contractNotifier (Auto DM) in Local/Dev mode.");
}

if (!isLocalFastStart && process.env.DISABLE_BROADCAST_SCHEDULER !== "true") {
  setupBroadcastScheduler(client);
} else {
  console.log("[local] ⏭️ Skipping broadcastScheduler in Local/Dev mode.");
}
setupFeature("checkRole", "./src/commands/checkRole", "setupCheckRole");
setupFeature("resetForm", "./src/commands/resetForm", "setupResetForm", supabaseEnvKeys);
setupFeature("randomQuestion", "./src/commands/randomQuestion", "setupRandomQuestion", supabaseEnvKeys);
setupFeature("giveFlower", "./src/commands/giveFlower", "setupGiveFlower", supabaseEnvKeys);
setupFeature("verification", "./src/features/verification", "setupVerification", supabaseEnvKeys);
setupFeature("healing", "./src/features/horoscope/healing", "setupHealing", supabaseEnvKeys);
setupFeature("boostNotification", "./src/features/boostNotification", "setupBoostNotification", supabaseEnvKeys);
setupFeature("stickyPanels", "./src/features/stickyPanels", "setupStickyPanels", supabaseEnvKeys);
setupFeature("bees", "./src/bees", "setupBees", supabaseEnvKeys);
setupFeature("minigames", "./src/features/minigames/minigames", "setupMinigames", supabaseEnvKeys);
setupFeature("healJai", "./src/features/healJai", "setupHealJai", supabaseEnvKeys);
setupFeature("voiceHistory", "./src/commands/voiceHistory", "setupVoiceHistory", supabaseEnvKeys);
setupFeature("security", "./src/features/security", "setupSecurity", supabaseEnvKeys);
setupFeature("cafe", "./src/features/cafe", "setupCafe");
setupFeature("guildTagNotification", "./src/features/guildTagNotification", "setupGuildTagNotification");
setupFeature("tagWarn", "./src/features/tagWarn", "setupTagWarn", supabaseEnvKeys);
setupFeature("copyCategoryPerms", "./src/commands/copyCategoryPerms", "setupCopyCategoryPerms");
setupFeature("beeGacha", "./src/features/beeGacha", "setupBeeGacha", supabaseEnvKeys);
setupFeature("dailyQuest", "./src/features/dailyQuest", "setupDailyQuest");







function setupFeature(name, modulePath, setupName, requiredEnv = []) {
  if (isDevMode && !devAllowedFeatures.includes(name)) {
    return;
  }

  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length && isLocalFastStart) {
    console.warn(`[local] Skipping ${name}; missing ${missing.join(", ")}.`);
    return;
  }

  const feature = require(modulePath);
  feature[setupName](client);
}

// ── ฟังก์ชันช่วยซิงค์สถานะห้องเสียง Point x2 ───────────────────────
function syncPointX2VoiceStatus(client) {
  try {
    const pointX2CategoryId = "1543974947561537646";
    const voiceStatusText = "<a:59217leaf:1512014878796152862> ลงห้องรับ 𝐏𝐨𝐢𝐧𝐭 𝐱𝟐 มาเลย!";
    const channels = client.channels.cache.filter((c) => c.parentId === pointX2CategoryId && c.isVoiceBased());
    let activeCount = 0;
    for (const [chId, ch] of channels) {
      const nonBotCount = ch.members ? ch.members.filter((m) => !m.user?.bot).size : 0;
      if (nonBotCount >= 2) {
        client.rest.put(`/channels/${chId}/voice-status`, { body: { status: voiceStatusText } }).catch(() => {});
        activeCount++;
      } else {
        client.rest.put(`/channels/${chId}/voice-status`, { body: { status: "" } }).catch(() => {});
      }
    }
    if (channels.size > 0) {
      console.log(`🍃 [VoiceStatus] ตรวจสอบ ${channels.size} ห้องในหมวดหมู่ Point x2 (มีสมาชิกครบ 2 คนขึ้นไป ${activeCount} ห้อง)`);
    }
  } catch (e) {
    console.error("⚠️ ตั้งค่า Voice Status เริ่มต้นไม่สำเร็จ:", e.message);
  }
}

// ── ระบบเช็กห้องสร้างในกรณีบอทดับกลางคัน (Lobby Auto-Recovery) ──────
async function recoverWaitingLobbyMembers(guild) {
  if (!guild || !config.zones || !Array.isArray(config.zones)) return;

  for (const zone of config.zones) {
    if (!zone.lobbyChannelId) continue;
    const lobbyCh = guild.channels.cache.get(zone.lobbyChannelId);
    if (!lobbyCh || !lobbyCh.isVoiceBased()) continue;

    const waitingMembers = lobbyCh.members.filter((m) => !m.user?.bot);
    if (waitingMembers.size > 0) {
      console.log(`🔄 [Recovery] พบสมาชิก ${waitingMembers.size} คนค้างในห้องสร้างโซน "${zone.name}" กำลังสร้างห้องให้...`);
      for (const [, member] of waitingMembers) {
        try {
          console.log(`➕ [Recovery] กำลังสร้างห้องให้ ${member.user?.tag || member.id} (โซน "${zone.name}")...`);
          await createRoom(guild, member, zone);
        } catch (err) {
          console.error(`❌ [Recovery] ไม่สามารถสร้างห้องให้ ${member.user?.tag || member.id}:`, err.message);
        }
      }
    }
  }
}

// ── ตอนบอท ready ──────────────────────────────────────────────────
client.once("clientReady", async () => {
  console.log(`✅ บอท "${client.user.tag}" พร้อมใช้งานแล้ว!`);

  const guild = getValidGuild(client);

  // 1. ตั้งค่าสถานะบอทเริ่มต้นทันที และตั้งเวลาอัปเดตทุก 10 นาที
  updateBotPresence(client);
  setInterval(() => updateBotPresence(client), 10 * 60 * 1000);

  // 2. ซิงค์ Voice Status สำหรับห้องเสียงในหมวดหมู่ Point x2 ทันที
  syncPointX2VoiceStatus(client);

  // 3. ลงทะเบียน Slash Commands รวมแบบ Bulk Set (เร็วขึ้น 15x) สำหรับทุกกิลด์ที่อนุญาต
  const allowedGuildIds = getAllowedGuildIds ? getAllowedGuildIds() : [guild?.id].filter(Boolean);
  for (const gId of allowedGuildIds) {
    const targetGuild = client.guilds.cache.get(gId);
    if (targetGuild) {
      registerAllGuildCommands(targetGuild).catch((err) =>
        console.error(`[slash] Bulk command registration error on "${targetGuild.name}":`, err.message)
      );
    }
  }

  // 4. โหลด separator IDs จาก Redis
  try {
    const separators = await getAllSeparators();
    for (const zone of config.zones) {
      if (separators[zone.id]) {
        zone.separatorChannelId = separators[zone.id];
        console.log(`📌 โหลด separator โซน "${zone.name}": ${separators[zone.id]}`);
      }
    }
  } catch (e) {
    console.error("⚠️ โหลด separators จาก Redis ไม่ได้:", e.message);
  }

  if (process.env.CLEAR_SLASH_COMMANDS_ON_START === "true") {
    console.warn("[slash] CLEAR_SLASH_COMMANDS_ON_START is disabled in this project to avoid wiping another bot's slash commands.");
  }

  // 5. Startup Cleanup — ลบห้องค้างจากก่อนบอทดับ & สร้างห้องให้สมาชิกที่ค้างใน Lobby
  if (isLocalFastStart) {
    console.log("[local] Skipping startup cleanup.");
  } else {
    try {
      await startupCleanup();
      if (guild) {
        await recoverWaitingLobbyMembers(guild);
      }
    } catch (e) {
      console.error("Startup cleanup/recovery failed:", e.message);
    }
  }

  // 6. เริ่ม monitor loop (ข้ามเมื่อเป็นโหมด Local/Dev)
  if (!isLocalFastStart && process.env.DISABLE_ROOM_MONITOR !== "true") {
    startMonitor(client);
  } else {
    console.log("[local] ⏭️ Skipping roomMonitor loop in Local/Dev mode.");
  }

  // 7. เริ่มต้นทำงาน Voice Log Worker ดึงประวัติจาก Redis ลง Supabase (ข้ามเมื่อเป็นโหมด Local/Dev)
  if (!isLocalFastStart && process.env.DISABLE_VOICE_WORKER !== "true") {
    startVoiceLogWorker().catch((e) => console.error("Voice Log Worker failed to start:", e.message));
  } else {
    console.log("[local] ⏭️ Skipping Voice Log Worker in Local/Dev mode.");
  }
});

// ── Startup Cleanup ────────────────────────────────────────────────
async function startupCleanup() {
  console.log("🧹 เริ่ม Startup Cleanup — ตรวจห้องค้าง...");

  try {
    const rooms = await getAllRooms();
    const roomIds = Object.keys(rooms);

    if (roomIds.length === 0) {
      console.log("✅ ไม่มีห้องค้าง");
    }

    let deletedCount = 0;

    for (const [channelId] of Object.entries(rooms)) {
      // หาห้องใน guild ทุกอัน
      const channel = client.channels.cache.get(channelId);

      if (!channel) {
        // ห้องถูกลบไปแล้ว (ลบ manual ระหว่างบอทดับ) — ลบออกจาก Redis
        const { deleteRoom } = require("./state/redisClient");
        await deleteRoom(channelId);
        console.log(`🗑️ ลบ ${channelId} ออกจาก Redis (ไม่พบ channel)`);
        deletedCount++;
        continue;
      }

      // ถ้าห้องว่าง → ลบทันทีเลย ไม่รอ 2 นาที
      if (channel.members.size === 0) {
        console.log(`🗑️ ลบห้องค้าง "${channel.name}"`);
        await destroyRoom(channel.guild, channelId);
        deletedCount++;
      } else {
        console.log(`✅ "${channel.name}" — มีคนอยู่ ${channel.members.size} คน ไม่ลบ`);
      }
    }

    console.log(`🧹 Cleanup เสร็จ — ลบ ${deletedCount} ห้อง`);

    // sync separator ทุกโซนหลัง cleanup
    const remainingRooms = await getAllRooms();

    // หา guild แรกที่บอทอยู่ (ที่ไม่ถูกปฏิเสธ)
    const guild = getValidGuild(client);
    if (guild) {
      await syncAllSeparators(guild, remainingRooms, { immediate: true });
    }

  } catch (e) {
    console.error("❌ Startup Cleanup error:", e.message);
  }
}

// ── จับ event เข้า/ออกห้อง Voice ─────────────────────────────────
client.on("voiceStateUpdate", (oldState, newState) => {
  if (isDevMode) return;
  voiceStateUpdate.execute(oldState, newState).catch(console.error);
});

client.on("messageCreate", async (message) => {
  if (isDevMode) return;
  const handledRent = await handleRentHousePanelMessage(message).catch(console.error);
  if (handledRent) return;
  handleRoomPanel(message).catch(console.error);
});

client.on("interactionCreate", async (interaction) => {
  if (isDevMode) return;
  const handledRoom = await handleRoomPanelInteraction(interaction).catch(console.error);
  if (handledRoom) return;
  await handleRentHousePanelInteraction(interaction).catch(console.error);
});

// ── อัปเดตสถานะเมื่อสมาชิกเข้า/ออกจาก Guild ───────────────────────
client.on("guildMemberAdd", (member) => {
  const guildId = process.env.GUILD_ID || "1144251788493602848";
  if (member.guild.id === guildId) {
    updateBotPresence(client);
  }
});

client.on("guildMemberRemove", (member) => {
  const guildId = process.env.GUILD_ID || "1144251788493602848";
  if (member.guild.id === guildId) {
    updateBotPresence(client);
  }
});

const port = process.env.PORT || 8000;

const healthServer = http
  .createServer((req, res) => {
    // Set CORS headers
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "*");
    res.setHeader("Access-Control-Allow-Private-Network", "true");

    if (req.method === "OPTIONS") {
      res.writeHead(204);
      res.end();
      return;
    }

    if (req.url === "/health") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ ok: true }));
      return;
    }

    if (req.url.startsWith("/api/lootlabs-postback")) {
      const { handleLootLabsPostback } = require("./src/features/adReward/lootlabsWebhook");
      let supabase = null;
      if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
        const { createClient } = require("@supabase/supabase-js");
        supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
          { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
        );
      }
      handleLootLabsPostback(req, res, supabase, client);
      return;
    }

    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Bear Cafe bot is running");
  });

healthServer.on("error", (err) => {
  if (err.code === "EADDRINUSE") {
    console.warn(`[health] Port ${port} is already in use. Skipping health server.`);
  } else {
    console.error("[health] Server error:", err.message);
  }
});

healthServer.listen(Number(port), "0.0.0.0", () => {
  console.log(`Health server listening on port ${port}`);
});



// ── อัปเดตสถานะบอท Streaming ──────────────────────────────────────────
async function updateBotPresence(client) {
  try {
    const guild = getValidGuild(client);

    if (!guild) {
      console.warn(`[presence] No guilds found in client cache yet.`);
      return;
    }

    const memberCount = guild.memberCount;
    const formattedCount = memberCount.toLocaleString();
    client.user.setPresence({
      activities: [{
        name: `นั่งเลี้ยงลูกหมี ${formattedCount} ตัว`,
        type: ActivityType.Streaming,
        url: "https://www.twitch.tv/bearcafe"
      }]
    });
    console.log(`[presence] Updated presence: นั่งเลี้ยงลูกหมี ${formattedCount} ตัว`);
  } catch (err) {
    console.error("[presence] Failed to update presence:", err.message);
  }
}

// ── Error handling ─────────────────────────────────────────────────
client.on("error", (e) => console.error("Discord client error:", e));
process.on("unhandledRejection", (e) => console.error("Unhandled rejection:", e));

// ── Login ──────────────────────────────────────────────────────────
client.login(activeBotToken);

// ── Graceful Shutdown (คืน Port 3000 และตัด Gateway สวยงามเมื่อรีสตาร์ต) ──
let isShuttingDown = false;
async function gracefulShutdown(signal) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  console.log(`\n🛑 [MainBot] ได้รับสัญญาณ ${signal} กำลังปิดระบบอย่างปลอดภัย...`);

  try {
    if (healthServer && healthServer.listening) {
      console.log(`🔌 [MainBot] กำลังปิด Health Server (คืน Port ${port})...`);
      await new Promise((resolve) => healthServer.close(resolve));
      console.log(`✅ [MainBot] ปิด Health Server คืน Port สำเร็จ`);
    }

    console.log("🔌 [MainBot] กำลังตัดการเชื่อมต่อ Discord Client...");
    await client.destroy();
    console.log("👋 [MainBot] ปิดโปรเซสบอทหลักอย่างสมบูรณ์");
  } catch (err) {
    console.error("❌ [MainBot] Shutdown error:", err.message);
  } finally {
    process.exit(0);
  }
}

process.on("SIGINT", () => gracefulShutdown("SIGINT"));
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
