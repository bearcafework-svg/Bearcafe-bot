// src/features/beeGacha/payloadBuilder.js — สร้าง Discord Components V2 UI Payload สำหรับตู้กาชาแต่งตัวผึ้ง
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const cfg = require('./settingGacha.json');

const FLAG_V2 = 32768; // MessageFlags.IsComponentsV2
const FLAG_EPHEMERAL = 64; // MessageFlags.Ephemeral

/**
 * สร้าง Components V2 Dashboard Payload สำหรับหน้าหลักตู้กาชาผึ้ง
 */
function buildGachaMainPayload(userData, resultMessage = '') {
  const resultText = resultMessage ? `\n\n📌 **ผลการสุ่มล่าสุด:**\n${resultMessage}` : '';

  const equippedText = [
    `👒 **หมวก:** ${getItemName(userData.equipped.HAT)}`,
    `👕 **ชุด:** ${getItemName(userData.equipped.OUTFIT)}`,
    `👓 **ของตกแต่ง:** ${getItemName(userData.equipped.ACCESSORY)}`,
    `🏞️ **ฉากหลัง:** ${getItemName(userData.equipped.BACKGROUND)}`
  ].join(' | ');

  return {
    flags: FLAG_V2 | FLAG_EPHEMERAL,
    components: [
      {
        type: 17, // Container Block
        components: [
          { type: 14, spacing: 2 },
          {
            type: 10, // Text Block
            content:
              `## 🐝︲__\` 𝖡𝖾𝖾 𝖢𝗈𝗌𝗆𝖾𝗍𝗂𝖼𝗌 𝖦𝖺𝖼𝗁𝖺 ₊ ตู้สุ่มกาชาแต่งตัวผึ้ง 𓂃 \`__\n\n` +
              `💰 **แต้มสะสมที่มี:** \`${userData.points}\` แต้ม | 🍯 **ผงน้ำผึ้ง:** \`${userData.honey_dust}\` ผง\n` +
              `📦 **ไอเทมในคลัง:** \`${userData.inventory.length}/${cfg.cosmetics.length}\` ชิ้น\n\n` +
              `✨ **ชุดที่ผึ้งสวมใส่อยู่ปัจจุบัน:**\n${equippedText}${resultText}`
          },
          { type: 14, spacing: 1, divider: true },
          {
            type: 1, // ActionRow 1
            components: [
              new ButtonBuilder()
                .setCustomId('bee_gacha_roll_1')
                .setLabel(`สุ่ม 1 ครั้ง (${cfg.single_roll_price} แต้ม)`)
                .setEmoji('🎲')
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId('bee_gacha_roll_10')
                .setLabel(`สุ่ม 10 ครั้ง (${cfg.ten_roll_price} แต้ม)`)
                .setEmoji('🎰')
                .setStyle(ButtonStyle.Success),
              new ButtonBuilder()
                .setCustomId('bee_gacha_render_view')
                .setLabel('ดูรูปผึ้งใส่ชุด')
                .setEmoji('🖼️')
                .setStyle(ButtonStyle.Secondary)
            ]
          },
          {
            type: 1, // ActionRow 2 (Inventory Selector)
            components: [
              buildInventorySelectMenu(userData)
            ]
          },
          { type: 14, spacing: 2 }
        ]
      }
    ]
  };
}

function getItemName(cosmeticId) {
  if (!cosmeticId) return 'ไม่ได้ใส่';
  const item = cfg.cosmetics.find(c => c.id === cosmeticId);
  return item ? `${cfg.rarity_emojis[item.rarity]} ${item.name}` : 'ไม่ได้ใส่';
}

function buildInventorySelectMenu(userData) {
  const options = userData.inventory.map(id => {
    const item = cfg.cosmetics.find(c => c.id === id);
    const isEquipped = Object.values(userData.equipped).includes(id);
    return {
      label: item ? `${item.name} [${item.slot}]` : id,
      value: id,
      description: `${item?.rarity} | ${isEquipped ? '✅ สวมใส่อยู่ (กดเพื่อถอด)' : 'กดเพื่อสวมใส่'}`,
      emoji: item ? cfg.rarity_emojis[item.rarity] : '📦'
    };
  });

  if (options.length === 0) {
    options.push({
      label: 'ยังไม่มีไอเทมแต่งตัว กดสุ่มกาชาก่อนนะ!',
      value: 'none_item',
      emoji: '🐝'
    });
  }

  return new StringSelectMenuBuilder()
    .setCustomId('bee_gacha_equip_select')
    .setPlaceholder('🎒 เลือกชุดแต่งตัวผึ้งเพื่อสวมใส่/ถอดชุด...')
    .addOptions(options.slice(0, 25));
}

module.exports = {
  buildGachaMainPayload
};
