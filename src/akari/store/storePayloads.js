// ===================================================
// src/akari/store/storePayloads.js
// ตัวสร้างโครงสร้างข้อความและ UI Component V2 สำหรับระบบร้านค้า Akari Bot
// สอดคล้องตามมาตรฐาน Component V2 (flags: 32768, Container type 17) 100%
// ===================================================

const { MessageFlags } = require("discord.js");

const FLAG_V2 = MessageFlags.IsComponentsV2 || 32768;

const STRAWBERRY_EMOJI = "<:strawberryv2:1548976664090779650>";
const WARNING_EMOJI = "<:lowwarning:1548772721679278180>";
const GIFT_EMOJI = "<:68492gift:1276130500410605609>";

const SLOT_EMOJIS = {
  1: { id: "1548948434982141993", name: "minecraft1yellow" },
  2: { id: "1548948476182798416", name: "minecraft2yellow" },
  3: { id: "1548948499846926346", name: "minecraft3yellow" },
};

const STATUS_EMOJIS = {
  bad: "<:conektionbad:1548760143192260689>",
  good: "<:goodconektion:1548760301762121801>",
  okay: "<:conektionokay:1548760281675599964>",
};

const DEFAULT_ACCESSORY = {
  type: 2,
  style: 5,
  label: "Bear Cafe",
  emoji: {
    id: "1548976664090779650",
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
              `- 🎨 ปรับแต่งสีและสไตล์การ์ดเกมได้อย่างอิสระ\n\n` +
              `-# สนใจอัปเกรด ติดต่อสอบถามทีมงานได้ตลอด 24 ชม. ค่ะ <:cuteplant:1152834055528783872>`,
          },
        ],
      },
    ],
  };
}

/**
 * สร้างแดชบอร์ดตั้งค่าร้านค้าสำหรับ Admin (/setting-store) ตามดีไซน์ใหม่ล่าสุด
 */
function buildStoreSettingsDashboard(guild, storeConfig, items) {
  const logChannelText = storeConfig?.log_channel_id
    ? `<#${storeConfig.log_channel_id}>`
    : "*(ยังไม่ได้ตั้งค่า)*";

  const guildIcon = typeof guild?.iconURL === "function"
    ? (guild.iconURL({ size: 256 }) || "https://cdn.discordapp.com/embed/avatars/0.png")
    : (guild?.iconURL || "https://cdn.discordapp.com/embed/avatars/0.png");

  const containerComponents = [
    {
      type: 9, // Section with Profile Guild Server accessory
      components: [
        {
          type: 10,
          content: `## <a:643900sevlev:1548947725133942824>︲__\` 𝖲𝗍𝗈𝗋𝖾 𝗌𝖾𝗍𝗍𝗂𝗇𝗀 ₊ จัดการร้านค้าแลกของรางวัล 𓂃 \`__\n` +
            `> ตั้งค่าของรางวัลที่ผู้เล่นสามารถนำแต้มสะสมจากการเล่นมินิเกมมาแลกรับได้ (สูงสุด 3 รายการ)\n\n` +
            `-# **ห้องส่งประวัติการแลก (Log Channel):** ${logChannelText}\n` +
            `-# 💡 เมื่อตั้งค่าครบแล้ว พิมพ์คำสั่ง \`/open-store\` ในห้องที่ต้องการเพื่อเปิดหน้าร้านได้ทันทีค่ะ\n `,
        },
      ],
      accessory: {
        type: 11,
        media: {
          url: guildIcon,
        },
      },
    },
  ];

  const currEmoji = storeConfig?.currency_emoji || "<:strawberryv2:1548976664090779650>";

  // วนลูปสร้างรายละเอียดไอเทม Slot 1, 2, 3 แต่ละช่องเป็น Section (Type 9) พร้อมปุ่ม 📝 (Accessory Type 2)
  [1, 2, 3].forEach((s) => {
    const item = items.find((i) => i.slot === s);
    const isConfigured = Boolean(item?.is_configured && item?.name && item?.name.trim() !== "");
    const slotEmoji = `<:${SLOT_EMOJIS[s].name}:${SLOT_EMOJIS[s].id}>`;

    containerComponents.push({
      type: 14,
      spacing: 2,
      divider: true,
    });

    let itemContent = "";
    if (!isConfigured) {
      itemContent = `### ${slotEmoji}︲__\` ว่าง — ยังไม่ได้ตั้งค่า \`__\n` +
        `> ${STATUS_EMOJIS.bad}⠀**สถานะ:** ยังไม่มีข้อมูลของรางวัล\n` +
        `> 💡 *กดเลือกเมนูด้านล่างเพื่อเริ่มสร้างของรางวัลช่องนี้*`;
    } else {
      const statusText = item.is_active
        ? `${STATUS_EMOJIS.good}⠀**สถานะ:** เปิดใช้งาน`
        : `${STATUS_EMOJIS.okay}⠀**สถานะ:** ปิดใช้งาน`;
      const rewardText = item.reward_type === "role"
        ? (item.role_id ? `ยศ <@&${item.role_id}>` : "ยศ *(ยังไม่ระบุ)*")
        : "ของรางวัลจริง / สิทธิ์พิเศษ";
      const limitText = item.reward_type === "role"
        ? "(ตรวจยศซ้ำอัตโนมัติ)"
        : (item.limit_type === "once_per_user" ? "(จำกัด 1 ครั้ง/คน)" : "(แลกได้ไม่จำกัด)");
      const winsLine = item.wins_required > 0 ? `\n> 🎯⠀**ชนะขั้นต่ำ:** ${item.wins_required.toLocaleString()} ครั้ง` : "";

      let stockText = "ไม่จำกัด";
      if (typeof item.stock === "number") {
        if (item.stock === 0) stockText = "❌ สินค้าหมด (0 ชิ้น)";
        else if (item.stock > 0) stockText = `${item.stock.toLocaleString()} ชิ้น`;
      }

      itemContent = `### ${slotEmoji}︲__\` ${item.name} \`__\n` +
        `> ${statusText}\n` +
        `> ${currEmoji}⠀**ราคา:** ${item.points_cost.toLocaleString()} แต้ม${winsLine}\n` +
        `> 🎁⠀**ของรางวัล:** ${rewardText} ${limitText}\n` +
        `> 📦⠀**สต็อกคงเหลือ:** ${stockText}\n` +
        `> 📝⠀**คำอธิบาย:** ${item.description || "ไม่พบคำอธิบาย"}`;
    }

    containerComponents.push({
      type: 9, // Section with Button Accessory
      components: [
        {
          type: 10,
          content: itemContent,
        },
      ],
      accessory: {
        type: 2, // Button
        style: 2, // Secondary
        custom_id: `akari_store_edit_modal_${s}`,
        emoji: {
          name: "📝",
        },
      },
    });
  });

  // ตัวคั่นก่อนเข้าสู่เมนูควบคุม
  containerComponents.push({
    type: 14,
    spacing: 2,
    divider: true,
  });

  // ActionRow 1: Select Menu สำหรับสลับสถานะเปิด / ปิด การใช้งาน
  const toggleOptions = [1, 2, 3].map((s) => {
    const item = items.find((i) => i.slot === s);
    const isConfigured = Boolean(item?.is_configured && item?.name && item?.name.trim() !== "");
    if (!isConfigured) {
      return {
        label: `รางวัล ${s}: (ยังไม่ได้ตั้งค่า)`,
        value: String(s),
        description: "ยังไม่มีข้อมูลของรางวัล ไม่สามารถเปิดใช้งานได้",
        emoji: { id: "1548760143192260689", name: "conektionbad" },
      };
    }
    return {
      label: `รางวัล ${s}: ${item.name} (${item.is_active ? "เปิดอยู่" : "ปิดอยู่"})`,
      value: String(s),
      description: item.is_active ? "คลิกเพื่อสลับเป็น ปิดใช้งาน" : "คลิกเพื่อสลับเป็น เปิดใช้งาน",
      emoji: item.is_active
        ? { id: "1548760301762121801", name: "goodconektion" }
        : { id: "1548760281675599964", name: "conektionokay" },
    };
  });

  containerComponents.push({
    type: 1, // ActionRow 1
    components: [
      {
        type: 3, // StringSelectMenu
        custom_id: "akari_store_toggle_select",
        placeholder: "⚡︲สลับสถานะเปิด / ปิด การใช้งานของรางวัล...",
        options: toggleOptions,
      },
    ],
  });

  // ตัวคั่นก่อนปุ่ม Row 2
  containerComponents.push({
    type: 14,
    divider: false,
  });

  // ActionRow 2: ปุ่มกดสำหรับผูกยศ, จำกัด 1 ครั้ง/คน, และ เลือกห้อง Log
  containerComponents.push({
    type: 1, // ActionRow 2
    components: [
      {
        type: 2,
        style: 1, // Primary (Blurple)
        label: "︲ผูกยศ Discord",
        custom_id: "akari_store_role_select_btn",
        emoji: {
          name: "🎖️",
        },
      },
      {
        type: 2,
        style: 2, // Secondary (Grey)
        label: "︲จำกัด 1 ครั้ง/คน",
        custom_id: "akari_store_limit_select_btn",
        emoji: {
          name: "🔒",
        },
      },
      {
        type: 2,
        style: 2, // Secondary (Grey)
        label: "︲เลือกห้องแจ้งเตือน Log",
        custom_id: "akari_store_channel_select_btn",
        emoji: {
          name: "🔔",
        },
      },
    ],
  });

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
 * สร้างการ์ดหน้าร้านค้าสาธารณะ (/open-store) สำหรับส่งลงห้อง
 */
function buildPublicStoreCard(guild, storeConfig, items) {
  const activeItems = items.filter((item) => item.is_active);
  const currEmoji = storeConfig?.currency_emoji || "<:strawberryv2:1548976664090779650>";

  let itemsBody = "";
  if (activeItems.length === 0) {
    itemsBody = `> *ขณะนี้ยังไม่มีของรางวัลเปิดให้แลก กรุณารอทีมงานเปิดร้านค้านะคะ ✨*`;
  } else {
    activeItems.forEach((item) => {
      const rewardDetail = item.reward_type === "role" && item.role_id
        ? `บทบาท <@&${item.role_id}>`
        : "ของรางวัลจริง / สิทธิ์พิเศษ";
      const limitText = item.reward_type === "role"
        ? "*(ตรวจยศซ้ำอัตโนมัติ)*"
        : (item.limit_type === "once_per_user" ? "*(จำกัด 1 ครั้งต่อผู้เล่น)*" : "");
      const winsReq = item.wins_required > 0 ? `\n> 🏆 **จำนวนครั้งที่ชนะขั้นต่ำ:** ${item.wins_required.toLocaleString()} ครั้ง` : "";

      let stockLine = "";
      if (typeof item.stock === "number") {
        if (item.stock === 0) {
          stockLine = `\n> 📦 **สถานะ:** ❌ **สินค้าหมดสต็อก (Out of Stock)**`;
        } else if (item.stock > 0) {
          stockLine = `\n> 📦 **สต็อกคงเหลือ:** เหลืออีก **${item.stock.toLocaleString()}** ชิ้น`;
        }
      }

      itemsBody += `### ${item.emoji}︲__\` ${item.name} 𓂃 \`__\n` +
        `> ${currEmoji} **แต้มที่ต้องใช้:** **${item.points_cost.toLocaleString()}** แต้ม${winsReq}\n` +
        `> 🎁 **ของรางวัลที่จะได้รับ:** ${rewardDetail} ${limitText}${stockLine}\n` +
        `> 📝 *${item.description || "สะสมแต้มเพื่อแลกรับรางวัล"}*\n\n`;
    });
  }

  // สร้างปุ่มแลกของรางวัลตามจำนวนไอเทมที่เปิดใช้งาน
  const buttonComponents = [];
  items.forEach((item) => {
    if (item.is_active) {
      const isOutOfStock = typeof item.stock === "number" && item.stock === 0;
      buttonComponents.push({
        type: 2,
        style: isOutOfStock ? 2 : 1, // Secondary if out of stock, Primary if available
        label: isOutOfStock
          ? `สินค้าหมด (${item.name})`
          : `แลก ${item.name} (${item.points_cost.toLocaleString()} แต้ม)`,
        custom_id: `akari_store_redeem_btn_${item.slot}`,
        disabled: isOutOfStock,
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
              `> 📦 **สต็อกคงเหลือ:** ${typeof item.stock === "number" && item.stock >= 0 ? `${item.stock.toLocaleString()} ชิ้น` : "ไม่จำกัด"}\n` +
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
