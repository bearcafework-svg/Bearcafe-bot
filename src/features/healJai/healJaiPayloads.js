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
      orderInfo.isSilent ? `* 🌙⠀**ท็อปปิ้ง:** นั่งเงียบเป็นเพื่อน (+15 บาท)` : null,
      orderInfo.isSpecific && orderInfo.counselorName ? `* 🎯⠀**ระบุตัวผู้รับฟัง:** ${orderInfo.counselorName} (+30 บาท)` : null,
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
 * 5. การ์ดแจ้งเตือนรับเคสใหม่ (Targeted & Open Dispatch)
 * @param {object} dispatchInfo - { counselorId, orderId, orderCode, packageName, duration, isSilent, isBooster, totalMinutes, totalPrice, expireTimestamp }
 */
function buildDispatchAlertPayload(dispatchInfo) {
  const counselorIdStr = typeof dispatchInfo.counselorId === 'string' ? dispatchInfo.counselorId.trim() : '';
  const isValidSnowflake = /^\d{17,20}$/.test(counselorIdStr);
  const isTargeted = Boolean(counselorIdStr) && isValidSnowflake;
  const counselorMention = isTargeted
    ? `<@${counselorIdStr}>`
    : (counselorIdStr ? `**${counselorIdStr}**` : `เปิดรับคำขอ (ทุกคนที่ว่าง)`);
  const headerNote = isTargeted
    ? `แอดมินได้เลือกมอบหมายเคสนี้ให้กับคุณโดยตรงค่ะ`
    : `เคสเปิดรับคำขอสำหรับผู้ให้คำปรึกษาทุกคนที่ว่าง สามารถกดรับเคสได้ทันทีค่ะ`;
  const contentMention = isTargeted
    ? `<@${counselorIdStr}> 🔔 มีเคสใหม่ส่งตรงถึงคุณ 𓂃`
    : `<@&1536208070420733982> 🔔 มีเคสใหม่เปิดรับคำขอ ผู้ที่พร้อมดูแลสามารถกดรับได้เลยค่ะ!`;

  const customerMention = dispatchInfo.customerId ? `<@${dispatchInfo.customerId}>` : null;
  const serviceModeText = (dispatchInfo.serviceMode === 'voice' || dispatchInfo.service_mode === 'voice') ? '🎙️ คอลเสียง' : '💬 พิมพ์คุย';
  const packageName = dispatchInfo.packageName || 'ชาเขียวเย็นใจ';
  const duration = dispatchInfo.duration || dispatchInfo.totalMinutes || 15;
  const totalPrice = dispatchInfo.totalPrice || 39;
  const expireTimestamp = dispatchInfo.expireTimestamp || Math.floor((Date.now() + 3 * 60 * 1000) / 1000);
  const targetId = dispatchInfo.orderCode || dispatchInfo.orderId || 'general';

  // ตรวจสอบท็อปปิ้ง (ถ้าไม่มี ไม่แสดง)
  let toppingText = null;
  const isNoneTopping = !dispatchInfo.toppingName || ['none', 'ไม่มี', 'ไม่รับท็อปปิ้ง'].includes(dispatchInfo.toppingName.trim());
  if (!isNoneTopping) {
    toppingText = dispatchInfo.toppingName;
  } else if (dispatchInfo.isSilent) {
    toppingText = 'นั่งเงียบเป็นเพื่อน (+19 บาท)';
  } else if (dispatchInfo.isSpecific && dispatchInfo.counselorId) {
    toppingText = 'ระบุตัวผู้รับฟัง (+39 บาท)';
  }

  // ตรวจสอบสิทธิพิเศษ (ถ้าไม่มี ไม่แสดง)
  const boosterText = dispatchInfo.isBooster ? 'Server Booster (+5 นาทีฟรี)' : null;

  // หาภาพของเครื่องดื่มจาก DRINK_OPTIONS (menuData.json)
  let menuImageUrl = dispatchInfo.imageUrl;
  if (!menuImageUrl) {
    const matchedDrink = Object.values(DRINK_OPTIONS).find(
      (d) => d.id === dispatchInfo.drinkId || d.tier === dispatchInfo.packageTier || d.name === packageName || (packageName && packageName.includes(d.name))
    );
    menuImageUrl = matchedDrink?.imageUrl || 'https://cdn.discordapp.com/attachments/1536267579843280987/1547550913474854942/New_premium_13.png';
  }

  return sanitizeComponentV2({
    flags: FLAG_V2,
    pingMention: contentMention,
    components: [
      {
        type: 17,
        components: [
          {
            type: 9,
            components: [
              {
                type: 10,
                content: [
                  `## <a:bellpress:1547361650552737914>︲__\` 𝖭𝗈𝗍𝗂𝖼𝖾 ₊ มีเคสใหม่ส่งตรงถึงคุณ 𓂃 \`__`,
                  `-# ${headerNote}\n`,
                  `* 🎯⠀**ที่ปรึกษาที่ได้รับเลือก:** ${counselorMention}`,
                  customerMention ? `* 👤⠀**ลูกค้า:** ${customerMention}` : null,
                  `* 📱⠀**ประเภทบริการ:** ${serviceModeText}`,
                  `* 🍵⠀**แพ็กเกจ:** ${packageName} (${duration} นาที)`,
                  toppingText ? `* 🌙⠀**ท็อปปิ้ง:** ${toppingText}` : null,
                  boosterText ? `* 🌟⠀**สิทธิพิเศษ:** ${boosterText}` : null,
                  `* ⏳⠀**เวลานับถอยหลัง:** หมดเวลาใน **<t:${expireTimestamp}:R>** (3 นาที)`,
                  `# ยอดรวม: ${totalPrice} บาท (ยังไม่หัก %)`,
                  `> ⚠️⠀*โปรดกดรับเคสภายใน 3 นาที หากไม่สะดวกสามารถกด **"สละสิทธิ์"** เพื่อให้ระบบสุ่มส่งต่อให้ท่านถัดไปได้ทันทีค่ะ*`
                ].filter(Boolean).join('\n')
              }
            ],
            accessory: {
              type: 11,
              media: {
                url: menuImageUrl
              }
            }
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
                style: 3,
                type: 2,
                label: '︲กดรับเคสนี้',
                emoji: {
                  id: '1536694010780065863',
                  name: 'cupofmatcha'
                },
                custom_id: `heal_jai_claim_case_${targetId}`
              },
              {
                style: 4,
                type: 2,
                label: '︲สละสิทธิ์ / ส่งต่อ',
                emoji: {
                  name: '↩️'
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
 * สร้างการ์ดเลือกเมนูเครื่องดื่มแบบ 3-Step Wizard Component v2
 * @param {object} params - { step, mode, drinkId, toppingId, counselorId, counselorName, userAvatarUrl, counselorOptions }
 */
function buildInteractiveOrderPayload({
  step = 1,
  mode = null,
  drinkId = null,
  toppingId = null,
  counselorId = null,
  counselorName = null,
  userAvatarUrl = "https://cdn.discordapp.com/embed/avatars/0.png",
  counselorOptions = null
} = {}) {
  const avatarUrl = userAvatarUrl || "https://cdn.discordapp.com/embed/avatars/0.png";
  const modeName = mode === "voice" ? "คอลเสียง" : (mode === "chat" ? "พิมพ์แชท" : null);
  const drink = drinkId ? DRINK_OPTIONS[drinkId] : null;

  // ── STEP 1: คลิกปุ่มเลือกบริการ (1/3) ───────────────────────────
  if (step === 1 || !mode) {
    return sanitizeComponentV2({
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
                  content: "## 📝︲__` รายละเอียดเครื่องดื่ม `__\n### ..."
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
              type: 14,
              divider: true,
              spacing: 2
            },
            {
              type: 1,
              components: [
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
                  style: 5,
                  type: 2,
                  label: "︲คลิกหากพบปัญหา",
                  emoji: { name: "🚨" },
                  url: "https://discord.com/channels/1536199707922141254/1536207517120466964"
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
              content: "## <a:hj_kittypaw:1552270687295643709>︲__` คลิกปุ่มเลือกบริการ (1/3) `__"
            },
            {
              type: 14,
              divider: false,
              spacing: 1
            },
            {
              type: 12,
              items: [
                {
                  media: {
                    url: "https://cdn.discordapp.com/attachments/1536267579843280987/1552287096226582528/Serve.png?ex=6ab50f83&is=6ab3be03&hm=e91c601361b5760cea05a881e8e9d4cff1fe3852f60945a671dbc8ee601e1ce8&"
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
              type: 1,
              components: [
                {
                  style: 2,
                  type: 2,
                  label: "︲พิมพ์แชท",
                  emoji: { name: "💬" },
                  custom_id: "heal_jai_mode_chat"
                },
                {
                  style: 2,
                  type: 2,
                  label: "︲คอลเสียง",
                  emoji: { name: "🎙️" },
                  custom_id: "heal_jai_mode_voice"
                }
              ]
            },
            {
              type: 14,
              divider: true,
              spacing: 2
            }
          ]
        }
      ]
    });
  }

  // ── STEP 2: คลิกปุ่มเลือกเครื่องดื่ม (2/3) ───────────────────────────
  if (step === 2 || !drinkId) {
    return sanitizeComponentV2({
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
                  content: `## 📝︲__\` รายละเอียดเครื่องดื่ม \`__\n### 1. ${modeName}`
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
              type: 14,
              divider: true,
              spacing: 2
            },
            {
              type: 1,
              components: [
                {
                  style: 2,
                  type: 2,
                  label: "︲สั่งใหม่",
                  emoji: { name: "🔁" },
                  custom_id: "heal_jai_reset_order"
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
                  style: 5,
                  type: 2,
                  label: "︲คลิกหากพบปัญหา",
                  emoji: { name: "🚨" },
                  url: "https://discord.com/channels/1536199707922141254/1536207517120466964"
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
              content: "## <a:hj_kittypaw:1552270687295643709>︲__` คลิกปุ่มเลือกเครื่องดื่ม (2/3) `__"
            },
            {
              type: 14,
              divider: false,
              spacing: 1
            },
            {
              type: 12,
              items: [
                {
                  media: {
                    url: "https://cdn.discordapp.com/attachments/1536267579843280987/1552268120541106176/HealJai_-_menu.png?ex=6ab4fdd7&is=6ab3ac57&hm=02339333aaf0c451dc6eda1aa1bcf7384ac8d5bcc3fc70107a37ccf0b3de3197&"
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
              type: 1,
              components: [
                {
                  style: 2,
                  type: 2,
                  label: "︲ชาเขียวเย็นใจ",
                  emoji: { name: "🍵" },
                  custom_id: "heal_jai_drink_tea_39"
                },
                {
                  style: 2,
                  type: 2,
                  label: "︲โกโก้พักใจ",
                  emoji: { name: "🍫" },
                  custom_id: "heal_jai_drink_cocoa_69"
                },
                {
                  style: 2,
                  type: 2,
                  label: "︲กาแฟคุยยาว",
                  emoji: { name: "☕" },
                  custom_id: "heal_jai_drink_coffee_129"
                }
              ]
            },
            {
              type: 14,
              divider: true,
              spacing: 2
            }
          ]
        }
      ]
    });
  }

  // ── STEP 3b: คลิกเลือกผู้รับฟังจาก Dropdown (3/3) ─────────────────
  if (step === 3.5 || (toppingId === "specific_39" && !counselorId && step !== 4)) {
    let resolvedOptions = [];
    if (Array.isArray(counselorOptions)) {
      resolvedOptions = counselorOptions;
    } else {
      resolvedOptions = Object.values(MOCK_COUNSELORS).filter((c) => {
        const modes = c.service_modes || ["chat", "voice"];
        return !mode || modes.includes(mode);
      });
    }

    const hasCounselors = resolvedOptions.length > 0;

    let selectOptions = [];
    if (hasCounselors) {
      selectOptions = resolvedOptions.slice(0, 25).map((c) => ({
        label: (c.label || c.displayName || c.name || "").replace(/\s*—\s*อายุ\s*\d+/g, "").trim(),
        value: c.value || c.userId || c.user_id || c.id,
        description: "คลิกเพื่อดูรายละเอียด",
        emoji: typeof c.emoji === "string" ? { name: c.emoji } : (c.emoji || { name: "🍀" })
      }));
    } else {
      selectOptions = [
        {
          label: "ไม่มีผู้ให้บริการว่างในขณะนี้",
          value: "none",
          description: "กรุณาลองใหม่อีกครั้ง หรือเปลี่ยนโหมดบริการ",
          emoji: { name: "⚪" }
        }
      ];
    }

    return sanitizeComponentV2({
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
                  content: `## 📝︲__\` รายละเอียดเครื่องดื่ม \`__\n### 1. ${modeName}\n### 2. ${drink.name} — ${drink.price} บาท`
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
              type: 14,
              divider: true,
              spacing: 2
            },
            {
              type: 1,
              components: [
                {
                  style: 2,
                  type: 2,
                  label: "︲สั่งใหม่",
                  emoji: { name: "🔁" },
                  custom_id: "heal_jai_reset_order"
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
                  style: 5,
                  type: 2,
                  label: "︲คลิกหากพบปัญหา",
                  emoji: { name: "🚨" },
                  url: "https://discord.com/channels/1536199707922141254/1536207517120466964"
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
              content: "## <a:hj_kittypaw:1552270687295643709>︲__` คลิกปุ่มเลือกท็อปปิ้ง (3/3) `__"
            },
            {
              type: 14,
              divider: false,
              spacing: 1
            },
            {
              type: 12,
              items: [
                {
                  media: {
                    url: "https://cdn.discordapp.com/attachments/1536267579843280987/1552267438459195532/Topping.png?ex=6ab4fd35&is=6ab3abb5&hm=528e11fbb76b50e29dbf57d7482499fd42d8b93aa9b8dfbad2e86afaf7d027fb&"
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
              type: 1,
              components: [
                {
                  type: 3,
                  custom_id: "heal_jai_select_counselor",
                  placeholder: hasCounselors ? "🟢︲คลิกเลือกผู้รับฟัง" : "🔴︲ไม่มีผู้ให้บริการตามที่เลือก",
                  min_values: 1,
                  max_values: 1,
                  disabled: !hasCounselors,
                  options: selectOptions
                }
              ]
            },
            {
              type: 14,
              divider: true,
              spacing: 2
            }
          ]
        }
      ]
    });
  }

  // ── STEP 3: คลิกปุ่มเลือกท็อปปิ้ง (3/3) ───────────────────────────
  if (step === 3 || (!toppingId && step !== 4)) {
    return sanitizeComponentV2({
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
                  content: `## 📝︲__\` รายละเอียดเครื่องดื่ม \`__\n### 1. ${modeName}\n### 2. ${drink.name} — ${drink.price} บาท`
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
              type: 14,
              divider: true,
              spacing: 2
            },
            {
              type: 1,
              components: [
                {
                  style: 2,
                  type: 2,
                  label: "︲สั่งใหม่",
                  emoji: { name: "🔁" },
                  custom_id: "heal_jai_reset_order"
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
                  style: 5,
                  type: 2,
                  label: "︲คลิกหากพบปัญหา",
                  emoji: { name: "🚨" },
                  url: "https://discord.com/channels/1536199707922141254/1536207517120466964"
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
              content: "## <a:hj_kittypaw:1552270687295643709>︲__` คลิกปุ่มเลือกท็อปปิ้ง (3/3) `__\n### <:honey_healjai:1536700545174077491> — นั่งเงียบเป็นเพื่อน (+19 บาท)\n> โหมดนั่งเป็นเพื่อน ไม่เน้นการพูดคุย ไม่ต้องเกร็ง เหมาะกับการนั่งทำงาน อ่านหนังสือ หรือเปิดฟังเสียงพิมพ์งาน/ASMR คลอเบาๆ สไตล์ Co-working\n\n> *(แนะนำสำหรับแพ็กเกจ โกโก้พักใจ และ กาแฟคุยยาว เพื่อความผ่อนคลายอย่างต่อเนื่อง)*\n### <:cherry_healjai:1536700586001694850> — เลือกคนที่อยากคุยด้วย (+39 บาท)\n> เลือกระบุตัวผู้รับฟังที่คุณชื่นชอบหรือสบายใจได้ โดยคุณสามารถเช็กได้ที่ <#1536207447956398171> (ต้องมีสถานะ 🟢 ว่าง ในขณะนั้น)\n\n> หากเลือกคู่กับโหมด \"นั่งเงียบเป็นเพื่อน\" (+58 บาท) ระบบจะเลือกเฉพาะผู้รับฟังที่มีแท็ก <@&1549650189474598984> ให้เท่านั้น"
            },
            {
              type: 14,
              divider: false,
              spacing: 1
            },
            {
              type: 12,
              items: [
                {
                  media: {
                    url: "https://cdn.discordapp.com/attachments/1536267579843280987/1552267438459195532/Topping.png?ex=6ab4fd35&is=6ab3abb5&hm=528e11fbb76b50e29dbf57d7482499fd42d8b93aa9b8dfbad2e86afaf7d027fb&"
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
              type: 1,
              components: [
                {
                  style: 2,
                  type: 2,
                  label: "︲นั่งเงียบเป็นเพื่อน",
                  emoji: { name: "🍯" },
                  custom_id: "heal_jai_topping_silent"
                },
                {
                  style: 2,
                  type: 2,
                  label: "︲เลือกคนที่อยากคุยด้วย",
                  emoji: { name: "🍒" },
                  custom_id: "heal_jai_topping_specific"
                },
                {
                  style: 4,
                  type: 2,
                  label: "ไม่ใส่ท็อปปิ้ง",
                  custom_id: "heal_jai_topping_none"
                }
              ]
            },
            {
              type: 14,
              divider: true,
              spacing: 2
            }
          ]
        }
      ]
    });
  }

  // ── STEP 4: ทวนรายการเครื่องดื่มของท่าน (Summary / Checkout) ────────
  let toppingLine = null;
  let toppingPrice = 0;
  if (toppingId === "silent_19") {
    toppingLine = "### 3. นั่งเงียบเป็นเพื่อน — 19 บาท";
    toppingPrice = 19;
  } else if (toppingId === "specific_39") {
    toppingPrice = 39;
    const counselorDisplayName = counselorName || (MOCK_COUNSELORS[counselorId]?.name) || (counselorId ? (counselorId.startsWith("counselor_") ? MOCK_COUNSELORS[counselorId]?.name : `<@${counselorId}>`) : "ผู้รับฟังที่ระบุ");
    toppingLine = `### 3. เลือก ${counselorDisplayName} — 39 บาท`;
  }

  const totalPrice = (drink ? drink.price : 0) + toppingPrice;

  const summaryDetails = [
    `## 📝︲__\` ทวนรายการเครื่องดื่มของท่าน \`__`,
    `### 1. ${modeName}`,
    `### 2. ${drink ? drink.name : "เครื่องดื่ม"} — ${drink ? drink.price : 0} บาท`,
    toppingLine,
    `# ยอดรวม: 💸 ${totalPrice} บาท`
  ].filter(Boolean).join('\n');

  return sanitizeComponentV2({
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
                content: summaryDetails
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
            type: 14,
            divider: true,
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
                style: 2,
                type: 2,
                label: "︲สั่งใหม่",
                emoji: { name: "🔁" },
                custom_id: "heal_jai_reset_order"
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
                style: 5,
                type: 2,
                label: "︲คลิกหากพบปัญหา",
                emoji: { name: "🚨" },
                url: "https://discord.com/channels/1536199707922141254/1536207517120466964"
              }
            ]
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
  const modeText = orderInfo.modeName || (isVoice ? "🔊︲คอลเสียง (Voice)" : "💬︲พิมพ์คุย (Chat)");

  const summaryLines = [
    `### <:matchamochi:1536695320174534699>︲__\` สรุปรายการคำสั่งซื้อของคุณ \`__`,
    `* 🛋️⠀**รูปแบบบริการ:** ${modeText}`,
    `* 🍵⠀**แพ็กเกจ:** ${orderInfo.packageName || 'เครื่องดื่มพักใจ'} (${orderInfo.duration || 30} นาที)`,
    orderInfo.toppingName ? `* 🌱⠀**ท็อปปิ้ง:** ${orderInfo.toppingName}` : null,
    orderInfo.counselorName ? `* 🎯⠀**ระบุตัวผู้รับฟัง:** ${orderInfo.counselorName}` : null,
    orderInfo.isBooster ? `* <:boosthand:1536707497174507620>⠀**สิทธิพิเศษ:** Server Booster (+5 นาทีฟรี)` : null,
    `# ยอดชำระสุทธิ: ${orderInfo.totalPrice || 0} บาท`,
    `> เมื่อโอนเงินเรียบร้อยแล้ว ให้แนบและส่งรูปภาพสลิปในห้องนี้ได้เลยค่ะ ระบบจะทำการตรวจสอบสลิปอัตโนมัติ 🍵`
  ].filter(Boolean).join('\n');

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
                  url: "https://cdn.discordapp.com/attachments/1536267579843280987/1547358423467819149/HealJai_2026_ZEAB1U_._All_Rights_Reserved._5.png?ex=6aab0a54&is=6aa9b8d4&hm=e9f425da5e6954eabe304f71acfd001789c184037f8f5327fa807ada0f40f87c&"
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
            content: "## <:hj_clover:1552227021122314250>︲__` 𝖲𝖼𝖺𝗇 𝗍𝗈 𝗉𝖺𝗒 ₊ ชำระเงิน 𓂃 `__\n### อ่านก่อนชำระเงิน:\n> กรุณาตรวจสอบข้อมูลและยอดเงินให้ถูกต้องก่อนทำรายการ หากโอนเงินผิดหรือโอนเกิน ทางเซิร์ฟเวอร์ขอสงวนสิทธิ์ไม่รับผิดชอบในทุกกรณี\n### กรณีโอนเงินเกินจำนวน (Overpayment):\n> หากพบว่ามียอดโอนเกิน บอทจะยังไม่อนุมัติสถานะการชำระเงินอัตโนมัติ เพื่อป้องกันความผิดพลาดทางบัญชี\n\n> ระบบจะดึงห้อง Ticket นี้ให้แจ้งเตือนแอดมินเข้ามาตรวจสอบยอดเงินส่วนต่างด้วยตนเอง\n\n> การจัดการ: แอดมินจะติดต่อกลับในห้อง Ticket เพื่อตรวจสอบหลักฐาน หากเป็นยอดส่วนต่างจำนวนน้อย จะถูกบันทึกเป็นเครดิตสะสม/ทิปตามความสมัครใจ แต่หากเป็นยอดเงินเกินจำนวนมาก ทีมงานจะดำเนินการโอนส่วนที่เกินคืนเข้าบัญชีต้นทางของลูกค้า (โดยหักค่าธรรมเนียมการโอนตามจริงถ้ามี)"
          },
          {
            type: 14,
            divider: true,
            spacing: 2
          },
          {
            type: 10,
            content: summaryLines
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
                style: 5,
                type: 2,
                label: "︲คลิกหากพบปัญหา",
                emoji: {
                  name: "🚨"
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

  const mentionText = /^\d+$/.test(userId) ? `<@${userId}> ${displayName}` : displayName;

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
 * 20. แผงควบคุมหลังบ้าน Heal Jai (Admin Control Hub Dashboard)
 * @param {object} stats - { isMaintenance, onlineCounselors, activeSessions, completedToday, totalRevenueToday, platformShareToday, counselorShareToday }
 */
function buildAdminDashboardPayload(stats) {
  const statusEmoji = stats.isMaintenance ? "🔴" : "🟢";
  const statusText = stats.isMaintenance ? "**ปิดปรับปรุงชั่วคราว (Maintenance Mode)**" : "**เปิดให้บริการตามปกติ (Online)**";
  const maintenanceBtnStyle = stats.isMaintenance ? 3 : 4; // Green to Open, Red to Close
  const maintenanceBtnLabel = stats.isMaintenance ? "🟢 เปิดให้บริการระบบ" : "🔴 ปิดปรับปรุงระบบชั่วคราว";

  return {
    flags: FLAG_EPHEMERAL,
    embeds: [
      {
        title: "⚙️  Heal Jai — แผงควบคุมหลังบ้านสำหรับทีมงาน",
        description: [
          `-# ยินดีต้อนรับสู่ระบบควบคุมและตรวจสอบการทำงานของ Bear Cafe ฮีลใจ\n`,
          `### 📡 สถานะระบบปัจจุบัน`,
          `* ${statusEmoji}⠀**โหมดบริการ:** ${statusText}`,
          `* 🟢⠀**ผู้รับฟังออนไลน์:** **${stats.onlineCounselors || 0}** คน`,
          `* 🍵⠀**เคสที่กำลังดูแลอยู่:** **${stats.activeSessions || 0}** เซสชัน\n`,
          `### 📊 สรุปยอดวันนี้ (Today's Statistics)`,
          `* ✅⠀**เซสชันสำเร็จวันนี้:** **${stats.completedToday || 0}** เคส`,
          `* 💰⠀**ยอดเงินสะพัดรวม:** **${stats.totalRevenueToday || 0}** บาท`,
          `* 🏢⠀**ส่วนแบ่งคาเฟ่ (30%):** **${stats.platformShareToday || 0}** บาท`,
          `* 👥⠀**ส่วนแบ่งที่ปรึกษา (70%):** **${stats.counselorShareToday || 0}** บาท\n`,
          `> 💡 *คลิกปุ่มด้านล่างเพื่อจัดการและควบคุมการทำงานได้ทันที*`
        ].join("\n"),
        color: stats.isMaintenance ? 0xED4245 : 0x57F287,
        footer: {
          text: "Bear Cafe • Heal Jai Admin Control Hub"
        },
        timestamp: new Date().toISOString()
      }
    ],
    components: [
      {
        type: 1,
        components: [
          {
            type: 2,
            style: maintenanceBtnStyle,
            label: maintenanceBtnLabel,
            custom_id: "heal_jai_admin_toggle_maintenance"
          },
          {
            type: 2,
            style: 2,
            label: "🧹 ล้างห้องค้างทันที",
            emoji: { name: "🧹" },
            custom_id: "heal_jai_admin_run_cleanup"
          },
          {
            type: 2,
            style: 1,
            label: "📑 ส่งสรุปยอดประจำวัน",
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
      }
    ]
  };
}

/**
 * 22. รายงานสรุปยอดประจำวัน (Daily Summary Report Payload)
 * @param {object} reportData - { dateStr, totalOrders, totalRevenue, platformShare, counselorShare, counselorBreakdown }
 */
function buildDailyReportPayload(reportData) {
  const breakdownLines = (reportData.counselorBreakdown && reportData.counselorBreakdown.length > 0)
    ? reportData.counselorBreakdown.map((c) => `* <@${c.counselorId}> ┆ **${c.sessionCount}** เคส ┆ รวม: **${c.earnedAmount}** บาท`).join("\n")
    : "* ไม่มีข้อมูลเคสที่ปรึกษาในวันนี้";

  return {
    embeds: [
      {
        title: `📊  รายงานสรุปยอดประจำวัน — Bear Cafe ฮีลใจ`,
        description: [
          `-# ประจำวันที่ **${reportData.dateStr}** 🍵\n`,
          `### 📈 ภาพรวมการให้บริการ`,
          `* ✅⠀**จำนวนเคสที่สำเร็จทั้งหมด:** **${reportData.totalOrders || 0}** เคส`,
          `* 💰⠀**ยอดเงินรวมสะพัด:** **${reportData.totalRevenue || 0}** บาท`,
          `* 🏢⠀**ส่วนแบ่งคาเฟ่ (30%):** **${reportData.platformShare || 0}** บาท`,
          `* 👥⠀**ส่วนแบ่งที่ปรึกษาทั้งหมด (70%):** **${reportData.counselorShare || 0}** บาท\n`,
          `### 👥 รายได้สะสมของที่ปรึกษาประจำวัน (70%)`,
          breakdownLines,
          `\n> 💡 *ข้อมูลนี้ถูกสรุปและบันทึกอัตโนมัติประจำวันเพื่อความโปร่งใสของทีมงานค่ะ*`
        ].join("\n"),
        color: 0x57F287,
        footer: {
          text: "Bear Cafe • Financial & Session Daily Report"
        },
        timestamp: new Date().toISOString()
      }
    ]
  };
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
  ALL_SPECIALTIES
};

