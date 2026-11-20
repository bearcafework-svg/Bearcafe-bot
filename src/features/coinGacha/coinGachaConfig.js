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

  // สื่อและรูปภาพประจำระดับ (Media URLs ตรงตามเอกสาร 100%)
  MEDIA: {
    // แบนเนอร์หน้าตู้หลัก
    MAIN_PANEL_IMAGE: "https://media.discordapp.net/attachments/1565840974737973428/1572112401673887774/ba35cc6bef33f597.png?ex=6afd2f44&is=6afbddc4&hm=9333e394efcf4b5ba6c1857262927b7f122a7169ab11669837e200d1081d940b&format=webp&quality=lossless&width=525&height=350",
    MAIN_PANEL_GIF: "https://media.discordapp.net/attachments/1565856976552988804/1572471219553435659/NewsBoard_-_bearcafe.gif?ex=6afe7d71&is=6afd2bf1&hm=0336e86c631bcd40b89966d855083cc27cfa89f2f9831daa317b696e7cda7f03",
    SPONSOR_BANNER_1: "https://media.discordapp.net/attachments/1567164733201580042/1567882202908336158/Dis_QZADD.gif?ex=6afe4657&is=6afcf4d7&hm=e5ba431ec7c5446dad258eced6aad2f6462925c1c3257fa4fb0e1daaa6eef1fd",
    SPONSOR_BANNER_2: "https://media.discordapp.net/attachments/1525805890060685474/1537845157032886402/kubo.png?ex=6afe6ca9&is=6afd1b29&hm=bf62bea08ebfcd62ae531f061891cdab0c313cc8d772fd256785d15db7666aea&format=webp&quality=lossless",

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
    FIRST_TIME_BANNER: "https://media.discordapp.net/attachments/1565840974737973428/1572484043075887114/1552e4e858635584.png?ex=6afe8963&is=6afd37e3&hm=db429e40488b2d1d0796cacbebd5c8de3de53563bf4205cb7717c1ab1fd8c862&format=webp&quality=lossless&width=550&height=220"
  },

  // Custom IDs สำหรับปุ่มกด
  CUSTOM_IDS: {
    ROLL: "coin_gacha_roll",
    ROLL_AGAIN: "coin_gacha_roll_again",
    HISTORY_PREFIX: "coin_gacha_history_",
    CHECK: "coin_gacha_check",
  },

  // คูลดาวน์การกดปุ่มโยนเหรียญ (มิลลิวินาที สอดคล้องกับแอนิเมชัน 5 วินาที)
  ROLL_COOLDOWN_MS: 5000,

  // อัตราการแปลงแต้มชดเชยกรณีได้รางวัลยศซ้ำ (Points Fallback)
  ROLE_DUPLICATE_POINTS: 300,

  // Message Flags สำหรับ Component V2
  FLAG_V2_PUBLIC: 32768,     // ส่งบอร์ดสาธารณะในห้อง (MessageFlags.IsComponentsV2)
  FLAG_V2_EPHEMERAL: 32832   // ตอบกลับแบบซ่อนเฉพาะเจ้าของ ehp (32768 | 64)
};
