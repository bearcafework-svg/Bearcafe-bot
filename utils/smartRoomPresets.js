const { createClient } = require("@supabase/supabase-js");

const TABLE = "smart_room_presets";

let supabase;

function getSupabase() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return null;
  }

  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );
  }

  return supabase;
}

function normalizePresetSettings(settings = {}) {
  const limit = Number.isInteger(settings.limit) && settings.limit >= 0 && settings.limit <= 99
    ? settings.limit
    : undefined;
  const name = typeof settings.name === "string" && settings.name.trim()
    ? settings.name.trim().slice(0, 100)
    : undefined;

  return {
    locked: Boolean(settings.locked),
    hidden: Boolean(settings.hidden),
    trustedUserIds: Array.isArray(settings.trustedUserIds) ? settings.trustedUserIds : [],
    blockedUserIds: Array.isArray(settings.blockedUserIds) ? settings.blockedUserIds : [],
    ...(limit !== undefined ? { limit } : {}),
    ...(name ? { name } : {}),
  };
}

function rowToSettings(row) {
  if (!row) return null;

  return normalizePresetSettings({
    locked: row.locked,
    hidden: row.hidden,
    trustedUserIds: row.trusted_user_ids,
    blockedUserIds: row.blocked_user_ids,
    limit: row.user_limit,
    name: row.room_name,
  });
}

function settingsToRow(ownerId, zoneId, settings) {
  const normalized = normalizePresetSettings(settings);

  return {
    owner_id: ownerId,
    zone_id: zoneId,
    room_name: normalized.name || null,
    user_limit: Number.isInteger(normalized.limit) ? normalized.limit : null,
    locked: normalized.locked,
    hidden: normalized.hidden,
    trusted_user_ids: normalized.trustedUserIds,
    blocked_user_ids: normalized.blockedUserIds,
    updated_at: new Date().toISOString(),
  };
}

async function getSmartRoomPreset(ownerId, zoneId) {
  const client = getSupabase();
  if (!client) return null;

  const { data, error } = await client
    .from(TABLE)
    .select("room_name,user_limit,locked,hidden,trusted_user_ids,blocked_user_ids")
    .eq("owner_id", ownerId)
    .eq("zone_id", zoneId)
    .maybeSingle();

  if (error) {
    console.error(`[smartRoomPresets] load failed (${ownerId}/${zoneId}):`, error.message);
    return null;
  }

  return rowToSettings(data);
}

async function saveSmartRoomPreset(ownerId, zoneId, settings) {
  const client = getSupabase();
  if (!client) return false;

  const { error } = await client
    .from(TABLE)
    .upsert(
      settingsToRow(ownerId, zoneId, settings),
      { onConflict: "owner_id,zone_id" }
    );

  if (error) {
    console.error(`[smartRoomPresets] save failed (${ownerId}/${zoneId}):`, error.message);
    return false;
  }

  return true;
}

module.exports = {
  getSmartRoomPreset,
  normalizePresetSettings,
  saveSmartRoomPreset,
};
