// ===================================================
// src/akari/commands/helpCommands.js
// ระบบแสดงคู่มือการใช้งานและคำสั่งทั้งหมดสำหรับ Kuma Bot (/help)
// รองรับ Discord Component V2 (Type 17 Container) ตามสไตล์ KUMA_COMPONENT_V2.md
// ===================================================

const { MessageFlags } = require("discord.js");

const FLAG_V2 = MessageFlags.IsComponentsV2 || 32768;

const BEE_HEADER_EMOJI = "<:bee20000:1256669436350562355>";
const CUTE_PLANT_EMOJI = "<:cuteplant:1152834055528783872>";
const GIFT_EMOJI_ID = "1276130500410605609";
const DEV_STAR_EMOJI_ID = "1212856675053346897";

const BANNER_URL =
  "https://cdn.discordapp.com/attachments/1566075967334518915/1566479361874333736/tohelp.png?ex=6ae8b117&is=6ae75f97&hm=98e249723fa6a48ce84e4a575f4929278a4e2d64e8fd0fa9a450a585e52465ae&";

const HELP_SLASH_COMMANDS = [
  {
    name: "help",
    description: "ดูคู่มือเริ่มต้นใช้งานและรายการคำสั่งทั้งหมดของบอท Kuma",
  },
];

/**
 * สร้าง Discord Component V2 Payload สำหรับคำสั่ง /help
 */
function buildHelpPayload(client, guild = null) {
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
                  url: BANNER_URL,
                },
              },
            ],
          },
          {
            type: 10,
            content:
              `## ${BEE_HEADER_EMOJI} ︲__\` 𝖧𝖾𝗅𝗉 ₊ คู่มือและคำสั่งทั้งหมด 𓂃 \`__\n` +
              `-#  บอทคุมะ บอทมินิเกมอัตโนมัติ เพิ่มสีสันและความคึกคักให้กับเซิร์ฟเวอร์ของคุณ เล่นสนุกตลอด 24 ชั่วโมง โดยไม่ต้องคอยคุมห้อง ${CUTE_PLANT_EMOJI}`,
          },
          {
            type: 14,
            spacing: 2,
            divider: true,
          },
          {
            type: 14,
            spacing: 1,
            divider: false,
          },
          {
            type: 10,
            content:
              "- **` 🎮 ระบบมินิเกม `** *!*\n" +
              "  - `/setup-games` : ติดตั้งหมวดหมู่และสร้างห้องมินิเกมอัตโนมัติทันที\n" +
              "  - `/setting-games` : แผงควบคุมเปิด/ปิดมินิเกม รีเซ็ตโจทย์ และปรับแต่งแต้มรางวัล\n" +
              "  - `/set-game` : ผูกมินิเกมที่ต้องการลงในห้องข้อความที่เลือก และเริ่มเล่นทันที\n" +
              "  - `/remove-game` : ยกเลิกการผูกมินิเกมออกจากห้อง\n\n" +
              "- **` 🏆 ระบบแต้มและจัดอันดับ `** *!*\n" +
              "  - `/points ` : ตรวจสอบคะแนนสะสม สถิติการตอบถูก และประวัติของตนเองหรือเพื่อน\n" +
              "  - `/leaderboard` : กระดานจัดอันดับ Top 10 ผู้เล่นคะแนนสูงสุดในเซิร์ฟเวอร์\n\n" +
              "- **` 👋 ระบบต้อนรับและอำลา `** *!*\n" +
              "  - `/set welc` : ตั้งค่าและปรับแต่งข้อความต้อนรับสมาชิกใหม่ (Welcome Message)\n" +
              "  - `/set goodbye` : ตั้งค่าและปรับแต่งข้อความอำลาสมาชิก (Goodbye Message)\n\n" +
              "- **` 🧸 คอมมูนิตี้และเครื่องมืออื่นๆ`** *!*\n" +
              "  - `/ขอกำลังใจ` — สุ่มรับข้อความและพลังบวกจากสมาชิกในคอมมูนิตี้\n",
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
                style: 5,
                label: "︲เข้าร่วมเซิร์ฟเวอร์บอท",
                emoji: {
                  id: "1566469689188556821",
                  name: "discordclyde",
                  animated: false,
                },
                url: "https://discord.gg/EHHybsbHxD",
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * จัดการคำสั่ง /help
 */
async function handleHelpCommand(interaction, client) {
  const payload = buildHelpPayload(client, interaction.guild);
  if (interaction.deferred || interaction.replied) {
    return await interaction.editReply(payload);
  } else {
    return await interaction.reply(payload);
  }
}

module.exports = {
  HELP_SLASH_COMMANDS,
  buildHelpPayload,
  handleHelpCommand,
};
