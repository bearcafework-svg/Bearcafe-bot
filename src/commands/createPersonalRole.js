// src/commands/createPersonalRole.js
// ระบบตรวจสอบสิทธิ์และสร้างยศส่วนตัว (Create Personal Role Command)
// รองรับ Discord Component V2, การตรวจสอบระยะเวลาเข้าร่วมเซิร์ฟเวอร์, ตรวจสอบยอดโดเนทสะสมผ่าน Supabase, และปุ่มส่งแบบฟอร์มเฉพาะยูสเซอร์ที่ถูกเลือก

const { createClient } = require("@supabase/supabase-js");
const { Events } = require("discord.js");

// Discord Flags สำหรับ Component V2
const FLAG_V2 = 32768; // MessageFlags.IsComponentsV2
const FLAG_EPHEMERAL = 64; // MessageFlags.Ephemeral

// Role IDs ที่ได้รับอนุญาตให้ใช้คำสั่งนี้
const COMMAND_ALLOWED_ROLES = [
  "1144676811838599188",
  "1144696486815342673"
];

// ปุ่มคัดลอกฟอร์มมี custom_id นำหน้าด้วย string นี้
const COPY_BUTTON_PREFIX = "p_323426350025150465";

// Emojis แสดงผลเงื่อนไข
const EMOJI_PASS = "<:50121checkmark:1358584609087946867>";
const EMOJI_FAIL = "<:68440x:1358584606911369226>";

/**
 * ตรวจสอบสิทธิ์ว่าผู้ใช้มียศที่เป็นทีมงานตามที่ระบุไว้หรือไม่
 * @param {GuildMember} member 
 * @returns {boolean}
 */
function hasStaffPermission(member) {
  if (!member) return false;
  return member.roles.cache.some(role => COMMAND_ALLOWED_ROLES.includes(role.id));
}

/**
 * สร้างโครงสร้าง Component V2 สำหรับแสดงเงื่อนไขสร้างยศส่วนตัว
 * @param {string} targetUserId ID ของผู้ใช้ที่ได้รับตรวจสอบ
 * @param {boolean} has30Days ผ่านเงื่อนไข 30 วันหรือไม่
 * @param {boolean} hasDonate250 ผ่านเงื่อนไขโดเนทสะสม 250 บาทหรือไม่
 * @returns {object} Payload สำหรับส่งข้อความ
 */
function buildPersonalRoleMessage(targetUserId, has30Days, hasDonate250) {
  const emoji30Days = has30Days ? EMOJI_PASS : EMOJI_FAIL;
  const emojiDonate = hasDonate250 ? EMOJI_PASS : EMOJI_FAIL;

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
                  url: "https://cdn.discordapp.com/attachments/1524742861223100416/1525818518556250192/NewsBoard_-_bearcafe_8.png?ex=6a54c4bb&is=6a53733b&hm=6de3e3d56bc11a8f05cb277b744bf24e24383f710c9ec8f07960e3859e44e2f3&"
                }
              }
            ]
          },
          {
            type: 14,
            spacing: 2
          },
          {
            type: 10,
            content: "## <:bee20000:1256669436350562355>︲__` 𝖱𝗈𝗅𝖾 𝗌𝖾𝗍𝗎𝗉 ₊ สร้างยศส่วนตัว 𓂃 `__\n-# บูสต์ครบ 2 เม็ด รับสิทธิ์สร้าง ยศส่วนตัว ที่มีเพียงคุณเท่านั้น ออกแบบชื่อและสีให้เป็นสไตล์ของตัวเอง เพื่อความโดดเด่นภายในคาเฟ่หมี <:cuteplant:1152834055528783872>\n### <:bear_star1:1152782839671169184>︲__` คำแนะนำการสร้างยศส่วนตัว `__\n> **`1.`**⠀วิธีหาโค๊ดสี [คลิกที่นี่](https://htmlcolorcodes.com/)\n> **`2.`**⠀วิธีหาไอคอนยศ [คลิกที่นี่](https://emoji.gg/)\n> **`3.`**⠀หากไม่สามารถแท็กสมาชิกได้แจ้งเป็น UserID, Username, Nickname\n> **`4.`**⠀ชื่อยศไม่สั้นหรือยาวเกินไป ห้ามหยาบคายหรือใช้คำในทางที่ไม่เหมาะสม\n> **`5.`**⠀ไอคอนยศจะต้องเป็นอีโมจิภายในคาเฟ่หมี หรือรูปภาพสกุลไฟล์ png, jpg, jpeg เท่านั้น"
          },
          {
            type: 14,
            spacing: 2
          },
          {
            type: 10,
            content: `### <:bear_star1:1152782839671169184>︲__\`เงื่อนไขการปลดล็อก "สีชื่อใหม่"\`__\n<:line:1144701793989840997> <@${targetUserId}> กรุณาผ่าน **อย่างน้อย 1 เงื่อนไข** เพื่อรับสิทธิ์ใช้งานสีชื่อใหม่\n\n<:line:1144701793989840997> ${emoji30Days}⠀เป็นสมาชิกครบ **30 วัน**\n<:line:1144701793989840997> ${emojiDonate}⠀โดเนทครบ **250 บาทขึ้นไป**\n## ตัวอย่างสีชื่อใหม่:`
          },
          {
            type: 12,
            items: [
              {
                media: {
                  url: "https://cdn.discordapp.com/attachments/1524704267015819274/1525828421274439960/Screenshot_2026-07-12_1836262.png?ex=6a54cdf4&is=6a537c74&hm=7c9172421387aad0f038ae1f478d6eadf8398deea5bdc980b7a97d9d475b1675&"
                }
              }
            ]
          },
          {
            type: 14,
            spacing: 2
          },
          {
            type: 1,
            components: [
              {
                style: 3,
                type: 2,
                label: "คลิกคัดลอกฟอร์มสร้างยศ",
                flow: {
                  actions: []
                },
                custom_id: `${COPY_BUTTON_PREFIX}:${targetUserId}`,
                disabled: false
              }
            ]
          }
        ]
      }
    ]
  };
}

/**
 * ฟังก์ชันหลักของโมดูลสร้างยศส่วนตัว
 * @param {Client} client 
 */
function setupCreatePersonalRole(client) {
  // เริ่มการเชื่อมต่อ Supabase
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  // 1. ลงทะเบียน Slash Command เมื่อบอทพร้อม
  client.once("clientReady", async () => {
    try {
      const guildId = process.env.GUILD_ID || "1144251788493602848";
      const guild = client.guilds.cache.get(guildId) || client.guilds.cache.first();

      if (guild) {
        await guild.commands.create({
          name: "สร้างยศส่วนตัว",
          description: "ตรวจสอบสิทธิ์และส่งแบบฟอร์มสร้างยศส่วนตัวให้กับผู้ใช้ (เฉพาะทีมงาน)",
          options: [
            {
              name: "user",
              description: "เลือกผู้ใช้ที่ต้องการให้ตรวจสอบและสร้างยศส่วนตัว",
              type: 6, // USER
              required: true
            }
          ]
        });
        console.log(`[createPersonalRole] Command /สร้างยศส่วนตัว registered on guild ${guild.name}.`);
      } else {
        console.warn("[createPersonalRole] No guild found for slash command registration.");
      }
    } catch (err) {
      console.error("[createPersonalRole] Failed to register slash command:", err.message);
    }
  });

  // 2. จัดการการทำงานของ Interactions
  client.on(Events.InteractionCreate, async (interaction) => {
    // ── จัดการ Slash Command ──────────────────────────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === "สร้างยศส่วนตัว") {
      // ตรวจสอบสิทธิ์ทีมงานที่ใช้คำสั่ง
      if (!hasStaffPermission(interaction.member)) {
        return interaction.reply({
          content: "❌ ขออภัยค่ะ เฉพาะทีมงานที่ได้รับอนุญาตเท่านั้นที่สามารถใช้คำสั่งนี้ได้",
          flags: FLAG_EPHEMERAL
        });
      }

      await interaction.deferReply();

      const targetUser = interaction.options.getUser("user");
      const targetUserId = targetUser.id;

      // กู้คืน / ดึงข้อมูลสมาชิกจากเซิร์ฟเวอร์
      let member = null;
      try {
        member = await interaction.guild.members.fetch(targetUserId);
      } catch (err) {
        console.warn(`[createPersonalRole] Member ${targetUserId} not found in guild cache/fetch.`);
      }

      // ตรวจสอบเงื่อนไข 1: เป็นสมาชิกครบ 30 วัน
      let has30Days = false;
      if (member && member.joinedTimestamp) {
        const joinedDurationMs = Date.now() - member.joinedTimestamp;
        const requiredDurationMs = 30 * 24 * 60 * 60 * 1000;
        has30Days = joinedDurationMs >= requiredDurationMs;
      }

      // ตรวจสอบเงื่อนไข 2: โดเนทสะสมครบ 250 บาทขึ้นไปผ่านฐานข้อมูล Supabase
      let hasDonate250 = false;
      try {
        const { data, error } = await supabase
          .from("trading_history")
          .select("amount")
          .eq("member_id", targetUserId);

        if (error) {
          console.error(`[createPersonalRole] DB Error checking donations:`, error.message);
        } else if (data) {
          const totalAmount = data.reduce((sum, item) => sum + Number(item.amount || 0), 0);
          hasDonate250 = totalAmount >= 250;
        }
      } catch (dbErr) {
        console.error(`[createPersonalRole] Database exception:`, dbErr.message);
      }

      const payload = buildPersonalRoleMessage(targetUserId, has30Days, hasDonate250);

      try {
        await interaction.editReply(payload);
      } catch (err) {
        console.error("[createPersonalRole] Failed to reply with personal role check:", err.message);
      }
    }

    // ── จัดการการกดปุ่ม "คลิกคัดลอกฟอร์มสร้างยศ" ─────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith(`${COPY_BUTTON_PREFIX}:`)) {
      const parts = interaction.customId.split(":");
      const allowedUserId = parts[1];

      // ตรวจสอบว่าผู้ที่คลิกปุ่ม คือ สมาชิกที่ระบุในคำสั่ง (ไม่ใช่แอดมินหรือคนอื่น)
      if (interaction.user.id !== allowedUserId) {
        return interaction.reply({
          content: `❌ ขออภัยค่ะ ปุ่มนี้สามารถใช้ได้เฉพาะคุณ <@${allowedUserId}> เท่านั้นค่ะ`,
          flags: FLAG_EPHEMERAL
        });
      }

      // โคลน components เดิม และตั้งค่าให้ปุ่มเป็น disabled
      const updatedComponents = JSON.parse(JSON.stringify(interaction.message.components));
      if (updatedComponents[0] && updatedComponents[0].components) {
        const containerComponents = updatedComponents[0].components;
        for (const comp of containerComponents) {
          if (comp.type === 1 && comp.components) {
            for (const btn of comp.components) {
              if (btn.custom_id && btn.custom_id.startsWith(COPY_BUTTON_PREFIX)) {
                btn.disabled = true;
              }
            }
          }
        }
      }

      try {
        // อัปเดตข้อความเดิมเพื่อปิดการใช้งานปุ่ม
        await interaction.update({ components: updatedComponents });

        // ส่งแบบฟอร์มในช่องแชทแบบปกติเพื่อให้คัดลอกได้ง่าย
        await interaction.channel.send({
          content: `- <:bearcafe_star:1212856675053346897>︲__\` แบบฟอร์มการสร้างยศ \`__\n  - ชื่อยศ:\n  - โค๊ดสียศ:\n  - ไอคอนยศ:\n  - ต้องการเพิ่มให้:`
        });
      } catch (err) {
        console.error("[createPersonalRole] Failed to handle copy button action:", err.message);
      }
    }
  });

  console.log("[createPersonalRole] ✅ ระบบสร้างยศส่วนตัวและแบบฟอร์มพร้อมใช้งาน");
}

module.exports = { setupCreatePersonalRole };
