// src/features/coinGacha/index.js
// ตัวจัดการ Event Interaction สำหรับระบบหมีโยนเหรียญ (Coin Gacha)

const {
  buildMainMachinePayload,
  buildRollingAnimationPayload,
  buildResultPayload,
  buildCheckCoinPayload,
  buildHistoryPayload
} = require("./coinGachaPayloads");
const {
  executeCoinRoll,
  getUserCoins,
  getUserRollHistory
} = require("./coinGachaService");
const { CUSTOM_IDS } = require("./coinGachaConfig");

const FLAG_V2_EPHEMERAL = 32768;

/**
 * ติดตั้ง Event Listener ดักจับการกดปุ่มของตู้สุ่มเหรียญ
 * @param {import('discord.js').Client} client
 */
function setupCoinGacha(client) {
  client.on("interactionCreate", async (interaction) => {
    try {
      if (!interaction.isButton()) return;

      const { customId } = interaction;

      // ── 1. ปุ่มโยนเหรียญสุ่มรางวัล ───────────────────────────────────────
      if (customId === CUSTOM_IDS.ROLL) {
        await interaction.deferReply({ flags: FLAG_V2_EPHEMERAL }).catch(() => {});

        // แสดงแอนิเมชันกำลังสุ่มรางวัลทันที
        await interaction.editReply(buildRollingAnimationPayload("common")).catch(() => {});

        // หน่วงเวลาแอนิเมชัน 2.5 วินาที เพื่อความสมจริงและตื่นเต้น
        await new Promise((resolve) => setTimeout(resolve, 2500));

        // ดำเนินการสุ่มและหักเหรียญในฐานข้อมูลแบบ Atomic
        const result = await executeCoinRoll(interaction.user, interaction.member);

        if (!result.success) {
          return interaction.editReply({
            flags: FLAG_V2_EPHEMERAL,
            components: [
              {
                type: 17,
                components: [
                  {
                    type: 10,
                    content: `### ❌ ไม่สามารถสุ่มรางวัลได้ค่ะ\n- ${result.message}`
                  }
                ]
              }
            ]
          });
        }

        // สร้างการ์ดผลลัพธ์ของรางวัล
        const payload = buildResultPayload({
          rewardName: result.rollData.reward_name,
          rewardType: result.rollData.reward_type,
          hasClaimedFirstTime: result.hasClaimedFirstTime,
          expiryTimestamp: result.expiryTimestamp,
          fallbackNotice: result.fallbackNotice
        });

        return interaction.editReply(payload);
      }

      // ── 2. ปุ่มเช็กเหรียญ ──────────────────────────────────────────────
      if (customId === CUSTOM_IDS.CHECK) {
        await interaction.deferReply({ flags: FLAG_V2_EPHEMERAL }).catch(() => {});

        const coins = await getUserCoins(interaction.user.id);
        const avatarUrl = interaction.user.displayAvatarURL
          ? interaction.user.displayAvatarURL({ extension: "png", size: 256 })
          : null;

        const payload = buildCheckCoinPayload(coins, avatarUrl);
        return interaction.editReply(payload);
      }

      // ── 3. ปุ่มดูประวัติการสุ่ม (และปุ่มเลื่อนหน้า) ──────────────────────
      if (customId.startsWith(CUSTOM_IDS.HISTORY_PREFIX)) {
        await interaction.deferReply({ flags: FLAG_V2_EPHEMERAL }).catch(() => {});

        const pageStr = customId.replace(CUSTOM_IDS.HISTORY_PREFIX, "");
        const page = parseInt(pageStr, 10) || 1;

        const { items, totalPages, currentPage } = await getUserRollHistory(interaction.user.id, page);
        const payload = buildHistoryPayload(items, currentPage, totalPages);

        return interaction.editReply(payload);
      }
    } catch (err) {
      console.error("[coinGacha] Interaction handler error:", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `❌ เกิดข้อผิดพลาดในระบบตู้สุ่มกาชาปอง: \`${err.message}\``
        }).catch(() => {});
      }
    }
  });

  console.log("🪙 [coinGacha] ระบบตู้หมีโยนเหรียญ (Coin Gacha System) ติดตั้ง Event Listener เรียบร้อยแล้ว");
}

module.exports = {
  setupCoinGacha,
  buildMainMachinePayload
};
