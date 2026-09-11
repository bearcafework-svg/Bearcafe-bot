// src/features/rentHouse/components/rentHousePayloads.js
// Component V2 Payload & UI Component Builders for Rent House System

const {
  ActionRowBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  UserSelectMenuBuilder,
} = require("discord.js");

const RENT_HOUSE_IMAGE_URL =
  "https://cdn.discordapp.com/attachments/1524704267015819274/1532018949703729234/NewsBoard_-_bearcafe_17.png?ex=6a6b5355&is=6a6a01d5&hm=7f51d2a4e6791f5046fe887f0a1a23d91bc64806712520785e0209fd7c701b17&";

const RENT_CUSTOM_IDS = {
  panelSelect: "rh_panel_select_action",
  selectTrust: "rh_select_trust",
  selectUntrust: "rh_select_untrust",
  selectKick: "rh_select_kick",
  modalName: "rh_modal_name",
  modalLimit: "rh_modal_limit",
  modalImage: "rh_modal_image",
};

/**
 * สร้าง Response รูปแบบ Component v2 Container Card
 */
function createV2CardResponse(title, textContent, icon = "ℹ️") {
  return {
    flags: 32768 | 64, // Component v2 Ephemeral
    components: [
      {
        type: 17, // Container
        components: [
          {
            type: 10, // Text Section
            content: `## ${icon}︲__\` ${title} \`__\n${textContent}`,
          },
        ],
      },
    ],
  };
}

/**
 * สร้าง Payload แผงควบคุมบ้านเช่า รูปแบบ Component v2 + Select Menu
 */
function createRentHousePanelPayload(ownerMember, customImageUrl = null, ad = null, ctaBtn = null) {
  const options = [
    {
      label: "ดูข้อมูลสัญญาเช่า",
      description: "ตรวจสอบรายละเอียดและวันหมดอายุสัญญาเช่าบ้าน",
      value: "rh_opt_info",
      emoji: { name: "📜" },
    },
    {
      label: "เปลี่ยนชื่อห้อง",
      description: "ตั้งชื่อห้องบ้านเช่าของคุณใหม่",
      value: "rh_opt_name",
      emoji: { name: "📝" },
    },
    {
      label: "เปลี่ยนจำนวนคน",
      description: "ปรับเปลี่ยนจำนวนสมาชิกสูงสุดที่เข้าห้องได้",
      value: "rh_opt_limit",
      emoji: { name: "👥" },
    },
    {
      label: "ล็อค / ปลดล็อคห้อง",
      description: "สลับสถานะล็อคห้อง (เปิด/ปิด ให้สมาชิกทั่วไปเข้า)",
      value: "rh_opt_lock",
      emoji: { name: "🔓" },
    },
    {
      label: "ซ่อน / เปิดมองเห็นห้อง",
      description: "สลับสถานะการซ่อนห้องจากรายชื่อห้อง",
      value: "rh_opt_hide",
      emoji: { name: "👀" },
    },
    {
      label: "อนุญาตสมาชิก (Trust)",
      description: "เพิ่มสมาชิกที่อนุญาตให้เข้าห้องได้เป็นพิเศษ",
      value: "rh_opt_trust",
      emoji: { name: "➕" },
    },
    {
      label: "ยกเลิกอนุญาตสมาชิก",
      description: "ถอดสิทธิ์พิเศษของสมาชิกที่เคยอนุญาตไว้",
      value: "rh_opt_untrust",
      emoji: { name: "➖" },
    },
    {
      label: "เตะสมาชิกออกจากห้อง",
      description: "เตะสมาชิกที่ไม่ต้องการออกจากห้องเสียงทันที",
      value: "rh_opt_kick",
      emoji: { name: "📤" },
    },
    {
      label: "ตรวจสอบสิทธิ์สมาชิก",
      description: "ดูรายชื่อสมาชิกที่ได้รับสิทธิ์พิเศษในห้อง",
      value: "rh_opt_permissions",
      emoji: { name: "📋" },
    },
    {
      label: "ตั้งค่ารูปภาพแผง",
      description: "กำหนดรูปภาพแบนเนอร์ของแผงควบคุมห้อง",
      value: "rh_opt_image",
      emoji: { name: "🖼️" },
    },
  ];

  const isCustomImageActive = Boolean(customImageUrl);
  const imageUrl = isCustomImageActive ? customImageUrl : (ad?.image_url || RENT_HOUSE_IMAGE_URL);

  const containerComponents = [
    {
      type: 12, // Media
      items: [
        {
          media: {
            url: imageUrl,
          },
          spoiler: false,
          description: null,
        },
      ],
    },
    { type: 14, spacing: 2 },
    {
      type: 10, // Text Section
      content:
        `## 🏠︲__\` 𝖱𝖾𝗇𝗍 𝖧𝗈𝗎𝗌𝖾 𝖢𝗈𝗇𝗍𝗋𝗈𝗅 𝖯𝖺𝗇𝖾𝗅 ₊ บ้านเช่าหมี 𓂃 \`__\n` +
        `> ยินดีต้อนรับสู่บ้านเช่าหมีค่ะ ${ownerMember}\n` +
        `> คุณสามารถตั้งค่าห้อง จัดการสิทธิ์ และดูข้อมูลสัญญาผ่านเมนูด้านล่างนี้ได้เลยนะคะ`,
    },
    { type: 14, spacing: 2 },
    {
      type: 1, // ActionRow
      components: [
        {
          type: 3, // StringSelectMenu
          custom_id: RENT_CUSTOM_IDS.panelSelect,
          placeholder: "⚙️ เลือกรายการที่ต้องการจัดการห้อง...",
          options: options,
        },
      ],
    },
  ];

  const bottomButtons = [];
  if (!isCustomImageActive && ad && ad.has_button !== false && ad.link_url) {
    const adBtn = {
      type: 2,
      style: 5,
      url: ad.link_url,
      label: ad.button_label || "ดูรายละเอียด",
    };
    if (ad.button_emoji_id) {
      adBtn.emoji = {
        id: ad.button_emoji_id,
        name: ad.button_emoji_name || "emoji",
        animated: Boolean(ad.button_emoji_animated),
      };
    } else if (ad.button_emoji) {
      adBtn.emoji = { name: ad.button_emoji };
    }
    bottomButtons.push(adBtn);
  }

  if (!isCustomImageActive && ctaBtn) {
    bottomButtons.push(ctaBtn);
  }

  if (bottomButtons.length > 0) {
    containerComponents.push({ type: 14, spacing: 1, divider: false });
    containerComponents.push({
      type: 1,
      components: bottomButtons,
    });
  }

  return {
    flags: 32768, // Component v2 Container
    components: [
      {
        type: 17, // Container
        components: containerComponents,
      },
    ],
  };
}

function buildRentNameModal(currentName = "") {
  return new ModalBuilder()
    .setCustomId(RENT_CUSTOM_IDS.modalName)
    .setTitle("เปลี่ยนชื่อบ้านเช่า")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("room_name")
          .setLabel("ชื่อบ้านเช่าใหม่")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(100)
          .setRequired(true)
          .setValue((currentName ?? "").slice(0, 100))
      )
    );
}

function buildRentLimitModal(currentLimit = 0) {
  return new ModalBuilder()
    .setCustomId(RENT_CUSTOM_IDS.modalLimit)
    .setTitle("เปลี่ยนจำนวนคนเข้าห้อง")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("user_limit")
          .setLabel("จำกัดจำนวนคน (0 = ไม่จำกัด, สูงสุด 99)")
          .setStyle(TextInputStyle.Short)
          .setMaxLength(2)
          .setRequired(true)
          .setValue(String(currentLimit))
      )
    );
}

function buildUserSelectMenuPayload(customId, placeholder, maxValues = 25) {
  const selectMenu = new UserSelectMenuBuilder()
    .setCustomId(customId)
    .setPlaceholder(placeholder)
    .setMinValues(1)
    .setMaxValues(maxValues);

  const row = new ActionRowBuilder().addComponents(selectMenu);
  return {
    flags: 32768 | 64, // Component v2 Ephemeral
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `## 👤︲__\` การจัดการสิทธิ์สมาชิก \`__\n> เลือกสมาชิกที่ต้องการจัดการสิทธิ์ในเมนูด้านล่างนี้ได้เลยค่ะ:`,
          },
          { type: 14, spacing: 2 },
          row,
        ],
      },
    ],
  };
}

function buildRentImageModal(currentUrl = "") {
  return new ModalBuilder()
    .setCustomId(RENT_CUSTOM_IDS.modalImage)
    .setTitle("ตั้งค่ารูปภาพแผงควบคุม")
    .addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("panel_image_url")
          .setLabel("ลิงก์รูปภาพ (Image URL)")
          .setStyle(TextInputStyle.Short)
          .setPlaceholder("https://... หรือพิมพ์ reset เพื่อใช้ภาพเดิม")
          .setValue(currentUrl ? currentUrl.slice(0, 500) : "")
          .setRequired(true)
      )
    );
}

module.exports = {
  RENT_CUSTOM_IDS,
  RENT_HOUSE_IMAGE_URL,
  createV2CardResponse,
  createRentHousePanelPayload,
  buildRentNameModal,
  buildRentLimitModal,
  buildRentImageModal,
  buildUserSelectMenuPayload,
};
