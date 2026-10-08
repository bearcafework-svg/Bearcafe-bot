// ===================================================
// src/akari/services/tenantSyncService.js
// ระบบซิงค์ข้อมูลกิลด์/เซิร์ฟเวอร์ Multi-Tenant ของ Kuma Bot เข้าสู่ Supabase
// สถาปัตยกรรมแบบ Zero-Bottleneck:
//  - อ่านจาก RAM Cache 100% ไม่ยิง REST API หา Discord ป้องกัน Rate Limit (429)
//  - Batch Upsert ก้อนเดียว ประหยัด DB Connection / Egress
//  - In-Memory Dirty Checking: ข้ามการเขียนหากข้อมูลไม่มีการเปลี่ยนแปลง
// ===================================================

const { isExcludedGuild } = require("../filters/guildIgnoreFilter");

const SYNC_INTERVAL_MS = 30 * 60 * 1000; // ทุก 30 นาที

// In-Memory Dirty Cache สำหรับตรวจจับการเปลี่ยนแปลง
const lastSyncedCache = new Map();

/**
 * ซิงค์ข้อมูลเซิร์ฟเวอร์ทั้งหมดที่บอทสถิตอยู่เข้าสู่ tenant_configs แบบ Batch
 * @param {import('discord.js').Client} client
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
async function syncAllTenants(client, supabase) {
  if (!supabase || !client?.guilds?.cache) return;

  try {
    // 1. ดึงกิลด์ทั้งหมดที่บอทอยู่ (ไม่รวมกิลด์ที่ถูกยกเว้น เช่น กิลด์หลัก Bear Cafe)
    const activeGuilds = client.guilds.cache.filter((g) => !isExcludedGuild(g.id));
    if (activeGuilds.size === 0) return;

    // 2. ดึงข้อมูลกิลด์ที่มีอยู่ใน DB ปัจจุบัน เพื่อรักษา plan และ expires_at เดิม
    const { data: existingConfigs, error: fetchErr } = await supabase
      .from("tenant_configs")
      .select("guild_id, plan, expires_at, status");

    if (fetchErr) {
      console.warn("⚠️ [KumaBot:TenantSync] ดึงข้อมูล tenant_configs ไม่สำเร็จ:", fetchErr.message);
    }

    const existingMap = new Map();
    if (existingConfigs) {
      for (const item of existingConfigs) {
        existingMap.set(item.guild_id, item);
      }
    }

    const nowIso = new Date().toISOString();
    const rowsToUpsert = [];
    let skippedCount = 0;

    // 3. วนลูปอ่านข้อมูลจาก RAM Cache ของ Discord.js (0 REST Requests)
    for (const [guildId, guild] of activeGuilds) {
      const name = guild.name || `Server ${guildId}`;
      const iconUrl = guild.iconURL({ dynamic: true, size: 128 }) || null;
      const memberCount = Number(guild.memberCount) || 0;
      const ownerId = guild.ownerId || null;
      const ownerMember = ownerId ? guild.members.cache.get(ownerId) : null;
      const ownerName = ownerMember?.user?.tag || ownerMember?.user?.username || null;

      // ตรวจสอบ Dirty Cache: ถ้าข้อมูลเหมือนเดิมทุกประการ ให้ข้ามการเขียนลง DB
      const cacheKey = `${name}|${iconUrl}|${memberCount}|${ownerId}|${ownerName}`;
      const prevKey = lastSyncedCache.get(guildId);
      if (prevKey === cacheKey && existingMap.has(guildId) && existingMap.get(guildId)?.status === "active") {
        skippedCount++;
        continue;
      }

      const existing = existingMap.get(guildId);
      const row = {
        guild_id: guildId,
        guild_name: name,
        icon_url: iconUrl,
        member_count: memberCount,
        owner_id: ownerId,
        owner_name: ownerName,
        status: "active",
        plan: existing?.plan || "standard",
        expires_at: existing?.expires_at || null,
        updated_at: nowIso,
      };

      if (!existing) {
        row.created_at = nowIso;
      }

      rowsToUpsert.push(row);
      lastSyncedCache.set(guildId, cacheKey);
    }

    // 4. Batch Upsert เข้า tenant_configs ก้อนเดียว
    if (rowsToUpsert.length > 0) {
      const { error: upsertErr } = await supabase
        .from("tenant_configs")
        .upsert(rowsToUpsert, { onConflict: "guild_id" });

      if (upsertErr) {
        console.error("❌ [KumaBot:TenantSync] Batch upsert tenant_configs ล้มเหลว:", upsertErr.message);
      } else {
        console.log(`⚡ [KumaBot:TenantSync] ซิงค์สำเร็จ ${rowsToUpsert.length} เซิร์ฟเวอร์ (ข้ามที่ไม่เปลี่ยน ${skippedCount} รายการ)`);
      }
    }

    // 5. ซิงค์ชื่อห้องใน tenant_minigame_channels สำหรับห้องที่มีอยู่ในกิลด์
    try {
      const { data: channels } = await supabase
        .from("tenant_minigame_channels")
        .select("id, guild_id, channel_id, channel_name");

      if (channels && channels.length > 0) {
        const channelUpdates = [];
        for (const ch of channels) {
          const guild = activeGuilds.get(ch.guild_id);
          if (!guild) continue;
          const discordChannel = guild.channels.cache.get(ch.channel_id);
          if (discordChannel && discordChannel.name && discordChannel.name !== ch.channel_name) {
            channelUpdates.push({
              id: ch.id,
              guild_id: ch.guild_id,
              channel_id: ch.channel_id,
              channel_name: discordChannel.name,
            });
          }
        }

        if (channelUpdates.length > 0) {
          await supabase
            .from("tenant_minigame_channels")
            .upsert(channelUpdates, { onConflict: "id" });
        }
      }
    } catch (chErr) {
      // ข้ามถ้าเกิดข้อผิดพลาดในการอัปเดตชื่อห้อง
    }

    // 6. ตรวจหาเซิร์ฟเวอร์ที่บอทไม่ได้อยู่อีกต่อไปแล้ว แล้วอัปเดต status = 'left'
    if (existingConfigs) {
      const leftGuildIds = [];
      for (const item of existingConfigs) {
        if (item.status === "active" && !activeGuilds.has(item.guild_id) && !isExcludedGuild(item.guild_id)) {
          leftGuildIds.push(item.guild_id);
        }
      }

      if (leftGuildIds.length > 0) {
        await supabase
          .from("tenant_configs")
          .update({ status: "left", updated_at: nowIso })
          .in("guild_id", leftGuildIds);

        console.log(`ℹ️ [KumaBot:TenantSync] ปรับสถานะเซิร์ฟเวอร์ที่บอทออกแล้ว (${leftGuildIds.length} กิลด์)`);
      }
    }
  } catch (err) {
    console.error("❌ [KumaBot:TenantSync] เกิดข้อผิดพลาดขณะซิงค์:", err.message);
  }
}

/**
 * ติดตั้งระบบ Tenant Sync อัตโนมัติ (Startup, Interval, Events)
 * @param {import('discord.js').Client} client
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
function setupTenantSync(client, supabase) {
  if (!supabase) return;

  // 1. ซิงค์เมื่อบอทออนไลน์รอบแรก (รอแคช Discord กิลด์โหลดครบ 2 วินาที)
  setTimeout(() => {
    syncAllTenants(client, supabase).catch(() => {});
  }, 2000);

  // 2. ซิงค์รอบเวลาแบบประหยัด Egress (ทุก 30 นาที)
  setInterval(() => {
    syncAllTenants(client, supabase).catch(() => {});
  }, SYNC_INTERVAL_MS);

  // 3. Event: เมื่อบอทถูกเชิญเข้าเซิร์ฟเวอร์ใหม่
  client.on("guildCreate", async (guild) => {
    if (isExcludedGuild(guild.id)) return;
    try {
      const name = guild.name || `Server ${guild.id}`;
      const iconUrl = guild.iconURL({ dynamic: true, size: 128 }) || null;
      const memberCount = Number(guild.memberCount) || 0;
      const ownerId = guild.ownerId || null;
      const ownerMember = ownerId ? guild.members.cache.get(ownerId) : null;
      const ownerName = ownerMember?.user?.tag || ownerMember?.user?.username || null;

      await supabase.from("tenant_configs").upsert(
        {
          guild_id: guild.id,
          guild_name: name,
          icon_url: iconUrl,
          member_count: memberCount,
          owner_id: ownerId,
          owner_name: ownerName,
          status: "active",
          plan: "standard",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "guild_id" }
      );
      console.log(`🎉 [KumaBot:TenantSync] ลงทะเบียนเซิร์ฟเวอร์ใหม่: ${name} (${guild.id})`);
    } catch (e) {
      console.error("⚠️ [KumaBot:TenantSync] บันทึกเซิร์ฟเวอร์ใหม่ล้มเหลว:", e.message);
    }
  });

  // 4. Event: เมื่อบอทถูกเตะออกจากเซิร์ฟเวอร์
  client.on("guildDelete", async (guild) => {
    if (isExcludedGuild(guild.id)) return;
    try {
      await supabase
        .from("tenant_configs")
        .update({ status: "left", updated_at: new Date().toISOString() })
        .eq("guild_id", guild.id);
      lastSyncedCache.delete(guild.id);
      console.log(`👋 [KumaBot:TenantSync] บอทออกจากเซิร์ฟเวอร์: ${guild.name || guild.id}`);
    } catch (e) {
      console.error("⚠️ [KumaBot:TenantSync] อัปเดตสถานะเซิร์ฟเวอร์ที่ออกล้มเหลว:", e.message);
    }
  });
}

module.exports = {
  setupTenantSync,
  syncAllTenants,
};
