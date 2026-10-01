// src/main/features/mainQuest/questConstants.js
// ค่าคงที่และโครงสร้างข้อมูลสำหรับระบบเควสใหญ่ (Main Community Quest) Bear Cafe

const FLAG_V2 = 32768; // MessageFlags.IsComponentsV2
const FLAG_EPHEMERAL = 64; // MessageFlags.Ephemeral
const FLAG_V2_EPHEMERAL = FLAG_V2 | FLAG_EPHEMERAL;

const DEFAULT_BANNER_URL =
  "https://cdn.discordapp.com/attachments/1524704267015819274/1555123695469592596/1_.._2569_14_45_36.png?backend=b2&ex=6abf614d&is=6abe0fcd&hm=45af7851904b36de2b40b98761e82d7f1defd4f187d38e329138dcf64bb8208d&";

const BEE_EMOJI = "<:bee20000:1256669436350562355>";
const BEAR_ROLL_EMOJI = "<a:5285bearroll:1299694108541190197>";
const GIFT_EMOJI = "<:68492gift:1276130500410605609>";
const STRAWBERRY_POINT_EMOJI = "<:strawberryv2:1520439075100688614>";

const BAGPACK_ICON_EMOJI = {
  id: "1522154708200849449",
  name: "bagpack_icon",
  animated: false
};

const DEFAULT_ROLE_REWARD_ID = "1426587608527667322";
const DEFAULT_POINTS_REWARD = 7500;
const DEFAULT_CONGRATS_ROLE_ID = "1144700895020462200";
const DEFAULT_TARGET_HOURS = 3000;
const DEFAULT_MIN_HOURS_ELIGIBLE = 1; // 1 ชั่วโมงขึ้นไป

// อีโมจิ Progress Bar ความยาว 9 ชิ้นของ Bear Cafe
const PROGRESS_BAR_EMOJIS = {
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
};

const CHECK_POINTS_URL = "https://discord.com/channels/1144251788493602848/1524123727724417276";

module.exports = {
  FLAG_V2,
  FLAG_EPHEMERAL,
  FLAG_V2_EPHEMERAL,
  DEFAULT_BANNER_URL,
  BEE_EMOJI,
  BEAR_ROLL_EMOJI,
  GIFT_EMOJI,
  STRAWBERRY_POINT_EMOJI,
  BAGPACK_ICON_EMOJI,
  DEFAULT_ROLE_REWARD_ID,
  DEFAULT_POINTS_REWARD,
  DEFAULT_CONGRATS_ROLE_ID,
  DEFAULT_TARGET_HOURS,
  DEFAULT_MIN_HOURS_ELIGIBLE,
  PROGRESS_BAR_EMOJIS,
  CHECK_POINTS_URL
};
