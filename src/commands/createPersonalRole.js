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

// ปุ่มคัดลอกฟอร์มมี custom_id นำหน้าด้วย string นี้ (เปลี่ยนจาก p_ เพื่อไม่ให้ Discohook ตีความผิดเป็น BigInt)
const COPY_BUTTON_PREFIX = "btn_copy_role_323426350025150465";

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
                  url: "https://cdn.discordapp.com/attachments/1565840974737973428/1568316579601580052/image.png?ex=6aef6022&is=6aee0ea2&hm=ee7954afbf7ecb1960c7f6d8a9e3f1e073b40fa96c407de668bc9f9cd9b02204&",
                },
              },
            ],
          },
          {
            type: 10,
            content:
              "## <:bee20000:1256669436350562355>︲__` 𝖱𝗈𝗅𝖾 𝗌𝖾𝗍𝗎𝗉 ₊ สร้างยศส่วนตัว 𓂃 `__\n" +
              "-# บูสต์ครบ 2 เม็ด รับสิทธิ์สร้างยศและห้องส่วนตัว ที่มีเพียงคุณเท่านั้น ออกแบบชื่อและสีให้เป็นสไตล์ของตัวเอง เพื่อความโดดเด่นภายในคาเฟ่หมี <:cuteplant:1152834055528783872>",
          },
          {
            type: 14,
            spacing: 2,
          },
          {
            type: 10,
            content:
              "- **` 📝 ขั้นตอนสร้างยศส่วนตัว `** *!*\n" +
              "  1. **ตั้งชื่อยศ** : ชื่อไม่ควรสั้นหรือยาวเกินไป และห้ามใช้คำหยาบหรือคำที่ไม่เหมาะสม\n" +
              "  2. **ไอคอนยศ (*ไม่จำเป็น)** : สามารถหาไอคอนได้จาก [ที่นี่](https://emoji.gg/) โดยส่งเป็น **__รูปภาพเท่านั้น__**\n" +
              "  3. **เลือกสียศ** : สามารถาหาโค้ดสีได้จาก [ที่นี่](https://kigen.design/color) ตัวอย่างการส่ง -> #FE0000\n" +
              "  4. **กดปุ่มสร้างยศ** : เมื่อเตรียมข้อมูลเรียบร้อยแล้ว กดปุ่มด้านล่างและทำตามขั้นตอนได้เลยค่ะ\n\n" +
              "- **` ✅ เงื่อนไขการปลดล็อก การไล่สี/โฮโลกราฟิก \" `** *!*\n" +
              `  - <@${targetUserId}> กรุณาผ่าน **อย่างน้อย 1 เงื่อนไข** เพื่อรับสิทธิ์ใช้งานสีชื่อใหม่\n` +
              `    - ${emoji30Days}⠀เป็นสมาชิกครบ **30 วัน**\n` +
              `    - ${emojiDonate}⠀โดเนทครบ **250 บาทขึ้นไป**`,
          },
          {
            type: 14,
            spacing: 1,
            divider: false,
          },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 3,
                custom_id: `${COPY_BUTTON_PREFIX}_${targetUserId}`,
                label: "︲คลิกสร้างยศส่วนตัว",
                emoji: {
                  name: "📃",
                },
                disabled: false,
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

  // จัดการการทำงานของ Interactions (Slash command ลงทะเบียนรวมที่ slashCommandRegistry)
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

      // ตรวจสอบเงื่อนไข 2: โดเนทสะสมครบ 250 บาทขึ้นไปผ่านฐานข้อมูล Supabase (ตารางเก่า trading_history + ตารางใหม่ orders)
      let hasDonate250 = false;
      try {
        const { data: legacyData, error: legacyError } = await supabase
          .from("trading_history")
          .select("amount")
          .eq("member_id", targetUserId);

        const { data: newOrdersData, error: newOrdersError } = await supabase
          .from("orders")
          .select("total_amount")
          .eq("member_id", targetUserId);

        if (legacyError) {
          console.error(`[createPersonalRole] DB Error checking legacy donations:`, legacyError.message);
        }
        if (newOrdersError) {
          console.error(`[createPersonalRole] DB Error checking new orders donations:`, newOrdersError.message);
        }

        const legacySum = legacyData ? legacyData.reduce((sum, item) => sum + Number(item.amount || 0), 0) : 0;
        const newOrdersSum = newOrdersData ? newOrdersData.reduce((sum, item) => sum + Number(item.total_amount || 0), 0) : 0;
        const totalAmount = legacySum + newOrdersSum;
        hasDonate250 = totalAmount >= 250;
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
    const isCopyButton =
      interaction.isButton() &&
      (interaction.customId.startsWith(`${COPY_BUTTON_PREFIX}_`) ||
        interaction.customId.startsWith(`${COPY_BUTTON_PREFIX}:`) ||
        interaction.customId.startsWith("p_323426350025150465"));

    if (isCopyButton) {
      let allowedUserId = "";
      if (interaction.customId.startsWith(`${COPY_BUTTON_PREFIX}_`)) {
        allowedUserId = interaction.customId.replace(`${COPY_BUTTON_PREFIX}_`, "");
      } else if (interaction.customId.includes(":")) {
        allowedUserId = interaction.customId.split(":")[1];
      } else {
        allowedUserId = interaction.customId.split("_").pop();
      }

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
              if (
                btn.custom_id &&
                (btn.custom_id.startsWith(COPY_BUTTON_PREFIX) ||
                  btn.custom_id.startsWith("p_323426350025150465"))
              ) {
                btn.disabled = true;
              }
            }
          }
        }
      }

      try {
        // อัปเดตข้อความเดิมเพื่อปิดการใช้งานปุ่ม
        await interaction.update({ components: updatedComponents });

        // ส่งแบบฟอร์มในช่องแชทแบบปกติเพื่อให้คัดลอกได้ง่าย พร้อมแนบ SelectMenu User
        await interaction.channel.send({
          content: `- <:bearcafe_star:1212856675053346897>︲__\` แบบฟอร์มการสร้างยศ \`__\n  - ชื่อยศ:\n  - โค๊ดสียศ:\n  - ต้องการเพิ่มให้:`,
          components: [
            {
              type: 1,
              components: [
                {
                  type: 5, // User Select Menu
                  custom_id: `select_role_members_${allowedUserId}`,
                  placeholder: "เลือกสมาชิกที่ต้องการเพิ่มยศให้...",
                  min_values: 0,
                  max_values: 25,
                },
              ],
            },
          ],
        });
      } catch (err) {
        console.error("[createPersonalRole] Failed to handle copy button action:", err.message);
      }
    }

    // ── จัดการการเลือกสมาชิกจาก SelectMenu User ──────────────────────────────
    const isUserSelect =
      (interaction.isUserSelectMenu?.() || interaction.isAnySelectMenu?.()) &&
      interaction.customId?.startsWith("select_role_members_");

    if (isUserSelect) {
      const allowedUserId = interaction.customId.replace("select_role_members_", "");

      // ตรวจสอบว่าผู้ที่เลือก คือ สมาชิกที่ได้รับสิทธิ์
      if (interaction.user.id !== allowedUserId) {
        return interaction.reply({
          content: `❌ ขออภัยค่ะ เมนูนี้สามารถใช้ได้เฉพาะคุณ <@${allowedUserId}> เท่านั้นค่ะ`,
          flags: FLAG_EPHEMERAL,
        });
      }

      try {
        await interaction.deferUpdate();
        const mentionText =
          interaction.values && interaction.values.length > 0
            ? interaction.values.map((id) => `<@${id}>`).join(", ")
            : "(นำสมาชิกออกทั้งหมดแล้ว)";

        if (interaction.channel) {
          await interaction.channel.send({
            content: `ต้องการเพิ่มให้: ${mentionText}`,
          });
        }
      } catch (err) {
        console.error("[createPersonalRole] Failed to handle user select menu action:", err.message);
      }
    }
  });

  console.log("[createPersonalRole] ✅ ระบบสร้างยศส่วนตัวและแบบฟอร์มพร้อมใช้งาน");
}

module.exports = { setupCreatePersonalRole };
