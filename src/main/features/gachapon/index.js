// src/main/features/gachapon/index.js
// ระบบตู้กาชาปอง Bear Cafe (Component V2)

const { createClient } = require("@supabase/supabase-js");
const { safeRespond, safeDeferReply } = require("../../../utils/discordSafety");
const {
  getGachaSettings,
  getActiveGachaItems,
  getUserPoints,
  rollGacha,
  getUserGachaHistory
} = require("./gachaEngine");
const {
  buildGachaMainPayload,
  buildGachaResultPayload,
  buildGachaRatesPayload,
  buildGachaHistoryPayload
} = require("./gachaPayloads");
const { FLAG_V2_EPHEMERAL } = require("./gachaConstants");

// Client Supabase
let supabase = null;
function getSupabaseClient() {
  if (!supabase) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    );
  }
  return supabase;
}

/**
 * ฟังก์ชันสร้างการ์ดแผงควบคุมหลักตู้กาชาปองสำหรับเรียกใช้จากภายนอก (เช่น /send-component)
 */
async function buildGachaponDeployPayload(guild) {
  const sb = getSupabaseClient();
  const settings = await getGachaSettings(sb);
  const items = await getActiveGachaItems(sb);
  return buildGachaMainPayload({ id: "0" }, 0, settings, items);
}

/**
 * ติดตั้งระบบตู้กาชาปอง (Setup Gachapon Feature)
 * @param {import('discord.js').Client} client
 */
function setupGachapon(client) {
  const sb = getSupabaseClient();

  // ── 1. ดักจับ Interaction จากปุ่มและคำสั่ง ──────────────────────────────
  client.on("interactionCreate", async (interaction) => {
    try {
      // 1.1 คำสั่ง Slash Command: /หมุนกาชา (หรือ /gacha)
      if (interaction.isChatInputCommand()) {
        if (interaction.commandName === "หมุนกาชา" || interaction.commandName === "gacha") {
          await interaction.deferReply({ flags: FLAG_V2_EPHEMERAL }).catch(() => {});

          const settings = await getGachaSettings(sb);
          const items = await getActiveGachaItems(sb);
          const userPoints = await getUserPoints(sb, interaction.user.id);

          const payload = buildGachaMainPayload(interaction.user, userPoints, settings, items);
          payload.flags = FLAG_V2_EPHEMERAL; // แสดงผลแบบส่วนตัวให้กับผู้เรียกคำสั่ง

          return interaction.editReply(payload).catch((err) => {
            console.error("[gachapon] Failed to reply /หมุนกาชา:", err.message);
          });
        }
      }

      // 1.2 ดักจับปุ่มกดในตู้กาชาปอง
      if (!interaction.isButton()) return;
      const customId = interaction.customId;

      if (!customId.startsWith("gacha_")) return;

      // ป้องกัน timeout 3 วินาที
      await interaction.deferReply({ flags: FLAG_V2_EPHEMERAL }).catch(() => {});

      // ── ปุ่ม: หมุน 1 ครั้ง ──
      if (customId === "gacha_roll_1") {
        const rollResult = await rollGacha(interaction.user, interaction.member, 1, sb);
        if (!rollResult.success) {
          return interaction.editReply({
            content: `❌ ${rollResult.error}`,
            flags: FLAG_V2_EPHEMERAL
          });
        }

        const settings = await getGachaSettings(sb);
        const payload = buildGachaResultPayload(interaction.user, rollResult, settings);
        return interaction.editReply(payload);
      }

      // ── ปุ่ม: หมุน 10 ครั้ง ──
      if (customId === "gacha_roll_10") {
        const rollResult = await rollGacha(interaction.user, interaction.member, 10, sb);
        if (!rollResult.success) {
          return interaction.editReply({
            content: `❌ ${rollResult.error}`,
            flags: FLAG_V2_EPHEMERAL
          });
        }

        const settings = await getGachaSettings(sb);
        const payload = buildGachaResultPayload(interaction.user, rollResult, settings);
        return interaction.editReply(payload);
      }

      // ── ปุ่ม: ดูอัตราดรอป ──
      if (customId === "gacha_view_rates") {
        const items = await getActiveGachaItems(sb);
        const settings = await getGachaSettings(sb);
        const payload = buildGachaRatesPayload(items, settings);
        return interaction.editReply(payload);
      }

      // ── ปุ่ม: ดูประวัติของฉัน ──
      if (customId === "gacha_my_history") {
        const historyList = await getUserGachaHistory(interaction.user.id, sb, 10);
        const payload = buildGachaHistoryPayload(interaction.user, historyList);
        return interaction.editReply(payload);
      }
    } catch (err) {
      console.error("[gachapon] interaction error:", err);
      if (interaction.deferred || interaction.replied) {
        await interaction.editReply({
          content: `❌ เกิดข้อผิดพลาดในการประมวลผลตู้กาชาปอง: ${err.message}`,
          flags: FLAG_V2_EPHEMERAL
        }).catch(() => {});
      }
    }
  });

  console.log("[gachapon] ✅ ระบบตู้กาชาปอง Bear Cafe (Component V2) พร้อมใช้งาน");
}

module.exports = {
  setupGachapon,
  buildGachaponDeployPayload,
  buildGachaMainPayload,
  buildGachaResultPayload,
  buildGachaRatesPayload,
  buildGachaHistoryPayload
};
