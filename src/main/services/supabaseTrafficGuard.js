// src/services/supabaseTrafficGuard.js
// ─────────────────────────────────────────────────────────────────────────────
// 🛡️ Supabase Traffic Guard & Circuit Breaker
// ดักจับและเฝ้าระวังอัตราการยิง Request เข้า Supabase ป้องกัน Egress & Log Ingestion เกินโควตา
// ─────────────────────────────────────────────────────────────────────────────

const logger = require("../../utils/logger") || console;

class SupabaseTrafficGuard {
  constructor() {
    this.windowMs = 60 * 1000; // หน้าต่างเวลา 1 นาที
    this.surgeThreshold = 180; // หากเกิน 180 req/min จะแจ้งเตือนระดับ Warning
    this.criticalThreshold = 350; // หากเกิน 350 req/min จะแจ้งเตือนระดับ Critical
    
    this.requestsInWindow = [];
    this.endpointCounters = new Map(); // endpoint -> count in current window
    this.totalRequestsLifetime = 0;
    this.lastSurgeLogTime = 0;

    // รายงานสถิติภาพรวมทุกๆ 30 นาที
    setInterval(() => this.logPeriodicSummary(), 30 * 60 * 1000).unref();
  }

  /**
   * ห่อหุ้ม fetch function ของ Node.js / Supabase
   */
  createGuardedFetch() {
    const originalFetch = globalThis.fetch;

    return async (url, options = {}) => {
      const now = Date.now();
      const urlStr = typeof url === "string" ? url : url?.toString() || "";
      
      // ดึง endpoint แบบย่อ (เช่น /rest/v1/daily_quest_sets)
      let endpoint = "unknown";
      try {
        const parsed = new URL(urlStr);
        endpoint = parsed.pathname;
      } catch {
        endpoint = urlStr.split("?")[0] || "unknown";
      }

      this.recordRequest(endpoint, now);

      return originalFetch(url, options);
    };
  }

  /**
   * บันทึก Request และตรวจสอบอัตราความถี่
   */
  recordRequest(endpoint, timestamp) {
    this.totalRequestsLifetime++;
    this.requestsInWindow.push({ endpoint, time: timestamp });

    // เพิ่มตัวนับ endpoint
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
      this.triggerSurgeAlert(currentRate);
    }
  }

  triggerSurgeAlert(currentRate) {
    // เรียงลำดับ Endpoint ที่ยิงเยอะที่สุดใน 1 นาทีนี้
    const sorted = Array.from(this.endpointCounters.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([ep, cnt]) => `${ep} (${cnt} reqs)`)
      .join(", ");

    const isCritical = currentRate >= this.criticalThreshold;
    const prefix = isCritical ? "🚨 [CRITICAL TRAFFIC SURGE]" : "⚠️ [TRAFFIC SURGE WARNING]";
    
    console.warn(
      `\n${prefix} Supabase request rate reached ${currentRate} req/min!\n` +
      `   Top Endpoints: ${sorted}\n` +
      `   Recommendation: Check for unthrottled loops or missing in-memory caching to avoid Free Tier Egress exhaustion.\n`
    );
  }

  logPeriodicSummary() {
    if (this.totalRequestsLifetime === 0) return;
    console.log(`[SupabaseTrafficGuard] 📊 Heartbeat: Total Supabase API requests since startup = ${this.totalRequestsLifetime}`);
  }

  getStats() {
    return {
      currentRatePerMinute: this.requestsInWindow.length,
      totalRequestsLifetime: this.totalRequestsLifetime,
      activeEndpoints: Object.fromEntries(this.endpointCounters)
    };
  }
}

const trafficGuardInstance = new SupabaseTrafficGuard();

module.exports = {
  trafficGuard: trafficGuardInstance,
  getGuardedFetch: () => trafficGuardInstance.createGuardedFetch()
};
