// src/features/dailyQuest/index.js
// จุดเชื่อมต่อหลักของระบบ Daily Quest (Bear Cafe)

const { Events, PermissionFlagsBits } = require("discord.js");
const { createClient } = require("@supabase/supabase-js");
const sharedSettings = require("../../sharedSettings.json");
const {
  CUSTOM_ID_PROGRESS,
  APPROVE_ROLE_ID
} = require("./questConstants");
const {
  getBangkokTodayDate,
  getNextMidnightTimestamp,
  getOrInitDailyQuestSet,
  getUserDailyProgress,
  approveIrlQuest
} = require("./questEngine");
const {
  buildDailyQuestProgressPayload,
  buildBetaNoticePayload
} = require("./questPayloads");
const { setupQuestTriggers } = require("./questTriggers");
const { setupQuestScheduler } = require("./questScheduler");
const {
  safeRespond,
  safeDeferReply
} = require("../../../utils/discordSafety");

/**
 * ตรวจสอบว่าผู้ใช้มีสิทธิ์ระดับ Staff หรือไม่
 * @param {import('discord.js').Interaction} interaction
 * @returns {boolean}
 */
function checkIsStaff(interaction) {
  const isAdmin =
    interaction.memberPermissions?.has?.(PermissionFlagsBits.Administrator) ||
    interaction.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild);

  return (
    Boolean(isAdmin) ||
    interaction.guild?.ownerId === interaction.user?.id ||
    interaction.user?.id === process.env.OWNER_ID
  );
}

/**
 * ตรวจสอบว่าผู้ใช้มีสิทธิ์ใช้คำสั่ง /อนุมัติเควส หรือไม่
 * (แอดมิน, เจ้าของเซิร์ฟเวอร์, Staff roles, หรือ Role 1205512963058962482)
 * @param {import('discord.js').Interaction} interaction
 * @returns {boolean}
 */
function checkCanApproveQuest(interaction) {
  const memberRoles = interaction.member?.roles;
  const hasRole = (roleId) =>
    Array.isArray(memberRoles) ? memberRoles.includes(roleId) : Boolean(memberRoles?.cache?.has?.(roleId));

  if (hasRole(APPROVE_ROLE_ID) || hasRole("1205512963058962482")) {
    return true;
  }

  const staffRoles = sharedSettings.staff_roles || [];
  if (staffRoles.some(hasRole)) {
    return true;
  }

  return checkIsStaff(interaction);
}

/**
 * Feature entry point
 * @param {import('discord.js').Client} client
 * @param {object} [supabaseClient]
 */
function setupDailyQuest(client, supabaseClient) {
  const supabase =
    supabaseClient ||
    createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    );

  // 1. เริ่มต้นระบบ Event Triggers
  setupQuestTriggers(client, supabase);

  // 2. เริ่มต้นระบบตั้งเวลา Scheduler (Reset 00:00, Announce 08:00)
  setupQuestScheduler(client, supabase);

  // 3. จัดการ InteractionCreate (ปุ่ม และ Slash Commands)
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // ── 3.1 ปุ่ม "︲ดูความคืบหน้า" (daily_quest_progress) ──
      const isProgressBtn =
        interaction.isButton() &&
        (interaction.customId === CUSTOM_ID_PROGRESS ||
          interaction.customId === "daily_quest_progress" ||
          interaction.customId.startsWith("p_349546966612447233"));

      if (isProgressBtn) {
        const userId = interaction.user.id;
        const memberRoles = interaction.member?.roles;
        const hasRole = (roleId) =>
          Array.isArray(memberRoles) ? memberRoles.includes(roleId) : Boolean(memberRoles?.cache?.has?.(roleId));

        // ตรวจสอบ Blacklist จาก sharedSettings.json
        const blacklistRoles = sharedSettings.role_blacklist || [];
        const isBlacklisted = blacklistRoles.some(hasRole);
        if (isBlacklisted) {
          return safeRespond(interaction, {
            content: "⚠️ ขออภัยค่ะ คุณอยู่ในกลุ่มที่ไม่สามารถใช้งานระบบเควสได้",
            flags: 64
          });
        }

        const today = getBangkokTodayDate();

        // บันทึกสถิติการคลิกปุ่มดู Progress (Fire and forget)
        supabase
          .from("daily_quest_analytics")
          .insert({
            quest_date: today,
            event_type: "click_progress",
            user_id: userId
          })
          .then(null, () => {});


        const { quests } = await getOrInitDailyQuestSet(supabase, today);
        const progressMap = await getUserDailyProgress(supabase, userId, today);
        const nextMidnightTs = getNextMidnightTimestamp();

        const progressPayload = buildDailyQuestProgressPayload(
          interaction.user,
          today,
          quests,
          progressMap,
          nextMidnightTs
        );

        return safeRespond(interaction, progressPayload);
      }


      // ── 3.3 คำสั่ง Slash Command: /อนุมัติเควส (Staff Only / Role 1205512963058962482) ──
      if (interaction.isChatInputCommand() && interaction.commandName === "อนุมัติเควส") {
        if (!checkCanApproveQuest(interaction)) {
          return safeRespond(interaction, {
            content: "⚠️ คำสั่งนี้สงวนสิทธิ์สำหรับ Staff ผู้ดูแลระบบเท่านั้นค่ะ",
            flags: 64
          });
        }

        await safeDeferReply(interaction, true);

        const targetUser = interaction.options.getUser("user", true);
        const questId = interaction.options.getString("quest", true);

        const result = await approveIrlQuest(
          client,
          supabase,
          targetUser,
          questId,
          interaction.user
        );

        return interaction.editReply({ content: result.message });
      }

      // ── 3.4 Autocomplete สำหรับคำสั่ง /อนุมัติเควส (แสดงเฉพาะเควส IRL ของวันนี้) ──
      if (interaction.isAutocomplete() && interaction.commandName === "อนุมัติเควส") {
        if (!checkCanApproveQuest(interaction)) {
          return interaction.respond([]).catch(() => {});
        }

        const focused = interaction.options.getFocused(true);
        if (focused.name === "quest") {
          const today = getBangkokTodayDate();
          const { quests } = await getOrInitDailyQuestSet(supabase, today);
          const irlQuests = quests?.filter((q) => q.category === "irl") || [];

          const choices = irlQuests.map((q) => ({
            name: `${q.title} (+${q.reward_points} แต้ม)`,
            value: q.id
          }));

          return interaction.respond(choices).catch(() => {});
        }
      }
    } catch (err) {
      console.error("[dailyQuest] Interaction handler error:", err);
    }
  });

  console.log("⚡ [dailyQuest] Daily Quest System (Plan 1) initialized.");
}

module.exports = { setupDailyQuest };
