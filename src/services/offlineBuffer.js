// ============================================================================
// src/services/offlineBuffer.js
// ระบบแผนสำรอง: Local Buffer & Offline Fallback Queue
// ป้องกันบอทดับเมื่อ Supabase เต็ม, ติด Read-Only, หรือเชื่อมต่อไม่ได้
// ============================================================================

const fs = require("fs");
const path = require("path");
const logger = require("../../utils/logger") || console;
const { getSupabaseClient } = require("./supabaseClient");

const QUEUE_FILE_PATH = path.resolve(__dirname, "../../data/pending_offline_writes.json");
const READ_CACHE_DIR = path.resolve(__dirname, "../../data/cache");

// ตรวจสอบและสร้างโฟลเดอร์สำหรับแคช
if (!fs.existsSync(READ_CACHE_DIR)) {
  try {
    fs.mkdirSync(READ_CACHE_DIR, { recursive: true });
  } catch (err) {
    logger.warn?.(`[offlineBuffer] Failed to create cache directory: ${err.message}`);
  }
}

// In-Memory cache for high-frequency reads
const memoryCache = new Map();

/**
 * โหลดคิวงานออฟไลน์ที่ค้างอยู่จากไฟล์
 */
function loadQueue() {
  try {
    if (!fs.existsSync(QUEUE_FILE_PATH)) {
      return [];
    }
    const raw = fs.readFileSync(QUEUE_FILE_PATH, "utf8");
    return JSON.parse(raw) || [];
  } catch (err) {
    logger.warn?.(`[offlineBuffer] Error reading offline queue: ${err.message}`);
    return [];
  }
}

/**
 * บันทึกคิวงานออฟไลน์ลงไฟล์ (Atomic write)
 */
function saveQueue(queue) {
  try {
    const tempFile = `${QUEUE_FILE_PATH}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(queue, null, 2), "utf8");
    fs.renameSync(tempFile, QUEUE_FILE_PATH);
  } catch (err) {
    logger.error?.(`[offlineBuffer] Error saving offline queue: ${err.message}`);
  }
}

/**
 * เพิ่มคำสั่ง Write ลงคิวออฟไลน์เมื่อ Supabase ไม่สามารถเขียนได้
 */
function enqueueOfflineWrite(operation) {
  const queue = loadQueue();
  const item = {
    id: `${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: new Date().toISOString(),
    ...operation,
  };
  queue.push(item);
  saveQueue(queue);
  logger.warn?.(`[offlineBuffer] 📦 Saved operation to offline queue (${queue.length} pending): ${operation.table} [${operation.action}]`);
  return item;
}

/**
 * Safe Write Wrapper: พยายามเขียนลง Supabase หากผิดพลาดจะส่งเข้า Offline Queue อัตโนมัติ
 * @param {string} table ชื่อตาราง
 * @param {'insert'|'upsert'|'update'|'delete'} action
 * @param {any} payload ข้อมูลที่ต้องการเขียน
 * @param {object} [matchFilter] เงื่อนไขสำหรับการ update/delete
 */
async function safeWrite(table, action, payload, matchFilter = null) {
  const sb = getSupabaseClient();
  if (!sb) {
    enqueueOfflineWrite({ table, action, payload, matchFilter });
    return { ok: true, offline: true, data: payload, reason: "Supabase client unconfigured" };
  }

  try {
    let query = sb.from(table);

    if (action === "insert") {
      const { data, error } = await query.insert(payload).select();
      if (error) throw error;
      return { ok: true, offline: false, data };
    }

    if (action === "upsert") {
      const { data, error } = await query.upsert(payload).select();
      if (error) throw error;
      return { ok: true, offline: false, data };
    }

    if (action === "update") {
      let q = query.update(payload);
      if (matchFilter && typeof matchFilter === "object") {
        for (const [key, val] of Object.entries(matchFilter)) {
          q = q.eq(key, val);
        }
      }
      const { data, error } = await q.select();
      if (error) throw error;
      return { ok: true, offline: false, data };
    }

    if (action === "delete") {
      let q = query.delete();
      if (matchFilter && typeof matchFilter === "object") {
        for (const [key, val] of Object.entries(matchFilter)) {
          q = q.eq(key, val);
        }
      }
      const { data, error } = await q;
      if (error) throw error;
      return { ok: true, offline: false, data };
    }

    throw new Error(`Unsupported action: ${action}`);
  } catch (err) {
    logger.warn?.(`[offlineBuffer] Supabase write failed (${table}.${action}): ${err.message}. Buffering offline.`);
    enqueueOfflineWrite({ table, action, payload, matchFilter, error: err.message });
    return { ok: true, offline: true, data: payload, error: err.message };
  }
}

/**
 * Safe Read Wrapper พร้อม Stale-While-Revalidate In-Memory & Local File Cache
 * @param {string} cacheKey คีย์เฉพาะสำหรับแคช
 * @param {() => Promise<any>} fetchFn ฟังก์ชันดึงข้อมูลจาก Supabase
 * @param {number} [ttlMs=60000] อายุแคช (มิลลิวินาที) ค่าเริ่มต้น 1 นาที
 */
async function cachedRead(cacheKey, fetchFn, ttlMs = 60000) {
  const now = Date.now();
  const inMemory = memoryCache.get(cacheKey);

  // 1. ถ้ามี Memory cache ที่ยังไม่หมดอายุ ให้ส่งคืนทันที
  if (inMemory && now - inMemory.timestamp < ttlMs) {
    return { data: inMemory.data, fromCache: true, stale: false };
  }

  // 2. ลองดึงข้อมูลใหม่จาก Supabase
  try {
    const freshData = await fetchFn();
    if (freshData !== undefined && freshData !== null) {
      memoryCache.set(cacheKey, { timestamp: now, data: freshData });
      
      // บันทึกลง Disk สำรองกรณีบอท Restart
      try {
        const filePath = path.join(READ_CACHE_DIR, `${encodeURIComponent(cacheKey)}.json`);
        fs.writeFileSync(filePath, JSON.stringify({ timestamp: now, data: freshData }), "utf8");
      } catch {}

      return { data: freshData, fromCache: false, stale: false };
    }
  } catch (err) {
    logger.warn?.(`[offlineBuffer] Fetch failed for key '${cacheKey}': ${err.message}. Serving stale cache.`);
  }

  // 3. หากดึงข้อมูลล้มเหลว นำแคชเดิมใน Memory มาใช้ (Stale fallback)
  if (inMemory) {
    return { data: inMemory.data, fromCache: true, stale: true };
  }

  // 4. หากไม่มีใน Memory ให้ลองอ่านจาก Disk Cache
  try {
    const filePath = path.join(READ_CACHE_DIR, `${encodeURIComponent(cacheKey)}.json`);
    if (fs.existsSync(filePath)) {
      const diskData = JSON.parse(fs.readFileSync(filePath, "utf8"));
      memoryCache.set(cacheKey, diskData);
      return { data: diskData.data, fromCache: true, stale: true };
    }
  } catch {}

  // 5. หากไม่มีแคชเลย ให้คืน null อย่างปลอดภัย ไม่โยน Error ให้ระบบพัง
  return { data: null, fromCache: false, stale: false, notFound: true };
}

/**
 * ทยอยซิงค์ข้อมูลจากคิวออฟไลน์กลับขึ้น Supabase (Replay Worker)
 * @param {number} [batchSize=10]
 */
async function replayOfflineQueue(batchSize = 10) {
  const sb = getSupabaseClient();
  if (!sb) return { synced: 0, remaining: 0 };

  const queue = loadQueue();
  if (queue.length === 0) return { synced: 0, remaining: 0 };

  const batch = queue.slice(0, batchSize);
  const remainingQueue = queue.slice(batchSize);
  const failedItems = [];
  let syncedCount = 0;

  for (const item of batch) {
    try {
      let query = sb.from(item.table);
      if (item.action === "insert") {
        const { error } = await query.insert(item.payload);
        if (error) throw error;
      } else if (item.action === "upsert") {
        const { error } = await query.upsert(item.payload);
        if (error) throw error;
      } else if (item.action === "update") {
        let q = query.update(item.payload);
        if (item.matchFilter) {
          for (const [k, v] of Object.entries(item.matchFilter)) {
            q = q.eq(k, v);
          }
        }
        const { error } = await q;
        if (error) throw error;
      } else if (item.action === "delete") {
        let q = query.delete();
        if (item.matchFilter) {
          for (const [k, v] of Object.entries(item.matchFilter)) {
            q = q.eq(k, v);
          }
        }
        const { error } = await q;
        if (error) throw error;
      }
      syncedCount++;
    } catch (err) {
      logger.warn?.(`[offlineBuffer] Replay item ${item.id} failed: ${err.message}. Re-queuing.`);
      item.retryCount = (item.retryCount || 0) + 1;
      // เก็บไว้ลองใหม่ถ้าไม่เกิน 5 ครั้ง
      if (item.retryCount <= 5) {
        failedItems.push(item);
      } else {
        logger.error?.(`[offlineBuffer] Dropping dead letter item ${item.id} after 5 retries`);
      }
    }
  }

  const newQueue = [...failedItems, ...remainingQueue];
  saveQueue(newQueue);

  if (syncedCount > 0) {
    logger.info?.(`[offlineBuffer] 🔄 Successfully replayed ${syncedCount} offline write(s) to Supabase. (${newQueue.length} remaining)`);
  }

  return { synced: syncedCount, remaining: newQueue.length };
}

// Background auto-replay runner (เช็กคิวทุก 5 นาที)
setInterval(() => {
  replayOfflineQueue().catch(() => {});
}, 5 * 60 * 1000).unref();

module.exports = {
  safeWrite,
  cachedRead,
  enqueueOfflineWrite,
  replayOfflineQueue,
  getPendingCount: () => loadQueue().length,
};
