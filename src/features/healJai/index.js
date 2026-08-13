// src/features/healJai/index.js — ระบบบริการ HealJai (Ticket & Menu System)

const { createClient } = require("@supabase/supabase-js");
const { ChannelType, PermissionFlagsBits, MessageFlags } = require("discord.js");
const config = require("../../../config");

const FLAG_V2 = MessageFlags.IsComponentsV2 || 32768;
const FLAG_EPHEMERAL = MessageFlags.Ephemeral || 64;

const CUSTOM_IDS = {
  OPEN_MENU: "heal_jai_open_menu",
  ACCEPT_TERMS: "heal_jai_accept_terms",
  CANCEL_TICKET: "heal_jai_cancel_ticket",
};

const STAFF_ROLE_ID = (config.healJai && config.healJai.staffRoleId) || "1536208040582316032";
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
 * Payload สำหรับคำสั่ง b!reset-menu (การ์ดเลือกเมนู)
 */
function getMainMenuPayload() {
  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content:
              "## <:matchamochi:1536695320174534699>︲__` 𝖧𝗈𝗐𝟤 ₊ ขั้นตอนการใช้บริการ 𓂃 `__\n1. **เลือกเมนู:** เลือกเครื่องดื่ม (เวลา) และท็อปปิ้ง (ถ้ามี) ที่คุณต้องการ\n2. **กดเปิด Ticket:** กดปุ่มด้านล่างเพื่อเปิดห้องสนทนาส่วนตัวกับแอดมิน\n3. **ชำระเงินและรอคิว:** แอดมินจะสรุปยอดให้คุณชำระเงิน เมื่อตรวจสอบเรียบร้อย ทีมงานจะพาคุณไปพบกับผู้รับฟังทันที!\n\n> ⚠️︲**เงื่อนไขสำคัญที่ควรรู้**\n> * **การคืนเงิน:** คืนเงินเต็มจำนวน 100% หากระบบขัดข้อง, หาที่ปรึกษาให้ไม่ได้, หรือที่ปรึกษาทำผิดกฎของเซิร์ฟเวอร์\n> * **สงวนสิทธิ์ไม่คืนเงิน:** หากการสนทนาเริ่มต้นขึ้นแล้ว หรือผู้ใช้บริการใช้ถ้อยคำหยาบคาย คุกคาม และละเมิดกฎของพื้นที่ปลอดภัย ทีมงานจะยุติการสนทนาทันทีโดยไม่มีการคืนเงิน\n\n**<a:511398spin:1536700803732209736>︲ไม่รู้จะเลือกอะไร?**\nเลือกจากเวลาที่คุณอยากใช้พูดคุยได้เลย ไม่จำเป็นต้องรู้ล่วงหน้าว่าตัวเองต้องการอะไร ปล่อยให้เราดูแลคุณเองนะ!",
          },
          {
            type: 14,
            spacing: 2,
          },
          {
            type: 1,
            components: [
              {
                style: 1,
                type: 2,
                label: "︲กดเพื่อสั่งเมนู",
                emoji: {
                  id: "1536699719055839313",
                  name: "heartgreen",
                  animated: false,
                },
                custom_id: CUSTOM_IDS.OPEN_MENU,
                flow: {
                  actions: [],
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * Payload สำหรับการ์ดข้อตกลงเงื่อนไขในห้อง Ticket
 */
function getNoticePayload() {
  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 12,
            items: [
              {
                media: {
                  url: "https://cdn.discordapp.com/attachments/1536267579843280987/1537036499063676999/NewsBoard_-_bearcafe_25.png?ex=6a7d944a&is=6a7c42ca&hm=26c7309d9326e0608a2d8af78fc2679c13fee5d997c7c9a20438dee405a16dab&",
                },
              },
            ],
          },
          {
            type: 14,
            spacing: 2,
          },
          {
            type: 10,
            content:
              '### <:greenalert:1537037333847605278>︲ยืนยันการทำรายการและข้อตกลงการใช้บริการ\n-# รบกวนคุณลูกค้าตรวจสอบแพ็กเกจ และทำความเข้าใจกติกาสั้นๆ 3 ข้อนี้ก่อนชำระเงิน เพื่อให้พื้นที่นี้เป็นพื้นที่ปลอดภัยสำหรับทุกคน:\n\n**1. 💬 บริการนี้ไม่ใช่การรักษา:** เราคือพื้นที่รับฟังและให้คำแนะนำทั่วไป ไม่ใช่การบำบัดโดยแพทย์หรือผู้เชี่ยวชาญทางจิตวิทยา\n**2. 🤝 เคารพซึ่งกันและกัน:** ขอความร่วมมือสนทนาด้วยความสุภาพ **ห้ามใช้ถ้อยคำหยาบคาย คุกคาม หรือส่อไปในทางอนาจารเด็ดขาด** (หากพบการฝ่าฝืน ทีมงานขอยุติการให้บริการทันทีโดยไม่มีการคืนเงินทุกกรณี)\n**3. 🚫 นโยบายการคืนเงิน:** เมื่อชำระเงินและเริ่มการสนทนาแล้ว จะไม่สามารถขอคืนเงินได้\n\n<a:greenarrow:1537038266010837003> *หากคุณลูกค้าอ่านและตกลงตามเงื่อนไขด้านบน สามารถพิมพ์คำว่า **"ยอมรับเงื่อนไข"** ด้านล่างนี้ได้เลย จากนั้นแอดมินจะทำการเข้ามาให้บริการต่อ*',
          },
          {
            type: 14,
            spacing: 2,
          },
          {
            type: 1,
            components: [
              {
                style: 3,
                type: 2,
                flow: {
                  actions: [],
                },
                custom_id: CUSTOM_IDS.ACCEPT_TERMS,
                label: "ยอมรับเงื่อนไข",
              },
              {
                style: 4,
                type: 2,
                flow: {
                  actions: [],
                },
                custom_id: CUSTOM_IDS.CANCEL_TICKET,
                label: "ยกเลิกการทำรายการ",
              },
            ],
          },
        ],
      },
    ],
  };
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
 * หลักของฟีเจอร์ HealJai
 */
function setupHealJai(client) {
  // ── 1. ข้อความ b!reset-menu ──────────────────────────────────────
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;

    if (message.content.trim() === "b!reset-menu") {
      try {
        await message.channel.send(getMainMenuPayload());
        if (message.deletable) {
          await message.delete().catch(() => {});
        }
      } catch (err) {
        console.error("[HealJai] Error sending reset menu panel:", err.message);
      }
    }
  });

  // ── 2. Interaction Buttons ─────────────────────────────────────────
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const { customId, guild, member, user } = interaction;
    if (!Object.values(CUSTOM_IDS).includes(customId)) return;

    const supabase = getSupabase();

    // ── 2.1 กดปุ่ม "︲กดเพื่อสั่งเมนู" ──────────────────────────────
    if (customId === CUSTOM_IDS.OPEN_MENU) {
      try {
        // ตรวจสอบว่าผู้ใช้มี Ticket Pending อยู่แล้วหรือไม่
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
                // แจ้งเตือนพร้อมส่งลิงก์ห้องแบบ Ephemeral Component V2
                return interaction.reply({
                  flags: FLAG_V2 | FLAG_EPHEMERAL,
                  components: [
                    {
                      type: 17,
                      components: [
                        {
                          type: 10,
                          content: `### ⚠️︲คุณมีห้องเลือกเมนูที่กำลังดำเนินการอยู่แล้ว\nคุณมีห้องเลือกเมนูค้างไว้อยู่ สามารถกดที่ลิงก์ด้านล่างเพื่อไปยังห้องดังกล่าวเพื่อทำรายการต่อได้เลยค่ะ:\n> <https://discord.com/channels/${guild.id}/${existingCh.id}>`,
                        },
                      ],
                    },
                  ],
                });
              } else {
                // ห้องถูกลบไปแล้ว อัปเดตสถานะใน DB
                await supabase
                  .from("heal_jai_tickets")
                  .update({ status: "expired", updated_at: new Date().toISOString() })
                  .eq("id", ticket.id);
              }
            }
          }
        }

        // สร้าง Text Channel ใหม่
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

        // เพิ่มสิทธิ์ให้ staffRole
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

        // ส่ง Notice payload เข้าไปในห้องใหม่
        const noticeMsg = await newChannel.send(getNoticePayload());

        // บันทึกลง Supabase
        if (supabase) {
          await supabase.from("heal_jai_tickets").insert({
            guild_id: guild.id,
            channel_id: newChannel.id,
            user_id: user.id,
            notice_message_id: noticeMsg.id,
            status: "pending",
          });
        }

        // ตั้งเวลาลบ 15 นาที
        scheduleAutoDelete(client, newChannel.id);

        // ตอบกลับ interaction สั่งเมนูสำเร็จ
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
        if (!interaction.replied && !interaction.deferred) {
          await interaction.reply({
            content: `❌ เกิดข้อผิดพลาดในการสร้างห้อง: ${err.message}`,
            flags: FLAG_EPHEMERAL,
          });
        }
      }
      return;
    }

    // ── 2.2 กดปุ่ม "ยอมรับเงื่อนไข" ─────────────────────────────────
    if (customId === CUSTOM_IDS.ACCEPT_TERMS) {
      try {
        const channel = interaction.channel;

        // ปรับ Permission ให้ส่งข้อความได้
        await channel.permissionOverwrites.edit(user.id, {
          SendMessages: true,
          ViewChannel: true,
          ReadMessageHistory: true,
        });

        // ลบ Notice payload
        if (interaction.message && interaction.message.deletable) {
          await interaction.message.delete().catch(() => {});
        }

        // แท็ก Staff Role
        await channel.send({
          content: `<@&${STAFF_ROLE_ID}> 💖 **<@${user.id}> ยอมรับเงื่อนไขเรียบร้อยแล้วค่ะ!** ทีมงานเข้ามาดูแลได้เลยนะคะ`,
        });

        // ยกเลิก 15-min timer
        clearAutoDeleteTimer(channel.id);

        // อัปเดต DB
        if (supabase) {
          await supabase
            .from("heal_jai_tickets")
            .update({ status: "accepted", updated_at: new Date().toISOString() })
            .eq("channel_id", channel.id);
        }
      } catch (err) {
        console.error("[HealJai] Error processing accept terms:", err);
      }
      return;
    }

    // ── 2.3 กดปุ่ม "ยกเลิกการทำรายการ" ──────────────────────────────
    if (customId === CUSTOM_IDS.CANCEL_TICKET) {
      try {
        const channel = interaction.channel;

        // ยกเลิก 15-min timer
        clearAutoDeleteTimer(channel.id);

        // อัปเดต DB
        if (supabase) {
          await supabase
            .from("heal_jai_tickets")
            .update({ status: "cancelled", updated_at: new Date().toISOString() })
            .eq("channel_id", channel.id);
        }

        // ลบห้อง Text Channel
        await channel.delete("User cancelled HealJai ticket transaction");
      } catch (err) {
        console.error("[HealJai] Error cancelling ticket channel:", err);
      }
      return;
    }
  });

  // ── 3. Recovery on Startup ───────────────────────────────────────
  client.once("clientReady", async () => {
    const supabase = getSupabase();
    if (!supabase) return;

    try {
      const { data: pendingTickets, error } = await supabase
        .from("heal_jai_tickets")
        .select("*")
        .eq("status", "pending");

      if (error || !pendingTickets || pendingTickets.length === 0) return;

      console.log(`[HealJai] 🔄 Restoring ${pendingTickets.length} pending tickets timers on startup...`);

      for (const ticket of pendingTickets) {
        const channel = await client.channels.fetch(ticket.channel_id).catch(() => null);
        if (!channel) {
          await supabase
            .from("heal_jai_tickets")
            .update({ status: "expired", updated_at: new Date().toISOString() })
            .eq("id", ticket.id);
          continue;
        }

        const createdAt = new Date(ticket.created_at).getTime();
        const elapsed = Date.now() - createdAt;
        if (elapsed >= TIMEOUT_MS) {
          // หมดเวลาแล้วขณะบอทดับ → ลบห้องทันที
          await channel.delete("HealJai ticket expired during restart").catch(() => {});
          await supabase
            .from("heal_jai_tickets")
            .update({ status: "expired", updated_at: new Date().toISOString() })
            .eq("id", ticket.id);
        } else {
          // คำนวณเวลาที่เหลือแล้วตั้ง timer ใหม่
          const remaining = TIMEOUT_MS - elapsed;
          const timer = setTimeout(async () => {
            activeTimers.delete(ticket.channel_id);
            await channel.delete("HealJai ticket expired (post-restart)").catch(() => {});
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
  getMainMenuPayload,
  getNoticePayload,
};
