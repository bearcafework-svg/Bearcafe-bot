// src/features/coinGacha/coinGachaPayloads.js
// ตัวสร้าง Component V2 JSON สำหรับระบบหมีโยนเหรียญ (คงโครงสร้างเดิม 100%)

const { MEDIA, CHANNELS, CUSTOM_IDS, FLAG_V2_PUBLIC, FLAG_V2_EPHEMERAL } = require("./coinGachaConfig");

/**
 * 1. แผงหน้าตู้สุ่มหลักสำหรับคำสั่ง /send-component options: ตู้สุ่มโยนเหรียญ (Coin Machine)
 */
function buildMainMachinePayload() {
  return {
    flags: FLAG_V2_PUBLIC,
    components: [
      {
        type: 17,
        components: [
          {
            type: 12,
            items: [
              {
                media: {
                  url: MEDIA.MAIN_PANEL_IMAGE
                }
              }
            ]
          },
          {
            type: 12,
            items: [
              {
                media: {
                  url: MEDIA.MAIN_PANEL_GIF
                }
              }
            ]
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
                style: 3,
                type: 2,
                custom_id: CUSTOM_IDS.ROLL,
                label: "︲โยนเหรียญสุ่มรางวัล",
                emoji: {
                  id: "1572475322165633124",
                  name: "flowingstar",
                  animated: true
                }
              },
              {
                style: 1,
                type: 2,
                custom_id: `${CUSTOM_IDS.HISTORY_PREFIX}1`,
                label: "︲ประวัติ",
                emoji: {
                  id: "1572475350519259269",
                  name: "bearcase",
                  animated: true
                }
              },
              {
                style: 2,
                type: 2,
                custom_id: CUSTOM_IDS.CHECK,
                label: "︲เช็กเหรียญ",
                emoji: {
                  id: "1292889186403090482",
                  name: "GachaCoin_bearcafe",
                  animated: false
                }
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
            content: "## <a:bearg23:1396016002818506754> ผู้สนับสนุนรางวัล:\n- หากต้องการสนับสนุนของรางวัลให้น้อง ๆ ติดต่อ <@944920660759707658> ผ่านแชทส่วนตัวได้เลยค่ะ ขอบคุณค่ะ *!*"
          },
          {
            type: 12,
            items: [
              {
                media: {
                  url: MEDIA.SPONSOR_BANNER_1
                }
              }
            ]
          },
          {
            type: 12,
            items: [
              {
                media: {
                  url: MEDIA.SPONSOR_BANNER_2
                }
              }
            ]
          }
        ]
      }
    ]
  };
}

/**
 * 2. แอนิเมชันกำลังสุ่มรางวัล (Animation Step)
 * @param {string} tier - god, epic, rare, common
 */
function buildRollingAnimationPayload(tier = "common") {
  const tierUrl = MEDIA.TIERS[tier.toLowerCase()] || MEDIA.TIERS.common;
  return {
    flags: FLAG_V2_EPHEMERAL,
    components: [
      {
        type: 17,
        components: [
          {
            type: 12,
            items: [
              {
                media: {
                  url: tierUrl
                }
              }
            ]
          },
          {
            type: 10,
            content: "# <a:flowingstar:1572475322165633124>︲__` กำลังสุ่มรางวัล . . . `__"
          }
        ]
      }
    ]
  };
}

/**
 * 3. การ์ดแสดงผลลัพธ์ของรางวัล (Result Card)
 * @param {Object} params
 * @param {string} params.rewardName - ชื่อของรางวัล
 * @param {string} params.rewardType - 'auto' หรือ 'manual'
 * @param {boolean} params.hasClaimedFirstTime - สมาชิกเคยรับแต้มครั้งแรกหรือไม่
 * @param {number|null} params.expiryTimestamp - Unix Timestamp วันหมดเขต (กรณี manual)
 * @param {string|null} params.fallbackNotice - ข้อความแจ้งเตือนกรณีแปลงยศเป็นแต้มสำรอง
 */
function buildResultPayload({ rewardName, rewardType, hasClaimedFirstTime, expiryTimestamp, fallbackNotice }) {
  let contentText = `### คุณได้รับ ${rewardName}\n`;

  if (rewardType === "auto") {
    if (fallbackNotice) {
      contentText += `- ${fallbackNotice}\n`;
    } else {
      contentText += `- ระบบทำการเพิ่มของรางวัลให้คุณเรียบร้อยแล้วค่ะ\n`;
    }
  } else {
    // manual รับกับทีมงาน
    const expiryStr = expiryTimestamp ? `<t:${expiryTimestamp}:R>` : "1 เดือน";
    contentText += `- ติดต่อรับรางวัลผ่านห้อง <#${CHANNELS.STAFF_CLAIM}> ควรรับภายใน ${expiryStr}\n`;
  }

  // หากยังไม่เคยรับแต้มครั้งแรก ให้เพิ่มข้อความแจ้งและแบนเนอร์ด้านล่าง
  if (!hasClaimedFirstTime) {
    contentText += `- หลังจากแคปแล้ว รับรางวัลได้ที่ <#${CHANNELS.FIRST_TIME_CLAIM}> (ครั้งแรก)`;

    return {
      flags: FLAG_V2_EPHEMERAL,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: contentText
            },
            {
              type: 14,
              divider: false
            },
            {
              type: 12,
              items: [
                {
                  media: {
                    url: MEDIA.FIRST_TIME_BANNER
                  }
                }
              ]
            }
          ]
        }
      ]
    };
  }

  // หากเคยรับแต้มครั้งแรกแล้ว แสดงเฉพาะข้อความ ไม่แสดงแบนเนอร์
  return {
    flags: FLAG_V2_EPHEMERAL,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: contentText.trim()
          }
        ]
      }
    ]
  };
}

/**
 * 4. การ์ดเช็กเหรียญ (Check Coin Card)
 * @param {number} coins - จำนวนเหรียญคงเหลือ
 * @param {string} avatarUrl - รูป Avatar ของผู้ใช้
 */
function buildCheckCoinPayload(coins = 0, avatarUrl) {
  const avatar = avatarUrl || "https://cdn.discordapp.com/embed/avatars/0.png";
  return {
    flags: FLAG_V2_EPHEMERAL,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `## <:GachaCoin_bearcafe:1292889186403090482>︲__\` 𝖸𝗈𝗎𝗋 𝖼𝗈𝗂𝗇 ₊ เหรียญของคุณ = ${coins} 𓂃 \`__\n`
          },
          {
            type: 14,
            spacing: 2
          },
          {
            type: 9,
            components: [
              {
                type: 10,
                content: `### วิธีหาเหรียญง่าย ๆ:\n1. พิมพ์หรือลงห้องไหนก็ได้ ไม่กำหนดเวลา บอทจะทำการสุ่มเหรียญให้คุณ\n2. เมื่อได้รับเหรียญจะแจ้งเตือนผ่าน <#${CHANNELS.COIN_DROP_ALERT}> โดยคุณสามารถรับได้ **__5 เหรียญ / วัน__**`
              }
            ],
            accessory: {
              type: 11,
              media: {
                url: avatar
              }
            }
          }
        ]
      }
    ]
  };
}

/**
 * 5. การ์ดประวัติการสุ่ม (History Card)
 * @param {Array} historyItems - รายการประวัติ
 * @param {number} currentPage - หน้าปัจจุบัน
 * @param {number} totalPages - จำนวนหน้าทั้งหมด
 */
function buildHistoryPayload(historyItems = [], currentPage = 1, totalPages = 1) {
  let contentText = "";

  if (!historyItems || historyItems.length === 0) {
    contentText = "ยังไม่มีประวัติการสุ่มโยนเหรียญของคุณในระบบค่ะ 🍃";
  } else {
    const lines = historyItems.map((item, index) => {
      const num = (currentPage - 1) * 50 + index + 1;
      const createdTs = Math.floor(new Date(item.created_at).getTime() / 1000);
      const name = item.history_name || item.reward_name;

      if (item.reward_type === "auto" || item.is_claimed) {
        return `${num}. ได้รับ \`${name}\` เมื่อ <t:${createdTs}:s> ✅ **รับแล้ว!**`;
      } else {
        const expiryTs = item.expires_at ? Math.floor(new Date(item.expires_at).getTime() / 1000) : createdTs + 2592000;
        return `${num}. ได้รับ \`${name}\` เมื่อ <t:${createdTs}:s> หมดเขตรับ <t:${expiryTs}:R>`;
      }
    });

    contentText = lines.join("\n");
  }

  const containerComponents = [
    {
      type: 10,
      content: "## <a:bearcase:1572475350519259269>︲__` 𝖣𝗋𝖺𝗐 𝗁𝗂𝗌𝗍𝗈𝗋𝗒 ₊ ประวัติการสุ่ม 𓂃 `__"
    },
    {
      type: 14,
      spacing: 2
    },
    {
      type: 10,
      content: contentText
    }
  ];

  // ถ้ามีมากกว่า 1 หน้า ให้เพิ่ม Action Row ปุ่มเลื่อนหน้า
  if (totalPages > 1) {
    const actionRowButtons = [];

    if (currentPage > 1) {
      actionRowButtons.push({
        type: 2,
        style: 2,
        custom_id: `${CUSTOM_IDS.HISTORY_PREFIX}${currentPage - 1}`,
        label: "◀ หน้าก่อนหน้า"
      });
    }

    actionRowButtons.push({
      type: 2,
      style: 2,
      disabled: true,
      custom_id: "coin_gacha_page_indicator",
      label: `หน้า ${currentPage} / ${totalPages}`
    });

    if (currentPage < totalPages) {
      actionRowButtons.push({
        type: 2,
        style: 2,
        custom_id: `${CUSTOM_IDS.HISTORY_PREFIX}${currentPage + 1}`,
        label: "หน้าถัดไป ▶"
      });
    }

    containerComponents.push({
      type: 14,
      spacing: 1,
      divider: false
    });

    containerComponents.push({
      type: 1,
      components: actionRowButtons
    });
  }

  return {
    flags: FLAG_V2_EPHEMERAL,
    components: [
      {
        type: 17,
        components: containerComponents
      }
    ]
  };
}

module.exports = {
  buildMainMachinePayload,
  buildRollingAnimationPayload,
  buildResultPayload,
  buildCheckCoinPayload,
  buildHistoryPayload
};
