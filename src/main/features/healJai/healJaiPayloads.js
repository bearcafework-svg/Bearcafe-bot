// src/main/features/healJai/healJaiPayloads.js
// ตัวสร้าง Component v2 Payloads สำหรับระบบ Bear Cafe ฮีลใจ (Heal Jai System)

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
 * 3. แผงตอกบัตรเข้ากะของทีมงาน (Shift Panel)
 */
function buildShiftPanelPayload() {
  return JSON.parse(JSON.stringify(templates.board_3_shift_panel));
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
      `**ช่องทางชำระเงิน (พร้อมเพย์):** \`09x-xxx-xxxx\` (ธ.กสิกรไทย / พร้อมเพย์)\n-# เมื่อโอนเสร็จแล้ว ให้แนบรูปสลิปในห้องนี้ แล้วกดปุ่มด้านล่างได้เลยค่ะ`
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
 * 5. การ์ดแจ้งเตือนรับเคสใหม่ (Targeted Dispatch)
 * @param {object} dispatchInfo - { counselorId, orderId, packageName, duration, isSilent, isBooster, totalMinutes, totalPrice, expireTimestamp }
 */
function buildDispatchAlertPayload(dispatchInfo) {
  const counselorMention = `<@${dispatchInfo.counselorId}>`;
  const packageName = dispatchInfo.packageName || 'โกโก้พักใจ 30 นาที';
  const silentText = dispatchInfo.isSilent ? 'นั่งเงียบเป็นเพื่อน (+15 บาท)' : 'ทั่วไป (พูดคุย/รับฟัง)';
  const boosterText = dispatchInfo.isBooster ? 'Server Booster (+5 นาทีฟรี)' : 'ไม่มี';
  const totalMinutes = dispatchInfo.totalMinutes || 30;
  const totalPrice = dispatchInfo.totalPrice || 69;
  const expireTimestamp = dispatchInfo.expireTimestamp || Math.floor((Date.now() + 3 * 60 * 1000) / 1000);

  return {
    content: `<@&1536208070420733982> 🔔 มีเคสใหม่ส่งถึงคุณ ${counselorMention}`,
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
                content: [
                  `## <a:bellpress:1547361650552737914>︲__\` 𝖭𝗈𝗍𝗂𝖼𝖾 ₊ มีเคสใหม่ส่งตรงถึงคุณ 𓂃 \`__`,
                  `-# ระบบได้สุ่มเลือกคุณจากรายชื่อผู้ให้คำปรึกษาที่สถานะ 🟢 ว่าง อยู่ในขณะนี้ค่ะ\n`,
                  `* 🎯⠀**ที่ปรึกษาที่ได้รับเลือก:** ${counselorMention}`,
                  `* 🍵⠀**แพ็กเกจ:** ${packageName}`,
                  `* 🌙⠀**ท็อปปิ้ง:** ${silentText}`,
                  `* 🌟⠀**สิทธิพิเศษ:** ${boosterText}`,
                  `* ⏳⠀**เวลานับถอยหลัง:** หมดเวลาใน **<t:${expireTimestamp}:R>** (3 นาที)`,
                  `# ยอดรวม: ${totalPrice} บาท (ยังไม่หัก %)`,
                  `> ⚠️⠀*โปรดกดรับเคสภายใน 3 นาที หากไม่สะดวกสามารถกด **"สละสิทธิ์"** เพื่อให้ระบบสุ่มส่งต่อให้ท่านถัดไปได้ทันทีค่ะ*`
                ].join('\n')
              }
            ],
            accessory: {
              type: 11,
              media: {
                url: 'https://cdn.discordapp.com/attachments/1536267579843280987/1547362521919529081/New_premium_11.png'
              },
              spoiler: true
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
                custom_id: `heal_jai_claim_case_${dispatchInfo.orderId || 'general'}`
              },
              {
                style: 4,
                type: 2,
                label: '︲สละสิทธิ์ / ส่งต่อ',
                emoji: {
                  name: '↩️'
                },
                custom_id: `heal_jai_pass_case_${dispatchInfo.orderId || 'general'}`
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
 * @param {object} sessionInfo - { customerId, counselorId, totalMinutes, isBooster, packageName }
 */
function buildSessionDashboardPayload(sessionInfo = {}) {
  const customerMention = `<@${sessionInfo.customerId}>`;
  const counselorMention = `<@${sessionInfo.counselorId}>`;
  const totalMinutes = sessionInfo.totalMinutes || 30;
  const boosterNote = sessionInfo.isBooster ? ' (รวมโบนัส Booster +5 นาที)' : '';

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
              `* ⏱️⠀**เวลาให้บริการ:** ${totalMinutes} นาที${boosterNote}\n`,
              `> 💡 *เมื่อทั้งสองฝ่ายทักทายและพร้อมแล้ว ให้ที่ปรึกษากดปุ่ม **"▶️ เริ่มเซสชัน"** ด้านล่างเพื่อเริ่มจับเวลา บอทจะแจ้งเตือนเมื่อเหลือ 5 นาทีสุดท้ายค่ะ*`
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
                label: '︲สิ้นสุดเซสชัน',
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

module.exports = {
  FLAG_V2,
  FLAG_EPHEMERAL,
  buildAgreementPayload,
  buildMainMenuPayload,
  buildShiftPanelPayload,
  buildCheckoutTicketPayload,
  buildDispatchAlertPayload,
  buildSessionDashboardPayload,
  buildFeedbackPromptPayload,
  buildPublicReviewShowcasePayload
};
