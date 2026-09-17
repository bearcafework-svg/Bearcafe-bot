// ===================================================
// src/features/healJai/services/consentService.js
// เซอร์วิสจัดการบันทึกและตรวจสอบความยินยอมของผู้ใช้งาน (HealJai Consent Service)
// ===================================================

const fs = require("fs");
const path = require("path");

const LOCAL_CONSENT_CACHE_PATH = path.join(__dirname, "../../../../data/heal_jai_consents_cache.json");

/**
 * บันทึกลง Local JSON Fallback เผื่อ Supabase Egress หรือ Network ขัดข้อง
 */
function recordLocalConsentFallback(record) {
  try {
    const dir = path.dirname(LOCAL_CONSENT_CACHE_PATH);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    let list = [];
    if (fs.existsSync(LOCAL_CONSENT_CACHE_PATH)) {
      list = JSON.parse(fs.readFileSync(LOCAL_CONSENT_CACHE_PATH, "utf8"));
    }
    list.push(record);
    fs.writeFileSync(LOCAL_CONSENT_CACHE_PATH, JSON.stringify(list, null, 2), "utf8");
  } catch (err) {
    console.error("[consentService] Failed to write local fallback:", err.message);
  }
}

/**
 * บันทึกความยินยอมของผู้ใช้ลงฐานข้อมูล
 * @param {import('@supabase/supabase-js').SupabaseClient|null} supabase 
 * @param {object} param0
 * @param {string} param0.guildId
 * @param {string} param0.userId
 * @param {string} [param0.version='v1.0']
 * @param {boolean} [param0.roleAssigned=true]
 * @param {object} [param0.metadata={}]
 * @returns {Promise<{ success: boolean, data?: any, error?: any }>}
 */
async function recordUserConsent(supabase, { guildId, userId, version = "v1.0", roleAssigned = true, metadata = {} }) {
  const timestamp = new Date().toISOString();
  const consentRecord = {
    guild_id: guildId,
    user_id: userId,
    version,
    consent_type: "agreement",
    role_assigned: roleAssigned,
    accepted_at: timestamp,
    metadata,
  };

  // 1. บันทึกลง Supabase หากเชื่อมต่ออยู่
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("heal_jai_consents")
        .insert(consentRecord)
        .select();

      if (error) {
        console.warn("[consentService] Supabase insert warning:", error.message);
        recordLocalConsentFallback(consentRecord);
        return { success: true, fallback: true, error };
      }

      return { success: true, data };
    } catch (err) {
      console.error("[consentService] Supabase exception:", err.message);
      recordLocalConsentFallback(consentRecord);
      return { success: true, fallback: true, error: err.message };
    }
  }

  // 2. ถ้าไม่มี Supabase ให้บันทึกลง Local Cache
  recordLocalConsentFallback(consentRecord);
  return { success: true, fallback: true };
}

module.exports = {
  recordUserConsent,
};
