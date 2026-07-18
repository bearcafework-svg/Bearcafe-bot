// src/features/stickyPanels.js
// ระบบปักหมุดข้อความหนึบท้ายห้อง (Sticky Message) ประจำห้องแบบอัปเดตเรียลไทม์ผ่าน Supabase Realtime DB
// รองรับแบบ Hybrid: โหลดความทรงจำเงียบ ๆ และรีเฟรชส่งใหม่ทันทีเมื่อแอดมินสั่ง Force Refresh / เพิ่มห้องใหม่

const { createClient } = require("@supabase/supabase-js");

// เก็บโครงสร้างการตั้งค่าของแต่ละแชนแนล (Sync กับ Database)
// key: channelId, value: { delayMs: number, payload: any, refreshTrigger: number }
const stickyConfigs = new Map();

// Map เพื่อเก็บสถานะการส่งข้อความปักหมุด (Timeout และ Bot Message ID ล่าสุด)
// key: channelId, value: { lastBotMessageId: string | null, timeoutId: NodeJS.Timeout | null }
const activeStickySessions = new Map();

function setupStickyPanels(client) {
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

  // ส่งบอร์ดใหม่ลง Discord ทันที (ลบแผ่นเก่าออกและส่งใหม่)
  async function triggerInstantSend(channelId, payload) {
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
      if (session.lastBotMessageId) {
        const msgToDeleteId = session.lastBotMessageId;
        session.lastBotMessageId = null;
        console.log(`[stickyPanels] Attempting to delete old message ${msgToDeleteId} in channel ${channelId}`);
        channel.messages.fetch(msgToDeleteId)
          .then((oldMsg) => {
            oldMsg.delete()
              .then(() => console.log(`[stickyPanels] Successfully deleted old message ${msgToDeleteId}`))
              .catch((delErr) => console.log(`[stickyPanels] Failed to delete message ${msgToDeleteId} (maybe already deleted):`, delErr.message));
          })
          .catch((fetchMsgErr) => {
            console.log(`[stickyPanels] Old message ${msgToDeleteId} not found in channel history:`, fetchMsgErr.message);
          });
      }

      // C. ส่งประกาศบอร์ดใหม่ทันที
      console.log(`[stickyPanels] Sending new sticky payload to channel ${channelId}...`);
      const sentMsg = await channel.send(payload);
      session.lastBotMessageId = sentMsg.id;
      console.log(`[stickyPanels] New sticky message sent successfully! ID: ${sentMsg.id}`);
    } catch (err) {
      console.error(`[stickyPanels] Failed to send instant sticky message to channel ${channelId}:`, err.message);
    }
  }

  // 1. ดึงการตั้งค่าห้องจาก DB ตอนบอทเริ่มทำงาน
  async function loadInitialConfigs() {
    try {
      console.log("[stickyPanels] Querying initial configurations from sticky_channels table...");
      const { data, error } = await supabase
        .from("sticky_channels")
        .select("channel_id, delay_ms, payload, refresh_trigger");

      if (error) throw error;

      if (data) {
        for (const row of data) {
          stickyConfigs.set(row.channel_id, {
            delayMs: row.delay_ms,
            payload: row.payload,
            refreshTrigger: row.refresh_trigger || 0
          });
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
            stickyConfigs.set(newRow.channel_id, {
              delayMs: newRow.delay_ms,
              payload: newRow.payload,
              refreshTrigger: newRow.refresh_trigger || 0
            });

            // ตรวจสอบว่าเป็นเคสที่ต้องอัปเดตและส่งทันที
            const isInsert = eventType === "INSERT";
            const isForceRefresh = eventType === "UPDATE" && 
                                   (!oldConfig || (newRow.refresh_trigger || 0) !== (oldConfig.refreshTrigger || 0));

            if (isInsert || isForceRefresh) {
              console.log(`[stickyPanels] Triggering instant resend for channel ${newRow.channel_id} (isInsert: ${isInsert}, isForceRefresh: ${isForceRefresh})`);
              await triggerInstantSend(newRow.channel_id, newRow.payload);
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
      if (err) {
        console.error("[stickyPanels] Realtime subscription error details:", err);
      }
    });
  }

  // เรียกโหลดข้อมูลและสมัครสมาชิกเรียลไทม์
  loadInitialConfigs();
  setupRealtimeSync();

  // 3. จัดการข้อความเมื่อมีคนแชท
  client.on("messageCreate", async (message) => {
    // ข้ามถ้าไม่ใช่ในกิลด์ หรือส่งมาจากตัวบอทเอง
    if (!message.guild || message.author.id === client.user.id) return;

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

    // A. สั่งลบข้อความบอทเดิมทันที (ถ้าจำไอดีได้)
    if (session.lastBotMessageId) {
      const msgToDeleteId = session.lastBotMessageId;
      session.lastBotMessageId = null; // เคลียร์ออกก่อนเพื่อป้องกันการสั่งลบซ้ำซ้อน

      message.channel.messages.fetch(msgToDeleteId)
        .then((oldMsg) => {
          oldMsg.delete().catch(() => {});
        })
        .catch(() => {
          // ข้ามกรณีดึงข้อความเก่าไม่สำเร็จ (เช่น โดนลบไปก่อนแล้ว)
        });
    }

    // B. ยกเลิกตัวจับเวลาการส่งเดิม (เพราะมีคนใหม่พิมพ์เข้ามาดันแชทแล้ว)
    if (session.timeoutId) {
      clearTimeout(session.timeoutId);
      session.timeoutId = null;
    }

    // C. ตั้งเวลาดีเลย์ใหม่เพื่อส่ง Component v2 ใหม่เมื่อห้องเงียบลง
    const delay = channelConfig.delayMs || 6000;
    session.timeoutId = setTimeout(async () => {
      try {
        const sentMsg = await message.channel.send(channelConfig.payload);
        session.lastBotMessageId = sentMsg.id;
      } catch (err) {
        console.error(`[stickyPanels] Failed to send sticky message to channel ${channelId}:`, err.message);
      }
    }, delay);
  });

  console.log("[stickyPanels] Module loaded successfully");
}

module.exports = { setupStickyPanels };
