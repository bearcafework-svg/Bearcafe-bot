// ===================================================
// src/services/supabaseEnvGuard.js
// 🛡️ Global Supabase 2 Enforcer & Environment Sanitizer
// บังคับให้ทุกการเชื่อมต่อชี้ไปยัง Supabase 2 (fqzhcpzxdlnvhvlqspgc) อย่างเบ็ดเสร็จ
// ป้องกันการรั่วไหลไปยัง Supabase 1 เก่า (orbxyyjpvpbqwfssnyeq หรือ itulsrbsluwdqwakldjs)
// ===================================================

const SUPA2_URL = "https://fqzhcpzxdlnvhvlqspgc.supabase.co";
const SUPA2_SERVICE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxemhjcHp4ZGxudmh2bHFzcGdjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc4NzQwNDgyMywiZXhwIjoyMTAyOTgwODIzfQ.N8GIvPiAQ-hojMjOUGrF8IOdSd2E2XUql-90BR1e00U";
const SUPA2_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImZxemhjcHp4ZGxudmh2bHFzcGdjIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODc0MDQ4MjMsImV4cCI6MjEwMjk4MDgyM30._CJYD8aH-KWAlohbPRWj6yDw-YV43Ev3hSAmTY_UFa0";

const SUPA2_REF = "fqzhcpzxdlnvhvlqspgc";
const LEGACY_HOSTS = ["orbxyyjpvpbqwfssnyeq", "itulsrbsluwdqwakldjs"];

function isLegacyOrEmptyUrl(val) {
  if (!val || typeof val !== "string" || val.trim().length === 0) return true;
  return LEGACY_HOSTS.some((legacy) => val.includes(legacy)) || !val.includes(SUPA2_REF);
}

function isLegacyOrInvalidKey(token) {
  if (!token || typeof token !== "string" || token.trim().length < 50) return true;
  const trimmed = token.trim();
  if (LEGACY_HOSTS.some((legacy) => trimmed.includes(legacy))) return true;
  try {
    const parts = trimmed.split(".");
    if (parts.length < 2) return true;
    const payload = JSON.parse(Buffer.from(parts[1], "base64").toString("utf8"));
    if (!payload || typeof payload !== "object") return true;
    if (payload.ref && payload.ref !== SUPA2_REF) return true;
  } catch (e) {
    return true;
  }
  return false;
}

function enforceSupabase2Env() {
  let intercepted = false;

  // 1. SUPABASE_URL & SERVICE_ROLE_KEY (Main legacy env vars)
  if (isLegacyOrEmptyUrl(process.env.SUPABASE_URL)) {
    console.warn(`[SupabaseGuard] 🛡️ Intercepted legacy/missing SUPABASE_URL (${process.env.SUPABASE_URL || 'EMPTY'}). Locked to Supabase 2.`);
    process.env.SUPABASE_URL = SUPA2_URL;
    intercepted = true;
  }
  if (isLegacyOrInvalidKey(process.env.SUPABASE_SERVICE_ROLE_KEY)) {
    console.warn(`[SupabaseGuard] 🛡️ Intercepted legacy/invalid SUPABASE_SERVICE_ROLE_KEY. Locked to Supabase 2 service role key.`);
    process.env.SUPABASE_SERVICE_ROLE_KEY = SUPA2_SERVICE_KEY;
    intercepted = true;
  }
  if (isLegacyOrInvalidKey(process.env.SUPABASE_KEY)) {
    process.env.SUPABASE_KEY = SUPA2_SERVICE_KEY;
    intercepted = true;
  }
  if (isLegacyOrInvalidKey(process.env.SUPABASE_ANON_KEY)) {
    process.env.SUPABASE_ANON_KEY = SUPA2_ANON_KEY;
  }

  // 2. POINTS_SUPABASE_URL & KEYS
  if (isLegacyOrEmptyUrl(process.env.POINTS_SUPABASE_URL)) {
    process.env.POINTS_SUPABASE_URL = SUPA2_URL;
    intercepted = true;
  }
  if (isLegacyOrInvalidKey(process.env.POINTS_SUPABASE_SERVICE_ROLE_KEY)) {
    process.env.POINTS_SUPABASE_SERVICE_ROLE_KEY = SUPA2_SERVICE_KEY;
    intercepted = true;
  }
  if (isLegacyOrInvalidKey(process.env.POINTS_SUPABASE_ANON_KEY)) {
    process.env.POINTS_SUPABASE_ANON_KEY = SUPA2_ANON_KEY;
  }

  // 3. KUMA_SUPABASE_URL & KEYS
  if (isLegacyOrEmptyUrl(process.env.KUMA_SUPABASE_URL)) {
    process.env.KUMA_SUPABASE_URL = SUPA2_URL;
    intercepted = true;
  }
  if (isLegacyOrInvalidKey(process.env.KUMA_SUPABASE_SERVICE_ROLE_KEY)) {
    process.env.KUMA_SUPABASE_SERVICE_ROLE_KEY = SUPA2_SERVICE_KEY;
    intercepted = true;
  }

  // 4. HEALJAI_SUPABASE_URL & KEYS
  if (isLegacyOrEmptyUrl(process.env.HEALJAI_SUPABASE_URL)) {
    process.env.HEALJAI_SUPABASE_URL = SUPA2_URL;
    intercepted = true;
  }
  if (isLegacyOrInvalidKey(process.env.HEALJAI_SUPABASE_SERVICE_ROLE_KEY)) {
    process.env.HEALJAI_SUPABASE_SERVICE_ROLE_KEY = SUPA2_SERVICE_KEY;
    intercepted = true;
  }

  // 5. Functions & Webhooks
  if (isLegacyOrEmptyUrl(process.env.VOICE_POINTS_URL)) {
    process.env.VOICE_POINTS_URL = `${SUPA2_URL}/functions/v1/voice-activity-points`;
  }
  if (isLegacyOrEmptyUrl(process.env.WEBHOOK_URL)) {
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
          urlStr = rewritten;
        }

        // Deep Packet Inspection: Sanitize Authorization & apikey headers if target is Supabase 2
        if (urlStr.includes(SUPA2_REF) && init && init.headers) {
          if (typeof init.headers.set === "function") {
            if (init.headers.has("apikey") && isLegacyOrInvalidKey(init.headers.get("apikey"))) {
              init.headers.set("apikey", SUPA2_SERVICE_KEY);
            }
            if (init.headers.has("authorization")) {
              const auth = init.headers.get("authorization");
              if (auth && typeof auth === "string" && isLegacyOrInvalidKey(auth.replace(/^Bearer\s+/i, ""))) {
                init.headers.set("authorization", `Bearer ${SUPA2_SERVICE_KEY}`);
              }
            }
          } else if (typeof init.headers === "object" && !Array.isArray(init.headers)) {
            for (const key of Object.keys(init.headers)) {
              if (key.toLowerCase() === "apikey" && isLegacyOrInvalidKey(init.headers[key])) {
                init.headers[key] = SUPA2_SERVICE_KEY;
              }
              if (key.toLowerCase() === "authorization") {
                const auth = init.headers[key];
                if (typeof auth === "string" && isLegacyOrInvalidKey(auth.replace(/^Bearer\s+/i, ""))) {
                  init.headers[key] = `Bearer ${SUPA2_SERVICE_KEY}`;
                }
              }
            }
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
