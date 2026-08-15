// ===================================================
// src/features/security/backupManager.js — ระบบ Backup & Restore โครงสร้างเซิร์ฟเวอร์
// ===================================================

const { createClient } = require("@supabase/supabase-js");
const { ChannelType, PermissionFlagsBits } = require("discord.js");
const { getAllRooms } = require("../../../state/redisClient");
const config = require("../../../config");
const logger = require("../../../utils/logger");

let supabase;
function getSupabase() {
  if (!supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    );
  }
  return supabase;
}

/**
 * ดึงข้อมูลห้องถาวร Categories และ Roles สำหรับ Backup
 */
async function serializeGuildStructure(guild) {
  // ดึงห้องชั่วคราวจาก Redis เพื่อยกเว้น
  let activeTempRoomIds = [];
  try {
    const tempRoomsMap = await getAllRooms();
    if (tempRoomsMap) {
      activeTempRoomIds = Object.keys(tempRoomsMap);
    }
  } catch (err) {
    logger.warn(`[backupManager] Failed to get active temp rooms from Redis: ${err.message}`);
  }

  // ดึง Channels ทั้งหมดใน Guild
  const channels = await guild.channels.fetch();
  const roles = await guild.roles.fetch();

  // 1. คัดกรองเฉพาะ Categories ถาวร
  const categoriesData = [];
  // 2. คัดกรองเฉพาะ Channels ถาวร
  const channelsData = [];

  // ระบุ Category ล็อบบี้สร้างห้องชั่วคราวเพื่อเว้นห้องลูกของมัน
  const tempRoomCategoryId = config.roomsCategoryId;

  channels.forEach((ch) => {
    if (!ch) return;

    // ข้ามห้องชั่วคราวที่ถูกสร้างจากบอท
    if (activeTempRoomIds.includes(ch.id)) return;
    if (ch.parentId === tempRoomCategoryId && ch.type === ChannelType.GuildVoice) {
      // ข้าม voice room ที่สร้างใน temp category ยกเว้น lobbyChannelId
      const isLobbyChannel = config.zones && config.zones.some(z => z.lobbyChannelId === ch.id);
      if (!isLobbyChannel) return;
    }

    const overwrites = ch.permissionOverwrites.cache.map((ow) => ({
      id: ow.id,
      type: ow.type, // 0: Role, 1: Member
      allow: ow.allow.bitfield.toString(),
      deny: ow.deny.bitfield.toString(),
    }));

    if (ch.type === ChannelType.GuildCategory) {
      categoriesData.push({
        id: ch.id,
        name: ch.name,
        position: ch.position,
        permissionOverwrites: overwrites,
      });
    } else {
      // ตรวจหา Special Channel Tag
      let specialType = null;
      if (config.zones) {
        const zoneLobby = config.zones.find(z => z.lobbyChannelId === ch.id);
        if (zoneLobby) specialType = `LOBBY_${zoneLobby.id.toUpperCase()}`;
      }
      if (ch.id === process.env.VERIFY_CHANNEL_ID || ch.id === "1524124097448116477") {
        specialType = "VERIFICATION_CHANNEL";
      }

      channelsData.push({
        id: ch.id,
        name: ch.name,
        type: ch.type,
        topic: ch.topic || null,
        bitrate: ch.bitrate || null,
        userLimit: ch.userLimit || null,
        parentId: ch.parentId || null,
        categoryName: ch.parent ? ch.parent.name : null,
        position: ch.position,
        permissionOverwrites: overwrites,
        specialType,
      });
    }
  });

  // คัดกรอง Roles ถาวร (ยกเว้น @everyone และ Managed Roles ของบอท)
  const rolesData = roles
    .filter((r) => !r.managed && r.id !== guild.id)
    .map((r) => ({
      id: r.id,
      name: r.name,
      color: r.color,
      hoist: r.hoist,
      position: r.position,
      permissions: r.permissions.bitfield.toString(),
      mentionable: r.mentionable,
    }));

  return {
    categories: categoriesData.sort((a, b) => a.position - b.position),
    channels: channelsData.sort((a, b) => a.position - b.position),
    roles: rolesData.sort((a, b) => a.position - b.position),
    specialChannels: channelsData
      .filter((c) => c.specialType)
      .map((c) => ({ id: c.id, specialType: c.specialType, name: c.name })),
  };
}

/**
 * บันทึก Backup ลง Supabase
 */
async function saveBackupToSupabase(guildId, backupName, createdBy, data) {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase is not configured.");
  const { data: result, error } = await sb
    .from("guild_structure_backups")
    .insert({
      guild_id: guildId,
      backup_name: backupName || "Manual Backup",
      created_by: createdBy,
      categories: data.categories,
      channels: data.channels,
      roles: data.roles,
      special_channels: data.specialChannels,
    })
    .select("id, backup_name, created_at")
    .single();

  if (error) {
    logger.error(`[backupManager] Error saving backup to Supabase: ${error.message}`);
    throw error;
  }
  return result;
}

/**
 * ดึงรายการ Backup ทั้งหมดใน Guild จาก Supabase
 */
async function listBackupsFromSupabase(guildId) {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase is not configured.");
  const { data, error } = await sb
    .from("guild_structure_backups")
    .select("id, backup_name, created_by, created_at, categories, channels, roles")
    .eq("guild_id", guildId)
    .order("created_at", { ascending: false })
    .limit(10);

  if (error) {
    logger.error(`[backupManager] Error fetching backup list: ${error.message}`);
    throw error;
  }

  return (data || []).map((b) => ({
    id: b.id,
    name: b.backup_name,
    createdBy: b.created_by,
    createdAt: b.created_at,
    categoryCount: Array.isArray(b.categories) ? b.categories.length : 0,
    channelCount: Array.isArray(b.channels) ? b.channels.length : 0,
    roleCount: Array.isArray(b.roles) ? b.roles.length : 0,
  }));
}

/**
 * Restore โครงสร้างเซิร์ฟเวอร์จาก Backup ID
 */
async function restoreGuildStructure(guild, backupId) {
  const sb = getSupabase();
  if (!sb) throw new Error("Supabase is not configured.");
  const { data: backup, error } = await sb
    .from("guild_structure_backups")
    .select("*")
    .eq("id", backupId)
    .single();

  if (error || !backup) {
    throw new Error(`Backup not found with ID: ${backupId}`);
  }

  const { categories, channels, roles } = backup;
  const channelIdMap = new Map(); // oldId -> newId
  const roleIdMap = new Map(); // oldId -> newId

  // 1. Restore Roles
  const existingRoles = await guild.roles.fetch();
  for (const rData of roles) {
    let existingRole = existingRoles.find((r) => r.name === rData.name);
    if (!existingRole) {
      try {
        existingRole = await guild.roles.create({
          name: rData.name,
          color: rData.color,
          hoist: rData.hoist,
          permissions: BigInt(rData.permissions),
          mentionable: rData.mentionable,
          reason: "[Security Restore] Restoring missing role",
        });
      } catch (e) {
        logger.warn(`[restore] Failed to recreate role ${rData.name}: ${e.message}`);
        continue;
      }
    }
    roleIdMap.set(rData.id, existingRole.id);
  }

  // 2. Restore Categories
  const existingChannels = await guild.channels.fetch();
  const categoryIdMap = new Map(); // oldCatId -> newCatInstance

  for (const catData of categories) {
    let catChannel = existingChannels.find(
      (c) => c && c.type === ChannelType.GuildCategory && c.name === catData.name
    );
    if (!catChannel) {
      try {
        catChannel = await guild.channels.create({
          name: catData.name,
          type: ChannelType.GuildCategory,
          position: catData.position,
          reason: "[Security Restore] Restoring missing category",
        });
      } catch (e) {
        logger.warn(`[restore] Failed to recreate category ${catData.name}: ${e.message}`);
        continue;
      }
    }
    categoryIdMap.set(catData.id, catChannel);
  }

  // 3. Restore Channels
  for (const chData of channels) {
    let channelInstance = existingChannels.find(
      (c) => c && c.name === chData.name && c.type === chData.type
    );

    let parentCategory = null;
    if (chData.parentId && categoryIdMap.has(chData.parentId)) {
      parentCategory = categoryIdMap.get(chData.parentId);
    } else if (chData.categoryName) {
      parentCategory = existingChannels.find(
        (c) => c && c.type === ChannelType.GuildCategory && c.name === chData.categoryName
      );
    }

    if (!channelInstance) {
      try {
        const createOptions = {
          name: chData.name,
          type: chData.type,
          parent: parentCategory ? parentCategory.id : null,
          position: chData.position,
          reason: "[Security Restore] Restoring missing channel",
        };
        if (chData.topic) createOptions.topic = chData.topic;
        if (chData.bitrate && chData.type === ChannelType.GuildVoice) createOptions.bitrate = chData.bitrate;
        if (chData.userLimit && chData.type === ChannelType.GuildVoice) createOptions.userLimit = chData.userLimit;

        channelInstance = await guild.channels.create(createOptions);
      } catch (e) {
        logger.warn(`[restore] Failed to recreate channel ${chData.name}: ${e.message}`);
        continue;
      }
    }

    // Set permission overwrites
    if (chData.permissionOverwrites && Array.isArray(chData.permissionOverwrites)) {
      const formattedOverwrites = chData.permissionOverwrites.map((ow) => {
        const targetId = roleIdMap.get(ow.id) || ow.id;
        return {
          id: targetId,
          type: ow.type,
          allow: BigInt(ow.allow),
          deny: BigInt(ow.deny),
        };
      });
      try {
        await channelInstance.permissionOverwrites.set(
          formattedOverwrites,
          "[Security Restore] Restoring permission overwrites"
        );
      } catch (e) {
        logger.warn(`[restore] Failed setting overwrites for ${chData.name}: ${e.message}`);
      }
    }

    channelIdMap.set(chData.id, channelInstance.id);
  }

  logger.info(`[restore] Guild structure restored successfully from Backup ID: ${backupId}`);

  return {
    backupName: backup.backup_name,
    restoredCategories: categoryIdMap.size,
    restoredChannels: channelIdMap.size,
    restoredRoles: roleIdMap.size,
    channelIdMap: Object.fromEntries(channelIdMap),
  };
}

module.exports = {
  serializeGuildStructure,
  saveBackupToSupabase,
  listBackupsFromSupabase,
  restoreGuildStructure,
};
