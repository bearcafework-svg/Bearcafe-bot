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
const { safeDeleteChannel } = require("../../../utils/discordSafety");
const ws = require("ws");

// ============================================================================
// SYSTEM CONFIGURATION & CONSTANTS
// ============================================================================
const SECRET_CHAT_CATEGORY_ID = process.env.SECRET_CHAT_CATEGORY_ID;
const NOTIFY_CHANNEL_ID       = process.env.NOTIFY_CHANNEL_ID;
const SESSION_DURATION_MS     = 15 * 60 * 1000;
const WARNING_1MIN_MS         = SESSION_DURATION_MS - 60 * 1000;
const WARNING_30SEC_MS        = SESSION_DURATION_MS - 30 * 1000;
const EXTEND_COST_POINTS      = 150;
const EXTEND_DURATION_MS      = 3 * 60 * 1000;
const MAX_EXTENDS             = 2;
const PING_COOLDOWN_MS        = 30 * 60 * 1000;
const QUEUE_DM_KICK_MS        = 5 * 60 * 1000;
const IDLE_KICK_MS            = 2 * 60 * 1000;
const SEARCH_CYCLE_MS         = 5000;
const RATING_TIMEOUT_MS       = 30 * 1000;
const TOPIC_EXPAND_MS         = 60 * 1000;

const BLOCKED_ROLES           = ["1156930837573546126", "1156930842434752614"];
const STAFF_ALERT_CHANNEL_ID  = "1145314688800927744";

// ── ห้ามสุ่มเจอกัน ────────────────────────────────────────────────────────────
const BLOCKED_PAIRS = new Set([
  "689543352156553290", "977859922412834846", "892722756762877993",
  "1120581731846725753", "1322472990914383955", "1492835622271058103",
  "994159805025501186",
]);

// ── Custom IDs ────────────────────────────────────────────────────────────────
const JOIN_QUEUE_CUSTOM_ID    = "btn_join_queue";
const LEAVE_TABLE_CUSTOM_ID   = "btn_leave_table";
const REPORT_USER_CUSTOM_ID   = "btn_report_user";
const CONFIRM_LEAVE_CUSTOM_ID = "btn_confirm_leave";
const EXTEND_TIME_CUSTOM_ID   = "btn_extend_time";
const CANCEL_QUEUE_CUSTOM_ID  = "btn_cancel_queue";
const CLAIM_CASE_CUSTOM_ID    = "btn_claim_case";
const RATING_CUSTOM_ID        = "btn_rating";
const TOPIC_SELECT_CUSTOM_ID  = "sel_topic";

// ── Error messages ────────────────────────────────────────────────────────────
const ERR_NOT_TABLE_MEMBER = "ปุ่มนี้ใช้ได้เฉพาะคนที่อยู่โต๊ะนี้ค่ะ";
const ERR_MATCH_FAILED     = "เกิดปัญหาระหว่างสร้างโต๊ะแชทค่ะ ลองใหม่อีกครั้งนะคะ";

// ── Notify role & message ตาม topic ──────────────────────────────────────────
const TOPIC_NOTIFY = {
  chat:     { roles: ["1230902111072555119"], msg: "มีใครบางคนกำลังหาเพื่อนคุยแชทกับเขาด้วย หรือจะเป็นเธอรึป่าวนะ!" },
  consult:  { roles: ["1230902115036041280"], msg: "มีใครบางคนกำลังต้องคำปรึกษา ใครก็ได้ช่วยเขาด้วย ＞︿＜" },
  listen:   { roles: ["1230902119087734844"], msg: "มีใครบางคนกำลังรอรับฟังเรื่องราวของใครสักคนอยู่ เธอมาคุยกับเขาได้นะ (oﾟvﾟ)ノ" },
  student:  { roles: ["1465700608920256688"], msg: "มีใครบางคนกำลังต้องการคุยเรื่องวัยเรียน ใครวัยนี้มาแชร์กับเขาหน่อย ( •̀ ω •́ )✧" },
  worker:   { roles: ["1465700613064097855"], msg: "มีใครบางคนกำลังต้องการคุยเรื่องวัยทำงาน การโตนี่มันยากจริง ๆ มาแชร์กับเขาหน่อย ￣へ￣" },
  activity: { roles: ["1465700617832894737", "1465701219438690417"], msg: "มีใครบางคนกำลังอยากคุยเรื่องงานอดิเรก ต้องสนุกแน่ ๆ ✪ ω ✪" },
};

// ── Topic config ──────────────────────────────────────────────────────────────
// "chat" แมตช์ได้กับทุกคน (wildcard)
const TOPIC_MATCH_PRIORITY = {
  chat:     [null],
  consult:  ["listen", "consult", null],
  listen:   ["consult", "chat",   null],
  student:  ["student", null],
  worker:   ["worker",  null],
  activity: ["activity", null],
};

// ── ข้อความหมุนเวียน ──────────────────────────────────────────────────────────
const SEARCHING_MESSAGES = [
  "ยิ่งคุณอยู่ในคิวนานขึ้น โอกาสในการพบคู่สนทนาใหม่ก็ยิ่งเพิ่มขึ้นค่ะ",
  "หลายคนมักพบคู่สนทนาหลังจากรอเพียงไม่นาน ลองอยู่ต่ออีกสักครู่นะคะ",
  "ระบบยังคงค้นหาผู้ใช้ที่มีความสนใจใกล้เคียงกับคุณอยู่ค่ะ",
  "การรออีกเล็กน้อยอาจช่วยให้คุณได้พบคนที่คุยเรื่องเดียวกันได้อย่างสนุกมากขึ้น",
  "อาจมีใครบางคนกำลังกดเข้าคิวอยู่ในตอนนี้ก็ได้นะคะ",
];

const TOPIC_LABEL = {
  chat: "💬 คุยทั่วไป", consult: "🫂 ขอคำปรึกษา", listen: "🫶 ชอบรับฟัง",
  student: "📚 สังคมวัยเรียน", worker: "💼 สังคมวัยทำงาน", activity: "🎳 คุยเรื่องงานอดิเรก",
};

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
const sessionExtendCount  = new Map();
const sessionEndTimes     = new Map();
const handledInteractions = new Set();
const searchIntervals     = new Map();
const queueJoinTimes      = new Map();
const queueDmTimers       = new Map();
const idleKickTimers      = new Map();
const userSearchMsgToken  = new Map();
const ratingTimeoutTimers = new Map();
const ratingSubmitted     = new Map(); 
const ratingMembers       = new Map(); 
const ratingMsgRefs       = new Map(); 
const userTopics          = new Map();
const topicExpandTimers   = new Map();
const warningMessages     = new Map(); 

let lobbyEmbedMessage = null;
let lastPingTime      = 0;
let pingInFlight      = false;

// ============================================================================
// SUPABASE
// ============================================================================
if (!global.WebSocket) global.WebSocket = require("ws");

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

const ACTIVE_ROOMS_TABLE = "secret_chat_active_rooms";

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

function buildV2Welcome(userAId, userBId, endTimeUnix) {
  return {
    flags: 32768,
    components: [{
      type: 17,
      components: [
        { type: 14, spacing: 2 },
        { type: 10, content:
          `## <:bee20000:1256669436350562355>︲__\` 𝖲𝗎𝖼𝖼𝖾𝗌𝗌𝖿𝗎𝗅 𝗆𝖺𝗍𝖼𝗁 ₊ แมตช์สำเร็จ 𓂃 \`__\n` +
          `ยินดีต้อนรับ <@${userAId}> และ <@${userBId}> <:cuteplant:1152834055528783872>\n` +
          `- ระยะเวลาสนทนา 15 นาที (หมดเวลา: <t:${endTimeUnix}:R>)\n` +
          `- พบสมาชิกพฤติกรรมไม่เหมาะสมกดปุ่ม **แจ้งรีพอร์ต** เพื่อติดต่อทีมงานโดยตรง`
        },
        { type: 14, spacing: 2 },
        { type: 1, components: [
          { style: 4, type: 2, custom_id: LEAVE_TABLE_CUSTOM_ID, label: "ออกจากโต๊ะ" },
          { style: 1, type: 2, custom_id: REPORT_USER_CUSTOM_ID, label: "แจ้งรีพอร์ต" },
        ]},
      ]
    }]
  };
}

function buildV2Warning1Min(userAId, userBId, endTs, canExtend) {
  const buttons = [
    { style: 4, type: 2, custom_id: LEAVE_TABLE_CUSTOM_ID, label: "ออกจากโต๊ะ" },
    { style: 1, type: 2, custom_id: REPORT_USER_CUSTOM_ID, label: "แจ้งรีพอร์ต" },
  ];
  if (canExtend) {
    buttons.push({ style: 3, type: 2, custom_id: EXTEND_TIME_CUSTOM_ID, label: "ต่อเวลา +3 นาที (150 แต้ม)", emoji: { name: "⏰" } });
  }
  const bodyText = canExtend
    ? `คุณสามารถใช้ <:strawbear:1280194407014076447> **150** แต้มต่อเพื่อเวลาได้ +3 นาที <a:99322sparkles:1372427884479778908>`
    : `ต่อเวลาได้ครบ ${MAX_EXTENDS} ครั้งแล้วค่ะ ห้องจะปิดเมื่อหมดเวลา <a:99322sparkles:1372427884479778908>`;
  return {
    flags: 32768,
    components: [{
      type: 17,
      components: [
        { type: 14, spacing: 2 },
        { type: 10, content:
          `## <a:7596clock:1160230591892029510>︲__\` 𝖳𝗂𝗆𝖾 𝗅𝖾𝖿𝗍 ₊ เหลือเวลาอีก 1 นาที! 𓂃 \`__\n` +
          `-# <a:59217leaf:1512014878796152862> — ถึง: <@${userAId}> <@${userBId}>\n` +
          `สนทนากำลังสิ้นสุดภายในเวลา <t:${endTs}:R>\n${bodyText}`
        },
        { type: 14, spacing: 2 },
        { type: 1, components: buttons },
      ]
    }]
  };
}

function buildV2Warning30Sec(userAId, userBId, endTs) {
  return {
    flags: 32768,
    components: [{
      type: 17,
      components: [
        { type: 14, spacing: 2 },
        { type: 10, content:
          `## <a:7596clock:1160230591892029510>︲__\` 𝖮𝗎𝗍 𝗈𝖿 𝗍𝗂𝗆𝖾 ₊ เหลือเวลาอีก 30 วินาที! 𓂃 \`__\n` +
          `-# <a:59217leaf:1512014878796152862> — ถึง: <@${userAId}> <@${userBId}>\n` +
          `🗑️ ห้องนี้จะถูกลบโดยอัตโนมัติเวลา <t:${endTs}:T> เตรียมบอกลากันได้เลยนะคะ!`
        },
        { type: 14, spacing: 2 },
      ]
    }]
  };
}

function buildV2RatingPrompt(userAId, userBId) {
  return {
    flags: 32768,
    components: [{
      type: 17,
      components: [
        { type: 14, spacing: 2 },
        { type: 10, content:
          `## <a:7596clock:1160230591892029510>︲__\` 𝖮𝗎𝗍 𝗈𝖿 𝗍𝗂𝗆𝖾 ₊ หมดเวลาสนทนาแล้วค่ะ! 𓂃 \`__\n` +
          `-# <a:59217leaf:1512014878796152862> — ถึง: <@${userAId}> <@${userBId}>\n` +
          `ก่อนจากกัน **คุยครั้งนี้เป็นยังไงบ้างคะ?** (โหวตภายใน 30 วินาที)`
        },
        { type: 14, spacing: 2 },
        { type: 1, components: [
          { style: 3, type: 2, custom_id: `${RATING_CUSTOM_ID}:CHANNELID:5`, emoji: { id: "1310598361459462175", name: "95323thumbs", animated: false } },
          { style: 2, type: 2, custom_id: `${RATING_CUSTOM_ID}:CHANNELID:3`, emoji: { name: "😐" } },
          { style: 4, type: 2, custom_id: `${RATING_CUSTOM_ID}:CHANNELID:1`, emoji: { id: "1310598359152857199", name: "2531thumbsdown", animated: false } },
        ]},
      ]
    }]
  };
}

function injectChannelId(v2obj, channelId) {
  const str = JSON.stringify(v2obj).replace(/CHANNELID/g, channelId);
  return JSON.parse(str);
}

function buildV2ExtendConfirm(userId, newEndUnix, remainText) {
  return {
    flags: 32768,
    components: [{
      type: 17,
      components: [
        { type: 14, spacing: 2 },
        { type: 10, content:
          `## <:50121checkmark:1358584609087946867>︲<@${userId}> __\` กดต่อเวลาแล้วค่ะ! 𓂃 \`__\n\n` +
          `สนทนากำลังสิ้นสุดภายในเวลา <t:${newEndUnix}:R>\n` +
          `ใช้ <:strawbear:1280194407014076447> **-150 แต้ม** เพื่อต่อเวลา +3 นาที <a:99322sparkles:1372427884479778908>\n` +
          `*${remainText}*`
        },
        { type: 14, spacing: 2 },
      ]
    }]
  };
}

function buildV2Lobby() {
  return {
    flags: 32768,
    components: [{
      type: 17,
      components: [
        { type: 12, items: [{ media: { url: "https://cdn.discordapp.com/attachments/1144675871798591569/1513091311111241828/NewsBoard_-_bearcafe_14.png?ex=6a267798&is=6a252618&hm=6153e81758c050fa6e74fd917baa4b28e63acc91bf60cc8180d1e054fc3dee2d&" } }] },
        { type: 14, spacing: 2 },
        { type: 10, content:
          `## <a:3602exclamationmarkbubble:1372837492205555812>︲__\` 𝖬𝖺𝗄𝖾 𝖿𝗋𝗂𝖾𝗇𝖽𝗌 ₊ สุ่มแชทหาเพื่อนคุย 𓂃 \`__\n` +
          `-# บรรยากาศในคาเฟ่วันนี้กำลังดีเลยค่ะ  บางทีการได้คุยกับใครสักคน ไม่ว่าจะเรื่องเล็ก ๆ ในชีวิตหรือเรื่องที่อยากแบ่งปัน อาจทำให้ช่วงเวลานี้พิเศษขึ้นก็ได้นะคะ <:cuteplant:1152834055528783872>\n\n` +
          `# ***ระบบเปิดให้เล่นช่วง 18:00 - 23:00 ของทุกวัน*** <a:yellowhearts:1352954734394478643>\n`
        },
        { type: 14, spacing: 2 },
        { type: 1, components: [
          { style: 3, type: 2, label: "เริ่มสุ่มแชทหาเพื่อนคุย", custom_id: JOIN_QUEUE_CUSTOM_ID },
        ]},
      ]
    }]
  };
}

function buildV2TopicSelect() {
  return {
    flags: 32768,
    components: [{
      type: 17,
      components: [
        { type: 14, spacing: 2 },
        { type: 10, content:
          `## <a:bearg20:1396016014197657700>︲__\` วันนี้คุณอยากคุยเรื่องอะไรคะ? 𓂃 \`__\n` +
          `-# เลือกหัวข้อที่คุณสนใจไว้ก่อนเริ่มค้นหาคู่สนทนา เพื่อช่วยให้ระบบจับคู่กับผู้ใช้ที่มีความสนใจใกล้เคียงกัน และเพิ่มโอกาสในการเริ่มบทสนทนาที่ถูกใจมากยิ่งขึ้นค่ะ <:cuteplant:1152834055528783872>`
        },
        { type: 14, spacing: 2 },
        { type: 1, components: [{
          type: 3,
          custom_id: TOPIC_SELECT_CUSTOM_ID,
          placeholder: "💬︲เรื่องหัวข้อในการ \"สนทนา\"",
          min_values: 1, max_values: 1,
          options: [
            { label: "คุยทั่วไป",          value: "chat",     description: "แชทสนุก ๆ ทั่วไป ไม่มีเรื่องเฉพาะ",             emoji: { name: "💬" } },
            { label: "ขอคำปรึกษา",         value: "consult",  description: "อยากระบาย ขอคำแนะนำ หรือแค่มีคนรับฟัง",          emoji: { name: "🫂" } },
            { label: "ชอบรับฟัง",           value: "listen",   description: "อยากเป็นคนรับฟังและช่วยเหลือผู้อื่น",            emoji: { name: "🫶" } },
            { label: "สังคมวัยเรียน",        value: "student",  description: "คุยเรื่องการเรียน ชีวิตนักเรียน/นักศึกษา",       emoji: { name: "📚" } },
            { label: "สังคมวัยทำงาน",        value: "worker",   description: "คุยเรื่องงาน ชีวิตออฟฟิศ ความเครียด",            emoji: { name: "💼" } },
            { label: "คุยเรื่องงานอดิเรก",   value: "activity", description: "เกม งานอดิเรก กิจกรรมต่าง ๆ",                  emoji: { name: "🎳" } },
          ],
        }]},
      ]
    }]
  };
}

function buildV2Searching(topicLabel, msgText) {
  return {
    flags: 32768,
    components: [{
      type: 17,
      components: [
        { type: 14, spacing: 2 },
        { type: 10, content:
          `## <a:516185loading:1510390943172399195>︲__\` กำลังค้นหาเพื่อนให้คุณ . . . \`__\n` +
          `-# <a:59217leaf:1512014878796152862> — หัวข้อที่เลือก: **${topicLabel}**\n` +
          `### ${msgText} *!*\n` +
          `(หากยังไม่พบคู่สนทนาในหัวข้อที่เลือก ระบบจะค่อย ๆ ขยายการค้นหาไปยังหมวดอื่น เพื่อเพิ่มโอกาสในการพบเพื่อนใหม่ค่ะ) \n`
        },
        { type: 14, spacing: 2 },
        { type: 1, components: [
          { style: 4, type: 2, label: "ยกเลิกการหาเพื่อน", custom_id: CANCEL_QUEUE_CUSTOM_ID },
        ]},
      ]
    }]
  };
}

function buildV2MatchSuccess(channelId, guildId) {
  return {
    flags: 32768,
    components: [{
      type: 17,
      components: [
        { type: 14, spacing: 2 },
        { type: 10, content:
          `## <:50121checkmark:1358584609087946867>︲__\` 𝖲𝗎𝖼𝖼𝖾𝗌𝗌𝖿𝗎𝗅 𝗆𝖺𝗍𝖼𝗁 ₊ จับคู่สำเร็จ! 𓂃 \`__\n` +
          `โต๊ะแชทของคุณพร้อมแล้ว — กดปุ่มด้านล่างเพื่อเริ่มแชทได้เลยค่ะ <:cuteplant:1152834055528783872>\n` +
          `**ขอให้สนุกกับการสนทนานะคะ** <a:99322sparkles:1372427884479778908>`
        },
        { type: 14, spacing: 2 },
        { type: 1, components: [
          { type: 2, style: 5, label: "เริ่มสนทนา", url: `https://discord.com/channels/${guildId}/${channelId}` },
        ]},
      ]
    }]
  };
}

function buildV2NoMatch() {
  return {
    flags: 32768,
    components: [{
      type: 17,
      components: [
        { type: 14, spacing: 2 },
        { type: 10, content:
          `## <:68440x:1358584606911369226>︲__\` 𝖭𝗈 𝖬𝖺𝗍𝖼𝗁 ₊ ไม่พบคู่สนทนา 𓂃 \`__\n` +
          `ระบบนำคุณออกจากคิวอัตโนมัติแล้ว กรุณาตรวจสอบ DM จากบอทค่ะ <:cuteplant:1152834055528783872>`
        },
        { type: 14, spacing: 2 },
      ]
    }]
  };
}

function buildV2Notify(roleIds, msg) {
  const mention = roleIds.map(id => `<@&${id}>`).join(" ");
  return {
    flags: 32768,
    components: [{
      type: 17,
      components: [
        { type: 14, spacing: 1, divider: false },
        { type: 10, content:
          `## <a:3602exclamationmarkbubble:1372837492205555812>︲__\` 𝖭𝗈𝗍𝗂𝖼𝖾 ₊ แจ้งเตือนสุ่มหาเพื่อน 𓂃 \`__\n` +
          `-# <a:59217leaf:1512014878796152862> — ถึง: ${mention}\n` +
          `${msg}\n\n`
        },
        { type: 14, divider: true, spacing: 2 },
        { type: 1, components: [
          { type: 2, style: 5, label: "กดเพื่อไปสุ่มแชทคุย", url: "https://discord.com/channels/1144251788493602848/1507027734097039442" },
        ]},
      ]
    }]
  };
}

function buildV2DmNoMatch() {
  return {
    flags: 32768,
    components: [{
      type: 17,
      components: [
        { type: 14, spacing: 2 },
        { type: 10, content:
          `## <:68440x:1358584606911369226>︲__\` 𝖭𝗈 𝖬𝖺𝗍𝖼𝗁 ₊ ไม่พบคู่สนทนา 𓂃 \`__\n` +
          `ไม่พบผู้ใช้ที่พร้อมจับคู่ภายใน 5 นาที ระบบจึงนำคุณออกจากคิวอัตโนมัติค่ะ <:cuteplant:1152834055528783872>\n` +
          `**สามารถกดเข้าคิวใหม่ได้ทันที** เพื่อรอจับคู่กับผู้ใช้คนอื่น <a:99322sparkles:1372427884479778908>\n`
        },
        { type: 14, spacing: 2 },
        { type: 1, components: [
          { type: 2, style: 5, label: "สุ่มอีกครั้ง", url: "https://discord.com/channels/1144251788493602848/1507027734097039442" },
        ]},
      ]
    }]
  };
}

// ============================================================================
// OPERATING HOURS CHECK (18:00 – 23:00 Thailand Time / UTC+7)
// ============================================================================
function isWithinOperatingHours() {
  const now     = new Date();
  const thHour  = (now.getUTCHours() + 7) % 24;   // UTC+7
  // เปิด 18:00 ≤ hour < 23:00  (23:00 ตัดรับใหม่ แต่เซสชันที่แมตช์แล้วเล่นต่อได้)
  return thHour >= 18 && thHour < 23;
}

function buildV2OutsideHours() {
  return {
    flags: 32768 | 64, // IS_COMPONENTS_V2 + EPHEMERAL
    components: [{
      type: 17,
      components: [
        { type: 14, spacing: 2 },
        { type: 10, content:
          `## <a:3602exclamationmarkbubble:1372837492205555812>︲__\` ยังไม่ถึงเวลาเปิดให้บริการค่ะ 𓂃 \`__\n` +
          `-# <a:59217leaf:1512014878796152862> — ระบบสุ่มแชทหาเพื่อน\n\n` +
          `ขณะนี้ระบบยังไม่เปิดให้บริการค่ะ <:cuteplant:1152834055528783872>\n` +
          `**ระบบเปิดให้เล่นเฉพาะช่วง 18:00 – 23:00 น. (เวลาไทย)** <a:yellowhearts:1352954734394478643>\n\n` +
          `สามารถกลับมากดได้ใหม่ในช่วงเวลาดังกล่าวนะคะ <a:99322sparkles:1372427884479778908>`
        },
        { type: 14, spacing: 2 },
      ]
    }]
  };
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

function clearTopicState(userId) {
  userTopics.delete(userId);
  const t = topicExpandTimers.get(userId);
  if (t) { clearTimeout(t); topicExpandTimers.delete(userId); }
}

function cleanupQueueTimers(id) {
  stopSearchInterval(id);
  stopQueueDmTimer(id);
  clearTopicState(id);
  queueJoinTimes.delete(id);
}

function clearSessionState(channelId, userAId, userBId) {
  tableMembers.delete(channelId);
  removeActiveRoom(channelId).catch(() => {});
  sessionStartTimes.delete(channelId);
  sessionEndTimes.delete(channelId);
  sessionExtendCount.delete(channelId);
  tableActionMessages.delete(channelId);
  reportedByUsers.delete(channelId);
  claimedReports.delete(channelId);
  warningMessages.delete(channelId);
  ratingMembers.delete(channelId);
  activeUsers.delete(userAId);
  activeUsers.delete(userBId);
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

// [FIX] เพิ่มการครอบ String() และ .trim() ป้องกันปัญหาช่องว่างซ่อนตัว
function isBlockedPair(userAId, userBId) {
  const a = String(userAId).trim();
  const b = String(userBId).trim();
  return BLOCKED_PAIRS.has(a) && BLOCKED_PAIRS.has(b);
}

async function persistActiveRoom(channel, userAId, userBId, endTimeMs) {
  try {
    const { error } = await supabase.from(ACTIVE_ROOMS_TABLE).upsert({
      channel_id: channel.id,
      guild_id: channel.guild.id,
      user_a_id: userAId,
      user_b_id: userBId,
      started_at: new Date().toISOString(),
      end_at: new Date(endTimeMs).toISOString(),
      status: "active",
      updated_at: new Date().toISOString(),
    }, { onConflict: "channel_id" });
    if (error) console.error("[secret-chat] persist active room:", error.message);
  } catch (err) {
    console.error("[secret-chat] persist active room exception:", err.message);
  }
}

async function removeActiveRoom(channelId) {
  try {
    const { error } = await supabase
      .from(ACTIVE_ROOMS_TABLE)
      .delete()
      .eq("channel_id", channelId);
    if (error) console.error("[secret-chat] remove active room:", error.message);
  } catch (err) {
    console.error("[secret-chat] remove active room exception:", err.message);
  }
}

async function fetchActiveRooms() {
  try {
    const { data, error } = await supabase
      .from(ACTIVE_ROOMS_TABLE)
      .select("*")
      .eq("status", "active");
    if (error) {
      console.error("[secret-chat] fetch active rooms:", error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error("[secret-chat] fetch active rooms exception:", err.message);
    return [];
  }
}

// ============================================================================
// SAFE INTERACTION REPLY
// ============================================================================
async function safeReply(interaction, options) {
  try {
    if (interaction.deferred && !interaction.replied) {
      await interaction.editReply(options);
    } else if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ ...options, flags: 64 });
    } else {
      await interaction.reply({ ...options, flags: 64 });
    }
  } catch (err) {
    if (err.code !== 40060 && err.code !== 10062 && err.code !== 10003) {
      console.error("[secret-chat] safeReply error:", err);
    }
  }
}

async function safeDeferReply(interaction) {
  if (interaction.replied || interaction.deferred) return true;
  try {
    await interaction.deferReply({ flags: 64 });
    return true;
  } catch (err) {
    if (err.code !== 40060 && err.code !== 10062 && err.code !== 10003) {
      console.error("[secret-chat] deferReply error:", err);
    }
    return false;
  }
}

// ============================================================================
// DM HELPERS
// ============================================================================
async function checkDmOpen(user) {
  try {
    const dm = await user.createDM();
    const testMsg = await dm.send({ content: "\u200b" });
    await testMsg.delete().catch(() => {});
    return true;
  } catch (err) {
    return false;
  }
}

async function sendMatchDm(client, userId, channelId, guildId) {
  try {
    const user = await client.users.fetch(userId);
    await user.send(buildV2MatchSuccess(channelId, guildId));
  } catch (err) {
    console.warn(`[secret-chat] sendMatchDm failed for ${userId}:`, err.message);
  }
}

async function sendQueueTimeoutDm(client, userId) {
  try {
    const user = await client.users.fetch(userId);
    await user.send(buildV2DmNoMatch());
  } catch (err) {
    console.warn(`[secret-chat] sendQueueTimeoutDm failed for ${userId}:`, err.message);
  }
}

// ============================================================================
// TOPIC HELPERS
// ============================================================================
function findMatchByTopic(userId, forceWildcard = false) {
  const myTopic    = userTopics.get(userId) ?? "chat";
  const priorities = forceWildcard ? [null] : (TOPIC_MATCH_PRIORITY[myTopic] ?? [null]);

  for (const wantTopic of priorities) {
    const idx = queue.findIndex(id => {
      if (id === userId) return false;
      const last = recentMatches.get(`${userId}-${id}`);
      if (last && Date.now() - last < 300000) return false;
      if (isBlockedPair(userId, id)) return false;
      if (wantTopic === null) return true;
      return (userTopics.get(id) ?? "chat") === wantTopic;
    });
    if (idx !== -1) return idx;
  }
  return -1;
}

// ============================================================================
// LOBBY UPDATE (Component v2)
// ============================================================================
async function updateLobbyEmbed() {
  if (!lobbyEmbedMessage) return;
  try {
    await lobbyEmbedMessage.edit(buildV2Lobby());
  } catch (err) {
    if (err.code !== 10003 && err.code !== 10008) {
      console.error("[secret-chat] updateLobbyEmbed error:", err.message);
    }
  }
}

// ============================================================================
// PING ROLE NOTIFICATION (Component v2, ตาม topic)
// ============================================================================
async function sendQueuePingNotification(client, topic) {
  if (!NOTIFY_CHANNEL_ID) return;
  const now = Date.now();
  if (pingInFlight || now - lastPingTime < PING_COOLDOWN_MS) return;
  pingInFlight = true;
  lastPingTime = now;
  try {
    const ch = await client.channels.fetch(NOTIFY_CHANNEL_ID);
    if (!ch) return;
    const notify = TOPIC_NOTIFY[topic] ?? TOPIC_NOTIFY["chat"];
    await ch.send(buildV2Notify(notify.roles, notify.msg));
  } catch (err) {
    console.error("[secret-chat] sendQueuePingNotification error:", err.message);
    lastPingTime = 0;
  } finally {
    pingInFlight = false;
  }
}

// ============================================================================
// SESSION TIMERS
// ============================================================================
function setupSessionTimers(channelId, userAId, userBId, channel) {
  const endTime   = sessionEndTimes.get(channelId) ?? Date.now() + SESSION_DURATION_MS;
  const remaining = endTime - Date.now();

  if (remaining <= 0) {
    cleanupSession(channelId, userAId, userBId, channel);
    return;
  }

  const warn1Left  = remaining - 60000;
  const warn30Left = remaining - 30000;

  const timerData = {
    warning1m: setTimeout(async () => {
      if (!tableMembers.has(channelId)) return;
      const extendCount = sessionExtendCount.get(channelId) ?? 0;
      const canExtend   = extendCount < MAX_EXTENDS;
      const endTs       = Math.floor((sessionEndTimes.get(channelId) ?? Date.now()) / 1000);
      try {
        const msg = await channel.send(buildV2Warning1Min(userAId, userBId, endTs, canExtend));
        warningMessages.set(channelId, msg);
      } catch (e) { if (e.code !== 10003) console.error("[secret-chat] 1min warning:", e.message); }
    }, warn1Left > 0 ? warn1Left : 1),

    warning30s: setTimeout(async () => {
      if (!tableMembers.has(channelId)) return;
      const endTs = Math.floor((sessionEndTimes.get(channelId) ?? Date.now()) / 1000);
      try {
        await channel.send(buildV2Warning30Sec(userAId, userBId, endTs));
      } catch (e) { if (e.code !== 10003) console.error("[secret-chat] 30s warning:", e.message); }
    }, warn30Left > 0 ? warn30Left : 1),

    termination: setTimeout(async () => {
      if (!tableMembers.has(channelId)) return;
      sessionTimers.delete(channelId);
      await endSessionWithRating(channelId, userAId, userBId, channel, "timeout");
    }, remaining),
  };

  sessionTimers.set(channelId, timerData);
}

// ============================================================================
// SESSION CLEANUP
// ============================================================================
async function endSessionWithRating(channelId, userAId, userBId, channel, endedBy = "timeout") {
  const startTime = sessionStartTimes.get(channelId);
  const idleT = idleKickTimers.get(channelId);
  if (idleT) { clearTimeout(idleT); idleKickTimers.delete(channelId); }

  clearSessionState(channelId, userAId, userBId);
  await updateLobbyEmbed();

  if (!channel) return;

  const durationMs = Date.now() - (startTime ?? Date.now());
  await logEvent("session_end", {
    channelId, userId: userAId, partnerId: userBId,
    metadata: { duration_seconds: Math.round(durationMs / 1000), ended_by: endedBy }
  });

  if (endedBy === "idle") {
    await safeDeleteChannel(channel, "Idle kick - no rating");
    return;
  }

  try {
    await Promise.all([
      channel.permissionOverwrites.edit(userAId, { SendMessages: false }),
      channel.permissionOverwrites.edit(userBId, { SendMessages: false }),
    ]);
  } catch (e) {
    if (e.code !== 10003) console.warn("[secret-chat] lock perms:", e.message);
  }

  ratingSubmitted.set(channelId, new Set());
  ratingMembers.set(channelId, [userAId, userBId]);
  const ratingPayload = injectChannelId(buildV2RatingPrompt(userAId, userBId), channelId);

  try {
    const ratingMsg = await channel.send(ratingPayload);
    ratingMsgRefs.set(channelId, ratingMsg);
  } catch (e) {
    if (e.code !== 10003) console.error("[secret-chat] rating prompt send:", e.message);
    await safeDeleteChannel(channel, "Rating prompt failed - auto cleanup");
    return;
  }

  const t = setTimeout(async () => {
    ratingTimeoutTimers.delete(channelId);
    ratingSubmitted.delete(channelId);
    ratingMembers.delete(channelId);
    ratingMsgRefs.delete(channelId);
    try { await safeDeleteChannel(channel, "Rating timeout - auto cleanup"); }
    catch (e) { if (e.code !== 10003) console.warn("[secret-chat] rating timeout delete:", e.message); }
  }, RATING_TIMEOUT_MS);
  ratingTimeoutTimers.set(channelId, t);
}

async function cleanupSession(channelId, userAId, userBId, channel, endedBy = "manual") {
  const startTime = sessionStartTimes.get(channelId);
  const idleT = idleKickTimers.get(channelId);
  if (idleT) { clearTimeout(idleT); idleKickTimers.delete(channelId); }
  const ratingT = ratingTimeoutTimers.get(channelId);
  if (ratingT) { clearTimeout(ratingT); ratingTimeoutTimers.delete(channelId); }
  ratingSubmitted.delete(channelId);
  ratingMembers.delete(channelId);
  ratingMsgRefs.delete(channelId);

  clearSessionState(channelId, userAId, userBId);
  await updateLobbyEmbed();

  if (!channel) return;

  const durationMs = Date.now() - (startTime ?? Date.now());
  await logEvent("session_end", {
    channelId, userId: userAId, partnerId: userBId,
    metadata: { duration_seconds: Math.round(durationMs / 1000), ended_by: endedBy }
  });

  try { await safeDeleteChannel(channel, "Session closed"); }
  catch (e) { if (e.code !== 10003) console.warn("[secret-chat] channel delete:", e.message); }
}

// ============================================================================
// ORPHAN RECOVERY
// ============================================================================
async function runCrashRecovery(client) {
  if (!SECRET_CHAT_CATEGORY_ID) return;
  await new Promise(r => setTimeout(r, 3000));
  try {
    const persistedRooms = await fetchActiveRooms();
    const persistedChannelIds = new Set();
    let restored = 0;

    for (const row of persistedRooms) {
      const guild = client.guilds.cache.get(row.guild_id);
      if (!guild) continue;

      const ch = await guild.channels.fetch(row.channel_id).catch(() => null);
      if (!ch || ch.parentId !== SECRET_CHAT_CATEGORY_ID) {
        await removeActiveRoom(row.channel_id);
        continue;
      }

      const userAId = row.user_a_id;
      const userBId = row.user_b_id;
      if (!userAId || !userBId) continue;

      persistedChannelIds.add(ch.id);
      tableMembers.set(ch.id, new Set([userAId, userBId]));
      activeUsers.add(userAId);
      activeUsers.add(userBId);

      const endAt = row.end_at ? new Date(row.end_at).getTime() : NaN;
      const recoveredEnd = Number.isFinite(endAt)
        ? Math.max(endAt, Date.now() + 60 * 1000)
        : Date.now() + SESSION_DURATION_MS;
      sessionEndTimes.set(ch.id, recoveredEnd);
      sessionExtendCount.set(ch.id, 0);
      sessionStartTimes.set(ch.id, row.started_at ? new Date(row.started_at).getTime() : Date.now());
      reportedByUsers.set(ch.id, new Set());
      setupSessionTimers(ch.id, userAId, userBId, ch);
      restored++;
    }

    let purged = 0;
    let preserved = 0;
    for (const guild of client.guilds.cache.values()) {
      await guild.channels.fetch().catch(() => {});
      const category = guild.channels.cache.get(SECRET_CHAT_CATEGORY_ID);
      if (!category) continue;
      for (const [, ch] of category.children.cache.filter(c => c.name.includes("☕︰โต๊ะแชท-"))) {
        if (tableMembers.has(ch.id) || persistedChannelIds.has(ch.id)) continue;
        const memberOverwrites = ch.permissionOverwrites.cache.filter((overwrite) => (
          overwrite.type === 1 &&
          overwrite.allow.has(PermissionFlagsBits.ViewChannel)
        ));
        if (memberOverwrites.size >= 2) {
          preserved++;
          continue;
        }
        try {
          await safeDeleteChannel(ch, "Orphan cleanup post-restart");
          purged++;
        } catch (e) {
          console.warn(`[secret-chat] Recovery: failed to delete ${ch.name}:`, e.message);
        }
      }
    }
    console.log(`[secret-chat] Recovery complete — purged ${purged} orphan room(s)`);
    await updateLobbyEmbed();
    console.log(`[secret-chat] Recovery restored ${restored}, preserved ${preserved}, purged ${purged} orphan room(s)`);
  } catch (err) { console.error("[secret-chat] Recovery failed:", err); }
}

// ============================================================================
// CREATE CHANNEL
// ============================================================================
async function createSecretChatChannel(guild, userAId, userBId) {
  const category = guild.channels.cache.get(SECRET_CHAT_CATEGORY_ID);
  if (!category) throw new Error("SECRET_CHAT_CATEGORY_NOT_FOUND");

  const suffix  = crypto.randomBytes(2).toString("hex");
  const channel = await guild.channels.create({
    name: `☕︰โต๊ะแชท-${suffix}`,
    type: ChannelType.GuildText,
    parent: SECRET_CHAT_CATEGORY_ID,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionFlagsBits.ViewChannel] },
      { id: userAId, allow: buildAllowedPermissions() },
      { id: userBId, allow: buildAllowedPermissions() },
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
  await persistActiveRoom(channel, userAId, userBId, endTime);

  const sentMsg = await channel.send(buildV2Welcome(userAId, userBId, endTimeUnix));
  tableActionMessages.set(channel.id, sentMsg);
  reportedByUsers.set(channel.id, new Set());

  setupSessionTimers(channel.id, userAId, userBId, channel);
  sessionStartTimes.set(channel.id, Date.now());

  const scheduleIdleKick = () => {
    const existing = idleKickTimers.get(channel.id);
    if (existing) clearTimeout(existing);
    const t = setTimeout(async () => {
      if (!tableMembers.has(channel.id)) return;
      idleKickTimers.delete(channel.id);
      clearSessionTimers(channel.id);
      
      // [FIX] สั่งหยุดฟัง Event ทันทีเพื่อป้องกัน Memory Leak
      channel.client.off("messageCreate", idleResetListener);
      
      await endSessionWithRating(channel.id, userAId, userBId, channel, "idle");
    }, IDLE_KICK_MS);
    idleKickTimers.set(channel.id, t);
  };
  scheduleIdleKick();

  const idleResetListener = (msg) => {
    if (msg.channelId !== channel.id) return;
    if (msg.author.bot) return;
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
      metadata:   data.metadata  ?? {},
    }]);
    if (error) console.error("[secret-chat] logEvent error:", error.message);
  } catch (err) { console.error("[secret-chat] logEvent exception:", err.message); }
}

// ============================================================================
// HANDLER: JOIN QUEUE
// ============================================================================
async function handleJoinQueue(interaction) {
  if (isAlreadyHandled(interaction.id)) return;
  markHandled(interaction.id);

  const userId = interaction.user.id;

  if (!(await safeDeferReply(interaction))) return;

  // [FIX] ตรวจสอบช่วงเวลาเปิดให้บริการ (18:00 – 23:00 เวลาไทย)
  if (!isWithinOperatingHours()) {
    return await interaction.editReply(buildV2OutsideHours());
  }

  if (interaction.member?.roles) {
    const hasBlocked = BLOCKED_ROLES.some(r => interaction.member.roles.cache.has(r));
    if (hasBlocked) return await interaction.editReply({ content: "ขออภัยค่ะ สิทธิ์ของคุณไม่สามารถใช้งานระบบนี้ได้ในขณะนี้" });
  }

  if (isUserBusy(userId)) return await interaction.editReply({ content: "ตอนนี้คุณอยู่ในคิวหรือกำลังนั่งโต๊ะอยู่แล้วนะคะ ☕" });
  if (checkSpamRateLimit(userId)) return await interaction.editReply({ content: "คุณทำรายการบ่อยเกินไป กรุณารอสักครู่แล้วลองใหม่ค่ะ ⏳" });

  const dmOpen = await checkDmOpen(interaction.user);
  if (!dmOpen) {
    return await interaction.editReply({
      content:
        "📩 **กรุณาเปิดรับ DM ก่อนใช้งานนะคะ!**\n\n" +
        "ระบบจำเป็นต้องส่ง DM เพื่อแจ้งเตือนเมื่อจับคู่สำเร็จค่ะ\n\n" +
        "**วิธีเปิด DM:**\n" +
        "⚙️ Settings → Privacy & Safety → Allow direct messages from server members ✅"
    });
  }

  const presence = interaction.guild?.members?.cache.get(userId)?.presence;
  if ((presence?.status ?? "offline") === "dnd") {
    return await interaction.editReply({
      content:
        "🔴 ตอนนี้คุณเปิดสถานะ **ห้ามรบกวน (DND)** อยู่ค่ะ\n" +
        "✅ **กรุณาเปลี่ยนสถานะเป็น Online แล้วกดใหม่อีกครั้งนะคะ**"
    });
  }

  await interaction.editReply(buildV2TopicSelect());
  userSearchMsgToken.set(userId, interaction);
}

// ============================================================================
// HANDLER: TOPIC SELECT
// ============================================================================
async function handleTopicSelect(interaction) {
  if (isAlreadyHandled(interaction.id)) return;
  markHandled(interaction.id);

  const userId = interaction.user.id;
  const topic  = interaction.values[0];

  try { await interaction.deferUpdate(); } catch (e) { return; }

  if (isUserBusy(userId)) {
    try { await interaction.editReply({ content: "ตอนนี้คุณอยู่ในคิวหรือกำลังนั่งโต๊ะอยู่แล้วนะคะ ☕", components: [] }); } catch (_) {}
    return;
  }

  userTopics.set(userId, topic);

  async function doMatch(waitingUserId, newUserId, newInteraction) {
    const waitInt = userSearchMsgToken.get(waitingUserId);
    cleanupQueueTimers(waitingUserId);
    cleanupQueueTimers(newUserId);
    try {
      const channel    = await createSecretChatChannel(interaction.guild, waitingUserId, newUserId);
      const matchPayload = buildV2MatchSuccess(channel.id, interaction.guildId);
      if (waitInt) { try { await waitInt.editReply(matchPayload); } catch (_) {} }
      try { await newInteraction.editReply(matchPayload); } catch (_) {}
      await Promise.allSettled([
        sendMatchDm(interaction.client, waitingUserId, channel.id, interaction.guildId),
        sendMatchDm(interaction.client, newUserId,     channel.id, interaction.guildId),
      ]);
    } catch (err) {
      console.error("[secret-chat] create room error:", err);
      activeUsers.delete(waitingUserId);
      activeUsers.delete(newUserId);
      try { await newInteraction.editReply({ content: ERR_MATCH_FAILED, components: [] }); } catch (_) {}
      
      // [FIX] เพิ่มการแจ้งเตือนกลับไปยังคนที่รออยู่ในคิว ไม่ให้ค้างเป็นผี
      if (waitInt) {
        try { await waitInt.editReply({ content: ERR_MATCH_FAILED, components: [] }); } catch (_) {}
      }
    }
  }

  const partnerIndex = findMatchByTopic(userId, false);
  if (partnerIndex !== -1) {
    const [waitingUserId] = queue.splice(partnerIndex, 1);
    await doMatch(waitingUserId, userId, interaction);
    return;
  }

  queue.push(userId);
  queueJoinTimes.set(userId, Date.now());
  console.log(`[secret-chat] ${userId} joined queue (topic: ${topic}). Total: ${queue.length}`);

  let expandFired = false;
  const expandTimer = setTimeout(async () => {
    if (expandFired || !queue.includes(userId)) return;
    const expandIdx = findMatchByTopic(userId, true);
    if (expandIdx === -1) return;
    expandFired = true;
    topicExpandTimers.delete(userId);
    const [waitingUserId] = queue.splice(expandIdx, 1);
    const myIdx = queue.indexOf(userId);
    if (myIdx !== -1) queue.splice(myIdx, 1);
    stopQueueDmTimer(userId);
    stopQueueDmTimer(waitingUserId);
    await doMatch(waitingUserId, userId, interaction);
  }, TOPIC_EXPAND_MS);
  topicExpandTimers.set(userId, expandTimer);

  const dmKickTimer = setTimeout(async () => {
    if (expandFired) return;
    const stillInQueue = queue.indexOf(userId);
    if (stillInQueue === -1) return;
    queue.splice(stillInQueue, 1);
    cleanupQueueTimers(userId);
    await updateLobbyEmbed();
    await sendQueueTimeoutDm(interaction.client, userId);
    try { await interaction.editReply(buildV2NoMatch()); } catch (_) {}
  }, QUEUE_DM_KICK_MS);
  queueDmTimers.set(userId, dmKickTimer);

  await sendQueuePingNotification(interaction.client, topic);
  await updateLobbyEmbed();

  userSearchMsgToken.set(userId, interaction);

  const topicLabel = TOPIC_LABEL[topic] ?? topic;
  await interaction.editReply(buildV2Searching(topicLabel, SEARCHING_MESSAGES[0]));

  let msgIndex = 1;
  const iv = setInterval(async () => {
    if (!queue.includes(userId)) { stopSearchInterval(userId); return; }
    try {
      await interaction.editReply(buildV2Searching(topicLabel, SEARCHING_MESSAGES[msgIndex % SEARCHING_MESSAGES.length]));
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

  try { await interaction.deferUpdate(); }
  catch (err) {
    if (err.code !== 40060 && err.code !== 10062) console.error("[secret-chat] cancelQueue deferUpdate:", err);
    return;
  }

  const userId = interaction.user.id;
  const idx    = queue.indexOf(userId);

  if (idx === -1) {
    return await interaction.followUp({ content: "คุณไม่ได้อยู่ในคิวแล้วค่ะ", flags: 64 }).catch(() => {});
  }

  queue.splice(idx, 1);
  cleanupQueueTimers(userId);
  await updateLobbyEmbed();

  try {
    // เปลี่ยนมาใช้ Component V2 Structure แทนการส่ง content ปกติ
    await interaction.editReply({
      flags: 32768,
      components: [{
        type: 17,
        components: [
          { type: 14, spacing: 2 },
          { 
            type: 10, 
            content: 
              `## ❌︲__\` ยกเลิกการค้นหาเรียบร้อยแล้วค่ะ \`__\n` +
              `-# ระบบนำคุณออกจากคิวแล้ว สามารถกดเริ่มหาใหม่ได้ทุกเมื่อนะคะ <:cuteplant:1152834055528783872>`
          },
          { type: 14, spacing: 2 }
        ]
      }]
    });
  } catch (err) {
    if (err.code !== 40060 && err.code !== 10062 && err.code !== 10003) console.error("[secret-chat] cancelQueue:", err);
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
    return await safeReply(interaction, { content: ERR_NOT_TABLE_MEMBER });

  const reported = reportedByUsers.get(channelId);
  if (reported?.size > 0)
    return await safeReply(interaction, { content: "🚨 ไม่สามารถออกจากโต๊ะได้เนื่องจากมีการแจ้งรีพอร์ต กรุณารอทีมงานค่ะ" });

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
      .setLabel("ยืนยันออกจากโต๊ะ")
      .setStyle(ButtonStyle.Danger)
  );

  await safeReply(interaction, { content: `<@${interaction.user.id}> ต้องการออกจากโต๊ะจริง ๆ ใช่มั้ยคะ`, components: [row] });
}

// ============================================================================
// HANDLER: CONFIRM LEAVE
// ============================================================================
async function handleConfirmLeave(interaction) {
  if (isAlreadyHandled(interaction.id)) return;
  markHandled(interaction.id);

  const [, targetUserId] = interaction.customId.split(":");
  if (interaction.user.id !== targetUserId)
    return await safeReply(interaction, { content: "ปุ่มนี้สำหรับคนที่กดออกจากโต๊ะเท่านั้นค่ะ" });

  const channelId = interaction.channelId;
  const members   = tableMembers.get(channelId);
  if (!members)
    return await safeReply(interaction, { content: "โต๊ะนี้ถูกทำความสะอาดไปแล้วค่ะ" });

  try { await interaction.deferUpdate(); }
  catch (err) { if (err.code !== 40060) { console.error("[secret-chat] confirmLeave deferUpdate:", err); return; } }

  clearSessionTimers(channelId);
  const membersCopy = new Set(members);
  tableMembers.delete(channelId);
  await removeActiveRoom(channelId);
  for (const id of membersCopy) activeUsers.delete(id);

  await updateLobbyEmbed();

  try { await safeDeleteChannel(interaction.channel, `Closed by ${interaction.user.id}`); }
  catch (err) { if (err.code !== 10003) console.error("[secret-chat] confirmLeave delete:", err); }
}

// ============================================================================
// HANDLER: EXTEND TIME
// ============================================================================
async function handleExtendTime(interaction) {
  if (isAlreadyHandled(interaction.id)) return;
  markHandled(interaction.id);

  const channelId = interaction.channelId;
  const userId    = interaction.user.id;
  const members   = tableMembers.get(channelId);

  if (!members || !members.has(userId))
    return await safeReply(interaction, { content: ERR_NOT_TABLE_MEMBER });

  const extendCount = sessionExtendCount.get(channelId) ?? 0;
  if (extendCount >= MAX_EXTENDS)
    return await safeReply(interaction, { content: "❌ ต่อเวลาได้สูงสุด 2 ครั้งต่อ session ค่ะ" });

  try { await interaction.deferUpdate(); }
  catch (err) { if (err.code !== 40060) { console.error("[secret-chat] extendTime deferUpdate:", err); return; } }

  let deductOk = false;
  try {
    const { data, error } = await supabase.rpc("deduct_points_safe", {
      p_user_id: userId,
      p_amount:  EXTEND_COST_POINTS,
    });
    if (error) throw error;
    deductOk = data?.success === true;
  } catch (err) {
    console.error("[secret-chat] deduct_points_safe error:", err);
  }

  if (!deductOk) {
    try {
      await interaction.followUp({ content: `❌ แต้มไม่เพียงพอค่ะ (ต้องการ ${EXTEND_COST_POINTS} แต้ม)`, flags: 64 });
    } catch (_) {}
    return;
  }

  const newCount = extendCount + 1;
  sessionExtendCount.set(channelId, newCount);
  clearSessionTimers(channelId);

  const oldEnd = sessionEndTimes.get(channelId) ?? Date.now();
  const newEnd = oldEnd + EXTEND_DURATION_MS;
  sessionEndTimes.set(channelId, newEnd);
  const newEndUnix = Math.floor(newEnd / 1000);
  const canMore    = newCount < MAX_EXTENDS;

  const [uA, uB] = Array.from(members);
  setupSessionTimers(channelId, uA, uB, interaction.channel);

  const prevWarn = warningMessages.get(channelId);
  if (prevWarn) {
    try { await prevWarn.delete(); } catch (_) {}
    warningMessages.delete(channelId);
  }

  const remainText = canMore
    ? `ต่อเวลาได้อีก ${MAX_EXTENDS - newCount} ครั้ง`
    : `ถึงขีดสูงสุดแล้ว ต่อเวลาไม่ได้อีกแล้วค่ะ`;

  try {
    await interaction.channel.send(buildV2ExtendConfirm(userId, newEndUnix, remainText));
  } catch (_) {}
}

// ============================================================================
// HANDLER: REPORT USER
// ============================================================================
async function handleReportUser(interaction) {
  const channelId        = interaction.channelId;
  const reporterId       = interaction.user.id;
  const reporterUsername = interaction.user.username;
  const members          = tableMembers.get(channelId);

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
        new ButtonBuilder().setCustomId(LEAVE_TABLE_CUSTOM_ID).setLabel("ออกจากโต๊ะ (ถูกระงับ)").setStyle(ButtonStyle.Danger).setDisabled(true),
        new ButtonBuilder().setCustomId(REPORT_USER_CUSTOM_ID).setLabel(`แจ้งรีพอร์ตโดย ${reporterUsername}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
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
        { name: "ห้องแชท", value: `<#${channelId}>`,  inline: true },
        { name: "ผู้แจ้ง",  value: `<@${reporterId}>`, inline: true },
        { name: "สถานะ",    value: "⏳ รอทีมงานรับเคส", inline: true }
      )
      .setTimestamp();

    const claimRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`${CLAIM_CASE_CUSTOM_ID}:${channelId}`).setLabel("✅ รับเคส").setStyle(ButtonStyle.Danger)
    );

    await staffCh.send({ content: `<@&1144701361448038512> พบการแจ้งปัญหาที่โซนสุ่มแชทคุย`, embeds: [embed], components: [claimRow] });
    await logEvent("report_sent", { channelId, userId: reporterId });

    // [FIX] ระบบจับเวลาปิดห้องฉุกเฉิน: หากผ่านไป 10 นาทีแล้วยังไม่มีแอดมินกดรับเคส ให้ลบห้องทิ้งทันที
    setTimeout(async () => {
      // ตรวจสอบว่าห้องยังอยู่และยังไม่ถูกกดรับเคส
      if (tableMembers.has(channelId) && !claimedReports.has(channelId)) {
        const currentMembers = tableMembers.get(channelId);
        const [uA, uB] = Array.from(currentMembers);
        await cleanupSession(channelId, uA, uB, interaction.channel, "report_timeout");
      }
    }, 10 * 60 * 1000); // 10 นาที

  } catch (err) { console.error("[secret-chat] handleReportUser:", err); }
}

// ============================================================================
// HANDLER: CLAIM CASE
// ============================================================================
async function handleClaimCase(interaction) {
  const channelId = interaction.customId.split(":")[1];
  const staffId   = interaction.user.id;

  try { await interaction.deferUpdate(); }
  catch (err) {
    if (err.code !== 40060 && err.code !== 10062) console.error("[secret-chat] claimCase deferUpdate:", err);
    return;
  }

  if (claimedReports.has(channelId)) {
    return await interaction.followUp({
      content: `เคสนี้ถูกรับโดย <@${claimedReports.get(channelId)}> แล้วค่ะ`,
      flags: 64
    }).catch(() => {});
  }

  claimedReports.set(channelId, staffId);

  const disabledRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`${CLAIM_CASE_CUSTOM_ID}:${channelId}`).setLabel(`✅ รับเคสโดย @${interaction.user.username}`).setStyle(ButtonStyle.Secondary).setDisabled(true)
  );

  try { await interaction.editReply({ components: [disabledRow] }); }
  catch (e) {
    if (e.code !== 40060 && e.code !== 10062 && e.code !== 10003) {
      console.error("[secret-chat] claimCase editReply:", e);
    }
  }

  await logEvent("report_claimed", { channelId, staffId });

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
  const score     = parseInt(parts[2], 10);
  const userId    = interaction.user.id;

  if (!(await safeDeferReply(interaction))) return;

  const submitted = ratingSubmitted.get(channelId);
  if (!submitted)
    return await interaction.editReply({ content: "⏰ หมดเวลากด rating แล้วค่ะ ห้องกำลังจะถูกลบ" });
  if (submitted.has(userId))
    return await interaction.editReply({ content: "คุณส่ง rating ไปแล้วนะคะ 😊 รออีกคนกดก่อนนะคะ" });

  submitted.add(userId);

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

  const label = score === 5 ? "👍 ดีมากค่ะ!" : score === 3 ? "😐 โอเคค่ะ" : "👎 รับทราบค่ะ";
  await interaction.editReply({
    content:
      `✅ รับ rating แล้วค่ะ: **${label}**\n` +
      (submitted.size < 2
        ? `⏳ รออีกคนให้คะแนนก่อนนะคะ ห้องจะถูกลบอัตโนมัติใน 30 วินาทีค่ะ`
        : `🚪 ขอบคุณทั้งคู่ค่ะ กำลังปิดห้องแล้วนะคะ...`)
  });

  try {
    const membersPair  = ratingMembers.get(channelId) ?? ["", ""];
    const [uA, uB]     = membersPair;
    const ratingCount  = submitted.size;
    const isDone       = ratingCount >= 2;

    let updatedPayload = injectChannelId(buildV2RatingPrompt(uA, uB), channelId);

    if (isDone) {
      const inner = updatedPayload.components?.[0]?.components;
      if (inner) {
        const row = inner.find(c => c.type === 1);
        if (row?.components) {
          row.components = row.components.map(b => ({ ...b, disabled: true }));
        }
      }
    }

    const ratingMsgRef = ratingMsgRefs.get(channelId);
    if (ratingMsgRef) {
      try { await ratingMsgRef.edit(updatedPayload); } catch (_) {}
    }
  } catch (e) {
    if (e.code !== 10003 && e.code !== 10008) console.warn("[secret-chat] update rating buttons:", e.message);
  }

  if (submitted.size >= 2) {
    const t = ratingTimeoutTimers.get(channelId);
    if (t) { clearTimeout(t); ratingTimeoutTimers.delete(channelId); }
    ratingSubmitted.delete(channelId);
    ratingMembers.delete(channelId);
    ratingMsgRefs.delete(channelId);
    setTimeout(async () => {
      try {
        const ch = await interaction.client.channels.fetch(channelId).catch(() => null);
        if (ch) await safeDeleteChannel(ch, "Both users rated - cleanup");
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
    if (process.env.LOCAL_FAST_START === "true") {
      console.log("[secret-chat] Skipping crash recovery in LOCAL_FAST_START mode.");
      return;
    }
    runCrashRecovery(client).catch((err) => {
      console.error("[secret-chat] crash recovery failed:", err.message);
    });
  });

  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;
    if (message.content.trim() !== "b!reset-match") return;
    try { await message.delete(); } catch (_) {}

    const payload = buildV2Lobby();

    // ถ้ามีข้อความเดิม → edit แทน send เพื่อไม่ให้ขึ้น 2 อัน
    if (lobbyEmbedMessage) {
      try {
        await lobbyEmbedMessage.edit(payload);
        return;
      } catch (_) {
        // edit ไม่ได้ (ถูกลบ / ต่างช่อง) → ลบ reference แล้วส่งใหม่
        lobbyEmbedMessage = null;
      }
    }

    try {
      const sent = await message.channel.send(payload);
      lobbyEmbedMessage = sent;
    } catch (err) {
      console.error("[secret-chat] b!reset-match send error:", err.message);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (interaction.isStringSelectMenu()) {
      if (interaction.customId === TOPIC_SELECT_CUSTOM_ID) await handleTopicSelect(interaction);
      return;
    }

    if (!interaction.isButton()) return;

    if      (interaction.customId === JOIN_QUEUE_CUSTOM_ID)                 await handleJoinQueue(interaction);
    else if (interaction.customId === CANCEL_QUEUE_CUSTOM_ID)               await handleCancelQueue(interaction);
    else if (interaction.customId === LEAVE_TABLE_CUSTOM_ID)                await handleLeaveTable(interaction);
    else if (interaction.customId === EXTEND_TIME_CUSTOM_ID)                await handleExtendTime(interaction);
    else if (interaction.customId === REPORT_USER_CUSTOM_ID)                await handleReportUser(interaction);
    else if (interaction.customId.startsWith(CLAIM_CASE_CUSTOM_ID + ":"))   await handleClaimCase(interaction);
    else if (interaction.customId.startsWith(CONFIRM_LEAVE_CUSTOM_ID + ":")) await handleConfirmLeave(interaction);
    else if (interaction.customId.startsWith(RATING_CUSTOM_ID + ":"))       await handleRating(interaction);
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
    const ratingT = ratingTimeoutTimers.get(channel.id);
    if (ratingT) { clearTimeout(ratingT); ratingTimeoutTimers.delete(channel.id); }
    for (const id of members) activeUsers.delete(id);
    tableMembers.delete(channel.id);
    await removeActiveRoom(channel.id);
    tableActionMessages.delete(channel.id);
    reportedByUsers.delete(channel.id);
    claimedReports.delete(channel.id);
    sessionEndTimes.delete(channel.id);
    sessionExtendCount.delete(channel.id);
    sessionStartTimes.delete(channel.id);
    warningMessages.delete(channel.id);
    ratingSubmitted.delete(channel.id);
    ratingMembers.delete(channel.id);
    ratingMsgRefs.delete(channel.id);
    await updateLobbyEmbed();
  });

  console.log("[secret-chat] Module loaded successfully");
}

module.exports = { setupSecretChat };
