// src/main/features/healJai/index.js — ระบบบริการ Bear Cafe ฮีลใจ (Heal Jai System)
// ครอบคลุม: ข้อตกลง (Agreement), สั่งเมนู (Menu), Ticket ชำระเงิน, ตอกบัตรเข้ากะ (Shift Panel), และรีวิว (Feedback)

const { createClient } = require("@supabase/supabase-js");
const {
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder
} = require("discord.js");
const config = require("../../../config");
const { registerCommand, registerAutocomplete } = require("../../interactions/router");
const {
  FLAG_V2,
  FLAG_EPHEMERAL,
  SERVICE_MODES,
  DRINK_OPTIONS,
  TOPPING_OPTIONS,
  MOCK_COUNSELORS,
  buildAgreementPayload,
  buildMainMenuPayload,
  buildShiftPanelPayload,
  buildCheckoutTicketPayload,
  buildInteractiveMenuPayload,
  buildInteractiveOrderPayload,
  buildScanToPayPayload,
  buildDispatchAlertPayload,
  buildSessionDashboardPayload,
  buildFeedbackPromptPayload,
  buildPublicReviewShowcasePayload,
  buildReviewModal,
  buildCounselorCardPayload,
  buildEditProfileModal,
  buildAdminDashboardPayload,
  buildAdminManageCasePayload,
  buildDailyReportPayload,
  buildAdminCounselorSelectPayload,
  buildAdminCounselorEditPayload,
  buildAdminEditCounselorModal,
  buildCounselorWalletHistoryPayload,
  ALL_SPECIALTIES
} = require("./healJaiPayloads");

const CUSTOM_IDS = {
  VIEW_FULL_TERMS: "heal_jai_view_full_terms",
  ACCEPT_TERMS: "heal_jai_accept_terms",
  OPEN_MENU: "heal_jai_open_menu",
  MODE_CHAT: "heal_jai_mode_chat",
  MODE_VOICE: "heal_jai_mode_voice",
  DRINK_TEA_39: "heal_jai_drink_tea_39",
  DRINK_COCOA_69: "heal_jai_drink_cocoa_69",
  DRINK_COFFEE_129: "heal_jai_drink_coffee_129",
  TOPPING_SILENT: "heal_jai_topping_silent",
  TOPPING_SPECIFIC: "heal_jai_topping_specific",
  TOPPING_NONE: "heal_jai_topping_none",
  SELECT_COUNSELOR: "heal_jai_select_counselor",
  RESET_ORDER: "heal_jai_reset_order",
  BTN_PAY: "heal_jai_btn_pay",
  BTN_CANCEL_PROMPT: "heal_jai_btn_cancel_prompt",
  CONFIRM_CANCEL_TICKET: "heal_jai_confirm_cancel_ticket",
  ABORT_CANCEL_TICKET: "heal_jai_abort_cancel_ticket",
  CANCEL_ORDER: "btn_cancel_order",
  CALL_ADMIN: "btn_call_admin",
  PAID_CONFIRM: "heal_jai_paid_confirm",
  CANCEL_TICKET: "heal_jai_cancel_ticket",
  SHIFT_ONLINE: "heal_jai_shift_online",
  SHIFT_BREAK: "heal_jai_shift_break",
  SHIFT_OFFLINE: "heal_jai_shift_offline",
  COUNSELOR_WALLET: "heal_jai_counselor_wallet",
  COUNSELOR_EDIT_PROFILE: "heal_jai_counselor_edit_profile",
  COUNSELOR_SPECIALTIES: "heal_jai_counselor_specialties",
  SELECT_SPECIALTIES: "heal_jai_select_specialties",
  MODAL_EDIT_PROFILE: "heal_jai_modal_edit_profile",
  CLAIM_CASE: "heal_jai_claim_case",
  PASS_CASE: "heal_jai_pass_case",
  START_SESSION: "heal_jai_start_session",
  END_SESSION: "heal_jai_end_session",
  RATE_5: "heal_jai_rate_5",
  RATE_4: "heal_jai_rate_4",
  RATE_3: "heal_jai_rate_3",
  RATE_2: "heal_jai_rate_2",
  RATE_1: "heal_jai_rate_1",
  WRITE_REVIEW: "heal_jai_write_review"
};

// ── Role & Channel Constants ──────────────────────────────────────────
const VERIFIED_ROLE_ID = "1545271910328180777"; // บทบาท "ยืนยัน"
const COUNSELOR_ROLE_ID = "1536208070420733982"; // บทบาท "ผู้ให้คำปรึกษา"
const STAFF_ROLE_ID = (config.healJai && config.healJai.staffRoleId) || "1536208040582316032"; // บทบาท "แอดมิน"

const TERMS_CHANNEL_ID = "1536199708593365084"; // 1️⃣︰อ่านข้อตกลงและนโยบาย
const MENU_CHANNEL_ID = "1536206516359532665"; // 2️⃣︰เลือกเมนูเครื่องดื่ม
const SHIFT_CHANNEL_ID = "1545239851958538270"; // ⚙️︰ตอกบัตรเข้ากะ
const DISPATCH_CHANNEL_ID = "1545239933265121311"; // 🔔︰แจ้งเตือนรับเคส
const VOICE_STATS_COUNSELORS = "1549633022280867871"; // 🟢︰ผู้รับฟังพร้อมให้บริการ: X คน
const VOICE_STATS_CUPS = "1545240723958276157"; // 🍵︰เสิร์ฟความอบอุ่นไปแล้ว: X แก้ว
const PUBLIC_REVIEW_CHANNEL = "1545240537089703986"; // 🌟︰กล่องความประทับใจ
const ORDER_HISTORY_CHANNEL_ID = "1549710698702184539"; // 📁︰ประสัติ (Order History Logs)
const SESSION_CATEGORY_ID = "1545237654612869201"; // หมวดหมู่ห้อง Session (ฮีลใจ)

const TIMEOUT_MS = (config.healJai && config.healJai.timeoutMinutes ? config.healJai.timeoutMinutes : 15) * 60 * 1000;

// Memory map สำหรับเก็บสถานะการเลือกเมนูในห้อง Ticket (channelId -> { selectedDrink, selectedTopping })
const ticketSelections = new Map();

// สวิตช์สถานะเปิด-ปิดระบบบริการ Heal Jai (Maintenance Mode)
let isMaintenanceMode = false;

// สวิตช์สถานะเปิด-ปิดการกดข้อตกลงและนโยบาย (Terms Acceptance Toggle)
let isTermsDisabled = false;

/**
 * คำนวณสถิติภาพรวมสำหรับแผงควบคุมแอดมิน (Admin Stats)
 */
async function getAdminStats(guild) {
  const supabase = getSupabase();
  const stats = {
    isMaintenance: isMaintenanceMode,
    onlineCounselors: 0,
    activeSessions: 0,
    completedToday: 0,
    totalRevenueToday: 0,
    platformShareToday: 0,
    counselorShareToday: 0
  };

  if (!guild) return stats;

  if (supabase) {
    try {
      // 1. Online counselors
      const { count: counselorCount } = await supabase
        .from("heal_jai_counselors")
        .select("*", { count: "exact", head: true })
        .eq("guild_id", guild.id)
        .eq("status", "ONLINE");
      stats.onlineCounselors = counselorCount || 0;

      // 2. Active sessions
      const { count: activeCount } = await supabase
        .from("heal_jai_orders_sessions")
        .select("*", { count: "exact", head: true })
        .eq("guild_id", guild.id)
        .in("session_status", ["IN_PROGRESS", "WAITING_FOR_PROVIDER", "DISPATCHING"]);
      stats.activeSessions = activeCount || 0;

      // 3. Today's Bangkok start timestamp
      const now = new Date();
      const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
      const bangkokNow = new Date(utc + (3600000 * 7));
      const bangkokTodayStart = new Date(bangkokNow.getFullYear(), bangkokNow.getMonth(), bangkokNow.getDate(), 0, 0, 0);
      const startIso = bangkokTodayStart.toISOString();

      const { data: todayOrders } = await supabase
        .from("heal_jai_orders_sessions")
        .select("total_price, platform_share, counselor_share, session_status, created_at, ended_at")
        .eq("guild_id", guild.id)
        .eq("session_status", "COMPLETED")
        .gte("created_at", startIso);

      if (todayOrders && todayOrders.length > 0) {
        stats.completedToday = todayOrders.length;
        stats.totalRevenueToday = todayOrders.reduce((acc, o) => acc + Number(o.total_price || 0), 0);
        stats.platformShareToday = todayOrders.reduce((acc, o) => acc + Number(o.platform_share || 0), 0);
        stats.counselorShareToday = todayOrders.reduce((acc, o) => acc + Number(o.counselor_share || 0), 0);
      }
    } catch (e) {
      console.error("[HealJai] Error calculating admin stats:", e.message);
    }
  }

  return stats;
}

/**
 * ส่งรายงานสรุปยอดประจำวันไปยังห้องประวัติ/การเงิน (ORDER_HISTORY_CHANNEL_ID)
 */
async function sendDailyReport(guild) {
  const supabase = getSupabase();
  if (!guild || !supabase) return null;

  try {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const bangkokNow = new Date(utc + (3600000 * 7));
    const dateStr = `${bangkokNow.getDate().toString().padStart(2, '0')}/${(bangkokNow.getMonth() + 1).toString().padStart(2, '0')}/${bangkokNow.getFullYear()}`;

    const bangkokTodayStart = new Date(bangkokNow.getFullYear(), bangkokNow.getMonth(), bangkokNow.getDate(), 0, 0, 0);
    const startIso = bangkokTodayStart.toISOString();

    const { data: todayOrders } = await supabase
      .from("heal_jai_orders_sessions")
      .select("counselor_id, total_price, platform_share, counselor_share, session_status, created_at, ended_at")
      .eq("guild_id", guild.id)
      .eq("session_status", "COMPLETED")
      .gte("created_at", startIso);

    const totalOrders = todayOrders ? todayOrders.length : 0;
    const totalRevenue = todayOrders ? todayOrders.reduce((acc, o) => acc + Number(o.total_price || 0), 0) : 0;
    const platformShare = todayOrders ? todayOrders.reduce((acc, o) => acc + Number(o.platform_share || 0), 0) : 0;
    const counselorShare = todayOrders ? todayOrders.reduce((acc, o) => acc + Number(o.counselor_share || 0), 0) : 0;

    // Counselor breakdown
    const counselorMap = new Map();
    if (todayOrders) {
      for (const ord of todayOrders) {
        if (!ord.counselor_id) continue;
        const prev = counselorMap.get(ord.counselor_id) || { sessionCount: 0, earnedAmount: 0 };
        prev.sessionCount += 1;
        prev.earnedAmount += Number(ord.counselor_share || 0);
        counselorMap.set(ord.counselor_id, prev);
      }
    }

    const counselorBreakdown = Array.from(counselorMap.entries()).map(([counselorId, val]) => ({
      counselorId,
      sessionCount: val.sessionCount,
      earnedAmount: val.earnedAmount
    }));

    const payload = buildDailyReportPayload({
      dateStr,
      totalOrders,
      totalRevenue,
      platformShare,
      counselorShare,
      counselorBreakdown
    });

    const reportChannel = guild.channels.cache.get(ORDER_HISTORY_CHANNEL_ID) ||
                          await guild.channels.fetch(ORDER_HISTORY_CHANNEL_ID).catch(() => null);
    if (reportChannel) {
      return await reportChannel.send(payload).catch((e) => console.error("[HealJai] Failed to send daily report:", e.message));
    }
  } catch (err) {
    console.error("[HealJai] Error generating daily report:", err.message);
  }
  return null;
}

/**
 * ตั้งเวลารันส่งรายงานสรุปยอดประจำวันทุกเที่ยงคืน (00:00 น. ตามเวลาประเทศไทย)
 */
function scheduleDailyMidnightReport(client) {
  function getMsUntilBangkokMidnight() {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const bangkokNow = new Date(utc + (3600000 * 7));
    const bangkokMidnight = new Date(bangkokNow.getFullYear(), bangkokNow.getMonth(), bangkokNow.getDate() + 1, 0, 0, 5);
    return bangkokMidnight.getTime() - bangkokNow.getTime();
  }

  const msUntilMidnight = getMsUntilBangkokMidnight();
  console.log(`[HealJai] ⏰ Daily report scheduled in ${(msUntilMidnight / (1000 * 60)).toFixed(1)} minutes (Midnight Bangkok)`);

  setTimeout(async () => {
    const guildId = config.healJai?.guildId || "1536199707922141254";
    const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
    if (guild) {
      console.log("[HealJai] 📊 Sending Midnight Daily Report...");
      await sendDailyReport(guild);
    }
    // Repeat every 24 hours
    setInterval(async () => {
      const g = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
      if (g) await sendDailyReport(g);
    }, 24 * 60 * 60 * 1000);
  }, msUntilMidnight);
}

/**
 * ส่งการ์ดบันทึกประวัติคำสั่งซื้อไปยังห้อง 📁︰ประสัติ (1549710698702184539)
 */
async function sendOrderHistoryLog(guild, logData = {}) {
  if (!guild) return;
  try {
    const historyChannel = guild.channels.cache.get(ORDER_HISTORY_CHANNEL_ID) ||
                           await guild.channels.fetch(ORDER_HISTORY_CHANNEL_ID).catch(() => null);
    if (!historyChannel) {
      console.warn(`[HealJai] History channel ${ORDER_HISTORY_CHANNEL_ID} not found.`);
      return;
    }

    const {
      status = "INFO",
      orderCode = "-",
      customerId,
      counselorId,
      packageName,
      toppingName,
      totalPrice,
      slipUrl,
      extraInfo
    } = logData;

    let color = 0x5865F2;
    let title = `📁 บันทึกประวัติออเดอร์ [${orderCode}]`;

    switch (status) {
      case "CREATED":
        color = 0x5865F2; // Blurple
        title = `📝 บันทึกประวัติออเดอร์: เปิดห้องสั่งเครื่องดื่ม`;
        break;
      case "AWAITING_PAYMENT":
        color = 0xFEE75C; // Yellow
        title = `⏳ บันทึกประวัติออเดอร์: ยืนยันเลือกเมนูและรอชำระเงิน`;
        break;
      case "PAID":
        color = 0x57F287; // Green
        title = `💵 บันทึกประวัติออเดอร์: ชำระเงินสำเร็จ / ตรวจสลิปผ่าน`;
        break;
      case "CLAIMED":
        color = 0x3BA55D; // Dark Green
        title = `🍵 บันทึกประวัติออเดอร์: ที่ปรึกษากดรับงานแล้ว`;
        break;
      case "CANCELLED":
        color = 0xED4245; // Red
        title = `❌ บันทึกประวัติออเดอร์: ยกเลิกคำสั่งซื้อ`;
        break;
      case "COMPLETED":
        color = 0x9B59B6; // Purple
        title = `🎉 บันทึกประวัติออเดอร์: จบเซสชันเรียบร้อย`;
        break;
    }

    const embed = new EmbedBuilder()
      .setTitle(title)
      .setColor(color)
      .addFields(
        { name: "📋 รหัสออเดอร์", value: `\`${orderCode}\``, inline: true },
        { name: "👤 ลูกค้า", value: customerId ? `<@${customerId}>` : "-", inline: true },
        { name: "🍵 ผู้รับฟัง", value: counselorId ? `<@${counselorId}>` : "ยังไม่มีผู้รับงาน", inline: true },
        { name: "☕ เครื่องดื่ม / บริการ", value: packageName || "ยังไม่ได้เลือก", inline: true },
        { name: "🌱 ท็อปปิ้ง", value: toppingName || "ไม่มี", inline: true },
        { name: "💰 ยอดชำระ", value: totalPrice !== undefined && totalPrice !== null ? `${totalPrice} บาท` : "-", inline: true }
      )
      .setTimestamp();

    if (extraInfo) {
      embed.addFields({ name: "ℹ️ ข้อมูลเพิ่มเติม", value: extraInfo, inline: false });
    }

    if (slipUrl) {
      embed.setImage(slipUrl);
    }

    embed.setFooter({ text: "Bear Cafe • ระบบฮีลใจ ประวัติคำสั่งซื้อ" });

    await historyChannel.send({ embeds: [embed] }).catch((e) => {
      console.error("[HealJai] Failed to send history log:", e.message);
    });
  } catch (err) {
    console.error("[HealJai] Error in sendOrderHistoryLog:", err.message);
  }
}

let supabaseClient;
function getSupabase() {
  if (!supabaseClient && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return supabaseClient;
}

// Memory map สำหรับเก็บ 15-minute auto-expiry timers (channelId -> TimeoutHandle)
const activeTimers = new Map();

// Memory map สำหรับเก็บ 3-minute dispatch alert timers (orderId -> TimeoutHandle)
const dispatchTimers = new Map();

/**
 * ตั้งเวลานับถอยหลัง 3 นาทีสำหรับการรับเคส (หากหมดเวลาให้เปิดเคสเป็น Open Dispatch)
 */
function scheduleDispatchTimeout(client, guild, orderId, messageId, expireTimestamp) {
  if (dispatchTimers.has(orderId)) {
    clearTimeout(dispatchTimers.get(orderId));
  }

  const remainingMs = Math.max(1000, (expireTimestamp * 1000) - Date.now());
  const timer = setTimeout(async () => {
    dispatchTimers.delete(orderId);
    const supabase = getSupabase();
    if (!supabase) return;

    try {
      const { data: order } = await supabase
        .from("heal_jai_orders_sessions")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();

      if (!order || order.session_status !== "DISPATCHING") return;

      const dispatchChannel = guild.channels.cache.get(DISPATCH_CHANNEL_ID) ||
                              await guild.channels.fetch(DISPATCH_CHANNEL_ID).catch(() => null);

      // ── กรณีที่ 1: เคสที่มีการเลือกตัวบุคคลไว้ แต่หมดเวลา 3 นาที (คิวหลุด) ──
      // ลบข้อความแจ้งเตือนเดิมทิ้ง แล้วส่งการ์ดใบใหม่ที่แท็ก Role ให้ทุกคนกดรับได้
      if (order.counselor_id) {
        console.log(`[HealJai] ⏰ Assigned counselor <@${order.counselor_id}> timed out for order #${order.order_code}. Re-dispatching with role mention...`);

        if (messageId && dispatchChannel) {
          try {
            const oldMsg = await dispatchChannel.messages.fetch(messageId).catch(() => null);
            if (oldMsg) await oldMsg.delete().catch(() => {});
          } catch (_) {}
        }

        await supabase
          .from("heal_jai_orders_sessions")
          .update({
            counselor_id: null,
            is_specific_counselor: false,
            updated_at: new Date().toISOString()
          })
          .eq("id", order.id);

        sendOrderHistoryLog(guild, {
          status: "DISPATCH_TIMEOUT_DROP",
          orderCode: order.order_code,
          customerId: order.customer_id,
          extraInfo: `⏰ ที่ปรึกษา <@${order.counselor_id}> ไม่ได้กดรับเคสภายใน 3 นาที ระบบลบการ์ดเดิมและเปิดเป็น Open Dispatch แท็ก Role <@&${COUNSELOR_ROLE_ID}>`
        });

        const newExpireTimestamp = Math.floor((Date.now() + 3 * 60 * 1000) / 1000);
        const newDispatchPayload = buildDispatchAlertPayload({
          counselorId: null,
          customerId: order.customer_id,
          serviceMode: order.service_mode || "chat",
          orderId: order.id,
          orderCode: order.order_code,
          packageName: order.package_name || "ชาเขียวเย็นใจ",
          duration: order.duration_minutes || 15,
          isSilent: order.is_silent || false,
          isSpecific: false,
          toppingName: order.is_silent ? "นั่งเงียบเป็นเพื่อน (+19 บาท)" : null,
          isBooster: order.is_booster || false,
          totalMinutes: order.duration_minutes || 15,
          totalPrice: order.total_price || 39,
          expireTimestamp: newExpireTimestamp
        });

        if (dispatchChannel) {
          if (newDispatchPayload.pingMention) {
            await dispatchChannel.send({ content: newDispatchPayload.pingMention }).catch(() => {});
          }
          const newMsg = await dispatchChannel.send(newDispatchPayload).catch(() => null);
          if (newMsg) {
            scheduleDispatchTimeout(client, guild, order.id, newMsg.id, newExpireTimestamp);
          }
        }
        return;
      }

      // ── กรณีที่ 2: เคส Open Dispatch หมดเวลา 3 นาทีแล้วยังไม่มีใครรับ ──
      console.log(`[HealJai] ⏰ Open Dispatch expired for order #${order.order_code}. Escalating to Owner DM and notifying customer ticket...`);

      if (dispatchChannel) {
        await dispatchChannel.send({
          content: `<@&${STAFF_ROLE_ID}> <@&${COUNSELOR_ROLE_ID}> 🚨 **ไม่มีผู้รับฟังรับเคส #${order.order_code} ภายในเวลา 3 นาที**\n> 📢 ระบบได้ส่ง DM แจ้งเตือนไปยังแอดมิน/Owner และแจ้งลูกค้าในห้อง Ticket แล้วค่ะ 🍵`
        }).catch(() => {});
      }

      // 2. ส่ง DM แจ้งเตือนไปยัง OwnerID
      const ownerId = process.env.OWNER_ID || guild.ownerId;
      if (ownerId) {
        try {
          const ownerUser = await client.users.fetch(ownerId).catch(() => null);
          if (ownerUser) {
            const ticketUrl = `https://discord.com/channels/${guild.id}/${order.ticket_channel_id}`;
            await ownerUser.send({
              content: [
                `## 🚨︲แจ้งเตือนไม่มีผู้รับฟังรับเคส (HealJai Dispatch Timeout)`,
                `> **รหัสออเดอร์:** \`#${order.order_code}\``,
                `> **ลูกค้า:** <@${order.customer_id}> (${order.customer_id})`,
                `> **แพ็กเกจ:** ${order.package_name || "เครื่องดื่มพักใจ"} (${order.duration_minutes || 15} นาที)`,
                `> **ยอดชำระ:** ${order.total_price} บาท (ชำระแล้ว)`,
                `> **โหมดบริการ:** ${order.service_mode === "voice" ? "🎙️ คอลเสียง" : "💬 พิมพ์คุย"}`,
                `> **ห้อง Ticket:** <#${order.ticket_channel_id}> ([คลิกเพื่อเปิดห้อง](${ticketUrl}))\n`,
                `⚠️ *เคสนี้ยังไม่มีผู้ให้คำปรึกษากดรับภายในเวลา 3 นาที ระบบได้แจ้งลูกค้าว่ากำลังติดต่อแอดมิน กรุณาเข้าตรวจสอบค่ะ 🍵*`
              ].join("\n")
            }).catch((dmErr) => {
              console.warn(`[HealJai] Could not send DM to owner (${ownerId}):`, dmErr.message);
            });
          }
        } catch (ownerErr) {
          console.error("[HealJai] Error sending DM to owner on dispatch timeout:", ownerErr.message);
        }
      }

      // 3. ส่งแจ้งเตือนกลับไปยังห้อง Ticket เดิมของลูกค้า
      if (order.ticket_channel_id) {
        const ticketCh = guild.channels.cache.get(order.ticket_channel_id) ||
                         await guild.channels.fetch(order.ticket_channel_id).catch(() => null);
        if (ticketCh) {
          await ticketCh.send({
            content: [
              `## ⏳︲แจ้งสถานะการให้บริการ`,
              `> <@${order.customer_id}> ขออภัยในความไม่สะดวกค่ะ ขณะนี้ผู้รับฟังทุกคนอาจติดภารกิจหรือไม่สะดวกรับงานในทันที`,
              `> `,
              `> 📢 **ระบบได้ส่งการแจ้งเตือนไปยังแอดมินเรียบร้อยแล้วค่ะ**`,
              `> ทีมงานกำลังเร่งประสานงานและจะเข้ามาดูแลคุณในห้องนี้โดยเร็วที่สุดนะคะ ขอบคุณที่รอและวางใจคาเฟ่ของเราค่ะ 🍵`
            ].join("\n")
          }).catch(() => {});
        }
      }
    } catch (err) {
      console.error("[HealJai] Error during dispatch timeout expiration:", err.message);
    }
  }, remainingMs);

  dispatchTimers.set(orderId, timer);
}

/**
 * ตั้งเวลาลบห้องอัตโนมัติภายใน 15 นาที หากไม่มีการทำรายการ
 */
function scheduleAutoDelete(client, channelId) {
  if (activeTimers.has(channelId)) {
    clearTimeout(activeTimers.get(channelId));
  }

  const timer = setTimeout(async () => {
    activeTimers.delete(channelId);
    console.log(`[HealJai] ⏰ Ticket channel ${channelId} expired (15 mins timeout). Deleting...`);

    const supabase = getSupabase();
    if (supabase) {
      try {
        const { error } = await supabase
          .from("heal_jai_tickets")
          .update({ status: "expired", updated_at: new Date().toISOString() })
          .eq("channel_id", channelId);
        if (error) console.error(`[HealJai] DB update error on expire:`, error.message);
      } catch (e) {
        console.error(`[HealJai] DB update error on expire:`, e.message);
      }
    }

    try {
      const channel = await client.channels.fetch(channelId).catch(() => null);
      if (channel) {
        await channel.delete("HealJai ticket 15-minute auto-expiry timeout");
      }
    } catch (err) {
      console.error(`[HealJai] Failed to delete expired channel ${channelId}:`, err.message);
    }
  }, TIMEOUT_MS);

  activeTimers.set(channelId, timer);
}

/**
 * ยกเลิกตัวนับเวลาลบห้อง
 */
function clearAutoDeleteTimer(channelId) {
  if (activeTimers.has(channelId)) {
    clearTimeout(activeTimers.get(channelId));
    activeTimers.delete(channelId);
  }
}

// Memory map สำหรับเก็บ Session Warning timers (orderId -> { warn5, warn1, expiry })
const sessionTimers = new Map();

// Memory map สำหรับเก็บ Provider Ready timers (3 นาทีหลังรับเคส)
const providerReadyTimers = new Map();

// Memory map และค่าคงที่สำหรับเก็บห้อง Session ไว้ 10 นาทีหลังจบเคส (10-Minute Retention)
const SESSION_RETENTION_MS = 10 * 60 * 1000;
const sessionRetentionTimers = new Map();

/**
 * ตั้งเวลาลบห้องสนทนาเซสชันอัตโนมัติเมื่อครบ 10 นาที
 */
function scheduleSessionRoomCleanup(client, guild, orderId, textChannelId, remainingMs = SESSION_RETENTION_MS) {
  if (sessionRetentionTimers.has(orderId)) {
    clearTimeout(sessionRetentionTimers.get(orderId));
  }

  const timer = setTimeout(async () => {
    sessionRetentionTimers.delete(orderId);
    try {
      if (textChannelId && guild) {
        const textCh = guild.channels.cache.get(textChannelId) ||
                       await guild.channels.fetch(textChannelId).catch(() => null);
        if (textCh) {
          await textCh.delete("HealJai session 10-minute retention expired").catch(() => {});
        }
      }
    } catch (err) {
      console.error(`[HealJai] Error deleting text channel ${textChannelId} after 10m retention:`, err.message);
    }
  }, Math.max(remainingMs, 1000));

  sessionRetentionTimers.set(orderId, timer);
}

/**
 * 🧹 ระบบตรวจสอบและเคลียร์ห้องค้างอัตโนมัติ (Stale / Abandoned Channels Cleaner)
 * ทำงานอัตโนมัติเป็นระยะ (Periodic Cleanup) และหลังบอทเริ่มทำงาน (Post-Restart Sweep)
 * พร้อมระบบความปลอดภัยระดับสูงสุด ป้องกันการลบห้องที่กำลังใช้งานหรืออยู่ในขั้นตอนชำระเงิน
 * @param {import('discord.js').Client} client
 */
async function cleanStaleChannels(client) {
  const supabase = getSupabase();
  const guildId = config.healJai?.guildId || "1536199707922141254";
  const guild = client.guilds.cache.get(guildId) || await client.guilds.fetch(guildId).catch(() => null);
  if (!guild) return;

  const now = Date.now();
  const TICKET_IDLE_TIMEOUT_MS = 45 * 60 * 1000; // 45 นาทีสำหรับ Ticket ที่ไม่มีการใช้งาน
  const RETENTION_24H_MS = 24 * 60 * 60 * 1000;  // 24 ชั่วโมงสำหรับ Session ที่จบแล้ว

  // รายการห้องถาวรที่ห้ามลบเด็ดขาด (Permanent Whitelist)
  const PROTECTED_CHANNEL_IDS = new Set([
    TERMS_CHANNEL_ID,
    MENU_CHANNEL_ID,
    SHIFT_CHANNEL_ID,
    DISPATCH_CHANNEL_ID,
    VOICE_STATS_COUNSELORS,
    VOICE_STATS_CUPS,
    PUBLIC_REVIEW_CHANNEL,
    ORDER_HISTORY_CHANNEL_ID
  ]);

  try {
    const channels = await guild.channels.fetch().catch(() => guild.channels.cache);
    if (!channels) return;

    for (const [, ch] of channels) {
      if (!ch) continue;
      // ข้าม Channel หมวดหมู่ หรือ Channel ใน Whitelist ถาวร
      if (ch.type === ChannelType.GuildCategory || PROTECTED_CHANNEL_IDS.has(ch.id)) continue;

      // ── ตรวจสอบประเภทที่ 1: ห้อง Session (ฮีลใจ) ใน SESSION_CATEGORY_ID ────────
      const isSessionName = ch.name.startsWith("🌱︲แชทฮิลใจ・") ||
                            ch.name.startsWith("🌱︲โต๊ะฮิลใจ・") ||
                            ch.name.startsWith("☕︰ฮีลใจ-") ||
                            ch.name.startsWith("🎙️︰ฮีลใจ-");

      if (ch.parentId === SESSION_CATEGORY_ID || isSessionName) {
        // กฎความปลอดภัย 1: ถ้าเป็นห้องเสียงและมีคนอยู่ในห้อง ห้ามลบเด็ดขาด
        if (ch.type === ChannelType.GuildVoice && ch.members && ch.members.size > 0) {
          continue;
        }

        let order = null;
        if (supabase) {
          const { data } = await supabase
            .from("heal_jai_orders_sessions")
            .select("*")
            .or(`session_channel_id.eq.${ch.id},session_voice_id.eq.${ch.id}`)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          order = data;
        }

        if (order) {
          // กฎความปลอดภัย 2: เซสชันที่กำลังดำเนินการอยู่ ห้ามลบเด็ดขาด
          if (["IN_PROGRESS", "WAITING_FOR_PROVIDER", "DISPATCHING", "WAITING"].includes(order.session_status)) {
            continue;
          }

          // กฎความปลอดภัย 3: เซสชันที่จบแล้ว (COMPLETED) ต้องคงไว้ 24 ชม. สำหรับรีวิว
          if (order.session_status === "COMPLETED") {
            const endedAt = order.ended_at ? new Date(order.ended_at).getTime() : ch.createdTimestamp;
            if (now - endedAt < RETENTION_24H_MS) {
              continue; // ยังไม่ครบ 24 ชม. ห้ามลบ
            }
          }
        } else {
          // ถ้าไม่มีข้อมูลใน DB (Orphaned room) ต้องมีอายุอย่างน้อย 2 ชั่วโมงขึ้นไป
          const ageMs = now - ch.createdTimestamp;
          if (ageMs < 2 * 60 * 60 * 1000) {
            continue;
          }
        }

        console.log(`[HealJai-Cleanup] 🧹 ลบห้อง Session ที่ครบกำหนด/ตกค้าง: #${ch.name} (${ch.id})`);
        await ch.delete("HealJai auto-clean stale session room").catch(() => {});
        continue;
      }

      // ── ตรวจสอบประเภทที่ 2: ห้อง Ticket สั่งเมนู/ชำระเงิน (🌱︲แชทฮิลใจ・... / ☕︰...) ──
      const isTicketCategory = ch.parentId === "1536199707922141254" || ch.parentId === guild.channels.cache.get(MENU_CHANNEL_ID)?.parentId;
      const isTicketName = (ch.name.startsWith("🌱︲แชทฮิลใจ・") || ch.name.startsWith("☕︰")) && !isSessionName;

      if (isTicketCategory && isTicketName) {
        // กฎความปลอดภัย 1: ห้องที่สร้างขึ้นไม่เกิน 20 นาที ห้ามลบเด็ดขาด (กำลังเลือกระหว่างขั้นตอน)
        const channelAgeMs = now - ch.createdTimestamp;
        if (channelAgeMs < 20 * 60 * 1000) {
          continue;
        }

        // กฎความปลอดภัย 2: เช็กว่ามีข้อความล่าสุดเข้ามาภายใน 30 นาทีที่ผ่านมาหรือไม่
        try {
          const recentMessages = await ch.messages.fetch({ limit: 1 }).catch(() => null);
          const lastMsg = recentMessages?.first();
          if (lastMsg) {
            const lastMsgAge = now - lastMsg.createdTimestamp;
            if (lastMsgAge < 30 * 60 * 1000) {
              // มีกิจกรรมแชทภายใน 30 นาทีที่ผ่านมา ห้ามลบ
              continue;
            }
          }
        } catch (_) {}

        let ticketRecord = null;
        let orderRecord = null;
        if (supabase) {
          const { data: ticket } = await supabase
            .from("heal_jai_tickets")
            .select("*")
            .eq("channel_id", ch.id)
            .maybeSingle();
          ticketRecord = ticket;

          const { data: ord } = await supabase
            .from("heal_jai_orders_sessions")
            .select("*")
            .eq("ticket_channel_id", ch.id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          orderRecord = ord;
        }

        // กฎความปลอดภัย 3: ถ้าเป็นออเดอร์ที่กำลังรอรับเคส (DISPATCHING / WAITING_FOR_PROVIDER) หรืออยู่ระหว่างเซสชัน ห้ามลบเด็ดขาด!
        if (orderRecord && ["DISPATCHING", "WAITING_FOR_PROVIDER", "IN_PROGRESS"].includes(orderRecord.session_status)) {
          continue;
        }

        // กฎความปลอดภัย 4: ถ้าเป็นตั๋วชำระเงินที่ยังไม่เกิน 1 ชั่วโมง (PENDING Payment) และมีลูกค้าใช้งานอยู่ ห้ามลบ
        if (orderRecord && orderRecord.payment_status === "PENDING" && channelAgeMs < 60 * 60 * 1000) {
          continue;
        }

        // ถ้าตั๋วเป็น expired/cancelled หรือไม่มีความเคลื่อนไหวเกิน 45 นาทีขึ้นไป และไม่มีออเดอร์ที่ใช้งานอยู่
        const isStale = (ticketRecord && (ticketRecord.status === "expired" || ticketRecord.status === "cancelled")) ||
                        (orderRecord && (orderRecord.payment_status === "CANCELLED" || orderRecord.session_status === "CANCELLED")) ||
                        (channelAgeMs >= TICKET_IDLE_TIMEOUT_MS);

        if (isStale) {
          console.log(`[HealJai-Cleanup] 🧹 ลบห้อง Ticket ที่หมดอายุ/ค้าง: #${ch.name} (${ch.id})`);
          if (supabase && ticketRecord && ticketRecord.status === "pending") {
            await supabase.from("heal_jai_tickets").update({ status: "expired", updated_at: new Date().toISOString() }).eq("id", ticketRecord.id).catch(() => {});
          }
          clearAutoDeleteTimer(ch.id);
          ticketSelections.delete(ch.id);
          await ch.delete("HealJai auto-clean stale ticket room").catch(() => {});
        }
      }
    }
  } catch (err) {
    console.error("[HealJai-Cleanup] Error during stale channels cleanup:", err.message);
  }
}

/**
 * สร้างห้อง Session Room (Text/Voice) ใน Category 1545237654612869201
 * @param {import('discord.js').Guild} guild
 * @param {object} order - { customer_id, counselor_id, service_mode, order_code }
 * @returns {Promise<{ textChannel: import('discord.js').TextChannel, voiceChannel: import('discord.js').VoiceChannel|null }>}
 */
async function createSessionRoom(guild, order) {
  const { customer_id, counselor_id, service_mode, order_code } = order;
  const customerMember = customer_id ? await guild.members.fetch(customer_id).catch(() => null) : null;
  const username = customerMember?.displayName || (customer_id ? customer_id.slice(-4) : "user");

  const textOverwrites = [
    {
      id: guild.roles.everyone.id,
      deny: [PermissionFlagsBits.ViewChannel]
    },
    {
      id: guild.client.user.id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.ManageChannels,
        PermissionFlagsBits.EmbedLinks,
        PermissionFlagsBits.AttachFiles
      ]
    },
    {
      id: STAFF_ROLE_ID,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory
      ]
    }
  ];

  if (customer_id) {
    textOverwrites.push({
      id: customer_id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    });
  }

  if (counselor_id) {
    textOverwrites.push({
      id: counselor_id,
      allow: [
        PermissionFlagsBits.ViewChannel,
        PermissionFlagsBits.SendMessages,
        PermissionFlagsBits.ReadMessageHistory,
        PermissionFlagsBits.AttachFiles,
        PermissionFlagsBits.EmbedLinks
      ]
    });
  }

  let textChannel = null;
  let voiceChannel = null;

  if (service_mode === "voice") {
    const voiceOverwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.Connect]
      },
      {
        id: guild.client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.ManageChannels
        ]
      },
      {
        id: STAFF_ROLE_ID,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ]
      }
    ];

    if (customer_id) {
      voiceOverwrites.push({
        id: customer_id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks
        ]
      });
    }

    if (counselor_id) {
      voiceOverwrites.push({
        id: counselor_id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.Connect,
          PermissionFlagsBits.Speak,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks
        ]
      });
    }

    voiceChannel = await guild.channels.create({
      name: `🌱︲โต๊ะฮิลใจ・${username}`,
      type: ChannelType.GuildVoice,
      parent: SESSION_CATEGORY_ID,
      permissionOverwrites: voiceOverwrites,
      reason: `HealJai Voice Session Room for order #${order_code}`
    });
  } else {
    // Mode "chat" -> สร้าง Text Channel
    const textOverwrites = [
      {
        id: guild.roles.everyone.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: guild.client.user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.ManageChannels,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.AttachFiles
        ]
      },
      {
        id: STAFF_ROLE_ID,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory
        ]
      }
    ];

    if (customer_id) {
      textOverwrites.push({
        id: customer_id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks
        ]
      });
    }

    if (counselor_id) {
      textOverwrites.push({
        id: counselor_id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.ReadMessageHistory,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks
        ]
      });
    }

    textChannel = await guild.channels.create({
      name: `🌱︲แชทฮิลใจ・${username}`,
      type: ChannelType.GuildText,
      parent: SESSION_CATEGORY_ID,
      permissionOverwrites: textOverwrites,
      reason: `HealJai Session Room for order #${order_code}`
    });
  }

  return { textChannel, voiceChannel };
}

/**
 * ตั้งเวลา Session Timer (แจ้งเตือน 5 นาที, 1 นาที และ Auto-Lock เมื่อครบเวลา)
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Guild} guild
 * @param {object} order - { id, expires_at, session_channel_id, customer_id, counselor_id, duration_minutes }
 */
function scheduleSessionTimer(client, guild, order) {
  if (!order || !order.expires_at) return;
  clearSessionTimer(order.id);

  const expiresAt = new Date(order.expires_at).getTime();
  const totalRemaining = expiresAt - Date.now();

  if (totalRemaining <= 0) {
    handleSessionExpiry(client, guild, order.id, { isEarly: false });
    return;
  }

  const timers = {};

  // แจ้งเตือน 5 นาทีสุดท้าย
  const fiveMinMs = totalRemaining - (5 * 60 * 1000);
  if (fiveMinMs > 0) {
    timers.warn5 = setTimeout(async () => {
      await notifySessionWarning(guild, order.id, 5);
    }, fiveMinMs);
  }

  // แจ้งเตือน 1 นาทีสุดท้าย
  const oneMinMs = totalRemaining - (1 * 60 * 1000);
  if (oneMinMs > 0) {
    timers.warn1 = setTimeout(async () => {
      await notifySessionWarning(guild, order.id, 1);
    }, oneMinMs);
  }

  // ครบเวลาบริการ (Auto-Complete)
  timers.expiry = setTimeout(async () => {
    await handleSessionExpiry(client, guild, order.id, { isEarly: false });
  }, totalRemaining);

  sessionTimers.set(order.id, timers);
}

function clearSessionTimer(orderId) {
  if (sessionTimers.has(orderId)) {
    const timers = sessionTimers.get(orderId);
    if (timers) {
      if (timers.warn5) clearTimeout(timers.warn5);
      if (timers.warn1) clearTimeout(timers.warn1);
      if (timers.expiry) clearTimeout(timers.expiry);
    }
    sessionTimers.delete(orderId);
  }
}

async function notifySessionWarning(guild, orderId, minutesLeft) {
  const supabase = getSupabase();
  if (!supabase || !guild) return;

  try {
    const { data: order } = await supabase
      .from("heal_jai_orders_sessions")
      .select("*")
      .eq("id", orderId)
      .maybeSingle();

    if (!order || order.session_status !== "IN_PROGRESS") return;

    const targetChId = order.session_channel_id || order.ticket_channel_id;
    if (!targetChId) return;

    const ch = guild.channels.cache.get(targetChId) ||
               await guild.channels.fetch(targetChId).catch(() => null);

    if (ch) {
      await ch.send({
        content: `⏰ <@${order.customer_id}> <@${order.counselor_id}> เหลือเวลาบริการอีก **${minutesLeft} นาที** นะคะ 🍵`
      }).catch(() => {});
    }
  } catch (err) {
    console.error(`[HealJai] Error sending ${minutesLeft}-min warning:`, err.message);
  }
}

/**
 * จัดการเมื่อ Session หมดเวลา (Auto-Complete) หรือที่ปรึกษากดจบบริการก่อนเวลา
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Guild} guild
 * @param {string|number} orderId
 * @param {object} options - { isEarly: boolean }
 */
async function handleSessionExpiry(client, guild, orderId, { isEarly = false } = {}) {
  const supabase = getSupabase();
  if (!supabase) return;

  clearSessionTimer(orderId);
  if (providerReadyTimers.has(orderId)) {
    clearTimeout(providerReadyTimers.get(orderId));
    providerReadyTimers.delete(orderId);
  }

  // Guard: ถ้าจบไปแล้ว ไม่ทำซ้ำ
  const { data: order } = await supabase
    .from("heal_jai_orders_sessions")
    .select("*")
    .eq("id", orderId)
    .maybeSingle();

  if (!order || order.session_status === "COMPLETED" || order.session_status === "CANCELLED") return;

  const now = new Date().toISOString();

  // 1. อัปเดต DB
  await supabase.from("heal_jai_orders_sessions").update({
    session_status: "COMPLETED",
    ended_at: now,
    ended_early: isEarly,
    updated_at: now
  }).eq("id", orderId);

  // 2. อัปเดตสถิติ + สถานะที่ปรึกษา (+1 total_sessions, +counselor_share)
  if (order.counselor_id) {
    const counselorShare = Number(order.counselor_share || 0);
    const { data: currentCounselor } = await supabase
      .from("heal_jai_counselors")
      .select("total_sessions, accumulated_earnings")
      .eq("user_id", order.counselor_id)
      .maybeSingle();

    const prevSessions = currentCounselor?.total_sessions || 0;
    const prevEarnings = Number(currentCounselor?.accumulated_earnings || 0);

    await supabase.from("heal_jai_counselors").update({
      status: "ONLINE",
      total_sessions: prevSessions + 1,
      accumulated_earnings: prevEarnings + counselorShare,
      updated_at: now
    }).eq("user_id", order.counselor_id);

    await updateOnlineCounselorsCount(guild);
    await updateCupsServedCount(guild);
    await updateCounselorCardMessage(guild, order.counselor_id);
  }

  // 3. จัดการ Channel: ส่งข้อความขอบคุณ + เปลี่ยนชื่อห้อง
  const textChannelId = order.session_channel_id || order.ticket_channel_id;
  const sessionChannel = textChannelId
    ? (guild.channels.cache.get(textChannelId) || await guild.channels.fetch(textChannelId).catch(() => null))
    : null;

  if (sessionChannel) {
    const thankYouMessage = [
      `## <@${order.customer_id}> ขอบคุณที่ใช้บริการกับเราในครั้งนี้นะคะ <a:heartoutlines:1536268541144076369>`,
      `> หากสะดวก ฝากทุกท่านช่วยรีวิวหรือแชร์ฟีดแบ็กเกี่ยวกับการใช้บริการได้ที่ <#1545240537089703986> เพื่อให้เราได้นำความคิดเห็นไปพัฒนาและปรับปรุงการทำงานให้ดียิ่งขึ้นนะคะ ขอบคุณมาก ๆ ค่ะ <a:511398spin:1536700803732209736>\n`,
      `-# ⏱️ ห้องนี้จะถูกลบอัตโนมัติภายใน 10 นาทีค่ะ`
    ].join("\n");

    await sessionChannel.send({ content: thankYouMessage }).catch(() => {});

    // แก้ไขชื่อห้องเป็น "✅︰เคสเสร็จสิ้น"
    await sessionChannel.setName("✅︰เคสเสร็จสิ้น").catch((e) => {
      console.error("[HealJai] Failed to rename completed session channel:", e.message);
    });

    // ล็อกสิทธิ์การพิมพ์และการคุยเสียง
    try {
      const lockPerms = {
        SendMessages: false,
        SendMessagesInThreads: false,
        CreatePublicThreads: false,
        CreatePrivateThreads: false,
        Connect: false,
        Speak: false
      };
      if (order.customer_id) {
        await sessionChannel.permissionOverwrites.edit(order.customer_id, lockPerms).catch(() => {});
      }
      if (order.counselor_id) {
        await sessionChannel.permissionOverwrites.edit(order.counselor_id, lockPerms).catch(() => {});
      }

      // ถ้าเป็นห้องเสียง ตัดการเชื่อมต่อผู้ใช้ที่ยังอยู่ในห้อง
      if (sessionChannel.type === ChannelType.GuildVoice && sessionChannel.members) {
        for (const [, m] of sessionChannel.members) {
          await m.voice?.disconnect("HealJai session completed").catch(() => {});
        }
      }
    } catch (permErr) {
      console.error("[HealJai] Failed to lock permissions on session end:", permErr.message);
    }
  }

  // 4. ลบ Voice Channel ที่แยกต่างหาก (ถ้ามีและไม่ใช่ห้องเดียวกัน)
  if (order.session_voice_id && order.session_voice_id !== order.session_channel_id) {
    try {
      const voiceCh = guild.channels.cache.get(order.session_voice_id) ||
                      await guild.channels.fetch(order.session_voice_id).catch(() => null);
      if (voiceCh) {
        await voiceCh.delete("HealJai session completed voice cleanup").catch(() => {});
      }
    } catch (voiceErr) {
      console.error("[HealJai] Failed to delete voice room on session end:", voiceErr.message);
    }
  }

  // 5. บันทึก Order History Log
  sendOrderHistoryLog(guild, {
    status: "COMPLETED",
    orderCode: order.order_code || `HJ-${orderId}`,
    customerId: order.customer_id,
    counselorId: order.counselor_id,
    packageName: order.package_name,
    totalPrice: order.total_price,
    extraInfo: isEarly
      ? `จบบริการก่อนเวลา (Early End: true) — ล็อกห้องสนทนาและตั้งเวลาลบห้องภายใน 10 นาที`
      : `ครบกำหนดเวลาบริการ (Auto-Timer Expiry) — ล็อกห้องสนทนาและตั้งเวลาลบห้องภายใน 10 นาที`
  });

  // 6. ตั้งเวลาลบ Text Channel หลังจาก 10 นาที (10-Minute Retention)
  if (textChannelId) {
    scheduleSessionRoomCleanup(client, guild, orderId, textChannelId, SESSION_RETENTION_MS);
  }
}

// Memory map สำหรับตรวจจับการส่งข้อความระหว่างสองฝ่ายก่อนเริ่มเซสชัน (orderId -> Set<userId>)
const sessionMessageActivity = new Map();

/**
 * ฟังก์ชันกลางสำหรับเริ่มต้นเซสชัน (Start Session) ทั้งการกดปุ่มแมนนวล หรือ Auto-Start จากแชท/เสียง
 * มีระบบตัดทอนเวลาเมื่อเริ่มช้า (Late-Start Duration Deduction) เพื่อความเป็นธรรม
 * @param {import('discord.js').Client} client
 * @param {import('discord.js').Guild} guild
 * @param {object} order
 * @param {object} [options]
 * @param {boolean} [options.isAutoStart]
 * @param {string} [options.triggerBy] // 'chat' | 'voice' | 'button'
 * @param {import('discord.js').TextChannel|import('discord.js').VoiceChannel} [options.channel]
 */
async function startSessionInternal(client, guild, order, options = {}) {
  const supabase = getSupabase();
  if (!order || !guild) return false;

  // ป้องกันการเริ่มซ้ำ (Double Start Protection)
  if (order.session_status === "IN_PROGRESS" || order.session_status === "COMPLETED" || order.session_status === "CANCELLED") {
    return false;
  }

  // 1. เคลียร์ Provider Ready Timers ทั้งหมดสำหรับออเดอร์นี้
  if (providerReadyTimers.has(order.id)) {
    const activeTimeouts = providerReadyTimers.get(order.id);
    if (Array.isArray(activeTimeouts)) {
      activeTimeouts.forEach((t) => clearTimeout(t));
    } else {
      clearTimeout(activeTimeouts);
    }
    providerReadyTimers.delete(order.id);
  }

  // เคลียร์ประวัติการพิมพ์แชทในหน่วยความจำ
  sessionMessageActivity.delete(order.id);

  // 2. คำนวณเวลาเริ่มต้นจริงและ Late-Start Deduction
  const now = Date.now();
  const claimedAt = order.claimed_at ? new Date(order.claimed_at).getTime() : (order.updated_at ? new Date(order.updated_at).getTime() : now);
  const waitedMs = Math.max(0, now - claimedAt);
  const waitedMinutes = Math.floor(waitedMs / (60 * 1000));
  const originalDuration = order.duration_minutes || 30;

  let actualDurationMinutes = originalDuration;
  let isLate = false;

  // Grace Period 2 นาที (หากเริ่มช้าเกิน 2 นาที ให้หักเวลาตามที่ช้าไปจริง เช่น 5 นาทีตัด 5 นาที เหลือ 10 นาที)
  if (waitedMinutes > 2) {
    isLate = true;
    const lateMinutes = waitedMinutes;
    actualDurationMinutes = Math.max(5, originalDuration - lateMinutes);
  }

  const startedAt = new Date(now);
  const expiresAt = new Date(now + actualDurationMinutes * 60 * 1000);

  // 3. บันทึกสถานะลง Supabase
  if (supabase) {
    await supabase
      .from("heal_jai_orders_sessions")
      .update({
        session_status: "IN_PROGRESS",
        started_at: startedAt.toISOString(),
        expires_at: expiresAt.toISOString(),
        duration_minutes: actualDurationMinutes,
        updated_at: startedAt.toISOString()
      })
      .eq("id", order.id);
  }

  // 4. เริ่ม Session Timer (แจ้งเตือน 5 นาที, 1 นาที และ Auto-Lock)
  const targetChannelId = order.session_channel_id || options.channel?.id;
  scheduleSessionTimer(client, guild, {
    ...order,
    duration_minutes: actualDurationMinutes,
    expires_at: expiresAt.toISOString(),
    session_channel_id: targetChannelId
  });

  // 5. ส่งข้อความแจ้งเตือนในห้องเซสชัน
  const targetChannel = options.channel ||
                        (targetChannelId ? (guild.channels.cache.get(targetChannelId) || await guild.channels.fetch(targetChannelId).catch(() => null)) : null);

  if (targetChannel) {
    let announcement = "";
    if (options.isAutoStart) {
      const reasonText = options.triggerBy === "voice" ? "เชื่อมต่อห้องเสียงพร้อมกันทั้งสองฝ่าย" : "เริ่มพิมพ์บทสนทนาจากทั้งสองฝ่าย";
      announcement = `✨ **ระบบตรวจพบว่ามีการ${reasonText}แล้ว!**\n> ⏱️ เริ่มต้นนับเวลาให้บริการอัตโนมัติ **${actualDurationMinutes} นาที** (ขอให้เป็นช่วงเวลาที่อบอุ่นและสบายใจนะคะ 🍵)\n-# ระบบจะแจ้งเตือนเมื่อเหลือ 5 นาที / 1 นาที และปิดห้องอัตโนมัติเมื่อครบเวลาค่ะ`;
    } else if (isLate) {
      announcement = `⏱️ **เซสชันสนทนาเริ่มต้นขึ้นแล้ว!**\n> ⚠️ *เนื่องจากเซสชันเริ่มล่าช้าไปประมาณ ${waitedMinutes} นาที ระบบจึงปรับเวลาให้บริการคงเหลือจริงเป็น **${actualDurationMinutes} นาที** (จากแพ็กเกจ ${originalDuration} นาที) เพื่อความถูกต้องและเป็นธรรมค่ะ 🍵*\n-# ระบบจะแจ้งเตือนเมื่อเหลือ 5 นาที / 1 นาที และปิดห้องอัตโนมัติเมื่อครบเวลาค่ะ`;
    } else {
      announcement = `⏱️ **เซสชันสนทนาเริ่มต้นขึ้นแล้ว!** เวลาให้บริการ **${actualDurationMinutes} นาที** ขอให้เป็นช่วงเวลาที่อบอุ่นและสบายใจนะคะ ระบบจะแจ้งเตือนเมื่อเหลือ 5 นาที / 1 นาที และปิดห้องอัตโนมัติเมื่อครบเวลาค่ะ 🍵`;
    }

    await targetChannel.send({ content: announcement }).catch(() => {});
  }

  return true;
}

/**
 * ตั้งเวลาตรวจจับเมื่อผู้รับฟังยังไม่เริ่มเซสชัน (Multi-Stage Alerts & Inactivity Guard)
 */
function scheduleProviderReadyTimeout(client, guild, orderId, sessionChannelId) {
  if (providerReadyTimers.has(orderId)) {
    const existing = providerReadyTimers.get(orderId);
    if (Array.isArray(existing)) existing.forEach((t) => clearTimeout(t));
    else clearTimeout(existing);
  }

  const timers = [];

  // ── Stage 1: แจ้งเตือนที่ปรึกษาหลังผ่านไป 2 นาที ───────────────────────────
  const timerStage1 = setTimeout(async () => {
    const supabase = getSupabase();
    if (!supabase || !guild) return;

    try {
      const { data: order } = await supabase
        .from("heal_jai_orders_sessions")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();

      if (!order || order.session_status !== "WAITING_FOR_PROVIDER") return;

      if (sessionChannelId) {
        const sessionCh = guild.channels.cache.get(sessionChannelId) ||
                          await guild.channels.fetch(sessionChannelId).catch(() => null);
        if (sessionCh) {
          await sessionCh.send({
            content: `⚠️ <@${order.counselor_id}> **แจ้งเตือน:** ลูกค้า <@${order.customer_id}> กำลังรออยู่ในห้องแล้วค่ะ อย่าลืมทักทายและกดปุ่ม **'เริ่มเซสชัน'** เพื่อเริ่มนับเวลาให้บริการนะคะ 🍵\n> 💡 *หมายเหตุ: หากทั้งสองฝ่ายเริ่มพิมพ์สนทนาหรือเข้าห้องเสียงพร้อมกัน ระบบจะเริ่มจับเวลาอัตโนมัติให้ทันทีค่ะ*`
          }).catch(() => {});
        }
      }
    } catch (e) {
      console.error("[HealJai] Stage 1 Provider Timeout Error:", e.message);
    }
  }, 2 * 60 * 1000);
  timers.push(timerStage1);

  // ── Stage 2: แจ้งเตือนด่วนหลังผ่านไป 4 นาที ───────────────────────────────
  const timerStage2 = setTimeout(async () => {
    const supabase = getSupabase();
    if (!supabase || !guild) return;

    try {
      const { data: order } = await supabase
        .from("heal_jai_orders_sessions")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();

      if (!order || order.session_status !== "WAITING_FOR_PROVIDER") return;

      if (sessionChannelId) {
        const sessionCh = guild.channels.cache.get(sessionChannelId) ||
                          await guild.channels.fetch(sessionChannelId).catch(() => null);
        if (sessionCh) {
          await sessionCh.send({
            content: `🚨 <@${order.counselor_id}> **แจ้งเตือนเร่งด่วน:** ผ่านไป 4 นาทีแล้วยังไม่มีการเริ่มเซสชัน หากเริ่มช้าเวลาให้บริการจะถูกตัดทอนตามจริง กรุณาติดต่อลูกค้าทันทีนะคะ 🍵`
          }).catch(() => {});
        }
      }

      sendOrderHistoryLog(guild, {
        status: "PROVIDER_DELAY",
        orderCode: order.order_code,
        customerId: order.customer_id,
        counselorId: order.counselor_id,
        extraInfo: `⚠️ ผู้รับฟังยังไม่กดเริ่มเซสชันหลังผ่านไป 4 นาที (ห้อง: <#${sessionChannelId}>)`
      });
    } catch (e) {
      console.error("[HealJai] Stage 2 Provider Timeout Error:", e.message);
    }
  }, 4 * 60 * 1000);
  timers.push(timerStage2);

  // ── Stage 3: หากผ่านไป 7 นาทีแล้วยังไม่มีกิจกรรมใดๆ -> คืนเคส PROVIDER_NO_SHOW
  const timerStage3 = setTimeout(async () => {
    providerReadyTimers.delete(orderId);
    const supabase = getSupabase();
    if (!supabase || !guild) return;

    try {
      const { data: order } = await supabase
        .from("heal_jai_orders_sessions")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();

      if (!order || order.session_status !== "WAITING_FOR_PROVIDER") return;

      const prevCounselorId = order.counselor_id;

      // ปรับสถานะเป็น DISPATCHING เพื่อเปิดให้ผู้รับฟังท่านอื่นกดรับเคสต่อได้ทันที
      await supabase.from("heal_jai_orders_sessions").update({
        session_status: "DISPATCHING",
        counselor_id: null,
        updated_at: new Date().toISOString()
      }).eq("id", orderId);

      if (prevCounselorId) {
        await supabase.from("heal_jai_counselors").update({
          status: "ONLINE",
          updated_at: new Date().toISOString()
        }).eq("user_id", prevCounselorId);
        await updateOnlineCounselorsCount(guild);
        await updateCounselorCardMessage(guild, prevCounselorId);
      }

      // แจ้งเตือนลูกค้าในห้อง Session
      if (sessionChannelId) {
        const sessionCh = guild.channels.cache.get(sessionChannelId) ||
                          await guild.channels.fetch(sessionChannelId).catch(() => null);
        if (sessionCh) {
          await sessionCh.send({
            content: `⚠️ <@${order.customer_id}> ขออภัยค่ะ ผู้รับฟังไม่ได้เข้าเริ่มเซสชันภายในเวลาที่กำหนด ระบบกำลังส่งต่อเคสของคุณไปยังผู้รับฟังท่านอื่นอย่างเร่งด่วนนะคะ 🍵`
          }).catch(() => {});
        }
      }

      // ส่ง Dispatch Alert ใหม่
      const expireTimestamp = Math.floor((Date.now() + 3 * 60 * 1000) / 1000);
      const dispatchPayload = buildDispatchAlertPayload({
        counselorId: null,
        customerId: order.customer_id,
        serviceMode: order.service_mode || "chat",
        orderId: order.id,
        orderCode: order.order_code,
        packageName: order.package_name,
        duration: order.duration_minutes,
        isSilent: order.is_silent || false,
        isSpecific: order.is_specific_counselor || false,
        toppingName: order.is_silent ? "นั่งเงียบเป็นเพื่อน (+19 บาท)" : (order.is_specific_counselor ? "ระบุตัวผู้รับฟัง (+39 บาท)" : null),
        isBooster: order.is_booster || false,
        totalMinutes: order.duration_minutes,
        totalPrice: order.total_price || 39,
        expireTimestamp
      });

      const dispatchChannel = guild.channels.cache.get(DISPATCH_CHANNEL_ID) ||
                              await guild.channels.fetch(DISPATCH_CHANNEL_ID).catch(() => null);
      if (dispatchChannel) {
        const msg = await dispatchChannel.send(dispatchPayload).catch(() => {});
        if (msg) {
          scheduleDispatchTimeout(client, guild, order.id, msg.id, expireTimestamp);
        }
      }
    } catch (err) {
      console.error("[HealJai] Error during provider ready timeout stage 3:", err.message);
    }
  }, 7 * 60 * 1000);
  timers.push(timerStage3);

  providerReadyTimers.set(orderId, timers);
}

/**
 * อัปเดตสถิติตัวเลขผู้รับฟังพร้อมให้บริการบน Voice Channel
 */
async function updateOnlineCounselorsCount(guild) {
  const supabase = getSupabase();
  if (!supabase || !guild) return;
  try {
    const { count, error } = await supabase
      .from("heal_jai_counselors")
      .select("*", { count: "exact", head: true })
      .eq("guild_id", guild.id)
      .eq("status", "ONLINE");

    if (error) {
      console.warn("[HealJai] Failed to query online counselors:", error.message);
      return;
    }

    const ch = guild.channels.cache.get(VOICE_STATS_COUNSELORS) ||
               await guild.channels.fetch(VOICE_STATS_COUNSELORS).catch(() => null);
    if (ch) {
      await ch.setName(`🟢︰ผู้รับฟังพร้อมให้บริการ: ${count || 0} คน`).catch(() => {});
    }
  } catch (err) {
    console.error("[HealJai] Failed to update counselor voice stats:", err.message);
  }
}

/**
 * อัปเดตสถิติตัวเลขถ้วยชา/แก้วที่เสิร์ฟความอบอุ่นไปแล้วบน Voice Channel
 */
async function updateCupsServedCount(guild) {
  const supabase = getSupabase();
  if (!supabase || !guild) return;
  try {
    const { count, error } = await supabase
      .from("heal_jai_orders_sessions")
      .select("*", { count: "exact", head: true })
      .eq("guild_id", guild.id)
      .eq("session_status", "COMPLETED");

    if (error) {
      console.warn("[HealJai] Failed to query completed sessions for cups count:", error.message);
      return;
    }

    const ch = guild.channels.cache.get(VOICE_STATS_CUPS) ||
               await guild.channels.fetch(VOICE_STATS_CUPS).catch(() => null);
    if (ch) {
      await ch.setName(`🍵︰เสิร์ฟความอบอุ่นไปแล้ว: ${count || 0} แก้ว`).catch(() => {});
    }
  } catch (err) {
    console.error("[HealJai] Failed to update cups served voice stats:", err.message);
  }
}

/**
 * ซิงก์อัปเดตข้อความการ์ดบัตรประจำตัวผู้รับฟัง (Counselor Card) บน Discord อัตโนมัติ
 * @param {import('discord.js').Guild} guild
 * @param {string} userId
 */
async function updateCounselorCardMessage(guild, userId) {
  const supabase = getSupabase();
  if (!supabase || !guild || !userId) return;
  try {
    const { data: counselor } = await supabase
      .from("heal_jai_counselors")
      .select("*")
      .eq("user_id", userId)
      .maybeSingle();

    if (counselor && counselor.card_channel_id && counselor.card_message_id) {
      const channel = guild.channels.cache.get(counselor.card_channel_id) ||
                      await guild.channels.fetch(counselor.card_channel_id).catch(() => null);
      if (channel) {
        const msg = await channel.messages.fetch(counselor.card_message_id).catch(() => null);
        if (msg) {
          const member = await guild.members.fetch(userId).catch(() => null);
          const payload = buildCounselorCardPayload(counselor, member);
          await msg.edit(payload).catch((e) => console.warn(`[HealJai] Failed to edit counselor card message:`, e.message));
        }
      }
    }
  } catch (err) {
    console.error("[HealJai] Error updating counselor card message:", err.message);
  }
}

function setupHealJai(client) {
  // 🛡️ ป้องกันไม่ให้บอทหลัก (Main Bot) ตอบสนองหรือโหลดระบบฮีลใจโดยเด็ดขาด (ทำงานเฉพาะบอท Dev / Secondary Bot เท่านั้น)
  if (process.env.DEV_MODE !== "true") {
    console.log("🛑 [HealJai] Main bot is running in Production mode. HealJai system is disabled on main bot (Dev Bot only).");
    return;
  }

  // ── 1.1 Slash Command: /healjai-admin แผงควบคุมหลังบ้านทีมงาน ───────────────
  registerCommand("healjai-admin", async (interaction) => {
    const isOwner = (process.env.OWNER_ID && interaction.user.id === process.env.OWNER_ID) ||
                    (interaction.guild && interaction.guild.ownerId === interaction.user.id);
    const hasStaffRole = interaction.member?.roles?.cache?.some((r) =>
      [STAFF_ROLE_ID, "1144701361448038512", "1144697989986791576", "1144698080239829092"].includes(r.id)
    );
    const hasPermission = interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
                          interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
    const isDevTester = process.env.DEV_MODE === "true";

    const isStaff = isOwner || hasStaffRole || hasPermission || isDevTester;

    if (!isStaff) {
      return interaction.reply({
        content: "❌ ขออภัยค่ะ เฉพาะทีมงานแอดมินเท่านั้นที่สามารถใช้คำสั่งนี้ได้นะคะ",
        flags: FLAG_EPHEMERAL
      });
    }

    const action = interaction.options.getString("action") || "dashboard";

    if (action === "dashboard") {
      const stats = await getAdminStats(interaction.guild);
      return interaction.reply(buildAdminDashboardPayload(stats));
    }

    if (action === "toggle_maintenance") {
      isMaintenanceMode = !isMaintenanceMode;
      return interaction.reply({
        content: `✅ สลับสถานะระบบสำเร็จ: ${isMaintenanceMode ? "🔴 **ปิดปรับปรุงชั่วคราว (Maintenance Mode)**" : "🟢 **เปิดให้บริการตามปกติ (Online)**"}`,
        flags: FLAG_EPHEMERAL
      });
    }

    if (action === "toggle_terms") {
      isTermsDisabled = !isTermsDisabled;
      return interaction.reply({
        content: `✅ สลับสถานะการกดข้อตกลงสำเร็จ: ${isTermsDisabled ? "🔴 **ปิดการกดข้อตกลงชั่วคราว (Terms Acceptance Disabled)**" : "🟢 **เปิดให้กดยินยอมข้อตกลงตามปกติ (Terms Acceptance Enabled)**"}`,
        flags: FLAG_EPHEMERAL
      });
    }

    if (action === "run_cleanup") {
      await interaction.deferReply({ flags: FLAG_EPHEMERAL }).catch(() => {});
      await cleanStaleChannels(client);
      return interaction.editReply({
        content: "🧹 ทำการสแกนและเคลียร์ห้องค้าง/ห้องที่ตกค้างในระบบทั้งหมดเรียบร้อยแล้วค่ะ!"
      });
    }

    if (action === "daily_report") {
      await interaction.deferReply({ flags: FLAG_EPHEMERAL }).catch(() => {});
      const msg = await sendDailyReport(interaction.guild);
      return interaction.editReply({
        content: msg
          ? `📑 ส่งรายงานสรุปยอดประจำวันไปยังห้อง <#${ORDER_HISTORY_CHANNEL_ID}> สำเร็จเรียบร้อยแล้วค่ะ!`
          : `⚠️ ไม่สามารถส่งรายงานสรุปยอดได้ กรุณาตรวจสอบสิทธิ์ของบอทในห้อง <#${ORDER_HISTORY_CHANNEL_ID}> ค่ะ`
      });
    }

    if (action === "manage_case") {
      const orderCode = interaction.options.getString("order_code");
      if (!orderCode) {
        return interaction.reply({
          content: "⚠️ กรุณาระบุ `order_code` (เช่น `HJ-...`) ที่ต้องการตรวจสอบค่ะ",
          flags: FLAG_EPHEMERAL
        });
      }

      const supabase = getSupabase();
      if (!supabase) {
        return interaction.reply({
          content: "❌ ไม่สามารถเชื่อมต่อฐานข้อมูลได้ในขณะนี้ค่ะ",
          flags: FLAG_EPHEMERAL
        });
      }

      const { data: order } = await supabase
        .from("heal_jai_orders_sessions")
        .select("*")
        .or(`order_code.eq.${orderCode},id.eq.${isNaN(orderCode) ? -1 : Number(orderCode)}`)
        .maybeSingle();

      return interaction.reply(buildAdminManageCasePayload(order));
    }
  });

  /**
   * ฟังก์ชันตรวจสอบรูปสลิป (Mock Test Mode สำหรับช่วงพัฒนา — ผ่านอัตโนมัติ)
   * พร้อมสำหรับการเชื่อมต่อ API ตรวจสลิปจริง (EasySlip / SlipOK / OpenSlipVerify)
   * @param {string} imageUrl URL รูปภาพสลิป
   * @param {number} expectedAmount ยอดเงินที่ต้องชำระ
   * @returns {Promise<{ success: boolean, data?: object, message?: string }>}
   */
  async function verifySlipImage(imageUrl, expectedAmount) {
    // ── [MOCK TEST MODE] ส่งภาพอะไรก็ได้ ให้ผ่านทันทีสำหรับช่วงทดสอบ ──
    console.log(`[HealJai SlipVerifier] Mock verification for ${imageUrl} (Expected: ${expectedAmount} THB) -> PASS`);
    return {
      success: true,
      data: {
        amount: expectedAmount,
        transRef: `MOCK-${Date.now()}`,
        verifiedAt: new Date().toISOString()
      }
    };
  }

  /**
   * จัดการกระบวนการเมื่อตรวจสลิปผ่าน (Verified Slip Processing)
   */
  async function processVerifiedPayment(client, guild, channel, user, slipUrl) {
    const supabase = getSupabase();
    if (!supabase) return;

    try {
      let order = null;
      let ticket = null;

      const { data: orderData } = await supabase
        .from("heal_jai_orders_sessions")
        .select("*")
        .eq("ticket_channel_id", channel.id)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      order = orderData;

      // ถ้ายังไม่มี order ใน DB แต่มีข้อมูลใน memory ให้สร้าง order ทันที
      if (!order) {
        const state = ticketSelections.get(channel.id) || { drinkId: "tea_39", mode: "chat" };
        const drinkKey = state.drinkId || state.selectedDrink || "tea_39";
        const drink = DRINK_OPTIONS[drinkKey] || DRINK_OPTIONS.tea_39;
        const toppingKey = state.toppingId || state.selectedTopping;
        const topping = (toppingKey && toppingKey !== "none") ? TOPPING_OPTIONS[toppingKey] : null;
        const isSpecific = toppingKey === "specific_39" || toppingKey === "specific_30";
        const isSilent = toppingKey === "silent_19" || toppingKey === "silent_15";
        const counselorId = state.counselorId || state.selectedCounselor;
        const totalPrice = drink.price + (topping ? topping.price : 0);
        const counselorShare = Number((totalPrice * 0.70).toFixed(2));
        const platformShare = Number((totalPrice * 0.30).toFixed(2));
        const orderCode = `HJ-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

        const { data: createdOrder } = await supabase
          .from("heal_jai_orders_sessions")
          .insert({
            order_code: orderCode,
            guild_id: guild.id,
            customer_id: user.id,
            package_tier: drink.tier || "S",
            package_name: drink.name,
            duration_minutes: drink.duration,
            service_mode: state.mode || "chat",
            is_silent: isSilent,
            is_specific_counselor: isSpecific,
            counselor_id: (counselorId && !counselorId.startsWith("counselor_")) ? counselorId : null,
            total_price: totalPrice,
            counselor_share: counselorShare,
            platform_share: platformShare,
            payment_status: "PENDING",
            session_status: "WAITING",
            ticket_channel_id: channel.id,
          })
          .select("*")
          .maybeSingle();
        order = createdOrder;
      }

      const { data: ticketData } = await supabase
        .from("heal_jai_tickets")
        .select("*")
        .eq("channel_id", channel.id)
        .maybeSingle();
      ticket = ticketData;

      const verifiedAt = new Date().toISOString();

      if (order) {
        await supabase.from("heal_jai_orders_sessions").update({
          payment_status: "PAID",
          session_status: "DISPATCHING",
          slip_url: slipUrl,
          slip_verified_at: verifiedAt,
          updated_at: verifiedAt
        }).eq("id", order.id);
      }

      if (ticket) {
        await supabase.from("heal_jai_tickets").update({
          status: "paid",
          updated_at: verifiedAt
        }).eq("channel_id", channel.id);
      }

      clearAutoDeleteTimer(channel.id);

      // ลบการ์ด Scan to Pay / Component v2 ออกจากห้อง Ticket หลังชำระเงินสำเร็จ
      try {
        const fetchedMsgs = await channel.messages.fetch({ limit: 15 }).catch(() => null);
        if (fetchedMsgs) {
          for (const msg of fetchedMsgs.values()) {
            const hasPayButton = msg.components?.some((c) =>
              c.components?.some((b) => b.customId?.includes("paid_confirm") || b.customId?.includes("btn_pay") || b.customId?.includes("drink_") || b.customId?.includes("topping_"))
            );
            const isComponentV2 = Boolean(msg.flags && (msg.flags.bitfield & FLAG_V2) !== 0);
            if (hasPayButton || isComponentV2) {
              await msg.delete().catch(() => {});
            }
          }
        }
      } catch (delErr) {
        console.error("[HealJai] Failed to delete scan-to-pay card on verified payment:", delErr.message);
      }

      // สุ่มเลือกผู้ให้คำปรึกษาที่สถานะ 🟢 ONLINE
      let chosenCounselorId = null;
      const { data: onlineCounselors } = await supabase
        .from("heal_jai_counselors")
        .select("*")
        .eq("guild_id", guild.id)
        .eq("status", "ONLINE");

      if (onlineCounselors && onlineCounselors.length > 0) {
        const randomCounselor = onlineCounselors[Math.floor(Math.random() * onlineCounselors.length)];
        chosenCounselorId = randomCounselor.user_id;
      }

      // ส่งข้อความยืนยันในห้อง Ticket ของลูกค้า
      await channel.send({
        flags: FLAG_V2,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `## <:50121checkmark:1358584609087946867>︲__\` ตรวจสอบสลิปสำเร็จ! \`__\n> <@${user.id}> **กำลังค้นหาผู้รับฟังให้คุณ** โปรดรอสักครู่นะคะ . . .`
              }
            ]
          }
        ]
      }).catch(() => {});

      // ส่ง Log ประวัติ PAID ไปยังห้อง 1549710698702184539
      sendOrderHistoryLog(guild, {
        status: "PAID",
        orderCode: order ? order.order_code : `HJ-${channel.id.slice(-6)}`,
        customerId: user.id,
        packageName: order?.package_name,
        toppingName: order?.is_silent ? "นั่งเงียบเป็นเพื่อน" : (order?.is_specific_counselor ? "ระบุตัวผู้รับฟัง" : "ไม่มี"),
        totalPrice: order?.total_price,
        slipUrl: slipUrl,
        extraInfo: `ชำระเงินสำเร็จ (ส่งสลิปผ่านห้องแชท) ระบบกำลังค้นหาผู้รับฟัง (ส่งแจ้งเตือนไปยังห้อง Dispatch)`
      });

      // ยิงการ์ดแจ้งเตือนหาผู้ให้คำปรึกษา (Board 5) ไปยังห้อง DISPATCH_CHANNEL_ID (1545239933265121311)
      const expireTimestamp = Math.floor((Date.now() + 3 * 60 * 1000) / 1000);
      const effectiveCounselorId = (order?.is_specific_counselor && order?.counselor_id) ? order.counselor_id : chosenCounselorId;
      const dispatchPayload = buildDispatchAlertPayload({
        counselorId: effectiveCounselorId,
        customerId: order?.customer_id || user.id,
        serviceMode: order?.service_mode || "chat",
        orderId: order ? order.id : null,
        orderCode: order ? order.order_code : `HJ-${channel.id.slice(-6)}`,
        packageName: order?.package_name || "ชาเขียวเย็นใจ",
        duration: order?.duration_minutes || 15,
        isSilent: order?.is_silent || false,
        isSpecific: order?.is_specific_counselor || false,
        toppingName: order?.is_silent ? "นั่งเงียบเป็นเพื่อน (+19 บาท)" : (order?.is_specific_counselor ? "ระบุตัวผู้รับฟัง (+39 บาท)" : null),
        isBooster: order?.is_booster || false,
        totalMinutes: order?.duration_minutes || 15,
        totalPrice: order?.total_price || 39,
        expireTimestamp
      });

      const dispatchChannel = guild.channels.cache.get(DISPATCH_CHANNEL_ID) ||
                              await guild.channels.fetch(DISPATCH_CHANNEL_ID).catch(() => null);
      if (dispatchChannel) {
        if (dispatchPayload.pingMention) {
          await dispatchChannel.send({ content: dispatchPayload.pingMention }).catch(() => {});
        }

        const dispatchMsg = await dispatchChannel.send(dispatchPayload).catch((e) => {
          console.error("[HealJai] Failed to send dispatch alert:", e.message);
          return null;
        });

        if (dispatchMsg && order) {
          scheduleDispatchTimeout(client, guild, order.id, dispatchMsg.id, expireTimestamp);
        }
      }
    } catch (err) {
      console.error("[HealJai] Error processing verified payment:", err);
    }
  }

  // ── 1.2 ดักจับรูปภาพสลิปในห้อง Ticket (แจ้งเตือนทีมงานให้เข้ามาตรวจสอบสลิป) ────
  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;
    if (!message.attachments || message.attachments.size === 0) return;

    // ตรวจสอบว่ามีไฟล์รูปภาพหรือไม่
    const imageAttachment = message.attachments.find((a) =>
      a.contentType?.startsWith("image/") ||
      /\.(png|jpe?g|webp|gif|bmp)$/i.test(a.name || "") ||
      /\.(png|jpe?g|webp|gif|bmp)/i.test(a.url || "")
    );
    if (!imageAttachment) return;

    const supabase = getSupabase();
    if (!supabase) return;

    try {
      // ตรวจสอบว่าห้องนี้เป็นห้อง Ticket พักใจหรือไม่ (เช็กจาก orders_sessions หรือ heal_jai_tickets)
      const { data: pendingOrder } = await supabase
        .from("heal_jai_orders_sessions")
        .select("*")
        .eq("ticket_channel_id", message.channel.id)
        .eq("payment_status", "PENDING")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      const { data: ticketData } = await supabase
        .from("heal_jai_tickets")
        .select("*")
        .eq("channel_id", message.channel.id)
        .eq("status", "pending")
        .maybeSingle();

      // หากไม่ใช่ห้องที่มี order หรือ ticket รอชำระเงินอยู่ ให้ข้ามไป
      if (!pendingOrder && !ticketData) return;

      const customerId = pendingOrder?.customer_id || ticketData?.user_id;
      const isOwner = customerId === message.author.id;
      const isStaff = message.member?.roles?.cache?.has(STAFF_ROLE_ID) ||
                      message.member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
                      (process.env.OWNER_ID && message.author.id === process.env.OWNER_ID) ||
                      process.env.DEV_MODE === "true";

      if (!isOwner && !isStaff) return;

      console.log(`[HealJai] 📸 Received slip upload from <@${message.author.id}> in ticket channel <#${message.channel.id}>`);

      // บันทึก Slip URL ลง order ใน DB
      if (pendingOrder) {
        await supabase
          .from("heal_jai_orders_sessions")
          .update({ slip_url: imageAttachment.url, updated_at: new Date().toISOString() })
          .eq("id", pendingOrder.id);
      }

      // ใส่ Reaction แจ้งรับสลิปแล้ว
      await message.react("📩").catch(() => {});

      // แจ้งเตือนทีมงานเข้ามาตรวจสอบสลิปแบบคนตรวจสอบ (Manual Check)
      await message.reply({
        content: `🔔 <@&${STAFF_ROLE_ID}> **คุณ <@${message.author.id}> ได้แนบรูปภาพสลิปเรียบร้อยแล้วค่ะ!**\n> 🍵 ทีมงานสามารถตรวจสอบสลิปและใช้คำสั่ง **\`/อนุมัติสลิป\`** เพื่อเปิดเคสและเลือกผู้รับฟังได้เลยนะคะ`
      }).catch(() => {});
    } catch (err) {
      console.error("[HealJai] Error handling slip message upload:", err);
    }
  });

  // ── 1.2.1 Autocomplete & Slash Command: /อนุมัติสลิป (Staff Only) ────────────
  const handleApproveSlipAutocomplete = async (interaction) => {
    const focusedValue = (interaction.options.getFocused() || "").toLowerCase();
    const supabase = getSupabase();
    const choices = [];

    // ตัวเลือกแรก: แจ้งเตือนรวม (แท็ก Role)
    choices.push({
      name: "📢 ︲ส่งแจ้งเตือนรวม (แท็ก Role ทุกคน)",
      value: "open_dispatch"
    });

    const addedUserIds = new Set();

    if (supabase) {
      const { data: onlineCounselors } = await supabase
        .from("heal_jai_counselors")
        .select("user_id, display_name, status, service_modes, is_silent_companion")
        .eq("status", "ONLINE")
        .limit(24);

      if (onlineCounselors && onlineCounselors.length > 0) {
        for (const c of onlineCounselors) {
          addedUserIds.add(c.user_id);
          const name = c.display_name || c.user_id;
          const modes = [];
          if (Array.isArray(c.service_modes)) {
            if (c.service_modes.includes("chat")) modes.push("💬 Chat");
            if (c.service_modes.includes("voice")) modes.push("🎙️ Voice");
          }
          if (c.is_silent_companion) modes.push("🌿 นั่งเงียบ");
          const modesStr = modes.length > 0 ? ` (${modes.join(", ")})` : "";

          choices.push({
            name: `🟢 ︲${name}${modesStr}`.slice(0, 100),
            value: c.user_id
          });
        }
      }
    }

    // เพิ่มสมาชิกในเซิร์ฟเวอร์ที่มีสถานะ Discord Online และมี Role ผู้ให้คำปรึกษา หรือ Admin
    if (interaction.guild) {
      let members = interaction.guild.members.cache;
      if (members.size < 10) {
        try {
          members = await interaction.guild.members.fetch();
        } catch (_) {}
      }

      for (const [memberId, member] of members) {
        if (member.user.bot || addedUserIds.has(memberId)) continue;
        const hasCounselorRole = member.roles.cache.has(COUNSELOR_ROLE_ID) ||
                                member.roles.cache.has(STAFF_ROLE_ID) ||
                                member.roles.cache.has("1536208040582316032");
        const presenceStatus = member.presence?.status;
        const isOnline = presenceStatus === "online" || presenceStatus === "idle" || presenceStatus === "dnd";

        if (hasCounselorRole && isOnline) {
          addedUserIds.add(memberId);
          choices.push({
            name: `🟢 ︲${member.displayName} (Discord Online)`.slice(0, 100),
            value: memberId
          });
        }
      }
    }

    const filtered = choices
      .filter((choice) => choice.name.toLowerCase().includes(focusedValue) || choice.value.includes(focusedValue))
      .slice(0, 25);

    return interaction.respond(filtered).catch(() => {});
  };

  registerAutocomplete("อนุมัติสลิป", handleApproveSlipAutocomplete);

  const handleApproveSlipCommand = async (interaction) => {
    const isOwner = (process.env.OWNER_ID && interaction.user.id === process.env.OWNER_ID) ||
                    (interaction.guild && interaction.guild.ownerId === interaction.user.id);
    const hasStaffRole = interaction.member?.roles?.cache?.some((r) =>
      [STAFF_ROLE_ID, "1144701361448038512", "1144697989986791576", "1144698080239829092"].includes(r.id)
    );
    const hasPermission = interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
                          interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
    const isDevTester = process.env.DEV_MODE === "true";

    const isStaff = isOwner || hasStaffRole || hasPermission || isDevTester;

    if (!isStaff) {
      return interaction.reply({
        content: "❌ ขออภัยค่ะ เฉพาะทีมงานแอดมินเท่านั้นที่สามารถใช้คำสั่งนี้ได้นะคะ",
        flags: FLAG_EPHEMERAL
      });
    }

    await interaction.deferReply({ flags: FLAG_EPHEMERAL }).catch(() => {});

    const targetUser = interaction.options.getUser("user", true);
    const counselorChoice = interaction.options.getString("counselor", true);
    if (!counselorChoice) {
      return interaction.editReply({ content: "⚠️ กรุณาเลือกผู้รับฟังที่ออนไลน์เพื่อมอบหมายเคสค่ะ" });
    }

    const supabase = getSupabase();
    if (!supabase) {
      return interaction.editReply({ content: "❌ ไม่สามารถเชื่อมต่อฐานข้อมูลได้ค่ะ" });
    }

    try {
      // 1. ค้นหาออเดอร์ของลูกค้ารายนี้ที่รอชำระเงินหรือรอจับคู่
      let order = null;
      const { data: ord } = await supabase
        .from("heal_jai_orders_sessions")
        .select("*")
        .eq("customer_id", targetUser.id)
        .in("payment_status", ["PENDING", "PAID"])
        .in("session_status", ["WAITING", "DISPATCHING"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      order = ord;

      // หากไม่พบจาก customer_id ลองหาจากห้องปัจจุบัน
      if (!order && interaction.channel) {
        const { data: ordByCh } = await supabase
          .from("heal_jai_orders_sessions")
          .select("*")
          .eq("ticket_channel_id", interaction.channel.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        order = ordByCh;
      }

      if (!order) {
        return interaction.editReply({
          content: `⚠️ ไม่พบออเดอร์ที่รอชำระเงินของลูกค้า <@${targetUser.id}> ค่ะ (โปรดตรวจสอบว่าลูกค้าได้เปิดห้องและเลือกเมนูแล้วหรือไม่)`
        });
      }

      // 2. กำหนดผู้รับฟัง (Counselor ที่แอดมินเลือก หรือ ส่งแจ้งเตือนรวม)
      const isOpenDispatch = counselorChoice === "open_dispatch";
      const selectedCounselorId = isOpenDispatch ? null : counselorChoice;
      const isSpecific = !isOpenDispatch;
      const verifiedAt = new Date().toISOString();

      // 3. อัปเดตออเดอร์ใน DB
      await supabase
        .from("heal_jai_orders_sessions")
        .update({
          payment_status: "PAID",
          session_status: "DISPATCHING",
          counselor_id: selectedCounselorId,
          is_specific_counselor: isSpecific,
          slip_verified_at: verifiedAt,
          updated_at: verifiedAt
        })
        .eq("id", order.id);

      if (order.ticket_channel_id) {
        await supabase
          .from("heal_jai_tickets")
          .update({ status: "paid", updated_at: verifiedAt })
          .eq("channel_id", order.ticket_channel_id);
      }

      // 4. ลบการ์ดชำระเงินเดิมในห้อง Ticket และส่งการ์ดตรวจสอบสำเร็จ
      if (order.ticket_channel_id) {
        const ticketChannel = interaction.guild.channels.cache.get(order.ticket_channel_id) ||
                              await interaction.guild.channels.fetch(order.ticket_channel_id).catch(() => null);
        if (ticketChannel) {
          clearAutoDeleteTimer(ticketChannel.id);

          try {
            const fetchedMsgs = await ticketChannel.messages.fetch({ limit: 15 }).catch(() => null);
            if (fetchedMsgs) {
              for (const msg of fetchedMsgs.values()) {
                const hasPayButton = msg.components?.some((c) =>
                  c.components?.some((b) => b.customId?.includes("paid_confirm") || b.customId?.includes("btn_pay") || b.customId?.includes("drink_") || b.customId?.includes("topping_"))
                );
                const isComponentV2 = Boolean(msg.flags && (msg.flags.bitfield & FLAG_V2) !== 0);
                if (hasPayButton || isComponentV2) {
                  await msg.delete().catch(() => {});
                }
              }
            }
          } catch (delErr) {}

          // ส่งข้อความแจ้งตรวจสอบสลิปสำเร็จในการ์ด Component v2
          await ticketChannel.send({
            flags: FLAG_V2,
            components: [
              {
                type: 17,
                components: [
                  {
                    type: 10,
                    content: `## <:50121checkmark:1358584609087946867>︲__\` ตรวจสอบสลิปสำเร็จ! \`__\n> <@${targetUser.id}> **กำลังประสานงานผู้รับฟังให้คุณ** โปรดรอสักครู่นะคะ . . .`
                  }
                ]
              }
            ]
          }).catch(() => {});
        }
      }

      // 5. ส่ง Dispatch Alert ไปยังห้อง Dispatch (DISPATCH_CHANNEL_ID)
      const expireTimestamp = Math.floor((Date.now() + 3 * 60 * 1000) / 1000);
      const dispatchPayload = buildDispatchAlertPayload({
        counselorId: selectedCounselorId,
        customerId: targetUser.id,
        serviceMode: order.service_mode || "chat",
        orderId: order.id,
        orderCode: order.order_code,
        packageName: order.package_name || "ชาเขียวเย็นใจ",
        duration: order.duration_minutes || 15,
        isSilent: order.is_silent || false,
        isSpecific: isSpecific,
        toppingName: order.is_silent ? "นั่งเงียบเป็นเพื่อน (+19 บาท)" : (isSpecific ? "ระบุตัวผู้รับฟัง" : null),
        isBooster: order.is_booster || false,
        totalMinutes: order.duration_minutes || 15,
        totalPrice: order.total_price || 39,
        expireTimestamp
      });

      const dispatchChannel = interaction.guild.channels.cache.get(DISPATCH_CHANNEL_ID) ||
                              await interaction.guild.channels.fetch(DISPATCH_CHANNEL_ID).catch(() => null);
      if (dispatchChannel) {
        if (dispatchPayload.pingMention) {
          await dispatchChannel.send({ content: dispatchPayload.pingMention }).catch(() => {});
        }
        const dispatchMsg = await dispatchChannel.send(dispatchPayload).catch(() => null);
        if (dispatchMsg) {
          scheduleDispatchTimeout(client, interaction.guild, order.id, dispatchMsg.id, expireTimestamp);
        }
      }

      // 6. ส่งประวัติ Order History Log
      sendOrderHistoryLog(interaction.guild, {
        status: "PAID_VERIFIED",
        orderCode: order.order_code,
        customerId: targetUser.id,
        totalPrice: order.total_price,
        extraInfo: `สลิปได้รับการอนุมัติโดยทีมงาน <@${interaction.user.id}> (${selectedCounselorId ? `มอบหมายให้: <@${selectedCounselorId}>` : `เปิดแจ้งเตือนรวมแท็ก Role`})`
      });

      return interaction.editReply({
        content: `✅ **อนุมัติสลิปสำหรับลูกค้า <@${targetUser.id}> สำเร็จแล้วค่ะ!**\n> 🍵 ออเดอร์ \`#${order.order_code}\` ยอด ${order.total_price || 39} บาท\n> 🎯 มอบหมายไปยัง: ${selectedCounselorId ? `<@${selectedCounselorId}>` : `📢 ส่งแจ้งเตือนรวม (แท็ก Role)`}\n> 📨 ส่งการ์ดแจ้งเตือนไปยังห้องรับเคส <#${DISPATCH_CHANNEL_ID}> เรียบร้อยแล้วค่ะ`
      });
    } catch (err) {
      console.error("[HealJai] Error executing approve slip command:", err);
      return interaction.editReply({
        content: `❌ เกิดข้อผิดพลาดในการอนุมัติสลิป: \`${err.message}\``
      });
    }
  };

  registerCommand("อนุมัติสลิป", handleApproveSlipCommand);

  // ── 1.3 ตรวจจับข้อความแชทเพื่อ Auto-Start เซสชันเมื่อทั้งสองฝ่ายส่งข้อความ ────────
  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;

    const supabase = getSupabase();
    if (!supabase) return;

    try {
      const { data: waitingOrder } = await supabase
        .from("heal_jai_orders_sessions")
        .select("*")
        .eq("session_channel_id", message.channel.id)
        .eq("session_status", "WAITING_FOR_PROVIDER")
        .maybeSingle();

      if (!waitingOrder) return;

      // ตรวจสอบว่าผู้ส่งคือลูกค้าหรือผู้รับฟังประจำเคสนี้หรือไม่
      if (message.author.id === waitingOrder.customer_id || message.author.id === waitingOrder.counselor_id) {
        if (!sessionMessageActivity.has(waitingOrder.id)) {
          sessionMessageActivity.set(waitingOrder.id, new Set());
        }
        const activitySet = sessionMessageActivity.get(waitingOrder.id);
        activitySet.add(message.author.id);

        // หากทั้งลูกค้าและผู้รับฟังส่งข้อความในห้องนี้แล้ว -> ทำการ Auto-Start เซสชันทันที!
        if (activitySet.has(waitingOrder.customer_id) && activitySet.has(waitingOrder.counselor_id)) {
          console.log(`[HealJai] 💬 Two-party chat detected in session #${waitingOrder.order_code}. Auto-starting session...`);
          await startSessionInternal(client, message.guild, waitingOrder, {
            isAutoStart: true,
            triggerBy: "chat",
            channel: message.channel
          });
        }
      }
    } catch (e) {
      console.error("[HealJai] Message Auto-Start Check Error:", e.message);
    }
  });

  // ── 1.4 ตรวจจับห้องเสียงเพื่อ Auto-Start เซสชันเมื่อทั้งสองฝ่ายเข้าห้องเสียงพร้อมกัน ──
  client.on("voiceStateUpdate", async (oldState, newState) => {
    const member = newState.member || oldState.member;
    if (!member || member.user?.bot) return;

    const guild = newState.guild || oldState.guild;
    const targetChannelId = newState.channelId;
    if (!targetChannelId || !guild) return;

    const supabase = getSupabase();
    if (!supabase) return;

    try {
      const { data: waitingOrder } = await supabase
        .from("heal_jai_orders_sessions")
        .select("*")
        .eq("session_voice_id", targetChannelId)
        .eq("session_status", "WAITING_FOR_PROVIDER")
        .maybeSingle();

      if (!waitingOrder) return;

      const voiceChannel = guild.channels.cache.get(targetChannelId) ||
                           await guild.channels.fetch(targetChannelId).catch(() => null);
      if (!voiceChannel || !voiceChannel.isVoiceBased()) return;

      const memberIds = new Set(voiceChannel.members.keys());
      if (memberIds.has(waitingOrder.customer_id) && memberIds.has(waitingOrder.counselor_id)) {
        console.log(`[HealJai] 🎙️ Both parties connected to voice #${waitingOrder.order_code}. Auto-starting session...`);
        await startSessionInternal(client, guild, waitingOrder, {
          isAutoStart: true,
          triggerBy: "voice",
          channel: voiceChannel
        });
      }
    } catch (e) {
      console.error("[HealJai] Voice Auto-Start Check Error:", e.message);
    }
  });

  // ── 1.2 Autocomplete: /บัตรพนักงาน ──────────────────────────────────────────
  registerAutocomplete("บัตรพนักงาน", async (interaction) => {
    const focusedValue = (interaction.options.getFocused() || "").toLowerCase();
    const supabase = getSupabase();
    const choicesMap = new Map(); // key: userId, value: { name, value, priority }

    // 1. ดึงข้อมูลจากฐานข้อมูล Supabase
    if (supabase) {
      const { data: counselors } = await supabase
        .from("heal_jai_counselors")
        .select("user_id, display_name, status")
        .limit(100);

      if (counselors && counselors.length > 0) {
        for (const c of counselors) {
          const isDbOnline = c.status === "ONLINE";
          const isDbBusy = c.status === "BUSY";
          const emoji = isDbOnline ? "🟢" : (isDbBusy ? "🟡" : "⚪");
          const name = c.display_name || c.user_id;
          choicesMap.set(c.user_id, {
            name: `${emoji} ${name} (${c.user_id})`.slice(0, 100),
            value: c.user_id,
            priority: isDbOnline ? 1 : (isDbBusy ? 2 : 4)
          });
        }
      }
    }

    // 2. ดึง/ตรวจสมาชิกในเซิร์ฟเวอร์ Discord (รวมถึงตรวจ Live Discord Presence)
    if (interaction.guild) {
      let members = interaction.guild.members.cache;
      if (members.size < 10) {
        try {
          members = await interaction.guild.members.fetch();
        } catch (_) {}
      }

      for (const [memberId, member] of members) {
        if (member.user.bot) continue;

        const hasCounselorRole = member.roles.cache.has(COUNSELOR_ROLE_ID) ||
                                member.roles.cache.has(STAFF_ROLE_ID) ||
                                member.roles.cache.has("1536208040582316032");
        const presenceStatus = member.presence?.status; // 'online' | 'idle' | 'dnd' | 'offline' | undefined
        const isDiscordOnline = presenceStatus === "online";
        const isDiscordAway = presenceStatus === "idle" || presenceStatus === "dnd";

        if (choicesMap.has(memberId)) {
          const current = choicesMap.get(memberId);
          if (isDiscordOnline && !current.name.startsWith("🟢")) {
            current.name = `🟢 ${member.displayName} (${memberId})`.slice(0, 100);
            current.priority = 1;
          } else if (isDiscordAway && current.name.startsWith("⚪")) {
            current.name = `🟡 ${member.displayName} (${memberId})`.slice(0, 100);
            current.priority = 2;
          }
        } else if (hasCounselorRole || isDiscordOnline || isDiscordAway) {
          const emoji = isDiscordOnline ? "🟢" : (isDiscordAway ? "🟡" : "⚪");
          const priority = isDiscordOnline ? 1 : (isDiscordAway ? 2 : (hasCounselorRole ? 3 : 5));
          choicesMap.set(memberId, {
            name: `${emoji} ${member.displayName} (${memberId})`.slice(0, 100),
            value: memberId,
            priority
          });
        }
      }
    }

    const allChoices = Array.from(choicesMap.values());
    allChoices.sort((a, b) => a.priority - b.priority);

    const filtered = allChoices
      .filter((choice) =>
        choice.name.toLowerCase().includes(focusedValue) ||
        choice.value.includes(focusedValue)
      )
      .slice(0, 25);

    return interaction.respond(filtered).catch(() => {});
  });

  // ── 1.3 Slash Command: /บัตรพนักงาน ───────────────────────────────────────
  registerCommand("บัตรพนักงาน", async (interaction) => {
    const isOwner = (process.env.OWNER_ID && interaction.user.id === process.env.OWNER_ID) ||
                    (interaction.guild && interaction.guild.ownerId === interaction.user.id);
    const hasStaffRole = interaction.member?.roles?.cache?.some((r) =>
      [STAFF_ROLE_ID, "1144701361448038512", "1144697989986791576", "1144698080239829092"].includes(r.id)
    );
    const hasPermission = interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
                          interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
    const isDevTester = process.env.DEV_MODE === "true";

    const isStaff = isOwner || hasStaffRole || hasPermission || isDevTester;

    if (!isStaff) {
      return interaction.reply({
        content: "❌ ขออภัยค่ะ เฉพาะทีมงานแอดมินเท่านั้นที่สามารถใช้คำสั่งนี้ได้นะคะ",
        flags: FLAG_EPHEMERAL
      });
    }

    const targetUserId = interaction.options.getString("พนักงาน", true);
    const targetChannel = interaction.options.getChannel("ห้อง") || interaction.channel;

    if (!targetChannel.isTextBased()) {
      return interaction.reply({
        content: "⚠️ กรุณาเลือกห้องที่เป็น Text Channel เท่านั้นค่ะ",
        flags: FLAG_EPHEMERAL
      });
    }

    await interaction.deferReply({ flags: FLAG_EPHEMERAL });

    const guild = interaction.guild;
    const targetMember = await guild.members.fetch(targetUserId).catch(() => null);

    let counselorData = {
      guild_id: guild.id,
      user_id: targetUserId,
      display_name: targetMember?.displayName || targetUserId,
      status: "OFFLINE",
      bio: "ยินดีต้อนรับสู่พื้นที่พักใจ พร้อมรับฟังและอยู่เคียงข้างคุณเสมอค่ะ 🍵",
      average_rating: 5.00,
      total_sessions: 0,
      total_reviews: 0
    };

    const supabase = getSupabase();
    if (supabase) {
      const { data: existing } = await supabase
        .from("heal_jai_counselors")
        .select("*")
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (existing) {
        counselorData = existing;
      } else {
        await supabase.from("heal_jai_counselors").upsert({
          guild_id: guild.id,
          user_id: targetUserId,
          display_name: targetMember?.displayName || targetUserId,
          status: "OFFLINE",
          bio: counselorData.bio,
          updated_at: new Date().toISOString()
        }, { onConflict: "user_id" });
      }
    }

    const cardPayload = buildCounselorCardPayload(counselorData, targetMember);
    const cardMsg = await targetChannel.send(cardPayload).catch((e) => {
      console.error("[HealJai] Failed to send counselor card message:", e.message);
      return null;
    });

    if (!cardMsg) {
      return interaction.editReply({
        content: "❌ เกิดข้อผิดพลาดในการส่งบัตรพนักงานไปยังห้องที่เลือกค่ะ"
      });
    }

    if (supabase) {
      await supabase.from("heal_jai_counselors").update({
        card_message_id: cardMsg.id,
        card_channel_id: targetChannel.id,
        updated_at: new Date().toISOString()
      }).eq("user_id", targetUserId);
    }

    return interaction.editReply({
      content: `✅ ส่งบัตรพนักงานของ <@${targetUserId}> ไปยัง <#${targetChannel.id}> และผูก ID ข้อความ (\`${cardMsg.id}\`) เรียบร้อยแล้วค่ะ!\n> 🍵 เมื่อพนักงานสลับสถานะหรือแก้ไขข้อมูลส่วนตัว ระบบจะอัปเดตการ์ดนี้ให้อัตโนมัติทันทีค่ะ`
    });
  });

  // ── 1.4 Autocomplete: /แก้ไขพนักงาน ───────────────────────────────────────
  registerAutocomplete("แก้ไขพนักงาน", async (interaction) => {
    const focusedValue = (interaction.options.getFocused() || "").toLowerCase();
    const supabase = getSupabase();
    let choices = [];

    if (supabase) {
      const { data: counselors } = await supabase
        .from("heal_jai_counselors")
        .select("user_id, display_name, status")
        .limit(50);

      if (counselors && counselors.length > 0) {
        choices = counselors.map((c) => {
          const emoji = c.status === "ONLINE" ? "🟢" : (c.status === "BUSY" ? "🟡" : "⚪");
          const name = c.display_name || c.user_id;
          return {
            name: `${emoji} ${name} (${c.user_id})`.slice(0, 100),
            value: c.user_id
          };
        });
      }
    }

    if (choices.length === 0 && interaction.guild) {
      const members = interaction.guild.members.cache.filter((m) =>
        m.roles.cache.has(COUNSELOR_ROLE_ID) || m.roles.cache.has(STAFF_ROLE_ID)
      );
      choices = members.map((m) => ({
        name: `⚪ ${m.displayName} (${m.id})`.slice(0, 100),
        value: m.id
      }));
    }

    const filtered = choices
      .filter((choice) => choice.name.toLowerCase().includes(focusedValue) || choice.value.includes(focusedValue))
      .slice(0, 25);

    return interaction.respond(filtered).catch(() => {});
  });

  // ── 1.5 Slash Command: /แก้ไขพนักงาน (Admin Only) ──────────────────────────
  const handleEditCounselorCommand = async (interaction) => {
    const isOwner = (process.env.OWNER_ID && interaction.user.id === process.env.OWNER_ID) ||
                    (interaction.guild && interaction.guild.ownerId === interaction.user.id);
    const hasStaffRole = interaction.member?.roles?.cache?.some((r) =>
      [STAFF_ROLE_ID, "1144701361448038512", "1144697989986791576", "1144698080239829092"].includes(r.id)
    );
    const hasPermission = interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
                          interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
    const isDevTester = process.env.DEV_MODE === "true";

    const isStaff = isOwner || hasStaffRole || hasPermission || isDevTester;

    if (!isStaff) {
      return interaction.reply({
        content: "❌ ขออภัยค่ะ เฉพาะทีมงานแอดมินเท่านั้นที่สามารถใช้คำสั่งนี้ได้นะคะ",
        flags: FLAG_EPHEMERAL
      });
    }

    const targetUserId = interaction.options.getUser("พนักงาน")?.id || interaction.options.getString("พนักงาน");

    await interaction.deferReply({ flags: FLAG_EPHEMERAL });

    const guild = interaction.guild;
    const supabase = getSupabase();
    if (!supabase) {
      return interaction.editReply({ content: "❌ ไม่สามารถเชื่อมต่อฐานข้อมูลได้ค่ะ" });
    }

    // หากระบุตัวพนักงานมาตรงๆ -> เปิดหน้าแก้ไขของการ์ดคนนั้นทันที
    if (targetUserId) {
      const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
      let { data: counselor } = await supabase
        .from("heal_jai_counselors")
        .select("*")
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (!counselor) {
        counselor = {
          guild_id: guild.id,
          user_id: targetUserId,
          display_name: targetMember?.displayName || targetUserId,
          status: "OFFLINE",
          service_modes: ["chat", "voice"],
          is_silent_companion: false,
          specialty_tags: ALL_SPECIALTIES,
          bio: "ยินดีต้อนรับสู่พื้นที่พักใจ พร้อมรับฟังและอยู่เคียงข้างคุณเสมอค่ะ",
          image_url: targetMember?.displayAvatarURL?.({ extension: "png", size: 512 }) || null
        };
        await supabase.from("heal_jai_counselors").upsert(counselor, { onConflict: "user_id" });
      }

      return interaction.editReply(buildAdminCounselorEditPayload(counselor, targetMember));
    }

    // กรณีไม่ระบุตัวพนักงาน -> แสดงเมนู Select Dropdown รายชื่อพนักงาน
    const { data: dbCounselors } = await supabase
      .from("heal_jai_counselors")
      .select("user_id, display_name, status")
      .eq("guild_id", guild.id)
      .limit(25);

    let counselorList = [];
    if (dbCounselors && dbCounselors.length > 0) {
      counselorList = dbCounselors.map((c) => ({
        userId: c.user_id,
        displayName: c.display_name,
        status: c.status
      }));
    } else {
      const roleMembers = guild.members.cache.filter((m) =>
        m.roles.cache.has(COUNSELOR_ROLE_ID) || m.roles.cache.has(STAFF_ROLE_ID)
      );
      counselorList = roleMembers.map((m) => ({
        userId: m.id,
        displayName: m.displayName,
        status: "OFFLINE"
      })).slice(0, 25);
    }

    return interaction.editReply(buildAdminCounselorSelectPayload(counselorList));
  };

  registerCommand("แก้ไขพนักงาน", handleEditCounselorCommand);
  registerCommand("แก้ไขที่ปรึกษา", handleEditCounselorCommand);

  // ── 2. Interaction Buttons Handler ─────────────────────────────────
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

    const { customId, guild, member, user, channel } = interaction;
    const supabase = getSupabase();

    // ── 2.0 จัดการ Modal Submit ─────────────────────────────────────────
    if (interaction.isModalSubmit()) {
      if (customId && customId.startsWith("heal_jai_admin_modal_submit:")) {
        const targetUserId = customId.split(":")[1];
        const newDisplayName = interaction.fields.getTextInputValue("display_name");
        const newBio = interaction.fields.getTextInputValue("bio");
        const newImageUrl = interaction.fields.getTextInputValue("image_url");
        const newPayoutAccount = interaction.fields.getTextInputValue("payout_account");

        await interaction.deferUpdate().catch(() => {});

        const updateData = {
          updated_at: new Date().toISOString()
        };
        if (newDisplayName && newDisplayName.trim()) updateData.display_name = newDisplayName.trim();
        if (newBio !== undefined) updateData.bio = newBio.trim();
        if (newImageUrl !== undefined) updateData.image_url = newImageUrl.trim();
        if (newPayoutAccount !== undefined) updateData.payout_account = newPayoutAccount.trim();

        if (supabase) {
          await supabase
            .from("heal_jai_counselors")
            .update(updateData)
            .eq("user_id", targetUserId);
        }

        await updateCounselorCardMessage(guild, targetUserId);

        const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
        let updated = null;
        if (supabase) {
          const { data } = await supabase
            .from("heal_jai_counselors")
            .select("*")
            .eq("user_id", targetUserId)
            .maybeSingle();
          updated = data;
        }

        return interaction.editReply(buildAdminCounselorEditPayload(updated || {}, targetMember)).catch(() => {});
      }
    }

    // ── 2.0 จัดการ Select Menu (เลือกผู้รับฟัง & เลือกความถนัดเฉพาะ) ─────
    if (interaction.isStringSelectMenu()) {
      // แอดมินเลือกรายชื่อพนักงานจาก Dropdown
      if (customId === "heal_jai_admin_select_edit_counselor") {
        const chosenUserId = interaction.values[0];
        if (chosenUserId === "none") return;
        await interaction.deferUpdate().catch(() => {});

        const targetMember = await guild.members.fetch(chosenUserId).catch(() => null);
        let counselor = null;
        if (supabase) {
          const { data } = await supabase
            .from("heal_jai_counselors")
            .select("*")
            .eq("user_id", chosenUserId)
            .maybeSingle();
          counselor = data;
        }

        if (!counselor) {
          counselor = {
            guild_id: guild.id,
            user_id: chosenUserId,
            display_name: targetMember?.displayName || chosenUserId,
            status: "OFFLINE",
            service_modes: ["chat", "voice"],
            is_silent_companion: false,
            specialty_tags: ALL_SPECIALTIES,
            bio: "ยินดีต้อนรับสู่พื้นที่พักใจ พร้อมรับฟังและอยู่เคียงข้างคุณเสมอค่ะ",
            image_url: targetMember?.displayAvatarURL?.({ extension: "png", size: 512 }) || null
          };
          if (supabase) {
            await supabase.from("heal_jai_counselors").upsert(counselor, { onConflict: "user_id" });
          }
        }

        return interaction.editReply(buildAdminCounselorEditPayload(counselor, targetMember)).catch((e) => {
          console.error("[HealJai] Error rendering counselor edit payload:", e.message);
        });
      }

      // แอดมินเลือกความถนัดเฉพาะ (Specialties Multi-Select Dropdown)
      if (customId && customId.startsWith("heal_jai_admin_set_specialties:")) {
        const targetUserId = customId.split(":")[1];
        const chosenTags = interaction.values;
        await interaction.deferUpdate().catch(() => {});

        if (supabase) {
          await supabase
            .from("heal_jai_counselors")
            .update({
              specialty_tags: chosenTags,
              specialties_updated_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            })
            .eq("user_id", targetUserId);
        }

        await updateCounselorCardMessage(guild, targetUserId);

        const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
        let updated = null;
        if (supabase) {
          const { data } = await supabase
            .from("heal_jai_counselors")
            .select("*")
            .eq("user_id", targetUserId)
            .maybeSingle();
          updated = data;
        }

        return interaction.editReply(buildAdminCounselorEditPayload(updated || {}, targetMember)).catch(() => {});
      }

      if (customId === "heal_jai_select_counselor" || customId === CUSTOM_IDS.SELECT_COUNSELOR || customId === "p_349898994257760257") {
        let state = ticketSelections.get(channel.id) || { step: 3.5, mode: "chat", drinkId: "tea_39", toppingId: "specific_39" };
        const chosenCounselorId = interaction.values[0];
        state.counselorId = chosenCounselorId;
        const counselorObj = MOCK_COUNSELORS[chosenCounselorId];
        state.counselorName = counselorObj ? counselorObj.name : chosenCounselorId;
        state.step = 4;
        state.userAvatarUrl = user.displayAvatarURL({ extension: "png", size: 512 });
        ticketSelections.set(channel.id, state);

        return interaction.update(buildInteractiveOrderPayload(state)).catch((e) => {
          console.error("[HealJai] Failed to update counselor select menu:", e.message);
        });
      }

      // จัดการเลือกความถนัดเฉพาะ (Specialties SelectMenu - ปิดการแก้ไขด้วยตนเอง)
      if (customId === CUSTOM_IDS.SELECT_SPECIALTIES || customId === "heal_jai_select_specialties") {
        return interaction.reply({
          content: "❌ ขออภัยค่ะ ไม่อนุญาตให้แก้ไขความถนัดด้วยตนเอง กรุณาติดต่อทีมงานแอดมินเพื่อขอปรับปรุงข้อมูลบนบัตรพนักงานนะคะ 🍵",
          flags: FLAG_EPHEMERAL
        });
      }

      return;
    }

    // ── 2.0.1 ปุ่มเลือกรูปแบบบริการ (Step 1 -> Step 2) ────────────────
    if (
      customId === CUSTOM_IDS.MODE_CHAT ||
      customId === CUSTOM_IDS.MODE_VOICE ||
      customId === "p_349868508034633730" ||
      customId === "p_349868816987066371"
    ) {
      const state = ticketSelections.get(channel.id) || { step: 1 };
      const isVoice = (customId === CUSTOM_IDS.MODE_VOICE || customId === "p_349868816987066371");
      state.mode = isVoice ? "voice" : "chat";
      state.step = 2;
      state.userAvatarUrl = user.displayAvatarURL({ extension: "png", size: 512 });
      ticketSelections.set(channel.id, state);

      return interaction.update(buildInteractiveOrderPayload(state)).catch((e) => {
        console.error("[HealJai] Failed to update service mode:", e.message);
      });
    }

    // ── 2.0.2 ปุ่มเลือกเครื่องดื่ม (Step 2 -> Step 3) ─────────────────
    if (
      [CUSTOM_IDS.DRINK_TEA_39, CUSTOM_IDS.DRINK_COCOA_69, CUSTOM_IDS.DRINK_COFFEE_129, "p_349868922385731588"].includes(customId)
    ) {
      const state = ticketSelections.get(channel.id) || { step: 2, mode: "chat" };
      if (customId === CUSTOM_IDS.DRINK_TEA_39 || customId === "heal_jai_drink_tea_39") state.drinkId = "tea_39";
      else if (customId === CUSTOM_IDS.DRINK_COCOA_69 || customId === "heal_jai_drink_cocoa_69") state.drinkId = "cocoa_69";
      else if (customId === CUSTOM_IDS.DRINK_COFFEE_129 || customId === "heal_jai_drink_coffee_129" || customId === "p_349868922385731588") state.drinkId = "coffee_129";
      else state.drinkId = "tea_39";

      state.step = 3;
      state.userAvatarUrl = user.displayAvatarURL({ extension: "png", size: 512 });
      ticketSelections.set(channel.id, state);

      return interaction.update(buildInteractiveOrderPayload(state)).catch((e) => {
        console.error("[HealJai] Failed to update drink selection:", e.message);
      });
    }

    // ── 2.0.3 ปุ่มเลือกท็อปปิ้ง (Step 3 -> Step 3b หรือ Step 4) ────────
    if (
      [CUSTOM_IDS.TOPPING_SILENT, CUSTOM_IDS.TOPPING_SPECIFIC, CUSTOM_IDS.TOPPING_NONE, "p_349881684222545926"].includes(customId)
    ) {
      const state = ticketSelections.get(channel.id) || { step: 3, mode: "chat", drinkId: "tea_39" };
      state.userAvatarUrl = user.displayAvatarURL({ extension: "png", size: 512 });

      if (customId === CUSTOM_IDS.TOPPING_SILENT) {
        state.toppingId = "silent_19";
        state.counselorId = null;
        state.counselorName = null;
        state.step = 4;
      } else if (customId === CUSTOM_IDS.TOPPING_NONE || customId === "p_349881684222545926") {
        state.toppingId = "none";
        state.counselorId = null;
        state.counselorName = null;
        state.step = 4;
      } else if (customId === CUSTOM_IDS.TOPPING_SPECIFIC) {
        state.toppingId = "specific_39";
        state.step = 3.5;
      }
      ticketSelections.set(channel.id, state);

      return interaction.update(buildInteractiveOrderPayload(state)).catch((e) => {
        console.error("[HealJai] Failed to update topping selection:", e.message);
      });
    }

    // ── 2.0.4 ปุ่มสั่งใหม่ (Reset Wizard) ──────────────────────────────
    if (
      customId === CUSTOM_IDS.RESET_ORDER ||
      customId === "heal_jai_reset_order" ||
      customId === "p_349886014707208200"
    ) {
      const state = {
        step: 1,
        mode: null,
        drinkId: null,
        toppingId: null,
        counselorId: null,
        counselorName: null,
        userAvatarUrl: user.displayAvatarURL({ extension: "png", size: 512 })
      };
      ticketSelections.set(channel.id, state);

      return interaction.update(buildInteractiveOrderPayload(state)).catch((e) => {
        console.error("[HealJai] Failed to reset order wizard:", e.message);
      });
    }

    // ── 2.0.5 จัดการปุ่มแผงควบคุมแก้ไขพนักงาน (Admin Counselor Controls) ──
    if (customId === "heal_jai_admin_change_counselor") {
      await interaction.deferUpdate().catch(() => {});
      let counselorList = [];
      if (supabase) {
        const { data: dbCounselors } = await supabase
          .from("heal_jai_counselors")
          .select("user_id, display_name, status")
          .eq("guild_id", guild.id)
          .limit(25);

        if (dbCounselors && dbCounselors.length > 0) {
          counselorList = dbCounselors.map((c) => ({
            userId: c.user_id,
            displayName: c.display_name,
            status: c.status
          }));
        }
      }
      if (counselorList.length === 0) {
        const roleMembers = guild.members.cache.filter((m) =>
          m.roles.cache.has(COUNSELOR_ROLE_ID) || m.roles.cache.has(STAFF_ROLE_ID)
        );
        counselorList = roleMembers.map((m) => ({
          userId: m.id,
          displayName: m.displayName,
          status: "OFFLINE"
        })).slice(0, 25);
      }

      return interaction.editReply(buildAdminCounselorSelectPayload(counselorList)).catch(() => {});
    }

    if (customId && customId.startsWith("heal_jai_admin_edit_modal:")) {
      const targetUserId = customId.split(":")[1];
      let currentData = null;
      if (supabase) {
        const { data } = await supabase
          .from("heal_jai_counselors")
          .select("*")
          .eq("user_id", targetUserId)
          .maybeSingle();
        currentData = data;
      }

      const modal = buildAdminEditCounselorModal(targetUserId, currentData || {});
      return interaction.showModal(modal).catch((e) => {
        console.error("[HealJai] Error showing admin edit counselor modal:", e.message);
      });
    }

    if (customId && customId.startsWith("heal_jai_admin_toggle_service:")) {
      const targetUserId = customId.split(":")[1];
      await interaction.deferUpdate().catch(() => {});

      let existing = null;
      if (supabase) {
        const { data } = await supabase
          .from("heal_jai_counselors")
          .select("*")
          .eq("user_id", targetUserId)
          .maybeSingle();
        existing = data;
      }

      const currentModes = existing?.service_modes || ["chat", "voice"];
      let nextModes = ["chat", "voice"];
      if (currentModes.includes("chat") && currentModes.includes("voice")) {
        nextModes = ["chat"]; // Chat only
      } else if (currentModes.length === 1 && currentModes[0] === "chat") {
        nextModes = ["voice"]; // Voice only
      } else {
        nextModes = ["chat", "voice"]; // Both
      }

      if (supabase) {
        await supabase
          .from("heal_jai_counselors")
          .update({
            service_modes: nextModes,
            updated_at: new Date().toISOString()
          })
          .eq("user_id", targetUserId);
      }

      await updateCounselorCardMessage(guild, targetUserId);

      const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
      let updated = null;
      if (supabase) {
        const { data } = await supabase
          .from("heal_jai_counselors")
          .select("*")
          .eq("user_id", targetUserId)
          .maybeSingle();
        updated = data;
      }

      return interaction.editReply(buildAdminCounselorEditPayload(updated || {}, targetMember)).catch(() => {});
    }

    if (customId && customId.startsWith("heal_jai_admin_toggle_silent:")) {
      const targetUserId = customId.split(":")[1];
      await interaction.deferUpdate().catch(() => {});

      let existing = null;
      if (supabase) {
        const { data } = await supabase
          .from("heal_jai_counselors")
          .select("*")
          .eq("user_id", targetUserId)
          .maybeSingle();
        existing = data;
      }

      const nextSilent = !existing?.is_silent_companion;

      if (supabase) {
        await supabase
          .from("heal_jai_counselors")
          .update({
            is_silent_companion: nextSilent,
            updated_at: new Date().toISOString()
          })
          .eq("user_id", targetUserId);
      }

      await updateCounselorCardMessage(guild, targetUserId);

      const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
      let updated = null;
      if (supabase) {
        const { data } = await supabase
          .from("heal_jai_counselors")
          .select("*")
          .eq("user_id", targetUserId)
          .maybeSingle();
        updated = data;
      }

      return interaction.editReply(buildAdminCounselorEditPayload(updated || {}, targetMember)).catch(() => {});
    }

    // ── 2.0.1 ปุ่มเลือกรูปแบบบริการ (Step 1 -> Step 2) ────────────────
    if (
      customId === CUSTOM_IDS.MODE_CHAT ||
      customId === CUSTOM_IDS.MODE_VOICE ||
      customId === "p_349868508034633730" ||
      customId === "p_349868816987066371"
    ) {
      const state = ticketSelections.get(channel.id) || { step: 1 };
      const isVoice = (customId === CUSTOM_IDS.MODE_VOICE || customId === "p_349868816987066371");
      state.mode = isVoice ? "voice" : "chat";
      state.step = 2;
      state.userAvatarUrl = user.displayAvatarURL({ extension: "png", size: 512 });
      ticketSelections.set(channel.id, state);

      return interaction.update(buildInteractiveOrderPayload(state)).catch((e) => {
        console.error("[HealJai] Failed to update service mode:", e.message);
      });
    }

    // ── 2.0.2 ปุ่มเลือกเครื่องดื่ม (Step 2 -> Step 3) ─────────────────
    if (
      [CUSTOM_IDS.DRINK_TEA_39, CUSTOM_IDS.DRINK_COCOA_69, CUSTOM_IDS.DRINK_COFFEE_129, "p_349868922385731588"].includes(customId)
    ) {
      const state = ticketSelections.get(channel.id) || { step: 2, mode: "chat" };
      if (customId === CUSTOM_IDS.DRINK_TEA_39 || customId === "heal_jai_drink_tea_39") state.drinkId = "tea_39";
      else if (customId === CUSTOM_IDS.DRINK_COCOA_69 || customId === "heal_jai_drink_cocoa_69") state.drinkId = "cocoa_69";
      else if (customId === CUSTOM_IDS.DRINK_COFFEE_129 || customId === "heal_jai_drink_coffee_129" || customId === "p_349868922385731588") state.drinkId = "coffee_129";
      else state.drinkId = "tea_39";

      state.step = 3;
      state.userAvatarUrl = user.displayAvatarURL({ extension: "png", size: 512 });
      ticketSelections.set(channel.id, state);

      return interaction.update(buildInteractiveOrderPayload(state)).catch((e) => {
        console.error("[HealJai] Failed to update drink selection:", e.message);
      });
    }

    // ── 2.0.3 ปุ่มเลือกท็อปปิ้ง (Step 3 -> Step 3b หรือ Step 4) ────────
    if (
      [CUSTOM_IDS.TOPPING_SILENT, CUSTOM_IDS.TOPPING_SPECIFIC, CUSTOM_IDS.TOPPING_NONE, "p_349881684222545926"].includes(customId)
    ) {
      const state = ticketSelections.get(channel.id) || { step: 3, mode: "chat", drinkId: "tea_39" };
      state.userAvatarUrl = user.displayAvatarURL({ extension: "png", size: 512 });

      if (customId === CUSTOM_IDS.TOPPING_SILENT) {
        state.toppingId = "silent_19";
        state.counselorId = null;
        state.counselorName = null;
        state.step = 4;
      } else if (customId === CUSTOM_IDS.TOPPING_NONE || customId === "p_349881684222545926") {
        state.toppingId = "none";
        state.counselorId = null;
        state.counselorName = null;
        state.step = 4;
      } else if (customId === CUSTOM_IDS.TOPPING_SPECIFIC) {
        state.toppingId = "specific_39";
        state.step = 3.5;
      }
      ticketSelections.set(channel.id, state);

      return interaction.update(buildInteractiveOrderPayload(state)).catch((e) => {
        console.error("[HealJai] Failed to update topping selection:", e.message);
      });
    }

    // ── 2.0.4 ปุ่มสั่งใหม่ (Reset Wizard) ──────────────────────────────
    if (
      customId === CUSTOM_IDS.RESET_ORDER ||
      customId === "heal_jai_reset_order" ||
      customId === "p_349886014707208200"
    ) {
      const state = {
        step: 1,
        mode: null,
        drinkId: null,
        toppingId: null,
        counselorId: null,
        counselorName: null,
        userAvatarUrl: user.displayAvatarURL({ extension: "png", size: 512 })
      };
      ticketSelections.set(channel.id, state);

      return interaction.update(buildInteractiveOrderPayload(state)).catch((e) => {
        console.error("[HealJai] Failed to reset order wizard:", e.message);
      });
    }

    // ── 2.1 กดปุ่ม "อ่านข้อตกลงฉบับเต็ม" ──────────────────────────────
    if (customId === CUSTOM_IDS.VIEW_FULL_TERMS) {
      return interaction.reply({
        flags: FLAG_V2 | FLAG_EPHEMERAL,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: [
                  `## <a:fourleafclover:1536711677699952680>︲__\` ข้อตกลงและนโยบายการให้บริการฉบับเต็ม (Full Terms) \`__\n`,
                  `**1. นโยบายความเป็นส่วนตัวและการรักษาความลับ (Confidentiality):**`,
                  `* เรื่องราวและข้อมูลทั้งหมดในการสนทนาจะถูกเก็บเป็นความลับสูงสุด เฉพาะคุณและผู้รับฟังเท่านั้น`,
                  `* ห้องสนทนาชั่วคราวจะถูกลบออกเมื่อสิ้นสุดเซสชัน และไม่มีการบันทึกเสียงบทสนทนาเด็ดขาด\n`,
                  `**2. ขอบเขตการให้บริการ (Scope of Service):**`,
                  `* บริการนี้เป็น **"การรับฟังและคลายเครียดทั่วไป (Active Listening)"** ไม่ใช่การรักษาทางการแพทย์หรือจิตบำบัด`,
                  `* หากคุณมีภาวะวิกฤตทางอารมณ์หรือมีความเสี่ยงต่อชีวิต โปรดติดต่อสายด่วนสุขภาพจิต **1323** ทันที\n`,
                  `**3. กฎความปลอดภัยและการเคารพซึ่งกันและกัน (Zero Tolerance):**`,
                  `* ห้ามใช้ถ้อยคำหยาบคาย คุกคาม หรือส่อไปในทางอนาจารเด็ดขาด`,
                  `* หากฝ่าฝืน ทีมงานจะยุติการให้บริการทันทีโดยไม่มีการคืนเงินทุกกรณี\n`,
                  `**4. นโยบายการคืนเงิน (Refund Policy):**`,
                  `* คืนเงิน 100% หากระบบขัดข้อง หรือไม่สามารถจัดหาผู้รับฟังให้ได้ตามเงื่อนไข`,
                  `* ขอสงวนสิทธิ์ไม่คืนเงินเมื่อเริ่มเซสชันแล้ว หรือลูกค้ายุติการสนทนาก่อนเวลาด้วยตนเอง`
                ].join('\n')
              }
            ]
          }
        ]
      }).catch(() => {});
    }

    // ── 2.2 กดปุ่ม "ข้ามการอ่านและยินยอม" (Accept Terms) ─────────────
    if (customId === CUSTOM_IDS.ACCEPT_TERMS) {
      if (isTermsDisabled) {
        return interaction.reply({
          content: "### 📜︲ระบบงดรับการยินยอมข้อตกลงชั่วคราว\n> ขออภัยค่ะ ขณะนี้ระบบปิดรับการกดยินยอมข้อตกลงชั่วคราว กรุณาติดต่อทีมงานแอดมินนะคะ 🍵",
          flags: FLAG_EPHEMERAL
        });
      }

      try {
        // กรณีที่ 1: กดยินยอมในห้องข้อตกลง (1️⃣︰อ่านข้อตกลงและนโยบาย)
        if (channel.id === TERMS_CHANNEL_ID || !channel.name.includes("เลือกเมนู")) {
          // 1. มอบ Role "ยืนยัน" (1545271910328180777)
          if (member?.roles && !member.roles.cache.has(VERIFIED_ROLE_ID)) {
            await member.roles.add(VERIFIED_ROLE_ID).catch((e) => {
              console.warn("[HealJai] Failed to grant verified role:", e.message);
            });
          }

          // 2. บันทึกลง heal_jai_consents
          if (supabase) {
            try {
              const { error: consentErr } = await supabase.from("heal_jai_consents").upsert({
                guild_id: guild.id,
                user_id: user.id,
                version: "v1.0",
                consent_type: "agreement",
                role_assigned: true,
                accepted_at: new Date().toISOString()
              }, { onConflict: "user_id" });
              if (consentErr) {
                console.error("[HealJai] Consent DB insert error:", consentErr.message);
              }
            } catch (e) {
              console.error("[HealJai] Consent DB insert error:", e.message);
            }
          }

          return interaction.reply({
            flags: FLAG_V2 | FLAG_EPHEMERAL,
            components: [
              {
                type: 17,
                components: [
                  {
                    type: 14,
                    spacing: 1,
                    divider: false
                  },
                  {
                    type: 10,
                    content: `## <:hj_clover:1552227021122314250>︲__\` ยินยอมข้อตกลงเรียบร้อยแล้วค่ะ \`__\n-# ระบบได้ทำการบันทึกข้อมูลและประทับเวลาการยินยอมนี้ไว้ในระบบฐานข้อมูลอย่างปลอดภัย เพื่อเป็นหลักฐานการใช้บริการตามนโยบายความเป็นส่วนตัว\n\n- เริ่มใช้บริการ: <#${MENU_CHANNEL_ID}>\n- พบปัญหา: <#1536207517120466964>`
                  },
                  {
                    type: 14,
                    spacing: 1,
                    divider: false
                  }
                ]
              }
            ]
          }).catch(() => {});
        }

        // กรณีที่ 2: กดในห้อง Ticket ชั่วคราว (ปรับสิทธิ์พิมพ์ข้อความ)
        await interaction.deferUpdate().catch(() => {});

        await channel.permissionOverwrites.edit(user.id, {
          SendMessages: true,
          ViewChannel: true,
          ReadMessageHistory: true,
        });

        if (interaction.message && interaction.message.deletable) {
          await interaction.message.delete().catch(() => {});
        }

        await channel.send({
          content: `<@&${STAFF_ROLE_ID}> 💖 **<@${user.id}> ยอมรับเงื่อนไขเรียบร้อยแล้วค่ะ!** ทีมงานเข้ามาดูแลได้เลยนะคะ`,
        });

        clearAutoDeleteTimer(channel.id);

        if (supabase) {
          await supabase
            .from("heal_jai_tickets")
            .update({ status: "accepted", updated_at: new Date().toISOString() })
            .eq("channel_id", channel.id);
        }
      } catch (err) {
        console.error("[HealJai] Error in accept terms:", err);
      }
      return;
    }

    // ── 2.3 กดปุ่ม "︲กดเพื่อสั่งเมนู" (Open Menu / Ticket) ───────────
    if (customId === CUSTOM_IDS.OPEN_MENU) {
      // ⚡ Defer ทันทีภายใน 3 วินาที เพื่อป้องกัน Discord 10062 Unknown Interaction
      await interaction.deferReply({ flags: FLAG_EPHEMERAL }).catch(() => {});

      if (isMaintenanceMode) {
        return interaction.editReply({
          content: "### ☕︲แจ้งปิดปรับปรุงระบบชั่วคราว\n> ขออภัยในความไม่สะดวกค่ะ ขณะนี้ระบบ **Bear Cafe ฮีลใจ** อยู่ระหว่างการปิดปรับปรุงระบบ/งดรับเคสชั่วคราว 🍵\n> -# ทีมงานกำลังเตรียมความพร้อมเพื่อการบริการที่ดียิ่งขึ้น กรุณากลับมาใหม่อีกครั้งในภายหลังนะคะ",
          components: []
        });
      }

      try {
        if (supabase) {
          // ตรวจสอบห้อง Ticket ที่ยัง pending อยู่
          const { data: existingTickets, error: queryErr } = await supabase
            .from("heal_jai_tickets")
            .select("*")
            .eq("guild_id", guild.id)
            .eq("user_id", user.id)
            .eq("status", "pending");

          if (!queryErr && existingTickets && existingTickets.length > 0) {
            for (const ticket of existingTickets) {
              const existingCh = await guild.channels.fetch(ticket.channel_id).catch(() => null);
              if (existingCh) {
                return interaction.editReply({
                  content: null,
                  flags: FLAG_V2,
                  components: [
                    {
                      type: 17,
                      components: [
                        {
                          type: 10,
                          content: "## ☕︲__` คุณมีห้องสำหรับเลือกเมนูอยู่แล้ว! `__\n> คลิกที่ปุ่มหรือลิงก์ด้านล่างเพื่อไปยังห้องเดิมของคุณได้เลย:"
                        },
                        {
                          type: 14,
                          spacing: 2
                        },
                        {
                          type: 1,
                          components: [
                            {
                              type: 2,
                              style: 5,
                              url: `https://discord.com/channels/${guild.id}/${existingCh.id}`,
                              label: "︲คลิกเพื่อไปยังห้องเดิม",
                              emoji: {
                                id: "1536694010780065863",
                                name: "cupofmatcha",
                                animated: false
                              }
                            }
                          ]
                        }
                      ]
                    }
                  ]
                });
              } else {
                await supabase
                  .from("heal_jai_tickets")
                  .update({ status: "expired", updated_at: new Date().toISOString() })
                  .eq("id", ticket.id);
              }
            }
          }

          // ตรวจสอบว่ามี Order/Session ที่กำลังดำเนินการอยู่หรือไม่
          const { data: activeOrders } = await supabase
            .from("heal_jai_orders_sessions")
            .select("*")
            .eq("guild_id", guild.id)
            .eq("customer_id", user.id)
            .in("session_status", ["DISPATCHING", "WAITING_FOR_PROVIDER", "IN_PROGRESS"])
            .order("created_at", { ascending: false })
            .limit(1);

          if (activeOrders && activeOrders.length > 0) {
            const activeOrder = activeOrders[0];
            const activeChId = activeOrder.session_channel_id || activeOrder.ticket_channel_id;
            const activeCh = activeChId ? (guild.channels.cache.get(activeChId) || await guild.channels.fetch(activeChId).catch(() => null)) : null;

            if (activeCh) {
              return interaction.editReply({
                content: null,
                flags: FLAG_V2,
                components: [
                  {
                    type: 17,
                    components: [
                      {
                        type: 10,
                        content: `## ☕︲__\` คุณมีเซสชันสนทนาที่กำลังดำเนินการอยู่แล้ว! \`__\n> 🍵 ออเดอร์ \`#${activeOrder.order_code}\` กำลังอยู่ในขั้นตอนให้บริการ โปรดทำรายการหรือพูดคุยในห้องเดิมให้เสร็จสิ้นก่อนนะคะ:`
                      },
                      {
                        type: 14,
                        spacing: 2
                      },
                      {
                        type: 1,
                        components: [
                          {
                            type: 2,
                            style: 5,
                            url: `https://discord.com/channels/${guild.id}/${activeCh.id}`,
                            label: "︲คลิกเพื่อไปยังห้องสนทนาเดิม",
                            emoji: {
                              id: "1536694010780065863",
                              name: "cupofmatcha",
                              animated: false
                            }
                          }
                        ]
                      }
                    ]
                  }
                ]
              });
            }
          }
        }

        const username = member?.displayName || user.username;
        const channelName = `☕︰${username}-เลือกเมนู`;
        const categoryId = interaction.channel.parentId;

        const overwrites = [
          {
            id: guild.roles.everyone.id,
            deny: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
            ],
          },
          {
            id: user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.ReadMessageHistory,
            ],
            deny: [
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.SendMessagesInThreads,
              PermissionFlagsBits.CreatePublicThreads,
              PermissionFlagsBits.CreatePrivateThreads,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.AddReactions,
            ],
          },
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
              PermissionFlagsBits.EmbedLinks,
              PermissionFlagsBits.AttachFiles,
            ],
          },
        ];

        if (STAFF_ROLE_ID && guild.roles.cache.has(STAFF_ROLE_ID)) {
          overwrites.push({
            id: STAFF_ROLE_ID,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
            ],
          });
        }

        const newChannel = await guild.channels.create({
          name: channelName,
          type: ChannelType.GuildText,
          parent: categoryId || undefined,
          permissionOverwrites: overwrites,
          reason: `HealJai ticket created by ${user.tag}`,
        });

        // 1. ส่งข้อความแท็กผู้กด 1 ครั้ง แยกจากการ์ด Component v2
        await newChannel.send({ content: `<@${user.id}>` }).catch(() => {});

        // 2. ส่งการ์ดเลือกบริการและเมนูเครื่องดื่ม (Step 1 Interactive Component v2)
        const userAvatarUrl = user.displayAvatarURL({ extension: "png", size: 512 });
        ticketSelections.set(newChannel.id, {
          step: 1,
          mode: null,
          drinkId: null,
          toppingId: null,
          counselorId: null,
          counselorName: null,
          userAvatarUrl
        });
        const menuPayload = buildInteractiveOrderPayload({
          step: 1,
          userAvatarUrl
        });
        const checkoutMsg = await newChannel.send(menuPayload);

        const orderCode = `HJ-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

        if (supabase) {
          const { error: ticketErr } = await supabase.from("heal_jai_tickets").insert({
            guild_id: guild.id,
            channel_id: newChannel.id,
            user_id: user.id,
            notice_message_id: checkoutMsg.id,
            status: "pending",
          });
          if (ticketErr) console.error("[HealJai] Error inserting ticket:", ticketErr);

          const { error: orderErr } = await supabase.from("heal_jai_orders_sessions").insert({
            order_code: orderCode,
            guild_id: guild.id,
            customer_id: user.id,
            package_tier: "S",
            package_name: "ยังไม่ได้เลือก",
            duration_minutes: 0,
            is_silent: false,
            is_specific_counselor: false,
            is_booster: member?.premiumSince ? true : false,
            total_price: 0.00,
            counselor_share: 0.00,
            platform_share: 0.00,
            payment_status: "PENDING",
            session_status: "WAITING",
            ticket_channel_id: newChannel.id,
          });
          if (orderErr) console.error("[HealJai] Error inserting order in open_menu:", orderErr);
        }

        // 3. ส่ง Log ประวัติการเปิดห้อง (Created) ไปยังห้อง 1549710698702184539
        sendOrderHistoryLog(guild, {
          status: "CREATED",
          orderCode,
          customerId: user.id,
          extraInfo: `สร้างห้อง Ticket เลือกเมนู: <#${newChannel.id}>`
        });

        scheduleAutoDelete(client, newChannel.id);

        await interaction.editReply({
          content: null,
          flags: FLAG_V2,
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: "## ☕︲__` ห้องสำหรับเลือกเมนูปรากฎ! `__\n> คลิกที่ปุ่มหรือลิงก์ด้านล่างเพื่อไปยังห้องของคุณได้เลย:"
                },
                {
                  type: 14,
                  spacing: 2
                },
                {
                  type: 1,
                  components: [
                    {
                      type: 2,
                      style: 5,
                      url: `https://discord.com/channels/${guild.id}/${newChannel.id}`,
                      label: "︲คลิกเพื่อสั่งเมนู",
                      emoji: {
                        id: "1536694010780065863",
                        name: "cupofmatcha",
                        animated: false
                      }
                    }
                  ]
                }
              ]
            }
          ]
        });
      } catch (err) {
        console.error("[HealJai] Error creating menu channel:", err);
        if (interaction.deferred || interaction.replied) {
          await interaction.editReply({
            content: `❌ เกิดข้อผิดพลาดในการสร้างห้องเลือกเมนู: \`${err.message}\``,
            components: []
          }).catch(() => {});
        }
      }
      return;
    }

    // ── 2.4.1 กดปุ่ม "ยืนยันคำสั่งซื้อ" (Pay Button ใน Interactive Menu) ───────
    if (customId === "heal_jai_btn_pay" || customId === CUSTOM_IDS.BTN_PAY) {
      const state = ticketSelections.get(channel.id) || { drinkId: "tea_39", mode: "chat" };
      const drinkKey = state.drinkId || state.selectedDrink || "tea_39";
      const drink = DRINK_OPTIONS[drinkKey] || DRINK_OPTIONS.tea_39;

      let toppingKey = state.toppingId || state.selectedTopping;
      let topping = (toppingKey && toppingKey !== "none") ? TOPPING_OPTIONS[toppingKey] : null;

      const isSpecific = toppingKey === "specific_39" || toppingKey === "specific_30";
      const isSilent = toppingKey === "silent_19" || toppingKey === "silent_15";

      const counselorId = state.counselorId || state.selectedCounselor;
      const counselorObj = counselorId ? MOCK_COUNSELORS[counselorId] : null;
      const counselorName = counselorObj ? counselorObj.name : (counselorId ? (counselorId.startsWith("counselor_") ? counselorId : `<@${counselorId}>`) : null);

      const toppingPrice = topping ? topping.price : 0;
      const totalPrice = drink.price + toppingPrice;
      const counselorShare = Number((totalPrice * 0.70).toFixed(2));
      const platformShare = Number((totalPrice * 0.30).toFixed(2));
      const isBooster = Boolean(member?.premiumSince);

      let orderCode = `HJ-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

      if (supabase) {
        const { data: existingOrder } = await supabase
          .from("heal_jai_orders_sessions")
          .select("id, order_code")
          .eq("ticket_channel_id", channel.id)
          .maybeSingle();

        if (existingOrder) {
          orderCode = existingOrder.order_code;
          const { error: updErr } = await supabase
            .from("heal_jai_orders_sessions")
            .update({
              package_tier: drink.tier || "S",
              package_name: drink.name,
              duration_minutes: drink.duration,
              service_mode: state.mode || "chat",
              is_silent: isSilent,
              is_specific_counselor: isSpecific,
              counselor_id: (counselorId && !counselorId.startsWith("counselor_")) ? counselorId : null,
              is_booster: isBooster,
              total_price: totalPrice,
              counselor_share: counselorShare,
              platform_share: platformShare,
              payment_status: "PENDING",
              session_status: "WAITING",
              updated_at: new Date().toISOString()
            })
            .eq("id", existingOrder.id);
          if (updErr) console.error("[HealJai] Error updating order on pay button:", updErr);
        } else {
          const { data: newOrder, error: insErr } = await supabase
            .from("heal_jai_orders_sessions")
            .insert({
              order_code: orderCode,
              guild_id: guild.id,
              customer_id: user.id,
              package_tier: drink.tier || "S",
              package_name: drink.name,
              duration_minutes: drink.duration,
              service_mode: state.mode || "chat",
              is_silent: isSilent,
              is_specific_counselor: isSpecific,
              counselor_id: (counselorId && !counselorId.startsWith("counselor_")) ? counselorId : null,
              is_booster: isBooster,
              total_price: totalPrice,
              counselor_share: counselorShare,
              platform_share: platformShare,
              payment_status: "PENDING",
              session_status: "WAITING",
              ticket_channel_id: channel.id,
            })
            .select("order_code")
            .maybeSingle();
          if (insErr) console.error("[HealJai] Error inserting order on pay button:", insErr);
          if (newOrder?.order_code) orderCode = newOrder.order_code;
        }
      }

      const scanToPayPayload = buildScanToPayPayload({
        packageName: drink.label,
        toppingName: topping ? topping.label : null,
        counselorName: counselorName,
        duration: drink.duration,
        totalPrice: totalPrice,
        isBooster: isBooster
      });

      await interaction.update(scanToPayPayload).catch((e) => {
        console.error("[HealJai] Failed to edit to scan-to-pay card:", e.message);
      });

      // ปลดล็อก Permission ให้ user สามารถพิมพ์และส่งข้อความ/แนบรูปสลิปในห้องนี้ได้
      if (channel && channel.permissionOverwrites) {
        await channel.permissionOverwrites.edit(user.id, {
          ViewChannel: true,
          ReadMessageHistory: true,
          SendMessages: true,
          AttachFiles: true,
          EmbedLinks: true,
          AddReactions: true,
        }).catch((e) => {
          console.error("[HealJai] Failed to unlock SendMessages for user on btn_pay:", e.message);
        });
      }

      // ส่งประวัติ AWAITING_PAYMENT ไปยังห้อง 1549710698702184539
      sendOrderHistoryLog(guild, {
        status: "AWAITING_PAYMENT",
        orderCode,
        customerId: user.id,
        packageName: drink.name,
        toppingName: topping ? topping.name : null,
        totalPrice,
        extraInfo: `ลูกค้ายืนยันเลือกเมนูเรียบร้อย${counselorName ? ` (ระบุผู้รับฟัง: ${counselorName})` : ""} เข้าสู่ขั้นตอนรอชำระเงินในห้อง <#${channel.id}>`
      });

      return;
    }

    // ── 2.4.2 กดปุ่ม "ยกเลิก" (Prompt ยืนยันยกเลิก) ────────────────────
    if (
      customId === CUSTOM_IDS.BTN_CANCEL_PROMPT ||
      customId === "heal_jai_btn_cancel_prompt" ||
      customId === CUSTOM_IDS.CANCEL_ORDER ||
      customId === "btn_cancel_order"
    ) {
      return interaction.reply({
        flags: FLAG_EPHEMERAL,
        content: "### ⚠️︲ยืนยันการยกเลิกออเดอร์\nคุณแน่ใจหรือไม่ว่าต้องการยกเลิกคำสั่งซื้อนี้และปิดห้องสนทนานี้?",
        components: [
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 4, // Danger
                label: "ยืนยันยกเลิก",
                emoji: { name: "⚠️" },
                custom_id: "heal_jai_confirm_cancel_ticket"
              },
              {
                type: 2,
                style: 2, // Secondary
                label: "ไม่ยกเลิก / ทำรายการต่อ",
                emoji: { name: "↩️" },
                custom_id: "heal_jai_abort_cancel_ticket"
              }
            ]
          }
        ]
      });
    }

    // ── 2.4.3 กดยกเลิกการปิดห้อง (Abort Cancel) ──────────────────────
    if (customId === "heal_jai_abort_cancel_ticket" || customId === CUSTOM_IDS.ABORT_CANCEL_TICKET) {
      return interaction.update({
        content: "↩️ ยกเลิกการปิดห้องแล้วค่ะ คุณสามารถดำเนินการต่อได้ตามปกติเลยนะคะ 🍵",
        components: []
      }).catch(() => {});
    }

    // ── 2.4.4 กดยืนยันปิดห้องและยกเลิกออเดอร์ (Confirm Cancel) ───────
    if (customId === "heal_jai_confirm_cancel_ticket" || customId === CUSTOM_IDS.CONFIRM_CANCEL_TICKET || customId === CUSTOM_IDS.CANCEL_TICKET) {
      try {
        await interaction.deferUpdate().catch(() => {});
        clearAutoDeleteTimer(channel.id);
        ticketSelections.delete(channel.id);

        let order = null;
        if (supabase) {
          const { data: ord } = await supabase
            .from("heal_jai_orders_sessions")
            .select("*")
            .eq("ticket_channel_id", channel.id)
            .maybeSingle();
          order = ord;

          await supabase
            .from("heal_jai_tickets")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("channel_id", channel.id);

          await supabase
            .from("heal_jai_orders_sessions")
            .update({
              payment_status: "CANCELLED",
              session_status: "CANCELLED",
              updated_at: new Date().toISOString()
            })
            .eq("ticket_channel_id", channel.id);
        }

        // ส่ง Log ประวัติการยกเลิก (Cancelled) ไปยังห้อง 1549710698702184539
        sendOrderHistoryLog(guild, {
          status: "CANCELLED",
          orderCode: order?.order_code || `HJ-${channel.id.slice(-6)}`,
          customerId: user.id,
          packageName: order?.package_name,
          totalPrice: order?.total_price,
          extraInfo: `ลูกค้ายืนยันการยกเลิกออเดอร์และปิดห้อง <#${channel.id}>`
        });

        await channel.delete("User confirmed cancellation of HealJai ticket").catch(() => {});
      } catch (err) {
        console.error("[HealJai] Error confirming ticket cancellation:", err);
      }
      return;
    }

    // ── 2.5 กดปุ่ม "ติดต่อทีมงาน" (btn_call_admin) ──────────────────────
    if (customId === CUSTOM_IDS.CALL_ADMIN || customId === "btn_call_admin") {
      try {
        await interaction.deferReply({ flags: FLAG_EPHEMERAL }).catch(() => {});

        await channel.send({
          content: `<@&${STAFF_ROLE_ID}> 🚨 **<@${user.id}> ได้กดปุ่มติดต่อทีมงานค่ะ!** รบกวนแอดมินเข้ามาช่วยเหลือลูกค้าในห้องนี้ด้วยนะคะ 🍵`
        }).catch(() => {});

        return interaction.editReply({
          content: "🚨 แจ้งเตือนทีมงานเรียบร้อยแล้วค่ะ กรุณารอสักครู่นะคะ แอดมินจะเข้ามาดูแลในห้องนี้โดยเร็วที่สุดค่ะ 🍵"
        });
      } catch (err) {
        console.error("[HealJai] Error in call admin button:", err);
      }
      return;
    }

    // ── 2.6 กดปุ่ม "ส่งหลักฐานชำระเงินแล้ว" (Legacy Paid Confirm) ─────
    if (customId === CUSTOM_IDS.PAID_CONFIRM) {
      try {
        await channel.send({
          content: `<@&${STAFF_ROLE_ID}> 🔔 **<@${user.id}> ได้แจ้งโอนเงินแล้วค่ะ!** (แนะนำให้ใช้คำสั่ง \`/ยืนยันการโอน\` เพื่อตรวจสลิปอัตโนมัติ)`
        });
        clearAutoDeleteTimer(channel.id);

        return interaction.reply({
          content: `## <:50121checkmark:1358584609087946867>︲แจ้งทีมงานเรียบร้อยแล้วค่ะ\n> 💡 คุณสามารถใช้คำสั่ง **\`/ยืนยันการโอน\`** พร้อมแนบรูปสลิปในห้องนี้ เพื่อให้ระบบเริ่มค้นหาผู้รับฟังได้ทันทีโดยไม่ต้องรอแอดมินนะคะ 🍵`,
          flags: FLAG_EPHEMERAL
        });
      } catch (err) {
        console.error("[HealJai] Error in paid confirm:", err);
      }
      return;
    }

    // ── 2.7 กดปุ่ม "กดรับเคสนี้" (Claim Case จากห้อง Dispatch) ────────
    if (customId.startsWith("heal_jai_claim_case")) {
      await interaction.deferReply({ flags: FLAG_EPHEMERAL }).catch(() => {});

      const isCounselor = member?.roles?.cache?.has(COUNSELOR_ROLE_ID) ||
                          member?.roles?.cache?.has(STAFF_ROLE_ID) ||
                          (process.env.OWNER_ID && user.id === process.env.OWNER_ID);

      if (!isCounselor) {
        return interaction.editReply({
          content: "❌ ขออภัยค่ะ เฉพาะผู้ให้คำปรึกษาหรือทีมงานเท่านั้นที่สามารถกดรับเคสได้นะคะ"
        });
      }

      const targetIdentifier = customId.replace("heal_jai_claim_case_", "").trim();
      let order = null;

      if (supabase) {
        if (targetIdentifier && targetIdentifier !== "general") {
          const query = supabase.from("heal_jai_orders_sessions").select("*");
          if (!isNaN(targetIdentifier)) {
            query.or(`id.eq.${targetIdentifier},order_code.eq.${targetIdentifier}`);
          } else {
            query.eq("order_code", targetIdentifier);
          }
          const { data } = await query.maybeSingle();
          order = data;
        }

        // Fallback: หากไม่พบ order จาก code (เช่น เคส open dispatch หรือ id สลับ) ให้ดึงเคสล่าสุดที่กำลัง DISPATCHING
        if (!order) {
          const { data: latestOpenOrder } = await supabase
            .from("heal_jai_orders_sessions")
            .select("*")
            .eq("session_status", "DISPATCHING")
            .is("counselor_id", null)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          order = latestOpenOrder;
        }
      }

      if (!order) {
        return interaction.editReply({
          content: "❌ ไม่พบข้อมูลออเดอร์นี้ในระบบ หรือเคสอาจถูกยกเลิกแล้วค่ะ"
        });
      }

      if (order.counselor_id && order.counselor_id !== user.id) {
        return interaction.editReply({
          content: `⚠️ เคสนี้มีผู้รับงานแล้วโดย <@${order.counselor_id}> ค่ะ`
        });
      }

      const ticketState = order.ticket_channel_id ? ticketSelections.get(order.ticket_channel_id) : null;
      const serviceMode = order.service_mode || ticketState?.mode || "chat";

      // ตรวจสอบเงื่อนไขว่าผู้รับฟังออนไลน์, รองรับโหมดบริการ (chat / voice), และรองรับนั่งเงียบหรือไม่
      if (supabase) {
        const { data: counselorRecord } = await supabase
          .from("heal_jai_counselors")
          .select("status, service_modes, is_silent_companion")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!counselorRecord || counselorRecord.status !== "ONLINE") {
          return interaction.editReply({
            content: "❌ ขออภัยค่ะ เฉพาะผู้ให้คำปรึกษาที่มีสถานะ **🟢 ออนไลน์ (ONLINE)** ในระบบเท่านั้นที่สามารถกดรับเคสได้ค่ะ (กรุณากดเปิดกะ/ออนไลน์ก่อนนะคะ 🍵)"
          });
        }

        const counselorModes = Array.isArray(counselorRecord?.service_modes) && counselorRecord.service_modes.length > 0
          ? counselorRecord.service_modes
          : ["chat", "voice"];

        if (!counselorModes.includes(serviceMode)) {
          const modeLabel = serviceMode === "voice" ? "🎙️ คอลเสียง" : "💬 พิมพ์คุย";
          return interaction.editReply({
            content: `❌ ขออภัยค่ะ บัตรพนักงานของคุณไม่ได้เปิดรับบริการประเภท **${modeLabel}** จึงไม่สามารถกดรับเคสนี้ได้ค่ะ (ติดต่อแอดมินเพื่อปรับแก้ข้อมูลบริการนะคะ 🍵)`
          });
        }

        if (order.is_silent && !counselorRecord.is_silent_companion) {
          return interaction.editReply({
            content: "❌ ขออภัยค่ะ เคสนี้ลูกค้าเลือกท็อปปิ้ง **🌿 นั่งเงียบเป็นเพื่อน** แต่บัตรพนักงานของคุณไม่ได้เปิดรับบริการนี้ค่ะ"
          });
        }
      }

      // เคลียร์ dispatch timer
      if (dispatchTimers.has(order.id)) {
        clearTimeout(dispatchTimers.get(order.id));
        dispatchTimers.delete(order.id);
      }

      // สร้าง Session Room (Text / Voice) ใน Category 1545237654612869201
      let textChannel = null;
      let voiceChannel = null;

      try {
        const roomResult = await createSessionRoom(guild, {
          ...order,
          customer_id: order.customer_id,
          counselor_id: user.id,
          service_mode: serviceMode,
          order_code: order.order_code
        });
        textChannel = roomResult.textChannel;
        voiceChannel = roomResult.voiceChannel;
      } catch (roomErr) {
        console.error("[HealJai] Error creating session room:", roomErr);
      }

      const targetSessionChannel = (serviceMode === "voice" && voiceChannel) ? voiceChannel : textChannel;
      const sessionChannelId = targetSessionChannel?.id || order.ticket_channel_id;

      if (supabase) {
        await supabase.from("heal_jai_orders_sessions").update({
          counselor_id: user.id,
          service_mode: serviceMode,
          session_status: "WAITING_FOR_PROVIDER",
          session_channel_id: sessionChannelId,
          session_voice_id: voiceChannel?.id || null,
          claimed_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }).eq("id", order.id);

        // อัปเดตสถานะผู้ให้คำปรึกษาเป็น BUSY (🟡 กำลังให้บริการ)
        await supabase.from("heal_jai_counselors").update({
          status: "BUSY",
          updated_at: new Date().toISOString()
        }).eq("user_id", user.id);

        await updateOnlineCounselorsCount(guild);
        await updateCounselorCardMessage(guild, user.id);
      }

      // ส่ง Log ประวัติ CLAIMED ไปยังห้อง 1549710698702184539
      sendOrderHistoryLog(guild, {
        status: "CLAIMED",
        orderCode: order.order_code,
        customerId: order.customer_id,
        counselorId: user.id,
        packageName: order.package_name,
        totalPrice: order.total_price,
        extraInfo: `ผู้ให้คำปรึกษา <@${user.id}> กดรับเคสเรียบร้อย เปิดห้องสนทนา <#${sessionChannelId}>`
      });

      // ส่ง Session Dashboard ในห้อง Session ใหม่ (Voice Text หรือ Text Channel)
      if (targetSessionChannel) {
        await targetSessionChannel.send({
          content: `🔔 <@${order.customer_id}> <@${user.id}> ยินดีต้อนรับสู่ห้องสนทนาส่วนตัวค่ะ 🍵`
        }).catch(() => {});

        await targetSessionChannel.send(buildSessionDashboardPayload({
          customerId: order.customer_id,
          counselorId: user.id,
          totalMinutes: order.duration_minutes || 30,
          isBooster: order.is_booster,
          packageName: order.package_name,
          serviceMode,
          voiceChannelId: voiceChannel?.id
        })).catch(() => {});
      }

      // แจ้งลูกค้าในห้อง Ticket เดิม (ลบข้อความเดิมและส่งการ์ดพร้อมให้บริการ)
      if (order.ticket_channel_id) {
        const ticketCh = guild.channels.cache.get(order.ticket_channel_id) ||
                         await guild.channels.fetch(order.ticket_channel_id).catch(() => null);
        if (ticketCh) {
          try {
            const fetchedTicketMsgs = await ticketCh.messages.fetch({ limit: 10 }).catch(() => null);
            if (fetchedTicketMsgs) {
              for (const m of fetchedTicketMsgs.values()) {
                if (m.author.id === client.user.id && !m.pinned) {
                  await m.delete().catch(() => {});
                }
              }
            }
          } catch (delErr) {
            console.warn("[HealJai] Failed to delete previous ticket messages:", delErr.message);
          }

          const serviceIcon = serviceMode === "voice" ? "☎️" : "💌";
          await ticketCh.send({
            flags: FLAG_V2,
            components: [
              {
                type: 17,
                components: [
                  {
                    type: 10,
                    content: `## <a:511398spin:1536700803732209736>︲__\` พร้อมให้บริการแล้วค่ะ! \`__\n\n> <@${order.customer_id}> ผู้รับฟัง <@${user.id}> พร้อมให้บริการแล้วค่ะ!`
                  },
                  {
                    type: 14,
                    spacing: 2
                  },
                  {
                    type: 1,
                    components: [
                      {
                        type: 2,
                        style: 5,
                        url: `https://discord.com/channels/${guild.id}/${sessionChannelId}`,
                        label: "︲คลิกเพื่อเริ่มใช้งาน",
                        emoji: {
                          name: serviceIcon
                        }
                      }
                    ]
                  }
                ]
              }
            ]
          }).catch(() => {});
        }
      }

      // เริ่ม 3-minute Provider Ready Timeout
      scheduleProviderReadyTimeout(client, guild, order.id, sessionChannelId);

      // อัปเดตการ์ดในห้อง Dispatch ให้รู้ว่ามีคนรับแล้ว
      if (interaction.message && interaction.message.editable) {
        await interaction.message.edit({
          content: `<@&${COUNSELOR_ROLE_ID}> ✅ **<@${user.id}> กดรับเคส #${order.order_code} เรียบร้อยแล้วค่ะ!** 🍵`,
          components: []
        }).catch(() => {});
      }

      return interaction.editReply({
        content: `🎉 คุณได้รับเคสออเดอร์ \`#${order.order_code}\` เรียบร้อยแล้วค่ะ! สามารถเข้าไปดูแลลูกค้าได้ที่ห้อง <#${sessionChannelId}> ได้เลยนะคะ 🍵`
      });
    }

    // ── 2.8 กดปุ่ม "สละสิทธิ์ / ส่งต่อ" (Pass Case จากห้อง Dispatch) ──
    if (customId.startsWith("heal_jai_pass_case")) {
      await interaction.deferReply({ flags: FLAG_EPHEMERAL }).catch(() => {});

      const isCounselor = member?.roles?.cache?.has(COUNSELOR_ROLE_ID) ||
                          member?.roles?.cache?.has(STAFF_ROLE_ID) ||
                          (process.env.OWNER_ID && user.id === process.env.OWNER_ID);

      if (!isCounselor) {
        return interaction.editReply({
          content: "❌ ขออภัยค่ะ เฉพาะผู้ให้คำปรึกษาหรือทีมงานเท่านั้นที่สามารถกดปุ่มนี้ได้นะคะ"
        });
      }

      const targetIdentifier = customId.replace("heal_jai_pass_case_", "").trim();
      let order = null;

      if (supabase && targetIdentifier && targetIdentifier !== "general") {
        const query = supabase.from("heal_jai_orders_sessions").select("*");
        if (!isNaN(targetIdentifier)) {
          query.or(`id.eq.${targetIdentifier},order_code.eq.${targetIdentifier}`);
        } else {
          query.eq("order_code", targetIdentifier);
        }
        const { data } = await query.maybeSingle();
        order = data;
      }

      if (order && supabase) {
        // เคลียร์ counselor_id และปรับเป็น DISPATCHING
        await supabase.from("heal_jai_orders_sessions").update({
          counselor_id: null,
          is_specific_counselor: false,
          session_status: "DISPATCHING",
          updated_at: new Date().toISOString()
        }).eq("id", order.id);

        sendOrderHistoryLog(guild, {
          status: "DISPATCH_PASS",
          orderCode: order.order_code,
          customerId: order.customer_id,
          extraInfo: `↩️ ผู้รับฟัง <@${user.id}> กดสละสิทธิ์เคส ระบบลบการ์ดเดิมและส่งต่อเคสเป็น Open Dispatch แท็ก Role <@&${COUNSELOR_ROLE_ID}>`
        });

        // ลบข้อความการ์ดแจ้งเตือนเดิมทิ้ง
        if (interaction.message) {
          await interaction.message.delete().catch(() => {});
        }

        // ส่งการ์ด Open Dispatch ใบใหม่พร้อมแท็ก Role
        const newExpireTimestamp = Math.floor((Date.now() + 3 * 60 * 1000) / 1000);
        const newDispatchPayload = buildDispatchAlertPayload({
          counselorId: null,
          customerId: order.customer_id,
          serviceMode: order.service_mode || "chat",
          orderId: order.id,
          orderCode: order.order_code,
          packageName: order.package_name || "ชาเขียวเย็นใจ",
          duration: order.duration_minutes || 15,
          isSilent: order.is_silent || false,
          isSpecific: false,
          toppingName: order.is_silent ? "นั่งเงียบเป็นเพื่อน (+19 บาท)" : null,
          isBooster: order.is_booster || false,
          totalMinutes: order.duration_minutes || 15,
          totalPrice: order.total_price || 39,
          expireTimestamp: newExpireTimestamp
        });

        const dispatchChannel = guild.channels.cache.get(DISPATCH_CHANNEL_ID) ||
                                await guild.channels.fetch(DISPATCH_CHANNEL_ID).catch(() => null);
        if (dispatchChannel) {
          if (newDispatchPayload.pingMention) {
            await dispatchChannel.send({ content: newDispatchPayload.pingMention }).catch(() => {});
          }
          const newMsg = await dispatchChannel.send(newDispatchPayload).catch(() => null);
          if (newMsg) {
            scheduleDispatchTimeout(client, guild, order.id, newMsg.id, newExpireTimestamp);
          }
        }
      }

      const orderMode = order?.service_mode || "chat";
      const modeLabel = orderMode === "voice" ? "🎙️ คอลเสียง" : "💬 พิมพ์คุย";

      return interaction.editReply({
        content: `↩️ คุณได้สละสิทธิ์เคสนี้แล้ว ระบบได้ลบการ์ดเดิมและเปิดเคสให้ผู้ให้คำปรึกษาท่านอื่นที่รองรับโหมด ${modeLabel} กดรับแทนแล้วค่ะ ขอบคุณที่แจ้งนะคะ 🍵`
      });
    }

    // ── 2.9 กดปุ่ม "เริ่มเซสชัน" (Session Dashboard) ─────────────────
    if (customId === CUSTOM_IDS.START_SESSION || customId === "heal_jai_start_session") {
      const isCounselor = member?.roles?.cache?.has(COUNSELOR_ROLE_ID) ||
                          member?.roles?.cache?.has(STAFF_ROLE_ID) ||
                          (process.env.OWNER_ID && user.id === process.env.OWNER_ID);

      if (!isCounselor) {
        return interaction.reply({
          content: "❌ ขออภัยค่ะ เฉพาะผู้ให้คำปรึกษาประจำเคสนี้เท่านั้นที่สามารถกดเริ่มเซสชันได้นะคะ 🍵",
          flags: FLAG_EPHEMERAL
        });
      }

      let order = null;
      if (supabase) {
        // 1. ค้นหาจาก ID ของห้อง (Text session room, Voice room หรือ Ticket room)
        const { data: ord } = await supabase
          .from("heal_jai_orders_sessions")
          .select("*")
          .or(`session_channel_id.eq.${channel.id},session_voice_id.eq.${channel.id},ticket_channel_id.eq.${channel.id}`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        order = ord;

        // 2. Fallback: หากไม่พบจาก channel ID (เช่น กดปุ่มทดสอบในห้องแอดมิน/ห้องเทสต์) ให้ค้นหาจากเคส active ของผู้รับฟัง/ลูกค้า
        if (!order) {
          const { data: activeOrd } = await supabase
            .from("heal_jai_orders_sessions")
            .select("*")
            .or(`counselor_id.eq.${user.id},customer_id.eq.${user.id}`)
            .in("session_status", ["WAITING_FOR_PROVIDER", "IN_PROGRESS", "DISPATCHING"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          order = activeOrd;
        }
      }

      if (!order) {
        return interaction.reply({
          content: "❌ ไม่พบข้อมูลเซสชันสำหรับห้องนี้ค่ะ (หากเป็นห้องทดสอบ กรุณาลองผ่านขั้นตอนเปิด Ticket สั่งเมนู หรือตรวจสอบว่ามีเคสที่กำลังดำเนินการอยู่ค่ะ)",
          flags: FLAG_EPHEMERAL
        });
      }

      if (order.counselor_id && order.counselor_id !== user.id && !member?.roles?.cache?.has(STAFF_ROLE_ID) && user.id !== process.env.OWNER_ID) {
        return interaction.reply({
          content: `⚠️ เฉพาะผู้รับฟังประจำเคส (<@${order.counselor_id}>) หรือแอดมินเท่านั้นที่สามารถกดเริ่มเซสชันได้ค่ะ`,
          flags: FLAG_EPHEMERAL
        });
      }

      if (order.session_status === "IN_PROGRESS") {
        return interaction.reply({
          content: "⏱️ เซสชันนี้ได้เริ่มต้นไปแล้วและกำลังจับเวลาอยู่ค่ะ 🍵",
          flags: FLAG_EPHEMERAL
        });
      }

      if (order.session_status === "COMPLETED" || order.session_status === "CANCELLED") {
        return interaction.reply({
          content: "⚠️ เซสชันนี้สิ้นสุดลงแล้วค่ะ",
          flags: FLAG_EPHEMERAL
        });
      }

      await interaction.deferUpdate().catch(() => {});

      // เรียกใช้ฟังก์ชันกลาง เริ่มต้นเซสชันและคิด Late-Start Deduction
      await startSessionInternal(client, guild, order, {
        isAutoStart: false,
        triggerBy: "button",
        channel
      });
      return;
    }

    // ── 2.10 กดปุ่ม "จบบริการ (ก่อนเวลา)" (Session Dashboard) ───────────
    if (customId === CUSTOM_IDS.END_SESSION || customId === "heal_jai_end_session") {
      const isCounselor = member?.roles?.cache?.has(COUNSELOR_ROLE_ID) ||
                          member?.roles?.cache?.has(STAFF_ROLE_ID) ||
                          (process.env.OWNER_ID && user.id === process.env.OWNER_ID);

      if (!isCounselor) {
        return interaction.reply({
          content: "❌ ขออภัยค่ะ เฉพาะผู้ให้คำปรึกษาประจำเคสนี้เท่านั้นที่สามารถกดจบบริการได้นะคะ 🍵",
          flags: FLAG_EPHEMERAL
        }).catch(() => {});
      }

      await interaction.deferReply({ flags: FLAG_EPHEMERAL }).catch(() => {});

      let order = null;
      if (supabase) {
        const { data: ord } = await supabase
          .from("heal_jai_orders_sessions")
          .select("*")
          .or(`session_channel_id.eq.${channel.id},session_voice_id.eq.${channel.id},ticket_channel_id.eq.${channel.id}`)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        order = ord;

        if (!order) {
          const { data: activeOrd } = await supabase
            .from("heal_jai_orders_sessions")
            .select("*")
            .or(`counselor_id.eq.${user.id},customer_id.eq.${user.id}`)
            .in("session_status", ["WAITING_FOR_PROVIDER", "IN_PROGRESS", "DISPATCHING"])
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          order = activeOrd;
        }
      }

      if (!order) {
        return interaction.editReply({
          content: "❌ ไม่พบข้อมูลเซสชันสำหรับห้องนี้ค่ะ"
        });
      }

      if (order.counselor_id && order.counselor_id !== user.id && !member?.roles?.cache?.has(STAFF_ROLE_ID) && user.id !== process.env.OWNER_ID) {
        return interaction.editReply({
          content: `⚠️ เฉพาะผู้รับฟังประจำเคส (<@${order.counselor_id}>) หรือแอดมินเท่านั้นที่สามารถกดจบบริการได้ค่ะ`
        });
      }

      if (order.session_status === "COMPLETED" || order.session_status === "CANCELLED") {
        return interaction.editReply({
          content: "⚠️ เซสชันนี้สิ้นสุดลงแล้วค่ะ"
        });
      }

      // แสดงปุ่มยืนยันการจบบริการก่อนเวลาอีกครั้ง
      const confirmRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`heal_jai_confirm_end_${order.id}`)
          .setLabel("︲ยืนยันจบบริการ")
          .setEmoji("🔴")
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId("heal_jai_cancel_end_session")
          .setLabel("︲ยกเลิก")
          .setEmoji("⚪")
          .setStyle(ButtonStyle.Secondary)
      );

      return interaction.editReply({
        content: `### ⚠️︲ยืนยันการจบบริการ (ก่อนเวลา)\n> คุณต้องการสิ้นสุดเซสชันนี้ก่อนเวลาที่กำหนดใช่หรือไม่?\n> *เมื่อกดยืนยัน ระบบจะล็อกห้องสนทนา บันทึกสถิติ และส่งการ์ดให้คะแนนบริการแก่ลูกค้าทันทีค่ะ*`,
        components: [confirmRow]
      });
    }

    // ยืนยันการจบบริการก่อนเวลา
    if (customId.startsWith("heal_jai_confirm_end_")) {
      const orderId = customId.replace("heal_jai_confirm_end_", "");
      await interaction.deferUpdate().catch(() => {});

      let order = null;
      if (supabase) {
        const { data: ord } = await supabase
          .from("heal_jai_orders_sessions")
          .select("*")
          .eq("id", orderId)
          .maybeSingle();
        order = ord;
      }

      if (!order) {
        return interaction.editReply({
          content: "❌ ไม่พบข้อมูลเซสชันสำหรับเคสนี้ค่ะ",
          components: []
        });
      }

      if (order.counselor_id && order.counselor_id !== user.id && !member?.roles?.cache?.has(STAFF_ROLE_ID) && user.id !== process.env.OWNER_ID) {
        return interaction.editReply({
          content: `⚠️ เฉพาะผู้รับฟังประจำเคส (<@${order.counselor_id}>) หรือแอดมินเท่านั้นที่สามารถกดยืนยันจบบริการได้ค่ะ`,
          components: []
        });
      }

      if (order.session_status === "COMPLETED" || order.session_status === "CANCELLED") {
        return interaction.editReply({
          content: "⚠️ เซสชันนี้สิ้นสุดลงแล้วค่ะ",
          components: []
        });
      }

      // Early End (จบบริการก่อนเวลา): mark ended_early = true (เป็น data point สำหรับ audit log)
      await handleSessionExpiry(client, guild, order.id, { isEarly: true });

      return interaction.editReply({
        content: "✅ บันทึกการจบบริการเรียบร้อยแล้วค่ะ ระบบได้ส่งแบบประเมินความพึงพอใจให้ลูกค้าแล้ว ขอบคุณสำหรับการปฏิบัติหน้าที่นะคะ 🍵",
        components: []
      });
    }

    // ยกเลิกการจบบริการก่อนเวลา
    if (customId === "heal_jai_cancel_end_session") {
      return interaction.update({
        content: "ยกเลิกการจบบริการแล้วค่ะ เซสชันยังคงดำเนินต่อไปตามปกติ 🍵",
        components: []
      }).catch(() => {});
    }

    // ── 2.6 ระบบตอกบัตรเข้ากะ (Shift Panel Handlers) ─────────────────
    if ([CUSTOM_IDS.SHIFT_ONLINE, CUSTOM_IDS.SHIFT_BREAK, CUSTOM_IDS.SHIFT_OFFLINE, CUSTOM_IDS.COUNSELOR_WALLET, CUSTOM_IDS.COUNSELOR_EDIT_PROFILE, CUSTOM_IDS.COUNSELOR_SPECIALTIES, "heal_jai_counselor_specialties"].includes(customId)) {
      const isCounselor = member?.roles?.cache?.has(COUNSELOR_ROLE_ID) ||
                          member?.roles?.cache?.has(STAFF_ROLE_ID) ||
                          (process.env.OWNER_ID && user.id === process.env.OWNER_ID);

      if (!isCounselor) {
        return interaction.reply({
          content: `## ⚠️︲แผงตอกบัตรนี้สำหรับทีมผู้ให้คำปรึกษาเท่านั้นค่ะ`,
          flags: FLAG_EPHEMERAL
        }).catch(() => {});
      }

      // แก้ไขข้อมูลส่วนตัว / ความถนัด (ปิดการแก้ไขด้วยตนเอง)
      if (
        customId === CUSTOM_IDS.COUNSELOR_EDIT_PROFILE ||
        customId === CUSTOM_IDS.COUNSELOR_SPECIALTIES ||
        customId === "heal_jai_counselor_specialties" ||
        customId === "heal_jai_counselor_edit_profile"
      ) {
        return interaction.reply({
          content: "❌ **ไม่อนุญาตให้แก้ไขข้อมูลด้วยตนเองค่ะ**\n> 🍵 ข้อมูลชื่อ, ความถนัด และรูปแบบบริการได้รับการดูแลโดยทีมงานแอดมิน กรุณาติดต่อแอดมินเพื่อขอปรับปรุงข้อมูลบนบัตรพนักงานนะคะ",
          flags: FLAG_EPHEMERAL
        });
      }

      // เช็กยอดสะสม & ประวัติการให้บริการ (Wallet & Service History)
      if (
        customId === CUSTOM_IDS.COUNSELOR_WALLET ||
        customId === "heal_jai_counselor_wallet" ||
        (customId && customId.startsWith("heal_jai_wallet_")) ||
        customId === "p_352948807912132609" ||
        customId === "p_352948958059827204" ||
        customId === "p_352948876690329602" ||
        customId === "p_352948916817235971"
      ) {
        let page = 1;
        let targetUserId = user.id;

        const isPaginationAction = (customId && customId.startsWith("heal_jai_wallet_") && customId !== "heal_jai_counselor_wallet") ||
                                   ["p_352948807912132609", "p_352948958059827204", "p_352948876690329602", "p_352948916817235971"].includes(customId);

        if (isPaginationAction) {
          if (customId && customId.startsWith("heal_jai_wallet_")) {
            const parts = customId.split(":");
            page = parseInt(parts[1], 10) || 1;
            if (parts[2]) targetUserId = parts[2];
          } else if (customId === "p_352948876690329602") {
            page = 2;
          } else if (customId === "p_352948916817235971") {
            page = 999;
          }
          await interaction.deferUpdate().catch(() => {});
        } else {
          await interaction.deferReply({ flags: FLAG_EPHEMERAL }).catch(() => {});
        }

        const pageSize = 3;
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;

        let counselorData = null;
        let orders = [];
        let totalCount = 0;

        if (supabase) {
          const { data: cData } = await supabase
            .from("heal_jai_counselors")
            .select("*")
            .eq("user_id", targetUserId)
            .maybeSingle();
          counselorData = cData;

          const { data: orderData, count } = await supabase
            .from("heal_jai_orders_sessions")
            .select("*", { count: "exact" })
            .eq("counselor_id", targetUserId)
            .order("created_at", { ascending: false })
            .range(from, to);

          orders = orderData || [];
          totalCount = count || 0;
        }

        const targetMember = await guild.members.fetch(targetUserId).catch(() => null);
        const avatarUrl = targetMember?.displayAvatarURL?.({ extension: "png", size: 512 }) || user.displayAvatarURL({ extension: "png", size: 512 });

        const payload = buildCounselorWalletHistoryPayload({
          counselor: counselorData || {},
          orders,
          totalCount,
          page,
          pageSize,
          userAvatarUrl: avatarUrl,
          userId: targetUserId
        });

        return interaction.editReply(payload).catch((e) => {
          console.error("[HealJai] Error sending counselor wallet payload:", e.message);
        });
      }

      // สลับสถานะกะ
      await interaction.deferReply({ flags: FLAG_EPHEMERAL }).catch(() => {});

      let targetStatus = "BREAK";
      let statusLabel = "⚪ พักรับงาน";
      let statusDesc = "เปลี่ยนสถานะเป็นพักรับงานชั่วคราว ระบบจะไม่ส่งเคสใหม่ให้จนกว่าคุณจะกดพร้อมรับงานอีกครั้งค่ะ 🍵";

      if (customId === CUSTOM_IDS.SHIFT_ONLINE) {
        targetStatus = "ONLINE";
        statusLabel = "🟢 พร้อมรับงาน";
        statusDesc = "ตอกบัตรเข้ากะสำเร็จ! ระบบจะเริ่มส่งเคสลูกค้าให้คุณเมื่อมีออเดอร์ใหม่เข้ามาค่ะ 🍵";
      } else if (customId === CUSTOM_IDS.SHIFT_BREAK || customId === CUSTOM_IDS.SHIFT_OFFLINE) {
        targetStatus = "BREAK";
        statusLabel = "⚪ พักรับงาน";
        statusDesc = "เปลี่ยนสถานะเป็นพักรับงานชั่วคราว ระบบจะไม่ส่งเคสใหม่ให้จนกว่าคุณจะกดพร้อมรับงานอีกครั้งค่ะ 🍵";
      }

      if (supabase) {
        try {
          const { error: counselorErr } = await supabase.from("heal_jai_counselors").upsert({
            guild_id: guild.id,
            user_id: user.id,
            display_name: member?.displayName || user.username,
            status: targetStatus,
            last_shift_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          }, { onConflict: "user_id" });
          if (counselorErr) {
            console.error("[HealJai] Counselor status upsert error:", counselorErr.message);
          }
        } catch (e) {
          console.error("[HealJai] Counselor status upsert error:", e.message);
        }
      }

      await updateOnlineCounselorsCount(guild);
      await updateCounselorCardMessage(guild, user.id);

      return interaction.editReply({
        flags: FLAG_V2,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `### ${statusLabel}\n${statusDesc}`
              }
            ]
          }
        ]
      });
    }

    // ── 2.7 ระบบประเมินและให้คะแนนดาว & Modal Handlers ────────────
    if (interaction.isModalSubmit()) {
      // จัดการ Modal แก้ไขข้อมูลส่วนตัวของผู้รับฟัง
      if (customId === CUSTOM_IDS.MODAL_EDIT_PROFILE || customId === "heal_jai_modal_edit_profile") {
        await interaction.deferReply({ flags: FLAG_EPHEMERAL });

        const bio = (interaction.fields.getTextInputValue("profile_bio") || "").trim();
        const imageUrl = (interaction.fields.getTextInputValue("profile_image_url") || "").trim();

        if (supabase) {
          try {
            await supabase.from("heal_jai_counselors").upsert({
              guild_id: guild.id,
              user_id: user.id,
              display_name: member?.displayName || user.username,
              bio: bio || "ยินดีต้อนรับสู่พื้นที่พักใจ พร้อมรับฟังและอยู่เคียงข้างคุณเสมอค่ะ 🍵",
              image_url: imageUrl || null,
              updated_at: new Date().toISOString()
            }, { onConflict: "user_id" });
          } catch (e) {
            console.error("[HealJai] Failed to save counselor profile:", e.message);
          }
        }

        // อัปเดตการ์ดบัตรพนักงานบนห้องโปรไฟล์ทันที
        await updateCounselorCardMessage(guild, user.id);

        return interaction.editReply({
          content: "✅ บันทึกข้อมูลส่วนตัวและอัปเดตบัตรประจำตัวผู้รับฟังของคุณเรียบร้อยแล้วค่ะ! 🍵"
        });
      }

      if (customId === "heal_jai_modal_review") {
        await interaction.deferReply({ flags: FLAG_EPHEMERAL });

        const ratingRaw = interaction.fields.getTextInputValue("review_rating");
        const comment = (interaction.fields.getTextInputValue("review_comment") || "").trim();
        const anonRaw = (interaction.fields.getTextInputValue("review_anonymous") || "").trim().toLowerCase();

        let rating = parseInt(ratingRaw, 10);
        if (isNaN(rating) || rating < 1) rating = 1;
        if (rating > 5) rating = 5;

        const isAnonymous = anonRaw === "นิรนาม" || anonRaw === "anonymous" || anonRaw === "yes" || anonRaw === "true" || anonRaw.includes("นิรนาม");

        if (!supabase) {
          return interaction.editReply({
            content: "❌ ไม่สามารถเชื่อมต่อฐานข้อมูลได้ในขณะนี้ กรุณาลองใหม่อีกครั้งในภายหลังค่ะ"
          });
        }

        // ตรวจสอบ Order ของห้องนี้ (ค้นหาได้ทั้งห้อง Session Room และห้อง Ticket)
        const { data: order, error: orderErr } = await supabase
          .from("heal_jai_orders_sessions")
          .select("*")
          .or(`session_channel_id.eq.${channel.id},ticket_channel_id.eq.${channel.id}`)
          .order("id", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (orderErr || !order) {
          return interaction.editReply({
            content: "❌ ไม่พบข้อมูลออเดอร์สำหรับห้องนี้ค่ะ"
          });
        }

        if (order.customer_id !== user.id) {
          return interaction.editReply({
            content: "⚠️ ขออภัยค่ะ เฉพาะลูกค้าผู้สั่งซื้อเท่านั้นที่สามารถส่งรีวิวได้นะคะ 🍵"
          });
        }

        // ตรวจสอบว่าเคยรีวิวไปแล้วหรือยัง
        const { data: existingReview } = await supabase
          .from("heal_jai_reviews")
          .select("id")
          .eq("order_id", order.id)
          .maybeSingle();

        if (existingReview) {
          return interaction.editReply({
            content: "🐻 คุณได้ส่งรีวิวและให้คะแนนสำหรับคำสั่งซื้อนี้เรียบร้อยแล้วค่ะ ขอบคุณมากนะคะ ✨"
          });
        }

        const counselorId = order.counselor_id || user.id;

        // 1. บันทึกลง heal_jai_reviews
        const { data: insertedReview, error: insertErr } = await supabase
          .from("heal_jai_reviews")
          .insert({
            guild_id: guild.id,
            order_id: order.id,
            customer_id: user.id,
            counselor_id: counselorId,
            rating: rating,
            comment: comment,
            is_anonymous: isAnonymous,
            created_at: new Date().toISOString()
          })
          .select()
          .single();

        if (insertErr) {
          console.error("[HealJai] Insert review error:", insertErr.message);
          return interaction.editReply({
            content: `❌ เกิดข้อผิดพลาดในการบันทึกรีวิว: ${insertErr.message}`
          });
        }

        // 2. คำนวณ average_rating & total_reviews ของ Counselor
        if (counselorId) {
          const { data: allReviews } = await supabase
            .from("heal_jai_reviews")
            .select("rating")
            .eq("counselor_id", counselorId);

          if (allReviews && allReviews.length > 0) {
            const totalRev = allReviews.length;
            const sumRating = allReviews.reduce((acc, r) => acc + (r.rating || 5), 0);
            const avgRating = parseFloat((sumRating / totalRev).toFixed(2));

            await supabase
              .from("heal_jai_counselors")
              .update({
                average_rating: avgRating,
                total_reviews: totalRev,
                updated_at: new Date().toISOString()
              })
              .eq("user_id", counselorId);
          }
        }

        // 3. ส่ง Showcase การ์ดลงห้องสาธารณะ (🌟︰กล่องความประทับใจ)
        const publicChannel = guild.channels.cache.get(PUBLIC_REVIEW_CHANNEL) ||
                              await guild.channels.fetch(PUBLIC_REVIEW_CHANNEL).catch(() => null);
        if (publicChannel) {
          const showcasePayload = buildPublicReviewShowcasePayload({
            counselorId: counselorId,
            customerId: user.id,
            rating: rating,
            comment: comment,
            packageName: order.package_name || "โกโก้พักใจ 30 นาที",
            isAnonymous: isAnonymous,
            sessionNumber: order.order_code ? order.order_code.slice(-4) : null,
            dateStr: new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })
          });

          const pubMsg = await publicChannel.send(showcasePayload).catch((err) => {
            console.error("[HealJai] Failed to send public review showcase:", err.message);
            return null;
          });

          if (pubMsg && insertedReview) {
            await supabase
              .from("heal_jai_reviews")
              .update({ public_message_id: pubMsg.id })
              .eq("id", insertedReview.id);
          }
        }

        // 4. ส่งข้อความขอบคุณลูกค้า
        const starsEmoji = "⭐".repeat(rating);
        return interaction.editReply({
          content: `## <:chalkcrown:1536708801481412689>︲__\` บันทึกความประทับใจเรียบร้อยแล้ว \`__\n` +
                   `* ⭐ **คะแนนความพึงพอใจ:** ${starsEmoji} (${rating}/5 ดาว)\n` +
                   `* 💬 **ข้อความรีวิว:** "${comment}"\n` +
                   `* 👤 **ผู้เขียน:** ${isAnonymous ? "คุณหมีนิรนาม 🐻" : `<@${user.id}>`}\n\n` +
                   `> 💌 ระบบได้ส่งมอบความรู้สึกดีๆ ของคุณให้บาริสต้าผู้ดูแลและแสดงผลในห้อง <#${PUBLIC_REVIEW_CHANNEL}> เรียบร้อยแล้วค่ะ ขอบคุณที่มาร่วมสร้างพื้นที่ปลอดภัยกับ Bear Cafe นะคะ 🍵`
        });
      }
      return;
    }

    if ([CUSTOM_IDS.RATE_1, CUSTOM_IDS.RATE_2, CUSTOM_IDS.RATE_3, CUSTOM_IDS.RATE_4, CUSTOM_IDS.RATE_5, CUSTOM_IDS.WRITE_REVIEW].includes(customId)) {
      if (!supabase) {
        return interaction.reply({
          content: "❌ ระบบฐานข้อมูลไม่พร้อมใช้งานในขณะนี้ค่ะ",
          flags: FLAG_EPHEMERAL
        });
      }

      // ตรวจสอบ Order ของห้องนี้ (ค้นหาได้ทั้งห้อง Session Room และห้อง Ticket)
      const { data: order } = await supabase
        .from("heal_jai_orders_sessions")
        .select("*")
        .or(`session_channel_id.eq.${channel.id},ticket_channel_id.eq.${channel.id}`)
        .order("id", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!order) {
        return interaction.reply({
          content: "❌ ไม่พบข้อมูลออเดอร์สำหรับห้องนี้ค่ะ",
          flags: FLAG_EPHEMERAL
        });
      }

      if (order.customer_id !== user.id) {
        return interaction.reply({
          content: "⚠️ ขออภัยค่ะ เฉพาะลูกค้าผู้สั่งซื้อเท่านั้นที่สามารถส่งรีวิวหรือประเมินคะแนนได้นะคะ 🍵",
          flags: FLAG_EPHEMERAL
        });
      }

      if (order.session_status !== "COMPLETED") {
        return interaction.reply({
          content: "⏳ เซสชันนี้ยังไม่สิ้นสุดลงค่ะ จะสามารถส่งรีวิวได้หลังจากเซสชันเสร็จสมบูรณ์นะคะ",
          flags: FLAG_EPHEMERAL
        });
      }

      // เช็กว่าเคยส่งรีวิวแล้วหรือยัง
      const { data: existingReview } = await supabase
        .from("heal_jai_reviews")
        .select("id")
        .eq("order_id", order.id)
        .maybeSingle();

      if (existingReview) {
        return interaction.reply({
          content: "🐻 คุณได้ส่งรีวิวสำหรับคำสั่งซื้อนี้เรียบร้อยแล้วค่ะ ขอบคุณมากนะคะ ✨",
          flags: FLAG_EPHEMERAL
        });
      }

      const scoreMap = {
        [CUSTOM_IDS.RATE_1]: 1,
        [CUSTOM_IDS.RATE_2]: 2,
        [CUSTOM_IDS.RATE_3]: 3,
        [CUSTOM_IDS.RATE_4]: 4,
        [CUSTOM_IDS.RATE_5]: 5,
        [CUSTOM_IDS.WRITE_REVIEW]: 5
      };
      const defaultScore = scoreMap[customId] || 5;

      const modal = buildReviewModal(defaultScore);
      return interaction.showModal(modal);
    }

    // ── 2.8 ปุ่มแอดมินจัดการหลังบ้าน (Admin Action Buttons) ───────────────────
    if (customId === "heal_jai_admin_toggle_maintenance") {
      const isOwner = (process.env.OWNER_ID && interaction.user.id === process.env.OWNER_ID) ||
                      (interaction.guild && interaction.guild.ownerId === interaction.user.id);
      const hasStaffRole = interaction.member?.roles?.cache?.some((r) =>
        [STAFF_ROLE_ID, "1144701361448038512", "1144697989986791576", "1144698080239829092"].includes(r.id)
      );
      if (!isOwner && !hasStaffRole && !interaction.member?.permissions?.has(PermissionFlagsBits.Administrator)) {
        return interaction.reply({ content: "❌ คุณไม่มีสิทธิ์กดปุ่มนี้ค่ะ", flags: FLAG_EPHEMERAL });
      }

      isMaintenanceMode = !isMaintenanceMode;
      const stats = await getAdminStats(guild);
      return interaction.update(buildAdminDashboardPayload(stats));
    }

    if (customId === "heal_jai_admin_refresh_dashboard") {
      const stats = await getAdminStats(guild);
      return interaction.update(buildAdminDashboardPayload(stats));
    }

    if (customId === "heal_jai_admin_run_cleanup") {
      await interaction.deferReply({ flags: FLAG_EPHEMERAL }).catch(() => {});
      await cleanStaleChannels(client);
      return interaction.editReply({ content: "🧹 ทำการสแกนและเคลียร์ห้องค้าง/ห้องตกค้างเรียบร้อยแล้วค่ะ!" });
    }

    if (customId === "heal_jai_admin_send_report") {
      await interaction.deferReply({ flags: FLAG_EPHEMERAL }).catch(() => {});
      const msg = await sendDailyReport(guild);
      return interaction.editReply({
        content: msg
          ? `📑 ส่งรายงานสรุปยอดประจำวันไปยังห้อง <#${ORDER_HISTORY_CHANNEL_ID}> สำเร็จเรียบร้อยแล้วค่ะ!`
          : `⚠️ ไม่สามารถส่งรายงานได้ กรุณาตรวจสอบห้อง <#${ORDER_HISTORY_CHANNEL_ID}> ค่ะ`
      });
    }

    if (customId.startsWith("heal_jai_admin_approve_slip_")) {
      const orderId = customId.replace("heal_jai_admin_approve_slip_", "");
      if (!supabase) return interaction.reply({ content: "❌ DB Offline", flags: FLAG_EPHEMERAL });

      const { data: order } = await supabase
        .from("heal_jai_orders_sessions")
        .select("*")
        .eq("id", orderId)
        .maybeSingle();

      if (!order) return interaction.reply({ content: "❌ ไม่พบข้อมูลออเดอร์", flags: FLAG_EPHEMERAL });

      await supabase
        .from("heal_jai_orders_sessions")
        .update({
          payment_status: "PAID",
          session_status: "DISPATCHING",
          updated_at: new Date().toISOString()
        })
        .eq("id", orderId);

      // ส่ง Dispatch Alert
      const expireTimestamp = Math.floor((Date.now() + 3 * 60 * 1000) / 1000);
      const dispatchPayload = buildDispatchAlertPayload({
        counselorId: order.counselor_id,
        customerId: order.customer_id,
        serviceMode: order.service_mode || "chat",
        orderId: order.id,
        orderCode: order.order_code,
        packageName: order.package_name,
        duration: order.duration_minutes,
        isSilent: order.is_silent,
        isSpecific: order.is_specific_counselor,
        toppingName: order.is_silent ? "นั่งเงียบเป็นเพื่อน (+19 บาท)" : (order.is_specific_counselor ? "ระบุตัวผู้รับฟัง (+39 บาท)" : null),
        isBooster: order.is_booster,
        totalMinutes: order.duration_minutes,
        totalPrice: order.total_price,
        expireTimestamp
      });

      const dispatchChannel = guild.channels.cache.get(DISPATCH_CHANNEL_ID) ||
                              await guild.channels.fetch(DISPATCH_CHANNEL_ID).catch(() => null);
      if (dispatchChannel) {
        if (dispatchPayload.pingMention) {
          await dispatchChannel.send({ content: dispatchPayload.pingMention }).catch(() => {});
        }
        const dispatchMsg = await dispatchChannel.send(dispatchPayload).catch(() => null);
        if (dispatchMsg) {
          scheduleDispatchTimeout(client, guild, order.id, dispatchMsg.id, expireTimestamp);
        }
      }

      sendOrderHistoryLog(guild, {
        status: "PAID_VERIFIED",
        orderCode: order.order_code,
        customerId: order.customer_id,
        totalPrice: order.total_price,
        extraInfo: `สลิปได้รับการอนุมัติแบบแมนนวลโดยแอดมิน <@${user.id}> ส่งแจ้งเตือนหาผู้รับฟังแล้ว`
      });

      return interaction.reply({
        content: `✅ อนุมัติสลิปสำหรับออเดอร์ #${order.order_code} สำเร็จ! และส่งเคสไปยังห้อง Dispatch เรียบร้อยแล้วค่ะ`,
        flags: FLAG_EPHEMERAL
      });
    }

    if (customId.startsWith("heal_jai_admin_force_end_")) {
      const orderId = customId.replace("heal_jai_admin_force_end_", "");
      await handleSessionExpiry(client, guild, orderId, { isEarly: true });
      sendOrderHistoryLog(guild, {
        status: "ADMIN_FORCE_END",
        orderCode: `HJ-${orderId}`,
        extraInfo: `เซสชันถูกบังคับจบโดยแอดมิน <@${user.id}>`
      });
      return interaction.reply({
        content: `⏹️ บังคับจบเซสชัน #${orderId} และล็อกสิทธิ์ห้องเรียบร้อยแล้วค่ะ!`,
        flags: FLAG_EPHEMERAL
      });
    }

    if (customId.startsWith("heal_jai_admin_delete_room_")) {
      const targetId = customId.replace("heal_jai_admin_delete_room_", "");
      const ch = guild.channels.cache.get(targetId) || await guild.channels.fetch(targetId).catch(() => null);
      if (ch) {
        await ch.delete("Deleted by HealJai Admin action").catch(() => {});
        return interaction.reply({ content: `🗑️ ลบห้อง <#${targetId}> เรียบร้อยแล้วค่ะ!`, flags: FLAG_EPHEMERAL });
      } else {
        return interaction.reply({ content: "⚠️ ไม่พบห้องดังกล่าว หรือห้องถูกลบไปแล้วค่ะ", flags: FLAG_EPHEMERAL });
      }
    }
  });

  // ── 3. Recovery on Startup ─────────────────────────────────────────
  client.once("clientReady", async () => {
    const supabase = getSupabase();
    if (!supabase) return;

    try {
      // 3.1 คืนค่า pending tickets auto-delete
      const { data: pendingTickets } = await supabase
        .from("heal_jai_tickets")
        .select("*")
        .eq("status", "pending");

      if (pendingTickets && pendingTickets.length > 0) {
        console.log(`[HealJai] 🔄 Restoring ${pendingTickets.length} pending ticket timers on startup...`);

        for (const ticket of pendingTickets) {
          const ch = await client.channels.fetch(ticket.channel_id).catch(() => null);
          if (!ch) {
            await supabase
              .from("heal_jai_tickets")
              .update({ status: "expired", updated_at: new Date().toISOString() })
              .eq("id", ticket.id);
            continue;
          }

          const createdAt = new Date(ticket.created_at).getTime();
          const elapsed = Date.now() - createdAt;
          if (elapsed >= TIMEOUT_MS) {
            await ch.delete("HealJai ticket expired during restart").catch(() => {});
            await supabase
              .from("heal_jai_tickets")
              .update({ status: "expired", updated_at: new Date().toISOString() })
              .eq("id", ticket.id);
          } else {
            const remaining = TIMEOUT_MS - elapsed;
            const timer = setTimeout(async () => {
              activeTimers.delete(ticket.channel_id);
              await ch.delete("HealJai ticket expired (post-restart)").catch(() => {});
              await supabase
                .from("heal_jai_tickets")
                .update({ status: "expired", updated_at: new Date().toISOString() })
                .eq("id", ticket.id);
            }, remaining);

            activeTimers.set(ticket.channel_id, timer);
          }
        }
      }

      // 3.2 กู้คืน Session Timers ที่ IN_PROGRESS อยู่
      const { data: activeSessions } = await supabase
        .from("heal_jai_orders_sessions")
        .select("*")
        .eq("session_status", "IN_PROGRESS")
        .not("expires_at", "is", null);

      if (activeSessions && activeSessions.length > 0) {
        console.log(`[HealJai] 🔄 Restoring ${activeSessions.length} active session timers on startup...`);
        for (const order of activeSessions) {
          const guild = client.guilds.cache.get(order.guild_id) || await client.guilds.fetch(order.guild_id).catch(() => null);
          if (guild) {
            scheduleSessionTimer(client, guild, order);
          }
        }
      }

      // 3.2.1 กู้คืน WAITING_FOR_PROVIDER timers
      const { data: waitingSessions } = await supabase
        .from("heal_jai_orders_sessions")
        .select("*")
        .eq("session_status", "WAITING_FOR_PROVIDER")
        .not("session_channel_id", "is", null);

      if (waitingSessions && waitingSessions.length > 0) {
        console.log(`[HealJai] 🔄 Restoring ${waitingSessions.length} waiting-for-provider timers on startup...`);
        for (const order of waitingSessions) {
          const guild = client.guilds.cache.get(order.guild_id) || await client.guilds.fetch(order.guild_id).catch(() => null);
          if (guild) {
            scheduleProviderReadyTimeout(client, guild, order.id, order.session_channel_id);
          }
        }
      }

      // 3.3 กู้คืน Session Retention Timers สำหรับเซสชันที่ COMPLETED แล้วแต่ยังไม่ครบ 24 ชม.
      const { data: completedSessions } = await supabase
        .from("heal_jai_orders_sessions")
        .select("*")
        .eq("session_status", "COMPLETED")
        .not("session_channel_id", "is", null)
        .not("ended_at", "is", null);

      if (completedSessions && completedSessions.length > 0) {
        console.log(`[HealJai] 🔄 Checking ${completedSessions.length} completed sessions for 24h retention cleanup...`);
        for (const session of completedSessions) {
          const guild = client.guilds.cache.get(session.guild_id) || await client.guilds.fetch(session.guild_id).catch(() => null);
          if (!guild) continue;

          const endedAt = new Date(session.ended_at).getTime();
          const elapsed = Date.now() - endedAt;
          if (elapsed >= SESSION_RETENTION_MS) {
            const ch = guild.channels.cache.get(session.session_channel_id) || await guild.channels.fetch(session.session_channel_id).catch(() => null);
            if (ch) await ch.delete("HealJai session 24h retention expired (post-restart)").catch(() => {});
          } else {
            scheduleSessionRoomCleanup(client, guild, session.id, session.session_channel_id, SESSION_RETENTION_MS - elapsed);
          }
        }
      }

      // 3.4 อัปเดตสถิติช่อง Voice Stats เริ่มต้น
      const defaultGuildId = config.healJai?.guildId || "1536199707922141254";
      const mainGuild = client.guilds.cache.get(defaultGuildId) || await client.guilds.fetch(defaultGuildId).catch(() => null);
      if (mainGuild) {
        await updateOnlineCounselorsCount(mainGuild);
        await updateCupsServedCount(mainGuild);
      }

      // 3.5 เริ่มต้นระบบ Background Periodic Cleanup ทุก 10 นาที (และรัน 1 ครั้งหลังบอทเริ่มทำงาน 10 วินาที)
      setTimeout(() => {
        cleanStaleChannels(client).catch((err) => console.error("[HealJai] Initial stale channels cleanup error:", err.message));
      }, 10 * 1000);

      setInterval(() => {
        cleanStaleChannels(client).catch((err) => console.error("[HealJai] Periodic stale channels cleanup error:", err.message));
      }, 10 * 60 * 1000);

      // 3.6 ตั้งเวลารัน Midnight Daily Report ทุกเที่ยงคืน
      scheduleDailyMidnightReport(client);
    } catch (err) {
      console.error("[HealJai] Error restoring pending tickets or active sessions on startup:", err.message);
    }
  });
}

module.exports = {
  setupHealJai,
  cleanStaleChannels,
  getAdminStats,
  sendDailyReport,
  scheduleDailyMidnightReport,
  updateOnlineCounselorsCount,
  updateCupsServedCount,
  buildAgreementPayload,
  buildMainMenuPayload,
  buildShiftPanelPayload,
  buildCheckoutTicketPayload,
  buildDispatchAlertPayload,
  buildSessionDashboardPayload,
  buildFeedbackPromptPayload,
  buildPublicReviewShowcasePayload,
  buildAdminDashboardPayload,
  buildAdminManageCasePayload,
  buildDailyReportPayload
};
