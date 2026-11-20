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
 * @param {string} [params.userId] - Discord User ID
 * @param {string} params.rewardName - ชื่อของรางวัล
 * @param {string} params.rewardType - 'auto' หรือ 'manual'
 * @param {boolean} params.hasClaimedFirstTime - สมาชิกเคยรับแต้มครั้งแรกหรือไม่
 * @param {number|null} params.expiryTimestamp - Unix Timestamp วันหมดเขต (กรณี manual)
 * @param {string|null} params.fallbackNotice - ข้อความแจ้งเตือนกรณีแปลงยศเป็นแต้มสำรอง
 * @param {number} [params.remainingCoins=0] - จำนวนเหรียญคงเหลือ
 */
function buildResultPayload({ userId, rewardName, rewardType, hasClaimedFirstTime, expiryTimestamp, fallbackNotice, remainingCoins = 0 }) {
  const userMention = userId ? `<@${userId}>` : "คุณ";
  let contentText = `### ${userMention} ได้รับ ${rewardName}\n`;

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

  const containerComponents = [];

  // หากยังไม่เคยรับแต้มครั้งแรก ให้เพิ่มข้อความแจ้งและแบนเนอร์ด้านล่าง
  if (!hasClaimedFirstTime) {
    contentText += `- แคปหน้านี้แล้วอวดที่ห้อง <#1524124134387224828> หลังจากนั้นจากนั้นแคปส่งที่ <#${CHANNELS.FIRST_TIME_CLAIM}> เพื่อรับรางวัล (ได้ครั้งเดียว)`;

    containerComponents.push(
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
    );
  } else {
    // หากเคยรับแต้มครั้งแรกแล้ว แสดงเฉพาะข้อความ ไม่แสดงแบนเนอร์
    containerComponents.push({
      type: 10,
      content: contentText.trim()
    });
  }

  // หากยังมีเหรียญเหลือ (remainingCoins > 0) ให้เพิ่มปุ่ม "︲โยนอีกครั้ง" ไว้ล่างสุด
  if (remainingCoins > 0) {
    containerComponents.push(
      {
        type: 14,
        spacing: 1,
        divider: false
      },
      {
        type: 1,
        components: [
          {
            type: 2,
            style: 3,
            custom_id: CUSTOM_IDS.ROLL_AGAIN,
            label: "︲โยนอีกครั้ง",
            emoji: {
              id: "1572475322165633124",
              name: "flowingstar",
              animated: true
            }
          }
        ]
      }
    );
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
 * @param {Array|Object} historyData - รายการประวัติ หรือ Object ที่มี pendingItems / claimedItems
 * @param {number} currentPage - หน้าปัจจุบัน
 * @param {number} totalPages - จำนวนหน้าทั้งหมด
 */
function buildHistoryPayload(historyData = [], currentPage = 1, totalPages = 1) {
  let pendingItems = [];
  let claimedItems = [];

  if (Array.isArray(historyData)) {
    pendingItems = historyData.filter((item) => item.reward_type === "manual" && !item.is_claimed);
    claimedItems = historyData.filter((item) => item.reward_type === "auto" || item.is_claimed);
  } else if (historyData && typeof historyData === "object") {
    pendingItems = historyData.pendingItems || [];
    claimedItems = historyData.claimedItems || [];
    if (historyData.currentPage) currentPage = historyData.currentPage;
    if (historyData.totalPages) totalPages = historyData.totalPages;
  }

  // 1. หัวข้อหลัก (Title Header)
  const containerComponents = [
    {
      type: 10,
      content: "## <a:bearcase:1572475350519259269>︲__` 𝖣𝗋𝖺𝗐 𝗁𝗂𝗌𝗍𝗈𝗋𝗒 ₊ ประวัติการสุ่ม 𓂃 `__"
    },
    {
      type: 14,
      spacing: 2
    }
  ];

  // กรณีไม่มีประวัติเลยทั้งสองหมวด (ผู้ใช้ใหม่)
  if (pendingItems.length === 0 && claimedItems.length === 0) {
    containerComponents.push({
      type: 10,
      content: "ยังไม่มีประวัติการสุ่มโยนเหรียญของคุณในระบบค่ะ 🍃"
    });
  } else {
    // 2. หมวดรางวัลที่รอการรับ (Pending Section) — แสดงเฉพาะเมื่อมีของรางวัลที่ยังไม่ได้กดรับจริง
    if (pendingItems.length > 0) {
      let pendingContent = "### <a:bearg11:1396016056035840140>︲รางวัลที่รอการรับ\n";
      pendingItems.forEach((item, index) => {
        const num = index + 1;
        const name = (item.history_name || item.reward_name || "ของรางวัล").slice(0, 80);
        const createdTs = Math.floor(new Date(item.created_at || Date.now()).getTime() / 1000);
        const expiryTs = item.expires_at
          ? Math.floor(new Date(item.expires_at).getTime() / 1000)
          : createdTs + 2592000;
        pendingContent += `${num}. __\`${name}\`__ — <t:${createdTs}:s> หมดเขตรับ <t:${expiryTs}:R>\n`;
      });

      containerComponents.push({
        type: 10,
        content: pendingContent.trimEnd()
      });

      // เส้นคั่นแบ่งหมวดหมู่ (Divider Separator) แทรกเฉพาะเมื่อมีหมวดรับเรียบร้อยตามมา
      if (claimedItems.length > 0) {
        containerComponents.push({
          type: 14,
          spacing: 2,
          divider: true
        });
      }
    }

    // 3. หมวดรับเรียบร้อย (Claimed Section) — แสดงรายการที่ได้รับแล้ว
    if (claimedItems.length > 0) {
      let claimedContent = "### <:50121checkmark:1358584609087946867>︲รับเรียบร้อย\n";
      claimedItems.forEach((item, index) => {
        const num = (currentPage - 1) * 15 + index + 1;
        const name = (item.history_name || item.reward_name || "ของรางวัล").slice(0, 80);
        const createdTs = Math.floor(new Date(item.created_at || Date.now()).getTime() / 1000);
        claimedContent += `${num}. __\`${name}\`__ — <t:${createdTs}:s>\n`;
      });

      containerComponents.push({
        type: 10,
        content: claimedContent.trimEnd()
      });
    }
  }

  // 5. แถบปุ่มเลื่อนหน้า (Pagination Controls ถ้ามีมากกว่า 1 หน้า)
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
