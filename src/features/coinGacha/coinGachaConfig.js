// src/features/coinGacha/coinGachaConfig.js
// การตั้งค่าและ Constants ทั้งหมดของระบบหมีโยนเหรียญ (Coin Gacha)

module.exports = {
  // Webhook ส่ง Log แบบ Real-time
  WEBHOOK_URL: "https://discord.com/api/webhooks/1572539527942250578/8qd3mFHkue3yl9TeoZHTemgOuaRAKI3q7vXxVr5miFfqnWBTiLxCaHaYsjxFHiMmx_Gj",

  // ช่องทางต่างๆ
  CHANNELS: {
    FIRST_TIME_CLAIM: "1524124172580814979", // ห้องรับรางวัลครั้งแรก
    STAFF_CLAIM: "1524124116053917747",      // ห้องติดต่อรับรางวัลกับทีมงาน
    COIN_DROP_ALERT: "1569377817131487374",  // ห้องแจ้งเตือนดรอปเหรียญ
  },

  // Role IDs ที่มีสิทธิ์ใช้คำสั่ง /รับแต้มครั้งแรก
  ALLOWED_CLAIM_ROLES: [
    "1144676811838599188",
    "1168088416437665903",
    "1205512963058962482"
  ],

  // สื่อและรูปภาพประจำระดับ (Media URLs)
  MEDIA: {
    // แบนเนอร์หน้าตู้หลัก
    MAIN_PANEL_IMAGE: "https://media.discordapp.net/attachments/1565840974737973428/1572112401673887774/ba35cc6bef33f597.png?format=webp&quality=lossless&width=525&height=350",
    MAIN_PANEL_GIF: "https://media.discordapp.net/attachments/1565856976552988804/1572471219553435659/NewsBoard_-_bearcafe.gif?format=webp&quality=lossless",
    SPONSOR_BANNER_1: "https://media.discordapp.net/attachments/1567164733201580042/1567882202908336158/Dis_QZADD.gif?format=webp&quality=lossless",
    SPONSOR_BANNER_2: "https://media.discordapp.net/attachments/1525805890060685474/1537845157032886402/kubo.png?format=webp&quality=lossless",

    // แอนิเมชันตอนโยนเหรียญ
    ROLLING_GIF: "https://cdn.discordapp.com/attachments/1565856976552988804/1572480703755714672/e6d42f9e6f60a678.gif",

    // สื่อประจำระดับของรางวัล
    TIERS: {
      common: "https://cdn.discordapp.com/attachments/1565856976552988804/1572480703755714672/e6d42f9e6f60a678.gif",
      rare: "https://cdn.discordapp.com/attachments/1565856976552988804/1572480703298408600/1.gif",
      epic: "https://cdn.discordapp.com/attachments/1565856976552988804/1572480702719463496/2.gif",
      god: "https://cdn.discordapp.com/attachments/1565856976552988804/1572480702337786037/3.gif",
    },

    // รูปแบนเนอร์ด้านล่างสำหรับผู้ใช้ที่ยังไม่เคยรับแต้มครั้งแรก
    FIRST_TIME_BANNER: "https://media.discordapp.net/attachments/1565840974737973428/1572484043075887114/1552e4e858635584.png?format=webp&quality=lossless&width=550&height=220"
  },

  // Custom IDs สำหรับปุ่มกด
  CUSTOM_IDS: {
    ROLL: "coin_gacha_roll",
    HISTORY_PREFIX: "coin_gacha_history_",
    CHECK: "coin_gacha_check",
  },

  // คูลดาวน์การกดปุ่มโยนเหรียญ (มิลลิวินาที)
  ROLL_COOLDOWN_MS: 4000,

  // อัตราการแปลงแต้มชดเชยกรณีได้รางวัลยศซ้ำ (Points Fallback)
  ROLE_DUPLICATE_POINTS: 300
};
