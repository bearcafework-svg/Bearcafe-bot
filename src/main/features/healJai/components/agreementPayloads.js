// ===================================================
// src/features/healJai/components/agreementPayloads.js
// ตัวสร้าง Discord Component V2 Payloads สำหรับข้อตกลงและระบบยินยอมของฮิลใจ
// ===================================================

const { MessageFlags } = require("discord.js");

const FLAG_V2 = MessageFlags.IsComponentsV2 || 32768;
const FLAG_EPHEMERAL = MessageFlags.Ephemeral || 64;

const CUSTOM_IDS = {
  VIEW_FULL_TERMS: "heal_jai_view_full_terms",
  ACCEPT_TERMS: "heal_jai_accept_terms",
};

const EMOJIS = {
  CLOVER: "<a:fourleafclover:1536711677699952680>",
  HEART_OUTLINES: "<a:heartoutlines:1536268541144076369>",
  GREEN_ARROW: "<a:greenarrow:1537038266010837003>",
  HEART_GREEN_ID: "1536699719055839313",
  CHECKMARK_ID: "1358584609087946867",
};

const BANNER_IMAGE = {
  url: "https://cdn.discordapp.com/attachments/1536267579843280987/1545266433909325845/HealJai_2026_ZEAB1U_._All_Rights_Reserved._1.png?ex=6a9b8503&is=6a9a3383&hm=e873f94878b2dcd7345927a193b10c73ef8d345f410127b8fed3b3e3900524c8&",
  proxy_url: "https://media.discordapp.net/attachments/1536267579843280987/1542569433514643476/NewsBoard_-_bearcafe_28.png?ex=6a9aefbc&is=6a999e3c&hm=5dacd0deb86f4a36eb0e01af40b3d241a8c177d2840a1e5789f59e94044c2f49&",
  width: 1200,
  height: 480,
};

const SUMMARY_TEXT =
  `## ${EMOJIS.CLOVER}︲__\` 𝖠𝗀𝗋𝖾𝖾𝗆𝖾𝗇𝗍 ₊ ข้อตกลงและเงื่อนไขการใช้บริการ 𓂃 \`__\n` +
  `-# ยินดีต้อนรับสู่พื้นที่ให้คำปรึกษาและรับฟังของเรา โปรดอ่านและทำความเข้าใจข้อตกลงต่อไปนี้ก่อนเริ่มใช้งานบริการ การเริ่มชำระเงินหรือสมัครเป็นผู้ให้คำปรึกษา ถือว่าคุณยอมรับเงื่อนไขทั้งหมดนี้\n\n` +
  `**สิ่งสำคัญที่ควรรู้:**\n` +
  `(🩹)⠀บริการนี้ไม่ใช่การบำบัดหรือการรักษาทางการแพทย์\n` +
  `(💸)⠀การชำระเงินต้องดำเนินการก่อนเริ่มบริการ\n` +
  `(⚠️)⠀การละเมิดกฎอาจทำให้ยุติบริการโดยไม่มีการคืนเงิน\n` +
  `(💰)⠀ผู้ให้คำปรึกษาได้รับส่วนแบ่ง 70% จากยอดสุทธิที่ลูกค้าชำระจริง\n` +
  `(↩️)⠀มีเงื่อนไขการคืนเงินและการชดเชยในกรณีผู้ให้คำปรึกษาทำผิดกฎ\n` +
  `(🔒)⠀ข้อมูลการสนทนาและประวัติการใช้งานมีนโยบายการจัดเก็บและรักษาความลับ\n\n` +
  `**การเริ่มใช้บริการหรือสมัครเป็นผู้ให้คำปรึกษา ถือว่าคุณยอมรับข้อตกลงและเงื่อนไขทั้งหมด** ${EMOJIS.HEART_OUTLINES}`;

const FULL_TERMS_TEXT =
  `### 1. ขอบเขตการให้บริการ\n` +
  `บริการนี้จัดทำขึ้นเพื่อการรับฟัง พูดคุย และให้คำแนะนำทั่วไป **ไม่ใช่การบำบัดหรือการรักษาทางการแพทย์** และผู้ให้คำปรึกษาไม่ใช่แพทย์ จิตแพทย์ หรือนักจิตวิทยาคลินิก\n\n` +
  `แพลตฟอร์มและผู้ให้คำปรึกษาไม่สามารถรับผิดชอบต่อการตัดสินใจหรือผลลัพธ์ที่เกิดขึ้นจากการรับคำปรึกษา หากอยู่ในภาวะวิกฤตหรือมีความเสี่ยงต่อชีวิต โปรดติดต่อสายด่วนสุขภาพจิต **1323** หรือหน่วยงานฉุกเฉินที่เกี่ยวข้อง\n` +
  `### 2. สำหรับผู้รับบริการ\n` +
  `* ต้องชำระเงินและส่งหลักฐานผ่านระบบก่อนเริ่มบริการ\n` +
  `* ห้ามคุกคาม ใช้ถ้อยคำหยาบคาย ล่วงละเมิด หรือมีพฤติกรรมเชิงชู้สาว/อนาจารต่อผู้ให้คำปรึกษา\n` +
  `* หากฝ่าฝืนกฎ ทีมงานสามารถยุติบริการได้ทันทีโดยไม่คืนเงิน\n` +
  `* คืนเงิน **100%** หากผู้ให้คำปรึกษาไม่มาตามนัด หรือระบบขัดข้องจนไม่สามารถให้บริการได้\n` +
  `* ไม่สามารถขอคืนเงินหลังเริ่มการสนทนาแล้ว เว้นแต่เข้าข่ายกรณีที่กำหนดไว้ในข้อตกลง\n\n` +
  `**กรณีผู้ให้คำปรึกษาทำผิดกฎ**\n` +
  `หากพบพฤติกรรมไม่เหมาะสม โปรดแจ้งทีมงานทันที หากตรวจสอบแล้วเป็นความจริง ผู้รับบริการสามารถเลือก:\n` +
  `1. รับเงินคืนเต็มจำนวน 100%\n` +
  `2. เปลี่ยนผู้ให้คำปรึกษา พร้อมรับเวลาสนทนาชดเชย 5 นาที โดยไม่เสียค่าใช้จ่าย\n` +
  `### 3. สำหรับผู้ให้คำปรึกษา\n` +
  `* ปฏิบัติงานในฐานะฟรีแลนซ์/พาร์ทไทม์ ไม่ใช่พนักงานประจำของเซิร์ฟเวอร์\n` +
  `* ต้องให้บริการตามเวลาที่ตกลงกับลูกค้าและปฏิบัติต่อผู้รับบริการอย่างเหมาะสม\n` +
  `* ห้ามนำลูกค้าไปรับงานหรือชำระเงินนอกระบบ รวมถึงห้ามส่งต่อช่องทางติดต่อส่วนตัวเพื่อวัตถุประสงค์ดังกล่าว\n` +
  `* ห้ามใช้ถ้อยคำหรือพฤติกรรมที่บั่นทอน คุกคาม หรือละเมิดผู้รับบริการ\n` +
  `* ต้องรักษาความลับของผู้รับบริการ และห้ามนำเรื่องราวไปเผยแพร่หรือส่งต่อ แม้จะไม่เปิดเผยชื่อ\n\n` +
  `การฝ่าฝืนอาจส่งผลให้ถูกยกเลิกสถานะผู้ให้คำปรึกษา และระงับสิทธิ์หรือรายได้ที่เกี่ยวข้องตามกรณี\n` +
  `### 4. ระบบรายได้และการจ่ายเงิน\n` +
  `ผู้ให้คำปรึกษาจะได้รับส่วนแบ่ง **70%** ของยอดบริการสุทธิที่ลูกค้าชำระจริง และแพลตฟอร์มหัก **30%** สำหรับค่าดำเนินงานและดูแลระบบ\n` +
  `* จ่ายส่วนแบ่งทุกวันที่ **15 และวันสิ้นเดือน**\n` +
  `* ต้องมียอดสะสมขั้นต่ำ **100 บาท** ต่อรอบ\n` +
  `* หากไม่ถึงเกณฑ์ จะทบยอดไปยังรอบถัดไป\n` +
  `* ประวัติการรับงานและรายการที่เกี่ยวข้องจะถูกบันทึกในระบบเพื่อให้ตรวจสอบได้\n` +
  `### 5. โปรโมชั่นและส่วนลด\n` +
  `- แพลตฟอร์มสามารถจัดโปรโมชั่น ส่วนลด หรือสิทธิพิเศษต่าง ๆ ได้ตามความเหมาะสม\n` +
  `- ส่วนแบ่ง 70% จะคำนวณจาก **ยอดสุทธิที่ลูกค้าชำระจริง** ไม่ใช่ราคาปกติของแพ็กเกจ\n` +
  `  - ตัวอย่าง: ราคา 69 บาท → ใช้ส่วนลดเหลือ 50 บาท → ส่วนแบ่ง 70% = **35 บาท**\n` +
  `### 6. ความเป็นส่วนตัว\n` +
  `- ข้อความ เสียง ข้อมูลการการชำระเงิน และห้อง Voice จะถือเป็นข้อมูลส่วนตัวและต้องได้รับการรักษาความลับ\n` +
  `- ระบบอาจจัดเก็บ Log หรือข้อมูลที่เกี่ยวข้องไว้ชั่วคราวเพื่อใช้ตรวจสอบข้อพิพาท การคืนเงิน หรือการตรวจสอบการให้บริการ และจะดำเนินการลบตามระยะเวลาที่ระบบกำหนด\n` +
  `### 7. การยอมรับข้อตกลง\n` +
  `การชำระเงินเพื่อเริ่มต้นการใช้บริการ หรือการสมัครเป็นผู้ให้คำปรึกษา ถือว่าผู้ใช้งานยอมรับข้อตกลงและเงื่อนไขฉบับนี้ หากมีการแก้ไขเงื่อนไข แพลตฟอร์มจะแจ้งให้ทราบตามความเหมาะสม`;

/**
 * สร้าง Action Row ปุ่มกดของการ์ดข้อตกลง
 */
function getActionRow() {
  return {
    type: 1, // Action Row
    components: [
      {
        type: 2, // Button
        style: 2, // Secondary (Grey)
        custom_id: CUSTOM_IDS.VIEW_FULL_TERMS,
        label: "⠀อ่านข้อตกลงฉบับเต็ม",
        emoji: {
          id: EMOJIS.HEART_GREEN_ID,
          name: "heartgreen",
          animated: false,
        },
      },
      {
        type: 2, // Button
        style: 2, // Secondary (Grey)
        custom_id: CUSTOM_IDS.ACCEPT_TERMS,
        label: "⠀ข้ามการอ่านและยินยอม",
        emoji: {
          id: EMOJIS.CHECKMARK_ID,
          name: "50121checkmark",
          animated: false,
        },
      },
    ],
  };
}

/**
 * สร้าง Container ของการ์ดข้อตกลง
 * @param {string} textContent เนื้อหาข้อความที่จะแสดงในการ์ด
 * @returns {object} Discord Component V2 Container (Type 17)
 */
function buildAgreementContainer(textContent) {
  return {
    type: 17,
    components: [
      {
        type: 14,
        spacing: 1,
        divider: false,
      },
      {
        type: 10,
        content: textContent,
      },
      {
        type: 14,
        spacing: 2,
        divider: true,
      },
      {
        type: 12,
        items: [
          {
            media: {
              url: BANNER_IMAGE.url,
              proxy_url: BANNER_IMAGE.proxy_url,
              width: BANNER_IMAGE.width,
              height: BANNER_IMAGE.height,
            },
            spoiler: false,
          },
        ],
      },
      {
        type: 14,
        divider: false,
      },
      getActionRow(),
    ],
    spoiler: false,
  };
}

/**
 * 1. Payload การ์ดข้อตกลงหลัก (สำหรับส่งผ่าน /send-component)
 */
function getMainAgreementPayload() {
  return {
    flags: FLAG_V2,
    components: [buildAgreementContainer(SUMMARY_TEXT)],
  };
}

/**
 * 2. Payload การ์ดข้อตกลงฉบับเต็ม 7 ข้อ (สำหรับปุ่ม heal_jai_view_full_terms - Ephemeral)
 */
function getFullTermsPayload() {
  return {
    flags: FLAG_V2 | FLAG_EPHEMERAL,
    components: [buildAgreementContainer(FULL_TERMS_TEXT)],
  };
}

/**
 * ฟังก์ชันช่วยแปลง Date เป็นข้อความเวลาประเทศไทย (DD/MM/YYYY HH:mm น.)
 */
function formatThaiDateTime(date = new Date()) {
  const options = {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  };
  const parts = new Intl.DateTimeFormat("en-GB", options).formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return {
    dateStr: `${map.day}/${map.month}/${map.year}`,
    timeStr: `${map.hour}:${map.minute}`,
    fullStr: `${map.day}/${map.month}/${map.year} ${map.hour}:${map.minute} น.`,
    versionTagStr: `v1.0 - ${map.day}/${map.month}/${map.year} ${map.hour}:${map.minute}`,
  };
}

/**
 * 3. Payload ยืนยันบันทึกความยินยอม (สำหรับปุ่ม heal_jai_accept_terms - 2 Containers Ephemeral)
 * @param {string} userId Discord User ID
 * @param {Date} [date] เวลาที่บันทึก
 */
function getConsentSuccessPayload(userId, date = new Date()) {
  const dt = formatThaiDateTime(date);

  const successContainer = {
    type: 17,
    components: [
      {
        type: 14,
        spacing: 1,
        divider: false,
      },
      {
        type: 10,
        content:
          `## ${EMOJIS.CLOVER}︲__\` บันทึกการยินยอมเงื่อนไขสำเร็จ ₊ (${dt.versionTagStr}) 𓂃 \`__\n` +
          `-# ระบบได้ทำการบันทึกข้อมูลและประทับเวลาการยินยอมนี้ไว้ในระบบฐานข้อมูลอย่างปลอดภัย เพื่อเป็นหลักฐานการใช้บริการตามนโยบายความเป็นส่วนตัว\n\n` +
          `- **ผู้ใช้งาน:** <@${userId}>\n` +
          `- **เวอร์ชันข้อตกลง:** \`v1.0\`\n` +
          `- **เวลาที่บันทึก:** \`${dt.fullStr}\`\n\n` +
          `${EMOJIS.GREEN_ARROW} **ขั้นตอนถัดไป:**\n` +
          `1. ~~<#1536199708593365084>~~\n` +
          `2. <#1536206516359532665> **<-- ขั้นตอนต่อไป**`,
      },
      {
        type: 14,
        spacing: 1,
        divider: false,
      },
    ],
    spoiler: false,
  };

  return {
    flags: FLAG_V2 | FLAG_EPHEMERAL,
    components: [
      buildAgreementContainer(SUMMARY_TEXT), // Container 1: การ์ดข้อตกลง
      successContainer,                      // Container 2: การ์ดบันทึกสำเร็จ
    ],
  };
}

module.exports = {
  CUSTOM_IDS,
  EMOJIS,
  BANNER_IMAGE,
  SUMMARY_TEXT,
  FULL_TERMS_TEXT,
  getMainAgreementPayload,
  getFullTermsPayload,
  getConsentSuccessPayload,
  formatThaiDateTime,
};
