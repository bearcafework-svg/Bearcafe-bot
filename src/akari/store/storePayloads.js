// ===================================================
// src/akari/store/storePayloads.js
// ตัวสร้างโครงสร้างข้อความและ UI Component V2 สำหรับระบบร้านค้า Akari Bot
// สอดคล้องตามมาตรฐาน Component V2 (flags: 32768, Container type 17) 100%
// ===================================================

const { MessageFlags } = require("discord.js");

const FLAG_V2 = MessageFlags.IsComponentsV2 || 32768;

const STRAWBERRY_EMOJI = "<:strawberryv2:1520439075100688614>";
const WARNING_EMOJI = "<:lowwarning:1548772721679278180>";
const GIFT_EMOJI = "<:68492gift:1276130500410605609>";

const DEFAULT_ACCESSORY = {
  type: 2,
  style: 5,
  label: "Bear Cafe",
  emoji: {
    id: "1520439075100688614",
    name: "strawberryv2",
    animated: false,
  },
  url: "https://discord.com",
};

/**
 * สร้างการ์ดแจ้งเตือนสำหรับเซิร์ฟเวอร์ที่ยังไม่ได้เป็น Premium
 */
function buildPremiumStoreWarningPayload() {
  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `## ${WARNING_EMOJI}︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ ฟีเจอร์นี้สำหรับเซิร์ฟเวอร์ Premium 𓂃 \`__\n` +
              `> ระบบร้านค้าแลกของรางวัล (**Akari Store**) สงวนสิทธิ์เฉพาะเซิร์ฟเวอร์ระดับ **Premium** เท่านั้นนะคะ!\n\n` +
              `✨ **สิทธิประโยชน์ระดับ Premium:**\n` +
              `- 🛍️ เปิดระบบร้านค้าแลกของรางวัลมินิเกมได้สูงสุด 3 ไอเทม\n` +
              `- 👑 แจกยศ Discord หรือของรางวัลจริงให้อัตโนมัติ\n` +
              `- 🎮 เล่นมินิเกมได้ครบทั้ง 13 เกมแบบไม่จำกัดโควตา\n` +
              `- 🎨 ปรับแต่งสีและสไตล์การ์ดเกมได้อย่างอิสระ`,
          },
        ],
      },
    ],
  };
}

/**
 * สร้างแดชบอร์ดตั้งค่าร้านค้าสำหรับ Admin (/setting-store)
 */
function buildStoreSettingsDashboard(guild, storeConfig, items) {
  const logChannelText = storeConfig.log_channel_id
    ? `<#${storeConfig.log_channel_id}>`
    : "*(ยังไม่ได้ตั้งค่า — บอทจะไม่ส่งใบเสร็จแจ้งเตือน)*";

  let itemsSummary = "";
  items.forEach((item) => {
    const isConfigured = Boolean(item.is_configured && item.name && item.name.trim() !== "");

    if (!isConfigured) {
      itemsSummary += `### ⚪︲__\` ช่องที่ ${item.slot}: (ว่าง — ยังไม่ได้ตั้งค่า) 𓂃 \`__\n` +
        `> 📌 **สถานะ:** ⚪ ปิดอยู่ (ยังไม่มีข้อมูลของรางวัล)\n` +
        `> 💡 *กดปุ่ม \`✏️ ตั้งค่าไอเทม ${item.slot}\` ด้านล่างเพื่อเริ่มสร้างของรางวัลช่องนี้*\n\n`;
    } else {
      const statusIcon = item.is_active ? "🟢 เปิดใช้งาน" : "⚪ ปิดอยู่";
      const rewardDetail = item.reward_type === "role"
        ? (item.role_id ? `ยศ <@&${item.role_id}>` : "ยศ *(ยังไม่ระบุ)*")
        : "ของรางวัลจริง / สิทธิ์พิเศษ";
      const limitDetail = item.limit_type === "once_per_user" ? "จำกัด 1 ครั้ง/คน" : "แลกได้ไม่จำกัด";
      const winsDetail = item.wins_required > 0 ? ` | ชนะขั้นต่ำ: ${item.wins_required.toLocaleString()} ครั้ง` : "";

      itemsSummary += `### ${item.emoji || "🎁"}︲__\` ช่องที่ ${item.slot}: ${item.name} 𓂃 \`__\n` +
        `> 📌 **สถานะ:** ${statusIcon}\n` +
        `> 💰 **ราคา:** **${item.points_cost.toLocaleString()}** แต้ม${winsDetail}\n` +
        `> 🎁 **ของรางวัล:** ${rewardDetail} (${limitDetail})\n` +
        `> 📝 **คำอธิบาย:** ${item.description || "ไม่มีคำอธิบาย"}\n\n`;
    }
  });

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `## ${STRAWBERRY_EMOJI}︲__\` 𝖲𝗍𝗈𝗋𝖾 𝗌𝖾𝗍𝗍𝗂𝗇𝗀 ₊ จัดการร้านค้าแลกของรางวัล 𓂃 \`__\n` +
              `> ตั้งค่าของรางวัลที่ผู้เล่นสามารถนำแต้มสะสมจากการเล่นมินิเกมมาแลกรับได้ (สูงสุด 3 รายการ)\n\n` +
              itemsSummary +
              `-# 📢 **ห้องส่งประวัติการแลก (Log Channel):** ${logChannelText}\n` +
              `-# 💡 เมื่อตั้งค่าครบแล้ว พิมพ์คำสั่ง \`/open-store\` ในห้องที่ต้องการเพื่อเปิดหน้าร้านได้ทันทีค่ะ`,
          },
          {
            type: 14, // Separator
          },
          {
            type: 1, // ActionRow แถวที่ 1: ปุ่มแก้ไข Slot 1-3
            components: [
              {
                type: 2,
                style: 2, // Secondary
                label: "✏️ ตั้งค่าไอเทม 1",
                custom_id: "akari_store_edit_modal_1",
              },
              {
                type: 2,
                style: 2,
                label: "✏️ ตั้งค่าไอเทม 2",
                custom_id: "akari_store_edit_modal_2",
              },
              {
                type: 2,
                style: 2,
                label: "✏️ ตั้งค่าไอเทม 3",
                custom_id: "akari_store_edit_modal_3",
              },
            ],
          },
          {
            type: 1, // ActionRow แถวที่ 2: สลับเปิด/ปิด
            components: [1, 2, 3].map((s) => {
              const item = items.find((i) => i.slot === s);
              const isConfigured = Boolean(item?.is_configured && item?.name && item?.name.trim() !== "");
              if (!isConfigured) {
                return {
                  type: 2,
                  style: 2, // Secondary
                  label: `⚪ ช่อง ${s} (ยังไม่ตั้งค่า)`,
                  custom_id: `akari_store_toggle_${s}`,
                  disabled: true,
                };
              }
              return {
                type: 2,
                style: item.is_active ? 4 : 3, // Danger (ปิด) or Success (เปิด)
                label: `${item.is_active ? "🔴 ปิด" : "🟢 เปิด"} ไอเทม ${s}`,
                custom_id: `akari_store_toggle_${s}`,
              };
            }),
          },
          {
            type: 1, // ActionRow แถวที่ 3: จัดการยศ และ ห้อง Log
            components: [
              {
                type: 2,
                style: 1, // Primary (Blurple)
                label: "🎭 ผูกยศ Discord",
                custom_id: "akari_store_role_select_btn",
              },
              {
                type: 2,
                style: 2, // Secondary
                label: "🔔 เลือกห้องแจ้งเตือน Log",
                custom_id: "akari_store_channel_select_btn",
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * สร้างการ์ดหน้าร้านค้าสาธารณะ (/open-store) สำหรับส่งลงห้อง
 */
function buildPublicStoreCard(guild, storeConfig, items) {
  const activeItems = items.filter((item) => item.is_active);

  let itemsBody = "";
  if (activeItems.length === 0) {
    itemsBody = `> *ขณะนี้ยังไม่มีของรางวัลเปิดให้แลก กรุณารอทีมงานเปิดร้านค้านะคะ ✨*`;
  } else {
    activeItems.forEach((item) => {
      const rewardDetail = item.reward_type === "role" && item.role_id
        ? `บทบาท <@&${item.role_id}>`
        : "ของรางวัลจริง / สิทธิ์พิเศษ";
      const limitText = item.limit_type === "once_per_user" ? "*(จำกัด 1 ครั้งต่อผู้เล่น)*" : "";
      const winsReq = item.wins_required > 0 ? `\n> 🏆 **จำนวนครั้งที่ชนะขั้นต่ำ:** ${item.wins_required.toLocaleString()} ครั้ง` : "";

      itemsBody += `### ${item.emoji}︲__\` ${item.name} 𓂃 \`__\n` +
        `> 💰 **แต้มที่ต้องใช้:** **${item.points_cost.toLocaleString()}** แต้ม${winsReq}\n` +
        `> 🎁 **ของรางวัลที่จะได้รับ:** ${rewardDetail} ${limitText}\n` +
        `> 📝 *${item.description || "สะสมแต้มเพื่อแลกรับรางวัล"}*\n\n`;
    });
  }

  // สร้างปุ่มแลกของรางวัลตามจำนวนไอเทมที่เปิดใช้งาน
  const buttonComponents = [];
  items.forEach((item) => {
    if (item.is_active) {
      buttonComponents.push({
        type: 2,
        style: 1, // Primary
        label: `แลก ${item.name} (${item.points_cost.toLocaleString()} แต้ม)`,
        custom_id: `akari_store_redeem_btn_${item.slot}`,
        emoji: {
          name: item.emoji || "🎁",
        },
      });
    }
  });

  const containerComponents = [
    {
      type: 10,
      content: `## ${GIFT_EMOJI}︲__\` 𝖲𝗍𝗈𝗋𝖾 ₊ ร้านค้าแลกของรางวัลมินิเกม 𓂃 \`__\n` +
        `> ยินดีต้อนรับสู่ร้านค้าแลกของรางวัล! ร่วมสนุกเล่นมินิเกมสะสมแต้ม แล้วกดปุ่มด้านล่างเพื่อแลกรับของรางวัลได้ทันทีค่ะ 🛍️✨\n\n` +
        itemsBody +
        `-# 💡 แต้มจะถูกหักทันทีหลังกดยืนยัน และของรางวัลจะถูกส่งมอบให้โดยอัตโนมัติค่ะ`,
    },
  ];

  if (buttonComponents.length > 0) {
    containerComponents.push({
      type: 14, // Separator
    });
    // ActionRow แยกไม่เกิน 3 ปุ่มต่อแถว
    containerComponents.push({
      type: 1,
      components: buttonComponents,
    });
  }

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: containerComponents,
      },
    ],
  };
}

/**
 * สร้างการ์ด Ephemeral ยืนยันการแลกของรางวัล
 */
function buildRedeemConfirmCard(guild, user, item, userScore) {
  const diff = userScore.points - item.points_cost;
  const rewardDetail = item.reward_type === "role" && item.role_id
    ? `ยศ Discord <@&${item.role_id}>`
    : "ของรางวัลจริง / สิทธิ์พิเศษ";

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `## ${GIFT_EMOJI}︲__\` 𝖱𝖾𝖽𝖾𝖾𝗆 ₊ ยืนยันการแลกของรางวัล 𓂃 \`__\n` +
              `> คุณกำลังจะแลกรับ: **${item.emoji} ${item.name}**\n\n` +
              `💰 **ค่าใช้จ่าย:** **${item.points_cost.toLocaleString()}** แต้ม\n` +
              `📊 **แต้มสะสมปัจจุบัน:** ${userScore.points.toLocaleString()} แต้ม\n` +
              `✨ **แต้มคงเหลือหลังแลก:** **${diff.toLocaleString()}** แต้ม\n` +
              `🎁 **ของรางวัล:** ${rewardDetail}\n\n` +
              `-# หากแน่ใจแล้ว โปรดกดปุ่มยืนยันด้านล่างเพื่อดำเนินการทันทีค่ะ`,
          },
          {
            type: 14,
          },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 3, // Success (Green)
                label: "✅ ยืนยันการแลก",
                custom_id: `akari_store_confirm_${item.slot}`,
              },
              {
                type: 2,
                style: 2, // Secondary
                label: "❌ ยกเลิก",
                custom_id: "akari_store_cancel",
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * สร้างการ์ดแจ้งผลการแลกสำเร็จ (Ephemeral)
 */
function buildRedeemSuccessCard(item, newPoints, roleAdded, roleError) {
  let extraNote = "";
  if (item.reward_type === "role") {
    if (roleAdded) {
      extraNote = `\n> 👑 **ระบบได้มอบยศ <@&${item.role_id}> ให้คุณเรียบร้อยแล้วค่ะ!**`;
    } else if (roleError) {
      extraNote = `\n> ⚠️ **หมายเหตุยศ:** ${roleError} (ระบบได้แจ้งเตือนทีมงานให้ตรวจสอบแล้วค่ะ)`;
    }
  } else {
    extraNote = `\n> 📩 **ระบบได้ส่งใบเสร็จไปยังทีมงานเรียบร้อยแล้ว โปรดรอการติดต่อมอบของรางวัลนะคะ!**`;
  }

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `## ${STRAWBERRY_EMOJI}︲__\` 𝖲𝗎𝖼𝖼𝖾𝗌𝗌 ₊ แลกของรางวัลสำเร็จแล้ว 𓂃 \`__\n` +
              `> 🎉 ยินดีด้วยค่ะ! คุณได้แลกรับ **${item.emoji} ${item.name}** สำเร็จแล้ว` +
              extraNote + `\n\n` +
              `💰 **แต้มคงเหลือปัจจุบัน:** **${newPoints.toLocaleString()}** แต้ม\n` +
              `-# ขอบคุณที่ร่วมสนุกกับมินิเกม Akari Bot นะคะ ʕ •ᴥ• ʔ ♡`,
          },
        ],
      },
    ],
  };
}

/**
 * สร้างใบเสร็จส่งเข้าห้อง Log Channel ของทีมงาน
 */
function buildRedemptionReceiptLog(guild, user, item, oldPoints, newPoints, roleAdded, roleError) {
  const roleText = item.role_id ? `<@&${item.role_id}>` : "ไม่ใช่รางวัลประเภทยศ";
  const roleStatus = roleAdded ? "✅ มอบยศอัตโนมัติสำเร็จ" : (roleError ? `❌ ขัดข้อง (${roleError})` : "➖");

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `## 🧾︲__\` 𝖲𝗍𝗈𝗋𝖾 𝗅𝗈𝗀 ₊ มีผู้เล่นแลกของรางวัลใหม่ 𓂃 \`__\n` +
              `> 👤 **ผู้เล่น:** <@${user.id}> (\`${user.tag || user.username}\`)\n` +
              `> 🎁 **ของรางวัล:** **${item.emoji} ${item.name}** (ช่องที่ ${item.slot})\n` +
              `> 💰 **แต้มที่ใช้แลก:** **${item.points_cost.toLocaleString()}** แต้ม\n` +
              `> 📊 **ประวัติแต้ม:** ${oldPoints.toLocaleString()} ➔ **${newPoints.toLocaleString()}** แต้ม\n` +
              `> 👑 **บทบาท Discord:** ${roleText} (${roleStatus})\n` +
              `> 🕒 **เวลา:** <t:${Math.floor(Date.now() / 1000)}:F> (<t:${Math.floor(Date.now() / 1000)}:R>)\n\n` +
              `-# รายการนี้บันทึกอัตโนมัติโดยระบบร้านค้า Akari Bot`,
          },
        ],
      },
    ],
  };
}

module.exports = {
  buildPremiumStoreWarningPayload,
  buildStoreSettingsDashboard,
  buildPublicStoreCard,
  buildRedeemConfirmCard,
  buildRedeemSuccessCard,
  buildRedemptionReceiptLog,
};
