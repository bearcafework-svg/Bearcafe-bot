// ===================================================
// src/features/ai/aiEngine.js
// Bear Cafe AI Core Engine v2 (Single-Pass Execution Pipeline)
// ===================================================

const fs = require("fs");
const path = require("path");
const axios = require("axios");
const AI_CONFIG = require("./aiConfig");
const { recordMessage, getFormattedHistory } = require("./memoryManager");
const { findRelevantKnowledge, loadKnowledge } = require("./knowledgeManager");
const { matchTrigger, loadStickerTriggers } = require("./stickerManager");
const {
  checkTechnicalFilter,
  isBypassMessage,
  checkUserCooldown,
  updateUserActivity,
  checkH2HBackoff,
  handleDebounce,
} = require("./localFilters");

// ─── 1. Internal Daily Budget & State Tracker ──────────────────────────────
let dailyUsageCount = 0;
let currentTrackingDate = "";
let cachedPersonaPrompt = "";

function getCurrentBangkokDateStr() {
  return new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Bangkok" });
}

function checkAndResetDailyBudget() {
  const todayStr = getCurrentBangkokDateStr();
  if (currentTrackingDate !== todayStr) {
    currentTrackingDate = todayStr;
    dailyUsageCount = 0;
    console.log(`🐻 [AIEngine] รีเซ็ต Internal Daily Budget ประจำวัน (${todayStr})`);
  }
}

function getBudgetTier() {
  checkAndResetDailyBudget();
  const ratio = dailyUsageCount / AI_CONFIG.DAILY_INTERNAL_BUDGET;

  if (ratio >= AI_CONFIG.BUDGET_TIERS.EXHAUSTED) return "EXHAUSTED";
  if (ratio >= AI_CONFIG.BUDGET_TIERS.NEAR_LIMIT) return "CRITICAL";
  if (ratio >= AI_CONFIG.BUDGET_TIERS.NORMAL) return "NEAR_LIMIT";
  return "NORMAL";
}

function incrementDailyUsage() {
  checkAndResetDailyBudget();
  dailyUsageCount++;
}

// ─── 2. โหลด Persona และ System Instruction ───────────────────────────────
function loadPersona() {
  try {
    const personaPath = path.join(__dirname, "knowledge", "persona.md");
    if (fs.existsSync(personaPath)) {
      cachedPersonaPrompt = fs.readFileSync(personaPath, "utf8");
    } else {
      cachedPersonaPrompt = "คุณคือพี่หมี บาริสต้าประจำ Bear Cafe คอยช่วยเหลือและคุยเล่นอย่างอบอุ่นและสุภาพ 🐻☕";
    }
  } catch (err) {
    console.error("❌ [AIEngine] โหลด persona.md ล้มเหลว:", err.message);
  }
}

// ─── 3. สร้าง System Prompt แบบ Dynamic สำหรับ Single-Pass ─────────────────
function buildSystemInstruction(relevantKnowledge, candidateStickers, tier) {
  const timeInfo = AI_CONFIG.getTimeSlotBangkok();
  const promptParts = [
    cachedPersonaPrompt,
    "",
    `=== TIME & CONTEXT ===`,
    `- ช่วงเวลาปัจจุบัน: ${timeInfo.slot} (Asia/Bangkok)`,
    `- สถานะการทำงานของระบบ: ${tier}`,
  ];

  // 1. ใส่ Server Knowledge เฉพาะเมื่อมีข้อมูลเกี่ยวข้อง
  if (relevantKnowledge.length > 0) {
    promptParts.push("", "=== RELEVANT SERVER KNOWLEDGE ===");
    for (const item of relevantKnowledge) {
      promptParts.push(`[${item.title}]\n${item.content}`);
    }
  } else {
    promptParts.push("", "=== RELEVANT SERVER KNOWLEDGE ===");
    promptParts.push("(ไม่มีข้อมูลเฉพาะเจาะจงที่เกี่ยวข้องกับข้อความนี้ ให้ตอบตามความรู้ทั่วไปและห้ามเดาข้อมูลร้านเอง)");
  }

  // 2. ใส่ Candidate Stickers ถ้ามี Trigger Match
  if (candidateStickers && candidateStickers.length > 0) {
    promptParts.push("", "=== CANDIDATE DISCORD STICKERS (เลือกใช้ได้ตามความเหมาะสม) ===");
    for (const st of candidateStickers) {
      promptParts.push(`- Sticker ID: "${st.id}" (คำอธิบาย: ${st.description})`);
    }
  }

  // 3. กฎการตอบแบบ Structured Output
  promptParts.push(
    "",
    "=== OUTPUT FORMAT INSTRUCTIONS ===",
    "ตอบกลับในรูปแบบ JSON เท่านั้น โดยมีโครงสร้างดังนี้:",
    "{",
    '  "participate": boolean, // true หากต้องการตอบหรือส่งสติกเกอร์, false หากต้องการเงียบ (silent)',
    '  "modality": "silent" | "text" | "sticker" | "both",',
    '  "text_content": string | null, // ข้อความสั้น 1-2 ประโยค (ห้ามยาวเกินไป)',
    '  "selected_sticker_id": string | null // ใส่ Sticker ID จาก Candidate เท่านั้น (หรือ null)',
    "}",
    "",
    "=== PARTICIPATION GUIDELINES ===",
    "- หากสมาชิกคุยกันเองหรือไม่มีเหตุผลให้พี่หมีแจม ให้ตั้ง participate = false และ modality = 'silent'",
    "- หากถูกเรียกชื่อ, แท็ก, หรือถามคำถามโดยตรง ให้ตั้ง participate = true",
    "- หากตอบ ให้ตอบสั้น กระชับ อบอุ่น และเป็นธรรมชาติ"
  );

  return promptParts.join("\n");
}

// ─── 4. ยิง Gemini API ด้วย Single-Pass Structured Output ──────────────────
async function queryGeminiSinglePass(channelId, promptText, authorName, relevantKnowledge, candidateStickers, tier) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.error("❌ [AIEngine] ไม่พบ GEMINI_API_KEY");
    return { participate: false, modality: "silent" };
  }

  const model = AI_CONFIG.MODEL_NAME;
  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const systemInstruction = buildSystemInstruction(relevantKnowledge, candidateStickers, tier);
  const history = getFormattedHistory(channelId);

  const contents = [
    ...history,
    {
      role: "user",
      parts: [{ text: `[${authorName}]: ${promptText}` }],
    },
  ];

  const payload = {
    system_instruction: {
      parts: [{ text: systemInstruction }],
    },
    contents,
    generationConfig: {
      temperature: 0.7,
      maxOutputTokens: 500,
      response_mime_type: "application/json",
    },
  };

  try {
    const response = await axios.post(endpoint, payload, {
      headers: { "Content-Type": "application/json" },
      timeout: 15000,
    });

    const candidate = response.data?.candidates?.[0];
    const rawJson = candidate?.content?.parts?.[0]?.text;

    if (!rawJson) {
      return { participate: false, modality: "silent" };
    }

    const parsed = JSON.parse(rawJson);
    return {
      participate: Boolean(parsed.participate),
      modality: parsed.modality || (parsed.participate ? "text" : "silent"),
      text_content: parsed.text_content ? String(parsed.text_content).trim() : null,
      selected_sticker_id: parsed.selected_sticker_id || null,
    };
  } catch (err) {
    const errMsg = err.response?.data?.error?.message || err.message;
    console.error("❌ [AIEngine] Gemini API Error:", errMsg);

    if (err.response?.status === 429) {
      console.warn("⚠️ [AIEngine] Gemini API Rate Limited (429)");
    }

    return { participate: false, modality: "silent", error: errMsg };
  }
}

// ─── 5. Discord Action Execution Engine ─────────────────────────────────────
async function executeDecision(decision, context) {
  const { channel, messageObj, channelId, userId, isBypass } = context;

  // 1. กรณีเลือกเงียบ (Silent)
  if (!decision.participate || decision.modality === "silent") {
    return;
  }

  // 2. จัดการส่งข้อความ / Sticker
  try {
    const hasText = Boolean(decision.text_content);
    const hasSticker = Boolean(decision.selected_sticker_id);

    // ส่ง Sticker
    if (hasSticker && (decision.modality === "sticker" || decision.modality === "both")) {
      try {
        await channel.send({
          stickers: [decision.selected_sticker_id],
        });
      } catch (stkErr) {
        console.warn("⚠️ [AIEngine] ส่ง Discord Sticker ไม่สำเร็จ:", stkErr.message);
      }
    }

    // ส่ง Text Reply
    if (hasText && (decision.modality === "text" || decision.modality === "both")) {
      await messageObj.reply({ content: decision.text_content }).catch(async () => {
        await channel.send({ content: `<@${userId}>\n${decision.text_content}` }).catch(() => {});
      });

      // บันทึกคำตอบของพี่หมีลง Channel Memory
      recordMessage(channelId, "model", "พี่หมี", decision.text_content);
    }
  } catch (execErr) {
    console.error("❌ [AIEngine] Execution error:", execErr.message);
  }
}

// ─── 6. Pipeline Controller (รับข้อความจาก Discord Handler) ─────────────────
async function handleIncomingUserMessage(message, botId) {
  // 1. Technical Filter
  const techCheck = checkTechnicalFilter(message, botId);
  if (!techCheck.passed) return;

  const rawText = techCheck.rawText;
  const channelId = message.channel.id;
  const userId = message.author.id;
  const authorName = message.author.displayName || message.author.username;

  // 2. ตรวจสอบ Trigger Match
  const triggerMatch = matchTrigger(rawText);

  // 3. ตรวจสอบ Bypass Priority
  const isBypass = isBypassMessage(message, rawText, botId, triggerMatch.matched);

  // 4. บันทึกข้อความลง Channel Memory ทันที (เพื่อให้ Memory ครบถ้วนแม้จะถูก Backoff ภายหลัง)
  recordMessage(channelId, "user", authorName, rawText);

  // 5. Debounce Buffer (2.5 วินาที)
  handleDebounce(message, isBypass, async (debouncedContext) => {
    const { combinedText, isBypass: finalBypass, channel, messageObj } = debouncedContext;

    // 6. ตรวจสอบ User Cooldown
    const cooldownCheck = checkUserCooldown(userId);
    if (!cooldownCheck.allowed && !finalBypass) {
      return; // ไม่ผ่าน Cooldown และไม่ bypass -> ข้าม
    }
    updateUserActivity(userId, combinedText);

    // 7. ตรวจสอบ Internal Daily Budget Tier
    const tier = getBudgetTier();

    if (tier === "EXHAUSTED") {
      // เมื่อ Budget เต็ม: ตอบเฉพาะเมื่อถูก Direct Mention/Reply ด้วย Static Fallback เท่านั้น
      if (finalBypass) {
        await messageObj.reply({ content: AI_CONFIG.STATIC_EXHAUSTED_MESSAGE }).catch(() => {});
      }
      return;
    }

    if (tier === "CRITICAL" && !finalBypass) {
      // ในโหมด Critical: ตอบเฉพาะ Direct Mention / Reply เท่านั้น
      return;
    }

    // 8. Human-to-Human Backoff Check (ลด Cost มนุษย์คุยกันเอง)
    const backoffCheck = checkH2HBackoff(channelId, finalBypass);
    if (!backoffCheck.shouldSendToLLM) {
      return; // ระงับการยิง LLM ชั่วคราว
    }

    // 9. คัดเลือก Selective Knowledge
    const relevantKnowledge = findRelevantKnowledge(combinedText);

    // 10. ส่ง Typing Indicator ขณะกำลังรอ LLM
    channel.sendTyping().catch(() => {});

    // 11. เรียก Gemini API (Single-Pass)
    incrementDailyUsage();
    const decision = await queryGeminiSinglePass(
      channelId,
      combinedText,
      authorName,
      relevantKnowledge,
      triggerMatch.candidates || [],
      tier
    );

    // 12. ประมวลผลคำสั่งลง Discord (Execute)
    await executeDecision(decision, {
      channel,
      messageObj,
      channelId,
      userId,
      isBypass: finalBypass,
    });
  });
}

// ─── 7. Initializer & Helpers ──────────────────────────────────────────────
async function initializeAIEngine() {
  loadPersona();
  await loadKnowledge();
  await loadStickerTriggers();
  checkAndResetDailyBudget();
  console.log("🐻 [AIEngine v2] เริ่มต้นระบบ AI Engine Single-Pass เรียบร้อยแล้ว!");
}

function getAIEngineStats() {
  checkAndResetDailyBudget();
  return {
    dailyUsageCount,
    budgetLimit: AI_CONFIG.DAILY_INTERNAL_BUDGET,
    tier: getBudgetTier(),
    trackingDate: currentTrackingDate,
  };
}

module.exports = {
  initializeAIEngine,
  handleIncomingUserMessage,
  getAIEngineStats,
  loadPersona,
};
