// src/features/dailyQuest/payloadBuilder.js — สร้าง Component V2 Payload สำหรับ Daily Quest
const FLAG_V2 = 32768; // MessageFlags.IsComponentsV2

// Icon mapping per category
const CATEGORY_ICONS = {
  CHAT: "💬",
  VOICE: "🎙️",
  MINIGAME: "🎮",
  FEATURE: "🌱",
  SOCIAL: "🤝"
};

/**
 * คำนวณเวลาคงเหลือก่อนถึงเที่ยงคืน (00:00 น. นครกรุงเทพ GMT+7)
 */
function getRemainingTimeString() {
  const now = new Date();
  // แปลงเวลาเป็น UTC+7 (Bangkok)
  const bangkokTime = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Bangkok" }));
  const midnight = new Date(bangkokTime);
  midnight.setHours(24, 0, 0, 0); // 00:00:00 ของวันถัดไป

  const diffMs = midnight.getTime() - bangkokTime.getTime();
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffMinutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));

  const padH = String(diffHours).padStart(2, "0");
  const padM = String(diffMinutes).padStart(2, "0");
  return `${padH} ชั่วโมง ${padM} นาที`;
}

/**
 * สร้าง Component V2 Payload สำหรับผู้ใช้
 * @param {string} userId - Discord User ID
 * @param {Array} userQuests - รายการภารกิจ 5 ข้อของผู้ใช้
 * @param {Object} summary - ข้อมูลสรุปภาพรวมรายวัน ({ completed_count, is_jackpot_claimed, reroll_used })
 */
function buildDailyQuestPayload(userId, userQuests, summary = {}) {
  const remainingTimeStr = getRemainingTimeString();
  const completedCount = summary.completed_count || userQuests.filter(q => q.is_completed).length;
  const maxReroll = 1; // สิทธิ์เปลี่ยนภารกิจ 1 ครั้ง/วัน สำหรับทั่วไป
  const rerollUsed = summary.reroll_used || 0;
  const rerollRemaining = Math.max(0, maxReroll - rerollUsed);

  // เช็คว่ามีภารกิจที่ทำสำเร็จแต่ยังไม่ได้กดรับหรือไม่
  const hasUnclaimed = userQuests.some(q => q.is_completed && !q.is_claimed);

  const innerComponents = [];

  // 1. Header (Type 9 Container)
  innerComponents.push({
    type: 9,
    components: [
      {
        type: 10,
        content:
          `## <a:jumpingstar:1538597613547560960>︲__\` 𝖣𝖺𝗂𝗅𝗒 𝖬𝗂𝗌𝗌𝗂𝗈𝗇𝗌 ₊ ภารกิจคาเฟ่ประจำวัน 𓂃 \`__\n` +
          `> (<:bee20000:1256669436350562355>)⠀<@${userId}>\n` +
          `> (<a:7596clock:1160230591892029510>)⠀รีเซ็ตภารกิจในอีก: ${remainingTimeStr}`
      }
    ],
    accessory: {
      type: 11,
      media: {
        url: "https://cdn.discordapp.com/attachments/1524704267015819274/1534568886135947415/IMG_25680923184720328.png?ex=6a83c365&is=6a8271e5&hm=470b4dae32839696a4d4d1cdd6f9d42df34759969a8942f40ba7d6eabebec5f8&"
      }
    }
  });

  innerComponents.push({ type: 14, spacing: 2 });

  // 2. Mission Rows (5 Quests)
  userQuests.forEach((quest, index) => {
    const icon = CATEGORY_ICONS[quest.category] || "📌";
    const current = quest.current_progress || 0;
    const target = quest.target_count || 1;
    const unit = quest.unit || "ครั้ง";
    const reward = quest.reward_points || 15;
    const isCompleted = quest.is_completed || false;
    const isClaimed = quest.is_claimed || false;

    const contentText =
      `### ${icon}︰__\`${quest.title}\`__ — ${current}/${target} ${unit} (<:strawberryv2:1520439075100688614> +${reward} แต้ม)\n` +
      `-# - วิธีทำภารกิจ: ${quest.description}`;

    // Accessory Button per quest state
    let accessory;
    if (isClaimed) {
      accessory = {
        style: 3, // Success / Green
        type: 2,
        emoji: {
          id: "1358584609087946867",
          name: "50121checkmark",
          animated: false
        },
        custom_id: `dq_claimed_${quest.quest_id}`,
        disabled: true,
        flow: { actions: [] }
      };
    } else if (isCompleted) {
      accessory = {
        style: 1, // Blurple
        type: 2,
        label: "︲กดรับสิ!",
        emoji: {
          id: "1276130500410605609",
          name: "68492gift",
          animated: false
        },
        custom_id: `dq_claim_${quest.quest_id}`
      };
    } else if (current > 0) {
      const remainingNeeded = Math.max(1, target - current);
      accessory = {
        style: 1,
        type: 2,
        label: `ขาดอีก ${remainingNeeded} ${unit}`,
        custom_id: `dq_prog_${quest.quest_id}`,
        disabled: true,
        flow: { actions: [] }
      };
    } else {
      accessory = {
        style: 1,
        type: 2,
        label: "ยังไม่ได้ทำ",
        custom_id: `dq_not_started_${quest.quest_id}`,
        disabled: true,
        flow: { actions: [] }
      };
    }

    innerComponents.push({
      type: 9,
      components: [
        {
          type: 10,
          content: contentText
        }
      ],
      accessory: accessory
    });

    if (index < userQuests.length - 1) {
      innerComponents.push({ type: 14, divider: false });
    }
  });

  innerComponents.push({ type: 14, spacing: 2 });

  // 3. Summary Section (Type 10 Text)
  innerComponents.push({
    type: 10,
    content:
      `🏆︰ความคืบหน้ารวม: **\` ${completedCount}/5 ภารกิจ \`**\n` +
      `<:22594lootbox:1538601553542512701>︰รางวัลพิชิตครบประจำวัน: กล่องสุ่มสมบัติหมีน้อย (+100 แต้ม)\n`
  });

  innerComponents.push({ type: 14, divider: false });

  // 4. Action Row (Type 1 ActionRow with Buttons)
  innerComponents.push({
    type: 1,
    components: [
      {
        style: 1, // Blurple
        type: 2,
        label: "︲รับรางวัลทั้งหมด",
        emoji: {
          id: "1276130500410605609",
          name: "68492gift",
          animated: false
        },
        custom_id: "dq_claim_all",
        disabled: !hasUnclaimed,
        flow: { actions: [] }
      },
      {
        style: 2, // Secondary / Grey
        type: 2,
        label: `︲เปลี่ยนภารกิจ (${rerollRemaining} ครั้ง)`,
        emoji: {
          id: "1510390943172399195",
          name: "516185loading",
          animated: true
        },
        custom_id: "dq_reroll_menu",
        disabled: rerollRemaining <= 0,
        flow: { actions: [] }
      }
    ]
  });

  // Complete Component V2 Container Payload
  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: innerComponents
      }
    ]
  };
}

module.exports = {
  buildDailyQuestPayload,
  getRemainingTimeString
};
