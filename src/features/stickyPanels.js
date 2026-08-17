// src/features/stickyPanels.js
// ระบบปักหมุดข้อความหนึบท้ายห้อง (Sticky Message) ประจำห้องแบบอัปเดตเรียลไทม์ผ่าน Supabase Realtime DB
// รองรับแบบ Hybrid: โหลดความทรงจำและจดจำ last_message_id บน DB เพื่อป้องกันการสแปมและรองรับกรณีบอทรีสตาร์ต

const { createClient } = require("@supabase/supabase-js");
const logger = require("../../utils/logger");

// เก็บโครงสร้างการตั้งค่าของแต่ละแชนแนล (Sync กับ Database)
// key: channelId, value: { delayMs: number, payload: any, refreshTrigger: number }
const stickyConfigs = new Map();

// Map เพื่อเก็บสถานะการส่งข้อความปักหมุด (Timeout และ Bot Message ID ล่าสุด)
// key: channelId, value: { lastBotMessageId: string | null, timeoutId: NodeJS.Timeout | null }
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
  // แก้ไขปัญหา BUTTON_COMPONENT_CUSTOM_ID_URL_MUTUALLY_EXCLUSIVE
  // ปุ่มประเภท Link (style: 5 หรือมี url) ห้ามมี custom_id ติดไปด้วยเด็ดขาด
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

  // ─── Helper: ลบข้อความเดิมในห้อง (พร้อมรองรับกรณีข้อความหาย/ลบไปแล้ว) ───────
  async function deleteOldStickyMessage(channel, session) {
    if (!session || !session.lastBotMessageId) return;

    const msgToDeleteId = session.lastBotMessageId;
    session.lastBotMessageId = null; // เคลียร์ออกก่อนเพื่อป้องกันการสั่งลบซ้ำซ้อน

    try {
      console.log(`[stickyPanels] Attempting to delete old sticky message ${msgToDeleteId} in channel ${channel.id}`);
      const oldMsg = await channel.messages.fetch(msgToDeleteId).catch(() => null);
      if (oldMsg) {
        await oldMsg.delete().catch((delErr) => {
          console.log(`[stickyPanels] Old message ${msgToDeleteId} delete failed (maybe already deleted):`, delErr.message);
        });
        console.log(`[stickyPanels] Successfully deleted old sticky message ${msgToDeleteId}`);
      } else {
        console.log(`[stickyPanels] Old sticky message ${msgToDeleteId} was missing or already deleted manually.`);
      }
    } catch (err) {
      console.log(`[stickyPanels] Error checking old sticky message ${msgToDeleteId}:`, err.message);
    }
  }

  // ส่งบอร์ดใหม่ลง Discord ทันที (ลบแผ่นเก่าออกและส่งใหม่)
  async function triggerInstantSend(channelId, rawPayload) {
    console.log(`[stickyPanels] triggerInstantSend called for channel: ${channelId}`);
    try {
      const channel = client.channels.cache.get(channelId) || 
                      await client.channels.fetch(channelId).catch((fetchErr) => {
                        console.error(`[stickyPanels] Failed to fetch channel ${channelId}:`, fetchErr.message);
                        return null;
                      });
      if (!channel) {
        console.error(`[stickyPanels] Channel ${channelId} not found in client cache or API fetch.`);
        return;
      }

      let session = activeStickySessions.get(channelId);
      if (!session) {
        session = { lastBotMessageId: null, timeoutId: null };
        activeStickySessions.set(channelId, session);
      }

      // A. เคลียร์ Timeout เก่าที่อาจจะรันค้างอยู่
      if (session.timeoutId) {
        console.log(`[stickyPanels] Clearing pending timeout for channel ${channelId}`);
        clearTimeout(session.timeoutId);
        session.timeoutId = null;
      }

      // B. ลบข้อความเดิมในห้อง (ถ้ามี)
      await deleteOldStickyMessage(channel, session);

      // C. ทำความสะอาด Payload และส่งประกาศบอร์ดใหม่ทันที
      const payload = sanitizePayload(rawPayload);
      console.log(`[stickyPanels] Sending new sticky payload to channel ${channelId}...`);
      const sentMsg = await channel.send(payload);
      session.lastBotMessageId = sentMsg.id;
      console.log(`[stickyPanels] New sticky message sent successfully! ID: ${sentMsg.id}`);

      // D. บันทึก Message ID ใหม่ลง Database ทันที
      await saveLastMessageId(channelId, sentMsg.id);
    } catch (err) {
      console.error(`[stickyPanels] Failed to send instant sticky message to channel ${channelId}:`, err.message);
    }
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
          if (row.last_message_id) {
            activeStickySessions.set(row.channel_id, {
              lastBotMessageId: row.last_message_id,
              timeoutId: null
            });
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

            // ซิงค์ last_message_id ถ้ามีการอัปเดตจากที่อื่น
            let session = activeStickySessions.get(newRow.channel_id);
            if (!session) {
              session = { lastBotMessageId: newRow.last_message_id || null, timeoutId: null };
              activeStickySessions.set(newRow.channel_id, session);
            } else if (newRow.last_message_id && newRow.last_message_id !== session.lastBotMessageId) {
              session.lastBotMessageId = newRow.last_message_id;
            }

            // ตรวจสอบว่าเป็นเคสที่ต้องอัปเดตและส่งทันที
            const isInsert = eventType === "INSERT";
            const isForceRefresh = eventType === "UPDATE" && 
                                   (!oldConfig || (newRow.refresh_trigger || 0) !== (oldConfig.refreshTrigger || 0));

            if (isInsert || isForceRefresh) {
              console.log(`[stickyPanels] Triggering instant resend for channel ${newRow.channel_id} (isInsert: ${isInsert}, isForceRefresh: ${isForceRefresh})`);
              await triggerInstantSend(newRow.channel_id, sanitizedNewPayload);
            } else {
              console.log(`[stickyPanels] Silently updated config in memory for channel ${newRow.channel_id}`);
            }
          } else if (eventType === "DELETE") {
            stickyConfigs.delete(oldRow.channel_id);
            console.log(`[stickyPanels] Removed sticky config for channel ${oldRow.channel_id}`);
            
            // เคลียร์เวลารอส่งที่ค้างอยู่ของช่องนั้นออก
            const session = activeStickySessions.get(oldRow.channel_id);
            if (session) {
              if (session.timeoutId) {
                clearTimeout(session.timeoutId);
              }
              activeStickySessions.delete(oldRow.channel_id);
            }
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

  // 3. จัดการข้อความเมื่อมีแชท/Embed/Component v2 เข้ามาในห้อง
  client.on("messageCreate", async (message) => {
    // ข้ามถ้าไม่ใช่ในกิลด์
    if (!message.guild) return;

    const channelId = message.channel.id;
    const channelConfig = stickyConfigs.get(channelId);

    // ถ้าไม่ใช่ห้องที่ตั้งค่าไว้สำหรับปักหมุดข้อความหนึบ ให้ข้ามไป
    if (!channelConfig) return;

    // ดึงเซสชันเดิม หรือสร้างขึ้นมาใหม่หากไม่มี
    let session = activeStickySessions.get(channelId);
    if (!session) {
      session = { lastBotMessageId: null, timeoutId: null };
      activeStickySessions.set(channelId, session);
    }

    // ข้ามเฉพาะข้อความปักหมุด Sticky Panel ของตัวเองเท่านั้น
    if (session.lastBotMessageId && message.id === session.lastBotMessageId) return;

    // A. สั่งลบข้อความบอทเดิมทันที (ถ้ามีจำไอดีไว้ในหน่วยความจำหรือ DB)
    await deleteOldStickyMessage(message.channel, session);

    // B. ยกเลิกตัวจับเวลาการส่งเดิม (เพราะมีคนใหม่พิมพ์เข้ามาดันแชทแล้ว)
    if (session.timeoutId) {
      clearTimeout(session.timeoutId);
      session.timeoutId = null;
    }

    // C. ตั้งเวลาดีเลย์ใหม่เพื่อส่ง Component v2 ใหม่เมื่อห้องเงียบลง
    const delay = channelConfig.delayMs || 6000;
    session.timeoutId = setTimeout(async () => {
      try {
        const payload = sanitizePayload(channelConfig.payload);
        const sentMsg = await message.channel.send(payload);
        session.lastBotMessageId = sentMsg.id;
        console.log(`[stickyPanels] Sent new sticky message ${sentMsg.id} in channel ${channelId}`);

        // บันทึก Message ID ใหม่ลง Database ทันที
        await saveLastMessageId(channelId, sentMsg.id);
      } catch (err) {
        console.error(`[stickyPanels] Failed to send sticky message to channel ${channelId}:`, err.message);
      }
    }, delay);
  });

  console.log("[stickyPanels] Module loaded successfully");
}

module.exports = { setupStickyPanels };
