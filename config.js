// ===================================================
// config.js — ตั้งค่าโซนและห้องทั้งหมดที่นี่
// ===================================================

module.exports = {
  // ไม่อยากให้ห้องว่างนานเกินกี่นาทีก่อนลบ
  emptyTimeoutMinutes: 2,

  // ตรวจสอบห้องว่างทุกกี่วินาที
  monitorIntervalSeconds: 60,

  // จำนวนคนสูงสุดต่อห้อง (soft cap)
  softCap: 10,

  // Category ID สำหรับห้องที่บอทสร้างใหม่ทั้งหมด
  // ถ้ายังไม่กรอก บอทจะใช้ Category เดียวกับ lobby ของโซนนั้นเหมือนเดิม
  roomsCategoryId: "1524122788015636682",

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

  // โซนทั้งหมด — เพิ่ม/ลดได้ตามต้องการ
  zones: [
    {
      id: "vip",
      name: "VIP",
      lobbyChannelId: "1524122963904036945",
      separatorChannelId: null,
      separatorName: "〔𝖵𝖨𝖯〕𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃",
      nameThemes: ["⭐︲VIP username"],
    },
    {
      id: "general",
      name: "ห้องโต๊ะชิล",

      // Channel ID ของปุ่มกด "➕ สร้างห้องพูดคุย"
      lobbyChannelId: "1524122945428127914",

      // บอทจะเติมให้เองตอน sync separator — ไม่ต้องกรอก
      separatorChannelId: null,

      // ✏️ แก้ชื่อเส้นคั่นได้ตามใจชอบ
      separatorName: "〔𝖢𝖧𝖨𝖫𝖫〕𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃",

      // ชื่อห้องที่จะสุ่มสร้าง
      nameThemes: [
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
    {
      id: "game",
      name: "เกม",
      lobbyChannelId: "1524124494099255356",
      separatorChannelId: null,
      separatorName: "〔𝖦𝖠𝖬𝖤〕𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃",
      nameThemes: ["🎮︲โต๊ะเกม username"],
    },
    {
      id: "music",
      name: "เพลง",
      lobbyChannelId: "1524124359768277193",
      separatorChannelId: null,
      separatorName: "〔𝖬𝖴𝖲𝖨𝖢〕𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃",
      nameThemes: ["🎶︲โต๊ะเพลง username"],
    },
    {
      id: "work",
      name: "ทำงาน",
      lobbyChannelId: "1524123845886476428",
      separatorChannelId: null,
      separatorName: "〔𝖶𝖮𝖱𝖪〕𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃𓂃",
      nameThemes: ["💼︲โต๊ะทำงาน username"],
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
