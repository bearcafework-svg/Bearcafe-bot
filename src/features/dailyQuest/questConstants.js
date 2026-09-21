const sharedSettings = require("../../sharedSettings.json");
const pointIcon = sharedSettings.point_icon;
const POINT_ICON_STR = pointIcon ? `<:${pointIcon.name}:${pointIcon.id}>` : "<:strawberryv2:1520439075100688614>";

module.exports = {
  // ห้องประกาศเควสประจำวัน
  ANNOUNCE_CHANNEL_ID: "1544088196332134491",

  // ห้องแจ้งเตือนเมื่อสมาชิกผ่านเควส
  NOTIFY_CHANNEL_ID: "1551533172682919997",

  // รูปแบนเนอร์ด้านบนของการ์ดเควสประจำวัน
  BANNER_IMAGE_URL:
    "https://cdn.discordapp.com/attachments/1524704267015819274/1550771948592701500/ChatGPT_Image_19_.._2569_13_54_04.png?ex=6ab22f6c&is=6ab0ddec&hm=96c8ddf6e00c32e67ad20ae92c200c38dc3409e90d763061a102fe442458d17f&",

  // ไอคอนแต้มสตรอว์เบอร์รี
  POINT_ICON_STR,

  // แต้มโบนัสเมื่อทำเควสครบ 3 ข้อ
  FULL_COMPLETION_BONUS_POINTS: 50,

  // กำหนดทดสอบเฉพาะไอดีนี้ในระยะเริ่มต้น
  TEST_ONLY_DISCORD_ID: "944920660759707658",

  // อีโมจิสำหรับสร้าง Progress Bar หลอดพลัง 9 ชิ้น
  PROGRESS_BAR_EMOJIS: {
    filled: {
      left: "<:bary1:1352982110557835408>",
      middle: "<:bary2:1352982107403714591>",
      right: "<:bary3:1352982104564039691>"
    },
    empty: {
      left: "<:barn1:1352982115523756134>",
      middle: "<:barn2:1352982117360996426>",
      right: "<:barn3:1352982119281983538>"
    }
  },

  // อีโมจิเครื่องหมายถูก (เมื่อเควสเสร็จสิ้น)
  CHECKMARK_EMOJI: {
    id: "1358584609087946867",
    name: "50121checkmark",
    animated: false
  },

  // Custom ID ของปุ่มดูความคืบหน้า
  CUSTOM_ID_PROGRESS: "daily_quest_progress"
};
