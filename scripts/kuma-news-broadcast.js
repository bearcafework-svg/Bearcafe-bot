/**
 * scripts/kuma-news-broadcast.js
 * 
 * สคริปต์บรอดแคสต์ข่าวสาร/อัปเดต Kuma Bot ส่งตรงหา Owner ทีละเซิร์ฟเวอร์
 * - รองรับ JSON Discohook Component V2 ("flags": 32768)
 * - Auto Sanitizer: ตัด custom_id ออกหากไม่ใช่ปุ่มลิงก์ (style !== 5)
 * - แท็กเฉพาะเจ้าของเซิร์ฟเวอร์ (<@ownerId>)
 * - Pacing & Queue: ส่งทีละเซิร์ฟเวอร์ เว้นช่วง 3-5 วินาที
 * - Idempotency: บันทึกประวัติลง Supabase (kuma_news_deliveries) กันส่งซ้ำ
 */

require("dotenv").config();
const fs = require("fs");
const path = require("path");
const { Client, GatewayIntentBits, ChannelType, PermissionFlagsBits } = require("discord.js");
const { createClient } = require("@supabase/supabase-js");

// 1. ตรวจสอบการตั้งค่า Environment Variables
const token = process.env.DISCORD_TOKEN_KUMA || process.env.KUMA_BOT_TOKEN || process.env.DISCORD_TOKEN;
if (!token) {
  console.error("❌ ไม่พบ DISCORD_TOKEN_KUMA หรือ KUMA_BOT_TOKEN ใน .env");
  process.exit(1);
}

const supabaseUrl = process.env.KUMA_SUPABASE_URL || process.env.SUPABASE_URL;
const supabaseKey = process.env.KUMA_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

// 2. โหลดไฟล์ JSON Payload
const payloadFilePath = path.join(__dirname, "broadcast-payload.json");
if (!fs.existsSync(payloadFilePath)) {
  console.error(`❌ ไม่พบไฟล์ Payload ที่: ${payloadFilePath}`);
  process.exit(1);
}

// รับ Argument สำหรับโหมดทดสอบ หรือระบุ guildId เจาะจง
// ตัวอย่าง: node scripts/kuma-news-broadcast.js --guild=1234567890 หรือ --test
const args = process.argv.slice(2);
let targetGuildIdArg = null;
let isDryRun = false;

for (const arg of args) {
  if (arg.startsWith("--guild=")) {
    targetGuildIdArg = arg.split("=")[1].trim();
  } else if (arg === "--dry-run") {
    isDryRun = true;
  }
}

let rawPayloadConfig;
try {
  rawPayloadConfig = JSON.parse(fs.readFileSync(payloadFilePath, "utf-8"));
} catch (err) {
  console.error("❌ ไม่สามารถแปลงไฟล์ broadcast-payload.json ได้ (Invalid JSON):", err.message);
  process.exit(1);
}

const CAMPAIGN_KEY = rawPayloadConfig.campaign_key || "kuma_news_default";

/**
 * ฟังก์ชันทำความสะอาด Payload (Sanitizer)
 * - ตัด custom_id ออกหาก Component นั้นเป็นปุ่มที่ไม่ใช่ Link Button (style !== 5)
 * - คืนโครงสร้างที่ปลอดภัยต่อ Discord API
 */
function sanitizeComponent(comp) {
  if (!comp || typeof comp !== "object") return comp;
  const clone = { ...comp };

  // Component Type 2 คือ Button
  if (clone.type === 2) {
    if (clone.style !== 5) {
      delete clone.custom_id;
      delete clone.customId;
    }
  }

  // หากมี components ย่อย ให้ recursively sanitize
  if (Array.isArray(clone.components)) {
    clone.components = clone.components.map(sanitizeComponent);
  }

  return clone;
}

function sanitizePayload(payload) {
  const cloned = JSON.parse(JSON.stringify(payload));
  if (Array.isArray(cloned.components)) {
    cloned.components = cloned.components.map(sanitizeComponent);
  }
  return cloned;
}

/**
 * แทรกแท็ก Owner ลงในเนื้อหาข้อความ หรือข้อความส่วนหัว
 */
function interpolateOwner(payload, ownerId) {
  const ownerMention = ownerId ? `<@${ownerId}>` : "เจ้าของเซิร์ฟเวอร์";
  const jsonStr = JSON.stringify(payload);
  const replacedStr = jsonStr
    .replace(/\{owner\}/g, ownerMention)
    .replace(/\{owner_mention\}/g, ownerMention)
    .replace(/\{owner_id\}/g, ownerId || "");
  return JSON.parse(replacedStr);
}

/**
 * ค้นหาห้องที่เหมาะสมที่สุดสำหรับส่งข้อความ
 * System Channel -> คุยเล่น (general/chat) -> ห้องแรกที่บอทส่งได้
 */
async function findBestChannel(guild, botMember) {
  const baseRequiredPerms = [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
  ];

  // 1. ตรวจสอบ System Channel ก่อน
  if (guild.systemChannel) {
    const perms = guild.systemChannel.permissionsFor(botMember);
    if (perms && perms.has(baseRequiredPerms)) {
      return guild.systemChannel;
    }
  }

  // 2. ดึงแคชช่องทั้งหมด
  await guild.channels.fetch().catch(() => {});

  const textChannels = guild.channels.cache.filter(
    (c) =>
      c.type === ChannelType.GuildText &&
      c.permissionsFor(botMember)?.has(baseRequiredPerms)
  );

  if (!textChannels || textChannels.size === 0) {
    return null;
  }

  const preferredKeywords = [
    "general",
    "พูดคุย",
    "คุยเล่น",
    "ห้องแชท",
    "แชท",
    "chat",
    "main",
    "lobby",
    "welcome",
    "ต้อนรับ",
    "bot",
    "บอท",
  ];

  for (const keyword of preferredKeywords) {
    const matched = textChannels.find((c) =>
      c.name.toLowerCase().includes(keyword)
    );
    if (matched) return matched;
  }

  return textChannels.first() || null;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 3. เริ่มต้น Client
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once("clientReady", async () => {
  console.log("=================================================");
  console.log(`🐻 Kuma News Broadcast Script`);
  console.log(`🤖 Logged in as: ${client.user.tag} (ID: ${client.user.id})`);
  console.log(`📢 Campaign Key: ${CAMPAIGN_KEY}`);
  if (targetGuildIdArg) {
    console.log(`🎯 [Test Mode] ล็อกเป้าหมายเฉพาะ Guild ID: ${targetGuildIdArg}`);
  }
  if (isDryRun) {
    console.log(`🔍 [Dry Run] โหมดจำลอง ไม่มีการส่งข้อความจริงเข้า Discord`);
  }
  console.log("=================================================");

  try {
    // ดึงเซิร์ฟเวอร์ทั้งหมดที่บอทอยู่
    let guilds = Array.from(client.guilds.cache.values());
    console.log(`📊 พบเซิร์ฟเวอร์ทั้งหมดที่บอทสถิตอยู่: ${guilds.length} เซิร์ฟเวอร์`);

    // หากมีการระบุ targetGuildIdArg ให้กรองเฉพาะเซิร์ฟเวอร์นั้น
    if (targetGuildIdArg) {
      guilds = guilds.filter((g) => g.id === targetGuildIdArg);
      if (guilds.length === 0) {
        console.error(`❌ ไม่พบเซิร์ฟเวอร์ ID: ${targetGuildIdArg} ที่บอทสถิตอยู่ กรุณาตรวจสอบว่าบอทอยู่ในเซิร์ฟเวอร์นี้แล้วหรือไม่`);
        process.exit(1);
      }
    }

    // ดึงรายการเซิร์ฟเวอร์ที่เคยส่งไปแล้วใน Campaign นี้ (ข้ามการเช็คถ้าเป็นโหมดเทสเจาะจง guild)
    let deliveredGuildIds = new Set();
    if (supabase && !targetGuildIdArg) {
      const { data, error } = await supabase
        .from("kuma_news_deliveries")
        .select("guild_id")
        .eq("campaign_key", CAMPAIGN_KEY);

      if (!error && Array.isArray(data)) {
        deliveredGuildIds = new Set(data.map((r) => r.guild_id));
        console.log(`🛡️ พบเซิร์ฟเวอร์ที่เคยส่งไปแล้ว: ${deliveredGuildIds.size} เซิร์ฟเวอร์ (จะถูกข้ามอัตโนมัติ)`);
      }
    } else if (!targetGuildIdArg) {
      console.warn("⚠️ ไม่พบการเชื่อมต่อ Supabase ประวัติการส่งจะไม่ถูกบันทึกเพื่อกันส่งซ้ำ");
    }

    const pendingGuilds = targetGuildIdArg
      ? guilds
      : guilds.filter((g) => !deliveredGuildIds.has(g.id));

    console.log(`🚀 กำลังจะเริ่มส่งให้กับ: ${pendingGuilds.length} เซิร์ฟเวอร์...`);
    console.log("-------------------------------------------------");

    let successCount = 0;
    let failedCount = 0;
    let skippedCount = 0;

    for (let i = 0; i < pendingGuilds.length; i++) {
      const guild = pendingGuilds[i];
      const indexStr = `[${i + 1}/${pendingGuilds.length}]`;

      try {
        const botMember = guild.members.me || (await guild.members.fetchMe().catch(() => null));
        if (!botMember) {
          console.warn(`${indexStr} ⚠️ ไม่สามารถดึง botMember ใน ${guild.name} (${guild.id}) ข้าม`);
          skippedCount++;
          continue;
        }

        const targetChannel = await findBestChannel(guild, botMember);
        if (!targetChannel) {
          console.warn(`${indexStr} ⚠️ ไม่พบห้องข้อความที่ส่งได้ใน ${guild.name} (${guild.id}) ข้าม`);
          skippedCount++;
          continue;
        }

        // เตรียม Payload ที่ Sanitize และแทรก Owner
        const sanitized = sanitizePayload(rawPayloadConfig);
        delete sanitized.campaign_key;
        const finalPayload = interpolateOwner(sanitized, guild.ownerId);

        // ส่งข้อความเข้า Discord Channel
        if (isDryRun) {
          console.log(`${indexStr} 🔍 [Dry Run] ตรวจพบห้อง #${targetChannel.name} ใน ${guild.name} (ข้ามการส่งจริง)`);
          successCount++;
        } else {
          await targetChannel.send(finalPayload);
          console.log(`${indexStr} ✅ ส่งข่าวสารเข้า #${targetChannel.name} ใน ${guild.name} สำเร็จ! (Owner: ${guild.ownerId || "N/A"})`);
          successCount++;

          // บันทึกสถานะลง Supabase (เฉพาะเมื่อไม่ได้อยู่ในโหมดเทสเจาะจง guild)
          if (supabase && !targetGuildIdArg) {
            await supabase.from("kuma_news_deliveries").upsert(
              {
                campaign_key: CAMPAIGN_KEY,
                guild_id: guild.id,
                guild_name: guild.name,
                owner_id: guild.ownerId || null,
                channel_id: targetChannel.id,
                channel_name: targetChannel.name,
                sent_at: new Date().toISOString(),
              },
              { onConflict: "campaign_key,guild_id" }
            ).catch((e) => console.warn(`   ⚠️ บันทึก Supabase ไม่สำเร็จ: ${e.message}`));
          }
        }
      } catch (sendErr) {
        console.error(`${indexStr} ❌ ส่งไม่สำเร็จสำหรับ ${guild.name}:`, sendErr.message);
        failedCount++;
      }

      // เว้นระยะหน่วง 3.5 วินาที เพื่อความปลอดภัยและหลีกเลี่ยง Rate Limit
      if (i < pendingGuilds.length - 1) {
        await sleep(3500);
      }
    }

    console.log("=================================================");
    console.log("🏁 สรุปผลการส่งข่าวสาร:");
    console.log(`   ✅ สำเร็จ: ${successCount} เซิร์ฟเวอร์`);
    console.log(`   ⚠️ ข้าม: ${skippedCount} เซิร์ฟเวอร์`);
    console.log(`   ❌ ล้มเหลว: ${failedCount} เซิร์ฟเวอร์`);
    console.log("=================================================");
  } catch (err) {
    console.error("❌ เกิดข้อผิดพลาดร้ายแรงในสคริปต์:", err);
  } finally {
    client.destroy();
    process.exit(0);
  }
});

client.login(token);
