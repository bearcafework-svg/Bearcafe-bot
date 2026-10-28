// src/commands/kumaSlashCommands.js
// รวมคำสั่ง Slash Commands ทั้งหมดของบอทคุมะ (Kuma Bot / Akari)

const { PermissionFlagsBits, ChannelType } = require("discord.js");
const { POINTS_SLASH_COMMANDS } = require("../akari/commands/pointsCommands");
const { HELP_SLASH_COMMANDS } = require("../akari/commands/helpCommands");
const { SET_SLASH_COMMAND, WELCOME_ALLOWED_GUILD_ID } = require("../akari/services/memberWelcomeService");

const AKARI_GAME_NAMES = {
  1: "🎮︲เติมคำศัพท์-ไทย",
  2: "🎮︲เติมคำศัพท์-อังกฤษ",
  3: "🎲︲สุ่มโจทย์คณิต",
  4: "💡︲ทายคำจากคำใบ้",
  5: "🔊︲ฟังเสียงตอบ-อังกฤษ",
  6: "✏️︲พิมพ์ตามคำ-ไทย",
  7: "✏️︲พิมพ์ตามคำ-อังกฤษ",
  8: "🔤︲ทายคำแปล-อังกฤษ",
  9: "🔤︲ทายคำแปล-ไทย",
  10: "🔀︲เกมต่อคำ",
  11: "🔊︲ฟังเสียงตอบ-ไทย",
  12: "⚖️︲จริงหรือเท็จ",
  13: "🧩︲เรียงประโยค-อังกฤษ",
  15: "🚩︲ทายธงประเทศ",
  16: "🔢︲นับจำนวนอีโมจิ",
};

const TEMPORARY_DISABLED_GAME_IDS = [1, 2];

// ==============================================================================
// 🐻 KUMA BOT GLOBAL SLASH COMMANDS
// ==============================================================================
const KUMA_SLASH_COMMANDS = [
  // 1. /setup-games
  {
    name: "setup-games",
    description: "ติดตั้งระบบมินิเกมอัตโนมัติ สร้างช่องและเริ่มสปอว์นโจทย์ข้อแรกทันที",
    default_member_permissions: PermissionFlagsBits.ManageChannels.toString(),
    options: [
      {
        name: "preset",
        description: "เลือกกลุ่มมินิเกมที่ต้องการเปิดใช้งาน",
        type: 3, // STRING
        required: true,
        choices: [
          { name: "🏆 ทุกมินิเกม (เปิดครบทั้ง 13 เกม)", value: "all" },
          { name: "🔥 มินิเกมยอดฮิต (Top 5 Games)", value: "popular" },
          { name: "🔤 เกมเน้นภาษาและความรู้ (Language & Quiz)", value: "language" },
        ],
      },
      {
        name: "category",
        description: "เลือก Category ที่ต้องการให้สร้างช่องมินิเกมไว้ข้างใน (หากไม่เลือกจะสร้างใหม่ให้อัตโนมัติ)",
        type: 7, // CHANNEL
        channel_types: [ChannelType.GuildCategory],
        required: false,
      },
    ],
  },

  // 2. /setting-games
  {
    name: "setting-games",
    description: "เปิด/ปิด การใช้งานมินิเกมแต่ละเกมย่อยในเซิร์ฟเวอร์",
    default_member_permissions: PermissionFlagsBits.ManageChannels.toString(),
  },

  // 3. /set-game
  {
    name: "set-game",
    description: "ผูกมินิเกมที่ต้องการลงในห้องที่ระบุ และเริ่มเล่นทันที",
    default_member_permissions: PermissionFlagsBits.ManageChannels.toString(),
    options: [
      {
        name: "game",
        description: "เลือกมินิเกมที่ต้องการผูกลงห้องนี้",
        type: 4, // INTEGER
        required: true,
        choices: Object.entries(AKARI_GAME_NAMES)
          .filter(([id]) => !TEMPORARY_DISABLED_GAME_IDS.includes(parseInt(id, 10)))
          .map(([id, name]) => ({
            name: name,
            value: parseInt(id, 10),
          })),
      },
      {
        name: "channel",
        description: "เลือกห้องข้อความที่ต้องการให้เล่นมินิเกมนี้",
        type: 7, // CHANNEL
        channel_types: [ChannelType.GuildText],
        required: true,
      },
    ],
  },

  // 4. /remove-game
  {
    name: "remove-game",
    description: "ยกเลิกการผูกมินิเกมออกจากห้อง",
    default_member_permissions: PermissionFlagsBits.ManageChannels.toString(),
    options: [
      {
        name: "game",
        description: "เลือกมินิเกมที่ต้องการยกเลิกการผูกห้อง",
        type: 4, // INTEGER
        required: true,
        autocomplete: true,
      },
    ],
  },

  // 5. /points (Points System)
  ...POINTS_SLASH_COMMANDS,

  // 6. /help (Help System)
  ...HELP_SLASH_COMMANDS,

  // 7. /ขอกำลังใจ (Healing Message)
  {
    name: "ขอกำลังใจ",
    description: "สุ่มรับข้อความและพลังบวกจากสมาชิกในคอมมูนิตี้ 🧸💛",
  },

  // 8. /set (Welcome & Goodbye System: /set welc, /set goodbye)
  SET_SLASH_COMMAND,
];

// ==============================================================================
// 🔒 GUILD-SCOPED EXCLUSIVE COMMANDS FOR KUMA BOT
// ==============================================================================
const KUMA_CLEAR_ALLOWED_GUILD_ID = "1038378858958815272";
const KUMA_CLEAR_SLASH_COMMAND = {
  name: "clear",
  description: "ลบช่องทุกประเภทภายในหมวดหมู่ที่กำหนด (เฉพาะนักพัฒนาบอท Kuma)",
  default_member_permissions: "0",
  options: [
    {
      name: "category",
      description: "เลือกหมวดหมู่ (Category) ที่ต้องการลบช่องข้างใน",
      type: 7, // CHANNEL
      channel_types: [ChannelType.GuildCategory],
      required: true,
    },
  ],
};

const KUMA_REVEAL_ALLOWED_GUILD_ID = "1493110432347459627";
const KUMA_REVEAL_SLASH_COMMAND = {
  name: "reveal-answer",
  description: "🔍 ดูเฉลยของมินิเกมที่กำลังเปิดเล่นอยู่ในห้องนี้",
  default_member_permissions: PermissionFlagsBits.ManageChannels.toString(),
};

const KUMA_STORE_ALLOWED_GUILD_ID = "1493110432347459627";
const KUMA_STORE_SLASH_COMMANDS = [
  {
    name: "setting-store",
    description: "ตั้งค่าร้านค้าแลกของรางวัลมินิเกม สูงสุด 3 รายการ (เฉพาะผู้ดูแลระบบ Premium)",
    default_member_permissions: PermissionFlagsBits.ManageChannels.toString(),
  },
  {
    name: "open-store",
    description: "เปิดหน้าร้านค้าแลกของรางวัลมินิเกมในห้องนี้ (เฉพาะผู้ดูแลระบบ Premium)",
    default_member_permissions: PermissionFlagsBits.ManageChannels.toString(),
  },
];

module.exports = {
  KUMA_SLASH_COMMANDS,
  AKARI_SLASH_COMMANDS: KUMA_SLASH_COMMANDS,
  KUMA_CLEAR_SLASH_COMMAND,
  KUMA_REVEAL_SLASH_COMMAND,
  KUMA_STORE_SLASH_COMMANDS,
  SET_SLASH_COMMAND,
  KUMA_CLEAR_ALLOWED_GUILD_ID,
  KUMA_REVEAL_ALLOWED_GUILD_ID,
  KUMA_STORE_ALLOWED_GUILD_ID,
  WELCOME_ALLOWED_GUILD_ID,
  AKARI_GAME_NAMES,
  TEMPORARY_DISABLED_GAME_IDS,
};
