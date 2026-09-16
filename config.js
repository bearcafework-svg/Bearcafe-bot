// ===================================================
// config.js — ตั้งค่าโซนและห้องทั้งหมดที่นี่
// ===================================================

module.exports = {
  // Guild IDs ประจำแต่ละโปรเจกต์
  bearCafeGuildId: process.env.GUILD_ID || "1144251788493602848",

  // ตั้งค่าสำหรับระบบ HealJai (ฮิลใจ)
  healJai: {
    guildId: process.env.HEALJAI_GUILD_ID || "1536199707922141254",
    staffRoleId: "1536208040582316032",
    timeoutMinutes: 15,
  },

  // ไม่อยากให้ห้องว่างนานเกินกี่นาทีก่อนลบ
  emptyTimeoutMinutes: 2,

  // ตรวจสอบห้องว่างทุกกี่วินาที
  monitorIntervalSeconds: 60,

  // จำนวนคนสูงสุดต่อห้อง (soft cap)
  softCap: 10,

  // Category ID สำหรับห้องที่บอทสร้างใหม่ทั้งหมด (ห้องใช้งาน / Active)
  // ถ้ายังไม่กรอก บอทจะใช้ Category เดียวกับ lobby ของโซนนั้นเหมือนเดิม
  roomsCategoryId: "1524122788015636682",

  // Category ID สำหรับพักห้อง VIP ที่ไม่มีการใช้งาน (Unused / Inactive)
  vipInactiveCategoryId: "1549723895936979004",

  separatorPermissions: {
    visibleNoConnectIds: [
      "1144700895020462200", // memberID
      "1156930837573546126", // Coffee1
    ],
    hiddenIds: [
      "1156930842434752614", // Coffee2
    ],
  },

  vipRoomPermissions: {
    memberId: "1144700895020462200",
    coffee1Id: "1156930837573546126",
    coffee2Id: "1156930842434752614",
  },

  // 4 ธีมห้องเสียง สำหรับคำสั่ง /คัดลอกสิทธิ์หมวดหมู่
  roomThemes: {
    bear_cafe: {
      name: "🐻 ธีมหมี & คาเฟ่",
      userLimit: 6,
      rooms: [
        "🏡︲หมีอินโทรเวิร์ต",
        "🌞︲พระอาทิตย์ยิ้มแฉ่ง",
        "🍯︲น้ำผึ้งเดือนแปด",
        "☕︲ขอกาแฟเข้มๆ",
        "🌙︲หมีขี้เซา 24/7",
        "🧂︲เรื่องเกลือ ๆ  ของฉัน",
        "🌈︲เมาสายรุ้ง",
        "🥛︲หมีติดนมกล่อง",
        "🏠︲บ้านพักหมีชรา",
        "🍵︲ชาเขียวเตือนใจ",
        "🧺︲ร้านซักหมี",
        "🍨︲น้ำแข็งไสป้าหยก",
      ],
    },
    flower_nature: {
      name: "🌸 ธีมดอกไม้ & ธรรมชาติ",
      userLimit: 7,
      rooms: [
        "🥀︲กุหลาบเฉา",
        "🌻︲ทานตะวัน",
        "🍀︲ใบโคลเวอร์",
        "🌷︲ทิวลิป",
        "🌼︲เดซี่",
        "🌵︲กระบองเพชร",
        "🍁︲ใบเมเปิ้ล",
        "🌺︲ฮิบิคัส",
        "🌱︲ต้นอ่อน",
        "🍂︲ใบไม้ร่วง",
      ],
    },
    fruit_fluffy: {
      name: "🍑 ธีมผลไม้นุ่มฟู",
      userLimit: 8,
      rooms: [
        "🍒︲เชอร์รีนุ่มฟู",
        "🍊︲ส้มนุ่มฟู",
        "🍋︲เลม่อนนุ่มฟู",
        "🥝︲กีวีนุ่มฟู",
        "🧊︲น้ำแข็งนุ่มฟู",
        "🍇︲องุ่นนุ่มฟู",
        "🍑︲พีชนุ่มฟู",
        "🥭︲มะม่วงนุ่มฟู",
        "🥥︲มะพร้าวนุ่มฟู",
        "🍉︲แตงโมนุ่มฟู",
        "🍌︲กล้วยนุ่มฟู",
        "🍈︲เมล่อนนุ่มฟู",
      ],
    },
    vegetable_fluffy: {
      name: "🥦 ธีมผักปุกปุย",
      userLimit: 9,
      rooms: [
        "🍅︲มะเขือเทศปุกปุย",
        "🥕︲แครอทปุกปุย",
        "🌽︲ข้าวโพดปุกปุย",
        "🥦︲บร็อคโคลี่ปุกปุย",
        "🥒︲แตงกวาปุกปุย",
        "🧊︲น้ำแข็งปุกปุย",
        "🍆︲มะเขือปุกปุย",
        "🍄︲เห็ดปุกปุย",
        "🥔︲มันฝรั่งปุกปุย",
        "🧄︲กระเทียมปุกปุย",
      ],
    },
  },

  // โซนทั้งหมด — คงไว้เฉพาะ VIP และห้องนอน (ไม่มีเส้นคั่น)
  zones: [
    {
      id: "vip",
      name: "VIP",
      lobbyChannelId: "1524122963904036945",
      roomsCategoryId: "1524122788015636682",
      inactiveCategoryId: "1549723895936979004",
      nameThemes: ["⭐︲VIP username"],
      retentionMs: 3 * 24 * 60 * 60 * 1000, // 3 วัน (259,200,000 ms)
      skipSeparator: true,
      skipLayout: true,
    },
    {
      id: "sleep_single",
      name: "นอนเดี่ยว",
      lobbyChannelId: "1524256451059519659",
      roomsCategoryId: "1524122737172414555",
      userLimit: 1,
      skipSeparator: true,
      skipLayout: true,
      nameThemes: ["🤍︲นอนเดี่ยว {username}"],
    },
    {
      id: "sleep_double",
      name: "นอนคู่",
      lobbyChannelId: "1524257410548498452",
      roomsCategoryId: "1524122737172414555",
      userLimit: 2,
      skipSeparator: true,
      skipLayout: true,
      nameThemes: ["🤍︲นอนคู่ {username}"],
    },
    {
      id: "sleep_group",
      name: "นอนกลุ่ม",
      lobbyChannelId: "1524257891815526440",
      roomsCategoryId: "1524122737172414555",
      userLimit: 3,
      skipSeparator: true,
      skipLayout: true,
      nameThemes: ["🤍︲นอนกลุ่ม {username}"],
    },

    // เพิ่มโซนใหม่: copy block นี้แล้วแก้
    // {
    //   id: "music",
    //   name: "ดนตรี",
    //   lobbyChannelId: "LOBBY_MUSIC_CHANNEL_ID",
    //   separatorChannelId: null,
    //   separatorName: "⎯⎯⎯ ดนตรี ⎯⎯⎯",
    //   nameThemes: ["🎵 คลื่นเสียง", "🎸 ห้องแจม", "🎹 ห้องเปียโน"],
    // },
  ],
};
