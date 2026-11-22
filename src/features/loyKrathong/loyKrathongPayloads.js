// src/features/loyKrathong/loyKrathongPayloads.js
// ตัวสร้าง Payload Component V2 สำหรับระบบลอยกระทง

const {
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
} = require("discord.js");
const {
  FLAG_V2,
  CUSTOM_IDS,
  IMAGES,
  EMOJIS,
  ORIGIN_MESSAGE_URL,
} = require("./loyKrathongConfig");

/**
 * สร้างการ์ดแผงหลักสำหรับกิจกรรมลอยกระทง (Component V2)
 */
function buildLoyKrathongPanelPayload() {
  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 12,
            items: [
              {
                media: {
                  url: IMAGES.BANNER,
                },
              },
            ],
          },
          {
            type: 1,
            components: [
              {
                type: 5,
                flow: {
                  actions: [],
                },
                custom_id: CUSTOM_IDS.SELECT_USER,
                min_values: 1,
                max_values: 1,
                placeholder: "💕 เลือกคนที่เธอต้องการฝากถึง",
              },
            ],
          },
          {
            type: 14,
          },
          {
            type: 10,
            content:
              "### 1. เหรียญใช้ทำอะไร?\n-# สามารถนำไปสุ่มรางวัลผ่านห้อง <#1556376052647993374> ลุ้น <:bankmoney:1567217849968234658> เงินรางวัล, <:couponrov:1570451865903046887> คูปอง RoV, <:618492diamond:1521245223311769673> ยศพรีเมียม และอื่น ๆ อีกมากมาย!\n### 2. ทิศทางข้อความที่ใช้ฝากถึง\n-# ข้อความควรเป็นไปในทางสุภาพและเหมาะสม เช่น การฝากคำชม กำลังใจ คำทักทาย หรือความรู้สึกดี ๆ ไม่ควรมีข้อความหยาบคาย เหยียด ล้อเลียน คุกคาม พาดพิงให้ผู้อื่นเสียหาย เปิดเผยข้อมูลส่วนตัว หรือมีเนื้อหาที่ไม่เหมาะสมในรูปแบบอื่น ๆ\n### 3. ระยะเวลากิจกรรม\n-# ท่านสามารถเข้าร่วมได้ตั้งแต่ 24/11/2569 เวลา 18:00 - 27/11/2569 เวลา 18:00",
          },
        ],
      },
    ],
  };
}

/**
 * สร้าง Modal สำหรับกรอกข้อความที่ต้องการฝากถึง
 * @param {string} targetUserId
 */
function buildLoyKrathongModal(targetUserId) {
  const modal = new ModalBuilder()
    .setCustomId(`${CUSTOM_IDS.MODAL_PREFIX}:${targetUserId}`)
    .setTitle("ฝากข้อความผ่านกระทง");

  const messageInput = new TextInputBuilder()
    .setCustomId(CUSTOM_IDS.INPUT_MESSAGE)
    .setLabel("ข้อความที่ต้องการฝากถึง (1 - 2,000 ตัวอักษร)")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("พิมพ์ข้อความดี ๆ กำลังใจ หรือความรู้สึกที่อยากบอก...")
    .setMinLength(1)
    .setMaxLength(2000)
    .setRequired(true);

  const row = new ActionRowBuilder().addComponents(messageInput);
  modal.addComponents(row);

  return modal;
}

/**
 * สร้างการ์ดข้อความกระทงที่ส่งไปยังห้องปลายทาง (Component V2)
 * @param {string} receiverId
 * @param {string} messageText
 * @param {number} timestamp Unix timestamp (วินาที)
 */
function buildLoyKrathongChannelPayload(receiverId, messageText, timestamp) {
  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 9,
            components: [
              {
                type: 10,
                content: `## ${EMOJIS.ROSE}︲มีข้อความจาก__ใครสักคน__ฝากถึงคุณผ่านกระทง\n-# <@${receiverId}> — <t:${timestamp}:R>\n`,
              },
            ],
            accessory: {
              type: 11,
              media: {
                url: IMAGES.KRATHONG_THUMBNAIL,
              },
            },
          },
          {
            type: 14,
            spacing: 1,
          },
          {
            type: 9,
            components: [
              {
                type: 10,
                content: `### " ${messageText} "`,
              },
            ],
            accessory: {
              type: 2,
              style: 5,
              url: ORIGIN_MESSAGE_URL,
              label: "ฝากข้อความของคุณ",
              emoji: EMOJIS.LINK_BUTTON,
            },
          },
        ],
      },
    ],
  };
}

module.exports = {
  buildLoyKrathongPanelPayload,
  buildLoyKrathongModal,
  buildLoyKrathongChannelPayload,
};
