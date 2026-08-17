// src/features/dailyQuest/questPool.js — รายการ 30 ภารกิจหลักแบ่ง 5 หมวดหมู่
module.exports = [
  // 💬 หมวด 1 — Chat Quest (6 ภารกิจ)
  {
    id: "CHAT-01",
    category: "CHAT",
    title: "นักคุยประจำวัน",
    description: "พิมพ์คุยกับเพื่อน ๆ บนแชทภายในคาเฟ่หมี",
    targetCount: 25,
    unit: "ข้อความ",
    rewardPoints: 15,
    difficulty: "EASY",
    trackerType: "MESSAGE_COUNT"
  },
  {
    id: "CHAT-02",
    category: "CHAT",
    title: "เปิดบทสนทนา",
    description: "ส่งข้อความพูดคุยในห้องแชทต่าง ๆ รวม 3 ห้อง",
    targetCount: 3,
    unit: "ห้อง",
    rewardPoints: 15,
    difficulty: "EASY",
    trackerType: "CHAT_CHANNELS"
  },
  {
    id: "CHAT-03",
    category: "CHAT",
    title: "คุยกันหน่อย",
    description: "ส่งข้อความและมีสมาชิกคนอื่น Reply ตอบกลับข้อความ",
    targetCount: 2,
    unit: "ตอบกลับ",
    rewardPoints: 20,
    difficulty: "NORMAL",
    trackerType: "MESSAGE_REPLIED"
  },
  {
    id: "CHAT-04",
    category: "CHAT",
    title: "นักทักทาย",
    description: "พิมพ์ข้อความทักทายทั้งช่วงเช้าและช่วงเย็น",
    targetCount: 2,
    unit: "ช่วงเวลา",
    rewardPoints: 15,
    difficulty: "EASY",
    trackerType: "TIME_GREETINGS"
  },
  {
    id: "CHAT-05",
    category: "CHAT",
    title: "บทสนทนาต่อเนื่อง",
    description: "แวะเข้ามาส่งข้อความคุยต่างช่วงเวลาครบ 3 ช่วง",
    targetCount: 3,
    unit: "ช่วงเวลา",
    rewardPoints: 20,
    difficulty: "NORMAL",
    trackerType: "TIME_SLOTS"
  },
  {
    id: "CHAT-06",
    category: "CHAT",
    title: "คนไม่หาย",
    description: "แวะกลับมาพิมพ์ข้อความหลังจากออนไลน์ผ่านไปแล้ว 3 ชั่วโมง",
    targetCount: 1,
    unit: "ครั้ง",
    rewardPoints: 20,
    difficulty: "NORMAL",
    trackerType: "CHAT_AFTER_DELAY"
  },

  // 🎙️ หมวด 2 — Voice Quest (6 ภารกิจ)
  {
    id: "VOICE-01",
    category: "VOICE",
    title: "สิงห้องใดก็ได้",
    description: "ลงห้องคุยภายในคาเฟ่หมี",
    targetCount: 20,
    unit: "นาที",
    rewardPoints: 15,
    difficulty: "EASY",
    trackerType: "VOICE_MINUTES"
  },
  {
    id: "VOICE-02",
    category: "VOICE",
    title: "เข้ารังหมี",
    description: "แวะเข้าห้องเสียงต่างกันอย่างน้อย 2 ห้อง",
    targetCount: 2,
    unit: "ห้อง",
    rewardPoints: 15,
    difficulty: "EASY",
    trackerType: "VOICE_CHANNELS"
  },
  {
    id: "VOICE-03",
    category: "VOICE",
    title: "คุยกับเพื่อน",
    description: "อยู่ในห้องเสียงพร้อมสมาชิกคนอื่นอย่างน้อย 15 นาที",
    targetCount: 15,
    unit: "นาที",
    rewardPoints: 20,
    difficulty: "NORMAL",
    trackerType: "VOICE_WITH_FRIENDS"
  },
  {
    id: "VOICE-04",
    category: "VOICE",
    title: "Voice Marathon",
    description: "สิงอยู่ในห้องเสียงรวดเดียวต่อเนื่องครบ 30 นาที",
    targetCount: 30,
    unit: "นาที",
    rewardPoints: 25,
    difficulty: "HARD",
    trackerType: "VOICE_CONTINUOUS"
  },
  {
    id: "VOICE-05",
    category: "VOICE",
    title: "แวะมาหลายรอบ",
    description: "เข้าใช้งานห้องเสียงต่างรอบกันรวม 3 ครั้ง",
    targetCount: 3,
    unit: "รอบ",
    rewardPoints: 20,
    difficulty: "NORMAL",
    trackerType: "VOICE_SESSIONS"
  },
  {
    id: "VOICE-06",
    category: "VOICE",
    title: "สร้างรังหมี",
    description: "กดสร้างห้องเสียงส่วนตัวผ่านระบบ Room Creator",
    targetCount: 1,
    unit: "ครั้ง",
    rewardPoints: 20,
    difficulty: "NORMAL",
    trackerType: "CREATE_ROOM"
  },

  // 🎮 หมวด 3 — Minigame Quest (6 ภารกิจ)
  {
    id: "GAME-01",
    category: "MINIGAME",
    title: "เซียนมินิเกม",
    description: "เล่นมินิเกม <#1534433651482300507> สะสม",
    targetCount: 3,
    unit: "ชนะ",
    rewardPoints: 15,
    difficulty: "EASY",
    trackerType: "MINIGAME_WIN"
  },
  {
    id: "GAME-02",
    category: "MINIGAME",
    title: "นักเสี่ยงดวง",
    description: "ร่วมสนุกตอบคำถามมินิเกมห้องใดก็ได้ครบ 5 รอบ",
    targetCount: 5,
    unit: "รอบ",
    rewardPoints: 15,
    difficulty: "EASY",
    trackerType: "MINIGAME_PLAY"
  },
  {
    id: "GAME-03",
    category: "MINIGAME",
    title: "เกมแรกของวันนี้",
    description: "เล่นมินิเกมต่างหมวดหมู่กัน 2 ประเภท",
    targetCount: 2,
    unit: "ประเภท",
    rewardPoints: 20,
    difficulty: "NORMAL",
    trackerType: "MINIGAME_TYPES_2"
  },
  {
    id: "GAME-04",
    category: "MINIGAME",
    title: "เปลี่ยนแนวหน่อย",
    description: "ร่วมสนุกกับมินิเกมต่างชนิดกันรวม 3 ประเภท",
    targetCount: 3,
    unit: "ประเภท",
    rewardPoints: 25,
    difficulty: "HARD",
    trackerType: "MINIGAME_TYPES_3"
  },
  {
    id: "GAME-05",
    category: "MINIGAME",
    title: "ห้ามพลาด",
    description: "ตอบคำถามมินิเกมถูกต้องต่อเนื่องกัน 2 ข้อโดยไม่ผิด",
    targetCount: 2,
    unit: "ชนะติดกัน",
    rewardPoints: 20,
    difficulty: "NORMAL",
    trackerType: "MINIGAME_STREAK"
  },
  {
    id: "GAME-06",
    category: "MINIGAME",
    title: "Perfect Round",
    description: "ตอบคำถามมินิเกมถูกทั้งหมดในรอบการเล่นโดยไม่ตอบผิดเลย",
    targetCount: 1,
    unit: "รอบเพอร์เฟกต์",
    rewardPoints: 30,
    difficulty: "HARD",
    trackerType: "MINIGAME_PERFECT"
  },

  // 🌱 หมวด 4 — Bear Cafe Feature Quest (6 ภารกิจ)
  {
    id: "FEATURE-01",
    category: "FEATURE",
    title: "เติมพลังใจ",
    description: "ใช้คำสั่งที่ห้อง ",
    targetCount: 1,
    unit: "ครั้ง",
    rewardPoints: 15,
    difficulty: "EASY",
    trackerType: "USE_HEALJAI"
  },
  {
    id: "FEATURE-02",
    category: "FEATURE",
    title: "เปิดไพ่ให้ตัวเอง",
    description: "ใช้คำสั่งเช็คดวง / เปิดไพ่ประจำวัน",
    targetCount: 1,
    unit: "ครั้ง",
    rewardPoints: 15,
    difficulty: "EASY",
    trackerType: "USE_HOROSCOPE"
  },
  {
    id: "FEATURE-03",
    category: "FEATURE",
    title: "เปิดกล่องหมี",
    description: "กดรับกล่องรางวัลโฆษณา Ad Reward",
    targetCount: 1,
    unit: "ครั้ง",
    rewardPoints: 20,
    difficulty: "NORMAL",
    trackerType: "USE_AD_REWARD"
  },
  {
    id: "FEATURE-04",
    category: "FEATURE",
    title: "แวะตลาดหมี",
    description: "เปิดดูหน้า Bear Market หรือเมนูร้านค้า",
    targetCount: 1,
    unit: "ครั้ง",
    rewardPoints: 10,
    difficulty: "EASY",
    trackerType: "VIEW_BEAR_MARKET"
  },
  {
    id: "FEATURE-05",
    category: "FEATURE",
    title: "เดินเล่นในคาเฟ่",
    description: "สลับเข้าใช้งานแชนแนลต่างๆ ภายในคาเฟ่หมีครบ 3 ห้อง",
    targetCount: 3,
    unit: "ห้อง",
    rewardPoints: 15,
    difficulty: "EASY",
    trackerType: "VISIT_CHANNELS"
  },
  {
    id: "FEATURE-06",
    category: "FEATURE",
    title: "นักสำรวจคาเฟ่",
    description: "ใช้งานฟีเจอร์ของบอทต่างกัน 2 ระบบ",
    targetCount: 2,
    unit: "ระบบ",
    rewardPoints: 20,
    difficulty: "NORMAL",
    trackerType: "USE_MULTI_FEATURES"
  },

  // 🤝 หมวด 5 — Social / Activity Quest (6 ภารกิจ)
  {
    id: "SOCIAL-01",
    category: "SOCIAL",
    title: "หาเพื่อนคุย",
    description: "ใช้คำสั่งที่ห้อง ",
    targetCount: 1,
    unit: "ครั้ง",
    rewardPoints: 15,
    difficulty: "EASY",
    trackerType: "USE_MATCHMAKING"
  },
  {
    id: "SOCIAL-02",
    category: "SOCIAL",
    title: "ไม่ได้มาคนเดียว",
    description: "อยู่ในห้องเสียงที่มีสมาชิกอยู่อย่างน้อย 3 คนขึ้นไป ครบ 10 นาที",
    targetCount: 10,
    unit: "นาที",
    rewardPoints: 20,
    difficulty: "NORMAL",
    trackerType: "VOICE_CROWD"
  },
  {
    id: "SOCIAL-03",
    category: "SOCIAL",
    title: "ร่วมกิจกรรม",
    description: "เข้าร่วม Event หรือกิจกรรมของเซิร์ฟเวอร์",
    targetCount: 1,
    unit: "ครั้ง",
    rewardPoints: 25,
    difficulty: "HARD",
    trackerType: "JOIN_SERVER_EVENT"
  },
  {
    id: "SOCIAL-04",
    category: "SOCIAL",
    title: "โต๊ะนี้มีคน",
    description: "เข้าร่วมโต๊ะกิจกรรมหรือโต๊ะเล่นเกมร่วมกับเพื่อน",
    targetCount: 1,
    unit: "ครั้ง",
    rewardPoints: 20,
    difficulty: "NORMAL",
    trackerType: "JOIN_GAME_TABLE"
  },
  {
    id: "SOCIAL-05",
    category: "SOCIAL",
    title: "ช่วยให้ห้องคึกคัก",
    description: "พูดคุยหรือมี Interaction กับเพื่อนในห้องเสียงครบ 10 นาที",
    targetCount: 10,
    unit: "นาที",
    rewardPoints: 20,
    difficulty: "NORMAL",
    trackerType: "VOICE_INTERACTION"
  },
  {
    id: "SOCIAL-06",
    category: "SOCIAL",
    title: "วันนี้ได้รู้จักใครไหม",
    description: "มี Interaction กับเพื่อนใหม่ 2 คนที่ไม่เคยคุยด้วยวันนี้",
    targetCount: 2,
    unit: "คน",
    rewardPoints: 25,
    difficulty: "HARD",
    trackerType: "NEW_FRIENDS_INTERACT"
  }
];
