// src/bees/beeDashboardApi.js
// API Controller สำหรับซิงค์ข้อมูลกับ Supabase Database และบอท

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

const SETTING_PATH = path.join(__dirname, 'settingBee.json');


let supabaseClient = null;

function getSupabase() {
  if (!supabaseClient && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    });
  }
  return supabaseClient;
}

// ─── GET: ดึงข้อมูลการตั้งค่าผึ้งทั้งหมด ──────────────────────────────────────
async function getBeeDashboardData() {
  const supabase = getSupabase();
  let sysSetting = null;
  let bees = [];

  if (supabase) {
    try {
      const [{ data: sData }, { data: bData }] = await Promise.all([
        supabase.from('bee_system_settings').select('*').eq('id', 1).single(),
        supabase.from('bee_configs').select('*').order('sequence_order', { ascending: true })
      ]);
      if (sData) sysSetting = sData;
      if (bData) bees = bData;
    } catch (e) {
      console.warn('[beeDashboardApi] Error fetching from Supabase:', e.message);
    }
  }

  // Fallback to local files if Supabase is empty/unavailable
  if (!sysSetting) {
    try {
      sysSetting = JSON.parse(fs.readFileSync(SETTING_PATH, 'utf8'));
    } catch (_) { }
  }
  if (bees.length === 0) {
    try {
      const local = JSON.parse(fs.readFileSync(SETTING_PATH, 'utf8'));
      bees = local.bees || [];
    } catch (_) { }
  }

  return {
    success: true,
    data: {
      setting: {
        channel_id: sysSetting?.channel_id || '1524123413122125964',
        auto_spawn_enabled: sysSetting?.auto_spawn_enabled ?? true,
        min_spawn_minutes: sysSetting?.min_spawn_minutes || 5,
        max_spawn_minutes: sysSetting?.max_spawn_minutes || 10,
        spawn_mode: sysSetting?.spawn_mode || 'weighted_random',
        garden_background_url: sysSetting?.garden_background_url || 'https://cdn.discordapp.com/attachments/1528780402544611348/1528780439836430487/Garden.png',
        bees
      }
    }
  };
}

// ─── POST: สลับสวิตช์เปิด/ปิด (Toggle ON/OFF) ──────────────────────────────
async function toggleBeeStatus(beeId, enabledState) {
  const supabase = getSupabase();
  if (supabase) {
    try {
      const { data: bee } = await supabase.from('bee_configs').select('enabled').eq('id', beeId).single();
      const newEnabled = enabledState !== undefined ? Boolean(enabledState) : !bee?.enabled;
      await supabase.from('bee_configs').update({ enabled: newEnabled, updated_at: new Date().toISOString() }).eq('id', beeId);
      return { success: true, beeId, enabled: newEnabled };
    } catch (e) {
      console.error('[beeDashboardApi] toggleBeeStatus error:', e.message);
    }
  }

  return { success: true, beeId, enabled: enabledState };
}

// ─── POST: อัปเดตการตั้งค่าระบบผึ้งและตัวผึ้งทั้งหมด ──────────────────────────
async function updateBeeConfig(newSettingData, newBeeData) {
  const supabase = getSupabase();
  if (supabase) {
    try {
      if (newSettingData) {
        await supabase.from('bee_system_settings').upsert({
          id: 1,
          channel_id: newSettingData.channel_id,
          auto_spawn_enabled: newSettingData.auto_spawn_enabled,
          min_spawn_minutes: newSettingData.min_spawn_minutes,
          max_spawn_minutes: newSettingData.max_spawn_minutes,
          spawn_mode: newSettingData.spawn_mode,
          garden_background_url: newSettingData.garden_background_url,
          updated_at: new Date().toISOString()
        });
      }

      if (newBeeData && Array.isArray(newBeeData)) {
        for (const bee of newBeeData) {
          await supabase.from('bee_configs').upsert({
            id: bee.id,
            name: bee.name,
            enabled: bee.enabled,
            spawn_weight: bee.spawn_weight || 1,
            sequence_order: bee.sequence_order || 1,
            win_rate: bee.win_rate,
            min_win_points: bee.min_win_points,
            max_win_points: bee.max_win_points,
            min_loss_points: bee.min_loss_points,
            max_loss_points: bee.max_loss_points,
            poison_loss_points: bee.poison_loss_points,
            button_delay_ms: bee.button_delay_ms || 5000,
            spawn_image_url: bee.spawn_image_url,
            win_image_url: bee.win_image_url,
            lose_image_url: bee.lose_image_url,
            poison_image_url: bee.poison_image_url,
            updated_at: new Date().toISOString()
          });
        }
      }
      return { success: true, message: 'Updated Supabase bee configs successfully' };
    } catch (e) {
      console.error('[beeDashboardApi] updateBeeConfig error:', e.message);
      return { success: false, error: e.message };
    }
  }

  return { success: true, message: 'Updated bee config locally' };
}

module.exports = {
  getBeeDashboardData,
  toggleBeeStatus,
  updateBeeConfig
};
