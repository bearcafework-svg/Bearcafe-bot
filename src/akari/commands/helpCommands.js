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
  "https://cdn.discordapp.com/attachments/1524704267015819274/1553721167796506735/BannerKuma.png?ex=6aba4719&is=6ab8f599&hm=be04ac6b06de17698bcd28c562b93e5963076716e71c9adee91d279efe01216b&";
const BOT_INVITE_URL = "https://discord.com/oauth2/authorize?client_id=1538896195253178409";
const DEVELOPER_CONTACT_URL = "https://discord.gg/EHHybsbHxD";

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
  const serverIcon =
    guild?.iconURL({ dynamic: true, size: 256 }) ||
    client.user?.displayAvatarURL({ extension: "png", size: 256 }) ||
    "https://cdn.discordapp.com/embed/avatars/0.png";

  const inviteUrl = BOT_INVITE_URL;

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
            type: 14,
            spacing: 2,
            divider: true,
          },
          {
            type: 9,
            components: [
              {
                type: 10,
                content:
                  `## ${BEE_HEADER_EMOJI} ︲__\` 𝖧𝖾𝗅𝗉 ₊ คู่มือและคำสั่งทั้งหมด 𓂃 \`__\n` +
                  `> **บอทคุมะ** บอทมินิเกมอัตโนมัติ เพิ่มสีสันและความคึกคักให้กับเซิร์ฟเวอร์ของคุณ เล่นสนุกตลอด 24 ชั่วโมง โดยไม่ต้องคอยคุมห้อง ${CUTE_PLANT_EMOJI} `,
              },
            ],
            accessory: {
              type: 11,
              media: {
                url: serverIcon,
              },
            },
          },
          {
            type: 14,
            spacing: 1,
            divider: false,
          },
          {
            type: 10,
            content:
              `### 🛠️ ︲คำสั่งตั้งค่าระบบ\n` +
              `- \`/setup-games\` — ติดตั้งหมวดหมู่และสร้างช่องมินิเกมอัตโนมัติทันที\n` +
              `- \`/setting-games\` — แผงควบคุมเปิด/ปิดมินิเกมแต่ละเกม และเมนูรีเซ็ตส่งโจทย์ข้อใหม่\n` +
              `- \`/set-game\` — ผูกมินิเกมที่ต้องการลงในห้องข้อความที่เลือก\n` +
              `- \`/remove-game\` — ยกเลิกการผูกมินิเกมออกจากห้อง\n` +
              `### 🏆 ︲ระบบคะแนนและจัดอันดับ \n` +
              `- \`/points\` — เช็กคะแนนสะสม สถิติการตอบถูก และประวัติของตนเองหรือเพื่อน\n` +
              `- \`/leaderboard\` — กระดานจัดอันดับ Top 10 ผู้เล่นคะแนนสูงสุดในเซิร์ฟเวอร์`,
          },
          {
            type: 14,
            spacing: 2,
          },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: "︲เชิญบอทฟรี",
                emoji: {
                  id: GIFT_EMOJI_ID,
                  name: "68492gift",
                  animated: false,
                },
                url: inviteUrl,
              },
              {
                type: 2,
                style: 5,
                label: "︲ติดต่อผู้พัฒนา",
                emoji: {
                  id: DEV_STAR_EMOJI_ID,
                  name: "bearcafe_star",
                  animated: false,
                },
                url: DEVELOPER_CONTACT_URL,
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
