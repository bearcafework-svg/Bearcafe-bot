// src/features/adReward/adBoxManager.js
// ตัวจัดการ Discord UI & Transaction State สำหรับ Ad Box Roulette

const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const cfg = require("./settingAd.json");

// Store active message contexts: clickId -> { message, interaction, userId, boxNum }
const activeSessions = new Map();

/**
 * สร้าง 3x3 Grid Buttons
 */
function buildBoxGridRows(userId, selectedBox = null, openedBox = null, openedLabel = "") {
  const rows = [];
  let boxCount = 1;

  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder();
    for (let c = 0; c < 3; c++) {
      const currentBox = boxCount;
      const btn = new ButtonBuilder();

      if (openedBox !== null) {
        // State: Claimed / Opened
        if (currentBox === openedBox) {
          btn.setCustomId(`adbox_opened_${currentBox}`)
            .setLabel(`[ ${openedLabel} ]`)
            .setStyle(ButtonStyle.Success)
            .setDisabled(true);
        } else {
          btn.setCustomId(`adbox_disabled_${currentBox}`)
            .setLabel(`กล่อง #${currentBox}`)
            .setEmoji(cfg.emojis.box)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true);
        }
      } else if (selectedBox !== null) {
        // State: Selected (Waiting for LootLabs Postback)
        if (currentBox === selectedBox) {
          btn.setCustomId(`adbox_select_${currentBox}_${userId}`)
            .setLabel(`กล่อง #${currentBox} (รอผล...)`)
            .setEmoji("⏳")
            .setStyle(ButtonStyle.Primary)
            .setDisabled(true);
        } else {
          btn.setCustomId(`adbox_select_${currentBox}_${userId}`)
            .setLabel(`กล่อง #${currentBox}`)
            .setEmoji(cfg.emojis.box)
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(true);
        }
      } else {
        // State: Initial Selectable
        btn.setCustomId(`adbox_select_${currentBox}_${userId}`)
          .setLabel(`กล่อง #${currentBox}`)
          .setEmoji(cfg.emojis.box)
          .setStyle(ButtonStyle.Primary);
      }

      row.addComponents(btn);
      boxCount++;
    }
    rows.push(row);
  }
  return rows;
}

/**
 * สเกล URL ของ LootLabs โดยแนบ puid={clickId}
 */
function buildLootLabsUrl(clickId) {
  const baseUrl = cfg.lootlabs_link_template || "https://lootlabs.gg/ad-demo";
  const separator = baseUrl.includes("?") ? "&" : "?";
  return `${baseUrl}${separator}puid=${encodeURIComponent(clickId)}`;
}

/**
 * บันทึก Active Session สำหรับแมปการอัปเดต UI เมื่อ Postback เข้ามา
 */
function registerActiveSession(clickId, data) {
  activeSessions.set(clickId, data);
  // Auto expire session after 15 minutes
  setTimeout(() => {
    if (activeSessions.has(clickId)) {
      activeSessions.delete(clickId);
    }
  }, 15 * 60 * 1000);
}

/**
 * Callback เมื่อได้รับการยืนยัน Postback จาก LootLabs
 */
async function onPostbackCompleted(eventData, discordClient) {
  const { clickId, userId, boxNum, reward, newTotalPoints } = eventData;
  const session = activeSessions.get(clickId);

  const openedGridRows = buildBoxGridRows(userId, null, boxNum, reward.label);
  const isJackpot = reward.type === "JACKPOT";
  const embedColor = isJackpot ? "#FF007F" : "#00FF7F";

  const embed = new EmbedBuilder()
    .setColor(embedColor)
    .setTitle(
      isJackpot
        ? `🎉🎰︲__\` JACKPOT BREAKTHROUGH! กล่อง #${boxNum} แตกแล้ว! \`__`
        : `🎊︲__\` 𝖢𝗅𝖺𝗂𝗆 𝖲𝗎𝖼𝖼𝖾𝗌𝗌 ₊ ทุบกล่อง #${boxNum} สำเร็จ! \`__`
    )
    .setDescription(
      `> ${cfg.emojis.sparkles}︰ยินดีด้วย! คุณได้รับ **${reward.points.toLocaleString()} Points** ${reward.label}\n` +
      `> ${cfg.emojis.fire}︰Streak ความต่อเนื่อง: **2 วัน** (โบนัส +10% 🔥)\n` +
      `> 📊︰สิทธิ์คงเหลือวันนี้: **2/3 ครั้ง**\n` +
      (newTotalPoints ? `> 🏆︰แต้มสะสมล่าสุด: **${newTotalPoints.toLocaleString()} Points**\n\n` : "\n") +
      `> ${cfg.emojis.plant} *ขอบคุณที่สนับสนุนเซิร์ฟเวอร์ด้วยการดูโฆษณา LootLabs นะคะ!*`
    )
    .setFooter({ text: "Bear Cafe • LootLabs Verified System" })
    .setTimestamp();

  if (session && session.interaction) {
    try {
      await session.interaction.editReply({
        embeds: [embed],
        components: openedGridRows
      });
      activeSessions.delete(clickId);
      return;
    } catch (e) {
      console.warn("[adBoxManager] editReply failed, falling back to channel message:", e.message);
    }
  }

  // Fallback: หากเซสชัน interaction ไม่อยู่แล้ว พยายามส่งลงแชนแนลหลัก
  if (discordClient && session && session.channelId) {
    try {
      const channel = discordClient.channels.cache.get(session.channelId);
      if (channel) {
        await channel.send({
          content: `<@${userId}> 🎊 ทำการดูโฆษณา LootLabs สำเร็จ!`,
          embeds: [embed],
          components: openedGridRows
        });
      }
    } catch (e) {
      console.error("[adBoxManager] Fallback message send error:", e.message);
    }
  }

  activeSessions.delete(clickId);
}

module.exports = {
  buildBoxGridRows,
  buildLootLabsUrl,
  registerActiveSession,
  onPostbackCompleted
};
