// ===================================================
// index.js — จุดเริ่มต้นของบอท
// ===================================================

require("dotenv").config();

const http = require("http");
const { Client, GatewayIntentBits, ActivityType, Events } = require("discord.js");
const { startMonitor } = require("./handlers/roomMonitor");
const { destroyRoom } = require("./handlers/roomDestroyer");
const { handleRoomPanel, handleRoomPanelInteraction } = require("./handlers/roomPanel");
const voiceStateUpdate = require("./events/voiceStateUpdate");
const { getAllRooms, getAllSeparators } = require("./state/redisClient");
const { syncAllSeparators } = require("./utils/separatorManager");
const logger = require("./utils/logger");
const config = require("./config");

const isLocalFastStart = process.env.LOCAL_FAST_START === "true";
const supabaseEnvKeys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

if (!process.env.BOT_TOKEN) {
  console.error("[env] BOT_TOKEN is missing. Refusing to start so this project cannot accidentally use another bot token.");
  process.exit(1);
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
});
client.setMaxListeners(30);

setupFeature("secretChat", "./src/features/secretChat", "setupSecretChat", supabaseEnvKeys);
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
setupFeature("checkRole", "./src/commands/checkRole", "setupCheckRole");
setupFeature("verification", "./src/features/verification", "setupVerification", supabaseEnvKeys);
setupFeature("healing", "./src/features/horoscope/healing", "setupHealing", supabaseEnvKeys);
setupFeature("boostNotification", "./src/features/boostNotification", "setupBoostNotification", supabaseEnvKeys);
setupFeature("stickyPanels", "./src/features/stickyPanels", "setupStickyPanels", supabaseEnvKeys);
// setupFeature("bees", "./src/bees", "setupBees", supabaseEnvKeys); // ปิดการทำงานระบบผึ้งชั่วคราว



function setupFeature(name, modulePath, setupName, requiredEnv = []) {
  const missing = requiredEnv.filter((key) => !process.env[key]);
  if (missing.length && isLocalFastStart) {
    console.warn(`[local] Skipping ${name}; missing ${missing.join(", ")}.`);
    return;
  }

  const feature = require(modulePath);
  feature[setupName](client);
}

// ── ตอนบอท ready ──────────────────────────────────────────────────
client.once("clientReady", async () => {
  console.log(`✅ บอท "${client.user.tag}" พร้อมใช้งานแล้ว!`);

  // ตั้งค่าสถานะบอทเริ่มต้น (รอ 5 วินาทีให้ cache พร้อม) และตั้งเวลาอัปเดตทุก 10 นาที
  setTimeout(() => updateBotPresence(client), 5000);
  setInterval(() => updateBotPresence(client), 10 * 60 * 1000);

  // โหลด separator IDs จาก Redis
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

  // ── Startup Cleanup — ลบห้องค้างจากก่อนบอทดับ ─────────────────
  if (isLocalFastStart) {
    console.log("[local] Skipping startup cleanup.");
  } else {
    startupCleanup().catch((e) => console.error("Startup cleanup failed:", e.message));
  }

  // เริ่ม monitor loop
  startMonitor(client);
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

    // รอให้ guild cache โหลดก่อน
    await new Promise((r) => setTimeout(r, 2000));

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

    // หา guild แรกที่บอทอยู่
    const guild = client.guilds.cache.first();
    if (guild) {
      await syncAllSeparators(guild, remainingRooms);
    }

  } catch (e) {
    console.error("❌ Startup Cleanup error:", e.message);
  }
}

// ── จับ event เข้า/ออกห้อง Voice ─────────────────────────────────
client.on("voiceStateUpdate", (oldState, newState) => {
  voiceStateUpdate.execute(oldState, newState).catch(console.error);
});

client.on("messageCreate", async (message) => {
  handleRoomPanel(message).catch(console.error);
});

client.on("interactionCreate", async (interaction) => {
  handleRoomPanelInteraction(interaction).catch(console.error);
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
const {
  getBeeDashboardData,
  toggleBeeStatus,
  updateBeeConfig
} = require("./src/bees/beeDashboardApi");
const { spawnBee, scheduleNextAutoSpawn } = require("./src/bees/beeManager");

http
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

    // Web Dashboard API Endpoints
    if (req.url === "/api/bees" && req.method === "GET") {
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify(getBeeDashboardData()));
      return;
    }

    if (req.url === "/api/bees/toggle" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body || "{}");
          const result = toggleBeeStatus(parsed.beeId, parsed.enabled);
          scheduleNextAutoSpawn(client);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    if (req.url === "/api/bees/config" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", () => {
        try {
          const parsed = JSON.parse(body || "{}");
          const result = updateBeeConfig(parsed.setting, parsed.images);
          scheduleNextAutoSpawn(client);
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify(result));
        } catch (e) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    if (req.url === "/api/bees/spawn" && req.method === "POST") {
      let body = "";
      req.on("data", (chunk) => (body += chunk));
      req.on("end", async () => {
        try {
          const parsed = JSON.parse(body || "{}");
          const msg = await spawnBee(client, parsed.beeId);
          if (!msg) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: "ไม่สามารถส่งผึ้งลง Discord ได้ โปรดตรวจสอบ Channel ID หรือสิทธิ์การส่งข้อความของบอท" }));
            return;
          }
          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true, messageId: msg.id }));
        } catch (e) {
          res.writeHead(500, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: false, error: e.message }));
        }
      });
      return;
    }

    res.writeHead(200, { "Content-Type": "text/plain" });
    res.end("Bear Cafe bot is running");
  })
  .listen(Number(port), "0.0.0.0", () => {
    console.log(`Health server listening on port ${port}`);
  });


// ── อัปเดตสถานะบอท Streaming ──────────────────────────────────────────
async function updateBotPresence(client) {
  try {
    const guildId = process.env.GUILD_ID || "1144251788493602848";
    let guild = client.guilds.cache.get(guildId);
    if (!guild) {
      guild = client.guilds.cache.first();
    }
    
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
client.login(process.env.BOT_TOKEN);
