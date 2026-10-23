// src/main/features/horoscope/healing.js
// ระบบ Slash Command /ขอกำลังใจ สำหรับบอทหลัก (Bear Café)
// นำระบบการสุ่มข้อความ Component V2, จัดการ Modal 3 ช่อง, และ In-Memory Cooldown แบบเดียวกับบอท Kuma มาใช้งาน

const { getSupabaseClient } = require("../../services/supabaseClient");
const { registerCommand, registerButton, registerModal } = require("../../interactions/router");
const {
  handleKumaHealingCommand,
  handleKumaHealingButton,
  handleKumaHealingModalSubmit,
} = require("../../akari/commands/healingCommands");
const sharedConfig = require("../../sharedSettings.json");
const { blacklistPayload } = require("../shared/tarotComponents");

function setupHealing(client) {
  const supabase = getSupabaseClient();

  // 1. ลงทะเบียน Slash Command /ขอกำลังใจ (แทนที่คำสั่งข้อความธรรมดาเดิม)
  registerCommand("ขอกำลังใจ", async (interaction) => {
    // ตรวจสอบ role_blacklist ในเซิร์ฟเวอร์หลัก
    if (interaction.member && sharedConfig.role_blacklist) {
      const isBlacklisted = sharedConfig.role_blacklist.some((id) =>
        interaction.member.roles?.cache?.has(id)
      );
      if (isBlacklisted) {
        return interaction.reply({
          ...blacklistPayload(interaction.user.id),
          flags: 32768 | 64, // Component V2 + Ephemeral
        });
      }
    }

    return await handleKumaHealingCommand(interaction, supabase, client);
  });

  // 2. ลงทะเบียนปุ่ม "เพิ่มข้อความของคุณเอง!" เพื่อเปิด Modal 3 ช่อง
  registerButton("kuma_healing_open_modal", async (interaction) => {
    return await handleKumaHealingButton(interaction, supabase);
  });

  // 3. ลงทะเบียนเมื่อส่งแบบฟอร์ม Modal 3 ช่อง
  registerModal("kuma_healing_modal_submit", async (interaction) => {
    return await handleKumaHealingModalSubmit(interaction, supabase);
  });

  console.log("🧸 [Healing] ✅ ระบบ Slash Command /ขอกำลังใจ (Kuma Style) ติดตั้งเรียบร้อยแล้ว");
}

module.exports = { setupHealing };
