const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  EmbedBuilder,
  PermissionFlagsBits,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  Events
} = require("discord.js");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");
const ws = require("ws");

// ============================================================================
// SYSTEM CONFIGURATION & CONSTANTS
// ============================================================================
const SECRET_CHAT_CATEGORY_ID = process.env.SECRET_CHAT_CATEGORY_ID;
const NOTIFY_CHANNEL_ID       = process.env.NOTIFY_CHANNEL_ID;   // ห้องแจ้งเตือน ping ยศ
const NOTIFY_ROLE_ID          = process.env.NOTIFY_ROLE_ID;       // ยศที่จะถูก ping

const BLOCKED_ROLES       = ["1156930837573546126", "1156930842434752614"];
const SESSION_DURATION_MS = 15 * 60 * 1000;
const WARNING_1MIN_MS  = SESSION_DURATION_MS - 60 * 1000;
const WARNING_30SEC_MS = SESSION_DURATION_MS - 30 * 1000;
const EXTEND_COST_POINTS  = 50;          // แต้มที่ใช้ต่อเวลา
const EXTEND_DURATION_MS  = 3 * 60 * 1000; // +3 นาที
const MAX_EXTENDS         = 2;           // ต่อเวลาได้สูงสุด 2 ครั้งต่อ session
const PING_COOLDOWN_MS    = 30 * 60 * 1000; // cooldown ping ยศ 5 นาที
const QUEUE_MAX_WAIT_MS   = 15 * 60 * 1000; // kick ออกจากคิวหลัง 15 นาที
const QUEUE_DM_KICK_MS    =  5 * 60 * 1000; // kick + DM หากไม่เจอแมตช์ใน 5 นาที
const IDLE_KICK_MS        = 2 * 60 * 1000;  // ปิดห้องถ้าไม่มีใครพิมพ์ 2 นาที
const SEARCH_CYCLE_MS     = 5000;        // หมุนข้อความค้นหาทุก 5 วินาที

const JOIN_QUEUE_CUSTOM_ID    = "btn_join_queue";
const LEAVE_TABLE_CUSTOM_ID   = "btn_leave_table";
const REPORT_USER_CUSTOM_ID   = "btn_report_user";
const CONFIRM_LEAVE_CUSTOM_ID = "btn_confirm_leave";
const EXTEND_TIME_CUSTOM_ID   = "btn_extend_time";
const CANCEL_QUEUE_CUSTOM_ID  = "btn_cancel_queue";
const CLAIM_CASE_CUSTOM_ID    = "btn_claim_case";
const RATING_CUSTOM_ID        = "btn_rating";          // prefix: btn_rating:channelId:score
const STAFF_ALERT_CHANNEL_ID  = "1145314688800927744";
const TOPIC_SELECT_CUSTOM_ID  = "sel_topic";           // SelectMenu เลือกหัวข้อ
const GAME_ANSWER_CUSTOM_ID   = "btn_game";            // prefix: btn_game:answer:correct

// ============================================================================
// TOPIC CONFIG
// ============================================================================
// topic key → ชื่อยศ Discord (ใช้เปรียบเทียบ roles.cache)
const TOPIC_ROLE_NAMES = {
  chat:       "พิมพ์แชทคุย",
  consult:    "หมีขอคำปรึกษา",
  listen:     "หมีชอบรับฟัง",
  student:    "สังคมวัยเรียน",
  worker:     "สังคมวัยทำงาน",
  activity:   "หมีชอบทำกิจกรรม",
  misc:       "หมีเบ็ดเตล็ด",
};

// priority list: topic ของ A → ลำดับ topic ที่จะหาในคิว (null = wildcard ทุกคน)
const TOPIC_MATCH_PRIORITY = {
  chat:     ["chat",     null],
  consult:  ["listen",   "consult", null],
  listen:   ["consult",  "chat",    null],
  student:  ["student",  null],
  worker:   ["worker",   null],
  activity: ["activity", "misc",    null],
  misc:     [null],
};

const TOPIC_EXPAND_MS = 60 * 1000; // 60 วิ แล้ว fallback wildcard

const RATING_TIMEOUT_MS       = 30 * 1000;             // รอ rating 30 วินาทีก่อนลบห้อง

// ============================================================================
// ICE BREAKER — pool คำถาม (แก้ไขได้ง่าย)
// ============================================================================
const ICE_BREAKER_QUESTIONS = [
  "ถ้าเลือกได้จะเป็นตัวละครในเกมหรืออนิเมะเรื่องไหน และทำไม?",
  "อาหารที่กินได้ทุกวันโดยไม่เบื่อคืออะไร?",
  "ถ้ามีเวลา 1 วันทำอะไรก็ได้ จะทำอะไร?",
  "เพลงที่ฟังซ้ำมากที่สุดตอนนี้คือเพลงอะไร?",
  "ถ้าย้ายไปอยู่ต่างประเทศได้ 1 ประเทศ จะเลือกที่ไหน?",
  "ดึกๆ แบบนี้ปกติทำอะไรอยู่?",
  "สัตว์เลี้ยงในฝันคืออะไร?",
  "สิ่งที่อยากเรียนรู้แต่ยังไม่มีเวลาคืออะไร?",
  "ถ้าต้องเลือกระหว่างทะเลกับภูเขา จะเลือกอะไร?",
  "หนังหรือซีรีส์ที่ดูซ้ำมากที่สุดคืออะไร?",
  "ของขวัญที่อยากได้มากที่สุดตอนนี้คืออะไร?",
  "ถ้ามีพลังพิเศษ 1 อย่าง อยากได้อะไร?",
  "ช่วงเวลาไหนของวันที่รู้สึก productive ที่สุด?",
  "สิ่งที่ทำให้รู้สึกดีขึ้นทันทีเวลาอารมณ์ไม่ดีคืออะไร?",
  "ถ้าไม่ต้องทำงานหรือเรียน วันนี้จะทำอะไร?",
  "มีงานอดิเรกที่คนอื่นไม่รู้ไหม?",
  "ร้านอาหารหรือคาเฟ่ที่อยากพาคนอื่นไปมากที่สุดคือที่ไหน?",
  "ถ้าได้เขียนหนังสือ 1 เล่ม จะเขียนเรื่องอะไร?",
  "ความฝันที่อยากทำก่อนอายุ 30 คืออะไร?",
  "ถ้าย้อนเวลาได้ จะบอกอะไรตัวเองในอดีต?",
];

// ข้อความหมุนเวียนตอนค้นหา
const SEARCHING_MESSAGES = [
  "☕ กำลังมองหาเพื่อนร่วมโต๊ะ...\n\nระบบกำลังค้นหาคู่สนทนาให้อยู่นะคะ รอสักครู่ ✨",
  "🔍 เกือบแล้ว...\n\nกำลังสแกนหาคนที่ใช่ให้อยู่ค่ะ อีกนิดเดียว!",
  "☕ กำลังเตรียมโต๊ะ...\n\nบรรยากาศคาเฟ่กำลังอุ่นขึ้น รอสักครู่นะคะ ✨",
  "💫 ระบบกำลังทำงาน...\n\nถ้ายังรอ แสดงว่ายังไม่มีคู่เข้ามา ฝากรอด้วยนะคะ!",
  "🌙 ยังค้นหาอยู่นะคะ...\n\nบางครั้งอาจต้องรอนิดนึง แต่คุ้มค่ารอค่ะ ☕",
];

// ============================================================================
// IN-MEMORY STATE
// ============================================================================
const queue               = [];
const activeUsers         = new Set();
const tableMembers        = new Map();
const sessionTimers       = new Map();
const recentMatches       = new Map();
const spamTracker         = new Map();
const claimedReports      = new Map();
const sessionStartTimes   = new Map();
const tableActionMessages = new Map();
const reportedByUsers     = new Map();
const sessionExtendCount  = new Map(); // channelId -> จำนวนครั้งที่ต่อเวลาแล้ว
const sessionEndTimes     = new Map(); // channelId -> timestamp หมดเวลาจริง
const handledInteractions = new Set();
const searchIntervals     = new Map(); // userId -> intervalId (ข้อความค้นหา)
const queueJoinTimes      = new Map(); // userId -> timestamp ที่เข้าคิว
const queueTimeoutTimers  = new Map(); // userId -> timeoutId auto-kick จากคิว
const queueDmTimers       = new Map(); // userId -> timeoutId 5-min DM kick
const idleKickTimers      = new Map(); // channelId -> timeoutId auto-close idle
const userSearchMsgToken  = new Map(); // userId -> interaction (เพื่อ edit ได้)
const ratingTimeoutTimers = new Map(); // channelId -> timeoutId auto-delete หลัง rating
const ratingSubmitted     = new Map(); // channelId -> Set<userId> ที่กด rating แล้ว

// ── Topic filter state ────────────────────────────────────────────────────────
const userTopics          = new Map(); // userId -> topic key
const topicExpandTimers   = new Map(); // userId -> timeoutId (60วิ fallback)

// ── Mini-game state ───────────────────────────────────────────────────────────
const gameStreak          = new Map(); // userId -> streak count
const gameScore           = new Map(); // userId -> total correct

// Lobby embed tracking (ข้อ 4)
let lobbyEmbedMessage = null; // message object ของ embed หน้า lobby

// Ping cooldown (ข้อ 1)
let lastPingTime = 0;
let pingInFlight = false; // กัน race condition ที่ async calls หลายตัวผ่าน cooldown พร้อมกัน

// ============================================================================
// SUPABASE
// ============================================================================

// Node.js 20 ไม่มี native WebSocket — ต้อง polyfill ก่อน createClient
if (!global.WebSocket) {
  global.WebSocket = require("ws");
}

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  }
);

// ============================================================================
// GLOBAL ERROR HANDLING
// ============================================================================
process.on("unhandledRejection", (err) => console.error("[secret-chat] Unhandled rejection:", err));
process.on("uncaughtException",  (err) => console.error("[secret-chat] Uncaught exception:", err));

// ============================================================================
// INTERACTION DEDUP GUARD
// ============================================================================
function markHandled(id) {
  handledInteractions.add(id);
  setTimeout(() => handledInteractions.delete(id), 5 * 60 * 1000);
}
function isAlreadyHandled(id) { return handledInteractions.has(id); }

// ============================================================================
// UTILITY
// ============================================================================
function buildAllowedPermissions() {
  return [
    PermissionFlagsBits.ViewChannel,
    PermissionFlagsBits.SendMessages,
    PermissionFlagsBits.ReadMessageHistory,
  ];
}

function buildTableActionRow(extendDisabled = false) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(LEAVE_TABLE_CUSTOM_ID)
      .setLabel("🚪 ลุกจากโต๊ะ")
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(REPORT_USER_CUSTOM_ID)
      .setLabel("⚠️ แจ้งรีพอร์ต")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(EXTEND_TIME_CUSTOM_ID)
      .setLabel(`⏱️ ต่อเวลา +3 นาที (50 แต้ม)`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(extendDisabled)
  );
}

function clearSessionTimers(channelId) {
  const t = sessionTimers.get(channelId);
  if (t) {
    clearTimeout(t.warning1m);
    clearTimeout(t.warning30s);
    clearTimeout(t.termination);
    sessionTimers.delete(channelId);
  }
}

function stopSearchInterval(userId) {
  const iv = searchIntervals.get(userId);
  if (iv) { clearInterval(iv); searchIntervals.delete(userId); }
  userSearchMsgToken.delete(userId);
}

function stopQueueDmTimer(userId) {
  const t = queueDmTimers.get(userId);
  if (t) { clearTimeout(t); queueDmTimers.delete(userId); }
}

function isUserBusy(userId) { return activeUsers.has(userId) || queue.includes(userId); }

function checkSpamRateLimit(userId) {
  const now = Date.now();
  const ts = spamTracker.get(userId) || [];
  const recent = ts.filter(t => now - t < 60000);
  recent.push(now);
  spamTracker.set(userId, recent);
  return recent.length > 3;
}

function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ============================================================================
// SAFE INTERACTION REPLY
// ============================================================================
async function safeReply(interaction, options) {
  try {
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ ...options, flags: 64 });
    } else {
      await interaction.reply({ ...options, flags: 64 });
    }
  } catch (err) {
    if (err.code !== 40060 && err.code !== 10003) {
      console.error("[secret-chat] safeReply error:", err);
    }
  }
}

// ============================================================================
// DM HELPERS
// ============================================================================

/**
 * ทดสอบว่า user เปิดรับ DM อยู่หรือไม่
 * ส่ง DM ทดสอบแล้วลบทันที เพื่อตรวจสอบ
 * @returns {boolean} true = ส่ง DM ได้
 */
async function checkDmOpen(user) {
  try {
    const dm = await user.createDM();
    const testMsg = await dm.send({ content: "\u200b" }); // zero-width space
    await testMsg.delete().catch(() => {});
    return true;
  } catch (err) {
    // 50007 = Cannot send messages to this user (DM ปิด)
    return false;
  }
}

/**
 * ส่ง DM แจ้งเตือนเมื่อจับคู่สำเร็จ
 */
async function sendMatchDm(client, userId, channelId, guildId) {
  try {
    const user = await client.users.fetch(userId);
    await user.send(
      `✨ **จับคู่สำเร็จแล้วค่ะ!**\n` +
      `☕ โต๊ะลับของคุณพร้อมแล้ว — กดลิงก์ด้านล่างเพื่อเข้าห้องได้เลยค่ะ\n` +
      `👉 https://discord.com/channels/${guildId}/${channelId}\n\n` +
      `*ขอให้สนุกกับการสนทนานะคะ ☕*`
    );
  } catch (err) {
    // DM อาจปิดอยู่ — ไม่ต้อง throw
    console.warn(`[secret-chat] sendMatchDm failed for ${userId}:`, err.message);
  }
}

/**
 * ส่ง DM แจ้งเมื่อถูก kick ออกจากคิวเพราะไม่เจอแมตช์ใน 5 นาที
 */
async function sendQueueTimeoutDm(client, userId) {
  try {
    const user = await client.users.fetch(userId);
    await user.send(
      `⏰ **ไม่พบคู่สนทนาภายใน 5 นาทีค่ะ**\n\n` +
      `ระบบได้นำคุณออกจากคิวอัตโนมัติแล้วเนื่องจาก:\n` +
      `• ขณะนี้ยังไม่มีผู้ใช้คนอื่นรออยู่ในคิว\n` +
      `• เพื่อประหยัดพื้นที่และรักษาประสิทธิภาพระบบ\n\n` +
      `☕ **กดเข้าคิวใหม่ได้เลยถ้ายังอยากหาเพื่อนคุยนะคะ!**\n` +
      `*(ช่วงเวลาที่มีคนเล่นเยอะมักเป็นช่วงเย็น-ดึกค่ะ)*`
    );
  } catch (err) {
    console.warn(`[secret-chat] sendQueueTimeoutDm failed for ${userId}:`, err.message);
  }
}

// ============================================================================
// TOPIC HELPERS
// ============================================================================

/** สร้าง SelectMenu เลือกหัวข้อ (optgroup ด้วย placeholder) */
function buildTopicSelectMenu() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(TOPIC_SELECT_CUSTOM_ID)
      .setPlaceholder("☕ วันนี้คุณอยากคุยเรื่องอะไร?")
      .addOptions(
        // ─── หมวด: เป้าหมายการคุย ─────────────────────────────────────────
        new StringSelectMenuOptionBuilder()
          .setLabel("💬 พิมพ์แชทคุย")
          .setDescription("แชทสนุก ๆ ทั่วไป ไม่มีธีมเฉพาะ")
          .setValue("chat"),
        new StringSelectMenuOptionBuilder()
          .setLabel("🫂 หมีขอคำปรึกษา")
          .setDescription("อยากระบาย ขอคำแนะนำ หรือแค่มีคนรับฟัง")
          .setValue("consult"),
        new StringSelectMenuOptionBuilder()
          .setLabel("🫶 หมีชอบรับฟัง")
          .setDescription("อยากเป็นคนรับฟังและช่วยเหลือผู้อื่น")
          .setValue("listen"),
        // ─── หมวด: สังคม / ไลฟ์สไตล์ ────────────────────────────────────
        new StringSelectMenuOptionBuilder()
          .setLabel("🎓 สังคมวัยเรียน")
          .setDescription("คุยเรื่องการเรียน ชีวิตนักเรียน/นักศึกษา")
          .setValue("student"),
        new StringSelectMenuOptionBuilder()
          .setLabel("💼 สังคมวัยทำงาน")
          .setDescription("คุยเรื่องงาน ชีวิตออฟฟิศ ความเครียด")
          .setValue("worker"),
        // ─── หมวด: กิจกรรม ───────────────────────────────────────────────
        new StringSelectMenuOptionBuilder()
          .setLabel("🎮 หมีชอบทำกิจกรรม")
          .setDescription("เกม งานอดิเรก กิจกรรมต่าง ๆ")
          .setValue("activity"),
        new StringSelectMenuOptionBuilder()
          .setLabel("🎲 อะไรก็ได้")
          .setDescription("ไม่มีธีม — match กับใครก็ได้เลย!")
          .setValue("misc"),
      )
  );
}

/** หาคู่ในคิวตาม topic priority ของ userId
 *  @returns index ใน queue หรือ -1 ถ้าไม่เจอ
 */
function findMatchByTopic(userId, forceWildcard = false) {
  const myTopic   = userTopics.get(userId) ?? "misc";
  const priorities = forceWildcard ? [null] : (TOPIC_MATCH_PRIORITY[myTopic] ?? [null]);

  for (const wantTopic of priorities) {
    const idx = queue.findIndex(id => {
      if (id === userId) return false;
      const last = recentMatches.get(`${userId}-${id}`);
      if (last && Date.now() - last < 300000) return false;
      if (wantTopic === null) return true; // wildcard
      return (userTopics.get(id) ?? "misc") === wantTopic;
    });
    if (idx !== -1) return idx;
  }
  return -1;
}

/** ล้าง topic + expand timer ของ user */
function clearTopicState(userId) {
  userTopics.delete(userId);
  const t = topicExpandTimers.get(userId);
  if (t) { clearTimeout(t); topicExpandTimers.delete(userId); }
}

// ============================================================================
// MINI-GAME ENGINE
// ============================================================================

/** สร้างโจทย์คณิตสุ่ม พร้อม 3 ตัวเลือก
 *  @returns { question, correct, choices }
 */
function generateMathQuestion() {
  const level = Math.random();
  let a, b, op, correct;

  if (level < 0.4) {
    // ง่าย: บวก/ลบ 1-20
    a  = Math.floor(Math.random() * 20) + 1;
    b  = Math.floor(Math.random() * 20) + 1;
    op = Math.random() < 0.5 ? "+" : "-";
    correct = op === "+" ? a + b : a - b;
  } else if (level < 0.75) {
    // กลาง: คูณ/หาร ตัวเลขสวย
    const pairs = [[2,3],[2,4],[2,5],[2,6],[3,4],[3,5],[3,6],[4,5],[4,6],[5,6],[6,7],[7,8],[8,9]];
    [a, b] = pairs[Math.floor(Math.random() * pairs.length)];
    op = Math.random() < 0.5 ? "×" : "÷";
    if (op === "×") { correct = a * b; }
    else            { correct = a; [a, b] = [a * b, b]; } // สลับให้หารลงตัว
  } else {
    // ยาก: สองขั้นตอน เช่น 12 × 3 - 4
    a = Math.floor(Math.random() * 9) + 2;
    b = Math.floor(Math.random() * 9) + 2;
    const c  = Math.floor(Math.random() * 10) + 1;
    const op2 = Math.random() < 0.5 ? "+" : "-";
    op = `${a} × ${b} ${op2} ${c}`;
    correct = op2 === "+" ? a * b + c : a * b - c;
    // คืนค่าแบบพิเศษ
    const wrong = generateWrongAnswers(correct);
    return { question: `${op} = ?`, correct, choices: shuffle([correct, ...wrong]) };
  }

  const wrong = generateWrongAnswers(correct);
  return { question: `${a} ${op} ${b} = ?`, correct, choices: shuffle([correct, ...wrong]) };
}

/** สร้างตัวเลือกผิด 2 ตัวที่สมเหตุสมผล ไม่ซ้ำ ไม่เท่า correct */
function generateWrongAnswers(correct) {
  const offsets = [1, 2, 3, 5, 10, -1, -2, -3, -5, -10];
  const wrongs  = new Set();
  const pool    = shuffle([...offsets]);
  for (const d of pool) {
    const w = correct + d;
    if (w !== correct && !wrongs.has(w)) wrongs.add(w);
    if (wrongs.size >= 2) break;
  }
  // fallback ถ้าวนแล้วไม่ครบ
  let extra = correct + 7;
  while (wrongs.size < 2) { wrongs.add(extra); extra++; }
  return [...wrongs];
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** สร้าง embed + row ปุ่มของเกม */
function buildGameMessage(userId) {
  const { question, correct, choices } = generateMathQuestion();
  const streak = gameStreak.get(userId) ?? 0;
  const score  = gameScore.get(userId)  ?? 0;

  const streakText = streak >= 3 ? ` 🔥 ${streak} ข้อติด!` : streak > 0 ? ` ✅ ${streak} ข้อติด` : "";
  const embed = new EmbedBuilder()
    .setColor("#D2B48C")
    .setTitle(`🧮 ${question}`)
    .setDescription(
      `คะแนนรวม: **${score}** ข้อ${streakText}\n` +
      `*(เล่นไปก่อนระหว่างรอนะคะ ☕)*`
    )
    .setFooter({ text: "กดเลือกคำตอบที่ถูกต้องค่ะ" });

  // encode: btn_game:selectedAnswer:correctAnswer
  const row = new ActionRowBuilder().addComponents(
    ...choices.map(c =>
      new ButtonBuilder()
        .setCustomId(`${GAME_ANSWER_CUSTOM_ID}:${c}:${correct}`)
        .setLabel(String(c))
        .setStyle(ButtonStyle.Primary)
    )
  );

  return { embeds: [embed], components: [row] };
}

/** ส่งเกมแรกให้ผู้ใช้ (ephemeral followUp) */
async function startMiniGame(interaction, userId) {
  gameStreak.set(userId, 0);
  gameScore.set(userId,  0);
  try {
    await interaction.followUp({ ...buildGameMessage(userId), flags: 64 });
  } catch (_) {}
}

// ============================================================================
// HANDLER: GAME ANSWER
// ============================================================================
async function handleGameAnswer(interaction) {
  if (isAlreadyHandled(interaction.id)) return;
  markHandled(interaction.id);

  const userId = interaction.user.id;

  // ถ้า user ถูก match ไปแล้ว ให้ดิสเบิลปุ่มแล้วจบ
  if (!queue.includes(userId)) {
    try { await interaction.update({ components: [] }); } catch (_) {}
    return;
  }

  const parts   = interaction.customId.split(":");
  const chosen  = parseInt(parts[1], 10);
  const correct = parseInt(parts[2], 10);
  const isRight = chosen === correct;

  // อัปเดต streak/score
  const streak = gameStreak.get(userId) ?? 0;
  const score  = gameScore.get(userId)  ?? 0;
  const newStreak = isRight ? streak + 1 : 0;
  const newScore  = isRight ? score  + 1 : score;
  gameStreak.set(userId, newStreak);
  gameScore.set(userId,  newScore);

  const resultLine = isRight
    ? (newStreak >= 5 ? "🔥 เก่งมากเลย!" : newStreak >= 3 ? "🎉 ถูกต้อง! ไฟกำลังลุก!" : "✅ ถูกต้องค่ะ!")
    : `❌ ไม่ใช่นะคะ — คำตอบคือ **${correct}**`;

  const streakText = newStreak >= 3 ? ` 🔥 ${newStreak} ข้อติด!` : newStreak > 0 ? ` ✅ ${newStreak} ข้อติด` : "";
  const nextEmbed  = new EmbedBuilder()
    .setColor(isRight ? "#7CFC00" : "#FF6B6B")
    .setTitle(resultLine)
    .setDescription(`คะแนนรวม: **${newScore}** ข้อ${streakText}\n\nโจทย์ถัดไป...`);

  try { await interaction.update({ embeds: [nextEmbed], components: [] }); } catch (_) { return; }

  // หน่วง 800ms แล้วส่งโจทย์ใหม่
  setTimeout(async () => {
    if (!queue.includes(userId)) return; // match ไปแล้วระหว่างรอ
    try { await interaction.followUp({ ...buildGameMessage(userId), flags: 64 }); } catch (_) {}
  }, 800);
}


async function updateLobbyEmbed() {
  if (!lobbyEmbedMessage) return;
  try {
    const inQueue   = queue.length;
    const inSession = tableMembers.size;
    const total     = inQueue + inSession * 2;

    const embed = new EmbedBuilder()
      .setColor("#D2B48C")
      .setTitle("☕ โต๊ะลับฉบับ Bear Cafe")
      .setDescription(
        "บรรยากาศคาเฟ่กำลังดีเลย...\nอยากหาใครสักคนมานั่งคุยด้วยไหมคะ?\n\nกดปุ่มด้านล่างเพื่อเข้าสู่ระบบสุ่มแชท ✨"
      )
      .addFields(
        { name: "👥 กำลังเล่นอยู่", value: `${total} คน`, inline: true },
        { name: "⏳ รอในคิว",       value: `${inQueue} คน`, inline: true },
        { name: "💬 ห้องที่เปิดอยู่", value: `${inSession} ห้อง`, inline: true }
      )
      .setFooter({ text: "อัปเดตอัตโนมัติ" })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(JOIN_QUEUE_CUSTOM_ID)
        .setLabel("☕ ค้นหาโต๊ะลับ")
        .setStyle(ButtonStyle.Primary)
    );

    await lobbyEmbedMessage.edit({ embeds: [embed], components: [row] });
  } catch (err) {
    if (err.code !== 10003 && err.code !== 10008) {
      console.error("[secret-chat] updateLobbyEmbed error:", err.message);
    }
  }
}

// ============================================================================
// PING ROLE NOTIFICATION (ข้อ 1)
// ============================================================================
async function sendQueuePingNotification(client) {
  if (!NOTIFY_CHANNEL_ID || !NOTIFY_ROLE_ID) return;
  const now = Date.now();
  // กัน race condition: ถ้ายังส่งอยู่ หรือยังอยู่ใน cooldown ให้ return ทันที
  if (pingInFlight || now - lastPingTime < PING_COOLDOWN_MS) return;

  // จองสิทธิ์ก่อน await ใดๆ เพื่อกัน concurrent calls ผ่าน check พร้อมกัน
  pingInFlight = true;
  lastPingTime = now;

  try {
    const ch = await client.channels.fetch(NOTIFY_CHANNEL_ID);
    if (!ch) return;

    const inQueue   = queue.length;
    const inSession = tableMembers.size;

    const embed = new EmbedBuilder()
      .setColor("#D2B48C")
      .setTitle("☕ มีคนรอหาเพื่อนคุยอยู่นะคะ!")
      .addFields(
        { name: "🌱 หาเพื่อนได้ที่",       value: `<#1507027734097039442>`,  inline: true },
        { name: "⏳ รอในคิว",       value: `${inQueue} คน`,  inline: true },
        { name: "💬 ห้องที่เปิดอยู่", value: `${inSession} ห้อง`, inline: true }
      )
      .setTimestamp();

    await ch.send({ content: `<@&${NOTIFY_ROLE_ID}> มีสมาชิกกำลังรอหาเพื่อนคุยอยู่ค่ะ!`, embeds: [embed] });
  } catch (err) {
    console.error("[secret-chat] sendQueuePingNotification error:", err.message);
    // ถ้าส่งไม่สำเร็จ reset lastPingTime เพื่อให้ลองใหม่ได้ในครั้งถัดไป
    lastPingTime = 0;
  } finally {
    pingInFlight = false;
  }
}

// ============================================================================
// SESSION TIMERS SETUP
// ============================================================================
function setupSessionTimers(channelId, userAId, userBId, channel) {
  const endTime = sessionEndTimes.get(channelId) ?? Date.now() + SESSION_DURATION_MS;
  const remaining = endTime - Date.now();

  if (remaining <= 0) {
    cleanupSession(channelId, userAId, userBId, channel);
    return;
  }

  const warn1Left   = remaining - 60000;
  const warn30Left  = remaining - 30000;

  const timerData = {
    warning1m: setTimeout(async () => {
      if (!tableMembers.has(channelId)) return;
      const extendCount = sessionExtendCount.get(channelId) ?? 0;
      const canExtend   = extendCount < MAX_EXTENDS;
      const endTs       = Math.floor((sessionEndTimes.get(channelId) ?? Date.now()) / 1000);
      try {
        await channel.send({
          content:
            `⏳ **เหลือเวลาอีก 1 นาที!**\n` +
            `🕐 ห้องจะถูกลบอัตโนมัติเวลา <t:${endTs}:T> (<t:${endTs}:R>)\n` +
            (canExtend
              ? `💡 กด **ต่อเวลา +3 นาที** ได้ถ้ายังอยากคุยต่อค่ะ!`
              : `⚠️ ต่อเวลาได้ครบ ${MAX_EXTENDS} ครั้งแล้วค่ะ ห้องจะปิดเมื่อหมดเวลา`),
          components: [buildTableActionRow(!canExtend)]
        });
      } catch (e) { if (e.code !== 10003) console.error("[secret-chat] 1min warning:", e.message); }
    }, warn1Left > 0 ? warn1Left : 1),

    warning30s: setTimeout(async () => {
      if (!tableMembers.has(channelId)) return;
      const endTs = Math.floor((sessionEndTimes.get(channelId) ?? Date.now()) / 1000);
      try {
        await channel.send(
          `⚠️ **เหลือเวลาอีก 30 วินาที!**\n` +
          `🗑️ ห้องนี้จะถูกลบโดยอัตโนมัติเวลา <t:${endTs}:T> เตรียมบอกลากันได้เลยนะคะ!`
        );
      }
      catch (e) { if (e.code !== 10003) console.error("[secret-chat] 30s warning:", e.message); }
    }, warn30Left > 0 ? warn30Left : 1),

    termination: setTimeout(async () => {
      if (!tableMembers.has(channelId)) return;
      sessionTimers.delete(channelId);
      // ส่ง rating prompt แทนการลบห้องทันที
      await endSessionWithRating(channelId, userAId, userBId, channel, "timeout");
    }, remaining)
  };

  sessionTimers.set(channelId, timerData);
}

// ============================================================================
// SESSION CLEANUP  (2 phase: lock → rating prompt → delete)
// ============================================================================

/**
 * Phase 1 — ล็อคห้อง + ส่ง rating prompt
 * ใช้เมื่อ session หมดเวลาตามปกติ (timeout / idle kick)
 * ล้าง activeUsers ให้ทั้งสองกลับเข้าคิวได้ทันที แต่ยังไม่ลบห้อง
 */
async function endSessionWithRating(channelId, userAId, userBId, channel, endedBy = "timeout") {
  const startTime = sessionStartTimes.get(channelId);
  // clear idle kick timer
  const idleT = idleKickTimers.get(channelId);
  if (idleT) { clearTimeout(idleT); idleKickTimers.delete(channelId); }

  // ล้าง state — ปลดล็อค activeUsers ให้เข้าคิวใหม่ได้ทันที
  activeUsers.delete(userAId);
  activeUsers.delete(userBId);
  tableMembers.delete(channelId);
  sessionStartTimes.delete(channelId);
  sessionEndTimes.delete(channelId);
  sessionExtendCount.delete(channelId);
  tableActionMessages.delete(channelId);
  reportedByUsers.delete(channelId);
  claimedReports.delete(channelId);

  await updateLobbyEmbed();

  if (!channel) return;

  const durationMs = Date.now() - (startTime ?? Date.now());
  await logEvent("session_end", {
    channelId, userId: userAId, partnerId: userBId,
    metadata: { duration_seconds: Math.round(durationMs / 1000), ended_by: endedBy }
  });

  // ── ปิด SendMessages ของทั้งสองคน (ยังอ่านได้ แต่พิมพ์ไม่ได้) ──────────
  try {
    await Promise.all([
      channel.permissionOverwrites.edit(userAId, { SendMessages: false }),
      channel.permissionOverwrites.edit(userBId, { SendMessages: false }),
    ]);
  } catch (e) {
    if (e.code !== 10003) console.warn("[secret-chat] lock perms:", e.message);
  }

  // ── ส่ง rating prompt ──────────────────────────────────────────────────
  ratingSubmitted.set(channelId, new Set());

  const ratingRow = new ActionRowBuilder().addComponents(
    // ปุ่ม ⭐ เป็น label ประกอบ — disabled ไม่ให้กดสับสน
    new ButtonBuilder()
      .setCustomId(`${RATING_CUSTOM_ID}:${channelId}:0`)
      .setLabel("⭐ คุยโอเคไหม?")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(true),
    new ButtonBuilder()
      .setCustomId(`${RATING_CUSTOM_ID}:${channelId}:5`)
      .setEmoji("👍")
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`${RATING_CUSTOM_ID}:${channelId}:3`)
      .setEmoji("😐")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${RATING_CUSTOM_ID}:${channelId}:1`)
      .setEmoji("👎")
      .setStyle(ButtonStyle.Danger)
  );

  try {
    await channel.send({
      content:
        `🛑 **หมดเวลาสนทนาแล้วค่ะ**\n\n` +
        `<@${userAId}> <@${userBId}>\n` +
        `ก่อนจากกัน — **คุยครั้งนี้เป็นยังไงบ้างคะ?** ⭐\n` +
        `*(กดได้คนละ 1 ครั้ง — ห้องจะถูกลบอัตโนมัติใน 30 วินาที)*`,
      components: [ratingRow]
    });
  } catch (e) {
    // ส่งไม่ได้ → ลบห้องทันทีเลย
    if (e.code !== 10003) console.error("[secret-chat] rating prompt send:", e.message);
    try { await channel.delete("Rating prompt failed — auto cleanup"); } catch (_) {}
    return;
  }

  // ── ตั้ง 30 วิ auto-delete ────────────────────────────────────────────
  const t = setTimeout(async () => {
    ratingTimeoutTimers.delete(channelId);
    ratingSubmitted.delete(channelId);
    try { await channel.delete("Rating timeout — auto cleanup"); }
    catch (e) { if (e.code !== 10003) console.warn("[secret-chat] rating timeout delete:", e.message); }
  }, RATING_TIMEOUT_MS);
  ratingTimeoutTimers.set(channelId, t);
}

/**
 * cleanupSession — ลบห้องทันที ไม่ผ่าน rating
 * ใช้กรณี: admin ลบ / report / user กด leave เอง
 */
async function cleanupSession(channelId, userAId, userBId, channel, endedBy = "manual") {
  const startTime = sessionStartTimes.get(channelId);
  const idleT = idleKickTimers.get(channelId);
  if (idleT) { clearTimeout(idleT); idleKickTimers.delete(channelId); }
  // ยกเลิก rating timer ถ้ายังค้างอยู่
  const ratingT = ratingTimeoutTimers.get(channelId);
  if (ratingT) { clearTimeout(ratingT); ratingTimeoutTimers.delete(channelId); }
  ratingSubmitted.delete(channelId);

  tableMembers.delete(channelId);
  sessionStartTimes.delete(channelId);
  sessionEndTimes.delete(channelId);
  sessionExtendCount.delete(channelId);
  tableActionMessages.delete(channelId);
  reportedByUsers.delete(channelId);
  claimedReports.delete(channelId);
  activeUsers.delete(userAId);
  activeUsers.delete(userBId);

  await updateLobbyEmbed();

  if (!channel) return;

  const durationMs = Date.now() - (startTime ?? Date.now());
  await logEvent("session_end", {
    channelId, userId: userAId, partnerId: userBId,
    metadata: { duration_seconds: Math.round(durationMs / 1000), ended_by: endedBy }
  });

  try { await channel.delete("Session closed"); }
  catch (e) { if (e.code !== 10003) console.warn("[secret-chat] channel delete:", e.message); }
}

// ============================================================================
// ORPHAN RECOVERY
// ============================================================================
async function runCrashRecovery(client) {
  if (!SECRET_CHAT_CATEGORY_ID) return;
  // ห้องที่ค้างจาก session ก่อน bot restart จะไม่มี timer — ลบทิ้งทั้งหมด
  // รอ 3 วิก่อนเพื่อให้ guild cache โหลดเสร็จก่อน
  await new Promise(r => setTimeout(r, 3000));
  try {
    let purged = 0;
    for (const guild of client.guilds.cache.values()) {
      // fetch channels ใหม่เพื่อให้ได้ข้อมูลล่าสุด
      await guild.channels.fetch().catch(() => {});
      const category = guild.channels.cache.get(SECRET_CHAT_CATEGORY_ID);
      if (!category) continue;
      for (const [, ch] of category.children.cache.filter(c => c.name.includes("☕-โต๊ะลับ-"))) {
        // ถ้าห้องนี้มี timer อยู่แล้ว (สร้างหลัง bot start) ข้ามไป
        if (tableMembers.has(ch.id)) {
          console.log(`[secret-chat] Recovery: skip active room ${ch.name}`);
          continue;
        }
        try {
          await ch.delete("Orphan cleanup post-restart");
          purged++;
          console.log(`[secret-chat] Recovery: purged orphan ${ch.name}`);
        } catch (e) {
          console.warn(`[secret-chat] Recovery: failed to delete ${ch.name}:`, e.message);
        }
      }
    }
    console.log(`[secret-chat] Recovery complete — purged ${purged} orphan room(s)`);
  } catch (err) { console.error("[secret-chat] Recovery failed:", err); }
}

// ============================================================================
// CREATE CHANNEL + ICE BREAKER (ข้อ 5)
// ============================================================================
async function createSecretChatChannel(guild, userAId, userBId) {
  const category = guild.channels.cache.get(SECRET_CHAT_CATEGORY_ID);
  if (!category) throw new Error("SECRET_CHAT_CATEGORY_NOT_FOUND");

  const suffix  = crypto.randomBytes(2).toString("hex");
  const channel = await guild.channels.create({
    name: `☕-โต๊ะลับ-${suffix}`,
    type: ChannelType.GuildText,
    parent: SECRET_CHAT_CATEGORY_ID,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
      { id: userAId, allow: buildAllowedPermissions() },
      { id: userBId, allow: buildAllowedPermissions() }
    ]
  });

  activeUsers.add(userAId);
  activeUsers.add(userBId);
  tableMembers.set(channel.id, new Set([userAId, userBId]));
  recentMatches.set(`${userAId}-${userBId}`, Date.now());
  recentMatches.set(`${userBId}-${userAId}`, Date.now());

  const endTime     = Date.now() + SESSION_DURATION_MS;
  const endTimeUnix = Math.floor(endTime / 1000);
  sessionEndTimes.set(channel.id, endTime);
  sessionExtendCount.set(channel.id, 0);

  const sentMsg = await channel.send({
    content: `☕ โต๊ะลับพร้อมแล้วค่ะ\n\nยินดีต้อนรับ <@${userAId}> และ <@${userBId}> ✨\nระยะเวลาสนทนา 15 นาที (หมดเวลา: <t:${endTimeUnix}:R>)\nสามารถพูดคุยกันได้ตามสบายเลยนะคะ`,
    components: [buildTableActionRow(false)]
  });

  tableActionMessages.set(channel.id, sentMsg);
  reportedByUsers.set(channel.id, new Set());

  // --- Ice Breaker (ข้อ 5) ---
  const question = randomFrom(ICE_BREAKER_QUESTIONS);
  await channel.send(`🎭 **คำถามแตกเอิน:** ${question}\n*(ไม่ต้องตอบก็ได้นะคะ แค่ให้มีจุดเริ่มต้น ☕)*`);

  setupSessionTimers(channel.id, userAId, userBId, channel);
  sessionStartTimes.set(channel.id, Date.now());

  // ── Idle kick: ปิดห้องถ้าไม่มีใครพิมพ์ภายใน 2 นาที ─────────────────────
  const scheduleIdleKick = () => {
    const existing = idleKickTimers.get(channel.id);
    if (existing) clearTimeout(existing);
    const t = setTimeout(async () => {
      if (!tableMembers.has(channel.id)) return; // ห้องปิดไปแล้ว
      idleKickTimers.delete(channel.id);
      clearSessionTimers(channel.id);
      // ผ่าน rating prompt เสมอ แม้ไม่มีการสนทนา
      try {
        await channel.send(
          "👻 **ไม่มีการสนทนาเกิดขึ้นเลย 2 นาทีค่ะ**\n" +
          "ระบบปิดห้องอัตโนมัติ — แต่ยังให้คะแนน session นี้ก่อนได้นะคะ ☕"
        );
      } catch (_) {}
      await endSessionWithRating(channel.id, userAId, userBId, channel, "idle");
    }, IDLE_KICK_MS);
    idleKickTimers.set(channel.id, t);
  };
  scheduleIdleKick();

  // ฟัง messageCreate เพื่อ reset idle timer
  const idleResetListener = (msg) => {
    if (msg.channelId !== channel.id) return;
    if (msg.author.bot) return;
    // มีคนพิมพ์แล้ว — ยกเลิก idle kick และลบ listener ออก
    const t = idleKickTimers.get(channel.id);
    if (t) { clearTimeout(t); idleKickTimers.delete(channel.id); }
    channel.client.off("messageCreate", idleResetListener);
  };
  channel.client.on("messageCreate", idleResetListener);

  await updateLobbyEmbed();
  console.log(`[secret-chat] Created room ${channel.name} for ${userAId} + ${userBId}`);
  return channel;
}

// ============================================================================
// LOGGING
// ============================================================================
async function logEvent(event, data = {}) {
  try {
    const { error } = await supabase.from("secret_chat_logs").insert([{
      event,
      channel_id: data.channelId ?? null,
      user_id:    data.userId    ?? null,
      partner_id: data.partnerId ?? null,
      staff_id:   data.staffId   ?? null,
      guild_id:   data.guildId   ?? null,
      metadata:   data.metadata  ?? {},
    }]);
    if (error) console.error("[secret-chat] logEvent error:", error.message);
  } catch (err) { console.error("[secret-chat] logEvent exception:", err.message); }
}

// ============================================================================
// HANDLER: JOIN QUEUE — Step 1: แสดง SelectMenu เลือกหัวข้อ
// ============================================================================
async function handleJoinQueue(interaction) {
  if (isAlreadyHandled(interaction.id)) return;
  markHandled(interaction.id);

  const userId = interaction.user.id;

  try { await interaction.deferReply({ flags: 64 }); }
  catch (e) { if (e.code === 10062) return; return; }

  if (interaction.member?.roles) {
    const hasBlocked = BLOCKED_ROLES.some(r => interaction.member.roles.cache.has(r));
    if (hasBlocked) return await interaction.editReply("ขออภัยค่ะ สิทธิ์ของคุณไม่สามารถใช้งานโต๊ะลับได้ในขณะนี้ ☕");
  }

  if (isUserBusy(userId)) return await interaction.editReply("ตอนนี้คุณอยู่ในคิวหรือกำลังนั่งโต๊ะอยู่แล้วนะคะ ☕");
  if (checkSpamRateLimit(userId)) return await interaction.editReply("คุณทำรายการบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่ค่ะ ⏳");

  const dmOpen = await checkDmOpen(interaction.user);
  if (!dmOpen) {
    return await interaction.editReply(
      "📩 **กรุณาเปิดรับ DM ก่อนใช้งานโต๊ะลับนะคะ!**\n\n" +
      "ระบบจำเป็นต้องส่ง DM เพื่อแจ้งเตือนเมื่อจับคู่สำเร็จค่ะ\n\n" +
      "**วิธีเปิด DM:**\n" +
      "⚙️ Settings → Privacy & Safety → Allow direct messages from server members ✅\n\n" +
      "*หลังเปิดแล้วกดปุ่ม ☕ ค้นหาโต๊ะลับ ใหม่อีกครั้งได้เลยค่ะ*"
    );
  }

  const presence = interaction.guild?.members?.cache.get(userId)?.presence;
  const status   = presence?.status ?? "offline";
  if (status === "dnd") {
    return await interaction.editReply(
      "🔴 ตอนนี้คุณเปิดสถานะ **ห้ามรบกวน (DND)** อยู่ค่ะ\n" +
      "ระบบไม่สามารถจับคู่ได้เพราะอาจพลาดแจ้งเตือนได้\n\n" +
      "✅ **กรุณาเปลี่ยนสถานะเป็น Online แล้วกดเข้าคิวใหม่อีกครั้งนะคะ**"
    );
  }

  // ── แสดง SelectMenu ให้เลือกหัวข้อก่อนเข้าคิว ────────────────────────────
  await interaction.editReply({
    content: "☕ **วันนี้คุณอยากคุยเรื่องอะไรคะ?**\nเลือกหัวข้อเพื่อให้ระบบจับคู่ได้ตรงใจมากขึ้นนะคะ ✨",
    components: [buildTopicSelectMenu()],
  });

  // เก็บ interaction ไว้รับ SelectMenu ใน handleTopicSelect
  userSearchMsgToken.set(userId, interaction);
}

// ============================================================================
// HANDLER: TOPIC SELECT — Step 2: รับหัวข้อแล้วเข้าคิว
// ============================================================================
async function handleTopicSelect(interaction) {
  if (isAlreadyHandled(interaction.id)) return;
  markHandled(interaction.id);

  const userId = interaction.user.id;
  const topic  = interaction.values[0]; // เช่น "chat", "consult", ...

  try { await interaction.deferUpdate(); } catch (e) { return; }

  if (isUserBusy(userId)) {
    try { await interaction.editReply({ content: "ตอนนี้คุณอยู่ในคิวหรือกำลังนั่งโต๊ะอยู่แล้วนะคะ ☕", components: [] }); } catch (_) {}
    return;
  }

  userTopics.set(userId, topic);

  // ── พยายามจับคู่ทันที (ตาม priority) ────────────────────────────────────
  const partnerIndex = findMatchByTopic(userId, false);

  if (partnerIndex !== -1) {
    const [waitingUserId] = queue.splice(partnerIndex, 1);
    stopSearchInterval(waitingUserId);
    stopQueueDmTimer(waitingUserId);
    clearTopicState(waitingUserId);
    queueJoinTimes.delete(waitingUserId);
    const wTimer = queueTimeoutTimers.get(waitingUserId);
    if (wTimer) { clearTimeout(wTimer); queueTimeoutTimers.delete(waitingUserId); }
    queueJoinTimes.delete(userId);
    const uTimer = queueTimeoutTimers.get(userId);
    if (uTimer) { clearTimeout(uTimer); queueTimeoutTimers.delete(userId); }
    stopQueueDmTimer(userId);
    clearTopicState(userId);

    // ล้าง game state
    gameStreak.delete(waitingUserId); gameScore.delete(waitingUserId);
    gameStreak.delete(userId);        gameScore.delete(userId);

    try {
      const channel = await createSecretChatChannel(interaction.guild, waitingUserId, userId);
      await interaction.editReply({ content: `จับคู่สำเร็จแล้วค่ะ ✨ ไปที่ห้อง <#${channel.id}> ได้เลย ขอให้สนุกนะคะ`, components: [] });
      const waitingInteraction = userSearchMsgToken.get(waitingUserId);
      if (waitingInteraction) {
        try { await waitingInteraction.editReply({ content: `จับคู่สำเร็จแล้วค่ะ ✨ ไปที่ห้อง <#${channel.id}> ได้เลย ขอให้สนุกนะคะ`, components: [] }); } catch (_) {}
      }
      const guildId = interaction.guildId;
      await Promise.allSettled([
        sendMatchDm(interaction.client, waitingUserId, channel.id, guildId),
        sendMatchDm(interaction.client, userId,        channel.id, guildId),
      ]);
    } catch (err) {
      console.error("[secret-chat] create room error:", err);
      activeUsers.delete(waitingUserId);
      activeUsers.delete(userId);
      try { await interaction.editReply({ content: "เกิดปัญหาระหว่างสร้างโต๊ะลับค่ะ ลองใหม่อีกครั้งนะคะ", components: [] }); } catch (_) {}
    }
    return;
  }

  // ── ไม่เจอคู่ทันที → เข้าคิว ─────────────────────────────────────────────
  queue.push(userId);
  queueJoinTimes.set(userId, Date.now());
  console.log(`[secret-chat] ${userId} joined queue (topic: ${topic}). Total: ${queue.length}`);

  // 60 วิ → ขยาย wildcard อัตโนมัติ
  const expandTimer = setTimeout(async () => {
    topicExpandTimers.delete(userId);
    if (!queue.includes(userId)) return;
    const expandIdx = findMatchByTopic(userId, true);
    if (expandIdx === -1) return; // ยังไม่มีใครในคิว รอต่อ
    const [waitingUserId] = queue.splice(expandIdx, 1);
    const myIdx = queue.indexOf(userId);
    if (myIdx !== -1) queue.splice(myIdx, 1);
    stopSearchInterval(waitingUserId);
    stopQueueDmTimer(waitingUserId);
    clearTopicState(waitingUserId);
    clearTopicState(userId);
    queueJoinTimes.delete(waitingUserId);
    queueJoinTimes.delete(userId);
    [waitingUserId, userId].forEach(id => {
      const t = queueTimeoutTimers.get(id);
      if (t) { clearTimeout(t); queueTimeoutTimers.delete(id); }
      stopQueueDmTimer(id);
      gameStreak.delete(id); gameScore.delete(id);
    });
    try {
      const channel = await createSecretChatChannel(interaction.guild, waitingUserId, userId);
      const waitInt = userSearchMsgToken.get(waitingUserId);
      if (waitInt) {
        try { await waitInt.editReply({ content: `จับคู่สำเร็จแล้วค่ะ ✨ ไปที่ห้อง <#${channel.id}> ได้เลย ขอให้สนุกนะคะ`, components: [] }); } catch (_) {}
      }
      try { await interaction.editReply({ content: `จับคู่สำเร็จแล้วค่ะ ✨ ไปที่ห้อง <#${channel.id}> ได้เลย ขอให้สนุกนะคะ`, components: [] }); } catch (_) {}
      await Promise.allSettled([
        sendMatchDm(interaction.client, waitingUserId, channel.id, interaction.guildId),
        sendMatchDm(interaction.client, userId,        channel.id, interaction.guildId),
      ]);
    } catch (err) {
      console.error("[secret-chat] expand match create room error:", err);
      activeUsers.delete(waitingUserId);
      activeUsers.delete(userId);
    }
  }, TOPIC_EXPAND_MS);
  topicExpandTimers.set(userId, expandTimer);

  // ── DM kick หลัง 5 นาที ──────────────────────────────────────────────────
  const dmKickTimer = setTimeout(async () => {
    const stillInQueue = queue.indexOf(userId);
    if (stillInQueue === -1) return;
    queue.splice(stillInQueue, 1);
    queueJoinTimes.delete(userId);
    queueDmTimers.delete(userId);
    stopSearchInterval(userId);
    clearTopicState(userId);
    gameStreak.delete(userId); gameScore.delete(userId);
    const qTimer15 = queueTimeoutTimers.get(userId);
    if (qTimer15) { clearTimeout(qTimer15); queueTimeoutTimers.delete(userId); }
    activeUsers.delete(userId);
    await updateLobbyEmbed();
    await sendQueueTimeoutDm(interaction.client, userId);
    try {
      await interaction.editReply({ content: "⏰ **ไม่พบคู่สนทนาภายใน 5 นาทีค่ะ**\nระบบนำคุณออกจากคิวอัตโนมัติแล้ว กรุณาตรวจสอบ DM จากบอทสำหรับรายละเอียดเพิ่มเติมค่ะ ☕", components: [] });
    } catch (_) {}
  }, QUEUE_DM_KICK_MS);
  queueDmTimers.set(userId, dmKickTimer);

  // ── kick หลัง 15 นาที ────────────────────────────────────────────────────
  const queueTimer = setTimeout(async () => {
    const stillInQueue = queue.indexOf(userId);
    if (stillInQueue === -1) return;
    queue.splice(stillInQueue, 1);
    queueJoinTimes.delete(userId);
    queueTimeoutTimers.delete(userId);
    stopSearchInterval(userId);
    clearTopicState(userId);
    gameStreak.delete(userId); gameScore.delete(userId);
    activeUsers.delete(userId);
    await updateLobbyEmbed();
    try {
      await interaction.editReply({ content: "⏰ **หมดเวลารอคิวแล้วค่ะ (15 นาที)**\nระบบนำคุณออกจากคิวอัตโนมัติแล้ว\nกดเข้าคิวใหม่ได้เลยถ้ายังอยากคุยนะคะ ☕", components: [] });
    } catch (_) {}
  }, QUEUE_MAX_WAIT_MS);
  queueTimeoutTimers.set(userId, queueTimer);

  await sendQueuePingNotification(interaction.client);
  await updateLobbyEmbed();

  const cancelRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(CANCEL_QUEUE_CUSTOM_ID)
      .setLabel("❌ ยกเลิกคิว")
      .setStyle(ButtonStyle.Secondary)
  );

  const topicLabel = {
    chat: "💬 พิมพ์แชทคุย", consult: "🫂 หมีขอคำปรึกษา", listen: "🫶 หมีชอบรับฟัง",
    student: "🎓 สังคมวัยเรียน", worker: "💼 สังคมวัยทำงาน",
    activity: "🎮 หมีชอบทำกิจกรรม", misc: "🎲 อะไรก็ได้",
  }[topic] ?? topic;

  await interaction.editReply({
    content: `${SEARCHING_MESSAGES[0]}\n\n🏷️ หัวข้อที่เลือก: **${topicLabel}**\n*(ระบบจะขยายการค้นหาอัตโนมัติใน 60 วินาที)*`,
    components: [cancelRow],
  });

  userSearchMsgToken.set(userId, interaction);

  // เริ่มเกม
  await startMiniGame(interaction, userId);

  // หมุนข้อความค้นหา
  let msgIndex = 1;
  const iv = setInterval(async () => {
    if (!queue.includes(userId)) { stopSearchInterval(userId); return; }
    try {
      await interaction.editReply({
        content: `${SEARCHING_MESSAGES[msgIndex % SEARCHING_MESSAGES.length]}\n\n🏷️ หัวข้อที่เลือก: **${topicLabel}**\n*(ระบบจะขยายการค้นหาอัตโนมัติใน 60 วินาที)*`,
        components: [cancelRow],
      });
      msgIndex++;
    } catch (_) { stopSearchInterval(userId); }
  }, SEARCH_CYCLE_MS);
  searchIntervals.set(userId, iv);
}


// ============================================================================
// HANDLER: CANCEL QUEUE
// ============================================================================
async function handleCancelQueue(interaction) {
  if (isAlreadyHandled(interaction.id)) return;
  markHandled(interaction.id);

  const userId = interaction.user.id;
  const idx    = queue.indexOf(userId);

  if (idx === -1) {
    return await safeReply(interaction, { content: "คุณไม่ได้อยู่ในคิวแล้วค่ะ" });
  }

  queue.splice(idx, 1);
  stopSearchInterval(userId);
  stopQueueDmTimer(userId);
  clearTopicState(userId);
  gameStreak.delete(userId);
  gameScore.delete(userId);
  queueJoinTimes.delete(userId);
  const qTimer = queueTimeoutTimers.get(userId);
  if (qTimer) { clearTimeout(qTimer); queueTimeoutTimers.delete(userId); }
  await updateLobbyEmbed();

  try {
    await interaction.update({ content: "❌ ยกเลิกคิวเรียบร้อยแล้วค่ะ", components: [] });
  } catch (err) {
    if (err.code !== 40060 && err.code !== 10003) console.error("[secret-chat] cancelQueue:", err);
  }
}

// ============================================================================
// HANDLER: LEAVE TABLE
// ============================================================================
async function handleLeaveTable(interaction) {
  if (isAlreadyHandled(interaction.id)) return;
  markHandled(interaction.id);

  const channelId = interaction.channelId;
  const members   = tableMembers.get(channelId);

  if (!members || !members.has(interaction.user.id))
    return await safeReply(interaction, { content: "ปุ่มนี้ใช้ได้เฉพาะคนที่อยู่โต๊ะนี้ค่ะ" });

  const reported = reportedByUsers.get(channelId);
  if (reported?.size > 0)
    return await safeReply(interaction, { content: "🚨 ไม่สามารถลุกจากโต๊ะได้เนื่องจากมีการแจ้งรีพอร์ต กรุณารอทีมงานค่ะ" });

  const startTime = sessionStartTimes.get(channelId);
  if (startTime && Date.now() - startTime < 60000) {
    const left = Math.ceil((60000 - (Date.now() - startTime)) / 1000);
    return await safeReply(interaction, {
      content: `⏳ ต้องนั่งคุยกันอย่างน้อย 1 นาทีก่อนนะคะ (รออีก ${left} วินาที)`
    });
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${CONFIRM_LEAVE_CUSTOM_ID}:${interaction.user.id}`)
      .setLabel("ยืนยันการลุกจากโต๊ะ")
      .setStyle(ButtonStyle.Danger)
  );

  try {
    await interaction.reply({ content: `<@${interaction.user.id}> ต้องการลุกออกจากโต๊ะจริง ๆ ใช่มั้ยคะ`, components: [row] });
  } catch (err) {
    if (err.code !== 40060 && err.code !== 10003) console.error("[secret-chat] leaveTable:", err);
  }
}

// ============================================================================
// HANDLER: CONFIRM LEAVE
// ============================================================================
async function handleConfirmLeave(interaction) {
  if (isAlreadyHandled(interaction.id)) return;
  markHandled(interaction.id);

  const [, targetUserId] = interaction.customId.split(":");
  if (interaction.user.id !== targetUserId)
    return await safeReply(interaction, { content: "ปุ่มนี้สำหรับคนที่กดลุกจากโต๊ะเท่านั้นค่ะ" });

  const channelId = interaction.channelId;
  const members   = tableMembers.get(channelId);
  if (!members)
    return await safeReply(interaction, { content: "โต๊ะนี้ถูกทำความสะอาดไปแล้วค่ะ" });

  try { await interaction.deferUpdate(); }
  catch (err) { if (err.code !== 40060) { console.error("[secret-chat] confirmLeave deferUpdate:", err); return; } }

  clearSessionTimers(channelId);
  const membersCopy = new Set(members);
  tableMembers.delete(channelId);
  for (const id of membersCopy) activeUsers.delete(id);

  await updateLobbyEmbed();

  try { await interaction.channel.delete(`Closed by ${interaction.user.id}`); }
  catch (err) { if (err.code !== 10003) console.error("[secret-chat] confirmLeave delete:", err); }
}

// ============================================================================
// HANDLER: EXTEND TIME (ข้อ 2)
// ============================================================================
async function handleExtendTime(interaction) {
  if (isAlreadyHandled(interaction.id)) return;
  markHandled(interaction.id);

  const channelId = interaction.channelId;
  const userId    = interaction.user.id;
  const members   = tableMembers.get(channelId);

  if (!members || !members.has(userId))
    return await safeReply(interaction, { content: "ปุ่มนี้ใช้ได้เฉพาะคนที่อยู่โต๊ะนี้ค่ะ" });

  const extendCount = sessionExtendCount.get(channelId) ?? 0;
  if (extendCount >= MAX_EXTENDS)
    return await safeReply(interaction, { content: "❌ ต่อเวลาได้สูงสุด 2 ครั้งต่อ session ค่ะ" });

  // Lock ปุ่มทันทีก่อน async — dedup แล้ว แต่ยิ่งดี
  try { await interaction.deferUpdate(); }
  catch (err) { if (err.code !== 40060) { console.error("[secret-chat] extendTime deferUpdate:", err); return; } }

  // ตัดแต้ม atomic ผ่าน Supabase RPC
  let deductOk = false;
  try {
    const { data, error } = await supabase.rpc("deduct_points_safe", {
      p_user_id: userId,
      p_amount:  EXTEND_COST_POINTS
    });
    // RPC ควร return { success: true } หรือ { success: false, reason: "..." }
    if (error) throw error;
    deductOk = data?.success === true;
  } catch (err) {
    console.error("[secret-chat] deduct_points_safe error:", err);
  }

  if (!deductOk) {
    try {
      await interaction.followUp({ content: "❌ แต้มไม่เพียงพอค่ะ (ต้องการ 50 แต้ม)", flags: 64 });
    } catch (_) {}
    return;
  }

  // ต่อเวลา
  const newCount  = extendCount + 1;
  sessionExtendCount.set(channelId, newCount);
  clearSessionTimers(channelId);

  const oldEnd = sessionEndTimes.get(channelId) ?? Date.now();
  const newEnd = oldEnd + EXTEND_DURATION_MS;
  sessionEndTimes.set(channelId, newEnd);

  const newEndUnix = Math.floor(newEnd / 1000);
  const canMore    = newCount < MAX_EXTENDS;

  const [uA, uB] = Array.from(members);
  setupSessionTimers(channelId, uA, uB, interaction.channel);

  // แจ้งเตือนในห้อง: ใครกดต่อเวลา หมดถึงกี่โมง
  try {
    const remainText = canMore
      ? `*(ต่อเวลาได้อีก ${MAX_EXTENDS - newCount} ครั้ง)*`
      : `*(ถึงขีดสูงสุดแล้ว ต่อเวลาไม่ได้อีกแล้วค่ะ)*`;

    await interaction.channel.send(
      `⏱️ **<@${userId}> กดต่อเวลาแล้วค่ะ!**\n` +
      `🕐 หมดเวลาใหม่: <t:${newEndUnix}:T> (<t:${newEndUnix}:R>)\n` +
      `💰 ใช้ 50 แต้ม | +3 นาที\n${remainText}`
    );
  } catch (_) {}

  // อัปเดตปุ่มในข้อความ action เดิม (ถ้ายังมี)
  const actionMsg = tableActionMessages.get(channelId);
  if (actionMsg) {
    try { await actionMsg.edit({ components: [buildTableActionRow(!canMore)] }); }
    catch (_) {}
  }
}

// ============================================================================
// HANDLER: REPORT USER
// ============================================================================
async function handleReportUser(interaction) {
  const channelId       = interaction.channelId;
  const reporterId      = interaction.user.id;
  const reporterUsername = interaction.user.username;
  const members         = tableMembers.get(channelId);

  if (!members || !members.has(reporterId))
    return await safeReply(interaction, { content: "ไม่สามารถดำเนินการได้" });

  const reportedSet = reportedByUsers.get(channelId) || new Set();
  if (reportedSet.has(reporterId))
    return await safeReply(interaction, { content: "⚠️ คุณได้แจ้งรีพอร์ตไปแล้วค่ะ" });

  reportedSet.add(reporterId);
  reportedByUsers.set(channelId, reportedSet);
  clearSessionTimers(channelId);

  await safeReply(interaction, { content: "⚠️ กำลังติดต่อทีมงาน รอสักครู่นะคะ..." });

  try {
    const actionMsg = tableActionMessages.get(channelId);
    if (actionMsg) {
      const disabled = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(LEAVE_TABLE_CUSTOM_ID).setLabel("🚪 ลุกจากโต๊ะ (ถูกระงับ)").setStyle(ButtonStyle.Danger).setDisabled(true),
        new ButtonBuilder().setCustomId(REPORT_USER_CUSTOM_ID).setLabel(`⚠️ แจ้งรีพอร์ตโดย ${reporterUsername}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(EXTEND_TIME_CUSTOM_ID).setLabel("⏱️ ต่อเวลา (ถูกระงับ)").setStyle(ButtonStyle.Primary).setDisabled(true)
      );
      await actionMsg.edit({ components: [disabled] });
    }
  } catch (e) { console.error("[secret-chat] disable report button:", e); }

  try {
    const staffCh = await interaction.client.channels.fetch(STAFF_ALERT_CHANNEL_ID);
    if (!staffCh) return;

    const embed = new EmbedBuilder()
      .setColor("#FF4444")
      .setTitle("🚨 พบการแจ้งปัญหาที่โซนสุ่มแชทคุย")
      .addFields(
        { name: "ห้องแชท", value: `<#${channelId}>`, inline: true },
        { name: "ผู้แจ้ง",  value: `<@${reporterId}>`, inline: true },
        { name: "สถานะ",    value: "⏳ รอทีมงานรับเคส", inline: true }
      )
      .setTimestamp();

    const claimRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${CLAIM_CASE_CUSTOM_ID}:${channelId}`).setLabel("✅ รับเคส").setStyle(ButtonStyle.Danger)
    );

    await staffCh.send({ content: `<@&1144701361448038512> พบการแจ้งปัญหาที่โซนสุ่มแชทคุย`, embeds: [embed], components: [claimRow] });
    await logEvent("report_sent", { channelId, userId: reporterId, guildId: interaction.guildId });
  } catch (err) { console.error("[secret-chat] handleReportUser:", err); }
}

// ============================================================================
// HANDLER: CLAIM CASE
// ============================================================================
async function handleClaimCase(interaction) {
  const channelId = interaction.customId.split(":")[1];
  const staffId   = interaction.user.id;

  if (claimedReports.has(channelId)) {
    return await safeReply(interaction, { content: `เคสนี้ถูกรับโดย <@${claimedReports.get(channelId)}> แล้วค่ะ` });
  }

  claimedReports.set(channelId, staffId);

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${CLAIM_CASE_CUSTOM_ID}:${channelId}`).setLabel(`✅ รับเคสโดย @${interaction.user.username}`).setStyle(ButtonStyle.Secondary).setDisabled(true)
  );

  try { await interaction.update({ components: [disabledRow] }); }
  catch (e) { await safeReply(interaction, { content: "รับเคสเรียบร้อยแล้วค่ะ" }); }

  await logEvent("report_claimed", { channelId, staffId, guildId: interaction.guildId });

  try {
    const chatCh = await interaction.client.channels.fetch(channelId);
    if (chatCh) {
      await chatCh.permissionOverwrites.create(staffId, {
        ViewChannel: true, SendMessages: true, ReadMessageHistory: true,
        ManageChannels: true, ManageMessages: true
      });
      await chatCh.send(`<@${staffId}> รับเรื่องเรียบร้อยค่ะ 🙏`);
    }
  } catch (err) { if (err.code !== 10003) console.error("[secret-chat] claimCase permission:", err); }
}

// ============================================================================
// HANDLER: SESSION RATING
// ============================================================================
async function handleRating(interaction) {
  if (isAlreadyHandled(interaction.id)) return;
  markHandled(interaction.id);

  const parts     = interaction.customId.split(":");
  const channelId = parts[1];
  const score     = parseInt(parts[2], 10); // 1=👎  3=😐  5=👍  0=label (disabled)
  const userId    = interaction.user.id;

  // ── Acknowledge ทันทีก่อน async ใดๆ เพื่อป้องกัน "interaction failed" ──
  try { await interaction.deferReply({ flags: 64 }); }
  catch (e) { if (e.code !== 10062) console.error("[secret-chat] rating deferReply:", e); return; }

  // ป้องกันปุ่ม label (score 0) เผื่อ client ส่งมา
  if (score === 0) {
    return await interaction.editReply({ content: "กดที่ 👍 😐 👎 นะคะ ☕" });
  }

  const submitted = ratingSubmitted.get(channelId);
  if (!submitted) {
    return await interaction.editReply({ content: "⏰ หมดเวลากด rating แล้วค่ะ ห้องกำลังจะถูกลบ" });
  }
  if (submitted.has(userId)) {
    return await interaction.editReply({ content: "คุณส่ง rating ไปแล้วนะคะ 😊 รออีกคนกดก่อนนะคะ" });
  }

  submitted.add(userId);

  // ── บันทึกคะแนนลง Supabase ──────────────────────────────────────────────
  try {
    await supabase.from("secret_chat_ratings").insert([{
      channel_id: channelId,
      user_id:    userId,
      score,
      rated_at:   new Date().toISOString(),
    }]);
  } catch (e) {
    console.error("[secret-chat] save rating:", e.message);
  }

  // ── ส่ง ephemeral แจ้งผู้ที่กด ──────────────────────────────────────────
  const label = score === 5 ? "👍 ดีมากค่ะ!" : score === 3 ? "😐 โอเคค่ะ" : "👎 รับทราบค่ะ";
  await interaction.editReply({
    content:
      `✅ รับ rating แล้วค่ะ: **${label}**\n` +
      (submitted.size < 2
        ? `⏳ รออีกคนให้คะแนนก่อนนะคะ ห้องจะถูกลบอัตโนมัติภายใน 30 วินาทีค่ะ`
        : `🚪 ขอบคุณทั้งคู่ค่ะ กำลังปิดห้องแล้วนะคะ...`)
  });

  // ── อัปเดตปุ่มในห้องให้แสดงจำนวนคนที่กดแล้ว ────────────────────────────
  try {
    const ratingCount = submitted.size;
    const disabledRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${RATING_CUSTOM_ID}:${channelId}:0`)
        .setLabel(`⭐ คุยโอเคไหม? (${ratingCount}/2 คนกดแล้ว)`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(true),
      new ButtonBuilder()
        .setCustomId(`${RATING_CUSTOM_ID}:${channelId}:5`)
        .setEmoji("👍")
        .setStyle(ButtonStyle.Success)
        .setDisabled(ratingCount >= 2),
      new ButtonBuilder()
        .setCustomId(`${RATING_CUSTOM_ID}:${channelId}:3`)
        .setEmoji("😐")
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(ratingCount >= 2),
      new ButtonBuilder()
        .setCustomId(`${RATING_CUSTOM_ID}:${channelId}:1`)
        .setEmoji("👎")
        .setStyle(ButtonStyle.Danger)
        .setDisabled(ratingCount >= 2)
    );
    // หา message ที่มีปุ่ม rating แล้ว edit
    const msgs = await interaction.channel.messages.fetch({ limit: 5 });
    const ratingMsg = msgs.find(m =>
      m.author.bot &&
      m.components?.length > 0 &&
      m.components[0]?.components?.some(c => c.customId?.startsWith(RATING_CUSTOM_ID))
    );
    if (ratingMsg) await ratingMsg.edit({ components: [disabledRow] });
  } catch (e) {
    if (e.code !== 10003 && e.code !== 10008) console.warn("[secret-chat] update rating buttons:", e.message);
  }

  // ── ถ้าทั้งสองคนกดครบ → แจ้งในห้องแล้วลบ ───────────────────────────────
  if (submitted.size >= 2) {
    const t = ratingTimeoutTimers.get(channelId);
    if (t) { clearTimeout(t); ratingTimeoutTimers.delete(channelId); }
    ratingSubmitted.delete(channelId);
    try {
      await interaction.channel.send("☕ **ขอบคุณทุกคนค่ะ!** กำลังปิดโต๊ะลับ...");
    } catch (_) {}
    // หน่วงเล็กน้อยให้ข้อความปรากฏก่อนลบห้อง
    setTimeout(async () => {
      try {
        const ch = await interaction.client.channels.fetch(channelId).catch(() => null);
        if (ch) await ch.delete("Both users rated — cleanup");
      } catch (e) {
        if (e.code !== 10003) console.warn("[secret-chat] rating both done delete:", e.message);
      }
    }, 2000);
  }
}

// ============================================================================
// MODULE SETUP
// ============================================================================
function setupSecretChat(client) {

  client.once(Events.ClientReady, async () => {
    await runCrashRecovery(client);
  });

  // คำสั่ง b!reset-match — สร้าง/รีเซ็ต lobby embed (ข้อ 4)
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;
    if (message.content.trim() !== "b!reset-match") return;

    try { await message.delete(); } catch (_) {}

    const embed = new EmbedBuilder()
      .setColor("#D2B48C")
      .setTitle("☕ โต๊ะลับฉบับ Bear Cafe")
      .setDescription("บรรยากาศคาเฟ่กำลังดีเลย...\nอยากหาใครสักคนมานั่งคุยด้วยไหมคะ?\n\nกดปุ่มด้านล่างเพื่อเข้าสู่ระบบสุ่มแชท ✨")
      .addFields(
        { name: "👥 กำลังเล่นอยู่", value: `${activeUsers.size} คน`, inline: true },
        { name: "⏳ รอในคิว",       value: `${queue.length} คน`,    inline: true },
        { name: "💬 ห้องที่เปิดอยู่", value: `${tableMembers.size} ห้อง`, inline: true }
      )
      .setFooter({ text: "อัปเดตอัตโนมัติ" })
      .setTimestamp();

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(JOIN_QUEUE_CUSTOM_ID).setLabel("☕ ค้นหาโต๊ะลับ").setStyle(ButtonStyle.Primary)
    );

    const sent = await message.channel.send({ embeds: [embed], components: [row] });
    lobbyEmbedMessage = sent; // เก็บไว้ edit ภายหลัง
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    // ── SelectMenu ────────────────────────────────────────────────────────────
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === TOPIC_SELECT_CUSTOM_ID) await handleTopicSelect(interaction);
      return;
    }

    if (!interaction.isButton()) return;

    if      (interaction.customId === JOIN_QUEUE_CUSTOM_ID)                           await handleJoinQueue(interaction);
    else if (interaction.customId === CANCEL_QUEUE_CUSTOM_ID)                         await handleCancelQueue(interaction);
    else if (interaction.customId === LEAVE_TABLE_CUSTOM_ID)                          await handleLeaveTable(interaction);
    else if (interaction.customId === EXTEND_TIME_CUSTOM_ID)                          await handleExtendTime(interaction);
    else if (interaction.customId === REPORT_USER_CUSTOM_ID)                          await handleReportUser(interaction);
    else if (interaction.customId.startsWith(CLAIM_CASE_CUSTOM_ID + ":"))             await handleClaimCase(interaction);
    else if (interaction.customId.startsWith(CONFIRM_LEAVE_CUSTOM_ID + ":"))          await handleConfirmLeave(interaction);
    else if (interaction.customId.startsWith(RATING_CUSTOM_ID + ":"))                 await handleRating(interaction);
    else if (interaction.customId.startsWith(GAME_ANSWER_CUSTOM_ID + ":"))            await handleGameAnswer(interaction);
  });

  client.on(Events.ChannelDelete, async (channel) => {
    const members = tableMembers.get(channel.id);
    if (!members) return;
    const [uA, uB] = Array.from(members);
    await logEvent("channel_deleted", {
      channelId: channel.id, userId: uA ?? null, partnerId: uB ?? null,
      metadata: { ended_by: "admin" }
    });
    clearSessionTimers(channel.id);
    for (const id of members) activeUsers.delete(id);
    tableMembers.delete(channel.id);
    tableActionMessages.delete(channel.id);
    reportedByUsers.delete(channel.id);
    claimedReports.delete(channel.id);
    sessionEndTimes.delete(channel.id);
    sessionExtendCount.delete(channel.id);
    await updateLobbyEmbed();
    console.log(`[secret-chat] GC: cleaned up deleted channel ${channel.id}`);
  });

  console.log("[secret-chat] Module loaded successfully");
}

module.exports = { setupSecretChat };
