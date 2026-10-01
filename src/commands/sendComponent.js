// src/commands/sendComponent.js
// คำสั่ง Slash Command /send-component สำหรับส่งบอร์ดระบบและการ์ด Component V2
// รองรับทั้งระบบ Bear Cafe หลัก และโปรเจกต์ฮิลใจ (Heal Jai) อย่างเป็นอิสระ

const {
  PermissionFlagsBits,
  MessageFlags,
  ChannelType
} = require("discord.js");
const { registerCommand } = require("../interactions/router");
const config = require("../../config");

const FLAG_EPHEMERAL = MessageFlags.Ephemeral;

function setupSendComponent(client) {
  registerCommand("send-component", async (interaction) => {
    const isOwner = (process.env.OWNER_ID && interaction.user.id === process.env.OWNER_ID) ||
                    (interaction.guild && interaction.guild.ownerId === interaction.user.id);
    const staffRoleId = (config.healJai && config.healJai.staffRoleId) || "1536208040582316032";
    const hasStaffRole = interaction.member?.roles?.cache?.some((r) =>
      [staffRoleId, "1144701361448038512", "1144697989986791576", "1144698080239829092"].includes(r.id)
    );
    const hasPermission = interaction.member?.permissions?.has(PermissionFlagsBits.ManageGuild) ||
                          interaction.member?.permissions?.has(PermissionFlagsBits.Administrator);
    const isDevTester = process.env.DEV_MODE === "true";

    const isStaff = isOwner || hasStaffRole || hasPermission || isDevTester;

    if (!isStaff) {
      return interaction.reply({
        content: "❌ ขออภัยค่ะ เฉพาะทีมงานแอดมินเท่านั้นที่สามารถใช้คำสั่งนี้ได้นะคะ",
        flags: FLAG_EPHEMERAL
      });
    }

    const componentChoice = interaction.options.getString("component");
    const targetChannel = interaction.options.getChannel("channel") || interaction.channel;

    if (!targetChannel.isTextBased()) {
      return interaction.reply({
        content: "⚠️ กรุณาเลือกห้องที่เป็น Text Channel เท่านั้นค่ะ",
        flags: FLAG_EPHEMERAL
      });
    }

    // ⚡ Defer reply ทันที เพื่อป้องกัน 10062 Unknown Interaction (เพราะส่ง Component v2 หรือสร้างภาพอาจใช้เวลาเกิน 3 วินาที)
    await interaction.deferReply({ flags: FLAG_EPHEMERAL }).catch(() => {});

    let payload = null;
    let componentName = "";

    try {
      switch (componentChoice) {
        // ── 💚 Heal Jai Components ─────────────────────────────────
        case "terms": {
          const { buildAgreementPayload } = require("../features/healJai/healJaiPayloads");
          payload = buildAgreementPayload();
          componentName = "1️⃣︰บอร์ดอ่านข้อตกลงและนโยบาย (Terms)";
          break;
        }
        case "menu": {
          const { buildMainMenuPayload } = require("../features/healJai/healJaiPayloads");
          payload = buildMainMenuPayload();
          componentName = "2️⃣︰บอร์ดเมนูเครื่องดื่มและสั่งบริการ (Menu)";
          break;
        }
        case "shift": {
          const { buildShiftPanelPayload } = require("../features/healJai/healJaiPayloads");
          payload = buildShiftPanelPayload();
          componentName = "3️⃣︰แผงตอกบัตรเข้ากะของทีมงาน (Shift)";
          break;
        }
        case "feedback": {
          const { buildPublicReviewShowcasePayload } = require("../features/healJai/healJaiPayloads");
          payload = buildPublicReviewShowcasePayload({
            counselorId: interaction.user.id,
            customerId: interaction.user.id,
            rating: 5,
            comment: "ตัวอย่างข้อความรีวิวความประทับใจจากผู้รับบริการ...",
            packageName: "โกโก้พักใจ 30 นาที",
            isAnonymous: true,
            sessionNumber: 1
          });
          componentName = "4️⃣︰กล่องความประทับใจ (พรีวิว)";
          break;
        }

        // ── ☕ Bear Cafe Main Components ───────────────────────────
        case "verify_panel": {
          const { buildRegistrationPanelPayload } = require("../features/verification");
          payload = buildRegistrationPanelPayload();
          componentName = "1️⃣︰บอร์ดลงทะเบียนสมาชิกใหม่ (Registration Panel)";
          break;
        }
        case "notice_panel": {
          const { buildNotificationsPanelPayload } = require("../features/verification");
          payload = buildNotificationsPanelPayload();
          componentName = "2️⃣︰แผงเลือกรับการแจ้งเตือน (Notifications Select)";
          break;
        }
        case "staff_welcome_msg": {
          const { buildStaffWelcomePanelPayload } = require("../features/verification");
          payload = buildStaffWelcomePanelPayload();
          componentName = "3️⃣︰แผงตั้งค่าข้อความต้อนรับทีมงาน (Staff Welcome Msg)";
          break;
        }
        case "top_donate": {
          const { buildTopDonateComponents } = require("../features/donate");
          const { createClient } = require("@supabase/supabase-js");
          const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
          );
          const components = await buildTopDonateComponents(targetChannel.guild, supabase);
          payload = {
            flags: 32768,
            components: [{ type: 17, components }]
          };
          componentName = "4️⃣︰กระดานยอดโดเนทสะสม (Top Donate Board)";
          break;
        }
        case "voice_board": {
          const { createAndSendVoiceBoard } = require("../features/voiceBoard");
          const msg = await createAndSendVoiceBoard(targetChannel);
          if (!msg) {
            return interaction.editReply({
              content: `❌ ไม่สามารถส่งบอร์ดห้องเสียงไปยังห้อง <#${targetChannel.id}> ได้ค่ะ`,
            });
          }
          return interaction.editReply({
            content: `✅ ส่ง **5️⃣︰บอร์ดห้องเสียงหาเพื่อน (Voice Board)** ไปยังห้อง <#${targetChannel.id}> สำเร็จเรียบร้อยแล้วค่ะ!\n> 💡 *ระบบเริ่มทำงานและเชื่อมต่อการอัปเดตเรียลไทม์ 24 ชม. ทันที*`,
          });
        }
        case "daily_quest": {
          const { getBangkokTodayDate, getNextMidnightTimestamp, getOrInitDailyQuestSet } = require("../features/dailyQuest/questEngine");
          const { buildDailyQuestAnnouncementPayload } = require("../features/dailyQuest/questPayloads");
          const { createClient } = require("@supabase/supabase-js");
          const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
          );
          const todayDate = getBangkokTodayDate();
          const nextMidnightTs = getNextMidnightTimestamp();
          const quests = await getOrInitDailyQuestSet(todayDate, supabase);
          payload = buildDailyQuestAnnouncementPayload(todayDate, quests, nextMidnightTs);
          componentName = "6️⃣︰กระดานเควสประจำวัน (Daily Quest Board)";
          break;
        }
        case "recruitment_form": {
          const { buildMainPanel1, buildMainPanel2 } = require("./resetForm");
          payload = [buildMainPanel1(), buildMainPanel2()];
          componentName = "7️⃣︰แผงเปิดรับสมัครทีมงาน (Recruitment Form)";
          break;
        }
        case "color_roles": {
          const { buildMainPanel } = require("./colorRoles");
          payload = buildMainPanel();
          componentName = "8️⃣︰แผงเลือกและเปลี่ยนยศสี (Color Roles Panel)";
          break;
        }
        case "minigame_top": {
          if (!isOwner) {
            return interaction.editReply({
              content: "❌ ขออภัยค่ะ ตัวเลือก **กระดานจัดอันดับหมีติดเกม** สงวนสิทธิ์การใช้งานเฉพาะ Owner เท่านั้นนะคะ 👑",
            });
          }
          const { buildTopLeaderboardPayload } = require("../features/minigames/resetTop");
          const { createClient } = require("@supabase/supabase-js");
          const supabase = createClient(
            process.env.SUPABASE_URL,
            process.env.SUPABASE_SERVICE_ROLE_KEY,
            { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
          );

          const { payload: topPayload, attachment } = await buildTopLeaderboardPayload(targetChannel.guild, supabase);
          await targetChannel.send({ ...topPayload, files: [attachment] });

          return interaction.editReply({
            content: `✅ ส่ง **9️⃣︰กระดานจัดอันดับหมีติดเกม (Minigame Leaderboard)** ไปยังห้อง <#${targetChannel.id}> สำเร็จเรียบร้อยแล้วค่ะ! 🏆`,
          });
        }
        case "gachapon": {
          const { buildGachaponDeployPayload } = require("../features/gachapon");
          payload = await buildGachaponDeployPayload(targetChannel.guild);
          componentName = "🔟︰ตู้สุ่มกาชาปอง (Gachapon Machine)";
          break;
        }
        case "violation_history": {
          const { buildMainPanelPayload } = require("../features/tagWarn");
          payload = buildMainPanelPayload();
          componentName = "1️⃣1️⃣︰ประวัติการทำผิดกฎ (Violation History)";
          break;
        }
        case "main_quest": {
          const { buildMainQuestDeployPayload, bindQuestBoardMessage } = require("../features/mainQuest");
          const { payload: questPayload, quest } = await buildMainQuestDeployPayload(targetChannel.guild, targetChannel);
          const sentMsg = await targetChannel.send(questPayload);
          if (quest && sentMsg) {
            await bindQuestBoardMessage(quest.id, targetChannel.id, sentMsg.id);
          }
          return interaction.editReply({
            content: `✅ ส่ง **1️⃣2️⃣︰เควสใหญ่ (Main Community Quest)** ไปยังห้อง <#${targetChannel.id}> สำเร็จเรียบร้อยแล้วค่ะ! 🐻✨`,
          });
        }
        default:
          return interaction.editReply({
            content: "❌ ไม่พบบอร์ดที่เลือกค่ะ",
          });
      }

      if (Array.isArray(payload)) {
        for (const msgPayload of payload) {
          await targetChannel.send(msgPayload);
        }
      } else if (payload) {
        await targetChannel.send(payload);
      }

      return interaction.editReply({
        content: `✅ ส่ง **${componentName}** ไปยังห้อง <#${targetChannel.id}> สำเร็จเรียบร้อยแล้วค่ะ! ✨`,
      });
    } catch (err) {
      console.error("[sendComponent] Error sending component via slash command:", err);
      const errorDetail = err.rawError?.message || err.message;
      return interaction.editReply({
        content: `❌ เกิดข้อผิดพลาดในการส่งการ์ด: \`${errorDetail}\``,
      });
    }
  });

  console.log("🛠️ [sendComponent] Slash command /send-component registered successfully.");
}

module.exports = {
  setupSendComponent,
};
