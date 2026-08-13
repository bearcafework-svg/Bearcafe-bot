// utils/voiceLogWorker.js
// Worker พื้นหลังทำหน้าที่ดึงข้อมูลจาก Redis Queue 
// และเขียนลงฐานข้อมูล Supabase แบบกลุ่ม (Batch Insert)

const { createClient } = require("@supabase/supabase-js");
const { getRedis } = require("../state/redisClient");

let supabaseClient;
function getSupabase() {
  if (!supabaseClient && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return supabaseClient;
}

let isProcessing = false;

/**
 * เริ่มต้นทำงาน Worker พื้นหลัง
 */
async function startVoiceLogWorker() {
  console.log("[voiceLogWorker] ⚙️ Background Voice Log Worker started.");
  
  // รันตรวจสอบ Queue ทุกๆ 3 วินาที
  setInterval(async () => {
    if (isProcessing) return;
    isProcessing = true;

    try {
      const redis = getRedis();
      const supabase = getSupabase();
      if (!supabase) {
        isProcessing = false;
        return;
      }

      // ดึงข้อมูลสูงสุดครั้งละ 10 รายการมาทำ Batch Insert
      const batch = [];
      for (let i = 0; i < 10; i++) {
        const raw = await redis.rpop("voice_logs:queue");
        if (!raw) break;
        try {
          const item = typeof raw === "string" ? JSON.parse(raw) : raw;
          batch.push(item);
        } catch (e) {
          console.error("[voiceLogWorker] ❌ Failed to parse queued item:", raw, e.message);
        }
      }

      if (batch.length === 0) {
        isProcessing = false;
        return;
      }

      // จัดระเบียบข้อมูลเตรียมส่งเข้า Supabase
      const rows = batch.map(item => ({
        user_id: item.user_id,
        username: item.username,
        channel_id: item.channel_id,
        channel_name: item.channel_name,
        event_type: item.event_type,
        from_channel_id: item.from_channel_id,
        from_channel_name: item.from_channel_name,
        timestamp: item.timestamp
      }));

      // ทำการ Batch Insert
      const { error } = await supabase.from("voice_logs").insert(rows);

      if (error) {
        console.error("[voiceLogWorker] ❌ Supabase batch insert error:", error.message);
        
        // หากส่งฐานข้อมูลไม่สำเร็จ ให้เอากลับไปใส่ Queue เพื่อลองรันใหม่ (Retry Logic)
        for (const item of batch) {
          item.retry_count = (item.retry_count || 0) + 1;
          if (item.retry_count <= 3) {
            await redis.lpush("voice_logs:queue", JSON.stringify(item));
          } else {
            console.error(`[voiceLogWorker] 🚨 Drop log after 3 failed retries for ${item.username} - ${item.event_type}`);
          }
        }
      } else {
        console.log(`[voiceLogWorker] 📤 Flushed ${batch.length} voice log(s) to Supabase.`);
      }
    } catch (err) {
      console.error("[voiceLogWorker] ❌ Worker loop exception:", err.message);
    } finally {
      isProcessing = false;
    }
  }, 3000);
}

module.exports = { startVoiceLogWorker };
