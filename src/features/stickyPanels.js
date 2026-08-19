// src/features/stickyPanels.js
// ระบบปักหมุดข้อความหนึบท้ายห้อง (Sticky Message) ประจำห้องแบบอัปเดตเรียลไทม์ผ่าน Supabase Realtime DB
// ป้องกันการค้างของข้อความเก่า 100% ด้วย Hybrid Cache + Deep Fallback Cleanup + Concurrency Lock

const { createClient } = require("@supabase/supabase-js");
const logger = require("../../utils/logger");

// เก็บโครงสร้างการตั้งค่าของแต่ละแชนแนล (Sync กับ Database)
// key: channelId, value: { delayMs: number, payload: any, refreshTrigger: number }
const stickyConfigs = new Map();

// Map เพื่อเก็บสถานะการส่งข้อความปักหมุด
// key: channelId, value: { lastBotMessageId: string | null, timeoutId: NodeJS.Timeout | null, isBusy: boolean }
const activeStickySessions = new Map();

function setupStickyPanels(client) {
  const isLocal = process.env.LOCAL_FAST_START === "true" || process.env.DISABLE_BACKGROUND_SERVICES === "true" || process.env.DISABLE_STICKY_PANELS === "true";
  if (isLocal) {
    console.log("[stickyPanels] ⏭️ Skipping setupStickyPanels in Local/Dev mode.");
    return;
  }
  console.log("[stickyPanels] Initializing setupStickyPanels...");

  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseKey) {
    console.error("[stickyPanels] Critical: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing from environment variables.");
    return;
  }

  const supabase = createClient(supabaseUrl, supabaseKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });

  // ─── Helper: ทำความสะอาดและตรวจเช็ก Payload ของ Discord ────────────────────
  function sanitizePayload(payload) {
    if (!payload || typeof payload !== "object") return payload;

    const clone = JSON.parse(JSON.stringify(payload));

    function cleanComponent(comp) {
      if (!comp || typeof comp !== "object") return comp;

      // Type 2: Button
      if (comp.type === 2) {
        const isLinkButton = comp.style === 5 || (typeof comp.url === "string" && comp.url.trim().length > 0);
        if (isLinkButton) {
          comp.style = 5;
          delete comp.custom_id;
        } else {
          delete comp.url;
        }
      }

      if (Array.isArray(comp.components)) {
        comp.components.forEach(cleanComponent);
      }
      if (Array.isArray(comp.items)) {
        comp.items.forEach(cleanComponent);
      }

      return comp;
    }

    if (Array.isArray(clone.components)) {
      clone.components.forEach(cleanComponent);
    }

    return clone;
  }

  // ─── Helper: บันทึก last_message_id ลง Supabase Database ──────────────────
  async function saveLastMessageId(channelId, messageId) {
    try {
      await supabase
        .from("sticky_channels")
        .update({ last_message_id: messageId })
        .eq("channel_id", channelId);
      console.log(`[stickyPanels] Persisted last_message_id (${messageId}) to DB for channel ${channelId}`);
    } catch (err) {
      console.warn(`[stickyPanels] Failed to save last_message_id for channel ${channelId}:`, err.message);
    }
  }

  // ─── Helper: ลบข้อความเดิมในห้อง + กวาดล้างข้อความบอทที่ตกค้าง (Fallback Cleanup) ───
  async function deleteOldStickyMessage(channel, session) {
    if (!channel) return;

    // 1. ลบจาก lastBotMessageId ที่บันทึกไว้ใน Session ก่อน
    const targetMsgId = session ? session.lastBotMessageId : null;
    if (targetMsgId) {
      try {
        const oldMsg = await channel.messages.fetch(targetMsgId).catch(() => null);
        if (oldMsg) {
          await oldMsg.delete().catch(() => null);
          console.log(`[stickyPanels] Deleted recorded sticky message ${targetMsgId} in channel ${channel.id}`);
        }
      } catch (err) {
        // ignore fetch error
      }
      if (session) session.lastBotMessageId = null;
    }

    // 2. Fallback Scan: สแกนข้อความล่าสุด 10 ข้อความในห้องเพื่อกวาดลบข้อความ Sticky เก่าของบอทที่ตกค้าง (Ghost Messages)
    try {
      const recentMessages = await channel.messages.fetch({ limit: 10 }).catch(() => null);
      if (recentMessages && recentMessages.size > 0) {
        const botId = client.user?.id;
        if (botId) {
          const ghostMessages = recentMessages.filter(
            (msg) => msg.author.id === botId && msg.id !== targetMsgId
          );

          for (const [, ghostMsg] of ghostMessages) {
            // ลบข้อความของบอทที่ตกค้างออกทั้งหมด
            await ghostMsg.delete().catch(() => null);
            console.log(`[stickyPanels] Cleaned up ghost/orphan sticky message ${ghostMsg.id} in channel ${channel.id}`);
          }
        }
      }
    } catch (err) {
      console.warn(`[stickyPanels] Fallback cleanup error in channel ${channel.id}:`, err.message);
    }
  }

  // ─── Helper: ประมวลผลและส่ง Sticky Panel แผ่นใหม่ลงห้องอย่างปลอดภัย ────────
  async function performSendSticky(channelId, rawPayload) {
    let session = activeStickySessions.get(channelId);
    if (!session) {
      session = { lastBotMessageId: null, timeoutId: null, isBusy: false };
      activeStickySessions.set(channelId, session);
    }

    // ถ้ากำลังทำงานอยู่ (ติด Lock) ให้ข้าม เพื่อป้องกัน Race Condition
    if (session.isBusy) {
      console.log(`[stickyPanels] Channel ${channelId} is currently busy processing. Skipping duplicate send.`);
      return;
    }

    session.isBusy = true;

    try {
      const channel = client.channels.cache.get(channelId) || 
                      await client.channels.fetch(channelId).catch((fetchErr) => {
                        console.error(`[stickyPanels] Failed to fetch channel ${channelId}:`, fetchErr.message);
                        return null;
                      });

      if (!channel) {
        console.error(`[stickyPanels] Channel ${channelId} not found.`);
        return;
      }

      // A. ลบข้อความเดิมและกวาดล้างข้อความผีในห้อง
      await deleteOldStickyMessage(channel, session);

      // B. ส่งข้อความ Sticky ใหม่
      const payload = sanitizePayload(rawPayload);
      const sentMsg = await channel.send(payload);
      session.lastBotMessageId = sentMsg.id;
      console.log(`[stickyPanels] Sent new sticky message ${sentMsg.id} in channel ${channelId}`);

      // C. บันทึก ID ลง DB
      await saveLastMessageId(channelId, sentMsg.id);
    } catch (err) {
      console.error(`[stickyPanels] Error sending sticky message to channel ${channelId}:`, err.message);
    } finally {
      session.isBusy = false;
    }
  }

  // ส่งบอร์ดใหม่ลง Discord ทันที (เช่น ตอน Config ถูกแก้ หรือสั่ง Force Refresh)
  async function triggerInstantSend(channelId, rawPayload) {
    console.log(`[stickyPanels] triggerInstantSend called for channel: ${channelId}`);
    let session = activeStickySessions.get(channelId);
    if (session && session.timeoutId) {
      clearTimeout(session.timeoutId);
      session.timeoutId = null;
    }
    await performSendSticky(channelId, rawPayload);
  }

  // 1. ดึงการตั้งค่าห้องและ last_message_id จาก DB ตอนบอทเริ่มทำงาน
  async function loadInitialConfigs() {
    try {
      console.log("[stickyPanels] Querying initial configurations from sticky_channels table...");
      const { data, error } = await supabase
        .from("sticky_channels")
        .select("channel_id, delay_ms, payload, refresh_trigger, last_message_id");

      if (error) throw error;

      if (data) {
        for (const row of data) {
          stickyConfigs.set(row.channel_id, {
            delayMs: row.delay_ms,
            payload: sanitizePayload(row.payload),
            refreshTrigger: row.refresh_trigger || 0
          });

          // โหลดและจดจำ last_message_id ล่าสุดข้ามการรีสตาร์ตบอท
          activeStickySessions.set(row.channel_id, {
            lastBotMessageId: row.last_message_id || null,
            timeoutId: null,
            isBusy: false
          });

          if (row.last_message_id) {
            console.log(`[stickyPanels] Restored last_message_id (${row.last_message_id}) for channel ${row.channel_id} from database.`);
          }
        }
        console.log(`[stickyPanels] Loaded ${stickyConfigs.size} sticky channel configs from database.`);
      }
    } catch (err) {
      console.error("[stickyPanels] Failed to load initial configs from DB:", err.message);
    }
  }

  // 2. สมัครรับการแจ้งเตือน Realtime เพื่อซิงค์หน่วยความจำบอทและสั่งทำงานแบบ Instant
  function setupRealtimeSync() {
    console.log("[stickyPanels] Subscribing to Supabase Realtime changes for sticky_channels...");
    
    const realtimeChannel = supabase
      .channel("sticky_channels_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sticky_channels" },
        async (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload;
          console.log(`[stickyPanels] Realtime Event Received: ${eventType} on table sticky_channels`);
          
          if (eventType === "INSERT" || eventType === "UPDATE") {
            const oldConfig = stickyConfigs.get(newRow.channel_id);
            const sanitizedNewPayload = sanitizePayload(newRow.payload);
            stickyConfigs.set(newRow.channel_id, {
              delayMs: newRow.delay_ms,
              payload: sanitizedNewPayload,
              refreshTrigger: newRow.refresh_trigger || 0
            });

            // ซิงค์ last_message_id ถ้ามีการอัปเดตจากภายนอก
            let session = activeStickySessions.get(newRow.channel_id);
            if (!session) {
              session = { lastBotMessageId: newRow.last_message_id || null, timeoutId: null, isBusy: false };
              activeStickySessions.set(newRow.channel_id, session);
            } else if (newRow.last_message_id && newRow.last_message_id !== session.lastBotMessageId) {
              session.lastBotMessageId = newRow.last_message_id;
            }

            // ตรวจสอบเงื่อนไข Force Refresh หรือเพิ่งสร้างใหม่
            const isInsert = eventType === "INSERT";
            const isForceRefresh = eventType === "UPDATE" && 
                                   oldConfig && 
                                   (newRow.refresh_trigger || 0) !== (oldConfig.refreshTrigger || 0);

            if (isInsert || isForceRefresh) {
              console.log(`[stickyPanels] Triggering instant resend for channel ${newRow.channel_id} (isInsert: ${isInsert}, isForceRefresh: ${isForceRefresh})`);
              await triggerInstantSend(newRow.channel_id, sanitizedNewPayload);
            } else {
              console.log(`[stickyPanels] Silently updated config in memory for channel ${newRow.channel_id}`);
            }
          } else if (eventType === "DELETE") {
            console.log(`[stickyPanels] Channel ${oldRow.channel_id} config was deleted. Cleaning up sticky messages...`);
            
            const session = activeStickySessions.get(oldRow.channel_id);
            if (session && session.timeoutId) {
              clearTimeout(session.timeoutId);
            }

            // ลบข้อความที่ยังค้างอยู่ในห้อง Discord ออกทันที
            try {
              const channel = client.channels.cache.get(oldRow.channel_id) ||
                              await client.channels.fetch(oldRow.channel_id).catch(() => null);
              if (channel) {
                await deleteOldStickyMessage(channel, session);
              }
            } catch (err) {
              console.warn(`[stickyPanels] Failed to delete sticky on channel removal:`, err.message);
            }

            stickyConfigs.delete(oldRow.channel_id);
            activeStickySessions.delete(oldRow.channel_id);
            console.log(`[stickyPanels] Successfully removed sticky config and sessions for channel ${oldRow.channel_id}`);
          }
        }
      );

    realtimeChannel.subscribe((status, err) => {
      console.log(`[stickyPanels] Realtime subscription status: ${status}`);
      if (err && status !== "CHANNEL_ERROR") {
        console.error("[stickyPanels] Realtime subscription error details:", err.message || err);
      } else if (status === "CHANNEL_ERROR") {
        console.warn("[stickyPanels] Realtime connection transport flicker (auto-reconnecting...)");
      }
    });
  }

  // เรียกโหลดข้อมูลและสมัครสมาชิกเรียลไทม์
  loadInitialConfigs();
  setupRealtimeSync();

  // 3. จัดการข้อความเมื่อมีแชทเข้ามาในห้อง
  client.on("messageCreate", async (message) => {
    // ข้ามถ้าไม่ใช่ในกิลด์ หรือเป็นข้อความของตัวบอทเอง
    if (!message.guild) return;
    if (message.author.id === client.user.id) return;

    const channelId = message.channel.id;
    const channelConfig = stickyConfigs.get(channelId);

    // ถ้าไม่ใช่ห้องที่ตั้งค่าไว้สำหรับปักหมุดข้อความหนึบ ให้ข้ามไป
    if (!channelConfig) return;

    let session = activeStickySessions.get(channelId);
    if (!session) {
      session = { lastBotMessageId: null, timeoutId: null, isBusy: false };
      activeStickySessions.set(channelId, session);
    }

    // A. สั่งลบข้อความบอทเดิมทันที
    await deleteOldStickyMessage(message.channel, session);

    // B. ยกเลิกตัวจับเวลาการส่งเดิม
    if (session.timeoutId) {
      clearTimeout(session.timeoutId);
      session.timeoutId = null;
    }

    // C. ตั้งเวลาดีเลย์ใหม่เพื่อส่ง Sticky Panel ใหม่เมื่อห้องเงียบลง
    const delay = channelConfig.delayMs || 6000;
    session.timeoutId = setTimeout(async () => {
      session.timeoutId = null;
      await performSendSticky(channelId, channelConfig.payload);
    }, delay);
  });

  console.log("[stickyPanels] Module loaded successfully");
}

module.exports = { setupStickyPanels };
