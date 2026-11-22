// src/features/loyKrathong/loyKrathongConfig.js
// ค่าคงที่และคอนฟิกสำหรับระบบลอยกระทงฝากข้อความ

module.exports = {
  // ห้องปลายทางสำหรับส่งกระทงที่สมาชิกฝากข้อความ
  TARGET_CHANNEL_ID: "1573996427292708884",

  // ห้องตู้สุ่มเหรียญ
  GACHA_CHANNEL_ID: "1556376052647993374",

  // ลิงก์สำหรับกดกลับไปยังห้องฝากข้อความต้นทาง
  ORIGIN_MESSAGE_URL: "https://discord.com/channels/1144251788493602848/1573988814450593843",

  // Component V2 Flags
  FLAG_V2: 32768,
  FLAG_V2_EPHEMERAL: 32832,

  // Custom IDs สำหรับ Interaction
  CUSTOM_IDS: {
    SELECT_USER: "loy_krathong_select_user",
    MODAL_PREFIX: "loy_krathong_modal",
    INPUT_MESSAGE: "loy_krathong_input_message",
  },

  // รูปภาพประกอบ
  IMAGES: {
    BANNER: "https://media.discordapp.net/attachments/1565777850022232075/1573992647029301248/ceb46684aa8b002d.png?ex=6b040662&is=6b02b4e2&hm=300dc77e0a8fa5b693804222d60e5df32bad339b40d0c5f45fa992647be082f7&format=webp&quality=lossless&width=525&height=350",
    KRATHONG_THUMBNAIL: "https://cdn.discordapp.com/attachments/1525750929775923210/1573990679556788254/1384618686-7501112013-o.png?ex=6b04048d&is=6b02b30d&hm=1d92abb8ff34d06778838fc93899cccf43e7e33126b6b857504305c738d42b65&",
  },

  // อิโมจิ
  EMOJIS: {
    CHECKMARK: "<:50121checkmark:1358584609087946867>",
    GACHA_COIN: "<:GachaCoin_bearcafe:1292889186403090482>",
    ROSE: "<a:pinkglitteringrose:1573990264828067890>",
    LINK_BUTTON: {
      id: "1360237868295131256",
      name: "themajesty_emoji1",
      animated: false,
    },
  },
};
