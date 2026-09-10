// src/services/sessionAdsService.js
// Service สำหรับสุ่มดึงข้อมูลโฆษณาจาก session_ads และปุ่ม Global CTA จาก site_settings

const { getSupabaseClient } = require("./supabaseClient");

let cachedSessionAds = null;
let lastSessionAdsFetch = 0;
let cachedGlobalCta = null;
let lastGlobalCtaFetch = 0;

/**
 * สุ่มดึงข้อมูลโฆษณาที่เปิดใช้งานจากตาราง session_ads
 */
async function getRandomSessionAd() {
  try {
    const now = Date.now();
    if (!cachedSessionAds || now - lastSessionAdsFetch > 60000) {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase
          .from("session_ads")
          .select("*")
          .eq("is_active", true);
        if (!error && data) {
          cachedSessionAds = data;
          lastSessionAdsFetch = now;
        }
      }
    }
    if (cachedSessionAds && cachedSessionAds.length > 0) {
      return cachedSessionAds[Math.floor(Math.random() * cachedSessionAds.length)];
    }
  } catch (err) {
    console.error("[sessionAdsService] Failed to fetch session_ads:", err.message);
  }
  return null;
}

/**
 * ดึงปุ่ม Global CTA จากตาราง site_settings (key: global_cta_buttons)
 */
async function getGlobalCtaButton() {
  try {
    const now = Date.now();
    if (!cachedGlobalCta || now - lastGlobalCtaFetch > 60000) {
      const supabase = getSupabaseClient();
      if (supabase) {
        const { data, error } = await supabase
          .from("site_settings")
          .select("value")
          .eq("key", "global_cta_buttons")
          .maybeSingle();
        if (!error && data?.value) {
          cachedGlobalCta = data.value;
          lastGlobalCtaFetch = now;
        }
      }
    }
    if (Array.isArray(cachedGlobalCta)) {
      const activeBtn = cachedGlobalCta.find((b) => b.is_active !== false);
      if (activeBtn) {
        return {
          type: 2,
          style: activeBtn.style || 5,
          url: activeBtn.url,
          label: activeBtn.label,
          ...(activeBtn.emoji ? { emoji: activeBtn.emoji } : {}),
        };
      }
    }
  } catch (err) {
    console.error("[sessionAdsService] Failed to fetch global_cta_buttons:", err.message);
  }
  return {
    type: 2,
    style: 5,
    url: "https://discord.com/channels/1144251788493602848/1524124418261913820",
    label: "︲สนใจลงโฆษณา",
    emoji: {
      id: "1339965135967621151",
      name: "7958yellowheart",
      animated: true,
    },
  };
}

module.exports = {
  getRandomSessionAd,
  getGlobalCtaButton,
};
