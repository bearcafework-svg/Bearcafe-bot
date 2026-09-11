// ===================================================
// src/features/voiceBoard/components/voiceBoardPayloads.js
// ตัวสร้าง Discord Component V2 Payloads สำหรับบอร์ดห้องเสียงหาเพื่อน (Live Voice Board)
// ===================================================

const VOICE_BOARD_CUSTOM_IDS = {
  lfgBtn: "vb_lfg_btn",
  refreshBtn: "vb_refresh_btn",
  lfgRoleSelect: "vb_lfg_role_select",
  lfgModalPrefix: "vb_lfg_modal:",
};

const DEFAULT_BANNER_URL =
  "https://cdn.discordapp.com/attachments/1524704267015819274/1532018949703729234/NewsBoard_-_bearcafe_17.png";

const LFG_ROLES = [
  {
    id: "1297492865467023381",
    name: "หาเพื่อนคุยลงห้อง",
    emoji: "🎙️",
    desc: "ชวนเปิดไมค์คุยเล่น นั่งเล่นในห้องเสียง",
  },
  {
    id: "1230902119087734844",
    name: "หาเพื่อนรับฟัง",
    emoji: "🎧",
    desc: "ต้องการเพื่อนรับฟัง ระบาย หรืออยู่เป็นเพื่อน",
  },
  {
    id: "1230902115036041280",
    name: "หาเพื่อนให้คำปรึกษา",
    emoji: "💡",
    desc: "แลกเปลี่ยนความคิดเห็นและขอคำปรึกษา",
  },
  {
    id: "1465700608920256688",
    name: "หาเพื่อนนักเรียน/นักศึกษา",
    emoji: "🎓",
    desc: "วัยเรียน ติวหนังสือ ทำการบ้านด้วยกัน",
  },
  {
    id: "1465700613064097855",
    name: "หาเพื่อนวัยทำงาน",
    emoji: "💼",
    desc: "วัยทำงาน นั่งทำงานเป็นเพื่อน พูดคุยชีวิตการทำงาน",
  },
  {
    id: "1465700617832894737",
    name: "หาเพื่อนทำกิจกรรม",
    emoji: "🎨",
    desc: "ดูหนัง แชร์เพลง สตรีมจอ เล่นกิจกรรมร่วมกัน",
  },
];

/**
 * สร้างการ์ด Component v2 Container สำหรับบอร์ดห้องเสียง (Single-Page Dashboard)
 */
function buildVoiceBoardPayload(data) {
  const {
    totalOnlineCount = 0,
    totalRoomsCount = 0,
    gameRoomsCount = 0,
    chillRoomsCount = 0,
    emptyRoomsCount = 0,
    emptyRooms = [],
    spotlight = null,
    rooms = [],
    updatedAt,
  } = data;

  const formattedTime = `<t:${Math.floor((updatedAt || Date.now()) / 1000)}:R>`;

  // 1. หัวข้อและภาพรวม (Overview)
  let overviewContent =
    `## 🐻︲__\` 𝖡𝖾𝖺𝗋 𝖢𝖺𝖿𝖾 ︲𝖫𝗂𝗏𝖾 𝖵𝗈𝗂𝖼𝖾 𝖡𝗈𝖺𝗋𝖽 𓂃 \`__\n` +
    `-# กระดานห้องเสียงเรียลไทม์ 24 ชม. แตะที่ชื่อห้องเพื่อวาร์ปเข้าห้องได้ทันทีนะคะ <:cuteplant:1152834055528783872>\n\n` +
    `> 🟢 **ออนไลน์:** \`${totalOnlineCount} คน\` (${totalRoomsCount} ห้อง)  ┆  🎮 **เกม:** \`${gameRoomsCount}\`  ┆  ☕ **ชิล:** \`${chillRoomsCount}\`  ┆  🍃 **ว่าง:** \`${emptyRoomsCount}\`\n` +
    `> ⏱️ **รอบซิงค์:** ทุก 30 วินาที  ┆  🔄 **อัปเดตล่าสุด:** ${formattedTime}\n`;

  // 2. ป้าย Spotlight Banner (ถ้ามีคนกดหาตี้)
  let spotlightContent = "";
  if (spotlight) {
    const expireText = `<t:${Math.floor(spotlight.expiresAt / 1000)}:R>`;
    spotlightContent =
      `\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
      `📢 **[SPOTLIGHT] กำลังหาเพื่อนเข้าห้อง!**\n` +
      `> 🔊 <#${spotlight.voiceChannelId}> ┆ โดย <@${spotlight.userId}> ┆ หมวด: **${spotlight.roleEmoji || "🎙️"} ${spotlight.roleName}**\n` +
      `> 💬 *"${spotlight.message}"* ┆ ⏱️ ${expireText}\n` +
      `━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n`;
  }

  // 3. แสดงรายการห้องที่มีสมาชิก (จำกัดไม่เกิน 8 ห้องเพื่อความกระชับ)
  let roomsContent = "";

  if (!rooms || rooms.length === 0) {
    roomsContent =
      `\n### 🍃︲__\` ไม่พบห้องเสียงที่กำลังออนไลน์ในขณะนี้ \`__\n` +
      `> ตอนนี้ยังไม่มีเพื่อนเปิดห้องเสียงเลยค่ะ คุณสามารถกดเข้าห้องว่างด้านล่างเพื่อเปิดโต๊ะเป็นคนแรกได้เลยนะคะ! ✨\n`;
  } else {
    const displayRooms = rooms.slice(0, 8);
    const remainingCount = rooms.length - displayRooms.length;

    const gameList = displayRooms.filter((r) => r.roomType === "game");
    const chillList = displayRooms.filter((r) => r.roomType === "chill");

    if (gameList.length > 0) {
      roomsContent += `\n### 🎮︲__\` ห้องปาร์ตี้ & เล่นเกม (Gaming) \`__\n`;
      for (const r of gameList) {
        const slotText = r.userLimit > 0 ? `${r.memberCount}/${r.userLimit}` : `${r.memberCount}/∞`;
        let badge = "";
        if (r.isFull) {
          badge = "🟥 **[เต็ม]**";
        } else if (r.availableSlots !== null && r.availableSlots > 0) {
          badge = `🟩 **[ว่าง ${r.availableSlots}]**`;
        } else if (r.isLooking) {
          badge = "🟢 **[หาตี้]**";
        }

        const gameName = r.primaryGame ? ` ┆ 🎯 \`${r.primaryGame}\`` : "";
        const streamBadge = r.isStreaming ? " 📺" : "";
        roomsContent += `> 🔊 <#${r.id}> ┆ \`👥 ${slotText}\` ${badge}${gameName}${streamBadge}\n`;
      }
    }

    if (chillList.length > 0) {
      roomsContent += `\n### ☕︲__\` ห้องพูดคุย & นั่งชิล (Chill) \`__\n`;
      for (const r of chillList) {
        const slotText = r.userLimit > 0 ? `${r.memberCount}/${r.userLimit}` : `${r.memberCount}/∞`;
        let badge = "";
        if (r.isFull) {
          badge = "🟥 **[เต็ม]**";
        } else if (r.availableSlots !== null && r.availableSlots > 0) {
          badge = `🟩 **[ว่าง ${r.availableSlots}]**`;
        } else if (r.isLooking) {
          badge = "🟢 **[ยินดีต้อนรับ]**";
        }

        const streamBadge = r.isStreaming ? " 📺" : "";
        roomsContent += `> 🔊 <#${r.id}> ┆ \`👥 ${slotText}\` ${badge}${streamBadge}\n`;
      }
    }

    if (remainingCount > 0) {
      roomsContent += `\n> -# 🍃 *ยังมีอีก **${remainingCount} ห้อง** ที่กำลังออนไลน์ในคาเฟ่*\n`;
    }
  }

  // 4. แสดงโซนห้องว่างพร้อมเปิดโต๊ะ (Available Rooms)
  let emptyRoomsContent = "";
  if (emptyRooms && emptyRooms.length > 0) {
    const pills = emptyRooms.map((r) => `🔊 <#${r.id}>`).join("  ┆  ");
    emptyRoomsContent =
      `\n### 🍃︲__\` ห้องว่างพร้อมเปิดโต๊ะ (Available Rooms) \`__\n` +
      `> ${pills}\n`;
  }

  // 5. รวม Components ทั้งหมดใน Container (Single-Page Dashboard)
  const containerComponents = [
    // รูปภาพ Banner
    {
      type: 12,
      items: [
        {
          media: {
            url: DEFAULT_BANNER_URL,
          },
          spoiler: false,
          description: null,
        },
      ],
    },
    { type: 14, spacing: 2 },
    // ข้อความบอร์ดหลัก
    {
      type: 10,
      content: overviewContent + spotlightContent + roomsContent + emptyRoomsContent,
    },
    { type: 14, spacing: 2 },
    // แถวปุ่ม Action Row: 📢 หาตี้ / เรียกเพื่อน และ 🔄 รีเฟรชข้อมูล
    {
      type: 1,
      components: [
        {
          type: 2,
          style: 1, // Primary
          custom_id: VOICE_BOARD_CUSTOM_IDS.lfgBtn,
          label: "หาตี้ / เรียกเพื่อน",
          emoji: { name: "📢" },
        },
        {
          type: 2,
          style: 2, // Secondary
          custom_id: VOICE_BOARD_CUSTOM_IDS.refreshBtn,
          label: "รีเฟรชข้อมูล",
          emoji: { name: "🔄" },
        },
      ],
    },
  ];

  return {
    flags: 32768, // Component V2 Container
    components: [
      {
        type: 17,
        components: containerComponents,
      },
    ],
  };
}

/**
 * สร้าง Ephemeral Select Menu สำหรับเลือกหมวดหมู่ยศที่ต้องการเรียกเพื่อน
 */
function buildLfgRoleSelectPayload() {
  const options = LFG_ROLES.map((role) => ({
    label: role.name,
    value: role.id,
    description: role.desc,
    emoji: { name: role.emoji },
  }));

  return {
    content: "### 📢︲__` เลือกหมวดหมู่ที่ต้องการเรียกเพื่อน `__\n> กรุณาเลือกกลุ่มยศที่ตรงกับกิจกรรมของคุณ จากนั้นจะมีแบบฟอร์มให้กรอกข้อความชวนเล่นสั้นๆ ค่ะ ✨",
    components: [
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: VOICE_BOARD_CUSTOM_IDS.lfgRoleSelect,
            placeholder: "🎯︲เลือกกลุ่มเพื่อนที่ต้องการปิงเรียก...",
            options,
          },
        ],
      },
    ],
    flags: 64, // Ephemeral
  };
}

module.exports = {
  VOICE_BOARD_CUSTOM_IDS,
  DEFAULT_BANNER_URL,
  LFG_ROLES,
  buildVoiceBoardPayload,
  buildLfgRoleSelectPayload,
};
