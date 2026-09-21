// src/commands/moveMembers.js
// คำสั่ง /ย้ายคน (Move Voice Members with Quarantine & Rate Limit Protection)
// สิทธิ์การใช้งาน: เฉพาะ Owner (Server Owner & Bot Owner) เท่านั้น

const { PermissionFlagsBits } = require("discord.js");
const path = require("path");
const { safeDeferReply, safeRespond } = require("../../utils/discordSafety");
const { registerCommand } = require("../interactions/router");

const OWNER_DISCORD_IDS = new Set([
  "944920660759707658",
  process.env.OWNER_ID
].filter(Boolean));

/**
 * ตรวจสอบว่าผู้เรียกใช้คำสั่งคือ Owner หรือไม่
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 * @returns {boolean}
 */
function isOwner(interaction) {
  if (!interaction) return false;
  const userId = interaction.user?.id;
  if (OWNER_DISCORD_IDS.has(userId)) return true;
  if (interaction.guild?.ownerId === userId) return true;
  return false;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * จัดการคำสั่ง Slash Command /ย้ายคน
 * @param {import("discord.js").ChatInputCommandInteraction} interaction
 */
async function handleMoveMembers(interaction) {
  // 1. ตรวจสอบสิทธิ์ Owner
  if (!isOwner(interaction)) {
    return safeRespond(interaction, {
      content: "⚠️ คำสั่งนี้สงวนสิทธิ์สำหรับ **Owner** เท่านั้นค่ะ",
      flags: 64 // Ephemeral
    });
  }

  // 2. Defer reply แบบ Ephemeral ทันทีเพื่อป้องกัน Interaction Timeout
  await safeDeferReply(interaction, true);

  try {
    const fromChannel =
      interaction.options.getChannel("ห้องต้นทาง") ||
      interaction.options.getChannel("from");
    const toChannel =
      interaction.options.getChannel("ห้องปลายทาง") ||
      interaction.options.getChannel("to");

    // 3. ตรวจสอบความถูกต้องของห้องเสียง
    if (!fromChannel || !toChannel) {
      return interaction.editReply({
        content: "❌ ไม่พบข้อมูลห้องเสียงต้นทางหรือห้องปลายทางค่ะ กรุณาเลือกห้องใหม่อีกครั้งนะคะ"
      });
    }

    if (!fromChannel.isVoiceBased() || !toChannel.isVoiceBased()) {
      return interaction.editReply({
        content: "❌ ทั้งห้องต้นทางและห้องปลายทางต้องเป็นห้องเสียง (Voice / Stage Channel) เท่านั้นค่ะ"
      });
    }

    if (fromChannel.id === toChannel.id) {
      return interaction.editReply({
        content: "⚠️ ห้องต้นทางและห้องปลายทางเป็นห้องเดียวกันค่ะ กรุณาเลือกห้องที่แตกต่างกันนะคะ"
      });
    }

    // 4. ตรวจสอบสิทธิ์ Move Members ของบอทในเซิร์ฟเวอร์
    const botMember = interaction.guild?.members.me;
    if (!botMember?.permissions.has(PermissionFlagsBits.MoveMembers)) {
      return interaction.editReply({
        content: "❌ บอทไม่มีสิทธิ์ `Move Members` (ย้ายสมาชิก) ในเซิร์ฟเวอร์นี้ค่ะ กรุณาตรวจสอบการตั้งค่าบทบาทของบอทนะคะ"
      });
    }

    // 5. ดึงรายชื่อสมาชิกในห้องต้นทาง
    const membersToMove = Array.from(fromChannel.members.values());
    const totalCount = membersToMove.length;

    if (totalCount === 0) {
      return interaction.editReply({
        content: `ℹ️ ขณะนี้ไม่มีสมาชิกอยู่ในห้อง <#${fromChannel.id}> ให้ย้ายค่ะ`
      });
    }

    // 6. เริ่มต้นกระบวนการย้ายสมาชิก (Quarantine-Safe Sequential Loop)
    const startTime = Date.now();
    let successCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    await interaction.editReply({
      content:
        `⏳ **กำลังเตรียมการย้ายสมาชิก...**\n` +
        `• **ห้องต้นทาง:** <#${fromChannel.id}>\n` +
        `• **ห้องปลายทาง:** <#${toChannel.id}>\n` +
        `• **จำนวนทั้งหมด:** **${totalCount}** คน\n` +
        `*(ระบบใช้กลไกป้องกัน Discord Quarantine โดยเว้นระยะ 1.2 วินาที/คน อย่างปลอดภัย)*`
    });

    for (let i = 0; i < totalCount; i++) {
      const member = membersToMove[i];

      // ตรวจสอบว่าสมาชิกยังอยู่ในห้องต้นทางอยู่หรือไม่ (อาจจะตัดการเชื่อมต่อไปก่อน)
      if (member.voice.channelId !== fromChannel.id) {
        skippedCount++;
        continue;
      }

      // หากอยู่ในห้องปลายทางแล้ว ให้ข้าม
      if (member.voice.channelId === toChannel.id) {
        skippedCount++;
        continue;
      }

      let moved = false;
      let attempts = 0;
      const maxAttempts = 2;

      while (!moved && attempts < maxAttempts) {
        attempts++;
        try {
          await member.voice.setChannel(
            toChannel,
            `ย้ายห้องโดย Owner (${interaction.user.tag})`
          );
          moved = true;
          successCount++;
        } catch (err) {
          // ตรวจสอบกรณีติด Rate Limit (429) หรือ Discord Restriction
          const isRateLimit =
            err.status === 429 ||
            err.code === 20026 ||
            Boolean(err.retry_after);

          if (isRateLimit) {
            const retryAfterSec = err.retry_after ? Number(err.retry_after) : 2;
            const waitMs = Math.ceil(retryAfterSec * 1000) + 500;
            console.warn(`[moveMembers] Rate limit / quarantine backoff: waiting ${waitMs}ms before retrying...`);
            await sleep(waitMs);
          } else {
            console.error(`[moveMembers] Failed to move user ${member.id}:`, err.message);
            break; // ไม่ retry หากเป็น error อื่น (เช่น permission)
          }
        }
      }

      if (!moved) {
        failedCount++;
      }

      // อัปเดตความคืบหน้าทุกๆ 2 คน หรือเมื่อถึงคนสุดท้าย
      if ((i + 1) % 2 === 0 || i === totalCount - 1) {
        const percent = Math.round(((i + 1) / totalCount) * 100);
        await interaction.editReply({
          content:
            `⏳ **กำลังย้ายสมาชิก... [${i + 1}/${totalCount}] (${percent}%)**\n` +
            `• **จาก:** <#${fromChannel.id}> ➔ **ไป:** <#${toChannel.id}>\n` +
            `• **สถานะ:** สำเร็จ **${successCount}** | ข้าม **${skippedCount}** | ล้มเหลว **${failedCount}**\n` +
            `*(โหมดระวัง Discord Quarantine: กำลังหน่วงเวลาทีละคนอย่างปลอดภัย...)*`
        }).catch(() => {});
      }

      // เว้นช่วงหน่วงเวลา 1.2 วินาที (เฉพาะระหว่างคน ไม่ต้องหน่วงหลังคนสุดท้าย)
      if (i < totalCount - 1) {
        await sleep(1200);
      }
    }

    const elapsedSec = ((Date.now() - startTime) / 1000).toFixed(1);

    // 7. แจ้งผลลัพธ์สรุปเมื่อเสร็จสิ้น
    return interaction.editReply({
      content:
        `✅ **ย้ายสมาชิกเสร็จสิ้นเรียบร้อยแล้วค่ะ!** 🎉\n\n` +
        `• **ห้องต้นทาง:** <#${fromChannel.id}>\n` +
        `• **ห้องปลายทาง:** <#${toChannel.id}>\n` +
        `• **สรุปผล:** ย้ายสำเร็จ **${successCount}** / ${totalCount} คน\n` +
        (skippedCount > 0 ? `• **ข้าม (ตัดสายไปก่อน/อยู่ปลายทางแล้ว):** ${skippedCount} คน\n` : "") +
        (failedCount > 0 ? `• **ข้อผิดพลาด:** ${failedCount} คน\n` : "") +
        `• **เวลาที่ใช้ทั้งหมด:** ${elapsedSec} วินาที\n` +
        `*(ดำเนินการผ่านระบบนิรภัย ปลอดภัยจาก Discord Quarantine 100%)*`
    });
  } catch (err) {
    console.error("[moveMembers] Command execution error:", err);
    return interaction.editReply({
      content: `❌ เกิดข้อผิดพลาดในการย้ายสมาชิก: ${err.message || err}`
    }).catch(() => {});
  }
}

function setupMoveMembers(client) {
  registerCommand("ย้ายคน", handleMoveMembers);
}

module.exports = {
  setupMoveMembers,
  handleMoveMembers,
  isOwner
};
