// src/features/rentHouse/services/rentHouseService.js
// Database Access & Discord Permission Overwrite Services for Rent House System

const { PermissionFlagsBits } = require("discord.js");
const { createClient } = require("@supabase/supabase-js");

const MEMBER_ROLE_ID = "1144700895020462200";
const RENT_HOUSE_CATEGORY_ID = "1524122689604816986";

let supabaseClient = null;

function getSupabase() {
  if (!supabaseClient && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return supabaseClient;
}

const MEMBER_ALLOW_PERMISSIONS = [
  PermissionFlagsBits.ViewChannel,
  PermissionFlagsBits.Speak,
  PermissionFlagsBits.Stream,
  PermissionFlagsBits.UseVAD,
  PermissionFlagsBits.SendMessages,
  PermissionFlagsBits.ReadMessageHistory,
  PermissionFlagsBits.UseSoundboard,
  PermissionFlagsBits.UseApplicationCommands,
  PermissionFlagsBits.AddReactions,
  PermissionFlagsBits.EmbedLinks,
  PermissionFlagsBits.AttachFiles,
  PermissionFlagsBits.UseExternalEmojis,
  PermissionFlagsBits.UseExternalStickers,
  PermissionFlagsBits.SendVoiceMessages,
];

/**
 * ตรวจสอบสิทธิ์เจ้าของห้องบ้านเช่า
 */
async function isRentHouseOwner(channel, userId) {
  if (!channel || channel.parentId !== RENT_HOUSE_CATEGORY_ID) return false;

  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data: setting } = await supabase
        .from("rent_house_settings")
        .select("owner_id")
        .eq("channel_id", channel.id)
        .maybeSingle();

      if (setting) {
        return setting.owner_id === userId;
      }

      const { data: contracts } = await supabase
        .from("contracts")
        .select("member_id")
        .eq("type", "house")
        .ilike("room_link", `%${channel.id}%`)
        .limit(1);

      if (contracts && contracts.length > 0) {
        return contracts[0].member_id === userId;
      }
    } catch (e) {
      console.error("[rentHouseService] Error checking rent house owner:", e.message);
    }
  }

  const ow = channel.permissionOverwrites.cache.get(userId);
  if (ow && (ow.allow.has(PermissionFlagsBits.MuteMembers) || ow.allow.has(PermissionFlagsBits.MoveMembers))) return true;

  return false;
}

/**
 * ดึงข้อมูลสัญญาเช่าจาก Supabase
 */
async function getRentHouseContract(channelId) {
  const supabase = getSupabase();
  if (!supabase) return { success: false, error: "ไม่สามารถเชื่อมต่อฐานข้อมูล Supabase ได้ในขณะนี้" };

  try {
    const { data: contracts, error } = await supabase
      .from("contracts")
      .select("*")
      .eq("type", "house")
      .ilike("room_link", `%${channelId}%`)
      .order("created_at", { ascending: false })
      .limit(1);

    if (error) throw error;
    if (!contracts || contracts.length === 0) {
      return { success: true, contract: null };
    }

    return { success: true, contract: contracts[0] };
  } catch (err) {
    console.error("[rentHouseService] Error fetching contract info:", err.message);
    return { success: false, error: err.message };
  }
}

/**
 * ซิงค์ Permission Overwrites บน Discord ให้ตรงตามข้อมูลใน Supabase (rent_house_settings)
 */
async function syncRentHousePermissions(channel, setting = null) {
  if (!channel) return;

  const supabase = getSupabase();
  let currentSetting = setting;

  if (!currentSetting && supabase) {
    try {
      const { data } = await supabase
        .from("rent_house_settings")
        .select("*")
        .eq("channel_id", channel.id)
        .maybeSingle();
      currentSetting = data;
    } catch (e) {
      console.error("[rentHouseService] Error loading setting for sync:", e.message);
    }
  }

  const memberRole = channel.guild.roles.cache.get(MEMBER_ROLE_ID) || MEMBER_ROLE_ID;
  const isHidden = !!currentSetting?.hidden;
  const isLocked = !!currentSetting?.locked;

  // 1. กำหนดสิทธิ์ให้ยศสมาชิกหลัก
  const deniedPermissions = [
    ...(isHidden ? [PermissionFlagsBits.ViewChannel] : []),
    ...(isLocked ? [PermissionFlagsBits.Connect] : []),
  ];

  const editOptions = {};
  for (const perm of MEMBER_ALLOW_PERMISSIONS) {
    const key = Object.keys(PermissionFlagsBits).find((k) => PermissionFlagsBits[k] === perm);
    if (key) {
      editOptions[key] = !deniedPermissions.includes(perm);
    }
  }
  await channel.permissionOverwrites.edit(memberRole, editOptions).catch(() => {});

  // 2. ซิงค์สิทธิ์รายบุคคลสำหรับ Trusted Users (trusted_user_ids)
  const trustedIds = new Set(currentSetting?.trusted_user_ids || []);
  for (const tId of trustedIds) {
    await channel.permissionOverwrites.edit(tId, {
      ViewChannel: true,
      Connect: true,
      Speak: true,
      Stream: true,
      SendMessages: true,
      ReadMessageHistory: true,
    }).catch(() => {});
  }
}

/**
 * สลับสถานะล็อคห้อง
 */
async function toggleRentHouseLock(channel, ownerId) {
  const supabase = getSupabase();
  let currentSetting = null;
  if (supabase) {
    const { data } = await supabase
      .from("rent_house_settings")
      .select("*")
      .eq("channel_id", channel.id)
      .maybeSingle();
    currentSetting = data;
  }

  const roleOverwrite = channel.permissionOverwrites.cache.get(MEMBER_ROLE_ID);
  const isCurrentlyLocked = currentSetting ? !!currentSetting.locked : (roleOverwrite?.deny.has(PermissionFlagsBits.Connect) ?? false);
  const willLock = !isCurrentlyLocked;

  const newSetting = {
    channel_id: channel.id,
    owner_id: currentSetting?.owner_id || ownerId,
    locked: willLock,
    hidden: currentSetting?.hidden || false,
    trusted_user_ids: currentSetting?.trusted_user_ids || [],
    updated_at: new Date().toISOString(),
  };

  if (supabase) {
    await supabase.from("rent_house_settings").upsert(newSetting);
  }

  await syncRentHousePermissions(channel, newSetting);
  return willLock;
}

/**
 * สลับสถานะซ่อนห้อง
 */
async function toggleRentHouseHide(channel, ownerId) {
  const supabase = getSupabase();
  let currentSetting = null;
  if (supabase) {
    const { data } = await supabase
      .from("rent_house_settings")
      .select("*")
      .eq("channel_id", channel.id)
      .maybeSingle();
    currentSetting = data;
  }

  const roleOverwrite = channel.permissionOverwrites.cache.get(MEMBER_ROLE_ID);
  const isCurrentlyHidden = currentSetting ? !!currentSetting.hidden : (roleOverwrite?.deny.has(PermissionFlagsBits.ViewChannel) ?? false);
  const willHide = !isCurrentlyHidden;

  const newSetting = {
    channel_id: channel.id,
    owner_id: currentSetting?.owner_id || ownerId,
    locked: currentSetting?.locked || false,
    hidden: willHide,
    trusted_user_ids: currentSetting?.trusted_user_ids || [],
    updated_at: new Date().toISOString(),
  };

  if (supabase) {
    await supabase.from("rent_house_settings").upsert(newSetting);
  }

  await syncRentHousePermissions(channel, newSetting);
  return willHide;
}

/**
 * ดึงข้อมูลการตั้งค่าและสมาชิกที่ได้รับสิทธิ์พิเศษ
 */
async function getRentHousePermissionsInfo(channel) {
  const supabase = getSupabase();
  let setting = null;
  if (supabase) {
    const { data } = await supabase
      .from("rent_house_settings")
      .select("*")
      .eq("channel_id", channel.id)
      .maybeSingle();
    setting = data;
  }
  return setting;
}

/**
 * จัดการ User Select (Trust, Untrust, Kick)
 */
async function processRentUserSelect(channel, ownerId, customId, targetUserIds, guild) {
  const supabase = getSupabase();
  let currentSetting = null;
  if (supabase) {
    const { data } = await supabase
      .from("rent_house_settings")
      .select("*")
      .eq("channel_id", channel.id)
      .maybeSingle();
    currentSetting = data;
  }

  let trustedSet = new Set(currentSetting?.trusted_user_ids || []);
  const kickedNames = [];
  const processedNames = [];

  for (const userId of targetUserIds) {
    const userMention = `<@${userId}>`;
    processedNames.push(userMention);

    if (customId.includes("trust") && !customId.includes("untrust")) {
      trustedSet.add(userId);
    } else if (customId.includes("untrust")) {
      trustedSet.delete(userId);
    } else if (customId.includes("kick")) {
      trustedSet.delete(userId);
      const member = guild.members.cache.get(userId);
      if (member && member.voice.channelId === channel.id) {
        await member.voice.disconnect("Kicked by rent house owner").catch(() => {});
        kickedNames.push(userMention);
      }
    }
  }

  const updatedSetting = {
    channel_id: channel.id,
    owner_id: currentSetting?.owner_id || ownerId,
    locked: currentSetting?.locked || false,
    hidden: currentSetting?.hidden || false,
    trusted_user_ids: Array.from(trustedSet),
    updated_at: new Date().toISOString(),
  };

  if (supabase) {
    await supabase.from("rent_house_settings").upsert(updatedSetting);
  }

  await syncRentHousePermissions(channel, updatedSetting);

  return {
    processedNames: processedNames.join(", "),
    kickedNames
  };
}

module.exports = {
  MEMBER_ROLE_ID,
  RENT_HOUSE_CATEGORY_ID,
  isRentHouseOwner,
  getRentHouseContract,
  syncRentHousePermissions,
  toggleRentHouseLock,
  toggleRentHouseHide,
  getRentHousePermissionsInfo,
  processRentUserSelect
};
