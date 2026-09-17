// src/main/features/healJai/index.js — ระบบบริการ Bear Cafe ฮีลใจ (Heal Jai System)
// ครอบคลุม: ข้อตกลง (Agreement), สั่งเมนู (Menu), Ticket ชำระเงิน, ตอกบัตรเข้ากะ (Shift Panel), และรีวิว (Feedback)

const { createClient } = require("@supabase/supabase-js");
const { ChannelType, PermissionFlagsBits, MessageFlags, EmbedBuilder } = require("discord.js");
const config = require("../../../../config");
const { registerCommand } = require("../../interactions/router");
const {
  FLAG_V2,
  FLAG_EPHEMERAL,
  DRINK_OPTIONS,
  TOPPING_OPTIONS,
  MOCK_COUNSELORS,
  buildAgreementPayload,
  buildMainMenuPayload,
  buildShiftPanelPayload,
  buildCheckoutTicketPayload,
  buildInteractiveMenuPayload,
  buildScanToPayPayload,
  buildDispatchAlertPayload,
  buildSessionDashboardPayload,
  buildFeedbackPromptPayload,
  buildPublicReviewShowcasePayload
} = require("./healJaiPayloads");

const CUSTOM_IDS = {
  VIEW_FULL_TERMS: "heal_jai_view_full_terms",
  ACCEPT_TERMS: "heal_jai_accept_terms",
  OPEN_MENU: "heal_jai_open_menu",
  SELECT_DRINK: "heal_jai_select_drink",
  SELECT_TOPPING: "heal_jai_select_topping",
  SELECT_COUNSELOR: "heal_jai_select_counselor",
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

const TIMEOUT_MS = (config.healJai && config.healJai.timeoutMinutes ? config.healJai.timeoutMinutes : 15) * 60 * 1000;

// Memory map สำหรับเก็บสถานะการเลือกเมนูในห้อง Ticket (channelId -> { selectedDrink, selectedTopping })
const ticketSelections = new Map();

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

      if (order && order.session_status === "DISPATCHING" && !order.counselor_id) {
        console.log(`[HealJai] ⏰ Dispatch alert expired for order #${order.order_code}. Escalating to open dispatch...`);

        const dispatchChannel = guild.channels.cache.get(DISPATCH_CHANNEL_ID) ||
                                await guild.channels.fetch(DISPATCH_CHANNEL_ID).catch(() => null);
        if (dispatchChannel) {
          await dispatchChannel.send({
            content: `<@&${STAFF_ROLE_ID}> <@&${COUNSELOR_ROLE_ID}> ⚠️ **หมดเวลารับเคสเฉพาะบุคคล (3 นาที)** สำหรับออเดอร์ \`#${order.order_code}\` แล้วค่ะ! ระบบเปิดเคสให้ผู้ให้คำปรึกษาทุกคนที่พร้อมกดรับได้ทันทีนะคะ 🍵`
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
 * หลักของฟีเจอร์ HealJai
 */
function setupHealJai(client) {
  // ── 1. Slash Command: /send-component สำหรับส่งการ์ดแผงควบคุม ─────────────
  registerCommand("send-component", async (interaction) => {
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

    const componentChoice = interaction.options.getString("component");
    const targetChannel = interaction.options.getChannel("channel") || interaction.channel;

    if (!targetChannel.isTextBased()) {
      return interaction.reply({
        content: "⚠️ กรุณาเลือกห้องที่เป็น Text Channel เท่านั้นค่ะ",
        flags: FLAG_EPHEMERAL
      });
    }

    let payload = null;
    let componentName = "";

    switch (componentChoice) {
      case "terms":
        payload = buildAgreementPayload();
        componentName = "1️⃣︰บอร์ดอ่านข้อตกลงและนโยบาย";
        break;
      case "menu":
        payload = buildMainMenuPayload();
        componentName = "2️⃣︰บอร์ดเมนูเครื่องดื่มและสั่งบริการ";
        break;
      case "shift":
        payload = buildShiftPanelPayload();
        componentName = "3️⃣︰แผงตอกบัตรเข้ากะของทีมงาน";
        break;
      case "feedback":
        payload = buildPublicReviewShowcasePayload({
          counselorId: interaction.user.id,
          customerId: interaction.user.id,
          rating: 5,
          comment: "ตัวอย่างข้อความรีวิวความประทับใจจากผู้รับบริการ...",
          packageName: "โกโก้พักใจ 30 นาที",
          isAnonymous: true,
          sessionNumber: 1
        });
        componentName = "7️⃣︰กล่องความประทับใจ (พรีวิว)";
        break;
      case "minigame_top": {
        if (!isOwner) {
          return interaction.reply({
            content: "❌ ขออภัยค่ะ ตัวเลือก **กระดานจัดอันดับหมีติดเกม** สงวนสิทธิ์การใช้งานเฉพาะ Owner เท่านั้นนะคะ 👑",
            flags: FLAG_EPHEMERAL
          });
        }

        await interaction.deferReply({ flags: FLAG_EPHEMERAL }).catch(() => {});
        try {
          const { buildTopLeaderboardPayload } = require("../minigames/resetTop");
          const { createClient } = require("@supabase/supabase-js");
          const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
          );

          const { payload: topPayload, attachment } = await buildTopLeaderboardPayload(targetChannel.guild, supabase);
          await targetChannel.send({ ...topPayload, files: [attachment] });

          return interaction.editReply({
            content: `✅ ส่ง **กระดานจัดอันดับหมีติดเกม (Minigame Leaderboard)** ไปยังห้อง <#${targetChannel.id}> สำเร็จเรียบร้อยแล้วค่ะ! 🏆`,
            flags: FLAG_EPHEMERAL
          });
        } catch (err) {
          console.error("[HealJai] Error sending minigame_top component:", err);
          return interaction.editReply({
            content: `❌ เกิดข้อผิดพลาดในการส่งกระดานจัดอันดับ: ${err.message}`,
            flags: FLAG_EPHEMERAL
          });
        }
      }
      case "voice_board": {
        const { createAndSendVoiceBoard } = require("../voiceBoard");
        const msg = await createAndSendVoiceBoard(targetChannel);
        if (!msg) {
          return interaction.reply({
            content: `❌ ไม่สามารถส่งบอร์ดห้องเสียงไปยังห้อง <#${targetChannel.id}> ได้ค่ะ`,
            flags: FLAG_EPHEMERAL,
          });
        }
        return interaction.reply({
          content: `✅ ส่ง **บอร์ดห้องเสียงหาเพื่อน (Voice Board)** ไปยังห้อง <#${targetChannel.id}> สำเร็จเรียบร้อยแล้วค่ะ!\n> 💡 *ระบบเริ่มทำงานและเชื่อมต่อการอัปเดตเรียลไทม์ 24 ชม. ทันที*`,
          flags: FLAG_EPHEMERAL,
        });
      }
      default:
        return interaction.reply({
          content: "❌ ไม่พบบอร์ดที่เลือกค่ะ",
          flags: FLAG_EPHEMERAL
        });
    }

    try {
      await targetChannel.send(payload);
      return interaction.reply({
        content: `✅ ส่ง **${componentName}** ไปยังห้อง <#${targetChannel.id}> สำเร็จเรียบร้อยแล้วค่ะ! 🍵`,
        flags: FLAG_EPHEMERAL
      });
    } catch (err) {
      console.error("[HealJai] Error sending component via slash command:", err);
      return interaction.reply({
        content: `❌ เกิดข้อผิดพลาดในการส่งการ์ด: ${err.message}`,
        flags: FLAG_EPHEMERAL
      });
    }
  });

  // ── 1.2 Slash Command: /ยืนยันการโอน & /ยืนยันสลิป (Heal Jai Payment Verification) ─────────
  const handlePaymentVerification = async (interaction) => {
    await interaction.deferReply({ flags: FLAG_EPHEMERAL }).catch(() => {});

    const { guild, channel, user, member } = interaction;
    const supabase = getSupabase();

    try {
      let order = null;
      let ticket = null;

      if (supabase) {
        const { data: orderData } = await supabase
          .from("heal_jai_orders_sessions")
          .select("*")
          .eq("ticket_channel_id", channel.id)
          .eq("payment_status", "PENDING")
          .maybeSingle();
        order = orderData;

        const { data: ticketData } = await supabase
          .from("heal_jai_tickets")
          .select("*")
          .eq("channel_id", channel.id)
          .eq("status", "pending")
          .maybeSingle();
        ticket = ticketData;
      }

      const isTicketChannel = Boolean(order || ticket || channel.name?.includes("เลือกเมนู"));
      if (!isTicketChannel) {
        return interaction.editReply({
          content: "❌ คำสั่งนี้สามารถใช้งานได้เฉพาะภายในห้อง Ticket เลือกเมนูที่กำลังรอชำระเงินเท่านั้นค่ะ"
        });
      }

      const isOwner = (order && order.customer_id === user.id) || (ticket && ticket.user_id === user.id);
      const isStaff = member?.roles?.cache?.has(STAFF_ROLE_ID) ||
                      member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
                      (process.env.OWNER_ID && user.id === process.env.OWNER_ID) ||
                      process.env.DEV_MODE === "true";

      if (!isOwner && !isStaff) {
        return interaction.editReply({
          content: "❌ ขออภัยค่ะ เฉพาะผู้เปิดออเดอร์หรือทีมงานแอดมินเท่านั้นที่สามารถยืนยันการโอนเงินได้นะคะ"
        });
      }

      const slipAttachment = interaction.options.getAttachment("สลิป");
      const testSuccess = interaction.options.getString("test_success");

      // 🔴 กรณีตรวจไม่ผ่าน (fail)
      if (testSuccess === "fail") {
        await channel.send({
          content: `❌ <@${user.id}> **ระบบตรวจสอบสลิปไม่ผ่าน หรือยอดเงินไม่ถูกต้อง**\n> 💡 กรุณาตรวจสอบรูปสลิปแล้วใช้คำสั่ง \`/ยืนยันการโอน\` หรือ \`/ยืนยันสลิป\` อีกครั้ง หรือกดปุ่ม **[ 🚨 ติดต่อทีมงาน ]** ด้านล่างเพื่อให้แอดมินช่วยตรวจสอบค่ะ`
        }).catch(() => {});

        return interaction.editReply({
          content: "❌ ไม่สามารถตรวจสอบยอดเงินได้ หรือข้อมูลสลิปไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง หรือกดปุ่ม [ 🚨 ติดต่อทีมงาน ]"
        });
      }

      // 🟢 กรณีตรวจผ่าน (pass)
      const slipUrl = slipAttachment ? slipAttachment.url : null;
      const verifiedAt = new Date().toISOString();

      if (supabase) {
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
      }

      clearAutoDeleteTimer(channel.id);

      // สุ่มเลือกผู้ให้คำปรึกษาที่สถานะ 🟢 ONLINE
      let chosenCounselorId = null;
      if (supabase) {
        const { data: onlineCounselors } = await supabase
          .from("heal_jai_counselors")
          .select("*")
          .eq("guild_id", guild.id)
          .eq("status", "ONLINE");

        if (onlineCounselors && onlineCounselors.length > 0) {
          const randomCounselor = onlineCounselors[Math.floor(Math.random() * onlineCounselors.length)];
          chosenCounselorId = randomCounselor.user_id;
        }
      }

      // ปลดล็อกให้ลูกค้าพิมพ์คุยในห้อง Ticket ได้
      if (channel && channel.permissionOverwrites) {
        await channel.permissionOverwrites.edit(user.id, {
          ViewChannel: true,
          SendMessages: true,
          ReadMessageHistory: true
        }).catch((e) => console.error("[HealJai] Failed to unlock SendMessages for customer:", e.message));
      }

      // ส่งข้อความยืนยันในห้อง Ticket ของลูกค้า
      await channel.send({
        content: `## <:50121checkmark:1358584609087946867>︲__\` ตรวจสอบยอดเงินเรียบร้อยแล้ว \`__\n✅ <@${user.id}> ระบบตรวจสอบการชำระเงินสำเร็จแล้วค่ะ!\n> 🍵 **กำลังค้นหาผู้รับฟังให้คุณ...** ระบบได้ส่งการ์ดแจ้งเตือนไปยังทีมงานแล้ว โปรดรอสักครู่นะคะ`
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
        extraInfo: `ชำระเงินสำเร็จ ระบบกำลังค้นหาผู้รับฟัง (ส่งแจ้งเตือนไปยังห้อง Dispatch)`
      });

      await interaction.editReply({
        content: "✅ ตรวจสอบยอดเงินเรียบร้อยแล้ว กำลังค้นหาผู้รับฟังให้คุณ..."
      });

      // ยิงการ์ดแจ้งเตือนหาผู้ให้คำปรึกษา (Board 5) ไปยังห้อง DISPATCH_CHANNEL_ID (1545239933265121311)
      const expireTimestamp = Math.floor((Date.now() + 3 * 60 * 1000) / 1000);
      const dispatchPayload = buildDispatchAlertPayload({
        counselorId: chosenCounselorId,
        orderId: order ? order.id : null,
        orderCode: order ? order.order_code : `HJ-${channel.id.slice(-6)}`,
        packageName: order?.package_name || "โกโก้พักใจ 30 นาที",
        duration: order?.duration_minutes || 30,
        isSilent: order?.is_silent || false,
        isBooster: order?.is_booster || false,
        totalMinutes: order?.duration_minutes || 30,
        totalPrice: order?.total_price || 69,
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
      console.error("[HealJai] Error in payment verification command:", err);
      return interaction.editReply({
        content: `❌ เกิดข้อผิดพลาดในการยืนยันการโอนเงิน: ${err.message}`
      });
    }
  };

  registerCommand("ยืนยันการโอน", handlePaymentVerification);
  registerCommand("ยืนยันสลิป", handlePaymentVerification);

  // ── 2. Interaction Buttons Handler ─────────────────────────────────
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

    const { customId, guild, member, user, channel } = interaction;
    const supabase = getSupabase();

    // ── 2.0 จัดการ Select Menus สำหรับเลือกเมนูและท็อปปิ้ง ────────────
    if (interaction.isStringSelectMenu()) {
      let state = ticketSelections.get(channel.id);
      if (!state && supabase) {
        try {
          const { data: ord } = await supabase
            .from("heal_jai_orders_sessions")
            .select("*")
            .eq("ticket_channel_id", channel.id)
            .maybeSingle();
          if (ord) {
            const drinkEntry = Object.values(DRINK_OPTIONS).find((d) => d.name === ord.package_name || d.tier === ord.package_tier);
            let toppingId = null;
            if (ord.is_silent) toppingId = "silent_15";
            else if (ord.is_specific_counselor) toppingId = "specific_30";
            state = {
              selectedDrink: drinkEntry ? drinkEntry.id : null,
              selectedTopping: toppingId
            };
            ticketSelections.set(channel.id, state);
          }
        } catch (e) {}
      }
      if (!state) {
        state = { selectedDrink: null, selectedTopping: null, selectedCounselor: null };
      }

      if (customId === "heal_jai_select_drink" || customId === CUSTOM_IDS.SELECT_DRINK) {
        const chosenDrinkId = interaction.values[0];
        state.selectedDrink = chosenDrinkId;
        ticketSelections.set(channel.id, state);

        const updatedPayload = buildInteractiveMenuPayload({
          selectedDrink: state.selectedDrink,
          selectedTopping: state.selectedTopping,
          selectedCounselor: state.selectedCounselor
        });

        return interaction.update(updatedPayload).catch((e) => {
          console.error("[HealJai] Failed to update drink select menu:", e.message);
        });
      }

      if (customId === "heal_jai_select_topping" || customId === CUSTOM_IDS.SELECT_TOPPING) {
        const chosenToppingId = interaction.values[0];

        // Toggle behavior: If clicked the one already selected, deselect (remove topping)
        if (state.selectedTopping === chosenToppingId) {
          state.selectedTopping = null;
          state.selectedCounselor = null;
        } else {
          state.selectedTopping = chosenToppingId;
          if (chosenToppingId !== "specific_30") {
            state.selectedCounselor = null;
          }
        }
        ticketSelections.set(channel.id, state);

        const updatedPayload = buildInteractiveMenuPayload({
          selectedDrink: state.selectedDrink,
          selectedTopping: state.selectedTopping,
          selectedCounselor: state.selectedCounselor
        });

        return interaction.update(updatedPayload).catch((e) => {
          console.error("[HealJai] Failed to update topping select menu:", e.message);
        });
      }

      if (customId === "heal_jai_select_counselor" || customId === CUSTOM_IDS.SELECT_COUNSELOR) {
        const chosenCounselorId = interaction.values[0];
        state.selectedCounselor = chosenCounselorId;
        ticketSelections.set(channel.id, state);

        const updatedPayload = buildInteractiveMenuPayload({
          selectedDrink: state.selectedDrink,
          selectedTopping: state.selectedTopping,
          selectedCounselor: state.selectedCounselor
        });

        return interaction.update(updatedPayload).catch((e) => {
          console.error("[HealJai] Failed to update counselor select menu:", e.message);
        });
      }
      return;
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
                    type: 10,
                    content: `### <a:heartoutlines:1536268541144076369>︲__\` ยินยอมข้อตกลงเรียบร้อยแล้วค่ะ \`__\nคุณได้รับสิทธิ์เข้าสู่พื้นที่ปลอดภัย Bear Cafe ฮีลใจ เรียบร้อยแล้วนะคะ สามารถไปที่ห้อง <#${MENU_CHANNEL_ID}> เพื่อเลือกเมนูเครื่องดื่มและเวลาสนทนาได้เลยค่ะ 🍵`
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

      try {
        if (supabase) {
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
                  content: `### ⚠️︲คุณมีห้องเลือกเมนูที่กำลังดำเนินการอยู่แล้ว\nสามารถกดที่ปุ่มหรือลิงก์ด้านล่างเพื่อไปยังห้องของคุณได้เลยค่ะ:\n> <https://discord.com/channels/${guild.id}/${existingCh.id}>`,
                  components: [
                    {
                      type: 1,
                      components: [
                        {
                          type: 2,
                          style: 5,
                          label: "ไปยังห้องเดิม",
                          url: `https://discord.com/channels/${guild.id}/${existingCh.id}`
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
        }

        const username = member?.displayName || user.username;
        const channelName = `☕︰${username} เลือกเมนู`;
        const categoryId = interaction.channel.parentId;

        const overwrites = [
          {
            id: guild.roles.everyone.id,
            deny: [PermissionFlagsBits.ViewChannel],
          },
          {
            id: user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory],
            deny: [PermissionFlagsBits.SendMessages],
          },
          {
            id: client.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.ReadMessageHistory,
              PermissionFlagsBits.ManageChannels,
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

        // 2. ส่งการ์ดเลือกเมนูเครื่องดื่มและท็อปปิ้ง (Interactive Component v2)
        ticketSelections.set(newChannel.id, { selectedDrink: null, selectedTopping: null, selectedCounselor: null });
        const menuPayload = buildInteractiveMenuPayload({ selectedDrink: null, selectedTopping: null, selectedCounselor: null });
        const checkoutMsg = await newChannel.send(menuPayload);

        const orderCode = `HJ-${Date.now().toString(36).toUpperCase()}-${Math.floor(100 + Math.random() * 900)}`;

        if (supabase) {
          await supabase.from("heal_jai_tickets").insert({
            guild_id: guild.id,
            channel_id: newChannel.id,
            user_id: user.id,
            notice_message_id: checkoutMsg.id,
            status: "pending",
          });

          await supabase.from("heal_jai_orders_sessions").insert({
            order_code: orderCode,
            guild_id: guild.id,
            customer_id: user.id,
            package_tier: null,
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
          content: `### ☕︲เปิดห้องเลือกเมนูเรียบร้อยแล้วค่ะ\nคลิกที่ปุ่มหรือลิงก์ด้านล่างเพื่อไปยังห้องของคุณได้เลย:\n> <https://discord.com/channels/${guild.id}/${newChannel.id}>`,
          components: [
            {
              type: 1,
              components: [
                {
                  type: 2,
                  style: 5,
                  label: "ไปยังห้องเลือกเมนู",
                  url: `https://discord.com/channels/${guild.id}/${newChannel.id}`
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

    // ── 2.4.1 กดปุ่ม "จ่ายเงิน" (Pay Button ใน Interactive Menu) ───────
    if (customId === "heal_jai_btn_pay" || customId === CUSTOM_IDS.BTN_PAY) {
      const state = ticketSelections.get(channel.id) || { selectedDrink: null, selectedTopping: null, selectedCounselor: null };
      if (!state.selectedDrink || !DRINK_OPTIONS[state.selectedDrink]) {
        return interaction.reply({
          content: "⚠️ กรุณาเลือกเครื่องดื่มก่อนกดชำระเงินนะคะ",
          flags: FLAG_EPHEMERAL
        });
      }

      const isSpecific = state.selectedTopping === "specific_30";
      if (isSpecific && !state.selectedCounselor) {
        return interaction.reply({
          content: "⚠️ กรุณาคลิกเลือกผู้รับฟังที่คุณต้องการก่อนกดชำระเงินนะคะ 🎯",
          flags: FLAG_EPHEMERAL
        });
      }

      const drink = DRINK_OPTIONS[state.selectedDrink];
      const topping = state.selectedTopping ? TOPPING_OPTIONS[state.selectedTopping] : null;
      const counselorObj = (isSpecific && state.selectedCounselor) ? MOCK_COUNSELORS[state.selectedCounselor] : null;
      const counselorName = counselorObj ? counselorObj.label : null;

      const totalPrice = drink.price + (topping ? topping.price : 0);
      const counselorShare = Number((totalPrice * 0.70).toFixed(2));
      const platformShare = Number((totalPrice * 0.30).toFixed(2));
      const isSilent = state.selectedTopping === "silent_15";
      const isBooster = Boolean(member?.premiumSince);

      let orderCode = `HJ-${channel.id.slice(-6)}`;

      if (supabase) {
        const { data: updatedOrder } = await supabase
          .from("heal_jai_orders_sessions")
          .update({
            package_tier: drink.tier,
            package_name: drink.name,
            duration_minutes: drink.duration,
            is_silent: isSilent,
            is_specific_counselor: isSpecific,
            is_booster: isBooster,
            total_price: totalPrice,
            counselor_share: counselorShare,
            platform_share: platformShare,
            updated_at: new Date().toISOString()
          })
          .eq("ticket_channel_id", channel.id)
          .select("order_code")
          .maybeSingle();

        if (updatedOrder && updatedOrder.order_code) {
          orderCode = updatedOrder.order_code;
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
        const query = supabase.from("heal_jai_orders_sessions").select("*");
        if (!isNaN(targetIdentifier) && targetIdentifier !== "general") {
          query.or(`id.eq.${targetIdentifier},order_code.eq.${targetIdentifier}`);
        } else {
          query.eq("order_code", targetIdentifier);
        }
        const { data } = await query.maybeSingle();
        order = data;
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

      if (supabase) {
        await supabase.from("heal_jai_orders_sessions").update({
          counselor_id: user.id,
          session_status: "ACTIVE",
          updated_at: new Date().toISOString()
        }).eq("id", order.id);
      }

      // ส่ง Log ประวัติ CLAIMED ไปยังห้อง 1549710698702184539
      sendOrderHistoryLog(guild, {
        status: "CLAIMED",
        orderCode: order.order_code,
        customerId: order.customer_id,
        counselorId: user.id,
        packageName: order.package_name,
        totalPrice: order.total_price,
        extraInfo: `ผู้ให้คำปรึกษา <@${user.id}> กดรับเคสเรียบร้อย พร้อมดูแลลูกค้าที่ห้อง <#${order.ticket_channel_id}>`
      });

      // เคลียร์ dispatch timer
      if (dispatchTimers.has(order.id)) {
        clearTimeout(dispatchTimers.get(order.id));
        dispatchTimers.delete(order.id);
      }

      // ปรับสิทธิ์ห้อง Ticket ให้ที่ปรึกษาเห็นและส่งข้อความได้ และปลดล็อกให้ลูกค้าพิมพ์คุยได้
      if (order.ticket_channel_id) {
        const ticketCh = guild.channels.cache.get(order.ticket_channel_id) ||
                         await guild.channels.fetch(order.ticket_channel_id).catch(() => null);
        if (ticketCh) {
          // ปลดล็อกให้ที่ปรึกษา
          await ticketCh.permissionOverwrites.edit(user.id, {
            ViewChannel: true,
            SendMessages: true,
            ReadMessageHistory: true
          }).catch(() => {});

          // ปลดล็อกให้ลูกค้าพิมพ์คุยได้
          if (order.customer_id) {
            await ticketCh.permissionOverwrites.edit(order.customer_id, {
              ViewChannel: true,
              SendMessages: true,
              ReadMessageHistory: true
            }).catch(() => {});
          }

          await ticketCh.send(buildSessionDashboardPayload({
            customerId: order.customer_id,
            counselorId: user.id,
            totalMinutes: order.duration_minutes || 30,
            isBooster: order.is_booster,
            packageName: order.package_name
          })).catch(() => {});
        }
      }

      // อัปเดตการ์ดในห้อง Dispatch ให้รู้ว่ามีคนรับแล้ว
      if (interaction.message && interaction.message.editable) {
        await interaction.message.edit({
          content: `<@&${COUNSELOR_ROLE_ID}> ✅ **<@${user.id}> กดรับเคส #${order.order_code} เรียบร้อยแล้วค่ะ!** 🍵`,
          components: []
        }).catch(() => {});
      }

      return interaction.editReply({
        content: `🎉 คุณได้รับเคสออเดอร์ \`#${order.order_code}\` เรียบร้อยแล้วค่ะ! สามารถเข้าไปดูแลลูกค้าได้ที่ห้อง <#${order.ticket_channel_id}> ได้เลยนะคะ 🍵`
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

      if (interaction.message && interaction.message.editable) {
        await interaction.message.edit({
          content: `<@&${COUNSELOR_ROLE_ID}> ↩️ **<@${user.id}> ได้กดสละสิทธิ์เคสนี้**\n> 📢 ระบบเปิดเคสนี้เป็น Open Dispatch ให้ผู้ให้คำปรึกษาทุกคนที่ว่างสามารถกดรับเคสได้ทันทีค่ะ!`
        }).catch(() => {});
      }

      return interaction.editReply({
        content: "↩️ คุณได้สละสิทธิ์เคสนี้แล้ว ระบบได้เปิดเคสให้ผู้ให้คำปรึกษาท่านอื่นกดรับแทนแล้วค่ะ ขอบคุณที่แจ้งนะคะ 🍵"
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

      await interaction.deferUpdate().catch(() => {});

      if (supabase) {
        await supabase
          .from("heal_jai_orders_sessions")
          .update({
            session_status: "IN_PROGRESS",
            session_started_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("ticket_channel_id", channel.id);
      }

      await channel.send({
        content: `⏱️ **เซสชันสนทนาเริ่มต้นขึ้นแล้ว!** ขอให้เป็นช่วงเวลาที่อบอุ่นและสบายใจนะคะ บอทจะคอยจับเวลาและแจ้งเตือนเมื่อเหลือ 5 นาทีสุดท้ายค่ะ 🍵`
      }).catch(() => {});
      return;
    }

    // ── 2.10 กดปุ่ม "สิ้นสุดเซสชัน" (Session Dashboard) ───────────────
    if (customId === CUSTOM_IDS.END_SESSION || customId === "heal_jai_end_session") {
      const isCounselor = member?.roles?.cache?.has(COUNSELOR_ROLE_ID) ||
                          member?.roles?.cache?.has(STAFF_ROLE_ID) ||
                          (process.env.OWNER_ID && user.id === process.env.OWNER_ID);

      if (!isCounselor) {
        return interaction.reply({
          content: "❌ ขออภัยค่ะ เฉพาะผู้ให้คำปรึกษาประจำเคสนี้เท่านั้นที่สามารถกดสิ้นสุดเซสชันได้นะคะ 🍵",
          flags: FLAG_EPHEMERAL
        });
      }

      await interaction.deferReply({ flags: FLAG_EPHEMERAL }).catch(() => {});

      let order = null;
      if (supabase) {
        const { data: ord } = await supabase
          .from("heal_jai_orders_sessions")
          .select("*")
          .eq("ticket_channel_id", channel.id)
          .maybeSingle();
        order = ord;

        await supabase
          .from("heal_jai_orders_sessions")
          .update({
            session_status: "COMPLETED",
            session_ended_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          })
          .eq("ticket_channel_id", channel.id);

        if (order && order.counselor_id) {
          // เพิ่มสถิติและรายได้ให้ที่ปรึกษา
          const counselorShare = order.counselor_share || 0;
          const { data: currentCounselor } = await supabase
            .from("heal_jai_counselors")
            .select("total_sessions, accumulated_earnings")
            .eq("user_id", order.counselor_id)
            .maybeSingle();

          const prevSessions = currentCounselor?.total_sessions || 0;
          const prevEarnings = Number(currentCounselor?.accumulated_earnings || 0);

          await supabase.from("heal_jai_counselors").update({
            total_sessions: prevSessions + 1,
            accumulated_earnings: prevEarnings + counselorShare,
            updated_at: new Date().toISOString()
          }).eq("user_id", order.counselor_id);
        }
      }

      // ส่งแบบประเมินความประทับใจ (Board 7) ให้ลูกค้าในห้อง
      await channel.send(buildFeedbackPromptPayload()).catch(() => {});

      // ส่ง Log COMPLETED ไปยังห้อง 1549710698702184539
      sendOrderHistoryLog(guild, {
        status: "COMPLETED",
        orderCode: order?.order_code || `HJ-${channel.id.slice(-6)}`,
        customerId: order?.customer_id,
        counselorId: user.id,
        packageName: order?.package_name,
        totalPrice: order?.total_price,
        extraInfo: `เซสชันเสร็จสิ้นสมบูรณ์ ส่งแบบประเมินความพึงพอใจให้ลูกค้าเรียบร้อย`
      });

      return interaction.editReply({
        content: "✅ สิ้นสุดเซสชันเรียบร้อยแล้วค่ะ ระบบได้ส่งแบบประเมินความพึงพอใจให้ลูกค้าแล้ว ขอบคุณสำหรับการปฏิบัติหน้าที่นะคะ 🍵"
      });
    }

    // ── 2.6 ระบบตอกบัตรเข้ากะ (Shift Panel Handlers) ─────────────────
    if ([CUSTOM_IDS.SHIFT_ONLINE, CUSTOM_IDS.SHIFT_BREAK, CUSTOM_IDS.SHIFT_OFFLINE, CUSTOM_IDS.COUNSELOR_WALLET].includes(customId)) {
      const isCounselor = member?.roles?.cache?.has(COUNSELOR_ROLE_ID) ||
                          member?.roles?.cache?.has(STAFF_ROLE_ID);

      if (!isCounselor) {
        return interaction.reply({
          content: `## ⚠️︲แผงตอกบัตรนี้สำหรับทีมผู้ให้คำปรึกษาเท่านั้นค่ะ`,
          flags: FLAG_EPHEMERAL
        });
      }

      // เช็กยอดสะสม (Wallet)
      if (customId === CUSTOM_IDS.COUNSELOR_WALLET) {
        let totalSessions = 0;
        let earnings = 0.00;
        let avgRating = 5.00;

        if (supabase) {
          const { data: counselorData } = await supabase
            .from("heal_jai_counselors")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();

          if (counselorData) {
            totalSessions = counselorData.total_sessions || 0;
            earnings = counselorData.accumulated_earnings || 0.00;
            avgRating = counselorData.average_rating || 5.00;
          }
        }

        return interaction.reply({
          flags: FLAG_V2 | FLAG_EPHEMERAL,
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: [
                    `## 💼︲__\` กระเป๋าเงินและสถิติของคุณ <@${user.id}> \`__\n`,
                    `* 🍵⠀**จำนวนเซสชันที่ดูแล:** ${totalSessions} เซสชัน`,
                    `* ⭐⠀**คะแนนเฉลี่ย:** ⭐ ${avgRating} / 5.00`,
                    `* 💰⠀**รายได้สะสมรอโอน (70%):** **${earnings}** บาท\n`,
                    `-# 🕒 รอบการจ่ายเงิน: ทุกวันที่ 15 และวันสิ้นเดือน (สะสมขั้นต่ำ 100 บาท)`
                  ].join('\n')
                }
              ]
            }
          ]
        });
      }

      // สลับสถานะกะ
      let targetStatus = "OFFLINE";
      let statusLabel = "⚫ ออฟไลน์";
      let statusDesc = "คุณได้ปิดกะเรียบร้อยแล้วค่ะ ขอบคุณสำหรับการทำงานวันนี้นะคะ 🍵";

      if (customId === CUSTOM_IDS.SHIFT_ONLINE) {
        targetStatus = "ONLINE";
        statusLabel = "🟢 พร้อมรับงาน (Online)";
        statusDesc = "ตอกบัตรเข้ากะสำเร็จ! ระบบจะเริ่มส่งเคสลูกค้าให้คุณเมื่อมีออเดอร์ใหม่เข้ามาค่ะ";
      } else if (customId === CUSTOM_IDS.SHIFT_BREAK) {
        targetStatus = "BREAK";
        statusLabel = "🟡 พักเบรก (Break)";
        statusDesc = "เปลี่ยนสถานะเป็นพักเบรกชั่วคราว ระบบจะไม่จ่ายงานใหม่ให้จนกว่าคุณจะกดออนไลน์อีกครั้งค่ะ";
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

      return interaction.reply({
        flags: FLAG_V2 | FLAG_EPHEMERAL,
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

    // ── 2.7 ระบบประเมินและให้คะแนนดาว (Feedback Ratings) ────────────
    if ([CUSTOM_IDS.RATE_1, CUSTOM_IDS.RATE_2, CUSTOM_IDS.RATE_3, CUSTOM_IDS.RATE_4, CUSTOM_IDS.RATE_5].includes(customId)) {
      const scoreMap = {
        [CUSTOM_IDS.RATE_1]: 1,
        [CUSTOM_IDS.RATE_2]: 2,
        [CUSTOM_IDS.RATE_3]: 3,
        [CUSTOM_IDS.RATE_4]: 4,
        [CUSTOM_IDS.RATE_5]: 5,
      };
      const score = scoreMap[customId] || 5;

      return interaction.reply({
        content: `## <:chalkcrown:1536708801481412689>︲บันทึกคะแนน ${score} ดาวเรียบร้อยแล้วค่ะ!\nขอบคุณสำหรับคะแนนความประทับใจและกำลังใจที่มอบให้บาริสต้าหมีนะคะ 🍵`,
        flags: FLAG_EPHEMERAL
      });
    }
  });

  // ── 3. Recovery on Startup ─────────────────────────────────────────
  client.once("clientReady", async () => {
    const supabase = getSupabase();
    if (!supabase) return;

    try {
      const { data: pendingTickets } = await supabase
        .from("heal_jai_tickets")
        .select("*")
        .eq("status", "pending");

      if (!pendingTickets || pendingTickets.length === 0) return;

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
    } catch (err) {
      console.error("[HealJai] Error restoring pending tickets on startup:", err.message);
    }
  });
}

module.exports = {
  setupHealJai,
  updateOnlineCounselorsCount,
  buildAgreementPayload,
  buildMainMenuPayload,
  buildShiftPanelPayload,
  buildCheckoutTicketPayload,
  buildDispatchAlertPayload,
  buildSessionDashboardPayload,
  buildFeedbackPromptPayload,
  buildPublicReviewShowcasePayload
};
