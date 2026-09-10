// src/commands/slashCommandRegistry.js
// ศูนย์กลางลงทะเบียน Guild Slash Commands ทั้งหมดในคำขอเดียว (Batch Registration)
// เพิ่มความเร็วในการเริ่มต้นระบบบอท (ลดเวลารอจาก 15+ คำขอเป็น 1 คำขอเดียว)

const {
  ApplicationCommandOptionType,
  ChannelType,
  PermissionFlagsBits,
} = require("discord.js");

const GUILD_SLASH_COMMANDS = [
  // 1. /ยอดรวม (Total Amount)
  {
    name: "ยอดรวม",
    description: "คำนวณและแสดงยอดรวมสำหรับแจ้งชำระเงิน (เฉพาะทีมงาน)",
    options: [
      {
        name: "user",
        description: "เลือกผู้ใช้ที่ต้องการเรียกเก็บเงิน",
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      {
        name: "amount",
        description: "จำนวนเงินที่ต้องชำระ (1 บาทขึ้นไป)",
        type: ApplicationCommandOptionType.Integer,
        required: true,
        minValue: 1,
      },
    ],
  },

  // 2. /สร้างยศส่วนตัว (Create Personal Role)
  {
    name: "สร้างยศส่วนตัว",
    description: "ตรวจสอบสิทธิ์และส่งแบบฟอร์มสร้างยศส่วนตัวให้กับผู้ใช้ (เฉพาะทีมงาน)",
    options: [
      {
        name: "user",
        description: "เลือกผู้ใช้ที่ต้องการให้ตรวจสอบและสร้างยศส่วนตัว",
        type: ApplicationCommandOptionType.User,
        required: true,
      },
    ],
  },

  // 3. /สร้างบ้านเช่า (Create Rent House)
  {
    name: "สร้างบ้านเช่า",
    description: "สร้างห้อง Voice ส่วนตัวสำหรับสมาชิกที่ระบุ (เฉพาะทีมงาน)",
    options: [
      {
        name: "user",
        description: "เลือกสมาชิกที่ต้องการสร้างบ้านเช่าให้",
        type: ApplicationCommandOptionType.User,
        required: true,
      },
    ],
  },

  // 4. /เช็กบทบาท (Check Role)
  {
    name: "เช็กบทบาท",
    description: "ตรวจสอบและจัดการข้อมูลบทบาท (เฉพาะ Owner และทีมงาน)",
    options: [
      {
        name: "role",
        description: "เลือกบทบาทที่ต้องการตรวจสอบ",
        type: ApplicationCommandOptionType.Role,
        required: true,
      },
    ],
  },

  // 5. /สุ่มคำถาม (Random Question)
  {
    name: "สุ่มคำถาม",
    description: "สุ่มคำถามเพื่อกระชับความสัมพันธ์",
    options: [
      {
        name: "category",
        description: "เลือกหมวดหมู่คำถาม (ไม่จำเป็นต้องเลือก)",
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: [
          { name: "👤 ทั่วไป", value: "general" },
          { name: "❤️ ความรัก", value: "love" },
          { name: "🎨 ความชอบ", value: "favorites" },
          { name: "💭 มุมมอง", value: "thoughts" },
          { name: "🎲 สมมติว่า...", value: "choose" },
          { name: "😂 เรื่องฮา", value: "funny" },
          { name: "🍜 อาหาร", value: "food" },
          { name: "🎮 เกม", value: "gaming" },
          { name: "🎬 บันเทิง", value: "entertainment" },
        ],
      },
    ],
  },

  // 6. /มอบดอกไม้ (Give Flower)
  {
    name: "มอบดอกไม้",
    description: "มอบดอกไม้ให้สมาชิกที่คุณรู้สึกดีด้วย",
    options: [
      {
        name: "user",
        description: "เลือกสมาชิกที่ต้องการมอบดอกไม้ให้",
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      {
        name: "flower",
        description: "เลือกดอกไม้ที่ต้องการมอบ",
        type: ApplicationCommandOptionType.String,
        required: true,
        choices: [
          { name: "White rose (กุหลาบขาว)", value: "white_rose" },
          { name: "Lilac (ไลแลค)", value: "lilac" },
          { name: "Hydrangea (ไฮเดรนเยีย)", value: "hydrangea" },
          { name: "Lily (ลิลลี่)", value: "lily" },
          { name: "Sunflower (ทานตะวัน)", value: "sunflower" },
          { name: "Peony (พีโอนี)", value: "peony" },
          { name: "White Tulip (ทิวลิปขาว)", value: "white_tulip" },
          { name: "Daffodil (แดฟโฟดิล)", value: "daffodil" },
          { name: "Forget me not (ฟอร์เก็ตมีน็อต)", value: "forget_me_not" },
          { name: "Lavender (ลาเวนเดอร์)", value: "lavender" },
        ],
      },
    ],
  },

  // 7. /ประวัติลงห้อง (Voice History)
  {
    name: "ประวัติลงห้อง",
    description: "ตรวจสอบประวัติห้องคุยเสียงของวันนี้",
    options: [
      {
        name: "user",
        description: "เลือกสมาชิกที่ต้องการตรวจสอบ (เว้นว่างเพื่อตรวจสอบตัวเอง)",
        type: ApplicationCommandOptionType.User,
        required: false,
      },
    ],
  },

  // 8. /คัดลอกสิทธิ์หมวดหมู่ (Copy Category Perms)
  {
    name: "คัดลอกสิทธิ์หมวดหมู่",
    description: "คัดลอก Permission Overwrites จากหมวดหมู่หนึ่งไปอีกหมวดหมู่หนึ่ง (เฉพาะ Server Owner)",
    default_member_permissions: PermissionFlagsBits.ManageChannels.toString(),
    options: [
      {
        name: "source",
        description: "หมวดหมู่ต้นทางที่ต้องการคัดลอกสิทธิ์มา",
        type: ApplicationCommandOptionType.Channel,
        channel_types: [ChannelType.GuildCategory],
        required: true,
      },
      {
        name: "target",
        description: "หมวดหมู่ปลายทางที่ต้องการให้สิทธิ์เปลี่ยนตาม",
        type: ApplicationCommandOptionType.Channel,
        channel_types: [ChannelType.GuildCategory],
        required: true,
      },
      {
        name: "sync_channels",
        description: "ปรับปรุง (Sync) สิทธิ์ของช่องย่อยในหมวดหมู่ปลายทางทันทีหรือไม่ (Default: true)",
        type: ApplicationCommandOptionType.Boolean,
        required: false,
      },
    ],
  },

  // 9. /แต้มของฉัน (My Points)
  {
    name: "แต้มของฉัน",
    description: "ดูแต้มสะสมปัจจุบัน และสิทธิ์ในการแลกรางวัลต่าง ๆ",
  },

  // 10. /backup (Security Backup)
  {
    name: "backup",
    description: "สำรองโครงสร้างเซิร์ฟเวอร์เฉพาะห้องถาวร (เฉพาะ Server Owner)",
    options: [
      {
        name: "create",
        description: "สร้าง Backup ใหม่",
        type: ApplicationCommandOptionType.Subcommand,
        options: [
          {
            name: "name",
            description: "ตั้งชื่อภาพสำรองข้อมูล (Optional)",
            type: ApplicationCommandOptionType.String,
            required: false,
          },
        ],
      },
      {
        name: "list",
        description: "ดูรายการ Backup ทั้งหมด",
        type: ApplicationCommandOptionType.Subcommand,
      },
    ],
  },

  // 11. /restore (Security Restore)
  {
    name: "restore",
    description: "เรียกคืนโครงสร้างเซิร์ฟเวอร์จาก Backup ID (เฉพาะ Server Owner)",
    options: [
      {
        name: "backup_id",
        description: "ระบุ Backup ID ที่ต้องการ Restore (ดูได้จาก /backup list)",
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },

  // 12. /เปิดเกม (Minigames)
  {
    name: "เปิดเกม",
    description: "เปิดใช้งานมินิเกมประจำช่อง (สำหรับผู้ดูแลระบบ)",
    options: [
      {
        name: "เกม",
        description: "เลือกชื่อมินิเกม 1-12",
        type: ApplicationCommandOptionType.Integer,
        required: true,
        choices: [
          { name: "1. เติมคำศัพท์ (ไทย)", value: 1 },
          { name: "2. เติมคำศัพท์ (อังกฤษ)", value: 2 },
          { name: "3. สุ่มโจทย์คณิตฯ", value: 3 },
          { name: "4. ทายคำจากคำใบ้", value: 4 },
          { name: "5. ฟังเสียงแล้วพิมพ์ตอบ (อังกฤษ)", value: 5 },
          { name: "6. พิมพ์คำต่อไปนี้ (ไทย)", value: 6 },
          { name: "7. พิมพ์คำต่อไปนี้ (อังกฤษ)", value: 7 },
          { name: "8. ทายคำแปลภาษาอังกฤษ", value: 8 },
          { name: "9. ทายคำแปลภาษาไทย", value: 9 },
          { name: "10. เกมต่อคำ", value: 10 },
          { name: "11. ฟังเสียงแล้วพิมพ์ตอบ (ไทย)", value: 11 },
          { name: "12. จริงหรือเท็จ", value: 12 },
        ],
      },
    ],
  },

  // 13. /เควสของฉัน (Daily Quest)
  {
    name: "เควสของฉัน",
    description: "☕ เปิดเมนูภารกิจคาเฟ่ประจำวัน (Daily Quests)",
  },

  // 14. /gacha-bee (Bee Gacha)
  {
    name: "gacha-bee",
    description: "🐝 เปิดตู้สุ่มกาชาแต่งตัวผึ้งอ้วนและจัดการคลังชุดแต่งกาย",
  },

  // 15. /spawn_bee (Bees)
  {
    name: "spawn_bee",
    description: "[Staff Only] สุ่มหรือปล่อยเจ้าผึ้งออกมาในสวนคาเฟ่หมี",
    options: [
      {
        name: "bee_id",
        description: "ระบุตัวผึ้ง (เช่น 1, 2, 3 หรือชื่อผึ้ง / เว้นว่างเพื่อสุ่ม)",
        type: ApplicationCommandOptionType.String,
        required: false,
        autocomplete: true,
      },
      {
        name: "channel",
        description: "ห้องที่ต้องการปล่อยผึ้ง (เว้นว่างเพื่อใช้ห้องสวนผึ้งตามที่ตั้งค่าไว้)",
        type: ApplicationCommandOptionType.Channel,
        required: false,
      },
    ],
  },

  // 16. /bee_config (Bees)
  {
    name: "bee_config",
    description: "[Staff Only] ตรวจสอบและดูสถานะการตั้งค่าระบบเจ้าผึ้ง",
  },

  // 17. /test_bee (Bees)
  {
    name: "test_bee",
    description: "[Staff Only] ทดสอบระบบผึ้ง (จำลองการปล่อย หรือพรีวิวสถานะต่างๆ)",
    options: [
      {
        name: "bee_id",
        description: "เลือกผึ้งที่ต้องการทดสอบ",
        type: ApplicationCommandOptionType.String,
        required: true,
        choices: [
          { name: "1. เจ้าผึ้งอ้วนตัวกลม (fat_round_bee)", value: "fat_round_bee" },
          { name: "2. นางพญาผึ้งอ้วนตัวกลม (queen_bee)", value: "queen_bee" },
          { name: "3. เจ้าผึ้งแวมไพร์ (vampire_bee)", value: "vampire_bee" },
          { name: "4. เจ้าผึ้งสายลับ (spy_bee)", value: "spy_bee" },
          { name: "5. ผึ้งบีเรขา (math_bee)", value: "math_bee" },
        ],
      },
      {
        name: "mode",
        description: "โหมดการทดสอบ (interactive: ปล่อยให้กดจริง / preview: พรีวิวสถานะผลลัพธ์)",
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: [
          { name: "⚡ ปล่อยให้กดเล่นจริงในห้องนี้ (Interactive Spawn)", value: "spawn" },
          { name: "🖼️ พรีวิวหน้าตาทุกสถานะ (Preview All States)", value: "preview" },
        ],
      },
      {
        name: "state",
        description: "กรณีเลือกพรีวิว: เลือกระบุสถานะที่ต้องการดูตามผึ้งที่เลือก (เว้นว่างเพื่อดูทั้งหมด)",
        type: ApplicationCommandOptionType.String,
        required: false,
        autocomplete: true,
      },
    ],
  },

  // 18. /send-component (Heal Jai / Component V2 System)
  {
    name: "send-component",
    description: "[Staff Only] ส่งบอร์ดและ Component V2 ของระบบไปยังห้องที่กำหนด",
    default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
    options: [
      {
        name: "component",
        description: "เลือกบอร์ดระบบที่ต้องการส่ง",
        type: ApplicationCommandOptionType.String,
        required: true,
        choices: [
          { name: "1. บอร์ดอ่านข้อตกลงและนโยบาย (Terms)", value: "terms" },
          { name: "2. บอร์ดเมนูเครื่องดื่มและสั่งบริการ (Menu)", value: "menu" },
          { name: "3. แผงตอกบัตรเข้ากะของทีมงาน (Shift)", value: "shift" },
          { name: "7. กล่องความประทับใจ (Public Showcase Preview)", value: "feedback" },
        ],
      },
      {
        name: "channel",
        description: "เลือกห้องที่ต้องการให้ส่งการ์ดไป (เว้นว่างเพื่อส่งในห้องปัจจุบัน)",
        type: ApplicationCommandOptionType.Channel,
        channel_types: [ChannelType.GuildText],
        required: false,
      },
    ],
  },
];

/**
 * ลงทะเบียน Guild Slash Commands ทั้งหมดในครั้งเดียว (Bulk Set)
 * @param {import("discord.js").Guild} guild
 */
async function registerAllGuildCommands(guild) {
  if (!guild || !guild.commands) {
    console.warn("[slash] Cannot register guild commands: guild not provided or missing commands manager.");
    return;
  }

  try {
    const startTime = Date.now();
    const isDevMode = process.env.DEV_MODE === "true";
    let targetCommands = GUILD_SLASH_COMMANDS;

    if (isDevMode) {
      const allowedDevCommands = (process.env.DEV_SLASH_COMMANDS || "test_bee")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      targetCommands = GUILD_SLASH_COMMANDS.filter((cmd) =>
        allowedDevCommands.includes(cmd.name.toLowerCase())
      );
      console.log(
        `🛠️ [slash] DEV_MODE is active: Synchronizing only [${targetCommands.map((c) => c.name).join(", ")}] on "${guild.name}"`
      );
    }

    await guild.commands.set(targetCommands);
    const duration = Date.now() - startTime;
    console.log(
      `⚡ [slash] Synchronized ${targetCommands.length} guild slash commands on "${guild.name}" (${duration}ms)`
    );
  } catch (err) {
    console.error(`❌ [slash] Failed to bulk set slash commands on "${guild.name}":`, err.message);
  }
}

module.exports = {
  GUILD_SLASH_COMMANDS,
  registerAllGuildCommands,
};
