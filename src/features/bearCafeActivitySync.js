// ===================================================
// src/features/bearCafeActivitySync.js
// ระบบติดตามและซิงค์ห้องเสียงที่กำลังเอคทีฟของ Bear Cafe (GUILDID: 1144251788493602848)
// อภิสิทธิ์เฉพาะเซิร์ฟเวอร์หลัก Bear Cafe โดยใช้บอทหลัก
// ===================================================

const { Client, GatewayIntentBits } = require("discord.js");
const { createClient } = require("@supabase/supabase-js");

const BEARCAFE_GUILD_ID = process.env.GUILD_ID || "1144251788493602848";
const SYNC_INTERVAL_MS = 60 * 1000; // ซิงค์อัตโนมัติทุก 1 นาที

let isSyncing = false;
let syncTimeout = null;
let fallbackBotClient = null;

/**
 * ฟังก์ชันหลักในการรวบรวมห้องเสียงที่กำลังเอคทีฟและบันทึกลง Supabase
 * @param {import('discord.js').Guild} guild
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
async function syncBearCafeLiveVoice(guild, supabase) {
  if (!guild || !supabase || isSyncing) return;
  isSyncing = true;

  try {
    const activeRooms = [];
    let totalInVoice = 0;

    guild.channels.cache.forEach((channel) => {
      if (channel.isVoiceBased()) {
        const nonBotMembers = channel.members.filter((m) => !m.user?.bot);
        const count = nonBotMembers.size;

        if (count > 0) {
          totalInVoice += count;

          // เก็บข้อมูลสมาชิกที่อยู่ในห้อง (จำกัดสูงสุด 15 คนต่อห้อง เพื่อไม่ให้ payload ใหญ่เกินไป)
          const membersList = nonBotMembers.first(15).map((m) => ({
            id: m.id,
            name: m.displayName || m.user.username,
            avatar: m.user.displayAvatarURL({ size: 64, forceStatic: false }),
            streaming: Boolean(m.voice?.streaming),
            activity: m.presence?.activities?.[0]?.name || null,
          }));

          activeRooms.push({
            id: channel.id,
            name: channel.name,
            category: channel.parent?.name || "ห้องเสียงทั่วไป",
            count,
            members: membersList,
          });
        }
      }
    });

    // เรียงลำดับห้องที่มีคนอยู่มากที่สุดขึ้นก่อน
    activeRooms.sort((a, b) => b.count - a.count);

    // ดึง server_profile เดิมเพื่อทำการ merge ข้อมูล
    const { data: currentData } = await supabase
      .from("discord_servers")
      .select("server_profile")
      .eq("discord_id", BEARCAFE_GUILD_ID)
      .maybeSingle();

    const existingProfile = currentData?.server_profile || {};
    const updatedProfile = {
      ...existingProfile,
      active_voice_count: totalInVoice,
      active_voice_rooms_count: activeRooms.length,
      active_voice_rooms: activeRooms,
      active_voice_updated_at: new Date().toISOString(),
    };

    const { error: updateErr } = await supabase
      .from("discord_servers")
      .update({
        live_voice_count: totalInVoice,
        server_profile: updatedProfile,
        activity_synced_at: new Date().toISOString(),
      })
      .eq("discord_id", BEARCAFE_GUILD_ID);

    if (updateErr) {
      console.warn("[bearCafeActivitySync] Failed to update discord_servers:", updateErr.message);
    } else {
      console.log(
        `📡 [bearCafeActivitySync] ซิงค์ข้อมูลเสียง Bear Cafe สำเร็จ: ${totalInVoice} คนใน ${activeRooms.length} ห้อง`
      );
    }
  } catch (err) {
    console.error("[bearCafeActivitySync] Error syncing live voice:", err.message);
  } finally {
    isSyncing = false;
  }
}

/**
 * เรียกซิงค์แบบ Debounce (ป้องกันการยิงถี่เกินไปเมื่อมีคนเข้า/ออกห้องเสียงรัว ๆ)
 */
function debouncedTriggerSync(guild, supabase, delayMs = 15000) {
  if (syncTimeout) clearTimeout(syncTimeout);
  syncTimeout = setTimeout(() => {
    syncBearCafeLiveVoice(guild, supabase);
  }, delayMs);
}

/**
 * ติดตั้งระบบ Voice Activity Sync สำหรับ Bear Cafe
 * @param {import('discord.js').Client} client
 */
function setupBearCafeActivitySync(client) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.warn("⚠️ [bearCafeActivitySync] ขาด SUPABASE_URL หรือ SUPABASE_SERVICE_ROLE_KEY ระบบจะไม่ทำงาน");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });

  console.log("[bearCafeActivitySync] 🎙️ Initializing Bear Cafe Live Voice Sync service...");

  const startTrackingWithGuild = (guild) => {
    // 1. ซิงค์ครั้งแรกทันที
    syncBearCafeLiveVoice(guild, supabase);

    // 2. ตั้งเวลา Periodic Sync ทุก 60 วินาที
    setInterval(() => {
      syncBearCafeLiveVoice(guild, supabase);
    }, SYNC_INTERVAL_MS);

    // 3. ดักจับเหตุการณ์ Voice State Update ใน Bear Cafe
    guild.client.on("voiceStateUpdate", (oldState, newState) => {
      const g = newState.guild || oldState.guild;
      if (g && g.id === BEARCAFE_GUILD_ID) {
        if (oldState.channelId !== newState.channelId) {
          debouncedTriggerSync(guild, supabase, 12000);
        }
      }
    });
  };

  // ตรวจสอบว่า client ที่รันอยู่มีกิลด์ Bear Cafe หรือไม่
  const existingGuild = client.guilds.cache.get(BEARCAFE_GUILD_ID);
  if (existingGuild) {
    startTrackingWithGuild(existingGuild);
    return;
  }

  // หากไม่มี (เช่น ใน DEV_MODE ที่บอทหลักรันด้วย SECONDARY_BOT_TOKEN / HealJai token)
  // ให้ใช้ BOT_TOKEN เพื่อเชื่อมต่อ Bear Cafe โดยเฉพาะ
  if (process.env.BOT_TOKEN && process.env.BOT_TOKEN !== client.token) {
    console.log("[bearCafeActivitySync] Client does not have Bear Cafe guild, starting dedicated Main Bot watcher...");
    fallbackBotClient = new Client({
      intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildPresences,
      ],
    });

    fallbackBotClient.once("ready", () => {
      const guild = fallbackBotClient.guilds.cache.get(BEARCAFE_GUILD_ID);
      if (guild) {
        console.log(`[bearCafeActivitySync] Dedicated Main Bot watcher connected to ${guild.name}`);
        startTrackingWithGuild(guild);
      } else {
        console.warn(`[bearCafeActivitySync] Guild ${BEARCAFE_GUILD_ID} not found on Main Bot client`);
      }
    });

    fallbackBotClient.login(process.env.BOT_TOKEN).catch((err) => {
      console.error("[bearCafeActivitySync] Failed to login dedicated Main Bot client:", err.message);
    });
    return;
  }

  // รอจนกว่า client จะพร้อม (ready event)
  client.once("ready", () => {
    const guild = client.guilds.cache.get(BEARCAFE_GUILD_ID);
    if (guild) {
      startTrackingWithGuild(guild);
    }
  });
}

module.exports = {
  setupBearCafeActivitySync,
  syncBearCafeLiveVoice,
};
