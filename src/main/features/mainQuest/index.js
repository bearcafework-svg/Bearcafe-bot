// src/main/features/mainQuest/index.js
// Entry Point ของระบบเควสใหญ่ (Main Community Quest System)

const { createClient } = require("@supabase/supabase-js");
const {
  getActiveOrCreateMainQuest,
  getTopParticipants,
  completeAndAwardMainQuest
} = require("./questEngine");
const {
  buildMainQuestInProgressPayload,
  buildMainQuestCompletedPayload
} = require("./questPayloads");
const { setupMainQuestTriggers } = require("./questTriggers");

let supabaseClient = null;

function getSupabase() {
  if (supabaseClient) return supabaseClient;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabaseClient = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false
        }
      }
    );
  }
  return supabaseClient;
}

/**
 * ฟังก์ชันสร้างการ์ดแผงควบคุมหลักเควสใหญ่ สำหรับส่งผ่านคำสั่ง /send-component
 * @param {Guild} guild
 * @param {TextChannel} targetChannel
 */
async function buildMainQuestDeployPayload(guild, targetChannel = null) {
  const supabase = getSupabase();
  const quest = await getActiveOrCreateMainQuest(supabase);

  if (!quest) {
    return {
      content: "❌ ไม่สามารถโหลดหรือสร้างข้อมูลเควสใหญ่ได้ กรุณาตรวจสอบการเชื่อมต่อฐานข้อมูลค่ะ"
    };
  }

  const participants = await getTopParticipants(supabase, quest.id, 5);
  const payload = quest.is_completed
    ? buildMainQuestCompletedPayload(quest)
    : buildMainQuestInProgressPayload(quest, participants);

  return { payload, quest };
}

/**
 * บันทึก Message ID และ Channel ID ที่ติดตั้งการ์ดเควสใหญ่
 */
async function bindQuestBoardMessage(questId, channelId, messageId) {
  const supabase = getSupabase();
  if (!supabase || !questId) return;

  await supabase
    .from("main_community_quests")
    .update({
      channel_id: channelId,
      message_id: messageId,
      updated_at: new Date().toISOString()
    })
    .eq("id", questId);

  console.log(`[mainQuest] 📌 Bound Quest Board to Channel ${channelId}, Message ${messageId}`);
}

/**
 * ฟังก์ชันเริ่มต้นการทำงานของระบบเควสใหญ่
 * @param {Client} client Discord.js Client
 */
function setupMainQuest(client) {
  const supabase = getSupabase();
  if (!supabase) {
    console.warn("⚠️ [mainQuest] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. Feature disabled.");
    return;
  }

  // 1. ตรวจสอบ/โหลดเควสที่ Active อยู่ขึ้นมา
  getActiveOrCreateMainQuest(supabase).then((q) => {
    if (q) {
      console.log(`⚡ [mainQuest] Active Main Quest Loaded: "${q.title}" (Current: ${q.current_minutes}/${q.target_hours * 60} mins)`);
    }
  }).catch((e) => {
    console.error("[mainQuest] Failed to load active quest at startup:", e.message);
  });

  // 2. เริ่มต้นตัวดักจับเวลาห้องเสียง
  setupMainQuestTriggers(client, supabase);

  console.log("🌟 [mainQuest] Main Community Quest Feature initialized successfully.");
}

module.exports = {
  setupMainQuest,
  buildMainQuestDeployPayload,
  bindQuestBoardMessage,
  getActiveOrCreateMainQuest,
  buildMainQuestInProgressPayload,
  buildMainQuestCompletedPayload,
  completeAndAwardMainQuest
};
