const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");
const templates = require('./discohook_templates.json');

const FLAG_V2 = 32768; // MessageFlags.IsComponentsV2
const FLAG_EPHEMERAL = 64; // MessageFlags.Ephemeral

/**
 * Helper ปรับแต่ง Component v2 Payload ให้ปลอดภัย:
 * - ตัด Media Gallery ที่มี items ว่างออก (ป้องกัน Discord 400 Bad Request)
 * - ตัด flow metadata ของ Discohook ออกจาก Buttons
 */
function sanitizeComponentV2(payload) {
  if (!payload) return payload;
  if (Array.isArray(payload)) {
    return payload.map((item) => sanitizeComponentV2(item));
  }
  const clone = JSON.parse(JSON.stringify(payload));
  const isV2 = Boolean(
    (clone.flags && (clone.flags & FLAG_V2) !== 0) ||
    (Array.isArray(clone.components) && clone.components.some((c) => c && (c.type === 17 || c.type === 12 || c.type === 10)))
  );

  if (isV2) {
    // Discord Components V2 strictly prohibits top-level 'content' and 'embeds' fields
    delete clone.content;
    delete clone.embeds;
  } else if (clone.content === null || clone.content === undefined) {
    delete clone.content;
  }

  if (Array.isArray(clone.components)) {
    for (const topComp of clone.components) {
      if (topComp && Array.isArray(topComp.components)) {
        topComp.components = topComp.components.filter((c) => {
          if (!c) return false;
          if (c.type === 12 && (!c.items || c.items.length === 0)) return false;
          return true;
        });
        for (const subComp of topComp.components) {
          if (subComp && subComp.type === 1 && Array.isArray(subComp.components)) {
            for (const btn of subComp.components) {
              if (btn && btn.flow) {
                delete btn.flow;
              }
            }
          }
        }
      }
    }
  }
  return clone;
}

/**
 * 1. บอร์ดอ่านข้อตกลงและนโยบาย
 */
function buildAgreementPayload() {
  return sanitizeComponentV2(JSON.parse(JSON.stringify(templates.board_1_terms)));
}

/**
 * 2. บอร์ดเมนูเครื่องดื่มและสั่งบริการ
 */
function buildMainMenuPayload() {
  return sanitizeComponentV2(JSON.parse(JSON.stringify(templates.board_2_menu)));
}

/**
 * 3. แผงตอกบัตรเข้ากะของทีมงาน (Shift Panel)
 */
function buildShiftPanelPayload() {
  return sanitizeComponentV2(JSON.parse(JSON.stringify(templates.board_3_shift_panel)));
}

/**
 * 4. การ์ดยืนยันออเดอร์และจุดชำระเงิน (ในห้อง Private Ticket)
 * @param {object} orderInfo - { customerId, packageName, duration, totalPrice, isSilent, isSpecific, counselorName }
 */
function buildCheckoutTicketPayload(orderInfo = {}) {
  const payload = JSON.parse(JSON.stringify(templates.board_4_checkout_ticket));
  if (orderInfo && orderInfo.packageName) {
    const summaryLines = [
      `### <:matchamochi:1536695320174534699>︲__\` สรุปรายการคำสั่งซื้อของคุณ \`__`,
      `* 🍵⠀**แพ็กเกจ:** ${orderInfo.packageName} (${orderInfo.duration} นาที)`,
      orderInfo.isSilent ? `* 🌙⠀**ท็อปปิ้ง:** นั่งเงียบเป็นเพื่อน (+19 บาท)` : null,
      orderInfo.isSpecific && orderInfo.counselorName ? `* 🎯⠀**ระบุตัวผู้รับฟัง:** ${orderInfo.counselorName} (+39 บาท)` : null,
      orderInfo.isBooster ? `* <:boosthand:1536707497174507620>⠀**สิทธิพิเศษ:** Server Booster (+5 นาทีฟรี)` : null,
      `# ยอดชำระสุทธิ: ${orderInfo.totalPrice || 0} บาท`,
      ``,
      `**ช่องทางชำระเงิน (พร้อมเพย์):** \`09x-xxx-xxxx\` (ธ.กสิกรไทย / พร้อมเพย์)\n-# เมื่อโอนเงินเรียบร้อยแล้ว ให้แนบและส่งรูปภาพสลิปในห้องนี้ได้เลยค่ะ ระบบจะทำการตรวจสอบสลิปอัตโนมัติ 🍵`
    ].filter(Boolean).join('\n');

    // แทรกสรุปออเดอร์เข้าไปใน Text Display ก่อนข้อตกลง
    const container = payload.components[0];
    if (container && Array.isArray(container.components)) {
      container.components.unshift(
        { type: 10, content: summaryLines },
        { type: 14, divider: true, spacing: 2 }
      );
    }
  }
  return sanitizeComponentV2(payload);
}

/**
 * 5. การ์ดแจ้งเตือนรับเคสใหม่ (Targeted & Open Dispatch Component V2)
 * @param {object} dispatchInfo - { counselorId, customerId, topics, serviceMode, duration, totalPrice, expireTimestamp, orderCode, orderId }
 */
function buildDispatchAlertPayload(dispatchInfo = {}) {
  const counselorIdStr = typeof dispatchInfo.counselorId === 'string' ? dispatchInfo.counselorId.trim() : '';
  const isValidSnowflake = /^\d{17,20}$/.test(counselorIdStr);
  const isTargeted = Boolean(counselorIdStr) && isValidSnowflake;

  const counselorMention = isTargeted
    ? `<@${counselorIdStr}>`
    : `<@&1536208070420733982> *(เปิดรับคำขอสำหรับทุกคนที่ว่าง)*`;

  const contentMention = isTargeted
    ? `<@${counselorIdStr}> 🔔 มีเคสใหม่ส่งตรงถึงคุณ 𓂃`
    : `<@&1536208070420733982> 🔔 มีเคสใหม่เปิดรับคำขอ ผู้ที่พร้อมดูแลสามารถกดรับได้เลยค่ะ!`;

  const customerMention = dispatchInfo.customerId ? `<@${dispatchInfo.customerId}>` : `<@customer_id>`;
  const isVoice = (dispatchInfo.serviceMode === 'voice' || dispatchInfo.service_mode === 'voice');
  const modeEmoji = isVoice ? '🎙️' : '💬';
  const modeText = isVoice ? 'คอลเสียง (Voice)' : 'พิมพ์แชท (Chat)';

  let topicsText = "ไม่เจาะจง อยากได้เพื่อนนั่งรับฟัง";
  if (Array.isArray(dispatchInfo.topics) && dispatchInfo.topics.length > 0) {
    const validTopics = dispatchInfo.topics
      .filter((t) => t && typeof t === "string" && t.trim())
      .map((t) => TOPIC_LABEL_MAP[t.trim()] || t.trim());
    if (validTopics.length > 0) {
      topicsText = validTopics.join(", ");
    }
  } else if (typeof dispatchInfo.topics === "string" && dispatchInfo.topics.trim()) {
    topicsText = TOPIC_LABEL_MAP[dispatchInfo.topics.trim()] || dispatchInfo.topics.trim();
  }

  const duration = dispatchInfo.duration || dispatchInfo.totalMinutes || 30;
  const durationText = `${duration} นาที`;
  const totalPrice = dispatchInfo.totalPrice || (duration === 15 ? 39 : (duration === 60 ? 129 : 69));
  const counselorShare = (totalPrice * 0.70).toFixed(2);
  const expireTimestamp = dispatchInfo.expireTimestamp || Math.floor((Date.now() + 3 * 60 * 1000) / 1000);
  const targetId = dispatchInfo.orderCode || dispatchInfo.orderId || 'general';

  return sanitizeComponentV2({
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: "## <a:bellpress:1547361650552737914>︲__` 𝖭𝗈𝗍𝗂𝖼𝖾 ₊ มีเคสใหม่ส่งตรงถึงคุณ 𓂃 `__"
          },
          {
            type: 14,
            divider: true,
            spacing: 2
          },
          {
            type: 10,
            content: [
              `* 🎯⠀**ที่ปรึกษาที่ได้รับเลือก:** ${counselorMention}`,
              `* 👤⠀**ลูกค้า:** ${customerMention}`,
              `* 📚⠀**เรื่องที่ต้องการปรึกษา:** ${topicsText}`,
              `* ${modeEmoji}⠀**รูปแบบบริการ:** ${modeText}`,
              `* 🍵⠀**ระยะเวลา:** ${durationText}`,
              `* ⏳⠀**รอการกดรับเคส:** หมดเวลาใน **<t:${expireTimestamp}:R>** (3 นาที)`,
              `# ค่าตอบแทน: ${counselorShare} บาท (ส่วนแบ่ง 70% จาก ${totalPrice} บาท)`,
              `> ⚠️ *โปรดกดรับเคสภายใน 3 นาที หากไม่สะดวกสามารถกด **\"สละสิทธิ์\"** เพื่อให้ระบบสุ่มส่งต่อให้ท่านถัดไปได้ทันทีค่ะ*`
            ].join('\n')
          },
          {
            type: 14,
            divider: true,
            spacing: 2
          },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 3,
                label: "︲กดรับเคสนี้",
                emoji: {
                  id: "1358584609087946867",
                  name: "50121checkmark",
                  animated: false
                },
                custom_id: `heal_jai_claim_case_${targetId}`
              },
              {
                type: 2,
                style: 4,
                label: "︲สละสิทธิ์",
                emoji: {
                  name: "↩️"
                },
                custom_id: `heal_jai_pass_case_${targetId}`
              }
            ]
          }
        ]
      }
    ]
  });
}


/**
 * 6. แผงควบคุมในห้องสนทนาส่วนตัว (Session Dashboard)
 * @param {object} sessionInfo - { customerId, counselorId, counselorName, totalMinutes, isBooster, packageName, serviceMode, voiceChannelId }
 */
function buildSessionDashboardPayload(sessionInfo = {}) {
  const customerMention = `<@${sessionInfo.customerId}>`;
  const counselorName = sessionInfo.counselorName ? ` — คุณ${sessionInfo.counselorName}` : '';
  const counselorMention = `<@${sessionInfo.counselorId}>${counselorName}`;
  const totalMinutes = sessionInfo.totalMinutes || 30;
  const isVoice = sessionInfo.serviceMode === 'voice';
  const boosterNote = sessionInfo.isBooster ? ' (รวมโบนัส Booster +5 นาที)' : '';
  const voiceNote = (isVoice && sessionInfo.voiceChannelId)
    ? `\n* 🎙️⠀**ห้องเสียง:** <#${sessionInfo.voiceChannelId}>`
    : '';

  const headerTitle = isVoice
    ? "## <:cupofmatcha:1536694010780065863>︲__` 𝖵𝗈𝗂𝖼𝖾 𝗋𝗈𝗈𝗆 ₊ ยินดีต้อนรับสู่ห้องสนทนาส่วนตัว 𓂃 `__"
    : "## <:cupofmatcha:1536694010780065863>︲__` 𝖳𝖾𝗑𝗍 𝖼𝗁𝖺𝗍 ₊ ยินดีต้อนรับสู่ห้องสนทนาส่วนตัว 𓂃 `__";

  return sanitizeComponentV2({
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
                  url: "https://cdn.discordapp.com/attachments/1536267579843280987/1555726594474250270/BannerMain.png?backend=b2&ex=6ac192cc&is=6ac0414c&hm=ae7424b1a41702aab1336cd7cd8c9d9d2820a025e3104157a4796a4308065413&"
                }
              }
            ]
          },
          {
            type: 14,
            divider: false,
            spacing: 1
          },
          {
            type: 10,
            content: [
              headerTitle,
              "-# พื้นที่ปลอดภัยของคุณเปิดให้บริการแล้ว ขอให้เป็นช่วงเวลาที่อบอุ่นและผ่อนคลายนะคะ\n",
              `* 👤⠀**ลูกค้า:** ${customerMention}`,
              `* 🍵⠀**ผู้รับฟัง:** ${counselorMention}`,
              `* ⏱️⠀**เวลาให้บริการ:** ${totalMinutes} นาที${boosterNote}${voiceNote}\n`,
              "> 💡 *เมื่อทั้งสองฝ่ายพร้อม ให้ที่ปรึกษากดปุ่ม **\"▶️ เริ่มเซสชัน\"** ด้านล่างเพื่อเริ่มจับเวลา ระบบจะแจ้งเตือนเมื่อเหลือ 5 นาที / 1 นาที และปิดห้องอัตโนมัติเมื่อครบเวลาค่ะ*"
            ].join('\n')
          },
          {
            type: 14,
            divider: true,
            spacing: 2
          },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 3,
                label: "︲เริ่มเซสชัน",
                emoji: {
                  name: "▶️"
                },
                custom_id: "heal_jai_start_session"
              },
              {
                type: 2,
                style: 4,
                label: "︲จบบริการ (ก่อนเวลา)",
                emoji: {
                  name: "⏹️"
                },
                custom_id: "heal_jai_end_session"
              }
            ]
          }
        ]
      }
    ]
  });
}

/**
 * 7. การ์ดส่งความประทับใจสำหรับส่งให้ลูกค้า (Prompt Rating)
 */
function buildFeedbackPromptPayload() {
  return sanitizeComponentV2(JSON.parse(JSON.stringify(templates.board_7_feedback_card)));
}

/**
 * 8. การ์ดแสดงผลความประทับใจสาธารณะในห้อง 🌟︰กล่องความประทับใจ (Public Showcase)
 * @param {object} reviewData - { counselorId, customerId, rating, comment, packageName, isAnonymous, sessionNumber, dateStr }
 */
function buildPublicReviewShowcasePayload(reviewData) {
  const starsStr = '⭐'.repeat(reviewData.rating || 5) + ` (${reviewData.rating || 5}/5)`;
  const authorDisplay = reviewData.isAnonymous ? 'คุณหมีนิรนาม 🐻' : `<@${reviewData.customerId}>`;
  const counselorMention = `<@${reviewData.counselorId}>`;
  const packageName = reviewData.packageName || 'โกโก้พักใจ 30 นาที';
  const commentText = reviewData.comment || 'บริการดีมาก รับฟังอย่างเข้าใจและอบอุ่นใจมากค่ะ';
  const dateStr = reviewData.dateStr || new Date().toLocaleDateString('th-TH', { year: 'numeric', month: 'long', day: 'numeric' });
  const sessionNum = reviewData.sessionNumber ? ` • แก้วที่เสิร์ฟ: #${reviewData.sessionNumber}` : '';

  return sanitizeComponentV2({
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
                  url: 'https://cdn.discordapp.com/attachments/1536267579843280987/1547369073455800360/NewsBoard_-_bearcafe_35.png'
                }
              }
            ]
          },
          {
            type: 14,
            divider: false,
            spacing: 1
          },
          {
            type: 10,
            content: [
              `## <a:heartoutlines:1536268541144076369>︲__\` กล่องความประทับใจ ₊ เสิร์ฟความอบอุ่นสำเร็จ 𓂃 \`__`,
              `-# บันทึกความรู้สึกดีๆ จากผู้ใช้บริการพื้นที่ปลอดภัย Bear Cafe ฮีลใจ\n`,
              `* 🍵 **บาริสต้าผู้ดูแล:** ${counselorMention}`,
              `* ⏱️ **แพ็กเกจ:** ${packageName}`,
              `* ⭐ **คะแนนความพึงพอใจ:** ${starsStr}`,
              `* 👤 **จาก:** ${authorDisplay}\n`,
              `> 💬 *"${commentText}"*`
            ].join('\n')
          },
          {
            type: 14,
            spacing: 1,
            divider: true
          },
          {
            type: 10,
            content: `-# 🕒 วันที่ใช้บริการ: ${dateStr}${sessionNum}`
          }
        ]
      }
    ]
  });
}

/**
 * 9. สร้าง Modal สำหรับกรอกรีวิวและให้คะแนนความพึงพอใจ
 * @param {number|string} defaultRating
 */
function buildReviewModal(defaultRating = 5) {
  const modal = new ModalBuilder()
    .setCustomId("heal_jai_modal_review")
    .setTitle("🌟 บันทึกความประทับใจ Bear Cafe");

  const ratingInput = new TextInputBuilder()
    .setCustomId("review_rating")
    .setLabel("คะแนนความพึงพอใจ (ตัวเลข 1 - 5 ดาว)")
    .setStyle(TextInputStyle.Short)
    .setMinLength(1)
    .setMaxLength(1)
    .setValue(String(defaultRating || 5))
    .setPlaceholder("5")
    .setRequired(true);

  const commentInput = new TextInputBuilder()
    .setCustomId("review_comment")
    .setLabel("ความรู้สึก / ข้อความถึงผู้รับฟัง 🐻")
    .setStyle(TextInputStyle.Paragraph)
    .setMinLength(2)
    .setMaxLength(1000)
    .setPlaceholder("เล่าความประทับใจ หรือข้อความที่อยากบอกบาริสต้า...")
    .setRequired(true);

  const anonInput = new TextInputBuilder()
    .setCustomId("review_anonymous")
    .setLabel("การระบุชื่อ (พิมพ์ 'นิรนาม' หรือ 'แสดงชื่อ')")
    .setStyle(TextInputStyle.Short)
    .setMaxLength(20)
    .setValue("แสดงชื่อ")
    .setPlaceholder("แสดงชื่อ หรือ นิรนาม")
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(ratingInput),
    new ActionRowBuilder().addComponents(commentInput),
    new ActionRowBuilder().addComponents(anonInput)
  );

  return modal;
}

// ── ข้อมูลเมนูเครื่องดื่มและท็อปปิ้งสำหรับระบบ Interactive Selection (โหลดจาก menuData.json) ──────
const menuData = require("./menuData.json");
const SERVICE_MODES = menuData.serviceModes || {};
const DRINK_OPTIONS = menuData.drinkOptions || {};
const TOPPING_OPTIONS = menuData.toppingOptions || {};

// ── ข้อมูลตัวเลือกสำหรับการปรึกษา (Single-Screen Component V2) ────────
const TOPIC_OPTIONS = [
  {
    label: "ปัญหาการเรียน หรือ ชีวิตวัยรุ่น",
    value: "study_life",
    emoji: { name: "📚" }
  },
  {
    label: "ปัญหาความรัก หรือ ความสัมพันธ์",
    value: "love_relation",
    emoji: { name: "💞" }
  },
  {
    label: "การพัฒนาตัวเอง หรือ ให้กำลังใจ",
    value: "self_dev",
    emoji: { name: "🌱" }
  },
  {
    label: "ปัญหาการทำงาน หรือ เพื่อนร่วมงาน",
    value: "work_colleague",
    emoji: { name: "👜" }
  },
  {
    label: "ไม่เจาะจง อยากได้เพื่อนนั่งรับฟัง",
    value: "general_listen",
    emoji: { name: "☕" }
  }
];

const TOPIC_LABEL_MAP = {
  study_life: "ปัญหาการเรียน หรือ ชีวิตวัยรุ่น",
  love_relation: "ปัญหาความรัก หรือ ความสัมพันธ์",
  self_dev: "การพัฒนาตัวเอง หรือ ให้กำลังใจ",
  work_colleague: "ปัญหาการทำงาน หรือ เพื่อนร่วมงาน",
  general_listen: "ไม่เจาะจง อยากได้เพื่อนนั่งรับฟัง",
  // รองรับรหัสชั่วคราวจาก Discohook
  "9NDaO0aVx4": "ปัญหาการเรียน หรือ ชีวิตวัยรุ่น",
  "7ggttDdJcM": "ปัญหาความรัก หรือ ความสัมพันธ์",
  "ReQDCKwjI7": "การพัฒนาตัวเอง หรือ ให้กำลังใจ",
  "d6Dh07MTWL": "ปัญหาการทำงาน หรือ เพื่อนร่วมงาน",
  "UwkEQQYD3R": "ไม่เจาะจง อยากได้เพื่อนนั่งรับฟัง"
};

const MODE_OPTIONS = [
  {
    label: "พิมพ์แชทปรึกษา",
    value: "chat",
    description: "เหมาะสำหรับเธอที่ไม่สะดวกคอลเสียง หรือสบายใจกับการพูดคุยผ่านข้อความ",
    emoji: { name: "💬" }
  },
  {
    label: "คอลเสียงปรึกษา",
    value: "voice",
    description: "เหมาะสำหรับเธอที่อยากพูดคุยและระบายความรู้สึกผ่านเสียง พร้อมมีคนคอยรับฟังอย่างตั้งใจ",
    emoji: { name: "🎙️" }
  }
];

const DURATION_OPTIONS = [
  {
    label: "15 นาที — 39 บาท",
    value: "tea_39",
    duration: 15,
    price: 39,
    tier: "S",
    emoji: { name: "🇸" }
  },
  {
    label: "30 นาที — 69 บาท",
    value: "cocoa_69",
    duration: 30,
    price: 69,
    tier: "M",
    emoji: { name: "🇲" }
  },
  {
    label: "1 ชั่วโมง — 129 บาท",
    value: "coffee_129",
    duration: 60,
    price: 129,
    tier: "L",
    emoji: { name: "🇱" }
  }
];

const DURATION_LABEL_MAP = {
  tea_39: "15 นาที — 39 บาท",
  cocoa_69: "30 นาที — 69 บาท",
  coffee_129: "1 ชั่วโมง — 129 บาท",
  lNbkUYHR3P: "15 นาที — 39 บาท",
  vrSJVNCNIv: "30 นาที — 69 บาท",
  mJwZm8fY2y: "1 ชั่วโมง — 129 บาท"
};

const MOCK_COUNSELORS = {
  counselor_ciew: {
    id: "counselor_ciew",
    name: "คุณซีบิว",
    label: "คุณซีบิว",
    description: "คลิกเพื่อดูรายละเอียด",
    bio: "ใจดี อบอุ่น รับฟังทุกเรื่องได้อย่างสบายใจ 🍵 พร้อมรับฟังและอยู่เคียงข้างคุณเสมอค่ะ",
    emoji: "🍀"
  },
  counselor_sugar: {
    id: "counselor_sugar",
    name: "น้องหมีชูการ์ 🐻",
    label: "น้องหมีชูการ์ 🐻",
    description: "คลิกเพื่อดูรายละเอียด",
    bio: "ใจดี อบอุ่น รับฟังทุกเรื่องได้อย่างสบายใจ",
    emoji: "🐻"
  },
  counselor_sakura: {
    id: "counselor_sakura",
    name: "คุณหมีซากุระ 🌸",
    label: "คุณหมีซากุระ 🌸",
    description: "คลิกเพื่อดูรายละเอียด",
    bio: "สายผ่อนคลาย คุยสบาย สไตล์เพื่อนข้างห้อง",
    emoji: "🌸"
  },
  counselor_mocha: {
    id: "counselor_mocha",
    name: "บาริสต้าหมีมอคค่า ☕",
    label: "บาริสต้าหมีมอคค่า ☕",
    description: "คลิกเพื่อดูรายละเอียด",
    bio: "รับฟังนิ่งๆ ใจเย็น ให้พื้นที่ปลอดภัยเต็มที่",
    emoji: "☕"
  },
  counselor_honey: {
    id: "counselor_honey",
    name: "หมีน้อยฮันนี่ 🍯",
    label: "หมีน้อยฮันนี่ 🍯",
    description: "คลิกเพื่อดูรายละเอียด",
    bio: "พลังบวก สดใส ให้กำลังใจเก่ง",
    emoji: "🍯"
  }
};

/**
 * Helper ดึง Discord User Mention (<@123456789...>) จาก ID หรือ User Object อย่างปลอดภัย
 */
function resolveUserMention(userOrId) {
  if (!userOrId) return "";
  if (typeof userOrId === "object") {
    const id = userOrId.id || userOrId.userId || userOrId.customerId;
    if (id && /^\d{17,20}$/.test(id)) return `<@${id}>`;
  }
  if (typeof userOrId === "string") {
    const trimmed = userOrId.trim();
    if (/^<@!?\d{17,20}>$/.test(trimmed)) return trimmed;
    const match = trimmed.match(/\d{17,20}/);
    if (match) return `<@${match[0]}>`;
  }
  return "";
}

/**
 * สร้างหน้าต้อนรับเริ่มต้นสำหรับสอบถามความต้องการก่อนสั่งเครื่องดื่ม (Step 0)
 */
function buildInitialWelcomePayload(userId = null) {
  const userMention = resolveUserMention(userId);
  const mentionLine = userMention ? `${userMention} เลือกบริการที่เหมาะกับความต้องการของเธอได้เลย:` : "เลือกบริการที่เหมาะกับความต้องการของเธอได้เลย:";
  return sanitizeComponentV2({
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
                  url: "https://cdn.discordapp.com/attachments/1536267579843280987/1555726594474250270/BannerMain.png?backend=b2&ex=6acd704c&is=6acc1ecc&hm=e2156adb074205ce49bb66586bca4cd5a520b64a4d7fef28e7d926fa0b20bd1e&"
                }
              }
            ]
          },
          {
            type: 14,
            spacing: 2
          },
          {
            type: 10,
            content: `## <:hj_clover:1552227021122314250>︲__\` เราขอถามเธอก่อนสั่งเครื่องดื่มก่อนน้า 𓂃 \`__\n${mentionLine}`
          },
          {
            type: 14,
            spacing: 1,
            divider: false
          },
          {
            type: 1,
            components: [
              {
                type: 3,
                custom_id: "heal_jai_select_intent",
                placeholder: "เลือก . . . ",
                min_values: 1,
                max_values: 1,
                options: [
                  {
                    label: "พร้อมสั่งเมนูแล้ว",
                    value: "Krco1jPP16",
                    description: "เลือกเวลาและรูปแบบการพูดคุยที่ต้องการ",
                    emoji: {
                      id: "1536694010780065863",
                      name: "cupofmatcha",
                      animated: false
                    }
                  },
                  {
                    label: "ขอคำแนะนำจากแอดมิน",
                    value: "gEEMy7yZcO",
                    description: "สอบถามแพ็กเกจ ขั้นตอนการใช้บริการ หรือเงื่อนไขก่อนตัดสินใจ",
                    emoji: {
                      id: "1547361650552737914",
                      name: "bellpress",
                      animated: true
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  });
}

/**
 * สร้างหน้าจอสำหรับกรณีลูกค้าเลือกขอคำแนะนำจากแอดมิน (Inquiry Mode)
 */
function buildInquiryAdminPayload(userId = null) {
  const userMention = resolveUserMention(userId);
  const mentionLine = userMention ? `${userMention} เลือกบริการที่เหมาะกับความต้องการของเธอได้เลย:` : "เลือกบริการที่เหมาะกับความต้องการของเธอได้เลย:";
  return sanitizeComponentV2({
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
                  url: "https://cdn.discordapp.com/attachments/1536267579843280987/1555726594474250270/BannerMain.png?backend=b2&ex=6acd704c&is=6acc1ecc&hm=e2156adb074205ce49bb66586bca4cd5a520b64a4d7fef28e7d926fa0b20bd1e&"
                }
              }
            ]
          },
          {
            type: 14,
            spacing: 2
          },
          {
            type: 10,
            content: `## <:hj_clover:1552227021122314250>︲__\` เราขอถามเธอก่อนสั่งเครื่องดื่มก่อนน้า 𓂃 \`__\n${mentionLine}`
          },
          {
            type: 14,
            spacing: 1,
            divider: false
          },
          {
            type: 1,
            components: [
              {
                type: 3,
                custom_id: "heal_jai_select_intent",
                placeholder: "เลือก . . . ",
                min_values: 1,
                max_values: 1,
                options: [
                  {
                    label: "พร้อมสั่งเมนูแล้ว",
                    value: "Krco1jPP16",
                    description: "เลือกเวลาและรูปแบบการพูดคุยที่ต้องการ",
                    emoji: {
                      id: "1536694010780065863",
                      name: "cupofmatcha",
                      animated: false
                    }
                  },
                  {
                    label: "ขอคำแนะนำจากแอดมิน",
                    value: "gEEMy7yZcO",
                    description: "สอบถามแพ็กเกจ ขั้นตอนการใช้บริการ หรือเงื่อนไขก่อนตัดสินใจ",
                    emoji: {
                      id: "1547361650552737914",
                      name: "bellpress",
                      animated: true
                    }
                  }
                ]
              }
            ]
          }
        ]
      },
      {
        type: 17,
        components: [
          {
            type: 10,
            content: "## <a:511398spin:1536700803732209736> <@&1536208040582316032> มีลูกค้าต้องการสอบถามรายละเอียดเครื่องดื่ม มาโต๊ะนี้หน่อยค่ะ!\n> ทางเราทำการติดต่อแอดมินให้แล้ว พิมพ์คำถามทิ้งไว้ได้เลยค่ะ อาจล่าช้าเนื่องจากพนักงานไม่เพียงพอ :>"
          },
          {
            type: 14,
            spacing: 2
          },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 3,
                custom_id: "heal_jai_btn_ready_to_order",
                label: "พร้อมสั่งเมนูแล้ว",
                emoji: {
                  id: "1536694010780065863",
                  name: "cupofmatcha",
                  animated: false
                }
              },
              {
                type: 2,
                style: 4,
                custom_id: "heal_jai_btn_close_inquiry",
                label: "เสร็จสิ้น / ปิดห้อง",
                emoji: {
                  name: "✖️"
                }
              }
            ]
          }
        ]
      }
    ]
  });
}

/**
 * สร้างการ์ดเลือกรูปแบบการปรึกษา (All-in-One Form Component v2)
 * @param {object} params - { userId, customerId, topics, mode, drinkId, userAvatarUrl }
 */
function buildInteractiveOrderPayload({
  userId = null,
  customerId = null,
  topics = [],
  mode = null,
  drinkId = null,
  userAvatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png"
} = {}) {
  const userMention = resolveUserMention(customerId || userId);
  const userDisplay = userMention ? `- ${userMention}\n` : "";

  const selectedTopics = Array.isArray(topics) ? topics : (topics ? [topics] : []);
  const selectedMode = mode || null;
  const selectedDrinkId = drinkId || null;

  // 1. SelectMenu 1: เรื่องที่ต้องการปรึกษา (Multi-select 1-5)
  const topicMenuOptions = TOPIC_OPTIONS.map((opt) => ({
    label: opt.label,
    value: opt.value,
    emoji: opt.emoji,
    default: selectedTopics.includes(opt.value) || selectedTopics.includes(opt.label)
  }));

  // 2. SelectMenu 2: สะดวกปรึกษาแบบใด (Single-select)
  const modeMenuOptions = MODE_OPTIONS.map((opt) => ({
    label: opt.label,
    value: opt.value,
    description: opt.description,
    emoji: opt.emoji,
    default: selectedMode === opt.value
  }));

  // 3. SelectMenu 3: เลือกระยะเวลาปรึกษา (Single-select)
  const durationMenuOptions = DURATION_OPTIONS.map((opt) => ({
    label: opt.label,
    value: opt.value,
    emoji: opt.emoji,
    default: selectedDrinkId === opt.value
  }));

  return sanitizeComponentV2({
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
                  url: "https://cdn.discordapp.com/attachments/1536267579843280987/1559836615667355688/ebc00c498ed4a75c.png?ex=6ad0868d&is=6acf350d&hm=ba63587c457fe078eab3b7ebf035b7b6bc769ce37214347c8e4ef45ad119f6a0&"
                }
              }
            ]
          },
          {
            type: 10,
            content: `## <a:hj_kittypaw:1552270687295643709>︲__\` 𝖲𝖾𝗅𝖾𝖼𝗍 𝖺 𝗌𝖾𝗋𝗏𝗂𝖼𝖾 ₊ เลือกรูปแบบการปรึกษา 𓂃  \`__\n${userDisplay}`
          },
          {
            type: 14,
            divider: true,
            spacing: 2
          },
          {
            type: 10,
            content: "### <:pastelgreen1:1559834039106412565>⠀เรื่องที่ต้องการปรึกษา"
          },
          {
            type: 1,
            components: [
              {
                type: 3,
                custom_id: "heal_jai_select_topic",
                options: topicMenuOptions,
                placeholder: "🔻 คลิกเลือก...",
                min_values: 1,
                max_values: 5
              }
            ]
          },
          {
            type: 10,
            content: "### <:pastelgreen2:1559834069523501096>⠀สะดวกปรึกษาแบบใด"
          },
          {
            type: 1,
            components: [
              {
                type: 3,
                custom_id: "heal_jai_select_mode",
                options: modeMenuOptions,
                placeholder: "🔻 คลิกเลือก...",
                min_values: 1,
                max_values: 1
              }
            ]
          },
          {
            type: 10,
            content: "### <:pastelgreen3:1559834113396047882>⠀เลือกระยะเวลาปรึกษา"
          },
          {
            type: 1,
            components: [
              {
                type: 3,
                custom_id: "heal_jai_select_duration",
                options: durationMenuOptions,
                placeholder: "🔻 คลิกเลือก...",
                min_values: 1,
                max_values: 1
              }
            ]
          },
          {
            type: 14,
            divider: false,
            spacing: 2
          },
          {
            type: 1,
            components: [
              {
                style: 3,
                type: 2,
                label: "︲ยืนยันคำสั่งซื้อ",
                emoji: {
                  id: "1358584609087946867",
                  name: "50121checkmark",
                  animated: false
                },
                custom_id: "heal_jai_btn_pay"
              },
              {
                style: 4,
                type: 2,
                label: "︲ยกเลิกออเดอร์",
                emoji: {
                  id: "1358584606911369226",
                  name: "68440x",
                  animated: false
                },
                custom_id: "btn_cancel_order"
              },
              {
                style: 1,
                type: 2,
                label: "︲สั่งใหม่",
                emoji: {
                  name: "🔃"
                },
                custom_id: "heal_jai_reset_order"
              }
            ]
          },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: "︲คลิกหากพบปัญหา",
                url: "https://discord.com/channels/1536199707922141254/1536207517120466964",
                emoji: {
                  id: "1537037333847605278",
                  name: "greenalert",
                  animated: false
                }
              }
            ]
          }
        ]
      }
    ]
  });
}

/**
 * การ์ดแจ้งเตือนกรณีลูกค้ายังเลือกข้อมูลในเมนูไม่ครบถ้วน (Component V2)
 */
function buildIncompleteOrderWarningPayload({
  missingTopics = false,
  missingMode = false,
  missingDuration = false,
  customerId = null
} = {}) {
  const userMention = resolveUserMention(customerId);
  const userHeader = userMention ? `${userMention} ` : "";

  const checklistItems = [
    missingTopics
      ? "* ❌⠀**<:pastelgreen1:1559834039106412565> เรื่องที่ต้องการปรึกษา:** ` ยังไม่ได้เลือก ` *(เลือกได้ 1–5 เรื่อง)*"
      : "* ✅⠀**<:pastelgreen1:1559834039106412565> เรื่องที่ต้องการปรึกษา:** ` เลือกเรียบร้อยแล้ว `",
    missingMode
      ? "* ❌⠀**<:pastelgreen2:1559834069523501096> รูปแบบการปรึกษา:** ` ยังไม่ได้เลือก ` *(พิมพ์แชท หรือ คอลเสียง)*"
      : "* ✅⠀**<:pastelgreen2:1559834069523501096> รูปแบบการปรึกษา:** ` เลือกเรียบร้อยแล้ว `",
    missingDuration
      ? "* ❌⠀**<:pastelgreen3:1559834113396047882> ระยะเวลาปรึกษา:** ` ยังไม่ได้เลือก ` *(15 นาที, 30 นาที หรือ 1 ชั่วโมง)*"
      : "* ✅⠀**<:pastelgreen3:1559834113396047882> ระยะเวลาปรึกษา:** ` เลือกเรียบร้อยแล้ว `"
  ].join("\n");

  return sanitizeComponentV2({
    flags: FLAG_V2 | FLAG_EPHEMERAL,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `## <a:bellpress:1547361650552737914>︲__\` กรุณาเลือกข้อมูลให้ครบถ้วนก่อนน้า 𓂃 \`__\n-# ${userHeader}ดูเหมือนว่าเธอยังไม่ได้เลือกรายการต่อไปนี้ให้ครบถ้วนก่อนยืนยันคำสั่งซื้อค่ะ 🍵\n`
          },
          {
            type: 14,
            divider: true,
            spacing: 2
          },
          {
            type: 10,
            content: `### 📋⠀รายการตรวจสอบข้อมูลการสั่งซื้อ :\n${checklistItems}\n\n> 💡 *โปรดเลื่อนขึ้นไปเลือกเมนูใน Dropdown ให้ครบทั้ง 3 รายการ จากนั้นกดปุ่ม **\"ยืนยันคำสั่งซื้อ\"** อีกครั้งนะคะ*`
          }
        ]
      }
    ]
  });
}


// ── ฟังก์ชันคงไว้สำหรับความเข้ากันได้ ─────────────────────────────────
function buildInteractiveMenuPayload(params) {
  return buildInteractiveOrderPayload(params);
}

/**
 * สร้างการ์ดชำระเงิน (Scan to Pay Component v2)
 */
function buildScanToPayPayload(orderInfo = {}) {
  const isVoice = orderInfo.mode === "voice" || orderInfo.serviceMode === "voice";
  const modeEmoji = isVoice ? "🎙️" : "💬";
  const modeText = isVoice ? "คอลเสียง (Voice)" : "พิมพ์แชท (Chat)";
  const customerMention = resolveUserMention(orderInfo.customerId || orderInfo.userId);
  const customerDisplay = customerMention || "ลูกค้า";

  const duration = orderInfo.duration || 30;
  const durationText = `${duration} นาที`;
  const totalPrice = orderInfo.totalPrice || (duration === 15 ? 39 : (duration === 60 ? 129 : 69));

  return sanitizeComponentV2({
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
                  url: "https://cdn.discordapp.com/attachments/1536267579843280987/1559846463712927864/1.png?ex=6ad08fb9&is=6acf3e39&hm=78f78e39b60b7b8b901850c8384d14f2084fec5432a369a7208146f174f2a176&"
                }
              }
            ]
          },
          {
            type: 14,
            divider: false,
            spacing: 1
          },
          {
            type: 10,
            content: "## <:cupofmatcha:1536694010780065863>︲__` 𝖲𝖼𝖺𝗇 𝗍𝗈 𝗉𝖺𝗒 ₊ ชำระเงิน 𓂃 `__\n-# กรุณาตรวจสอบข้อมูลและยอดเงินให้ถูกต้องก่อนทำรายการ หากโอนเงินผิดหรือโอนเกิน ทางเซิร์ฟเวอร์ขอสงวนสิทธิ์ไม่รับผิดชอบในทุกกรณี\n"
          },
          {
            type: 14,
            divider: true,
            spacing: 2
          },
          {
            type: 10,
            content: `### สรุปรายการคำสั่งซื้อของคุณ :\n- 🌿⠀**ลูกค้า**: ${customerDisplay}\n- ${modeEmoji}⠀**รูปแบบบริการ:** ${modeText}\n- 🍵⠀**แพ็กเกจ:** ${durationText}\n# ยอดชำระ: ${totalPrice} บาท\n> <a:bellpress:1547361650552737914> เมื่อโอนเงินเรียบร้อยแล้ว ให้แนบและส่งรูปภาพสลิปในห้องนี้ได้เลยค่ะ ทีมงานจะเข้ามาเช็กภายใน 5-10 นาที หากนานกว่านั้นกดปุ่ม **คลิกหากพบปัญหา** `
          },
          {
            type: 14,
            divider: true,
            spacing: 2
          },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 4,
                label: "︲ยกเลิกออเดอร์",
                emoji: {
                  id: "1358584606911369226",
                  name: "68440x",
                  animated: false
                },
                custom_id: "btn_cancel_order"
              },
              {
                type: 2,
                style: 5,
                label: "︲คลิกหากพบปัญหา",
                emoji: {
                  id: "1537037333847605278",
                  name: "greenalert",
                  animated: false
                },
                url: "https://discord.com/channels/1536199707922141254/1536207517120466964"
              }
            ]
          }
        ]
      }
    ]
  });
}

const ALL_SPECIALTIES = [
  "ปัญหาการเรียน หรือ ชีวิตวัยรุ่น",
  "ปัญหาความรัก หรือ ความสัมพันธ์",
  "ปัญหาการทำงาน หรือ เพื่อนร่วมงาน",
  "การพัฒนาตัวเอง หรือ ให้กำลังใจ",
  "ไม่เจาะจง ขอแค่เป็นพื้นที่ปลอดภัยให้ระบายความในใจ"
];

/**
 * 12. บัตรประจำตัวผู้รับฟัง / พนักงาน (Counselor Card Component V2)
 * @param {object} counselorData - ข้อมูลพนักงานจาก Supabase
 * @param {import("discord.js").GuildMember} member - Discord Guild Member
 */
function buildCounselorCardPayload(counselorData = {}, member = null, options = {}) {
  const status = counselorData.status || "OFFLINE";
  let statusText = "⚪ พักรับงาน";
  if (status === "ONLINE") {
    statusText = "🟢 พร้อมรับงาน";
  } else if (status === "BUSY") {
    statusText = "🟡 กำลังให้บริการ";
  }

  const displayName = counselorData.display_name || member?.displayName || member?.user?.username || "ผู้รับฟังประจำร้าน";
  const userId = counselorData.user_id || member?.id || "0";
  const bio = counselorData.bio || "ยินดีต้อนรับสู่พื้นที่พักใจ พร้อมรับฟังและอยู่เคียงข้างคุณเสมอค่ะ";
  const avatarUrl = counselorData.image_url || member?.displayAvatarURL?.({ extension: "png", size: 512 }) || "https://cdn.discordapp.com/attachments/1536267579843280987/1547362521919529081/New_premium_11.png";
  const totalSessions = counselorData.total_sessions || 0;
  const rating = Number(counselorData.average_rating || 5.0).toFixed(2);
  const totalReviews = counselorData.total_reviews || 0;

  const selectedSpecialties = Array.isArray(counselorData.specialty_tags) && counselorData.specialty_tags.length > 0
    ? counselorData.specialty_tags
    : ALL_SPECIALTIES;

  const specialtiesList = selectedSpecialties.map(s => `(<:50121checkmark:1358584609087946867>)⠀${s}`);

  const specialtiesContent = [
    "### ความถนัดเฉพาะ:",
    ...(specialtiesList.length > 0 ? specialtiesList : ["*(ยังไม่ได้ระบุความถนัด)*"])
  ].join("\n");

  const serviceModes = Array.isArray(counselorData.service_modes) && counselorData.service_modes.length > 0
    ? counselorData.service_modes
    : ["chat", "voice"];

  const servicesList = [];
  if (serviceModes.includes("voice")) servicesList.push("`[🔊 คอลเสียง]`");
  if (serviceModes.includes("chat")) servicesList.push("`[💬 พิมพ์คุย]`");
  if (counselorData.is_silent_companion) servicesList.push("`[🍃 โหมดนั่งเงียบเป็นเพื่อน]`");
  if (servicesList.length === 0) servicesList.push("`[💬 พิมพ์คุย]`");

  const servicesText = servicesList.join(" ");

  const mentionText = displayName;

  const topContent = [
    `## <:idolgreensuki:1554499554575913041>︲${mentionText}`,
    `" ${bio} "\n`,
    `> สถานะการทำงาน: \`${statusText}\``,
    `> บริการ: ${servicesText}`,
    `> คะแนนเฉลี่ย: ${rating} / 5.00 (${totalReviews} รีวิว)`,
    `> บริการสำเร็จ: ${totalSessions} คน`
  ].join("\n");

  const cardComponents = [
    {
      type: 9,
      components: [
        {
          type: 10,
          content: topContent
        }
      ],
      accessory: {
        type: 11,
        media: {
          url: avatarUrl
        }
      }
    },
    {
      type: 10,
      content: specialtiesContent
    }
  ];

  if (options.showBackButton || options.showInteractiveButtons) {
    const counselorConfirmId = options.counselorId ? `heal_jai_confirm_counselor_${options.counselorId}` : "heal_jai_confirm_counselor";
    cardComponents.push(
      {
        type: 14,
        divider: true,
        spacing: 2
      },
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 3,
            label: "︲เลือกผู้รับฟังท่านนี้",
            emoji: { name: "✅" },
            custom_id: counselorConfirmId
          },
          {
            type: 2,
            style: 2,
            label: "︲ย้อนกลับไป",
            emoji: { name: "↩️" },
            custom_id: "heal_jai_back_to_counselor_select"
          },
          {
            type: 2,
            style: 5,
            label: "︲คลิกหากพบปัญหา",
            emoji: { name: "🚨" },
            url: "https://discord.com/channels/1536199707922141254/1536207517120466964"
          }
        ]
      }
    );
  }

  return sanitizeComponentV2({
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: cardComponents
      }
    ]
  });
}

/**
 * 13. Modal แก้ไขข้อมูลส่วนตัวของผู้รับฟัง (Bio & Image URL)
 */
function buildEditProfileModal(currentBio = "", currentImageUrl = "") {
  const modal = new ModalBuilder()
    .setCustomId("heal_jai_modal_edit_profile")
    .setTitle("แก้ไขข้อมูลส่วนตัวผู้รับฟัง");

  const bioInput = new TextInputBuilder()
    .setCustomId("profile_bio")
    .setLabel("ข้อความแนะนำตัว (Bio)")
    .setStyle(TextInputStyle.Paragraph)
    .setPlaceholder("ยินดีต้อนรับสู่พื้นที่พักใจ พร้อมรับฟังและอยู่เคียงข้างคุณเสมอค่ะ 🍵")
    .setValue(currentBio ? String(currentBio).slice(0, 500) : "")
    .setMaxLength(500)
    .setRequired(false);

  const imageInput = new TextInputBuilder()
    .setCustomId("profile_image_url")
    .setLabel("ลิงก์ภาพประจำตัว / รูปโปรไฟล์ (Image URL)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("https://example.com/image.png (เว้นว่างเพื่อใช้รูป Discord)")
    .setValue(currentImageUrl ? String(currentImageUrl).slice(0, 300) : "")
    .setMaxLength(300)
    .setRequired(false);

  const row1 = new ActionRowBuilder().addComponents(bioInput);
  const row2 = new ActionRowBuilder().addComponents(imageInput);

  modal.addComponents(row1, row2);
  return modal;
}

/**
 * 20. แผงควบคุมหลังบ้าน Heal Jai (Admin Control Hub Dashboard - Button Menu)
 * @param {object} stats - { isMaintenance, isTermsDisabled, operatingHours, isCurrentlyOpen, onlineCounselors, activeSessions, completedToday, totalRevenueToday, platformShareToday, counselorShareToday }
 */
function buildAdminDashboardPayload(stats) {
  const isMaintenance = Boolean(stats.isMaintenance);
  const isTermsDisabled = Boolean(stats.isTermsDisabled);
  const opHours = stats.operatingHours || { enabled: false, openTime: "18:00", closeTime: "02:00" };
  const isOpen = stats.isCurrentlyOpen !== undefined ? Boolean(stats.isCurrentlyOpen) : (!isMaintenance);

  // Status badges
  const shopStatusEmoji = isMaintenance ? "🔴" : (isOpen ? "🟢" : "🌙");
  const shopStatusText = isMaintenance
    ? "**ปิดปรับปรุงชั่วคราว (Maintenance Mode)**"
    : (isOpen
        ? "**เปิดให้บริการตามปกติ (Open)**"
        : `**นอกเวลาทำการ (Closed)** (เปิด ${opHours.openTime} - ${opHours.closeTime} น.)`);

  const scheduleStatusText = opHours.enabled
    ? `\`${opHours.openTime} - ${opHours.closeTime} น.\` (${isOpen ? "🟢 ในเวลาทำการ" : "🔴 นอกเวลาทำการ"})`
    : `🟢 **เปิด 24 ชั่วโมง** (ปิดระบบจำกัดเวลา)`;

  const termsStatusText = isTermsDisabled
    ? "🔴 **ปิดรับชั่วคราว**"
    : "🟢 **เปิดรับการยินยอมตามปกติ**";

  return {
    flags: FLAG_EPHEMERAL,
    embeds: [
      {
        title: "⚙️  Bear Cafe ฮีลใจ — แผงควบคุมระบบสำหรับทีมงาน",
        description: [
          `-# เมนูควบคุมการทำงาน ตรวจสอบสถานะร้าน และจัดการเคสแบบเรียลไทม์\n`,
          `### 🏪 สถานะการเปิด-ปิดร้าน & เวลาทำการ`,
          `* ${shopStatusEmoji}⠀**สถานะการรับงาน:** ${shopStatusText}`,
          `* ⏰⠀**ตารางเวลาทำการ:** ${scheduleStatusText}`,
          `* 📜⠀**การรับข้อตกลงและนโยบาย:** ${termsStatusText}\n`,
          `### 👥 ทีมงาน & เซสชันสด`,
          `* 🟢⠀**ผู้รับฟังพร้อมให้บริการ (Online):** **${stats.onlineCounselors || 0}** คน`,
          `* 🍵⠀**เคสที่กำลังดูแลอยู่ขณะนี้:** **${stats.activeSessions || 0}** เซสชัน\n`,
          `### 📊 สรุปยอดวันนี้ (Today's Statistics)`,
          `* ✅⠀**เซสชันสำเร็จวันนี้:** **${stats.completedToday || 0}** เคส`,
          `* 💰⠀**ยอดเงินสะพัดรวม:** **${stats.totalRevenueToday || 0}** บาท`,
          `* 🏢⠀**ส่วนแบ่งคาเฟ่ (30%):** **${stats.platformShareToday || 0}** บาท`,
          `* 👥⠀**ส่วนแบ่งที่ปรึกษา (70%):** **${stats.counselorShareToday || 0}** บาท\n`,
          `> 💡 *เลือกกดปุ่มเมนูด้านล่างเพื่อตั้งค่าหรือสั่งการระบบได้ทันทีค่ะ*`
        ].join("\n"),
        color: isMaintenance ? 0xED4245 : (isOpen ? 0x57F287 : 0xFEE75C),
        footer: {
          text: "Bear Cafe • Heal Jai Admin Control Hub"
        },
        timestamp: new Date().toISOString()
      }
    ],
    components: [
      // Row 1: ควบคุมเวลาเปิด-ปิด และสถานะการรับงาน
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 2,
            label: "🕒 ตั้งเวลาเปิด-ปิด",
            emoji: { name: "⏰" },
            custom_id: "heal_jai_admin_set_hours"
          },
          {
            type: 2,
            style: opHours.enabled ? 3 : 2,
            label: opHours.enabled ? "⏰ โหมดเวลา: เปิดอยู่" : "⏰ โหมดเวลา: ปิด (24 ชม.)",
            custom_id: "heal_jai_admin_toggle_hours"
          },
          {
            type: 2,
            style: isMaintenance ? 3 : 4,
            label: isMaintenance ? "🟢 เปิดร้านทันที" : "🔴 ปิดร้านทันที",
            custom_id: "heal_jai_admin_toggle_maintenance"
          },
          {
            type: 2,
            style: isTermsDisabled ? 3 : 2,
            label: isTermsDisabled ? "📜 เปิดรับข้อตกลง" : "📜 ปิดรับข้อตกลง",
            custom_id: "heal_jai_admin_toggle_terms"
          }
        ]
      },
      // Row 2: จัดการเคส & ซ่อมบำรุง
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 1,
            label: "⏱️ เพิ่มเวลาเคส",
            emoji: { name: "⏳" },
            custom_id: "heal_jai_admin_open_extend_modal"
          },
          {
            type: 2,
            style: 2,
            label: "🧹 ล้างห้องค้าง",
            emoji: { name: "🧹" },
            custom_id: "heal_jai_admin_run_cleanup"
          },
          {
            type: 2,
            style: 1,
            label: "📑 ส่งสรุปยอดวันนี้",
            emoji: { name: "📊" },
            custom_id: "heal_jai_admin_send_report"
          },
          {
            type: 2,
            style: 2,
            label: "🔄 รีเฟรช",
            emoji: { name: "🔄" },
            custom_id: "heal_jai_admin_refresh_dashboard"
          }
        ]
      }
    ]
  };
}

/**
 * Modal สำหรับตั้งเวลาเปิด-ปิดการสั่งเมนู (Operating Hours Modal)
 * @param {object} currentHours - { openTime, closeTime }
 */
function buildOperatingHoursModal(currentHours = {}) {
  const modal = new ModalBuilder()
    .setCustomId("heal_jai_admin_modal_hours")
    .setTitle("⏰ ตั้งเวลาเปิด-ปิดการสั่งเมนู");

  const openInput = new TextInputBuilder()
    .setCustomId("open_time")
    .setLabel("เวลาเปิดให้บริการ (เช่น 18:00)")
    .setStyle(TextInputStyle.Short)
    .setValue(currentHours.openTime || "18:00")
    .setPlaceholder("18:00")
    .setRequired(true)
    .setMinLength(4)
    .setMaxLength(5);

  const closeInput = new TextInputBuilder()
    .setCustomId("close_time")
    .setLabel("เวลาปิดให้บริการ (เช่น 02:00)")
    .setStyle(TextInputStyle.Short)
    .setValue(currentHours.closeTime || "02:00")
    .setPlaceholder("02:00")
    .setRequired(true)
    .setMinLength(4)
    .setMaxLength(5);

  modal.addComponents(
    new ActionRowBuilder().addComponents(openInput),
    new ActionRowBuilder().addComponents(closeInput)
  );

  return modal;
}

/**
 * Modal สำหรับเพิ่มเวลาเคสลูกค้า (Admin Extend Case Time Modal)
 */
function buildAdminExtendModal() {
  const modal = new ModalBuilder()
    .setCustomId("heal_jai_admin_modal_extend")
    .setTitle("⏱️ เพิ่ม/ขยายเวลาเคสลูกค้า");

  const orderInput = new TextInputBuilder()
    .setCustomId("order_code")
    .setLabel("รหัสออเดอร์ (เช่น HJ-... หรือตัวเลข ID)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("HJ-XXXX หรือ พิมพ์เลข ID เคส")
    .setRequired(true);

  const minutesInput = new TextInputBuilder()
    .setCustomId("minutes")
    .setLabel("จำนวนนาทีที่ต้องการเพิ่ม (เช่น 15, 30, 60)")
    .setStyle(TextInputStyle.Short)
    .setValue("15")
    .setPlaceholder("15")
    .setRequired(true);

  const reasonInput = new TextInputBuilder()
    .setCustomId("reason")
    .setLabel("เหตุผล / บันทึกเพิ่มเติม (ไม่บังคับ)")
    .setStyle(TextInputStyle.Short)
    .setPlaceholder("แอดมินชดเชยเวลา / ลูกค้าขอต่อเวลา")
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(orderInput),
    new ActionRowBuilder().addComponents(minutesInput),
    new ActionRowBuilder().addComponents(reasonInput)
  );

  return modal;
}

/**
 * 21. แผงจัดการเคสรายตัว (Admin Manage Case Payload)
 * @param {object} order - Order record
 */
function buildAdminManageCasePayload(order) {
  if (!order) {
    return {
      content: "❌ ไม่พบข้อมูลออเดอร์ดังกล่าวในระบบค่ะ",
      flags: FLAG_EPHEMERAL
    };
  }

  const isCompleted = order.session_status === "COMPLETED";
  const isCancelled = order.session_status === "CANCELLED";
  const channelLink = order.session_channel_id || order.ticket_channel_id;

  return {
    flags: FLAG_EPHEMERAL,
    embeds: [
      {
        title: `🔍 รายละเอียดเคส #${order.order_code || order.id}`,
        description: [
          `* 👤⠀**ลูกค้า:** <@${order.customer_id}>`,
          `* 🎯⠀**ผู้ให้คำปรึกษา:** ${order.counselor_id ? `<@${order.counselor_id}>` : "ยังไม่ระบุ/รอรับเคส"}`,
          `* 📱⠀**ประเภทบริการ:** ${order.service_mode === "voice" ? "🎙️ คอลเสียง" : "💬 พิมพ์คุย"}`,
          `* 🍵⠀**แพ็กเกจ:** ${order.package_name || "-"} (${order.duration_minutes || 0} นาที)`,
          `* 💰⠀**ยอดเงิน:** ${order.total_price || 0} บาท (ที่ปรึกษา: ${order.counselor_share || 0} บ. | ร้าน: ${order.platform_share || 0} บ.)`,
          `* 💳⠀**สถานะการชำระเงิน:** \`${order.payment_status || "PENDING"}\``,
          `* 🔄⠀**สถานะเซสชัน:** \`${order.session_status || "WAITING"}\``,
          order.expires_at ? `* ⏳⠀**เวลาสิ้นสุด:** <t:${Math.floor(new Date(order.expires_at).getTime() / 1000)}:T> (<t:${Math.floor(new Date(order.expires_at).getTime() / 1000)}:R>)` : "",
          channelLink ? `* 📍⠀**ห้องที่เกี่ยวข้อง:** <#${channelLink}>` : ""
        ].filter(Boolean).join("\n"),
        color: isCompleted ? 0x57F287 : (isCancelled ? 0xED4245 : 0xFEE75C),
        footer: {
          text: `สร้างเมื่อ: ${new Date(order.created_at).toLocaleString("th-TH", { timeZone: "Asia/Bangkok" })}`
        }
      }
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 3,
            label: "อนุมัติสลิปแมนนวล",
            emoji: { name: "✅" },
            custom_id: `heal_jai_admin_approve_slip_${order.id}`,
            disabled: order.payment_status === "PAID"
          },
          {
            type: 2,
            style: 4,
            label: "บังคับจบเซสชัน",
            emoji: { name: "⏹️" },
            custom_id: `heal_jai_admin_force_end_${order.id}`,
            disabled: isCompleted || isCancelled
          },
          {
            type: 2,
            style: 2,
            label: "ลบห้องเคสนี้",
            emoji: { name: "🗑️" },
            custom_id: `heal_jai_admin_delete_room_${channelLink || order.id}`
          }
        ]
      },
      ...(!isCompleted && !isCancelled ? [
        {
          type: 1,
          components: [
            {
              type: 2,
              style: 1,
              label: "+15 นาที",
              emoji: { name: "⏱️" },
              custom_id: `heal_jai_admin_extend_${order.id}_15`
            },
            {
              type: 2,
              style: 1,
              label: "+30 นาที",
              emoji: { name: "⏱️" },
              custom_id: `heal_jai_admin_extend_${order.id}_30`
            },
            {
              type: 2,
              style: 1,
              label: "+60 นาที",
              emoji: { name: "⏱️" },
              custom_id: `heal_jai_admin_extend_${order.id}_60`
            }
          ]
        }
      ] : [])
    ]
  };
}

/**
/**
 * 22. รายงานสรุปยอดประจำวัน (Daily Summary Report Payload) - Discord Component v2
 * @param {object} reportData - { dateStr, totalOrders, totalRevenue, platformShare, counselorShare, counselorBreakdown }
 */
function buildDailyReportPayload(reportData) {
  const breakdownLines = (reportData.counselorBreakdown && reportData.counselorBreakdown.length > 0)
    ? reportData.counselorBreakdown.map((c) => `* <@${c.counselorId}> ┆ **${c.sessionCount}** เคส ┆ รวม: **${c.earnedAmount}** บาท`).join("\n")
    : "* ไม่มีข้อมูลเคสที่ปรึกษาในเมื่อวานนี้";

  return sanitizeComponentV2({
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `## 📊︲รายงานสรุปยอดประจำวัน — Bear Cafe ฮีลใจ\n-# ยอดสรุปปิดบัญชีของเมื่อวาน ประจำวันที่ **${reportData.dateStr}** 🍵`
          },
          {
            type: 14,
            spacing: 2
          },
          {
            type: 10,
            content: [
              `### 📈 ภาพรวมการให้บริการ`,
              `* ✅ **จำนวนเคสที่สำเร็จทั้งหมด:** **${reportData.totalOrders || 0}** เคส`,
              `* 💰 **ยอดเงินรวมสะพัด:** **${reportData.totalRevenue || 0}** บาท`,
              `* 🏢 **ส่วนแบ่งคาเฟ่ (30%):** **${reportData.platformShare || 0}** บาท`,
              `* 👥 **ส่วนแบ่งที่ปรึกษาทั้งหมด (70%):** **${reportData.counselorShare || 0}** บาท`
            ].join("\n")
          },
          {
            type: 14,
            spacing: 2
          },
          {
            type: 10,
            content: [
              `### 👥 รายได้สะสมของที่ปรึกษาประจำวัน (70%)`,
              breakdownLines,
              `\n> 💡 *ข้อมูลนี้ถูกสรุปและบันทึกอัตโนมัติประจำวันเพื่อความโปร่งใสของทีมงานค่ะ*`
            ].join("\n")
          }
        ],
        accent_color: null
      }
    ]
  });
}

/**
 * 23. แผงเลือกพนักงานที่ต้องการแก้ไข (Admin Counselor Selector)
 * @param {Array<{userId: string, displayName: string, status: string}>} counselors
 */
function buildAdminCounselorSelectPayload(counselors = []) {
  const options = counselors.slice(0, 25).map((c) => {
    const statusEmoji = c.status === "ONLINE" ? "🟢" : (c.status === "BUSY" ? "🟡" : "⚪");
    return {
      label: `${c.displayName || c.userId}`.slice(0, 100),
      description: `ID: ${c.userId}`.slice(0, 100),
      value: c.userId,
      emoji: { name: statusEmoji }
    };
  });

  return {
    flags: FLAG_EPHEMERAL,
    embeds: [
      {
        title: "👤  เมนูจัดการและแก้ไขข้อมูลพนักงาน — Heal Jai",
        description: [
          `-# ระบบปรับแต่งข้อมูลบัตรพนักงานสำหรับทีมงานแอดมิน 🍵\n`,
          `โปรดเลือกรายชื่อ **ผู้รับฟัง / พนักงาน** ที่ต้องการปรับปรุงข้อมูลจากเมนูด้านล่าง:`,
          `* 🟢⠀**พร้อมรับงาน** ┆ 🟡⠀**กำลังให้บริการ** ┆ ⚪⠀**พักรับงาน**\n`,
          `> 💡 *เมื่อเลือกแล้ว ระบบจะแสดงแผงควบคุมสำหรับแก้ไขชื่อ, รูปแบบบริการ, โหมดเงียบ, ความถนัด และข้อมูลส่วนตัวทันที*`
        ].join("\n"),
        color: 0x57F287,
        footer: {
          text: "Bear Cafe • Staff Profile Management"
        }
      }
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 3, // StringSelectMenu
            custom_id: "heal_jai_admin_select_edit_counselor",
            placeholder: "🔍 เลือกพนักงานที่ต้องการแก้ไข...",
            options: options.length > 0 ? options : [
              { label: "ไม่พบรายชื่อพนักงานในระบบ", value: "none", description: "ยังไม่มีพนักงานลงทะเบียน" }
            ],
            disabled: options.length === 0
          }
        ]
      }
    ]
  };
}

/**
 * 24. แผงควบคุมแก้ไขข้อมูลพนักงาน (Admin Counselor Edit Panel)
 * @param {object} counselorData - ข้อมูลจาก Supabase
 * @param {import("discord.js").GuildMember} member - Discord Guild Member
 */
function buildAdminCounselorEditPayload(counselorData = {}, member = null) {
  const userId = counselorData.user_id || member?.id || "0";
  const displayName = counselorData.display_name || member?.displayName || member?.user?.username || userId;
  const bio = counselorData.bio || "ยินดีต้อนรับสู่พื้นที่พักใจ พร้อมรับฟังและอยู่เคียงข้างคุณเสมอค่ะ";
  const avatarUrl = counselorData.image_url || member?.displayAvatarURL?.({ extension: "png", size: 512 }) || "https://cdn.discordapp.com/attachments/1536267579843280987/1547362521919529081/New_premium_11.png";
  const payoutAccount = counselorData.payout_account || "*(ยังไม่ระบุ)*";

  const status = counselorData.status || "OFFLINE";
  const statusEmoji = status === "ONLINE" ? "🟢" : (status === "BUSY" ? "🟡" : "⚪");
  const statusText = status === "ONLINE" ? "พร้อมรับงาน" : (status === "BUSY" ? "กำลังให้บริการ" : "พักรับงาน");

  const serviceModes = Array.isArray(counselorData.service_modes) && counselorData.service_modes.length > 0
    ? counselorData.service_modes
    : ["chat", "voice"];
  
  let serviceModeLabel = "🔊+💬 ทุกบริการ (คอลเสียง + พิมพ์คุย)";
  if (serviceModes.length === 1 && serviceModes[0] === "chat") {
    serviceModeLabel = "💬 เฉพาะพิมพ์คุย (Chat Only)";
  } else if (serviceModes.length === 1 && serviceModes[0] === "voice") {
    serviceModeLabel = "🔊 เฉพาะคอลเสียง (Voice Only)";
  }

  const isSilent = counselorData.is_silent_companion ? true : false;
  const silentLabel = isSilent ? "🟢 เปิดรับโหมดเงียบ" : "⚪ ไม่เปิดรับโหมดเงียบ";

  const selectedSpecialties = Array.isArray(counselorData.specialty_tags) && counselorData.specialty_tags.length > 0
    ? counselorData.specialty_tags
    : ALL_SPECIALTIES;

  const specialtiesDisplay = selectedSpecialties.map(s => `• ${s}`).join("\n") || "*(ยังไม่ได้ระบุความถนัด)*";

  // สร้าง Select Options สำหรับความถนัด
  const specialtyOptions = ALL_SPECIALTIES.map((spec, idx) => ({
    label: spec.slice(0, 100),
    value: spec.slice(0, 100),
    description: `ความถนัดข้อที่ ${idx + 1}`,
    default: selectedSpecialties.includes(spec)
  }));

  return {
    flags: FLAG_EPHEMERAL,
    embeds: [
      {
        title: `⚙️  แผงแก้ไขข้อมูลพนักงาน — ${displayName}`,
        description: [
          `-# จัดการและปรับแต่งข้อมูลบัตรพนักงานของ <@${userId}> 🍵\n`,
          `### 👤 ข้อมูลทั่วไป (Profile Info)`,
          `* 🏷️⠀**ชื่อบนบัตร:** **${displayName}**`,
          `* 📡⠀**สถานะการทำงาน:** ${statusEmoji} **${statusText}**`,
          `* 📱⠀**รูปแบบบริการ:** \`[ ${serviceModeLabel} ]\``,
          `* 🍃⠀**โหมดนั่งเงียบเป็นเพื่อน:** \`[ ${silentLabel} ]\``,
          `* 💼⠀**เลขบัญชีรับเงิน:** \`${payoutAccount}\``,
          `* 💰⠀**รายได้สะสม:** \`฿${Number(counselor.accumulated_earnings || 0).toLocaleString()}\``,
          `* 📝⠀**คำแนะนำตัว:** "${bio}"\n`,
          `### 🎯 ความถนัดเฉพาะ (Specialties)`,
          specialtiesDisplay,
          `\n> 💡 *ใช้เมนูด้านล่างเพื่อเลือกความถนัด หรือกดปุ่มเพื่อแก้ไขข้อมูล/สลับโหมดบริการได้ทันที (ระบบจะอัปเดตบัตรพนักงานให้อัตโนมัติ)*`
        ].join("\n"),
        color: 0x57F287,
        thumbnail: {
          url: avatarUrl
        },
        footer: {
          text: `User ID: ${userId} • Bear Cafe Staff Management`
        }
      }
    ],
    components: [
      // Row 1: Multi-select dropdown สำหรับความถนัดเฉพาะ
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: `heal_jai_admin_set_specialties:${userId}`,
            placeholder: "🎯 เลือกความถนัดเฉพาะ (เลือกได้หลายข้อ)...",
            min_values: 1,
            max_values: specialtyOptions.length,
            options: specialtyOptions
          }
        ]
      },
      // Row 2: ปุ่มแก้ไขข้อมูลทั่วไป, สลับรูปแบบบริการ, สลับโหมดเงียบ, รียอดสะสม, เปลี่ยนคน
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 1, // Primary Blurple
            label: "📝 แก้ไขข้อมูล",
            custom_id: `heal_jai_admin_edit_modal:${userId}`
          },
          {
            type: 2,
            style: 2, // Secondary Grey
            label: "📱 โหมดบริการ",
            emoji: { name: "🔄" },
            custom_id: `heal_jai_admin_toggle_service:${userId}`
          },
          {
            type: 2,
            style: isSilent ? 3 : 2, // Green if on, Grey if off
            label: isSilent ? "🍃 เงียบ: เปิด" : "🍃 เงียบ: ปิด",
            custom_id: `heal_jai_admin_toggle_silent:${userId}`
          },
          {
            type: 2,
            style: 4, // Destructive Red
            label: "💰 รียอด",
            custom_id: `heal_jai_admin_reset_earnings:${userId}`
          },
          {
            type: 2,
            style: 2,
            label: "👥 เปลี่ยนคน",
            custom_id: "heal_jai_admin_change_counselor"
          }
        ]
      }
    ]
  };
}

/**
 * 25. Modal ฟอร์มแก้ไขข้อมูลทั่วไปของพนักงานสำหรับแอดมิน
 * @param {string} targetUserId
 * @param {object} currentData
 */
function buildAdminEditCounselorModal(targetUserId, currentData = {}) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");
  const modal = new ModalBuilder()
    .setCustomId(`heal_jai_admin_modal_submit:${targetUserId}`)
    .setTitle("📝 แก้ไขข้อมูลพนักงาน (Staff Profile)");

  const nameInput = new TextInputBuilder()
    .setCustomId("display_name")
    .setLabel("ชื่อที่แสดงบนบัตรพนักงาน (Display Name)")
    .setStyle(TextInputStyle.Short)
    .setValue(currentData.display_name ? String(currentData.display_name).slice(0, 50) : "")
    .setMaxLength(50)
    .setRequired(true);

  const bioInput = new TextInputBuilder()
    .setCustomId("bio")
    .setLabel("คำแนะนำตัวสั้นๆ (Bio)")
    .setStyle(TextInputStyle.Paragraph)
    .setValue(currentData.bio ? String(currentData.bio).slice(0, 200) : "")
    .setMaxLength(200)
    .setRequired(false);

  const imageInput = new TextInputBuilder()
    .setCustomId("image_url")
    .setLabel("URL รูปโปรไฟล์ (Discord CDN หรือเว็บภาพ)")
    .setStyle(TextInputStyle.Short)
    .setValue(currentData.image_url ? String(currentData.image_url).slice(0, 300) : "")
    .setMaxLength(300)
    .setRequired(false);

  const payoutInput = new TextInputBuilder()
    .setCustomId("payout_account")
    .setLabel("เลขบัญชีรับเงิน / พร้อมเพย์ (Payout Account)")
    .setStyle(TextInputStyle.Short)
    .setValue(currentData.payout_account ? String(currentData.payout_account).slice(0, 50) : "")
    .setMaxLength(50)
    .setRequired(false);

  const sessionsInput = new TextInputBuilder()
    .setCustomId("total_sessions")
    .setLabel("จำนวนบริการสำเร็จ (Total Sessions)")
    .setStyle(TextInputStyle.Short)
    .setValue(currentData.total_sessions !== undefined && currentData.total_sessions !== null ? String(currentData.total_sessions) : "0")
    .setMaxLength(10)
    .setRequired(false);

  modal.addComponents(
    new ActionRowBuilder().addComponents(nameInput),
    new ActionRowBuilder().addComponents(bioInput),
    new ActionRowBuilder().addComponents(imageInput),
    new ActionRowBuilder().addComponents(payoutInput),
    new ActionRowBuilder().addComponents(sessionsInput)
  );

  return modal;
}

/**
 * 26. Payload กระเป๋าเงินและประวัติการให้บริการของพนักงาน (Wallet & Service History V2)
 * @param {object} params
 * @param {object} params.counselor ข้อมูลพนักงาน
 * @param {Array} params.orders รายการออเดอร์ในหน้านี้ (สูงสุด 3 รายการ)
 * @param {number} params.totalCount จำนวนรายการทั้งหมด
 * @param {number} params.page หน้าปัจจุบัน
 * @param {number} params.pageSize จำนวนรายการต่อหน้า (default 3)
 * @param {string} params.userAvatarUrl ลิงก์รูปโปรไฟล์
 * @param {string} params.userId Discord User ID
 */
function buildCounselorWalletHistoryPayload({
  counselor = {},
  orders = [],
  totalCount = 0,
  page = 1,
  pageSize = 3,
  userAvatarUrl = "",
  userId = ""
}) {
  const displayName = counselor.display_name || `<@${userId}>`;
  const totalSessions = counselor.total_sessions || totalCount || 0;
  const earnings = Number(counselor.accumulated_earnings || 0).toFixed(2);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const currentPage = Math.min(Math.max(1, page), totalPages);

  const isFirstPage = currentPage <= 1;
  const isLastPage = currentPage >= totalPages;

  let orderContent = "### รายการทั้งหมด:\n";
  if (!orders || orders.length === 0) {
    orderContent += "ไม่พบรายการ";
  } else {
    const listItems = orders.map((o, idx) => {
      const itemNum = (currentPage - 1) * pageSize + idx + 1;
      const orderCode = o.order_code || `#HJ-${String(o.id || 0).padStart(4, "0")}`;
      const unixTime = Math.floor(new Date(o.started_at || o.created_at || Date.now()).getTime() / 1000);
      const sMode = o.service_mode === "voice" ? "🔊 คอลเสียง" : "💬 พิมพ์คุย";
      const pkgName = o.package_name || (o.duration_minutes ? `บริการฮีลใจ (${o.duration_minutes} นาที)` : "บริการฮีลใจ");

      // ออปชันเสริม
      const optParts = [];
      if (o.is_specific_counselor) optParts.push("🎯 ระบุผู้รับฟัง (+39 บ.)");
      if (o.is_silent) optParts.push("🍃 นั่งเงียบเป็นเพื่อน");
      if (o.is_booster) optParts.push("💎 สมาชิกบูสเตอร์");
      const optText = optParts.length > 0 ? optParts.map(p => `\`${p}\``).join(", ") : "`ไม่มี`";

      const totalPrice = Number(o.total_price || 0).toFixed(2);
      const counselorShare = Number(o.counselor_share || (Number(o.total_price || 0) * 0.7)).toFixed(2);

      return [
        `${itemNum}. \`${orderCode}\` (<t:${unixTime}:R>)`,
        `  - **ลูกค้า:** <@${o.customer_id || 'Unknown'}>`,
        `  - **ประเภทบริการ:** \`${pkgName}\` — \`${sMode}\``,
        `  - **ออปชันเสริม:** ${optText}`,
        `  - **ยอดรวม:** \`${totalPrice} บาท\` ➔ **รายได้ที่คุณได้รับ (70%):** \`+${counselorShare} บาท\``
      ].join("\n");
    });
    orderContent += listItems.join("\n\n");
  }

  const sectionComponent = {
    type: 9,
    components: [
      {
        type: 10,
        content: `## <:hj_clover:1552227021122314250>︲__\` กระเป๋าเงินของคุณ${displayName} \`__\n- 🍵⠀**จำนวนการให้บริการ:** ${totalSessions} ครั้ง\n- 💰⠀**รายได้สะสมรอโอน (70%):** **${earnings}** บาท`
      }
    ]
  };

  if (userAvatarUrl && String(userAvatarUrl).startsWith("http")) {
    sectionComponent.accessory = {
      type: 11,
      media: {
        url: userAvatarUrl
      }
    };
  }

  return sanitizeComponentV2({
    flags: FLAG_V2 | FLAG_EPHEMERAL,
    components: [
      {
        type: 17,
        components: [
          sectionComponent,
          {
            type: 14,
            spacing: 2
          },
          {
            type: 10,
            content: orderContent
          },
          {
            type: 14,
            spacing: 2
          },
          {
            type: 1,
            components: [
              {
                style: 2,
                type: 2,
                custom_id: `heal_jai_wallet_first:1:${userId}`,
                label: "หน้าแรก",
                disabled: isFirstPage
              },
              {
                style: 2,
                type: 2,
                custom_id: `heal_jai_wallet_prev:${Math.max(1, currentPage - 1)}:${userId}`,
                emoji: {
                  name: "◀️"
                },
                disabled: isFirstPage
              },
              {
                style: 2,
                type: 2,
                custom_id: `heal_jai_wallet_next:${Math.min(totalPages, currentPage + 1)}:${userId}`,
                emoji: {
                  name: "▶️"
                },
                disabled: isLastPage
              },
              {
                style: 2,
                type: 2,
                label: "หน้าสุดท้าย",
                custom_id: `heal_jai_wallet_last:${totalPages}:${userId}`,
                disabled: isLastPage
              }
            ]
          }
        ]
      }
    ]
  });
}

module.exports = {
  FLAG_V2,
  FLAG_EPHEMERAL,
  sanitizeComponentV2,
  SERVICE_MODES,
  DRINK_OPTIONS,
  TOPPING_OPTIONS,
  MOCK_COUNSELORS,
  buildAgreementPayload,
  buildMainMenuPayload,
  buildShiftPanelPayload,
  buildCheckoutTicketPayload,
  buildInteractiveMenuPayload,
  buildInteractiveOrderPayload,
  buildInitialWelcomePayload,
  buildInquiryAdminPayload,
  buildScanToPayPayload,
  buildDispatchAlertPayload,
  buildSessionDashboardPayload,
  buildFeedbackPromptPayload,
  buildPublicReviewShowcasePayload,
  buildReviewModal,
  buildCounselorCardPayload,
  buildEditProfileModal,
  buildAdminDashboardPayload,
  buildAdminManageCasePayload,
  buildDailyReportPayload,
  buildAdminCounselorSelectPayload,
  buildAdminCounselorEditPayload,
  buildAdminEditCounselorModal,
  buildCounselorWalletHistoryPayload,
  buildIncompleteOrderWarningPayload,
  buildOperatingHoursModal,
  buildAdminExtendModal,
  ALL_SPECIALTIES
};

