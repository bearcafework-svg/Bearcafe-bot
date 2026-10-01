// src/features/mainQuest/questPayloads.js
// ตัวสร้าง Discord Component V2 Payloads สำหรับระบบเควสใหญ่ (Main Community Quest)

const {
  FLAG_V2,
  DEFAULT_BANNER_URL,
  BEE_EMOJI,
  BEAR_ROLL_EMOJI,
  GIFT_EMOJI,
  STRAWBERRY_POINT_EMOJI,
  BAGPACK_ICON_EMOJI,
  DEFAULT_ROLE_REWARD_ID,
  DEFAULT_POINTS_REWARD,
  DEFAULT_CONGRATS_ROLE_ID,
  DEFAULT_TARGET_HOURS,
  PROGRESS_BAR_EMOJIS,
  CHECK_POINTS_URL
} = require("./questConstants");

/**
 * สร้างข้อความอีโมจิหลอดพลัง Progress Bar ความยาว 9 ชิ้นของ Bear Cafe
 * @param {number} current ปริมาณปัจจุบัน (นาที)
 * @param {number} target เป้าหมาย (นาที)
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
 * ฟอร์แมตจำนวนชั่วโมงให้แสดงผลสวยงาม
 * @param {number} minutes
 * @returns {string}
 */
function formatHours(minutes) {
  const hrs = minutes / 60;
  if (hrs < 1) {
    return `${Math.max(1, Math.round(minutes))} นาที`;
  }
  if (Number.isInteger(hrs)) {
    return `${hrs.toLocaleString()} ชั่วโมง`;
  }
  return `${hrs.toFixed(1)} ชั่วโมง`;
}

/**
 * 1. Component V2 การ์ดเควสใหญ่ระหว่างดำเนินภารกิจ (In-Progress Quest Card)
 * @param {Object} quest ข้อมูลเควสใหญ่
 * @param {Array} participants รายชื่อหมีที่ช่วยสะสมเวลาล่าสุด/อันดับต้นๆ
 */
function buildMainQuestInProgressPayload(quest = {}, participants = []) {
  const bannerUrl = quest.banner_url || DEFAULT_BANNER_URL;
  const targetHours = Number(quest.target_hours || DEFAULT_TARGET_HOURS);
  const targetMinutes = targetHours * 60;
  const currentMinutes = Number(quest.current_minutes || 0);
  const remainingHours = Math.max(0, targetHours - Math.floor(currentMinutes / 60));

  const roleRewardId = quest.reward_role_id || DEFAULT_ROLE_REWARD_ID;
  const pointsReward = Number(quest.reward_points || DEFAULT_POINTS_REWARD);

  const endTimestamp = quest.end_time
    ? Math.floor(new Date(quest.end_time).getTime() / 1000)
    : Math.floor((Date.now() + 7 * 24 * 60 * 60 * 1000) / 1000);

  const progressBar = renderProgressBar(currentMinutes, targetMinutes);

  // จัดการรายชื่อหมีล่าสุด 5 อันดับแรก
  let participantLines = [];
  if (participants && participants.length > 0) {
    participantLines = participants.slice(0, 5).map((p, idx) => {
      const hrsText = formatHours(p.total_minutes || 0);
      return `${idx + 1}. <@${p.user_id}> — มาช่วย +${hrsText}`;
    });
  }

  while (participantLines.length < 5) {
    const idx = participantLines.length + 1;
    participantLines.push(`${idx}. <@0> — มาช่วย +0 ชั่วโมง`);
  }

  const participantsContent = `รายชื่อหมีล่าสุด\n${participantLines.join("\n")}`;

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17, // Container
        components: [
          {
            type: 12, // Media Banner
            items: [
              {
                media: {
                  url: bannerUrl
                }
              }
            ]
          },
          {
            type: 14,
            spacing: 2
          },
          {
            type: 10, // Main Header & Progress Info
            content:
              `## ${BEE_EMOJI}︲__\` 𝖬𝖺𝗂𝗇 𝗊𝗎𝖾𝗌𝗍 ₊ เควสหมีช่วยหมีพลัส! 𓂃 \`__\n` +
              `# ${BEAR_ROLL_EMOJI} หมีทุกตัวต้องช่วยกันลงห้องให้ครบ __${targetHours.toLocaleString()} ชั่วโมง__ ขึ้นไป\n` +
              `### ${GIFT_EMOJI} : <@&${roleRewardId}> + ${STRAWBERRY_POINT_EMOJI} ${pointsReward.toLocaleString()} แต้ม\n` +
              `ความคืบหน้า: ${progressBar} ขาด ${remainingHours.toLocaleString()} ชั่วโมง\n` +
              `สิ้นสุดเควส: <t:${endTimestamp}:R>\n`
          },
          {
            type: 14,
            divider: false
          },
          {
            type: 10, // Recent / Top Bear Contributors
            content: participantsContent
          },
          {
            type: 14,
            spacing: 2
          },
          {
            type: 10, // Terms & Conditions
            content:
              `เงื่อนไขการรับรางวัล:\n` +
              `- ต้องสะสมเวลาในห้องพูดคุยรวม อย่างน้อย 1 ชั่วโมง จึงจะมีสิทธิ์รับรางวัล\n` +
              `- ระบบจะนับเฉพาะเวลาที่อยู่ในห้องตามเงื่อนไขของอีเวนท์\n` +
              `- เมื่อภารกิจสะสมครบ ${targetHours.toLocaleString()} ชั่วโมง ผู้ที่ผ่านเงื่อนไขจะสามารถรับรางวัลได้\n` +
              `- ผู้ที่ไม่ได้สะสมเวลาเลย จะ ไม่มีสิทธิ์รับรางวัล\n` +
              `- เวลาไม่จำเป็นต้องสะสมต่อเนื่อง สามารถเข้า–ออกห้องและสะสมให้ครบ 1 ชั่วโมงได้`
          }
        ]
      }
    ]
  };
}

/**
 * 2. Component V2 การ์ดเควสใหญ่เมื่อผ่านภารกิจสำเร็จ (Completed Quest Card)
 * @param {Object} quest ข้อมูลเควสใหญ่
 */
function buildMainQuestCompletedPayload(quest = {}) {
  const bannerUrl = quest.banner_url || DEFAULT_BANNER_URL;
  const targetHours = Number(quest.target_hours || DEFAULT_TARGET_HOURS);
  const roleRewardId = quest.reward_role_id || DEFAULT_ROLE_REWARD_ID;
  const pointsReward = Number(quest.reward_points || DEFAULT_POINTS_REWARD);
  const congratsRoleId = quest.congrats_role_id || DEFAULT_CONGRATS_ROLE_ID;

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17, // Container
        components: [
          {
            type: 12, // Media Banner
            items: [
              {
                media: {
                  url: bannerUrl
                }
              }
            ]
          },
          {
            type: 14,
            spacing: 2
          },
          {
            type: 10, // Main Header
            content:
              `## ${BEE_EMOJI}︲__\` 𝖬𝖺𝗂𝗇 𝗊𝗎𝖾𝗌𝗍 ₊ เควสหมีช่วยหมีพลัส! 𓂃 \`__\n` +
              `# ${BEAR_ROLL_EMOJI} หมีทุกตัวต้องช่วยกันลงห้องให้ครบ __${targetHours.toLocaleString()} ชั่วโมง__ ขึ้นไป\n` +
              `### ${GIFT_EMOJI} : <@&${roleRewardId}> + ${STRAWBERRY_POINT_EMOJI} ${pointsReward.toLocaleString()} แต้ม\n`
          },
          {
            type: 14,
            divider: false
          },
          {
            type: 9, // Section with congratulations message & Link button
            components: [
              {
                type: 10,
                content: `> **" <@&${congratsRoleId}> เควสผ่านเรียบร้อย ขอแสดงความยินดีด้วยนะคะ ทางเราทำการแอดของรางวัลให้ท่านเรียบร้อยค่ะ! "**`
              }
            ],
            accessory: {
              type: 2,
              style: 5, // Link Button
              label: "︲เช็กแต้มของคุณ",
              emoji: BAGPACK_ICON_EMOJI,
              url: CHECK_POINTS_URL
            }
          },
          {
            type: 14,
            spacing: 2
          },
          {
            type: 10, // Terms & Conditions
            content:
              `เงื่อนไขการรับรางวัล:\n` +
              `- ต้องสะสมเวลาในห้องพูดคุยรวม อย่างน้อย 1 ชั่วโมง จึงจะมีสิทธิ์รับรางวัล\n` +
              `- ระบบจะนับเฉพาะเวลาที่อยู่ในห้องตามเงื่อนไขของอีเวนท์\n` +
              `- เมื่อภารกิจสะสมครบ ${targetHours.toLocaleString()} ชั่วโมง ผู้ที่ผ่านเงื่อนไขจะสามารถรับรางวัลได้\n` +
              `- ผู้ที่ไม่ได้สะสมเวลาเลย จะ ไม่มีสิทธิ์รับรางวัล\n` +
              `- เวลาไม่จำเป็นต้องสะสมต่อเนื่อง สามารถเข้า–ออกห้องและสะสมให้ครบ 1 ชั่วโมงได้`
          }
        ]
      }
    ]
  };
}

module.exports = {
  renderProgressBar,
  formatHours,
  buildMainQuestInProgressPayload,
  buildMainQuestCompletedPayload
};
