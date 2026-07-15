// src/commands/totalAmount.js
// ระบบแจ้งชำระเงินและคำนวณยอดรวม (Total Payment Command)
// รองรับ Discord Component V2, การตรวจสอบสิทธิ์เฉพาะทีมงาน, และการแก้ไขยอดเงินผ่าน Modal Form

const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  Events
} = require("discord.js");

// Discord Flags สำหรับ Component V2
const FLAG_V2 = 32768; // MessageFlags.IsComponentsV2
const FLAG_EPHEMERAL = 64; // MessageFlags.Ephemeral
const FLAG_V2_EPH = FLAG_V2 | FLAG_EPHEMERAL;

const sharedConfig = require("../sharedSettings.json");
const ALLOWED_ROLES = sharedConfig.staff_roles;

// ปุ่มแก้ไขยอดมี custom_id นำหน้าด้วย string นี้
const EDIT_BUTTON_PREFIX = "p_323352047766212615";
const EDIT_MODAL_PREFIX = "total_edit_modal";

/**
 * ตรวจสอบสิทธิ์ว่าผู้ใช้มียศที่เป็นทีมงานตามที่ระบุไว้หรือไม่
 * @param {GuildMember} member 
 * @returns {boolean}
 */
function hasStaffPermission(member) {
  if (!member) return false;
  return member.roles.cache.some(role => ALLOWED_ROLES.includes(role.id));
}

/**
 * สร้างโครงสร้าง Component V2 สำหรับแสดงยอดรวมชำระเงิน
 * @param {string} userId ID ของผู้รับการชำระเงิน
 * @param {number} amount ยอดเงินหลัก (a)
 * @param {string} channelId ID ของช่องสำหรับส่งสลิป
 * @returns {object} Payload สำหรับส่งหรือแก้ไขข้อความ
 */
function buildBillingMessage(userId, amount, channelId) {
  const a = amount;
  const b = Math.floor(amount / 100);
  const c = amount + 5;

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
                  url: "https://cdn.discordapp.com/attachments/1524704267015819274/1525746608602615838/a4707afb2279dd16.png?ex=6a5481c2&is=6a533042&hm=55ecd0221593f7424d8250e2c4de93c968722a020e8f314c0fcf22a406e3e6e7&"
                },
                spoiler: false,
                description: "สแกนฉันสิ !"
              }
            ]
          },
          {
            type: 14,
            spacing: 2
          },
          {
            type: 10,
            content: "## <:bee20000:1256669436350562355>︲__` 𝖯𝖺𝗒𝗆𝖾𝗇𝗍 𝖯𝗋𝗈𝖼𝖾𝗌𝗌 ₊ ขั้นตอนการชำระเงิน 𓂃 `__"
          },
          {
            type: 14,
            spacing: 1,
            divider: false
          },
          {
            type: 10,
            content: `- **\`อ่านก่อนชำระเงิน\`**: กรุณาตรวจสอบข้อมูลและยอดเงินให้ถูกต้องก่อนทำรายการ หากโอนเงินผิดหรือโอนเกิน ทางคาเฟ่ขอสงวนสิทธิ์ไม่รับผิดชอบในทุกกรณี\n- **\`ชำระเงินผ่านทรูมันนี่วอลเล็ท\`**: หากโอนจากบัญชีทรูมันนี่วอลเล็ท **ไปยังทรูมันนี่วอลเล็ท** จะมีค่าธรรมเนียม **+5 บาท** แต่หากชำระผ่านช่องทางอื่นที่รองรับ จะไม่มีค่าธรรมเนียมดังกล่าว <:cuteplant:1152834055528783872>\n## <a:59217leaf:1512014878796152862>⠀ยอดที่ต้องชำระ : __\`${a.toLocaleString()} บาท\`__ / <:salmon_point:1525751700399587512> +${b}\n-# แต้มสะสมทุกยอด **100 บาท รับ 1 แต้ม** สะสมไว้แลกรางวัลและสิทธิพิเศษที่จะเพิ่มเข้ามาในอนาคต <a:99322sparkles:1372427884479778908>\n\n* **\`ดำเนินการต่อ\`**: เมื่อชำระเงินเรียบร้อยแล้ว กรุณาส่ง **สลิปการโอนเงิน** ผ่านทางแชท <#${channelId}> ได้เลยค่ะ จากนั้นทีมงานจะตรวจสอบรายการและดำเนินการส่งสินค้าให้โดยเร็วที่สุด !`
          },
          {
            type: 14,
            spacing: 2
          }
        ]
      },
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `## <:Truemoneywallet:1209503992476860436>︲__\`ย้ำอีกครั้ง หากสมาชิกชำระเงินผ่าน "ทรูมันนี่วอเล็ท"\`__\n> ยอดที่ต้องชำระ : **${c.toLocaleString()} บาท (${a.toLocaleString()}+5)** <:cuteplant:1152834055528783872>\n||<@${userId}>||`
          },
          {
            type: 14,
            divider: false
          },
          {
            type: 1,
            components: [
              {
                style: 4,
                type: 2,
                flow: {
                  actions: []
                },
                custom_id: `${EDIT_BUTTON_PREFIX}:${userId}`,
                label: "แก้ไขยอด (เฉพาะทีมงาน)"
              }
            ]
          }
        ]
      }
    ]
  };
}

/**
 * ฟังก์ชันหลักของโมดูล
 * @param {Client} client 
 */
function setupTotalAmount(client) {
  // 1. ลงทะเบียน Slash Command เมื่อบอทพร้อม
  client.once("clientReady", async () => {
    try {
      const guildId = process.env.GUILD_ID || "1144251788493602848";
      const guild = client.guilds.cache.get(guildId) || client.guilds.cache.first();
      
      if (guild) {
        await guild.commands.create({
          name: "ยอดรวม",
          description: "คำนวณและแสดงยอดรวมสำหรับแจ้งชำระเงิน (เฉพาะทีมงาน)",
          options: [
            {
              name: "user",
              description: "เลือกผู้ใช้ที่ต้องการเรียกเก็บเงิน",
              type: 6, // USER
              required: true
            },
            {
              name: "amount",
              description: "จำนวนเงินที่ต้องชำระ (1 บาทขึ้นไป)",
              type: 4, // INTEGER
              required: true,
              minValue: 1
            }
          ]
        });
        console.log(`[totalAmount] Command /ยอดรวม registered on guild ${guild.name} (${guild.id}).`);
      } else {
        console.warn("[totalAmount] No guild found for slash command registration.");
      }
    } catch (err) {
      console.error("[totalAmount] Failed to register slash command:", err.message);
    }
  });

  // 2. จัดการการทำงานของ Interactions
  client.on(Events.InteractionCreate, async (interaction) => {
    // ── จัดการ Slash Command ──────────────────────────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === "ยอดรวม") {
      // ตรวจสอบสิทธิ์ทีมงาน
      if (!hasStaffPermission(interaction.member)) {
        return interaction.reply({
          content: "❌ ขออภัยค่ะ เฉพาะทีมงานที่ได้รับอนุญาตเท่านั้นที่สามารถใช้คำสั่งนี้ได้",
          flags: FLAG_EPHEMERAL
        });
      }

      const targetUser = interaction.options.getUser("user");
      const amount = interaction.options.getInteger("amount");

      const billingPayload = buildBillingMessage(targetUser.id, amount, interaction.channelId);
      
      try {
        await interaction.reply(billingPayload);
      } catch (err) {
        console.error("[totalAmount] Failed to reply with billing payload:", err.message);
      }
    }

    // ── จัดการการกดปุ่มแก้ไขยอด ─────────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith(`${EDIT_BUTTON_PREFIX}:`)) {
      // ตรวจสอบสิทธิ์ทีมงาน
      if (!hasStaffPermission(interaction.member)) {
        return interaction.reply({
          content: "❌ ขออภัยค่ะ เฉพาะทีมงานที่มีส่วนเกี่ยวข้องเท่านั้นที่จะสามารถแก้ไขยอดได้",
          flags: FLAG_EPHEMERAL
        });
      }

      const parts = interaction.customId.split(":");
      const targetUserId = parts[1];

      // สร้างฟอร์ม Modal สำหรับกรอกยอดเงินใหม่
      const modal = new ModalBuilder()
        .setCustomId(`${EDIT_MODAL_PREFIX}:${targetUserId}`)
        .setTitle("แก้ไขยอดเงินชำระ");

      const amountInput = new TextInputBuilder()
        .setCustomId("new_amount")
        .setLabel("ยอดเงินใหม่ (บาท)")
        .setStyle(TextInputStyle.Short)
        .setPlaceholder("ตัวอย่าง: 100")
        .setRequired(true)
        .setMinLength(1);

      const actionRow = new ActionRowBuilder().addComponents(amountInput);
      modal.addComponents(actionRow);

      try {
        await interaction.showModal(modal);
      } catch (err) {
        console.error("[totalAmount] Failed to show modal:", err.message);
      }
    }

    // ── จัดการเมื่อยื่นข้อมูลจาก Modal ──────────────────────────────────────
    if (interaction.isModalSubmit() && interaction.customId.startsWith(`${EDIT_MODAL_PREFIX}:`)) {
      // ตรวจสอบสิทธิ์ทีมงาน
      if (!hasStaffPermission(interaction.member)) {
        return interaction.reply({
          content: "❌ ขออภัยค่ะ เฉพาะทีมงานที่มีส่วนเกี่ยวข้องเท่านั้นที่จะสามารถแก้ไขยอดได้",
          flags: FLAG_EPHEMERAL
        });
      }

      const parts = interaction.customId.split(":");
      const targetUserId = parts[1];

      const newAmountStr = interaction.fields.getTextInputValue("new_amount");
      const newAmount = parseInt(newAmountStr.trim(), 10);

      if (isNaN(newAmount) || newAmount < 1) {
        return interaction.reply({
          content: "❌ กรุณากรอกจำนวนเงินเป็นตัวเลขจำนวนเต็มที่มากกว่าหรือเท่ากับ 1 ค่ะ",
          flags: FLAG_EPHEMERAL
        });
      }

      const updatedPayload = buildBillingMessage(targetUserId, newAmount, interaction.channelId);

      try {
        await interaction.update(updatedPayload);
      } catch (err) {
        console.error("[totalAmount] Failed to update billing components after modal submit:", err.message);
      }
    }
  });

  console.log("[totalAmount] ✅ ระบบคำนวณยอดชำระและแก้ไขยอดพร้อมใช้งาน");
}

module.exports = { setupTotalAmount };
