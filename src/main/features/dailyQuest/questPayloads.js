// src/features/dailyQuest/questPayloads.js
// ตัวสร้าง Discord Component V2 Payloads สำหรับระบบ Daily Quest

const {
  BANNER_IMAGE_URL,
  SPECIAL_REWARD_ICON_URL,
  POINT_ICON_STR,
  FULL_COMPLETION_BONUS_POINTS,
  PROGRESS_BAR_EMOJIS,
  CHECKMARK_EMOJI,
  CUSTOM_ID_PROGRESS,
  ANNOUNCE_CHANNEL_ID
} = require("./questConstants");

/**
 * แปลงวันที่เป็นข้อความภาษาไทย (เช่น 21 กันยายน 2569)
 * @param {string|Date} dateStr วันที่รูปแบบ YYYY-MM-DD หรือ Date Object
 * @returns {string}
 */
function formatThaiDate(dateStr) {
  const d = dateStr ? new Date(dateStr) : new Date();
  const thaiMonths = [
    "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
    "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
  ];
  const day = d.toLocaleDateString("en-US", { timeZone: "Asia/Bangkok", day: "numeric" });
  const monthIdx = parseInt(d.toLocaleDateString("en-US", { timeZone: "Asia/Bangkok", month: "numeric" }), 10) - 1;
  const year = parseInt(d.toLocaleDateString("en-US", { timeZone: "Asia/Bangkok", year: "numeric" }), 10) + 543;
  return `${day} ${thaiMonths[monthIdx]} ${year}`;
}

/**
 * สร้างข้อความอีโมจิหลอดพลัง Progress Bar ความยาว 9 ชิ้น
 * @param {number} current
 * @param {number} target
 * @returns {string}
 */
function renderProgressBar(current, target) {
  const safeTarget = Math.max(1, target || 1);
  const ratio = Math.min(1, Math.max(0, current / safeTarget));
  const filledCount = Math.round(ratio * 9);

  const { filled, empty } = PROGRESS_BAR_EMOJIS;
  const parts = [];

  // ชิ้นที่ 1 (ซ้ายสุด)
  parts.push(filledCount >= 1 ? filled.left : empty.left);

  // ชิ้นที่ 2 ถึง 8 (ตรงกลาง 7 ชิ้น)
  for (let i = 2; i <= 8; i++) {
    parts.push(filledCount >= i ? filled.middle : empty.middle);
  }

  // ชิ้นที่ 9 (ขวาสุด)
  parts.push(filledCount >= 9 ? filled.right : empty.right);

  return parts.join("");
}

/**
 * สร้างการ์ดประกาศ Daily Quest ประจำวัน (Component V2)
 * @param {string} questDate
 * @param {Array} quests
 * @param {number} nextResetTs Unix Timestamp วินาทีของการรีเซ็ตเที่ยงคืน
 * @returns {object}
 */
function buildDailyQuestAnnouncementPayload(questDate, quests, nextResetTs) {
  const thaiDate = formatThaiDate(questDate);

  const questComponents = [];
  for (const q of quests) {
    questComponents.push({
      type: 10,
      content: `## ${q.title}\n- __\`วิธีทำเควส\`__ : ${q.description}\n- __\`รางวัล\`__ : ${POINT_ICON_STR} **+${q.reward_points}**`
    });
    questComponents.push({
      type: 14,
      spacing: 2
    });
  }

  return {
    flags: 32768, // Component V2
    components: [
      {
        type: 17,
        components: [
          {
            type: 12,
            items: [
              {
                media: {
                  url: BANNER_IMAGE_URL
                }
              }
            ]
          },
          {
            type: 9,
            components: [
              {
                type: 10,
                content:
                  `## <:bee20000:1256669436350562355>︲__\` เควสประจำวันที่ ${thaiDate} 𓂃 \`__\n` +
                  `> (<a:7596clock:1160230591892029510>)⠀รีเซ็ตเควสในอีก: <t:${nextResetTs}:R>`
              }
            ],
            accessory: {
              style: 3,
              type: 2,
              flow: {
                actions: []
              },
              custom_id: CUSTOM_ID_PROGRESS,
              label: "ดูความคืบหน้าเควส"
            }
          },
          {
            type: 14,
            spacing: 1,
            divider: false
          },
          ...questComponents,
          {
            type: 9,
            components: [
              {
                type: 10,
                content: `# > รับข้อความพิเศษเมื่อทำเควสครบทั้งหมด ${POINT_ICON_STR} +${FULL_COMPLETION_BONUS_POINTS}`
              }
            ],
            accessory: {
              type: 11,
              media: {
                url: SPECIAL_REWARD_ICON_URL
              }
            }
          }
        ]
      }
    ]
  };
}

/**
 * สร้างการ์ดความคืบหน้าเควสส่วนบุคคล (Ephemeral V2)
 * @param {import('discord.js').User} user
 * @param {string} questDate
 * @param {Array} quests
 * @param {Map|object} userProgressMap
 * @param {number} nextResetTs
 * @returns {object}
 */
function buildDailyQuestProgressPayload(user, questDate, quests, userProgressMap, nextResetTs) {
  const thaiDate = formatThaiDate(questDate);
  const avatarUrl =
    user.displayAvatarURL({ extension: "png", size: 256, forceStatic: true }) ||
    user.defaultAvatarURL;

  let completedCount = 0;
  const questRows = [];

  for (let idx = 0; idx < quests.length; idx++) {
    const q = quests[idx];
    const progressItem = userProgressMap?.[q.id] || { current_progress: 0, is_completed: false };
    const current = progressItem.current_progress || 0;
    const target = q.target_count || 1;
    const isCompleted = Boolean(progressItem.is_completed || current >= target);

    if (isCompleted) {
      completedCount++;
    }

    const barStr = renderProgressBar(current, target);

    // กำหนด Accessory ด้านขวาของแถวเควส
    let accessoryComponent;
    if (isCompleted) {
      accessoryComponent = {
        style: 2,
        type: 2,
        flow: { actions: [] },
        custom_id: `daily_quest_done_${idx}`,
        disabled: true,
        emoji: CHECKMARK_EMOJI
      };
    } else if (current > 0) {
      let labelText = `${current}/${target}`;
      if (q.category === "voice") {
        const leftMins = Math.max(0, target - current);
        labelText = `ขาด ${leftMins} นาที`;
      }
      accessoryComponent = {
        style: 2,
        type: 2,
        flow: { actions: [] },
        custom_id: `daily_quest_status_${idx}`,
        disabled: true,
        label: labelText
      };
    } else {
      accessoryComponent = {
        style: 2,
        type: 2,
        flow: { actions: [] },
        custom_id: `daily_quest_none_${idx}`,
        disabled: true,
        label: "รอการทำเควส"
      };
    }

    questRows.push({
      type: 9,
      components: [
        {
          type: 10,
          content: `## ${q.title}\n- __\`ความคืบหน้า\`__ : ${barStr}\n- __\`รางวัล\`__ : ${POINT_ICON_STR} **+${q.reward_points}**`
        }
      ],
      accessory: accessoryComponent
    });

    questRows.push({
      type: 14,
      spacing: 2
    });
  }

  return {
    flags: 32768 | 64, // Ephemeral V2
    components: [
      {
        type: 17,
        components: [
          {
            type: 12,
            items: [
              {
                media: {
                  url: BANNER_IMAGE_URL
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
            type: 9,
            components: [
              {
                type: 10,
                content:
                  `## <:bee20000:1256669436350562355>︲__\` เควสประจำวันที่ ${thaiDate} 𓂃 \`__\n` +
                  `> (<a:7596clock:1160230591892029510>)⠀รีเซ็ตเควสในอีก: <t:${nextResetTs}:R>`
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
            spacing: 1,
            divider: false
          },
          ...questRows,
          {
            type: 9,
            components: [
              {
                type: 10,
                content: `# > รับข้อความพิเศษเมื่อทำเควสครบทั้งหมด ${POINT_ICON_STR} +${FULL_COMPLETION_BONUS_POINTS}`
              }
            ],
            accessory: {
              type: 11,
              media: {
                url: SPECIAL_REWARD_ICON_URL
              }
            }
          },
          {
            type: 1,
            components: [
              {
                style: 2,
                type: 2,
                flow: { actions: [] },
                custom_id: "daily_quest_total_progress",
                disabled: true,
                label: `${completedCount}/${quests.length}`
              }
            ]
          }
        ]
      }
    ]
  };
}

/**
 * สร้างการ์ดแจ้งเตือนเมื่อสมาชิกผ่านเควส (ส่งไปยังห้อง NOTIFY_CHANNEL_ID)
 * @param {import('discord.js').User} user
 * @param {object} quest
 * @param {number} remainingCount จำนวนเควสที่เหลือของวันนั้น
 * @returns {object}
 */
function buildQuestCompletedNotificationPayload(user, quest, remainingCount) {
  const avatarUrl =
    user.displayAvatarURL({ extension: "png", size: 256, forceStatic: true }) ||
    user.defaultAvatarURL;

  // ตัดสัญลักษณ์หน้าชื่อออกเพื่อให้ได้ชื่อเควสสั้น เช่น "Morning Bear"
  const cleanTitle = quest.title.replace(/^[^a-zA-Z0-9\u0E00-\u0E7F]+/g, "").trim();

  const remainingLabel =
    remainingCount > 0 ? `︲เหลืออีก ${remainingCount} เควส` : "︲ทำครบทุกเควสแล้ว 🎉";

  return {
    flags: 32768, // Component V2
    components: [
      {
        type: 17,
        components: [
          {
            type: 9,
            components: [
              {
                type: 10,
                content:
                  `## <:50121checkmark:1358584609087946867>︲__\` 𝖰𝗎𝖾𝗌𝗍 𝖼𝗈𝗆𝗉𝗅𝖾𝗍𝖾𝖽 ₊ ผ่านเควสเรียบร้อย 𓂃 \`__\n` +
                  `- <@${user.id}> ผ่านเควส **\`${cleanTitle}\`** ได้รับ ${POINT_ICON_STR} **+${quest.reward_points}**`
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
            spacing: 2
          },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: remainingLabel,
                url: `https://discord.com/channels/1144251788493602848/${ANNOUNCE_CHANNEL_ID}`,
                emoji: {
                  id: "1539658874418896946",
                  name: "kittywiggle",
                  animated: true
                }
              },
              {
                type: 2,
                style: 5,
                url: "https://discord.com/channels/1144251788493602848/1524123727724417276",
                label: "︲เช็กแต้มของคุณ",
                emoji: {
                  id: "1522154708200849449",
                  name: "bagpack_icon",
                  animated: false
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
 * สร้างการ์ดแจ้งเตือนพิเศษเมื่อทำครบทั้ง 3 เควสและได้รับโบนัส +50 แต้ม
 * @param {import('discord.js').User} user
 * @param {number} bonusPoints
 * @param {string} healingMessage ข้อความให้กำลังใจสุ่มจาก healing_messages
 * @returns {object}
 */
function buildAllQuestsBonusNotificationPayload(
  user,
  bonusPoints = FULL_COMPLETION_BONUS_POINTS,
  healingMessage = "วันนี้เก่งมากแล้ว พักผ่อนเยอะๆ นะคะ 🐻✨"
) {
  const avatarUrl =
    user.displayAvatarURL({ extension: "png", size: 256, forceStatic: true }) ||
    user.defaultAvatarURL;

  return {
    flags: 32768, // Component V2
    components: [
      {
        type: 17,
        components: [
          {
            type: 9,
            components: [
              {
                type: 10,
                content:
                  `## <a:tada_animated:1152137490992484373>︲__\` 𝖣𝖺𝗂𝗅𝗒 𝖬𝖺𝗌𝗍𝖾𝗋 ₊ พิชิตครบ 3 เควสประจำวัน! 𓂃 \`__\n` +
                  `- ขอแสดงความยินดีกับ <@${user.id}> ทำเควสประจำวันครบทั้ง 3 ข้อสำเร็จ ได้รับโบนัสพิเศษ ${POINT_ICON_STR} **+${bonusPoints}**\n` +
                  `### \`ถึงเธอ\` : ${healingMessage}`
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
            spacing: 2
          },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: "︲เช็กแต้มของคุณ",
                url: "https://discord.com/channels/1144251788493602848/1524123727724417276",
                emoji: {
                  id: "1522154708200849449",
                  name: "bagpack_icon",
                  animated: false
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
 * สร้างข้อความแจ้งเตือนสำหรับผู้ใช้ทั่วไปในช่วงทดสอบระบบ (Beta Test)
 * @returns {object}
 */
function buildBetaNoticePayload() {
  return {
    flags: 32768 | 64, // Ephemeral V2
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content:
              "## 🧪︲__` 𝖡𝖾𝗍𝖺 𝖳𝖾𝗌𝗍𝗂𝗇𝗀 ₊ ระบบเควสประจำวัน 𓂃 `__\n" +
              "ขณะนี้ระบบเควสประจำวันกำลังอยู่ในช่วงทดสอบประสิทธิภาพและความเสถียร (Beta Testing) โดยทีมงานค่ะ 🐻💖\n" +
              "ระบบจะเปิดให้สมาชิกทุกคนร่วมสนุกสะสมแต้มเร็ว ๆ นี้แน่นอนค่ะ ขอบคุณที่ให้ความสนใจนะคะ!"
          }
        ]
      }
    ]
  };
}

module.exports = {
  formatThaiDate,
  renderProgressBar,
  buildDailyQuestAnnouncementPayload,
  buildDailyQuestProgressPayload,
  buildQuestCompletedNotificationPayload,
  buildAllQuestsBonusNotificationPayload,
  buildBetaNoticePayload
};
