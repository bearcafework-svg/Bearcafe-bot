// ===================================================
// src/main/services/supabaseEnvGuard.js
// 🛡️ Global Supabase 2 Enforcer & Environment Sanitizer
// บังคับให้ทุกการเชื่อมต่อชี้ไปยัง Supabase 2 (fqzhcpzxdlnvhvlqspgc) อย่างเบ็ดเสร็จ
// ป้องกันการรั่วไหลไปยัง Supabase 1 เก่า (orbxyyjpvpbqwfssnyeq หรือ itulsrbsluwdqwakldjs)
// ===================================================

const SUPA2_URL = "https://fqzhcpzxdlnvhvlqspgc.supabase.co";
const SUPA2_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxemhjcHp4ZGxudmh2bHFzcGdjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzQwNDgyMywiZXhwIjoyMTAyOTgwODIzfQ.N8GIvPiAQ-hojMjOUGrF8IOdSd2E2XUql-90BR1e00U";
const SUPA2_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxemhjcHp4ZGxudmh2bHFzcGdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0MDQ4MjMsImV4cCI6MjEwMjk4MDgyM30._CJYD8aH-KWAlohbPRWj6yDw-YV43Ev3hSAmTY_UFa0";

const LEGACY_HOSTS = ["orbxyyjpvpbqwfssnyeq", "itulsrbsluwdqwakldjs"];

function isLegacyOrEmpty(val) {
  if (!val || typeof val !== "string" || val.trim().length === 0) return true;
  return LEGACY_HOSTS.some((legacy) => val.includes(legacy));
}

function enforceSupabase2Env() {
  let intercepted = false;

  // 1. SUPABASE_URL & SERVICE_ROLE_KEY (Main legacy env vars)
  if (isLegacyOrEmpty(process.env.SUPABASE_URL)) {
    console.warn(`[SupabaseGuard] 🛡️ Intercepted legacy/missing SUPABASE_URL (${process.env.SUPABASE_URL || 'EMPTY'}). Locked to Supabase 2.`);
    process.env.SUPABASE_URL = SUPA2_URL;
    intercepted = true;
  }
  if (isLegacyOrEmpty(process.env.SUPABASE_SERVICE_ROLE_KEY) || (process.env.SUPABASE_SERVICE_ROLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY.length < 50)) {
    process.env.SUPABASE_SERVICE_ROLE_KEY = SUPA2_SERVICE_KEY;
    intercepted = true;
  }
  if (!process.env.SUPABASE_ANON_KEY || isLegacyOrEmpty(process.env.SUPABASE_ANON_KEY)) {
    process.env.SUPABASE_ANON_KEY = SUPA2_ANON_KEY;
  }

  // 2. POINTS_SUPABASE_URL & KEYS
  if (isLegacyOrEmpty(process.env.POINTS_SUPABASE_URL)) {
    process.env.POINTS_SUPABASE_URL = SUPA2_URL;
    process.env.POINTS_SUPABASE_SERVICE_ROLE_KEY = SUPA2_SERVICE_KEY;
    process.env.POINTS_SUPABASE_ANON_KEY = SUPA2_ANON_KEY;
    intercepted = true;
  }

  // 3. KUMA_SUPABASE_URL & KEYS
  if (isLegacyOrEmpty(process.env.KUMA_SUPABASE_URL)) {
    process.env.KUMA_SUPABASE_URL = SUPA2_URL;
    process.env.KUMA_SUPABASE_SERVICE_ROLE_KEY = SUPA2_SERVICE_KEY;
    intercepted = true;
  }

  // 4. HEALJAI_SUPABASE_URL & KEYS
  if (isLegacyOrEmpty(process.env.HEALJAI_SUPABASE_URL)) {
    process.env.HEALJAI_SUPABASE_URL = SUPA2_URL;
    process.env.HEALJAI_SUPABASE_SERVICE_ROLE_KEY = SUPA2_SERVICE_KEY;
    intercepted = true;
  }

  // 5. Functions & Webhooks
  if (isLegacyOrEmpty(process.env.VOICE_POINTS_URL)) {
    process.env.VOICE_POINTS_URL = `${SUPA2_URL}/functions/v1/voice-activity-points`;
  }
  if (isLegacyOrEmpty(process.env.WEBHOOK_URL)) {
    process.env.WEBHOOK_URL = `${SUPA2_URL}/functions/v1/discord-voice-webhook`;
  }

  // 6. Global fetch runtime interceptor (Level 2 Deep Packet Rewrite)
  const originalFetch = globalThis.fetch;
  if (originalFetch && !globalThis._supabaseFetchGuarded) {
    globalThis._supabaseFetchGuarded = true;
    globalThis.fetch = async function guardedFetch(input, init) {
      try {
        let urlStr = typeof input === "string" ? input : (input instanceof URL ? input.toString() : input?.url || "");
        if (LEGACY_HOSTS.some((legacy) => urlStr.includes(legacy))) {
          const rewritten = urlStr
            .replace("orbxyyjpvpbqwfssnyeq.supabase.co", "fqzhcpzxdlnvhvlqspgc.supabase.co")
            .replace("itulsrbsluwdqwakldjs.supabase.co", "fqzhcpzxdlnvhvlqspgc.supabase.co");
          console.warn(`[SupabaseGuard] 🛡️ Intercepted outgoing HTTP fetch to legacy Supabase 1! Auto-rerouted to Supabase 2 (${rewritten})`);
          if (typeof input === "string") {
            input = rewritten;
          } else if (input instanceof URL) {
            input = new URL(rewritten);
          } else if (input && typeof input === "object" && input.url) {
            input = new Request(rewritten, input);
          }
        }
      } catch (err) {
        // Fallback safely if url parsing fails
      }
      return originalFetch(input, init);
    };
  }

  return { intercepted, supa2Url: SUPA2_URL };
}

// Auto-run immediately upon require
const guardStatus = enforceSupabase2Env();

module.exports = {
  enforceSupabase2Env,
  SUPA2_URL,
  SUPA2_SERVICE_KEY,
  SUPA2_ANON_KEY,
  guardStatus,
};
