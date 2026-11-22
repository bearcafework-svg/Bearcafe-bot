// src/features/loyKrathong/index.js
// ตัวจัดการ Event Interaction สำหรับระบบลอยกระทงฝากข้อความ

const { MessageFlags } = require("discord.js");
const {
  CUSTOM_IDS,
  EMOJIS,
  GACHA_CHANNEL_ID,
} = require("./loyKrathongConfig");
const { buildLoyKrathongModal } = require("./loyKrathongPayloads");
const { processKrathongSubmission } = require("./loyKrathongService");

/**
 * ติดตั้ง Event Listener สำหรับระบบลอยกระทง
 * @param {import('discord.js').Client} client
 */
function setupLoyKrathong(client) {
  client.on("interactionCreate", async (interaction) => {
    try {
      // ── 1. ดักจับการเลือกผู้รับจาก User Select Menu ───────────────────────
      if (
        interaction.isUserSelectMenu() &&
        interaction.customId === CUSTOM_IDS.SELECT_USER
      ) {
        const targetUserId = interaction.values?.[0];
        if (!targetUserId) {
          return interaction.reply({
            content: "⚠️ กรุณาเลือกสมาชิกที่ต้องการฝากถึงค่ะ",
            flags: MessageFlags.Ephemeral,
          }).catch(() => {});
        }

        // 🛡️ ป้องกันการเลือกตัวเอง
        if (targetUserId === interaction.user.id) {
          return interaction.reply({
            content: "❌ เธอไม่สามารถส่งกระทงฝากข้อความถึงตัวเองได้นะคะ 💕 ลองเลือกส่งให้เพื่อนดูน้า",
            flags: MessageFlags.Ephemeral,
          }).catch(() => {});
        }

        // 🛡️ ป้องกันการเลือกบอท
        const targetUser =
          interaction.users?.get(targetUserId) ||
          (await client.users.fetch(targetUserId).catch(() => null));
        if (targetUser && targetUser.bot) {
          return interaction.reply({
            content: "❌ เธอไม่สามารถส่งกระทงฝากข้อความถึงบอทได้นะคะ 🤖 ลองเลือกส่งให้เพื่อนที่เป็นสมาชิกดูน้า",
            flags: MessageFlags.Ephemeral,
          }).catch(() => {});
        }

        // แสดงฟอร์ม Modal ให้กรอกข้อความ
        const modal = buildLoyKrathongModal(targetUserId);
        return await interaction.showModal(modal);
      }

      // ── 2. ดักจับการกดยืนยันส่งฟอร์มข้อความ (Modal Submit) ───────────────
      if (
        interaction.isModalSubmit() &&
        interaction.customId.startsWith(`${CUSTOM_IDS.MODAL_PREFIX}:`)
      ) {
        // Defer reply แบบ Ephemeral ทันทีเพื่อป้องกัน Timeout 3 วินาที
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});

        const targetUserId = interaction.customId.slice(
          CUSTOM_IDS.MODAL_PREFIX.length + 1
        );
        const rawMessage = interaction.fields.getTextInputValue(
          CUSTOM_IDS.INPUT_MESSAGE
        );

        try {
          const result = await processKrathongSubmission({
            client,
            senderId: interaction.user.id,
            receiverId: targetUserId,
            message: rawMessage,
          });

          if (result.isFirstTime) {
            // ส่งครั้งแรก: มอบเหรียญ +10 และแจ้งเตือน
            return await interaction.editReply({
              content: `## ${EMOJIS.CHECKMARK}  คุณได้รับเหรียญสำหรับสุ่ม ${EMOJIS.GACHA_COIN} +10 เหรียญ ใช้ได้ที่ <#${GACHA_CHANNEL_ID}>`,
            });
          } else {
            // ส่งรอบถัดไป: แจ้งเตือนส่งข้อความสำเร็จ
            return await interaction.editReply({
              content: `## ${EMOJIS.CHECKMARK}  ส่งข้อความเรียบร้อย`,
            });
          }
        } catch (err) {
          // หากเกิด Error แสดงเหตุผลพร้อมข้อความเดิมใน Codeblock ให้ Copy ได้ทันที
          const reason = err.message || "เกิดข้อผิดพลาดในการประมวลผล";
          return await interaction.editReply({
            content: `❌ **ไม่สามารถส่งข้อความได้เนื่องจาก:** ${reason}\n\n\`\`\`\n${rawMessage}\n\`\`\`\n💡 *คุณสามารถกดคัดลอกข้อความด้านบนเพื่อนำไปปรับแก้หรือลองส่งใหม่อีกครั้งได้เลยนะคะ*`,
          });
        }
      }
    } catch (globalErr) {
      console.error("[loyKrathong] Uncaught interaction error:", globalErr);
    }
  });

  console.log("🌸 [loyKrathong] ระบบลอยกระทงฝากข้อความเปิดใช้งานเรียบร้อยแล้ว");
}

module.exports = {
  setupLoyKrathong,
};
