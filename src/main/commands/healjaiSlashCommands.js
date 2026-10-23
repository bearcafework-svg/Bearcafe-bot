// src/main/commands/healjaiSlashCommands.js
// รวมคำสั่ง Slash Commands ทั้งหมดของเซิร์ฟเวอร์ ฮีลใจ (Heal Jai) และคำสั่ง Dev Sandbox

const {
  ApplicationCommandOptionType,
  ChannelType,
} = require("discord.js");

// ==============================================================================
// 💚 HEAL JAI GUILD EXCLUSIVE SLASH COMMANDS (เซิร์ฟเวอร์ฮิลใจเท่านั้น)
// ==============================================================================
const HEAL_JAI_SLASH_COMMANDS = [
  // 1. /heal-component (Heal Jai Component V2 System)
  {
    name: "heal-component",
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
        channelTypes: [ChannelType.GuildText],
        required: false,
      },
    ],
  },

  // 2. /อนุมัติสลิป (Approve Payment & Assign Counselor - Staff Only)
  {
    name: "อนุมัติสลิป",
    description: "[Staff Only] ตรวจสอบสลิป อนุมัติยอดชำระเงิน และเลือกผู้รับฟังที่ออนไลน์",
    options: [
      {
        name: "user",
        description: "เลือกลูกค้าที่ต้องการอนุมัติสลิป/เปิดเคส",
        type: ApplicationCommandOptionType.User,
        required: true,
      },
      {
        name: "counselor",
        description: "เลือกผู้รับฟังที่ออนไลน์เพื่อมอบหมายเคส",
        type: ApplicationCommandOptionType.String,
        required: true,
        autocomplete: true,
      },
    ],
  },

  // 3. /บัตรพนักงาน (Heal Jai Counselor Card & ID Binding)
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

  // 4. /แก้ไขพนักงาน (Edit Counselor Details - Staff Only)
  {
    name: "แก้ไขพนักงาน",
    description: "[Staff Only] เปิดเมนูปรับแต่งข้อมูลผู้รับฟังและบัตรพนักงาน (Interactive UI)",
    options: [
      {
        name: "พนักงาน",
        description: "เลือกรายชื่อพนักงาน/ผู้รับฟังที่ต้องการแก้ไข (หรือเว้นว่างเพื่อเลือกจากเมนู)",
        type: ApplicationCommandOptionType.User,
        required: false,
      },
    ],
  },

  // 5. /healjai-admin (Heal Jai Admin Control Hub)
  {
    name: "healjai-admin",
    description: "[Admin/Staff] จัดการระบบหลังบ้าน ฮีลใจ (Heal Jai Control Hub)",
    options: [
      {
        name: "action",
        description: "เลือกการทำงานที่ต้องการ (เว้นว่างไว้เพื่อเปิด Button Menu Dashboard)",
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: [
          { name: "📊 แผงควบคุม & สรุปสถานะ (Dashboard)", value: "dashboard" },
          { name: "⏱️ เพิ่ม/ขยายเวลาเคสลูกค้า (Extend Case Time)", value: "extend_time" },
          { name: "🛠️ สลับโหมดเปิด-ปิดบริการ (Toggle Maintenance)", value: "toggle_maintenance" },
          { name: "📜 สลับเปิด-ปิดการกดข้อตกลง (Toggle Terms Acceptance)", value: "toggle_terms" },
          { name: "🧹 เคลียร์ห้องค้างตกค้างทันที (Run Cleanup Now)", value: "run_cleanup" },
          { name: "📁 ย้ายห้องตั๋วไปรอบันทึกสลิป (Archive Ticket to Slips)", value: "archive_ticket" },
          { name: "📑 ส่งรายงานสรุปยอดวันนี้ทันที (Send Daily Report)", value: "daily_report" },
          { name: "🔍 ตรวจสอบและจัดการเคส (Manage Case)", value: "manage_case" },
          { name: "⭐ ปรับสถิติที่ปรึกษา (Adjust Counselor Stats)", value: "adjust_counselor_stats" },
        ],
      },
      {
        name: "minutes",
        description: "จำนวนนาทีที่ต้องการเพิ่มให้เคส (เช่น 15, 30, 60 หรือระบุเองตามใจชอบ)",
        type: ApplicationCommandOptionType.Integer,
        required: false,
        minValue: 1,
        maxValue: 480,
      },
      {
        name: "order_code",
        description: "รหัสออเดอร์ (เช่น HJ-...) สำหรับคำสั่งจัดการเคส/เพิ่มเวลา",
        type: ApplicationCommandOptionType.String,
        required: false,
      },
      {
        name: "customer",
        description: "เลือกลูกค้าเจ้าของเคสที่ต้องการเพิ่มเวลา",
        type: ApplicationCommandOptionType.User,
        required: false,
      },
      {
        name: "reason",
        description: "เหตุผลหรือบันทึกเพิ่มเติมในการเพิ่มเวลา (ไม่บังคับ)",
        type: ApplicationCommandOptionType.String,
        required: false,
      },
      {
        name: "counselor",
        description: "เลือกที่ปรึกษา/ผู้รับฟังที่ต้องการปรับสถิติ",
        type: ApplicationCommandOptionType.User,
        required: false,
      },
      {
        name: "sessions",
        description: "ปรับจำนวนบริการสำเร็จ (เช่น +1, -1 หรือระบุตัวเลข)",
        type: ApplicationCommandOptionType.Integer,
        required: false,
      },
      {
        name: "reviews",
        description: "ปรับจำนวนรีวิว (เช่น +1, -1 หรือระบุตัวเลข)",
        type: ApplicationCommandOptionType.Integer,
        required: false,
      },
      {
        name: "rating",
        description: "กำหนดคะแนนเฉลี่ยใหม่ (1.00 - 5.00) (ไม่บังคับ)",
        type: ApplicationCommandOptionType.Number,
        required: false,
      },
      {
        name: "mode",
        description: "โหมดการปรับ: เพิ่ม/ลด จากค่าเดิม (Add/Sub) หรือ กำหนดค่าใหม่ตรงๆ (Set)",
        type: ApplicationCommandOptionType.String,
        required: false,
        choices: [
          { name: "➕ เพิ่ม/ลด จากค่าปัจจุบัน (Add / Subtract)", value: "add" },
          { name: "✏️ กำหนดค่าใหม่ตรงๆ (Set Exact Value)", value: "set" },
        ],
      },
    ],
  },

  // 6. /จบเคส (End Case - Counselor & Staff)
  {
    name: "จบเคส",
    description: "[ผู้รับฟัง/แอดมิน] สิ้นสุดการให้บริการเคส ส่งการ์ดรีวิว และจัดเก็บห้อง",
    options: [
      {
        name: "order_code",
        description: "รหัสออเดอร์ (เช่น HJ-...) (เว้นว่างได้หากพิมพ์ในห้องเคสโดยตรง)",
        type: ApplicationCommandOptionType.String,
        required: false,
      },
      {
        name: "note",
        description: "บันทึกเพิ่มเติมจากผู้รับฟัง (ไม่บังคับ)",
        type: ApplicationCommandOptionType.String,
        required: false,
      },
    ],
  },
];

const DEV_ONLY_SLASH_COMMANDS = [
  {
    name: "clear",
    description: "🧹 [Admin/Dev] ลบข้อความตามจำนวนที่ต้องการในห้อง (1-100)",
    options: [
      {
        name: "amount",
        description: "จำนวนข้อความที่ต้องการลบ (1-100 ข้อความ)",
        type: ApplicationCommandOptionType.Integer,
        required: true,
        minValue: 1,
        maxValue: 100,
      },
    ],
  },
];

module.exports = {
  HEAL_JAI_SLASH_COMMANDS,
  DEV_ONLY_SLASH_COMMANDS,
};
