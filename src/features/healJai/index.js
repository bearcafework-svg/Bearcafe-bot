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
        console.log(`[HealJai] ⏰ Dispatch alert expired for order #${order.order_code}. Escalating to Owner DM and notifying customer ticket...`);

        // 1. แจ้งเตือนไปยังห้อง Dispatch
        const dispatchChannel = guild.channels.cache.get(DISPATCH_CHANNEL_ID) ||
                                await guild.channels.fetch(DISPATCH_CHANNEL_ID).catch(() => null);
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

// Memory map และค่าคงที่สำหรับเก็บห้อง Session ไว้ 24 ชั่วโมงเพื่อให้ลูกค้ารีวิว (24-Hour Retention)
const SESSION_RETENTION_MS = 24 * 60 * 60 * 1000;
const sessionRetentionTimers = new Map();

/**
 * ตั้งเวลาลบห้องสนทนาเซสชันอัตโนมัติเมื่อครบ 24 ชั่วโมง
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
          await textCh.delete("HealJai session 24-hour retention expired").catch(() => {});
        }
      }
    } catch (err) {
      console.error(`[HealJai] Error deleting text channel ${textChannelId} after 24h retention:`, err.message);
    }
  }, Math.max(remainingMs, 1000));

  sessionRetentionTimers.set(orderId, timer);
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
      name: `🎙️︰ฮีลใจ-${username}`,
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
      name: `☕︰ฮีลใจ-${username}`,
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
    await updateCounselorCardMessage(guild, order.counselor_id);
  }

  // 3. จัดการ Channel: ส่งข้อความจบเซสชัน + ส่งการ์ดประเมิน 1-5 ดาว
  const textChannelId = order.session_channel_id || order.ticket_channel_id;
  const sessionChannel = textChannelId
    ? (guild.channels.cache.get(textChannelId) || await guild.channels.fetch(textChannelId).catch(() => null))
    : null;

  if (sessionChannel) {
    const finishMessage = isEarly
      ? `## ⏹️︲ผู้รับฟังจบบริการเรียบร้อยแล้วค่ะ (ก่อนเวลา)\n> <@${order.customer_id}> <@${order.counselor_id}> ขอบคุณสำหรับช่วงเวลาอบอุ่นนี้นะคะ 🍵\n> -# สิทธิ์การส่งข้อความและการคุยเสียงถูกปิดแล้ว คุณลูกค้าสามารถคลิกให้คะแนนดาวด้านล่างได้ภายใน 24 ชั่วโมงค่ะ`
      : `## ✅︲ครบเวลาบริการแล้วค่ะ!\n> <@${order.customer_id}> <@${order.counselor_id}> เวลา **${order.duration_minutes || 30} นาที** สิ้นสุดแล้วนะคะ ขอบคุณสำหรับช่วงเวลาอบอุ่นนี้ 🍵\n> -# สิทธิ์การส่งข้อความและการคุยเสียงถูกปิดแล้ว คุณลูกค้าสามารถคลิกให้คะแนนดาวด้านล่างได้ภายใน 24 ชั่วโมงค่ะ`;

    await sessionChannel.send({ content: finishMessage }).catch(() => {});
    await sessionChannel.send(buildFeedbackPromptPayload()).catch(() => {});

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
      ? `จบบริการก่อนเวลา (Early End: true) — ล็อกห้องสนทนาและเก็บห้องไว้ 24 ชั่วโมงสำหรับการรีวิว`
      : `ครบกำหนดเวลาบริการ (Auto-Timer Expiry) — ล็อกห้องสนทนาและเก็บห้องไว้ 24 ชั่วโมงสำหรับการรีวิว`
  });

  // 6. ตั้งเวลาลบ Text Channel หลังจาก 24 ชั่วโมง (24-Hour Retention)
  if (textChannelId) {
    scheduleSessionRoomCleanup(client, guild, orderId, textChannelId, SESSION_RETENTION_MS);
  }
}

/**
 * ตั้งเวลานับถอยหลัง 3 นาทีให้ผู้รับฟังเข้าห้องและเริ่มเซสชัน (ถ้าไม่มา -> PROVIDER_NO_SHOW -> Re-dispatch)
 */
function scheduleProviderReadyTimeout(client, guild, orderId, sessionChannelId) {
  if (providerReadyTimers.has(orderId)) {
    clearTimeout(providerReadyTimers.get(orderId));
  }

  const timer = setTimeout(async () => {
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

      // ปรับสถานะเป็น PROVIDER_NO_SHOW และคืนเคส
      await supabase.from("heal_jai_orders_sessions").update({
        session_status: "PROVIDER_NO_SHOW",
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
            content: `⚠️ <@${order.customer_id}> ขออภัยค่ะ ผู้รับฟังไม่ได้เริ่มเซสชันภายใน 3 นาทีตามที่กำหนด ระบบกำลังส่งต่อเคสของคุณไปยังผู้รับฟังท่านอื่นอย่างเร่งด่วนนะคะ 🍵`
          }).catch(() => {});
        }
      }

      // ส่ง Dispatch Alert ใหม่ไปยังห้อง Dispatch
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
      console.error("[HealJai] Error during provider ready timeout:", err.message);
    }
  }, 3 * 60 * 1000);

  providerReadyTimers.set(orderId, timer);
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
        componentName = "1️⃣︰บอร์ดอ่านข้อตกลงและนโยบาย (Terms)";
        break;
      case "menu":
        payload = buildMainMenuPayload();
        componentName = "2️⃣︰บอร์ดเมนูเครื่องดื่มและสั่งบริการ (Menu)";
        break;
      case "shift":
        payload = buildShiftPanelPayload();
        componentName = "3️⃣︰แผงตอกบัตรเข้ากะของทีมงาน (Shift)";
        break;
      case "violation_history": {
        const { buildMainPanelPayload } = require("../tagWarn");
        payload = buildMainPanelPayload();
        componentName = "4️⃣︰ประวัติการทำผิดกฎ (Violation History)";
        break;
      }
      case "verify_panel": {
        const { buildRegistrationPanelPayload } = require("../verification");
        payload = buildRegistrationPanelPayload();
        componentName = "5️⃣︰บอร์ดลงทะเบียนสมาชิกใหม่ (Registration Panel)";
        break;
      }
      case "notice_panel": {
        const { buildNotificationsPanelPayload } = require("../verification");
        payload = buildNotificationsPanelPayload();
        componentName = "6️⃣︰แผงเลือกรับการแจ้งเตือน (Notifications Select)";
        break;
      }
      case "staff_welcome_msg": {
        const { buildStaffWelcomePanelPayload } = require("../verification");
        payload = buildStaffWelcomePanelPayload();
        componentName = "7️⃣︰แผงตั้งค่าข้อความต้อนรับทีมงาน (Staff Welcome Msg)";
        break;
      }
      case "top_donate": {
        const { buildTopDonateComponents } = require("../donate");
        const { createClient } = require("@supabase/supabase-js");
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
          { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
        );
        const components = await buildTopDonateComponents(targetChannel.guild, supabase);
        payload = {
          flags: 32768,
          components: [{ type: 17, components }]
        };
        componentName = "8️⃣︰กระดานยอดโดเนทสะสม (Top Donate Board)";
        break;
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
          content: `✅ ส่ง **9️⃣︰บอร์ดห้องเสียงหาเพื่อน (Voice Board)** ไปยังห้อง <#${targetChannel.id}> สำเร็จเรียบร้อยแล้วค่ะ!\n> 💡 *ระบบเริ่มทำงานและเชื่อมต่อการอัปเดตเรียลไทม์ 24 ชม. ทันที*`,
          flags: FLAG_EPHEMERAL,
        });
      }
      case "daily_quest": {
        const { getBangkokTodayDate, getNextMidnightTimestamp, getOrInitDailyQuestSet } = require("../dailyQuest/questEngine");
        const { buildDailyQuestAnnouncementPayload } = require("../dailyQuest/questPayloads");
        const { createClient } = require("@supabase/supabase-js");
        const supabase = createClient(
          process.env.SUPABASE_URL,
          process.env.SUPABASE_SERVICE_ROLE_KEY,
          { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
        );
        const todayDate = getBangkokTodayDate();
        const nextMidnightTs = getNextMidnightTimestamp();
        const quests = await getOrInitDailyQuestSet(todayDate, supabase);
        payload = buildDailyQuestAnnouncementPayload(todayDate, quests, nextMidnightTs);
        componentName = "🔟︰กระดานเควสประจำวัน (Daily Quest Board)";
        break;
      }
      case "recruitment_form": {
        const { buildMainPanel1, buildMainPanel2 } = require("../../commands/resetForm");
        payload = [buildMainPanel1(), buildMainPanel2()];
        componentName = "1️⃣1️⃣︰แผงเปิดรับสมัครทีมงาน (Recruitment Form)";
        break;
      }
      case "color_roles": {
        const { buildMainPanel } = require("../../commands/colorRoles");
        payload = buildMainPanel();
        componentName = "1️⃣2️⃣︰แผงเลือกและเปลี่ยนยศสี (Color Roles Panel)";
        break;
      }
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
            content: `✅ ส่ง **1️⃣3️⃣︰กระดานจัดอันดับหมีติดเกม (Minigame Leaderboard)** ไปยังห้อง <#${targetChannel.id}> สำเร็จเรียบร้อยแล้วค่ะ! 🏆`,
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
        componentName = "1️⃣4️⃣︰กล่องความประทับใจ (พรีวิว)";
        break;
      default:
        return interaction.reply({
          content: "❌ ไม่พบบอร์ดที่เลือกค่ะ",
          flags: FLAG_EPHEMERAL
        });
    }

    // ⚡ Defer reply ทันที เพื่อป้องกัน 10062 Unknown Interaction (เพราะส่ง Component v2 อาจใช้เวลาเกิน 3 วินาที)
    await interaction.deferReply({ flags: FLAG_EPHEMERAL }).catch(() => {});

    try {
      if (Array.isArray(payload)) {
        for (const msgPayload of payload) {
          await targetChannel.send(msgPayload);
        }
      } else {
        await targetChannel.send(payload);
      }
      return interaction.editReply({
        content: `✅ ส่ง **${componentName}** ไปยังห้อง <#${targetChannel.id}> สำเร็จเรียบร้อยแล้วค่ะ! 🍵`,
      });
    } catch (err) {
      console.error("[HealJai] Error sending component via slash command:", err);
      const errorDetail = err.rawError?.message || err.message;
      return interaction.editReply({
        content: `❌ เกิดข้อผิดพลาดในการส่งการ์ด: \`${errorDetail}\`\n-# หากเป็นปัญหาเรื่องรูปแบบ Component โปรดตรวจสอบว่าไม่มีกล่อง Media ว่าง (items: []) หรือฟิลด์ flow ที่ไม่รองรับ`,
      });
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
        content: `## <:50121checkmark:1358584609087946867>︲__\` ตรวจสอบสลิปเรียบร้อยแล้ว \`__\n✅ <@${user.id}> ระบบได้รับและตรวจสอบสลิปสำเร็จแล้วค่ะ!\n> 🍵 **กำลังค้นหาผู้รับฟังให้คุณ...** ระบบได้ส่งการ์ดแจ้งเตือนไปยังทีมงานแล้ว โปรดรอสักครู่นะคะ`
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

  // ── 1.2 ดักจับรูปภาพสลิปในห้อง Ticket (Direct Slip Upload & Auto-Verify) ────
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
      const { data: pendingOrder, error: orderQueryErr } = await supabase
        .from("heal_jai_orders_sessions")
        .select("*")
        .eq("ticket_channel_id", message.channel.id)
        .eq("payment_status", "PENDING")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (orderQueryErr) {
        console.error("[HealJai Slip] Order query error:", orderQueryErr.message);
      }

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

      console.log(`[HealJai] 📸 Detected slip image upload from <@${message.author.id}> in ticket channel <#${message.channel.id}> (${imageAttachment.url})`);

      // ใส่ Reaction เพื่อให้ผู้ใช้ทราบว่าบอทเริ่มตรวจสอบรูปภาพแล้ว
      await message.react("🔍").catch(() => {});

      const expectedAmount = pendingOrder?.total_price || 39;
      const slipResult = await verifySlipImage(imageAttachment.url, expectedAmount);

      if (slipResult.success) {
        await message.react("✅").catch(() => {});
        await processVerifiedPayment(client, message.guild, message.channel, message.author, imageAttachment.url);
      } else {
        await message.react("❌").catch(() => {});
        await message.reply({
          content: `❌ **ไม่สามารถตรวจสอบสลิปได้:** ${slipResult.message || "ยอดเงินไม่ถูกต้อง หรือสลิปไม่ถูกต้องค่ะ กรุณาลองส่งใหม่อีกครั้งนะคะ"}`
        }).catch(() => {});
      }
    } catch (err) {
      console.error("[HealJai] Error handling slip message upload:", err);
    }
  });

  // ── 1.2 Autocomplete: /บัตรพนักงาน ──────────────────────────────────────────
  registerAutocomplete("บัตรพนักงาน", async (interaction) => {
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

    // หากไม่มีใน DB ให้ดึงจากสมาชิกที่มี Role ผู้ให้คำปรึกษา
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

  // ── 2. Interaction Buttons Handler ─────────────────────────────────
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

    const { customId, guild, member, user, channel } = interaction;
    const supabase = getSupabase();

    // ── 2.0 จัดการ Select Menu (เลือกผู้รับฟัง & เลือกความถนัดเฉพาะ) ─────
    if (interaction.isStringSelectMenu()) {
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

      // จัดการเลือกความถนัดเฉพาะ (Specialties SelectMenu)
      if (customId === CUSTOM_IDS.SELECT_SPECIALTIES || customId === "heal_jai_select_specialties") {
        await interaction.deferUpdate().catch(() => {});

        const selectedValues = interaction.values || [];
        if (supabase) {
          try {
            await supabase.from("heal_jai_counselors").upsert({
              guild_id: guild.id,
              user_id: user.id,
              display_name: member?.displayName || user.username,
              specialty_tags: selectedValues,
              specialties_updated_at: new Date().toISOString(),
              updated_at: new Date().toISOString()
            }, { onConflict: "user_id" });
          } catch (e) {
            console.error("[HealJai] Failed to save counselor specialties:", e.message);
          }
        }

        await updateCounselorCardMessage(guild, user.id);

        const summaryLines = ALL_SPECIALTIES.map(s => {
          const isSelected = selectedValues.includes(s);
          return isSelected
            ? `> • (<:50121checkmark:1358584609087946867>) **${s}** \`[เลือกแล้ว]\``
            : `> • (✖) ~~${s}~~ \`[ไม่ได้เลือก]\``;
        }).join("\n");

        return interaction.editReply({
          content: [
            `### ✅︲บันทึกความถนัดเฉพาะของคุณเรียบร้อยแล้วค่ะ!`,
            `\n**สรุปสถานะความถนัดของคุณ:**`,
            summaryLines,
            `\n> 🍵 ระบบได้อัปเดตข้อมูลบนบัตรพนักงานของคุณเรียบร้อยแล้วค่ะ`,
            `> ⏳ สามารถเปลี่ยนความถนัดได้อีกครั้งในอีก 3 วันข้างหน้าค่ะ`
          ].join("\n"),
          components: []
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

      // แจ้งลูกค้าในห้อง Ticket เดิม
      if (order.ticket_channel_id) {
        const ticketCh = guild.channels.cache.get(order.ticket_channel_id) ||
                         await guild.channels.fetch(order.ticket_channel_id).catch(() => null);
        if (ticketCh) {
          await ticketCh.send({
            content: `✅ <@${order.customer_id}> ผู้รับฟัง <@${user.id}> พร้อมให้บริการแล้วค่ะ! 🍵\n> 🚪 เข้าสู่ห้องสนทนาส่วนตัวของคุณได้ที่นี่: <#${sessionChannelId}>`
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

      let order = null;
      if (supabase) {
        const { data: ord } = await supabase
          .from("heal_jai_orders_sessions")
          .select("*")
          .or(`session_channel_id.eq.${channel.id},ticket_channel_id.eq.${channel.id}`)
          .maybeSingle();
        order = ord;
      }

      if (!order) {
        return interaction.reply({
          content: "❌ ไม่พบข้อมูลเซสชันสำหรับห้องนี้ค่ะ",
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

      // เคลียร์ provider ready timer
      if (providerReadyTimers.has(order.id)) {
        clearTimeout(providerReadyTimers.get(order.id));
        providerReadyTimers.delete(order.id);
      }

      const startedAt = new Date();
      const durationMinutes = order.duration_minutes || 30;
      const expiresAt = new Date(startedAt.getTime() + durationMinutes * 60 * 1000);

      if (supabase) {
        await supabase
          .from("heal_jai_orders_sessions")
          .update({
            session_status: "IN_PROGRESS",
            started_at: startedAt.toISOString(),
            expires_at: expiresAt.toISOString(),
            updated_at: startedAt.toISOString()
          })
          .eq("id", order.id);
      }

      // เริ่ม Session Timer (แจ้งเตือน 5 นาที, 1 นาที และ Auto-Lock เมื่อครบเวลา)
      scheduleSessionTimer(client, guild, {
        ...order,
        expires_at: expiresAt.toISOString(),
        session_channel_id: order.session_channel_id || channel.id
      });

      await channel.send({
        content: `⏱️ **เซสชันสนทนาเริ่มต้นขึ้นแล้ว!** เวลาให้บริการ **${durationMinutes} นาที** ขอให้เป็นช่วงเวลาที่อบอุ่นและสบายใจนะคะ ระบบจะแจ้งเตือนเมื่อเหลือ 5 นาที / 1 นาที และปิดห้องอัตโนมัติเมื่อครบเวลาค่ะ 🍵`
      }).catch(() => {});
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
          .or(`session_channel_id.eq.${channel.id},ticket_channel_id.eq.${channel.id}`)
          .maybeSingle();
        order = ord;
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

      // แก้ไขข้อมูลส่วนตัว (Edit Profile Modal) - showModal ต้องเรียกทันทีห้าม defer
      if (customId === CUSTOM_IDS.COUNSELOR_EDIT_PROFILE) {
        let currentBio = "";
        let currentImageUrl = "";

        if (supabase) {
          const { data: counselorData } = await supabase
            .from("heal_jai_counselors")
            .select("bio, image_url")
            .eq("user_id", user.id)
            .maybeSingle();

          if (counselorData) {
            currentBio = counselorData.bio || "";
            currentImageUrl = counselorData.image_url || "";
          }
        }

        const modal = buildEditProfileModal(currentBio, currentImageUrl);
        return interaction.showModal(modal).catch(() => {});
      }

      // เลือกความถนัดเฉพาะ (Specialties SelectMenu)
      if (customId === CUSTOM_IDS.COUNSELOR_SPECIALTIES || customId === "heal_jai_counselor_specialties") {
        await interaction.deferReply({ flags: FLAG_EPHEMERAL }).catch(() => {});

        let counselorData = null;
        if (supabase) {
          const { data: cData } = await supabase
            .from("heal_jai_counselors")
            .select("*")
            .eq("user_id", user.id)
            .maybeSingle();
          counselorData = cData;
        }

        const isOwner = (process.env.OWNER_ID && user.id === process.env.OWNER_ID) ||
                        (guild && guild.ownerId === user.id);

        // ตรวจสอบคูลดาวน์การเปลี่ยน 3 วัน (72 ชม.) ยกเว้น OwnerID
        if (!isOwner && counselorData && counselorData.specialties_updated_at) {
          const lastUpdated = new Date(counselorData.specialties_updated_at).getTime();
          const COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000;
          const now = Date.now();
          if (now - lastUpdated < COOLDOWN_MS) {
            const expireTs = Math.floor((lastUpdated + COOLDOWN_MS) / 1000);
            return interaction.editReply({
              content: `### ⏳ คุณได้เลือกเปลี่ยนความถนัดไปแล้วเมื่อไม่นานมานี้ค่ะ\n> ระบบกำหนดให้สามารถเปลี่ยนความถนัดได้ทุกๆ **3 วัน**\n> คุณจะสามารถเปลี่ยนความถนัดได้อีกครั้งใน: <t:${expireTs}:R> (<t:${expireTs}:f>) 🍵`
            });
          }
        }

        const currentTags = Array.isArray(counselorData?.specialty_tags) && counselorData.specialty_tags.length > 0
          ? counselorData.specialty_tags
          : ALL_SPECIALTIES;

        const currentStatusLines = ALL_SPECIALTIES.map(s => {
          const isSelected = currentTags.includes(s);
          return isSelected
            ? `> • (<:50121checkmark:1358584609087946867>) **${s}** \`[เลือกอยู่]\``
            : `> • (✖) ~~${s}~~ \`[ยังไม่ได้เลือก]\``;
        }).join("\n");

        const selectOptions = [
          {
            label: "ปัญหาการเรียน หรือ ชีวิตวัยรุ่น",
            value: "ปัญหาการเรียน หรือ ชีวิตวัยรุ่น",
            description: currentTags.includes("ปัญหาการเรียน หรือ ชีวิตวัยรุ่น") ? "🟢 [เลือกอยู่] วัยรุ่น การเรียน เพื่อน การปรับตัว" : "⚪ [ยังไม่เลือก] วัยรุ่น การเรียน เพื่อน การปรับตัว",
            emoji: currentTags.includes("ปัญหาการเรียน หรือ ชีวิตวัยรุ่น") ? "✅" : "⚪",
            default: currentTags.includes("ปัญหาการเรียน หรือ ชีวิตวัยรุ่น")
          },
          {
            label: "ปัญหาความรัก หรือ ความสัมพันธ์",
            value: "ปัญหาความรัก หรือ ความสัมพันธ์",
            description: currentTags.includes("ปัญหาความรัก หรือ ความสัมพันธ์") ? "🟢 [เลือกอยู่] ความรัก ครอบครัว ความสัมพันธ์" : "⚪ [ยังไม่เลือก] ความรัก ครอบครัว ความสัมพันธ์",
            emoji: currentTags.includes("ปัญหาความรัก หรือ ความสัมพันธ์") ? "✅" : "⚪",
            default: currentTags.includes("ปัญหาความรัก หรือ ความสัมพันธ์")
          },
          {
            label: "ปัญหาการทำงาน หรือ เพื่อนร่วมงาน",
            value: "ปัญหาการทำงาน หรือ เพื่อนร่วมงาน",
            description: currentTags.includes("ปัญหาการทำงาน หรือ เพื่อนร่วมงาน") ? "🟢 [เลือกอยู่] หมดไฟ งาน เพื่อนร่วมงาน ความเครียด" : "⚪ [ยังไม่เลือก] หมดไฟ งาน เพื่อนร่วมงาน ความเครียด",
            emoji: currentTags.includes("ปัญหาการทำงาน หรือ เพื่อนร่วมงาน") ? "✅" : "⚪",
            default: currentTags.includes("ปัญหาการทำงาน หรือ เพื่อนร่วมงาน")
          },
          {
            label: "การพัฒนาตัวเอง หรือ ให้กำลังใจ",
            value: "การพัฒนาตัวเอง หรือ ให้กำลังใจ",
            description: currentTags.includes("การพัฒนาตัวเอง หรือ ให้กำลังใจ") ? "🟢 [เลือกอยู่] เติมพลังบวก พัฒนาตนเอง ข้อคิด" : "⚪ [ยังไม่เลือก] เติมพลังบวก พัฒนาตนเอง ข้อคิด",
            emoji: currentTags.includes("การพัฒนาตัวเอง หรือ ให้กำลังใจ") ? "✅" : "⚪",
            default: currentTags.includes("การพัฒนาตัวเอง หรือ ให้กำลังใจ")
          },
          {
            label: "ไม่เจาะจง ขอแค่เป็นพื้นที่ปลอดภัยให้ระบายความในใจ",
            value: "ไม่เจาะจง ขอแค่เป็นพื้นที่ปลอดภัยให้ระบายความในใจ",
            description: currentTags.includes("ไม่เจาะจง ขอแค่เป็นพื้นที่ปลอดภัยให้ระบายความในใจ") ? "🟢 [เลือกอยู่] รับฟังทุกเรื่อง Safe Zone" : "⚪ [ยังไม่เลือก] รับฟังทุกเรื่อง Safe Zone",
            emoji: currentTags.includes("ไม่เจาะจง ขอแค่เป็นพื้นที่ปลอดภัยให้ระบายความในใจ") ? "✅" : "⚪",
            default: currentTags.includes("ไม่เจาะจง ขอแค่เป็นพื้นที่ปลอดภัยให้ระบายความในใจ")
          }
        ];

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId(CUSTOM_IDS.SELECT_SPECIALTIES)
          .setPlaceholder("🎯 เลือกความถนัดเฉพาะของคุณ (เลือกได้ 1-5 ข้อ)")
          .setMinValues(1)
          .setMaxValues(5)
          .addOptions(selectOptions);

        const row = new ActionRowBuilder().addComponents(selectMenu);

        return interaction.editReply({
          content: [
            `### 🎯︲เลือกความถนัดเฉพาะของคุณ`,
            `> โปรดเลือกหัวข้อที่คุณถนัดและยินดีรับฟังจากเมนูด้านล่าง (เลือกได้ 1-5 ข้อ)`,
            `\n**สถานะความถนัดปัจจุบันของคุณ:**`,
            currentStatusLines,
            `\n-# ⏳ หมายเหตุ: เมื่อบันทึกแล้ว จะมีคูลดาวน์ 3 วันในการเปลี่ยนครั้งถัดไปค่ะ`
          ].join("\n"),
          components: [row]
        });
      }

      // เช็กยอดสะสม (Wallet)
      if (customId === CUSTOM_IDS.COUNSELOR_WALLET) {
        await interaction.deferReply({ flags: FLAG_EPHEMERAL }).catch(() => {});

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

        return interaction.editReply({
          flags: FLAG_V2,
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
    } catch (err) {
      console.error("[HealJai] Error restoring pending tickets or active sessions on startup:", err.message);
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
