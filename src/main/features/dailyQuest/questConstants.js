const sharedSettings = require("../../sharedSettings.json");
const pointIcon = sharedSettings.point_icon;
const POINT_ICON_STR = pointIcon ? `<:${pointIcon.name}:${pointIcon.id}>` : "<:strawberryv2:1520439075100688614>";

module.exports = {
  // ห้องประกาศเควสประจำวัน
  ANNOUNCE_CHANNEL_ID: "1529885509260673034",

  // ห้องแจ้งเตือนเมื่อสมาชิกผ่านเควส
  NOTIFY_CHANNEL_ID: "1524123147987714158",

  // รูปแบนเนอร์ด้านบนของการ์ดเควสประจำวัน
  BANNER_IMAGE_URL:
    "https://cdn.discordapp.com/attachments/1524704267015819274/1550771948592701500/ChatGPT_Image_19_.._2569_13_54_04.png?ex=6ab380ec&is=6ab22f6c&hm=aa882b8c0feaf2104b4d078998ab385af499e9a24803e3a0d7b70f4541c55f1a&",

  // รูปไอคอนกล่องของขวัญ/รางวัลพิเศษด้านล่างของการ์ด
  SPECIAL_REWARD_ICON_URL:
    "https://cdn.discordapp.com/attachments/1524704267015819274/1551949346981806090/06b20e483bfac611d837c1db30d5fbad.png?ex=6ab3d4f6&is=6ab28376&hm=c9873c872cb823c9a7c41ff041eb4ff0ba44b8287f3a588acbeecda8c973551b&",

  // ไอคอนแต้มสตรอว์เบอร์รี
  POINT_ICON_STR,

  // แต้มโบนัสเมื่อทำเควสครบ 3 ข้อ
  FULL_COMPLETION_BONUS_POINTS: 50,

  // Role ID ที่อนุญาตให้ใช้คำสั่ง /อนุมัติเควส ได้
  APPROVE_ROLE_ID: "1205512963058962482",

  // Role ID ที่ใช้ Ping แจ้งเตือนเมื่อประกาศเควสใหม่
  ANNOUNCE_PING_ROLE_ID: "1144700895020462200",

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
