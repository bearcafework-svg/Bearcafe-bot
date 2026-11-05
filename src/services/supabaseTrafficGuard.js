// src/services/supabaseTrafficGuard.js
// ─────────────────────────────────────────────────────────────────────────────
// 🛡️ Supabase Traffic & Log Ingestion Guard
// ระบบป้องกัน Egress และ Log Ingestion เกินโควตาสำหรับทั้ง บอทหลัก และ บอทคุมะ
// 1. URL Rewrite อัตโนมัติ ป้องกันการยิงเข้า Supabase 1 เก่า
// 2. Short-TTL In-Memory Read Caching (Deduplication) ลดการยิง GET ซ้ำซ้อน 50-80%
// 3. Postgres Error Circuit Breaker หยุดลูป error ไม่ให้ยิงถล่ม Postgres Log ใน Supabase
// 4. Adaptive Surge Rate Smoothing เกลี่ยทราฟฟิกเมื่อมี Request เข้ามาถี่ผิดปกติ
// ─────────────────────────────────────────────────────────────────────────────

const logger = require("../../utils/logger") || console;

class CachedResponse {
  constructor(status, statusText, headers, bodyText) {
    this.status = status;
    this.statusText = statusText;
    this.headers = new Headers(headers);
    this.bodyText = bodyText;
  }

  toResponse() {
    return new Response(this.bodyText, {
      status: this.status,
      statusText: this.statusText,
      headers: this.headers,
    });
  }
}

class SupabaseTrafficGuard {
  constructor() {
    this.windowMs = 60 * 1000; // หน้าต่างเวลา 1 นาที
    this.surgeThreshold = 180; // หากเกิน 180 req/min จะเตือน Warning
    this.criticalThreshold = 350; // หากเกิน 350 req/min จะเตือน Critical
    this.cacheTtlMs = 3000; // แคชผลลัพธ์ GET สั้นๆ 3 วินาทีเพื่อตัด request ซ้ำซ้อน
    this.maxFailuresBeforeTrip = 5; // ล้มเหลวติดกัน 5 ครั้งจะ trip circuit breaker
    this.circuitBreakerDurationMs = 15000; // พักยิง endpoint ที่ error ต่อเนื่อง 15 วินาที

    this.requestsInWindow = [];
    this.endpointCounters = new Map(); // endpoint -> count in current window
    this.failureCounters = new Map(); // endpoint -> { count, lastErrorTime, trippedUntil }
    this.readCache = new Map(); // cacheKey -> { expiresAt, cachedResponse }

    this.totalRequestsLifetime = 0;
    this.savedRequestsLifetime = 0;
    this.blockedErrorsLifetime = 0;
    this.lastSurgeLogTime = 0;

    // กวาดแคชที่หมดอายุทุก 1 นาที
    setInterval(() => this.cleanExpiredCache(), 60 * 1000).unref();
    // รายงานสถิติภาพรวมทุกๆ 30 นาที
    setInterval(() => this.logPeriodicSummary(), 30 * 60 * 1000).unref();
  }

  cleanExpiredCache() {
    const now = Date.now();
    for (const [key, item] of this.readCache.entries()) {
      if (now >= item.expiresAt) {
        this.readCache.delete(key);
      }
    }
  }

  /**
   * ห่อหุ้ม fetch function ของ Node.js / Supabase
   * @param {string} botLabel ชื่อบอทที่เรียก ('main' | 'kuma' | 'minigames' ฯลฯ)
   */
  createGuardedFetch(botLabel = "main") {
    const originalFetch = globalThis.fetch;

    return async (url, options = {}) => {
      const now = Date.now();
      let urlStr = typeof url === "string" ? url : (url instanceof URL ? url.toString() : url?.url || url?.toString() || "");

      // 🛡️ 1. Guard: Rewrite any legacy Supabase 1 URL to Supabase 2
      if (urlStr.includes("orbxyyjpvpbqwfssnyeq.supabase.co") || urlStr.includes("itulsrbsluwdqwakldjs.supabase.co")) {
        const rewritten = urlStr
          .replace("orbxyyjpvpbqwfssnyeq.supabase.co", "fqzhcpzxdlnvhvlqspgc.supabase.co")
          .replace("itulsrbsluwdqwakldjs.supabase.co", "fqzhcpzxdlnvhvlqspgc.supabase.co");
        console.warn(`[SupabaseTrafficGuard] 🛡️ [${botLabel}] Rerouting legacy request to Supabase 2: ${rewritten}`);
        if (typeof url === "string") url = rewritten;
        else if (url instanceof URL) url = new URL(rewritten);
        else if (url && typeof url === "object" && url.url) url = new Request(rewritten, url);
        urlStr = rewritten;
      }

      // ดึง endpoint แบบย่อ (เช่น /rest/v1/tenant_configs)
      let endpoint = "unknown";
      try {
        const parsed = new URL(urlStr);
        endpoint = parsed.pathname;
      } catch {
        endpoint = urlStr.split("?")[0] || "unknown";
      }

      const method = (options.method || "GET").toUpperCase();

      // 🛡️ 2. Short-TTL In-Memory Read Cache สำหรับ GET requests
      // ป้องกัน Log Ingestion ซ้ำซ้อนเมื่อมีอีเวนต์กดปุ่มหรือส่งข้อความรัวๆ ในเสี้ยววินาทีเดียวกัน
      if (method === "GET") {
        const cacheKey = `${botLabel}:${urlStr}`;
        const cached = this.readCache.get(cacheKey);
        if (cached && now < cached.expiresAt) {
          this.savedRequestsLifetime++;
          return cached.cachedResponse.toResponse();
        }
      }

      // 🛡️ 3. Postgres Error Circuit Breaker
      // หาก endpoint ใดเกิด error ติดกันบ่อยครั้ง ให้ระงับการยิงชั่วคราวเพื่อหยุดการพ่น Error ลง Postgres Log
      const failure = this.failureCounters.get(endpoint);
      if (failure && failure.trippedUntil > now) {
        this.blockedErrorsLifetime++;
        return new Response(
          JSON.stringify({
            message: `[LogIngestionGuard] Request to ${endpoint} temporarily throttled by circuit breaker to protect Supabase log quota.`,
            code: "CIRCUIT_BREAKER_TRIPPED"
          }),
          {
            status: 429,
            statusText: "Too Many Errors - Throttled for Log Protection",
            headers: { "Content-Type": "application/json" }
          }
        );
      }

      // บันทึก Request และเช็ก Surge
      this.recordRequest(endpoint, now, botLabel);

      // 🛡️ 4. Adaptive Surge Smoothing (หน่วงเวลาระดับมิลลิวินาทีหากมี traffic ทะลัก)
      const currentRate = this.requestsInWindow.length;
      if (currentRate >= this.surgeThreshold) {
        const delayMs = Math.min(60, Math.floor((currentRate - this.surgeThreshold) * 1.5));
        if (delayMs > 0) {
          await new Promise((r) => setTimeout(r, delayMs));
        }
      }

      try {
        const res = await originalFetch(url, options);

        // จัดการสถานะ Error/Success เพื่อคุม Circuit Breaker
        if (res.status >= 400 && res.status !== 404) {
          const currentFailures = this.failureCounters.get(endpoint) || { count: 0, lastErrorTime: 0, trippedUntil: 0 };
          currentFailures.count++;
          currentFailures.lastErrorTime = Date.now();

          if (currentFailures.count >= this.maxFailuresBeforeTrip) {
            currentFailures.trippedUntil = Date.now() + this.circuitBreakerDurationMs;
            console.warn(
              `[LogIngestionGuard] 🛡️ [${botLabel}] Endpoint ${endpoint} tripped circuit breaker for ${this.circuitBreakerDurationMs / 1000}s ` +
              `to protect Supabase Log Ingestion quota (${currentFailures.count} consecutive errors).`
            );
          }
          this.failureCounters.set(endpoint, currentFailures);
        } else if (res.status < 400) {
          // หากสำเร็จ ให้เคลียร์เคาน์เตอร์ error ของ endpoint นี้
          if (failure && failure.count > 0) {
            this.failureCounters.delete(endpoint);
          }

          // แคชผลลัพธ์ GET ที่สำเร็จไว้สั้นๆ
          if (method === "GET" && (res.status === 200 || res.status === 206)) {
            try {
              const bodyText = await res.text();
              const cachedResp = new CachedResponse(res.status, res.statusText, res.headers, bodyText);
              this.readCache.set(`${botLabel}:${urlStr}`, {
                expiresAt: Date.now() + this.cacheTtlMs,
                cachedResponse: cachedResp
              });
              return cachedResp.toResponse();
            } catch (err) {
              // หากอ่าน body ไม่ได้ ให้ส่งคืนตามปกติ
            }
          }
        }

        return res;
      } catch (networkErr) {
        // ดักจับข้อผิดพลาดระดับเน็ตเวิร์ก
        const currentFailures = this.failureCounters.get(endpoint) || { count: 0, lastErrorTime: 0, trippedUntil: 0 };
        currentFailures.count++;
        currentFailures.lastErrorTime = Date.now();
        if (currentFailures.count >= this.maxFailuresBeforeTrip) {
          currentFailures.trippedUntil = Date.now() + this.circuitBreakerDurationMs;
        }
        this.failureCounters.set(endpoint, currentFailures);
        throw networkErr;
      }
    };
  }

  /**
   * บันทึก Request และตรวจสอบอัตราความถี่
   */
  recordRequest(endpoint, timestamp, botLabel) {
    this.totalRequestsLifetime++;
    this.requestsInWindow.push({ endpoint, time: timestamp, bot: botLabel });

    const count = this.endpointCounters.get(endpoint) || 0;
    this.endpointCounters.set(endpoint, count + 1);

    // ล้างข้อมูลที่เกิน 1 นาทีออก
    const cutoff = timestamp - this.windowMs;
    while (this.requestsInWindow.length > 0 && this.requestsInWindow[0].time < cutoff) {
      const expired = this.requestsInWindow.shift();
      const current = this.endpointCounters.get(expired.endpoint) || 1;
      if (current <= 1) {
        this.endpointCounters.delete(expired.endpoint);
      } else {
        this.endpointCounters.set(expired.endpoint, current - 1);
      }
    }

    const currentRate = this.requestsInWindow.length;

    // ตรวจสอบ Surge (ไม่แจ้งเตือนซ้ำถี่เกินไป ทุกๆ 30 วินาที)
    if (currentRate >= this.surgeThreshold && timestamp - this.lastSurgeLogTime > 30 * 1000) {
      this.lastSurgeLogTime = timestamp;
      this.triggerSurgeAlert(currentRate, botLabel);
    }
  }

  triggerSurgeAlert(currentRate, botLabel) {
    const sorted = Array.from(this.endpointCounters.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([ep, cnt]) => `${ep} (${cnt} reqs)`)
      .join(", ");

    const isCritical = currentRate >= this.criticalThreshold;
    const prefix = isCritical ? "🚨 [CRITICAL TRAFFIC SURGE]" : "⚠️ [TRAFFIC SURGE WARNING]";

    console.warn(
      `\n${prefix} [${botLabel}] Supabase request rate reached ${currentRate} req/min!\n` +
      `   Top Endpoints: ${sorted}\n` +
      `   Shield: Log Ingestion Guard is actively smoothing requests and deduplicating queries.\n`
    );
  }

  logPeriodicSummary() {
    if (this.totalRequestsLifetime === 0) return;
    console.log(
      `[LogIngestionGuard] 📊 Heartbeat: Total Supabase requests = ${this.totalRequestsLifetime} | ` +
      `Saved via Cache = ${this.savedRequestsLifetime} | Error Floods Blocked = ${this.blockedErrorsLifetime}`
    );
  }

  getStats() {
    return {
      currentRatePerMinute: this.requestsInWindow.length,
      totalRequestsLifetime: this.totalRequestsLifetime,
      savedRequestsLifetime: this.savedRequestsLifetime,
      blockedErrorsLifetime: this.blockedErrorsLifetime,
      activeEndpoints: Object.fromEntries(this.endpointCounters)
    };
  }
}

const trafficGuardInstance = new SupabaseTrafficGuard();

/**
 * สร้าง Supabase Client ที่มีเกราะป้องกัน Log Ingestion และ Traffic Surge ครบวงจร
 */
function createProtectedSupabaseClient(supabaseUrl, supabaseKey, customOptions = {}, botLabel = "main") {
  const { createClient } = require("@supabase/supabase-js");
  const ws = require("ws");

  if (!globalThis.WebSocket) {
    globalThis.WebSocket = ws;
  }

  return createClient(supabaseUrl, supabaseKey, {
    ...customOptions,
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      ...(customOptions.auth || {})
    },
    realtime: {
      transport: ws,
      ...(customOptions.realtime || {})
    },
    global: {
      fetch: trafficGuardInstance.createGuardedFetch(botLabel),
      ...(customOptions.global || {})
    }
  });
}

module.exports = {
  trafficGuard: trafficGuardInstance,
  getGuardedFetch: (botLabel = "main") => trafficGuardInstance.createGuardedFetch(botLabel),
  createProtectedSupabaseClient
};
