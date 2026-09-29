const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");
const templates = require('./discohook_templates.json');

const FLAG_V2 = 32768; // MessageFlags.IsComponentsV2
const FLAG_EPHEMERAL = 64; // MessageFlags.Ephemeral

/**
 * 1. บอร์ดอ่านข้อตกลงและนโยบาย
 */
function buildAgreementPayload() {
  return JSON.parse(JSON.stringify(templates.board_1_terms));
}

/**
 * 2. บอร์ดเมนูเครื่องดื่มและสั่งบริการ
 */
function buildMainMenuPayload() {
  return JSON.parse(JSON.stringify(templates.board_2_menu));
}

/**
 * Helper ปรับแต่ง Component v2 Payload ให้ปลอดภัย:
 * - ตัด Media Gallery ที่มี items ว่างออก (ป้องกัน Discord 400 Bad Request)
 * - ตัด flow metadata ของ Discohook ออกจาก Buttons
 */
function sanitizeComponentV2(payload) {
  if (!payload || !payload.components) return payload;
  const clone = JSON.parse(JSON.stringify(payload));
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
  return payload;
}

/**
 * 5. การ์ดแจ้งเตือนรับเคสใหม่ (Targeted & Open Dispatch)
 * @param {object} dispatchInfo - { counselorId, orderId, orderCode, packageName, duration, isSilent, isBooster, totalMinutes, totalPrice, expireTimestamp }
 */
function buildDispatchAlertPayload(dispatchInfo) {
  const isTargeted = Boolean(dispatchInfo.counselorId);
  const counselorMention = isTargeted ? `<@${dispatchInfo.counselorId}>` : `เปิดรับคำขอ (ทุกคนที่ว่าง)`;
  const headerNote = isTargeted
    ? `ระบบได้สุ่มเลือกคุณจากรายชื่อผู้ให้คำปรึกษาที่สถานะ 🟢 ว่าง อยู่ในขณะนี้ค่ะ`
    : `เคสเปิดรับคำขอสำหรับผู้ให้คำปรึกษาทุกคนที่ว่าง สามารถกดรับเคสได้ทันทีค่ะ`;
  const contentMention = isTargeted
    ? `<@&1536208070420733982> 🔔 มีเคสใหม่ส่งถึงคุณ <@${dispatchInfo.counselorId}>`
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
  if (dispatchInfo.toppingName && dispatchInfo.toppingName !== 'none' && dispatchInfo.toppingName !== 'ไม่มี') {
    toppingText = dispatchInfo.toppingName;
  } else if (dispatchInfo.isSilent) {
    toppingText = 'นั่งเงียบเป็นเพื่อน (+19 บาท)';
  } else if (dispatchInfo.isSpecific) {
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

  return {
    content: null,
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
  };
}

/**
 * 6. แผงควบคุมในห้องสนทนาส่วนตัว (Session Dashboard)
 * @param {object} sessionInfo - { customerId, counselorId, totalMinutes, isBooster, packageName, serviceMode, voiceChannelId }
 */
function buildSessionDashboardPayload(sessionInfo = {}) {
  const customerMention = `<@${sessionInfo.customerId}>`;
  const counselorMention = `<@${sessionInfo.counselorId}>`;
  const totalMinutes = sessionInfo.totalMinutes || 30;
  const boosterNote = sessionInfo.isBooster ? ' (รวมโบนัส Booster +5 นาที)' : '';
  const voiceNote = (sessionInfo.serviceMode === 'voice' && sessionInfo.voiceChannelId)
    ? `\n* 🎙️⠀**ห้องเสียง:** <#${sessionInfo.voiceChannelId}>`
    : '';

  return {
    content: null,
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: [
              `## 🍵︲__\` ยินดีต้อนรับสู่ห้องสนทนาส่วนตัว (Heal Jai) 𓂃 \`__`,
              `-# พื้นที่ปลอดภัยของคุณเปิดให้บริการแล้ว ขอให้เป็นช่วงเวลาที่อบอุ่นและผ่อนคลายนะคะ\n`,
              `* 👤⠀**ลูกค้า:** ${customerMention}`,
              `* 🍵⠀**ผู้รับฟัง:** ${counselorMention}`,
              `* ⏱️⠀**เวลาให้บริการ:** ${totalMinutes} นาที${boosterNote}${voiceNote}\n`,
              `> 💡 *เมื่อทั้งสองฝ่ายพร้อม ให้ที่ปรึกษากดปุ่ม **"▶️ เริ่มเซสชัน"** ด้านล่างเพื่อเริ่มจับเวลา ระบบจะแจ้งเตือนเมื่อเหลือ 5 นาที / 1 นาที และปิดห้องอัตโนมัติเมื่อครบเวลาค่ะ*`
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
                style: 3,
                type: 2,
                label: '︲เริ่มเซสชัน',
                emoji: {
                  name: '▶️'
                },
                custom_id: 'heal_jai_start_session'
              },
              {
                style: 4,
                type: 2,
                label: '︲จบบริการ (ก่อนเวลา)',
                emoji: {
                  name: '⏹️'
                },
                custom_id: 'heal_jai_end_session'
              }
            ]
          }
        ]
      }
    ]
  };
}

/**
 * 7. การ์ดส่งความประทับใจสำหรับส่งให้ลูกค้า (Prompt Rating)
 */
function buildFeedbackPromptPayload() {
  return JSON.parse(JSON.stringify(templates.board_7_feedback_card));
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

  return {
    content: null,
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
  };
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
    label: "คุณซีบิว — อายุ 20",
    description: "ใจดี อบอุ่น รับฟังทุกเรื่องได้อย่างสบายใจ",
    emoji: "🍀"
  },
  counselor_sugar: {
    id: "counselor_sugar",
    name: "น้องหมีชูการ์ 🐻",
    label: "น้องหมีชูการ์ 🐻 (🟢 ว่าง)",
    description: "ใจดี อบอุ่น รับฟังทุกเรื่องได้อย่างสบายใจ",
    emoji: "🐻"
  },
  counselor_sakura: {
    id: "counselor_sakura",
    name: "คุณหมีซากุระ 🌸",
    label: "คุณหมีซากุระ 🌸 (🟢 ว่าง)",
    description: "สายผ่อนคลาย คุยสบาย สไตล์เพื่อนข้างห้อง",
    emoji: "🌸"
  },
  counselor_mocha: {
    id: "counselor_mocha",
    name: "บาริสต้าหมีมอคค่า ☕",
    label: "บาริสต้าหมีมอคค่า ☕ (🟢 ว่าง)",
    description: "รับฟังนิ่งๆ ใจเย็น ให้พื้นที่ปลอดภัยเต็มที่",
    emoji: "☕"
  },
  counselor_honey: {
    id: "counselor_honey",
    name: "หมีน้อยฮันนี่ 🍯",
    label: "หมีน้อยฮันนี่ 🍯 (🟢 ว่าง)",
    description: "พลังบวก สดใส ให้กำลังใจเก่ง",
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
    return {
      content: null,
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
    };
  }

  // ── STEP 2: คลิกปุ่มเลือกเครื่องดื่ม (2/3) ───────────────────────────
  if (step === 2 || !drinkId) {
    return {
      content: null,
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
    };
  }

  // ── STEP 3b: คลิกเลือกผู้รับฟังจาก Dropdown (3/3) ─────────────────
  if (step === 3.5 || (toppingId === "specific_39" && !counselorId && step !== 4)) {
    const defaultCounselorOptions = counselorOptions || Object.values(MOCK_COUNSELORS).map((c) => ({
      label: c.label || c.name,
      value: c.id,
      emoji: { name: c.emoji || "🍀" }
    }));

    return {
      content: null,
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
                  placeholder: "🟢︲คลิกเลือกผู้รับฟัง",
                  min_values: 1,
                  max_values: 1,
                  options: defaultCounselorOptions.slice(0, 25)
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
    };
  }

  // ── STEP 3: คลิกปุ่มเลือกท็อปปิ้ง (3/3) ───────────────────────────
  if (step === 3 || (!toppingId && step !== 4)) {
    return {
      content: null,
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
    };
  }

  // ── STEP 4: ทวนรายการเครื่องดื่มของท่าน (Summary / Checkout) ────────
  let toppingLine = "### 3. ไม่ใส่ท็อปปิ้ง";
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

  return {
    content: null,
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
                content: `## 📝︲__\` ทวนรายการเครื่องดื่มของท่าน \`__\n### 1. ${modeName}\n### 2. ${drink ? drink.name : "เครื่องดื่ม"} — ${drink ? drink.price : 0} บาท\n${toppingLine}\n# ยอดรวม: 💸 ${totalPrice} บาท`
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
  };
}

// ── ฟังก์ชันคงไว้สำหรับความเข้ากันได้ ─────────────────────────────────
function buildInteractiveMenuPayload(params) {
  return buildInteractiveOrderPayload(params);
}

/**
 * สร้างการ์ดชำระเงิน (Scan to Pay Component v2)
 */
function buildScanToPayPayload(orderInfo = {}) {
  const summaryLines = [
    `### <:matchamochi:1536695320174534699>︲__\` สรุปรายการคำสั่งซื้อของคุณ \`__`,
    `* 🍵⠀**แพ็กเกจ:** ${orderInfo.packageName || 'เครื่องดื่มพักใจ'} (${orderInfo.duration || 30} นาที)`,
    orderInfo.toppingName ? `* 🌱⠀**ท็อปปิ้ง:** ${orderInfo.toppingName}` : null,
    orderInfo.counselorName ? `* 🎯⠀**ระบุตัวผู้รับฟัง:** ${orderInfo.counselorName}` : null,
    orderInfo.isBooster ? `* <:boosthand:1536707497174507620>⠀**สิทธิพิเศษ:** Server Booster (+5 นาทีฟรี)` : null,
    `# ยอดชำระสุทธิ: ${orderInfo.totalPrice || 0} บาท`,
    `> เมื่อโอนเงินเรียบร้อยแล้ว ให้แนบและส่งรูปภาพสลิปในห้องนี้ได้เลยค่ะ ระบบจะทำการตรวจสอบสลิปอัตโนมัติ 🍵`
  ].filter(Boolean).join('\n');

  return {
    content: null,
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
  };
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
function buildCounselorCardPayload(counselorData = {}, member = null) {
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

  const topContent = [
    `## <:idolgreensuki:1554499554575913041>︲<@${userId}> ${displayName}`,
    `" ${bio} "\n`,
    `> สถานะการทำงาน: \`${statusText}\``,
    `> บริการ: \`[🔊 คอลเสียง]\` \`[💬 พิมพ์คุย]\` \`[🍃 โหมดนั่งเงียบเป็นเพื่อน]\``,
    `> คะแนนเฉลี่ย: ${rating} / 5.00 (${totalReviews} รีวิว)`,
    `> บริการสำเร็จ: ${totalSessions} คน`
  ].join("\n");

  return {
    content: null,
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
          },
          {
            type: 14,
            spacing: 2
          }
        ]
      }
    ]
  };
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

module.exports = {
  FLAG_V2,
  FLAG_EPHEMERAL,
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
  ALL_SPECIALTIES
};
