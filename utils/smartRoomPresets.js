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

async function getSmartRoomPreset(ownerId, zoneId) {
  const client = getSupabase();
  if (!client) return null;

  const { data, error } = await client
    .from(TABLE)
    .select("settings")
    .eq("owner_id", ownerId)
    .eq("zone_id", zoneId)
    .maybeSingle();

  if (error) {
    console.error(`[smartRoomPresets] load failed (${ownerId}/${zoneId}):`, error.message);
    return null;
  }

  return data?.settings ? normalizePresetSettings(data.settings) : null;
}

async function saveSmartRoomPreset(ownerId, zoneId, settings) {
  const client = getSupabase();
  if (!client) return false;

  const { error } = await client
    .from(TABLE)
    .upsert(
      {
        owner_id: ownerId,
        zone_id: zoneId,
        settings: normalizePresetSettings(settings),
        updated_at: new Date().toISOString(),
      },
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
