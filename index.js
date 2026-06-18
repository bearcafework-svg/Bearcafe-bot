// ===================================================
// index.js — จุดเริ่มต้นของบอท
// ===================================================

require("dotenv").config();

const http = require("http");
const { Client, GatewayIntentBits, REST, Routes } = require("discord.js");
const { startMonitor } = require("./handlers/roomMonitor");
const { destroyRoom } = require("./handlers/roomDestroyer");
const { handleRoomPanel, handleRoomPanelInteraction } = require("./handlers/roomPanel");
const voiceStateUpdate = require("./events/voiceStateUpdate");
const { getAllRooms, getAllSeparators } = require("./state/redisClient");
const { syncAllSeparators } = require("./utils/separatorManager");
const config = require("./config");

const isLocalFastStart = process.env.LOCAL_FAST_START === "true";
const supabaseEnvKeys = ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"];

if (!process.env.BOT_TOKEN && process.env.DISCORD_TOKEN) {
  process.env.BOT_TOKEN = process.env.DISCORD_TOKEN;
  console.warn("[env] Using DISCORD_TOKEN as BOT_TOKEN fallback. Please rename it to BOT_TOKEN before Koyeb deploy.");
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

setupFeature("secretChat", "./src/features/secretChat", "setupSecretChat", supabaseEnvKeys);
setupFeature("donate", "./src/features/donate", "setupDonate", supabaseEnvKeys);
setupFeature("tarot1", "./src/features/horoscope/tarot1", "setupTarot1", supabaseEnvKeys);
setupFeature("tarot2", "./src/features/horoscope/tarot2", "setupTarot2", supabaseEnvKeys);
setupFeature("tarot3", "./src/features/horoscope/tarot3", "setupTarot3", supabaseEnvKeys);
setupFeature("tarot4", "./src/features/horoscope/tarot4", "setupTarot4", supabaseEnvKeys);
setupFeature("tarot5", "./src/features/horoscope/tarot5", "setupTarot5", supabaseEnvKeys);
setupFeature("tarot6", "./src/features/horoscope/tarot6", "setupTarot6", supabaseEnvKeys);
setupFeature("voicePoints", "./src/features/voicePoints", "setupVoicePoints");

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
    await registerCommands();
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

if (process.env.PORT) {
  http
    .createServer((req, res) => {
      if (req.url === "/health") {
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("Bear Cafe bot is running");
    })
    .listen(Number(process.env.PORT), () => {
      console.log(`Health server listening on port ${process.env.PORT}`);
    });
}

// ── Register Slash Commands ────────────────────────────────────────
async function registerCommands() {
  const commands = [];

  const rest = new REST().setToken(process.env.BOT_TOKEN);

  try {
    await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
    console.log("✅ ล้าง Slash commands เก่าแล้ว");
  } catch (e) {
    console.error("❌ Register commands ไม่ได้:", e.message);
  }
}

// ── Error handling ─────────────────────────────────────────────────
client.on("error", (e) => console.error("Discord client error:", e));
process.on("unhandledRejection", (e) => console.error("Unhandled rejection:", e));

// ── Login ──────────────────────────────────────────────────────────
client.login(process.env.BOT_TOKEN);
