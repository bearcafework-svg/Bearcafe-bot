// ===================================================
// src/features/security/phishingFilter.js — ระบบดักจับ Phishing & Fake Discord Links
// ===================================================

const logger = require("../../../utils/logger");

// Patterns ของโดเมนต้องสงสัย หรือ Typosquatting Discord/Steam links
const PHISHING_PATTERNS = [
  /dlscord\.(gg|com|gift|net|org|app|store|ink)/i,
  /discord-nitro\.[a-z]{2,10}/i,
  /discord-gift\.[a-z]{2,10}/i,
  /discord-app\.[a-z]{2,10}/i,
  /discorcd\.[a-z]{2,10}/i,
  /discort\.[a-z]{2,10}/i,
  /disccord\.[a-z]{2,10}/i,
  /steanncommunity\.[a-z]{2,10}/i,
  /steam-giveaway\.[a-z]{2,10}/i,
  /steam-nitro\.[a-z]{2,10}/i,
  /free-nitro\.[a-z]{2,10}/i,
];

/**
 * ตรวจสอบข้อความและจัดการเมื่อพบ Phishing Link
 */
async function handleMessageSecurityCheck(message) {
  if (!message.guild || message.author.bot) return;

  const content = message.content;
  if (!content) return;

  const isPhishing = PHISHING_PATTERNS.some((pattern) => pattern.test(content));

  if (isPhishing) {
    try {
      // 1. ลบข้อความPhishing ทันที
      await message.delete();
      logger.warn(
        `[phishingFilter] Deleted phishing message from ${message.author.tag} in #${message.channel.name}`
      );

      // 2. Timeout บัญชีผู้ส่ง 1 ชั่วโมง เพื่อป้องกันบัญชีโดนแฮกแพร่เชื้อต่อ
      if (message.member && message.member.moderatable) {
        await message.member.timeout(
          60 * 60 * 1000,
          "[Phishing Security] Automated timeout for posting suspicious phishing links"
        );
      }

      // 3. ส่งข้อความเตือนชั่วคราวในห้อง
      const warningMsg = await message.channel.send({
        content: `⚠️ **[SECURITY WARNING]** ตรวจพบและลบลิงก์ต้องสงสัยจากคุณ <@${message.author.id}> เรียบร้อยแล้ว เพื่อความปลอดภัยของสมาชิกในเซิร์ฟเวอร์`,
      });

      // ลบข้อความแจ้งเตือนหลัง 10 วินาที
      setTimeout(() => {
        warningMsg.delete().catch(() => {});
      }, 10000);
    } catch (err) {
      logger.error(`[phishingFilter] Error handling phishing detection: ${err.message}`);
    }
  }
}

module.exports = {
  handleMessageSecurityCheck,
};
