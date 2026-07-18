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
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  // ส่งบอร์ดใหม่ลง Discord ทันที (ลบแผ่นเก่าออกและส่งใหม่)
  async function triggerInstantSend(channelId, payload) {
    try {
      const channel = client.channels.cache.get(channelId) || 
                      await client.channels.fetch(channelId).catch(() => null);
      if (!channel) {
        console.error(`[stickyPanels] Channel ${channelId} not found for instant resend.`);
        return;
      }

      let session = activeStickySessions.get(channelId);
      if (!session) {
        session = { lastBotMessageId: null, timeoutId: null };
        activeStickySessions.set(channelId, session);
      }

      // A. เคลียร์ Timeout เก่าที่อาจจะรันค้างอยู่
      if (session.timeoutId) {
        clearTimeout(session.timeoutId);
        session.timeoutId = null;
      }

      // B. ลบข้อความเดิมในห้อง (ถ้ามี)
      if (session.lastBotMessageId) {
        const msgToDeleteId = session.lastBotMessageId;
        session.lastBotMessageId = null;
        channel.messages.fetch(msgToDeleteId)
          .then((oldMsg) => {
            oldMsg.delete().catch(() => {});
          })
          .catch(() => {});
      }

      // C. ส่งประกาศบอร์ดใหม่ทันที
      const sentMsg = await channel.send(payload);
      session.lastBotMessageId = sentMsg.id;
    } catch (err) {
      console.error(`[stickyPanels] Failed to send instant sticky message to channel ${channelId}:`, err.message);
    }
  }

  // 1. ดึงการตั้งค่าห้องจาก DB ตอนบอทเริ่มทำงาน
  async function loadInitialConfigs() {
    try {
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
    supabase
      .channel("sticky_channels_realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "sticky_channels" },
        async (payload) => {
          const { eventType, new: newRow, old: oldRow } = payload;
          
          if (eventType === "INSERT" || eventType === "UPDATE") {
            const oldConfig = stickyConfigs.get(newRow.channel_id);
            stickyConfigs.set(newRow.channel_id, {
              delayMs: newRow.delay_ms,
              payload: newRow.payload,
              refreshTrigger: newRow.refresh_trigger || 0
            });

            // ตรวจสอบว่าเป็นเคสที่ต้องอัปเดตและส่งทันที
            // เคสที่ 1: เพิ่งใส่ช่องแชทเข้ามาใหม่ครั้งแรก (INSERT)
            // เคสที่ 2: เป็นการแก้ไขและสั่ง Force Refresh (เช็กเลข refresh_trigger ที่ต่างจากตัวแปรเดิมในแรม)
            const isInsert = eventType === "INSERT";
            const isForceRefresh = eventType === "UPDATE" && 
                                   oldConfig && 
                                   (newRow.refresh_trigger || 0) !== (oldConfig.refreshTrigger || 0);

            if (isInsert || isForceRefresh) {
              console.log(`[stickyPanels] Realtime Sync: Triggering instant resend for channel ${newRow.channel_id}`);
              await triggerInstantSend(newRow.channel_id, newRow.payload);
            } else {
              console.log(`[stickyPanels] Realtime Sync: Silently updated config for channel ${newRow.channel_id}`);
            }
          } else if (eventType === "DELETE") {
            stickyConfigs.delete(oldRow.channel_id);
            console.log(`[stickyPanels] Realtime Sync: Removed sticky config for channel ${oldRow.channel_id}`);
            
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
      )
      .subscribe();
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
