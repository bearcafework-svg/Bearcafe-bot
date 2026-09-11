// src/main/features/healJai/index.js — ระบบบริการ Bear Cafe ฮีลใจ (Heal Jai System)
// ครอบคลุม: ข้อตกลง (Agreement), สั่งเมนู (Menu), Ticket ชำระเงิน, ตอกบัตรเข้ากะ (Shift Panel), และรีวิว (Feedback)

const { createClient } = require("@supabase/supabase-js");
const { ChannelType, PermissionFlagsBits, MessageFlags } = require("discord.js");
const config = require("../../../config");
const { registerCommand } = require("../../interactions/router");
const {
  FLAG_V2,
  FLAG_EPHEMERAL,
  buildAgreementPayload,
  buildMainMenuPayload,
  buildShiftPanelPayload,
  buildCheckoutTicketPayload,
  buildDispatchAlertPayload,
  buildSessionDashboardPayload,
  buildFeedbackPromptPayload,
  buildPublicReviewShowcasePayload
} = require("./healJaiPayloads");

const CUSTOM_IDS = {
  VIEW_FULL_TERMS: "heal_jai_view_full_terms",
  ACCEPT_TERMS: "heal_jai_accept_terms",
  OPEN_MENU: "heal_jai_open_menu",
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
const VOICE_STATS_COUNSELORS = "1545241188645470208"; // 🟢︰ผู้รับฟังพร้อมให้บริการ: X คน
const VOICE_STATS_CUPS = "1545240723958276157"; // 🍵︰เสิร์ฟความอบอุ่นไปแล้ว: X แก้ว
const PUBLIC_REVIEW_CHANNEL = "1545240537089703986"; // 🌟︰กล่องความประทับใจ

const TIMEOUT_MS = (config.healJai && config.healJai.timeoutMinutes ? config.healJai.timeoutMinutes : 15) * 60 * 1000;

let supabaseClient;
function getSupabase() {
  if (!supabaseClient && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return supabaseClient;
}

// Memory map สำหรับเก็บ 15-minute auto-expiry timers (channelId -> TimeoutHandle)
const activeTimers = new Map();

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
      await supabase
        .from("heal_jai_tickets")
        .update({ status: "expired", updated_at: new Date().toISOString() })
        .eq("channel_id", channelId)
        .catch((e) => console.error(`[HealJai] DB update error on expire:`, e.message));
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
          content: `✅ ส่ง **8️⃣︰บอร์ดห้องเสียงหาเพื่อน (Voice Board)** ไปยังห้อง <#${targetChannel.id}> สำเร็จเรียบร้อยแล้วค่ะ!\n> 💡 *ระบบเริ่มทำงานและเชื่อมต่อการอัปเดตเรียลไทม์ 24 ชม. ทันที*`,
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

  // ── 2. Interaction Buttons Handler ─────────────────────────────────
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const { customId, guild, member, user, channel } = interaction;
    const supabase = getSupabase();

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
            await supabase.from("heal_jai_consents").upsert({
              guild_id: guild.id,
              user_id: user.id,
              version: "v1.0",
              consent_type: "agreement",
              role_assigned: true,
              accepted_at: new Date().toISOString()
            }, { onConflict: "user_id" }).catch((e) => {
              console.error("[HealJai] Consent DB insert error:", e.message);
            });
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
                return interaction.reply({
                  flags: FLAG_V2 | FLAG_EPHEMERAL,
                  components: [
                    {
                      type: 17,
                      components: [
                        {
                          type: 10,
                          content: `### ⚠️︲คุณมีห้องเลือกเมนูที่กำลังดำเนินการอยู่แล้ว\nสามารถกดที่ลิงก์ด้านล่างเพื่อไปยังห้องของคุณได้เลยค่ะ:\n> <https://discord.com/channels/${guild.id}/${existingCh.id}>`,
                        },
                      ],
                    },
                  ],
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

        // ส่งการ์ดยืนยันออเดอร์และจุดชำระเงิน (Board 4)
        const checkoutMsg = await newChannel.send(buildCheckoutTicketPayload({
          packageName: "เมนูเครื่องดื่มที่คุณเลือก",
          duration: 30,
          totalPrice: 69,
          isBooster: member?.premiumSince ? true : false
        }));

        if (supabase) {
          await supabase.from("heal_jai_tickets").insert({
            guild_id: guild.id,
            channel_id: newChannel.id,
            user_id: user.id,
            notice_message_id: checkoutMsg.id,
            status: "pending",
          });
        }

        scheduleAutoDelete(client, newChannel.id);

        await interaction.reply({
          flags: FLAG_V2 | FLAG_EPHEMERAL,
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `### ☕︲เปิดห้องเลือกเมนูเรียบร้อยแล้วค่ะ\nคลิกที่ลิงก์ด้านล่างเพื่อไปยังห้องของคุณได้เลย:\n> <https://discord.com/channels/${guild.id}/${newChannel.id}>`,
                },
              ],
            },
          ],
        });
      } catch (err) {
        console.error("[HealJai] Error creating menu channel:", err);
      }
      return;
    }

    // ── 2.4 กดปุ่ม "ส่งหลักฐานชำระเงินแล้ว" ─────────────────────────
    if (customId === CUSTOM_IDS.PAID_CONFIRM) {
      try {
        await channel.send({
          content: `<@&${STAFF_ROLE_ID}> 🔔 **<@${user.id}> ได้แนบสลิปชำระเงินเรียบร้อยแล้วค่ะ!** รบกวนทีมงานเข้ามาตรวจสอบและเริ่มการจับคู่ผู้รับฟังนะคะ`
        });
        clearAutoDeleteTimer(channel.id);

        return interaction.reply({
          content: `## <:50121checkmark:1358584609087946867>︲แจ้งทีมงานเรียบร้อยแล้วค่ะ กรุณารอสักครู่นะคะ ทีมงานกำลังตรวจสอบสลิปให้ค่ะ 🍵`,
          flags: FLAG_EPHEMERAL
        });
      } catch (err) {
        console.error("[HealJai] Error in paid confirm:", err);
      }
      return;
    }

    // ── 2.5 กดปุ่ม "ยกเลิกการทำรายการ" (Cancel Ticket) ─────────────
    if (customId === CUSTOM_IDS.CANCEL_TICKET) {
      try {
        clearAutoDeleteTimer(channel.id);
        if (supabase) {
          await supabase
            .from("heal_jai_tickets")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("channel_id", channel.id);
        }
        await channel.delete("User cancelled HealJai ticket transaction");
      } catch (err) {
        console.error("[HealJai] Error cancelling ticket channel:", err);
      }
      return;
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
        await supabase.from("heal_jai_counselors").upsert({
          guild_id: guild.id,
          user_id: user.id,
          display_name: member?.displayName || user.username,
          status: targetStatus,
          last_shift_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        }, { onConflict: "user_id" }).catch((e) => {
          console.error("[HealJai] Counselor status upsert error:", e.message);
        });
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
