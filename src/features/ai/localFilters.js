// ===================================================
// src/features/ai/localFilters.js
// Technical Filters, Debounce Buffer & Human-to-Human Backoff
// ===================================================

const AI_CONFIG = require("./aiConfig");
const { getConsecutiveHumanMessagesCount } = require("./memoryManager");

// In-Memory state for local filters
const userLastMessageTime = new Map();     // userId -> timestamp (ms)
const userLastMessageContent = new Map();  // userId -> text
const debounceTimers = new Map();          // userId -> { timer, messages: [], channel, author, messageObj, isBypass }

/**
 * ตรวจสอบความถูกต้องทางเทคนิคเบื้องต้น (Technical Pre-Filter)
 */
function checkTechnicalFilter(message, botId) {
  // 1. ตรวจสอบ Channel
  if (message.channel.id !== AI_CONFIG.DEDICATED_CHANNEL_ID) {
    return { passed: false, reason: "wrong_channel" };
  }

  // 2. กรองบอท / Webhook
  if (!message.guild || message.author.bot) {
    return { passed: false, reason: "bot_message" };
  }

  const rawText = message.content ? message.content.trim() : "";
  if (!rawText) {
    return { passed: false, reason: "empty_content" };
  }

  // 3. กรองข้อความสแปมคำเดิมซ้ำติดกันจากคนเดิม
  const lastText = userLastMessageContent.get(message.author.id);
  if (lastText && lastText.toLowerCase() === rawText.toLowerCase()) {
    const lastTime = userLastMessageTime.get(message.author.id) || 0;
    if (Date.now() - lastTime < 5000) {
      return { passed: false, reason: "duplicate_spam" };
    }
  }

  return { passed: true, rawText };
}

/**
 * ตรวจสอบเงื่อนไข Bypass (มีความสำคัญสูง ต้องส่งเข้า LLM ไม่ถูกระงับด้วย Backoff)
 */
function isBypassMessage(message, text, botId, isTriggerMatch = false) {
  // 1. Direct Mention บอท
  if (botId && (message.mentions.has(botId) || text.includes(`<@${botId}>`) || text.includes(`<@!${botId}>`))) {
    return true;
  }

  // 2. Direct Reply ถึงข้อความของบอท
  if (message.reference && message.reference.messageId) {
    // ถ้าเป็นการ reply (Discord message reference)
    return true;
  }

  // 3. เรียกชื่อพี่หมีชัดเจน
  const lower = text.toLowerCase();
  if (lower.includes("พี่หมี") || lower.includes("หมีจ๋า") || lower.includes("บาริสต้า")) {
    return true;
  }

  // 4. มี Trigger Keyword ตรง
  if (isTriggerMatch) {
    return true;
  }

  // 5. คำถามเกี่ยวกับระบบ/คำถามชัดเจน
  const questionMarkers = ["ไหม", "มั้ย", "หรือเปล่า", "ป่าว", "ยังไง", "ทำไง", "คืออะไร", "ทำไม", "?", "เท่าไหร่", "ที่ไหน"];
  if (questionMarkers.some((q) => lower.includes(q))) {
    return true;
  }

  return false;
}

/**
 * ตรวจสอบคูลดาวน์รายบุคคล (User Cooldown)
 */
function checkUserCooldown(userId) {
  const now = Date.now();
  const lastTime = userLastMessageTime.get(userId) || 0;
  const elapsed = (now - lastTime) / 1000;

  if (elapsed < AI_CONFIG.LIMITS.USER_COOLDOWN_SECONDS) {
    return {
      allowed: false,
      remainingSeconds: Math.ceil(AI_CONFIG.LIMITS.USER_COOLDOWN_SECONDS - elapsed),
    };
  }

  return { allowed: true };
}

/**
 * บันทึกเวลาล่าสุดของ User
 */
function updateUserActivity(userId, text) {
  userLastMessageTime.set(userId, Date.now());
  userLastMessageContent.set(userId, text);
}

/**
 * ตรวจสอบความเหมาะสมในการส่งเข้า LLM (Human-to-Human Backoff)
 * มีหน้าที่ลด API Cost เท่านั้น หากเป็นข้อความสำคัญจะถูก Bypass เสมอ
 */
function checkH2HBackoff(channelId, isBypass) {
  if (isBypass) {
    return { shouldSendToLLM: true, reason: "bypass_priority" };
  }

  const consecutiveHumans = getConsecutiveHumanMessagesCount(channelId);
  if (consecutiveHumans >= AI_CONFIG.LIMITS.H2H_BACKOFF_THRESHOLD) {
    return {
      shouldSendToLLM: false,
      reason: `h2h_backoff (consecutive human messages: ${consecutiveHumans})`,
    };
  }

  return { shouldSendToLLM: true, reason: "normal_flow" };
}

/**
 * จัดการ Debounce Buffer (รวบข้อความที่พิมพ์ติดกันภายใน 2.5 วินาที)
 *
 * @param {import("discord.js").Message} message
 * @param {boolean} isBypass
 * @param {Function} onFlush Callback เมื่อรวมข้อความครบถ้วนแล้ว
 */
function handleDebounce(message, isBypass, onFlush) {
  const userId = message.author.id;
  const text = message.content.trim();

  let state = debounceTimers.get(userId);

  if (state) {
    clearTimeout(state.timer);
    state.messages.push(text);
    state.messageObj = message; // อ้างอิงข้อความล่าสุด
    if (isBypass) state.isBypass = true;
  } else {
    state = {
      messages: [text],
      channel: message.channel,
      author: message.author,
      messageObj: message,
      isBypass,
      timer: null,
    };
    debounceTimers.set(userId, state);
  }

  state.timer = setTimeout(() => {
    debounceTimers.delete(userId);
    const combinedText = state.messages.join("\n");
    onFlush({
      userId,
      channel: state.channel,
      author: state.author,
      messageObj: state.messageObj,
      combinedText,
      isBypass: state.isBypass,
    });
  }, AI_CONFIG.LIMITS.DEBOUNCE_WAIT_MS);
}

module.exports = {
  checkTechnicalFilter,
  isBypassMessage,
  checkUserCooldown,
  updateUserActivity,
  checkH2HBackoff,
  handleDebounce,
};
