// ==============================================================================
// src/features/healJai/services/analyticsService.js
// Heal Jai Analytics & Logging Service (Revision 5)
//
// Features:
// - Non-blocking In-Memory Bounded Queue (Max 1,000 items)
// - Idempotency Key deduplication (In-Memory cache + Database constraint)
// - Batch insertion to Supabase with Exponential Backoff
// - Disk Spillover Buffer (JSONL) with file size boundary and auto-recovery
// - Dynamic Admin Kill Switch (in-memory, immediate toggle)
// - Graceful Shutdown flush hook
// ==============================================================================

const fs = require("fs");
const path = require("path");
const { createClient } = require("@supabase/supabase-js");

const MAX_QUEUE_SIZE = 1000;
const BATCH_SIZE = 25;
const FLUSH_INTERVAL_MS = 3000;
const MAX_RETRIES = 3;
const MAX_SPILLOVER_BYTES = 10 * 1024 * 1024; // 10 MB limit
const SPILLOVER_FILE_PATH = path.join(__dirname, "../../../../data/heal_jai_analytics_spillover.jsonl");

class AnalyticsService {
  constructor() {
    this.queue = [];
    this.isFlushing = false;
    this.isEnabled = true;
    this.recentKeys = new Map(); // idempotency_key -> timestamp
    this.stats = {
      totalReceived: 0,
      totalInserted: 0,
      totalFailed: 0,
      totalSpilled: 0,
      totalDeduplicated: 0
    };

    this.flushTimer = setInterval(() => this.flush(), FLUSH_INTERVAL_MS);
    if (this.flushTimer.unref) this.flushTimer.unref();

    this.spilloverRecoveryTimer = setInterval(() => this.recoverSpillover(), 60000);
    if (this.spilloverRecoveryTimer.unref) this.spilloverRecoveryTimer.unref();

    // Clean up recent keys map every 10 minutes
    this.keyCleanupTimer = setInterval(() => this.cleanRecentKeys(), 10 * 60 * 1000);
    if (this.keyCleanupTimer.unref) this.keyCleanupTimer.unref();
  }

  getSupabase() {
    if (!this._supabase && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
      this._supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
    }
    return this._supabase;
  }

  cleanRecentKeys() {
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    for (const [key, ts] of this.recentKeys.entries()) {
      if (ts < oneHourAgo) {
        this.recentKeys.delete(key);
      }
    }
  }

  /**
   * Admin Kill Switch Toggle
   * @param {boolean} enabled 
   */
  setEnabled(enabled) {
    this.isEnabled = Boolean(enabled);
    console.log(`[HealJai-Analytics] Kill Switch updated: isEnabled = ${this.isEnabled}`);
    if (!this.isEnabled && this.queue.length > 0) {
      // Promptly flush existing events in queue
      this.flush().catch(() => {});
    }
  }

  isAnalyticsActive() {
    return this.isEnabled;
  }

  getStatus() {
    return {
      isEnabled: this.isEnabled,
      queueLength: this.queue.length,
      recentKeysCount: this.recentKeys.size,
      ...this.stats
    };
  }

  /**
   * Track an event into the analytics stream (Non-blocking, Fire-and-forget)
   * @param {object} eventData
   */
  trackEvent(eventData) {
    if (!this.isEnabled) {
      return false;
    }

    try {
      this.stats.totalReceived++;

      const {
        eventName,
        eventCategory = "SYSTEM",
        status = "SUCCESS",
        idempotencyKey,
        ticketId = null,
        orderId = null,
        actorId = null,
        guildId = null,
        orderCode = null,
        metadata = {}
      } = eventData;

      if (!eventName || !idempotencyKey) {
        console.warn("[HealJai-Analytics] Missing eventName or idempotencyKey:", eventData);
        return false;
      }

      // Memory-level Fast Deduplication
      if (this.recentKeys.has(idempotencyKey)) {
        this.stats.totalDeduplicated++;
        return false;
      }
      this.recentKeys.set(idempotencyKey, Date.now());

      const payload = {
        event_name: eventName,
        event_category: eventCategory,
        status: status,
        idempotency_key: idempotencyKey,
        ticket_id: ticketId ? Number(ticketId) : null,
        order_id: orderId ? Number(orderId) : null,
        actor_id: actorId ? String(actorId) : null,
        guild_id: guildId ? String(guildId) : null,
        order_code: orderCode ? String(orderCode) : null,
        metadata: metadata && typeof metadata === "object" ? metadata : {},
        _retries: 0
      };

      if (this.queue.length >= MAX_QUEUE_SIZE) {
        console.warn(`[HealJai-Analytics] Queue overflow (${this.queue.length}/${MAX_QUEUE_SIZE}). Spilling directly to disk.`);
        this.writeToSpillover(payload);
        return true;
      }

      this.queue.push(payload);

      // Trigger eager flush if batch threshold reached
      if (this.queue.length >= BATCH_SIZE && !this.isFlushing) {
        setImmediate(() => this.flush().catch(() => {}));
      }

      return true;
    } catch (err) {
      console.error("[HealJai-Analytics] Error queuing event:", err.message);
      return false;
    }
  }

  /**
   * Flush a batch from queue to Supabase
   */
  async flush() {
    if (this.isFlushing || this.queue.length === 0) return;
    this.isFlushing = true;

    try {
      const supabase = this.getSupabase();
      if (!supabase) {
        console.warn("[HealJai-Analytics] Supabase client not available, holding queue.");
        this.isFlushing = false;
        return;
      }

      const batch = this.queue.splice(0, BATCH_SIZE);
      const insertPayloads = batch.map(({ _retries, ...rest }) => rest);

      const { error } = await supabase
        .from("heal_jai_analytics_events")
        .upsert(insertPayloads, { onConflict: "idempotency_key", ignoreDuplicates: true });

      if (error) {
        console.error("[HealJai-Analytics] Batch insertion failed:", error.message);
        this.handleFailedBatch(batch);
      } else {
        this.stats.totalInserted += batch.length;
      }
    } catch (err) {
      console.error("[HealJai-Analytics] Exception during flush:", err.message);
    } finally {
      this.isFlushing = false;
    }
  }

  handleFailedBatch(batch) {
    for (const item of batch) {
      item._retries = (item._retries || 0) + 1;
      if (item._retries <= MAX_RETRIES) {
        // Re-queue at the front for retry
        this.queue.unshift(item);
      } else {
        // Spill over to disk after exceeding max retries
        this.stats.totalFailed++;
        this.writeToSpillover(item);
      }
    }
  }

  writeToSpillover(item) {
    try {
      const dir = path.dirname(SPILLOVER_FILE_PATH);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      // Check file size boundary
      if (fs.existsSync(SPILLOVER_FILE_PATH)) {
        const stats = fs.statSync(SPILLOVER_FILE_PATH);
        if (stats.size >= MAX_SPILLOVER_BYTES) {
          console.error("[HealJai-Analytics] Spillover file exceeded 10MB limit! Dropping item to prevent disk exhaustion.");
          return;
        }
      }

      const { _retries, ...cleanItem } = item;
      fs.appendFileSync(SPILLOVER_FILE_PATH, JSON.stringify(cleanItem) + "\n", "utf8");
      this.stats.totalSpilled++;
    } catch (err) {
      console.error("[HealJai-Analytics] Failed to write spillover:", err.message);
    }
  }

  async recoverSpillover() {
    if (!fs.existsSync(SPILLOVER_FILE_PATH)) return;
    const supabase = this.getSupabase();
    if (!supabase) return;

    try {
      const content = fs.readFileSync(SPILLOVER_FILE_PATH, "utf8");
      if (!content.trim()) return;

      const lines = content.trim().split("\n");
      const items = [];
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          items.push(JSON.parse(line));
        } catch {
          // Ignore corrupted line
        }
      }

      if (items.length === 0) {
        fs.unlinkSync(SPILLOVER_FILE_PATH);
        return;
      }

      console.log(`[HealJai-Analytics] 🔄 Recovering ${items.length} events from spillover file...`);

      // Process in batches
      while (items.length > 0) {
        const chunk = items.splice(0, BATCH_SIZE);
        const { error } = await supabase
          .from("heal_jai_analytics_events")
          .upsert(chunk, { onConflict: "idempotency_key", ignoreDuplicates: true });

        if (error) {
          console.error("[HealJai-Analytics] Failed to recover spillover chunk, will retry next cycle:", error.message);
          // Rewrite remaining items back
          const remaining = [...chunk, ...items];
          fs.writeFileSync(SPILLOVER_FILE_PATH, remaining.map(x => JSON.stringify(x)).join("\n") + "\n", "utf8");
          return;
        }
      }

      // All recovered successfully, remove spillover file
      fs.unlinkSync(SPILLOVER_FILE_PATH);
      console.log("[HealJai-Analytics] ✅ Spillover events fully recovered and cleared.");
    } catch (err) {
      console.error("[HealJai-Analytics] Error during spillover recovery:", err.message);
    }
  }

  /**
   * Graceful Shutdown Hook: Flush all pending events before process exits
   * @param {number} timeoutMs
   */
  async shutdown(timeoutMs = 5000) {
    console.log(`[HealJai-Analytics] Shutting down analytics service, flushing ${this.queue.length} events...`);
    clearInterval(this.flushTimer);
    clearInterval(this.spilloverRecoveryTimer);
    clearInterval(this.keyCleanupTimer);

    const deadline = Date.now() + timeoutMs;
    while (this.queue.length > 0 && Date.now() < deadline) {
      await this.flush();
      await new Promise(r => setTimeout(r, 200));
    }

    if (this.queue.length > 0) {
      console.warn(`[HealJai-Analytics] Shutdown timeout reached with ${this.queue.length} events remaining. Spilling to disk.`);
      while (this.queue.length > 0) {
        this.writeToSpillover(this.queue.shift());
      }
    }

    console.log("[HealJai-Analytics] Analytics service shutdown complete.");
  }
}

const analyticsService = new AnalyticsService();

module.exports = analyticsService;
