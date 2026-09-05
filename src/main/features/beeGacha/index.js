// src/features/beeGacha/index.js — ระบบกาชาแต่งตัวผึ้ง (Bee Cosmetics Gacha System)
const { AttachmentBuilder } = require('discord.js');
const { safeRespond, safeDeferReply, safeShowModal } = require('../../../utils/discordSafety');
const { rollGacha, equipItem, getUserGachaData } = require('./gachaService');
const { renderEquippedBee } = require('./beeRenderer');
const { buildGachaMainPayload } = require('./payloadBuilder');
const cfg = require('./settingGacha.json');

const COMMAND_NAME = 'gacha-bee';

function setupBeeGacha(client) {
  // ── A. Client Ready Event & Slash Command Registration ──────────────────
  client.once('clientReady', async () => {
    try {
      const { getValidGuild } = require('../../../utils/guildFilter');
      const guildId = process.env.GUILD_ID || '1144251788493602848';
      const guild = getValidGuild(client, guildId);

      if (guild) {
        await guild.commands.create({
          name: COMMAND_NAME,
          description: '🐝 เปิดตู้สุ่มกาชาแต่งตัวผึ้งอ้วนและจัดการคลังชุดแต่งกาย'
        });
        console.log(`[beeGacha] Registered slash command /${COMMAND_NAME}`);
      }
    } catch (err) {
      console.error('[beeGacha] Failed to register slash command:', err.message);
    }
  });

  // ── B. Interaction Handler ──────────────────────────────────────────────
  client.on('interactionCreate', async (interaction) => {
    try {
      // 1. Slash Command /gacha-bee
      if (interaction.isChatInputCommand() && interaction.commandName === COMMAND_NAME) {
        const userId = interaction.user.id;
        const userData = await getUserGachaData(userId);
        const payload = buildGachaMainPayload(userData);
        await safeRespond(interaction, payload);
        return;
      }

      // 2. Button Interactions
      if (interaction.isButton() && interaction.customId.startsWith('bee_gacha_')) {
        const userId = interaction.user.id;

        if (interaction.customId === 'bee_gacha_roll_1') {
          const res = await rollGacha(userId, 1);
          if (!res.success) {
            return await safeRespond(interaction, { content: `⚠️ ${res.message}`, flags: 64 });
          }

          const item = res.results[0];
          const dupText = item.isDuplicate ? ` *(ของซ้ำ ➔ แปลงเป็น +${item.dustEarned} ผงน้ำผึ้ง)*` : ' ✨ **[ไอเทมใหม่!]**';
          const msg = `🎲 ได้รับ: ${cfg.rarity_emojis[item.rarity]} **${item.name}** [${item.slot}]${dupText}`;

          const payload = buildGachaMainPayload(res.userData, msg);
          return await safeRespond(interaction, payload);
        }

        if (interaction.customId === 'bee_gacha_roll_10') {
          const res = await rollGacha(userId, 10);
          if (!res.success) {
            return await safeRespond(interaction, { content: `⚠️ ${res.message}`, flags: 64 });
          }

          const msgList = res.results.map((item, idx) => {
            const dupText = item.isDuplicate ? ` (+${item.dustEarned} ผง)` : ' ✨ NEW!';
            return `${idx + 1}. ${cfg.rarity_emojis[item.rarity]} **${item.name}**${dupText}`;
          }).join('\n');

          const msg = `🎰 **ผลลัพธ์การสุ่ม 10 ครั้ง:**\n${msgList}\n*(ได้รับผงน้ำผึ้งรวม: +${res.addedDust} ผง)*`;
          const payload = buildGachaMainPayload(res.userData, msg);
          return await safeRespond(interaction, payload);
        }

        if (interaction.customId === 'bee_gacha_render_view') {
          await safeDeferReply(interaction, true);
          const userData = await getUserGachaData(userId);
          const buffer = await renderEquippedBee(userData.equipped, interaction.user.displayName || interaction.user.username);
          const attachment = new AttachmentBuilder(buffer, { name: 'equipped_bee.png' });

          return await safeRespond(interaction, {
            content: `🖼️ **ภาพน้องผึ้งของคุณ ${interaction.user}:**`,
            files: [attachment],
            flags: 64
          });
        }
      }

      // 3. StringSelectMenu Interaction (Equip / Unequip)
      if (interaction.isStringSelectMenu() && interaction.customId === 'bee_gacha_equip_select') {
        const userId = interaction.user.id;
        const selectedId = interaction.values[0];
        if (selectedId === 'none_item') {
          return await safeRespond(interaction, { content: 'กรุณาสุ่มกาชาก่อนนะค้าบ!', flags: 64 });
        }

        const res = await equipItem(userId, selectedId);
        if (!res.success) {
          return await safeRespond(interaction, { content: `⚠️ ${res.message}`, flags: 64 });
        }

        const isNowEquipped = res.equipped[res.cosmetic.slot] === selectedId;
        const msg = isNowEquipped
          ? `✅ สวมใส่ **${res.cosmetic.name}** [${res.cosmetic.slot}] เรียบร้อยแล้ว!`
          : `ถอด **${res.cosmetic.name}** เรียบร้อยแล้ว!`;

        const userData = await getUserGachaData(userId);
        const payload = buildGachaMainPayload(userData, msg);
        return await safeRespond(interaction, payload);
      }

    } catch (err) {
      console.error('[beeGacha] Error in interaction handling:', err);
      await safeRespond(interaction, { content: 'เกิดข้อผิดพลาดในการประมวลผลระบบกาชาผึ้งค่ะ', flags: 64 }).catch(() => {});
    }
  });

  console.log('[beeGacha] Bee Cosmetics Gacha system initialized.');
}

module.exports = {
  setupBeeGacha
};
