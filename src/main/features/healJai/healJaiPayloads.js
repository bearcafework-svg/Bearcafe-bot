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
      `**ช่องทางชำระเงิน (พร้อมเพย์):** \`09x-xxx-xxxx\` (ธ.กสิกรไทย / พร้อมเพย์)\n-# เมื่อโอนเงินเรียบร้อยแล้ว ให้ใช้คำสั่ง **\`/ยืนยันการโอน\`** ในห้องนี้เพื่อตรวจสอบสลิปอัตโนมัติได้เลยค่ะ`
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

  const packageName = dispatchInfo.packageName || 'โกโก้พักใจ 30 นาที';
  const silentText = dispatchInfo.isSilent ? 'นั่งเงียบเป็นเพื่อน (+15 บาท)' : 'ทั่วไป (พูดคุย/รับฟัง)';
  const boosterText = dispatchInfo.isBooster ? 'Server Booster (+5 นาทีฟรี)' : 'ไม่มี';
  const totalMinutes = dispatchInfo.totalMinutes || 30;
  const totalPrice = dispatchInfo.totalPrice || 69;
  const expireTimestamp = dispatchInfo.expireTimestamp || Math.floor((Date.now() + 3 * 60 * 1000) / 1000);
  const targetId = dispatchInfo.orderCode || dispatchInfo.orderId || 'general';

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

// ── ข้อมูลเมนูเครื่องดื่มและท็อปปิ้งสำหรับระบบ Interactive Selection ──────
const DRINK_OPTIONS = {
  tea_39: {
    id: "tea_39",
    name: "ชาเขียวอุ่นใจ",
    label: "ชาเขียวอุ่นใจ — 39 บาท / 15 นาที",
    price: 39,
    duration: 15,
    tier: "S",
    emoji: "🍵",
    description: "แวะมานั่งคุยกันสั้น ๆ เล่าได้เต็มที่ ไม่ต้องเกรงใจ"
  },
  cocoa_69: {
    id: "cocoa_69",
    name: "โกโก้พักใจ",
    label: "โกโก้พักใจ — 69 บาท / 30 นาที",
    price: 69,
    duration: 30,
    tier: "M",
    emoji: "🍫",
    description: "ครึ่งชั่วโมงสำหรับเรื่องที่เธออยากเล่า"
  },
  coffee_129: {
    id: "coffee_129",
    name: "กาแฟคุยยาว",
    label: "กาแฟคุยยาว — 129 บาท / 1 ชั่วโมง",
    price: 129,
    duration: 60,
    tier: "L",
    emoji: "☕",
    description: "ค่อย ๆ เล่า ค่อย ๆ คุย ไม่ต้องรีบ เรามีเวลาให้คุณเต็ม 1 ชั่วโมง"
  }
};

const TOPPING_OPTIONS = {
  silent_15: {
    id: "silent_15",
    name: "นั่งเงียบเป็นเพื่อน",
    label: "นั่งเงียบเป็นเพื่อน — 15 บาท",
    price: 15,
    emoji: "🍯",
    description: "ไม่อยากคุยก็ไม่เป็นไร แค่อยากมีใครอยู่ด้วยเงียบ ๆ"
  },
  specific_30: {
    id: "specific_30",
    name: "ระบุตัวผู้รับฟัง",
    label: "ระบุตัวผู้รับฟัง — 30 บาท",
    price: 30,
    emoji: "🍒",
    description: "เลือกผู้รับฟังที่ต้องการได้"
  }
};

const MOCK_COUNSELORS = {
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
 * สร้างการ์ดเลือกเมนูเครื่องดื่มและท็อปปิ้ง (Interactive Component v2)
 */
function buildInteractiveMenuPayload({ selectedDrink = null, selectedTopping = null, selectedCounselor = null } = {}) {
  const drink = selectedDrink ? DRINK_OPTIONS[selectedDrink] : null;
  const topping = selectedTopping ? TOPPING_OPTIONS[selectedTopping] : null;
  const counselor = (selectedTopping === "specific_30" && selectedCounselor) ? MOCK_COUNSELORS[selectedCounselor] : null;

  const drinkPrice = drink ? drink.price : 0;
  const toppingPrice = topping ? topping.price : 0;
  const totalPrice = drinkPrice + toppingPrice;

  let orderContent = "## 📝︲__` 𝖮𝗋𝖽𝖾𝗋 𝗇𝗈𝗐 ₊ ออเดอร์ตอนนี้ 𓂃 `__\n### คุณสามารถสั่งเมนูได้จากปุ่มข้างล่างนี้ค่ะ !";
  if (drink) {
    const lines = [`## 📝︲__\` 𝖮𝗋𝖽𝖾𝗋 𝗇𝗈𝗐 ₊ ออเดอร์ตอนนี้ 𓂃 \`__`, `1. **${drink.label}**`];
    if (selectedTopping === "specific_30") {
      if (counselor) {
        lines.push(`2. **ระบุตัวผู้รับฟัง: ${counselor.name} (+30 บาท)**`);
      } else {
        lines.push(`2. **ระบุตัวผู้รับฟัง — 30 บาท** *(โปรดคลิกเลือกผู้รับฟังด้านล่าง)*`);
      }
    } else if (topping) {
      lines.push(`2. **${topping.label}**`);
    }
    orderContent = lines.join("\n");
  }

  const drinkSelectOptions = Object.values(DRINK_OPTIONS).map((d) => ({
    label: d.label,
    value: d.id,
    emoji: { name: d.emoji },
    description: d.description,
    default: selectedDrink === d.id
  }));

  const isDrinkChosen = Boolean(selectedDrink);

  const toppingSelectOptions = Object.values(TOPPING_OPTIONS).map((t) => ({
    label: t.label,
    value: t.id,
    emoji: { name: t.emoji },
    description: t.description,
    default: selectedTopping === t.id
  }));

  const cardComponents = [
    {
      type: 10,
      content: "## <:cupofmatcha:1536694010780065863>︲__` 𝖲𝖾𝗅𝖾𝖼𝗍 your 𝖽𝗋𝗂𝗇𝗄 ₊ สั่งเครื่องดื่ม 𓂃 `__\n-# <:lowwarning:1548772721679278180> **โปรดอ่านก่อนสั่งซื้อ:** ระบบนี้เป็นระบบ **ชำระเงินอัตโนมัติ** เมื่อชำระเงินสำเร็จ ระบบจะดำเนินการ **เรียกคิวและจ่ายงานให้ผู้รับฟังทันที**\n\n-# ดังนั้น ก่อนกดสั่งซื้อเครื่องดื่ม กรุณาตรวจสอบแพ็กเกจและรายละเอียดให้เรียบร้อย และ **ตัดสินใจให้แน่ใจก่อนยืนยันการสั่งซื้อ** เนื่องจากระบบจะเริ่มดำเนินการทันทีหลังชำระเงินค่ะ"
    },
    {
      type: 12,
      items: [
        {
          media: {
            url: "https://cdn.discordapp.com/attachments/1536267579843280987/1547153668409655357/HealJai_2026_ZEAB1U_._All_Rights_Reserved._4.png?ex=6aab9d23&is=6aaa4ba3&hm=c4a3b94e601bb5dc928c5b85994068f6366c0aa1842c886a298e41f4a0d4a1b9&"
          }
        }
      ]
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
          type: 3,
          custom_id: "heal_jai_select_drink",
          placeholder: "🗒️︲คลิกเลือกเครื่องดื่ม",
          min_values: 1,
          max_values: 1,
          disabled: false,
          options: drinkSelectOptions
        }
      ]
    },
    {
      type: 1,
      components: [
        {
          type: 3,
          custom_id: "heal_jai_select_topping",
          placeholder: isDrinkChosen ? "🌱︲คลิกเลือกท็อปปิ้ง" : "คุณต้องเลือกเครื่องดื่มก่อน...",
          min_values: 1,
          max_values: 1,
          disabled: !isDrinkChosen,
          options: toppingSelectOptions
        }
      ]
    }
  ];

  // หากเลือกระบุตัวผู้รับฟัง ให้แสดง Select Menu เลือกผู้รับฟัง (Mock Counselors)
  if (selectedTopping === "specific_30") {
    const counselorSelectOptions = Object.values(MOCK_COUNSELORS).map((c) => ({
      label: c.label,
      value: c.id,
      emoji: { name: c.emoji },
      description: c.description,
      default: selectedCounselor === c.id
    }));

    cardComponents.push({
      type: 1,
      components: [
        {
          type: 3,
          custom_id: "heal_jai_select_counselor",
          placeholder: "🎯︲คลิกเลือกผู้รับฟังที่คุณต้องการ",
          min_values: 1,
          max_values: 1,
          disabled: false,
          options: counselorSelectOptions
        }
      ]
    });
  }

  const isSpecificAndNotChosen = (selectedTopping === "specific_30" && !selectedCounselor);
  const isPayDisabled = !isDrinkChosen || isSpecificAndNotChosen;

  cardComponents.push(
    {
      type: 14,
      divider: false
    },
    {
      type: 1,
      components: [
        {
          style: 1,
          type: 2,
          label: `ยอดรวม: ${totalPrice} บาท`,
          custom_id: "heal_jai_total_display",
          disabled: true
        },
        {
          style: 3,
          type: 2,
          label: "จ่ายเงิน",
          custom_id: "heal_jai_btn_pay",
          disabled: isPayDisabled
        },
        {
          style: 4,
          type: 2,
          label: "ยกเลิก",
          custom_id: "heal_jai_btn_cancel_prompt"
        },
        {
          type: 2,
          style: 5,
          url: "https://discord.com/channels/1536199707922141254/1537023263845126205",
          label: "︲พบปัญหา",
          emoji: {
            id: "1548772721679278180",
            name: "lowwarning",
            animated: false
          }
        }
      ]
    }
  );

  return {
    content: null,
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: cardComponents
      }
    ]
  };
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
    ``,
    `**ช่องทางชำระเงิน (พร้อมเพย์):** \`09x-xxx-xxxx\` (ธ.กสิกรไทย / พร้อมเพย์ - ระบบจำลอง)\n-# เมื่อโอนเงินเรียบร้อยแล้ว ให้ใช้คำสั่ง **\`/ยืนยันการโอน\`** หรือ **\`/ยืนยันสลิป\`** ในห้องนี้เพื่อตรวจสอบสลิปอัตโนมัติได้เลยค่ะ`
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
            content: "## <a:fourleafclover:1536711677699952680>︲__` 𝖲𝖼𝖺𝗇 𝗍𝗈 𝗉𝖺𝗒 ₊ ชำระเงิน 𓂃 `__\n- **อ่านก่อนชำระเงิน:** กรุณาตรวจสอบข้อมูลและยอดเงินให้ถูกต้องก่อนทำรายการ หากโอนเงินผิดหรือโอนเกิน ทางเซิร์ฟเวอร์ขอสงวนสิทธิ์ไม่รับผิดชอบในทุกกรณี\n- **กรณีโอนเงินเกินจำนวน (Overpayment):**\n  - หากพบว่ามียอดโอนเกิน บอทจะยังไม่อนุมัติสถานะการชำระเงินอัตโนมัติ เพื่อป้องกันความผิดพลาดทางบัญชี\n  - ระบบจะดึงห้อง Ticket นี้ให้แจ้งเตือนแอดมินเข้ามาตรวจสอบยอดเงินส่วนต่างด้วยตนเอง\n  - การจัดการ: แอดมินจะติดต่อกลับในห้อง Ticket เพื่อตรวจสอบหลักฐาน หากเป็นยอดส่วนต่างจำนวนน้อย จะถูกบันทึกเป็นเครดิตสะสม/ทิปตามความสมัครใจ แต่หากเป็นยอดเงินเกินจำนวนมาก ทีมงานจะดำเนินการโอนส่วนที่เกินคืนเข้าบัญชีต้นทางของลูกค้า (โดยหักค่าธรรมเนียมการโอนตามจริงถ้ามี)"
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
                style: 2,
                type: 2,
                label: "︲ติดต่อทีมงาน",
                emoji: {
                  name: "🚨"
                },
                custom_id: "btn_call_admin"
              }
            ]
          }
        ]
      }
    ]
  };
}

module.exports = {
  FLAG_V2,
  FLAG_EPHEMERAL,
  DRINK_OPTIONS,
  TOPPING_OPTIONS,
  MOCK_COUNSELORS,
  buildAgreementPayload,
  buildMainMenuPayload,
  buildShiftPanelPayload,
  buildCheckoutTicketPayload,
  buildInteractiveMenuPayload,
  buildScanToPayPayload,
  buildDispatchAlertPayload,
  buildSessionDashboardPayload,
  buildFeedbackPromptPayload,
  buildPublicReviewShowcasePayload
};
