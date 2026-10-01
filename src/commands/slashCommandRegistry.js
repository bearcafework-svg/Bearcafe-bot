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
      {
        name: "theme",
        description: "เลือกธีมเพื่อสร้างห้องเสียงลงในหมวดหมู่ปลายทางทันที (ไม่เลือก = คัดลอกสิทธิ์อย่างเดียว)",
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: [
          { name: "🐻 ธีมหมี & คาเฟ่ (จำกัด 6 คน)", value: "bear_cafe" },
          { name: "🌸 ธีมดอกไม้ & ธรรมชาติ (จำกัด 7 คน)", value: "flower_nature" },
          { name: "🍑 ธีมผลไม้นุ่มฟู (จำกัด 8 คน)", value: "fruit_fluffy" },
          { name: "🥦 ธีมผักปุกปุย (จำกัด 9 คน)", value: "vegetable_fluffy" },
        ],
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
    description: "เปิดใช้งานมินิเกมในห้องนี้และบันทึกการตั้งค่า (สำหรับผู้ดูแลระบบ)",
    options: [
      {
        name: "เกม",
        description: "เลือกชื่อมินิเกม 1-13",
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
          { name: "13. เรียงประโยคภาษาอังกฤษ", value: 13 },
        ],
      },
    ],
  },

  // 13. /gacha-bee (Bee Gacha)
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
    options: [
      {
        name: "component",
        description: "เลือกบอร์ดระบบที่ต้องการส่ง",
        type: ApplicationCommandOptionType.String,
        required: true,
        choices: [
          { name: "1️⃣ บอร์ดลงทะเบียนสมาชิกใหม่ (Registration Panel)", value: "verify_panel" },
          { name: "2️⃣ แผงเลือกรับการแจ้งเตือน (Notifications Select)", value: "notice_panel" },
          { name: "3️⃣ แผงตั้งค่าข้อความต้อนรับทีมงาน (Staff Welcome Msg)", value: "staff_welcome_msg" },
          { name: "4️⃣ กระดานยอดโดเนทสะสม (Top Donate Board)", value: "top_donate" },
          { name: "5️⃣ บอร์ดห้องเสียงหาเพื่อน (Voice Board)", value: "voice_board" },
          { name: "6️⃣ กระดานเควสประจำวัน (Daily Quest Board)", value: "daily_quest" },
          { name: "7️⃣ แผงเปิดรับสมัครทีมงาน (Recruitment Form)", value: "recruitment_form" },
          { name: "8️⃣ แผงเลือกและเปลี่ยนยศสี (Color Roles Panel)", value: "color_roles" },
          { name: "9️⃣ กระดานจัดอันดับหมีติดเกม (Minigame Leaderboard)", value: "minigame_top" },
          { name: "🔟 ตู้สุ่มกาชาปอง (Gachapon Machine)", value: "gachapon" },
          { name: "1️⃣1️⃣ ประวัติการทำผิดกฎ (Violation History)", value: "violation_history" },
          { name: "1️⃣2️⃣ เควสใหญ่ (Main Community Quest)", value: "main_quest" },
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

  // 19. /healjai-admin (Heal Jai Admin Control Hub)
  {
    name: "healjai-admin",
    description: "[Admin/Staff] จัดการระบบหลังบ้าน ฮีลใจ (Heal Jai Control Hub)",
    options: [
      {
        name: "action",
        description: "เลือกการทำงานที่ต้องการ",
        type: ApplicationCommandOptionType.String,
        required: true,
        choices: [
          { name: "📊 แผงควบคุม & สรุปสถานะ (Dashboard)", value: "dashboard" },
          { name: "🛠️ สลับโหมดเปิด-ปิดบริการ (Toggle Maintenance)", value: "toggle_maintenance" },
          { name: "📜 สลับเปิด-ปิดการกดข้อตกลง (Toggle Terms Acceptance)", value: "toggle_terms" },
          { name: "🧹 เคลียร์ห้องค้างตกค้างทันที (Run Cleanup Now)", value: "run_cleanup" },
          { name: "📑 ส่งรายงานสรุปยอดวันนี้ทันที (Send Daily Report)", value: "daily_report" },
          { name: "🔍 ตรวจสอบและจัดการเคส (Manage Case)", value: "manage_case" },
        ],
      },
      {
        name: "order_code",
        description: "รหัสออเดอร์ (เช่น HJ-...) สำหรับคำสั่งจัดการเคส",
        type: ApplicationCommandOptionType.String,
        required: false,
      },
    ],
  },

  // 20. /บัตรพนักงาน (Heal Jai Counselor Card & ID Binding)
  {
    name: "บัตรพนักงาน",
    description: "[Staff Only] ส่งบัตรพนักงาน/ผู้รับฟังลงในห้อง และผูก ID สำหรับอัปเดตข้อมูลอัตโนมัติ",
    options: [
      {
        name: "พนักงาน",
        description: "เลือกรายชื่อพนักงาน/ผู้รับฟังที่มีในระบบ",
        type: ApplicationCommandOptionType.String,
        required: true,
        autocomplete: true,
      },
      {
        name: "ห้อง",
        description: "เลือกห้องที่ต้องการให้ส่งบัตรพนักงานไป (เว้นว่างเพื่อส่งในห้องปัจจุบัน)",
        type: ApplicationCommandOptionType.Channel,
        channelTypes: [ChannelType.GuildText],
        required: false,
      },
    ],
  },

  // 20.1 /แก้ไขพนักงาน (Edit Counselor Details - Staff Only)
  {
    name: "แก้ไขพนักงาน",
    description: "[Staff Only] แก้ไขข้อมูลผู้รับฟัง (ชื่อ, ความถนัด, รูปแบบบริการ, ข้อมูลส่วนตัว)",
    options: [
      {
        name: "พนักงาน",
        description: "เลือกรายชื่อพนักงาน/ผู้รับฟังที่ต้องการแก้ไข",
        type: ApplicationCommandOptionType.String,
        required: true,
        autocomplete: true,
      },
      {
        name: "ชื่อ",
        description: "ชื่อที่แสดงบนบัตรพนักงาน (Display Name)",
        type: ApplicationCommandOptionType.String,
        required: false,
      },
      {
        name: "ความถนัด",
        description: "ความถนัดเฉพาะ คั่นด้วยจุลภาค เช่น ความรัก, งาน, สุขภาพจิต, ครอบครัว, ทั่วไป",
        type: ApplicationCommandOptionType.String,
        required: false,
      },
      {
        name: "บริการ",
        description: "รูปแบบบริการที่เปิดรับ",
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: [
          { name: "🔊+💬 ทุกบริการ (คอลเสียง + พิมพ์คุย)", value: "all" },
          { name: "💬 เฉพาะพิมพ์คุย (Chat Only)", value: "chat" },
          { name: "🔊 เฉพาะคอลเสียง (Voice Only)", value: "voice" },
        ],
      },
      {
        name: "โหมดเงียบ",
        description: "เปิดรับโหมดนั่งเงียบเป็นเพื่อนหรือไม่ (true / false)",
        type: ApplicationCommandOptionType.Boolean,
        required: false,
      },
      {
        name: "คำแนะนำตัว",
        description: "ข้อความแนะนำตัวสั้นๆ (Bio)",
        type: ApplicationCommandOptionType.String,
        required: false,
      },
      {
        name: "รูปโปรไฟล์",
        description: "URL รูปภาพโปรไฟล์สำหรับแสดงบนบัตรพนักงาน",
        type: ApplicationCommandOptionType.String,
        required: false,
      },
      {
        name: "เลขบัญชี",
        description: "เลขบัญชีธนาคาร หรือ พร้อมเพย์สำหรับรับเงิน",
        type: ApplicationCommandOptionType.String,
        required: false,
      },
    ],
  },

  // 21. /อนุมัติสลิป (Approve Payment & Assign Counselor - Staff Only)
  {
    name: "อนุมัติสลิป",
    description: "[Staff Only] ตรวจสอบสลิป อนุมัติยอดชำระเงิน และเลือก/สุ่มผู้รับฟังที่ออนไลน์",
    options: [
      {
        name: "user",
        description: "เลือกลูกค้าที่ต้องการอนุมัติสลิป/เปิดเคส",
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      {
        name: "counselor",
        description: "เลือกผู้รับฟังที่ต้องการส่งเคสให้ หรือเลือก 'สุ่มผู้รับฟังที่ออนไลน์'",
        type: ApplicationCommandOptionType.String,
        required: false,
        autocomplete: true,
      },
    ],
  },

  // 22. /ยืนยันสลิป (Alias for /อนุมัติสลิป)
  {
    name: "ยืนยันสลิป",
    description: "[Staff Only] ตรวจสอบสลิป อนุมัติยอดชำระเงิน และเลือก/สุ่มผู้รับฟังที่ออนไลน์",
    options: [
      {
        name: "user",
        description: "เลือกลูกค้าที่ต้องการอนุมัติสลิป/เปิดเคส",
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      {
        name: "counselor",
        description: "เลือกผู้รับฟังที่ต้องการส่งเคสให้ หรือเลือก 'สุ่มผู้รับฟังที่ออนไลน์'",
        type: ApplicationCommandOptionType.String,
        required: false,
        autocomplete: true,
      },
    ],
  },

  // 23. /อนุมัติเควส (Approve Daily Quest - Staff Only)
  {
    name: "อนุมัติเควส",
    description: "อนุมัติเควสถ่ายรูป (IRL) ให้กับสมาชิกและมอบแต้มรางวัล (เฉพาะทีมงาน)",
    options: [
      {
        name: "user",
        description: "เลือกสมาชิกที่ต้องการอนุมัติเควสให้",
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      {
        name: "quest",
        description: "เลือกเควสถ่ายรูป IRL ประจำวัน",
        type: ApplicationCommandOptionType.String,
        required: true,
        autocomplete: true,
      },
    ],
  },

  // 24. /ย้ายคน (Move Voice Members - Owner Only)
  {
    name: "ย้ายคน",
    description: "ย้ายสมาชิกทุกคนจากห้องเสียงหนึ่งไปยังอีกห้องหนึ่ง (เฉพาะ Owner)",
    defaultMemberPermissions: PermissionFlagsBits.Administrator,
    options: [
      {
        name: "ห้องต้นทาง",
        description: "เลือกห้องเสียงต้นทางที่จะย้ายสมาชิกออกมา",
        type: ApplicationCommandOptionType.Channel,
        channelTypes: [ChannelType.GuildVoice, ChannelType.GuildStageVoice],
        required: true,
      },
      {
        name: "ห้องปลายทาง",
        description: "เลือกห้องเสียงปลายทางที่จะย้ายสมาชิกเข้าไป",
        type: ApplicationCommandOptionType.Channel,
        channelTypes: [ChannelType.GuildVoice, ChannelType.GuildStageVoice],
        required: true,
      },
    ],
  },

  // 25. /หมุนกาชา (Gachapon System)
  {
    name: "หมุนกาชา",
    description: "🎰 เปิดตู้กาชาปอง Bear Cafe สุ่มรับของรางวัลสุดพิเศษ (ใช้แต้ม Points)",
  },
];

/**
 * เปรียบเทียบชุดคำสั่งที่มีอยู่ใน Discord กับคำสั่งเป้าหมายว่าตรงกันหรือไม่
 */
function areCommandsEqual(existingCollection, targetCommands) {
  if (!existingCollection || existingCollection.size !== targetCommands.length) return false;
  for (const cmd of targetCommands) {
    const existingCmd = existingCollection.find((c) => c.name === cmd.name);
    if (!existingCmd) return false;
    const existingOpts = existingCmd.options || [];
    const targetOpts = cmd.options || [];
    if (existingOpts.length !== targetOpts.length) return false;

    for (let i = 0; i < targetOpts.length; i++) {
      const tOpt = targetOpts[i];
      const eOpt = existingOpts[i];
      if (!eOpt || tOpt.name !== eOpt.name || tOpt.type !== eOpt.type || Boolean(tOpt.required) !== Boolean(eOpt.required)) {
        return false;
      }
      const tChoices = tOpt.choices || [];
      const eChoices = eOpt.choices || [];
      if (tChoices.length !== eChoices.length) return false;
      for (let c = 0; c < tChoices.length; c++) {
        if (tChoices[c].name !== eChoices[c].name || tChoices[c].value !== eChoices[c].value) {
          return false;
        }
      }
    }
  }
  return true;
}

const SEND_COMPONENT_HEALJAI = {
  name: "send-component",
  description: "[Staff Only] ส่งบอร์ดและ Component V2 ของระบบฮิลใจ",
  options: [
    {
      name: "component",
      description: "เลือกบอร์ดระบบฮิลใจที่ต้องการส่ง",
      type: ApplicationCommandOptionType.String,
      required: true,
      choices: [
        { name: "1️⃣ บอร์ดอ่านข้อตกลงและนโยบาย (Terms)", value: "terms" },
        { name: "2️⃣ บอร์ดเมนูเครื่องดื่มและสั่งบริการ (Menu)", value: "menu" },
        { name: "3️⃣ แผงตอกบัตรเข้ากะของทีมงาน (Shift)", value: "shift" },
        { name: "4️⃣ กล่องความประทับใจ (Public Showcase Preview)", value: "feedback" },
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
};

/**
 * ลงทะเบียน Guild Slash Commands ทั้งหมดในครั้งเดียว (Bulk Set)
 * @param {import("discord.js").Guild} guild
 */
async function registerAllGuildCommands(guild) {
  if (!guild || !guild.commands) {
    console.warn("[slash] Cannot register guild commands: guild not provided or missing commands manager.");
    return;
  }

  const isDevMode = process.env.DEV_MODE === "true";
  const healJaiGuildId = process.env.HEALJAI_GUILD_ID || "1536199707922141254";

  // 🛡️ ป้องกันไม่ให้บอทหลักลงทะเบียนคำสั่งในกิลด์ HealJai เด็ดขาด
  if (!isDevMode && guild.id === healJaiGuildId) {
    console.log(`[slash] 🛑 Skipping slash command registration on HealJai Guild "${guild.name}" for Main Bot.`);
    return;
  }

  try {
    const startTime = Date.now();
    const isHealJaiGuild = guild.id === healJaiGuildId;
    let targetCommands = GUILD_SLASH_COMMANDS;

    // สลับ /send-component ให้เป็นเวอร์ชันของ HealJai เมื่อลงทะเบียนใน HealJai Guild
    if (isHealJaiGuild) {
      targetCommands = targetCommands.map((cmd) => {
        if (cmd.name === "send-component") {
          return SEND_COMPONENT_HEALJAI;
        }
        return cmd;
      });
    }

    if (isDevMode) {
      const allowedDevCommands = (process.env.DEV_SLASH_COMMANDS || "test_bee,send-component,บัตรพนักงาน,แก้ไขพนักงาน,healjai-admin,อนุมัติสลิป,ยืนยันสลิป,หมุนกาชา")
        .split(",")
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);

      targetCommands = targetCommands.filter((cmd) =>
        allowedDevCommands.includes(cmd.name.toLowerCase())
      );
      console.log(
        `🛠️ [slash] DEV_MODE is active: Synchronizing only [${targetCommands.map((c) => c.name).join(", ")}] on "${guild.name}"`
      );
    } else {
      // บอทหลัก (Production Mode) — ไม่ลงทะเบียนคำสั่งโปรเจกต์ฮีลใจเด็ดขาด (ทำงานเฉพาะบอท Dev / Secondary Bot)
      const HEALJAI_COMMANDS = ["healjai-admin", "บัตรพนักงาน", "แก้ไขพนักงาน", "ยืนยันการโอน", "ยืนยันสลิป", "อนุมัติสลิป"];
      const DEV_ONLY_COMMANDS = [...HEALJAI_COMMANDS];
      targetCommands = targetCommands.filter(
        (cmd) => !DEV_ONLY_COMMANDS.includes(cmd.name.toLowerCase())
      );
    }

    // ⚡ Smart Command Check: ตรวจสอบคำสั่งเดิมก่อน ถ้าตรงกันอยู่แล้วให้ข้ามทันทีเพื่อไม่ให้ติด 429
    const existing = await guild.commands.fetch().catch(() => null);
    if (existing && areCommandsEqual(existing, targetCommands)) {
      const duration = Date.now() - startTime;
      console.log(
        `⚡ [slash] Commands on "${guild.name}" are already up to date (${targetCommands.length} commands, ${duration}ms, skipped API call to avoid 429)`
      );
      return;
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
  areCommandsEqual,
};
