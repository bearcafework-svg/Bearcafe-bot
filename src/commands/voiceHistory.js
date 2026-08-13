// src/commands/voiceHistory.js
// ระบบตรวจสอบประวัติการลงห้องสำหรับสมาชิก (Voice Log History Command)
// รองรับ Discord Component V2, Cooldown, Blacklist, และการแบ่งช่วงเวลา/เลื่อนหน้าอย่างเสถียร

const { createClient } = require("@supabase/supabase-js");
const { Events, MessageFlags } = require("discord.js");
const sharedConfig = require("../sharedSettings.json");
const { blacklistPayload, cooldownContent } = require("../features/shared/tarotComponents");
const { getCooldown, setCooldown } = require("../utils/cooldownManager");

// Discord Flags สำหรับ Component V2
const FLAG_V2 = 32768; // MessageFlags.IsComponentsV2
const FLAG_EPHEMERAL = 64; // MessageFlags.Ephemeral
const FLAG_V2_EPH = FLAG_V2 | FLAG_EPHEMERAL;

const STAFF_ROLE_ID = "1144701361448038512";
const ALLOWED_CHANNELS = ["1524123194653671464", "1524124043022831717"];

const PERIOD_LABELS = {
  "uA21LdmKiE": "ตลอดทั้งวัน",
  "XB9EIxyvnY": "ช่วงดึก (00:00 – 05:59)",
  "nXnimKWVOX": "ช่วงเช้า (06:00 – 11:59)",
  "5LO94h88EU": "ช่วงบ่าย (12:00 – 17:59)",
  "bxE4waaQGS": "ช่วงเย็น/ค่ำ (18:00 – 23:59)"
};

let supabaseClient;
function getSupabase() {
  if (!supabaseClient && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return supabaseClient;
}

/**
 * คำนวณช่วงเวลาวันนี้ใน Timezone UTC+7
 * @returns {object} start: string, end: string, dateStr: string
 */
function getTodayRangeUTC7() {
  const now = new Date();
  const utcTime = now.getTime() + (now.getTimezoneOffset() * 60000);
  const localTime = new Date(utcTime + (7 * 60 * 60000));

  const yyyy = localTime.getFullYear();
  const mm = String(localTime.getMonth() + 1).padStart(2, '0');
  const dd = String(localTime.getDate()).padStart(2, '0');

  const startISO = `${yyyy}-${mm}-${dd}T00:00:00+07:00`;
  const endISO = `${yyyy}-${mm}-${dd}T23:59:59.999+07:00`;

  const THAI_MONTHS = ['ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.', 'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'];
  const day = localTime.getDate();
  const month = localTime.getMonth();
  const thaiYear = (yyyy + 543) % 100;
  const dateStr = `${day} ${THAI_MONTHS[month]} ${thaiYear}`;

  return { start: startISO, end: endISO, dateStr };
}

/**
 * ตรวจสอบความถูกต้องว่าผู้ใช้เป็น Owner หรือมียศทีมงานยกเว้นคูลดาวน์หรือไม่
 * @param {Interaction} interaction 
 * @returns {boolean}
 */
function isExemptFromCooldown(interaction) {
  if (!interaction.guild || !interaction.member) return false;
  if (interaction.guild.ownerId === interaction.user.id) return true;
  return interaction.member.roles.cache.has(STAFF_ROLE_ID);
}

/**
 * ตรวจสอบรายชื่อ Blacklist
 * @param {GuildMember} member 
 * @returns {boolean}
 */
function checkUserBlacklisted(member) {
  if (!member || !member.roles) return false;
  return sharedConfig.role_blacklist.some(id => member.roles.cache.has(id));
}

/**
 * กรอง log ตามช่วงเวลา
 * @param {Array} logs 
 * @param {string} period 
 * @returns {Array}
 */
function filterLogsByPeriod(logs, period) {
  if (period === "uA21LdmKiE") return logs;

  const hoursRange = {
    "XB9EIxyvnY": { start: 0, end: 5 },   // night
    "nXnimKWVOX": { start: 6, end: 11 },  // morning
    "5LO94h88EU": { start: 12, end: 17 }, // afternoon
    "bxE4waaQGS": { start: 18, end: 23 }  // evening
  };

  const range = hoursRange[period];
  if (!range) return logs;

  return logs.filter(log => {
    const date = new Date(log.timestamp);
    const thailandTime = new Date(date.getTime() + (7 * 60 * 60000));
    const hour = thailandTime.getUTCHours();
    return hour >= range.start && hour <= range.end;
  });
}

/**
 * คำนวณเวลารวมที่คุยในวันนี้
 * @param {Array} logs 
 * @param {GuildMember|null} member 
 * @returns {string}
 */
function calculateTotalDuration(logs, member) {
  const sorted = [...logs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  let totalMs = 0;
  let activeSessionStart = null;

  for (const log of sorted) {
    if (log.event_type === "join") {
      activeSessionStart = new Date(log.timestamp).getTime();
    } else if (log.event_type === "move") {
      if (activeSessionStart !== null) {
        totalMs += new Date(log.timestamp).getTime() - activeSessionStart;
      }
      activeSessionStart = new Date(log.timestamp).getTime();
    } else if (log.event_type === "leave") {
      if (activeSessionStart !== null) {
        totalMs += new Date(log.timestamp).getTime() - activeSessionStart;
        activeSessionStart = null;
      }
    }
  }

  // หากปัจจุบันยังอยู่ในห้องคุย ให้คำนวณบวกเวลาจนถึงตอนนี้ด้วย
  if (activeSessionStart !== null && member?.voice?.channel) {
    totalMs += Date.now() - activeSessionStart;
  }

  if (totalMs <= 0) return "0 นาที";
  const hours = Math.floor(totalMs / 3600000);
  const minutes = Math.floor((totalMs % 3600000) / 60000);

  if (hours > 0) {
    return `${hours} ชม. ${minutes} นาที`;
  }
  return `${minutes} นาที`;
}

/**
 * รูปแบบแสดงรายละเอียดประวัติแต่ละแถว
 * @param {object} log 
 * @returns {string}
 */
function formatLogLine(log) {
  const date = new Date(log.timestamp);
  const thailandTime = new Date(date.getTime() + (7 * 60 * 60000));
  const hh = String(thailandTime.getUTCHours()).padStart(2, '0');
  const mm = String(thailandTime.getUTCMinutes()).padStart(2, '0');
  const timeStr = `${hh}:${mm} น.`;

  if (log.event_type === "join") {
    return `<:moderationvlow:1537404744983781406>⠀เข้าห้อง **\`${log.channel_name}\`** ${timeStr}`;
  } else if (log.event_type === "move") {
    return `<:moderationvmedium:1537404763233058908>⠀ย้ายห้อง → **\`${log.channel_name}\`** ${timeStr}`;
  } else if (log.event_type === "leave") {
    return `<:moderationvhighest:1537404779741847664>⠀ออกห้อง **\`${log.channel_name}\`** ${timeStr}`;
  }
  return "";
}

/**
 * สร้าง Disabled components ชั่วคราวป้องกันคนกดเบิ้ลระหว่างประมวลผลข้อมูล
 * @param {Array} components 
 * @returns {Array}
 */
function getDisabledComponents(components) {
  return components.map(section => {
    if (section.type === 17) {
      return {
        ...section,
        components: section.components.map(comp => {
          if (comp.type === 1) { // Action Row
            return {
              ...comp,
              components: comp.components.map(innerComp => ({
                ...innerComp,
                disabled: true
              }))
            };
          }
          return comp;
        })
      };
    }
    return section;
  });
}

/**
 * สร้าง payload Component V2 ทั้งหมดเพื่อส่งหรืออัปเดตข้อความ
 */
function buildVoiceHistoryPayload(targetUser, retrievedLogs, period, page) {
  const createdTimestamp = Math.floor(targetUser.createdTimestamp / 1000);
  
  const profileContent = 
    `## <:bee20000:1256669436350562355>︲__\` 𝖵𝗈𝗂𝖼𝖾 𝗅𝗈𝗀 ₊ ประวัติการเข้าห้องพุดคุย 𓂃 \`__\n` +
    `> (👤)⠀<@${targetUser.id}>\n` +
    `> (🆔)⠀${targetUser.id}\n` +
    `> (⏰)⠀<t:${createdTimestamp}:F> (<t:${createdTimestamp}:R>)`;

  const { dateStr } = getTodayRangeUTC7();

  // คำนวณระยะเวลารวมวันนี้
  const member = targetUser.member || null;
  const totalDuration = calculateTotalDuration(retrievedLogs, member);

  // กรอง log
  const filteredLogs = filterLogsByPeriod(retrievedLogs, period);

  const ITEMS_PER_PAGE = 10;
  const totalPages = Math.max(1, Math.ceil(filteredLogs.length / ITEMS_PER_PAGE));
  const currentPage = Math.min(totalPages, Math.max(1, page));

  let logTextContent = "";
  if (filteredLogs.length === 0) {
    logTextContent = `### 🔊︲ประวัติห้องของวันนี้ (${dateStr}) — ${totalDuration}\n` +
                     `-# จำนวนหน้า : ${currentPage}/${totalPages} (${PERIOD_LABELS[period]})\n\n` +
                     `## ยังไม่พบการลงห้องภายในวันนี้`;
  } else {
    // เรียงเวลาจากอดีตไปหาปัจจุบัน (Oldest first)
    const sorted = [...filteredLogs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
    const startIndex = (currentPage - 1) * ITEMS_PER_PAGE;
    const endIndex = startIndex + ITEMS_PER_PAGE;
    const pageLogs = sorted.slice(startIndex, endIndex);

    const logLines = pageLogs.map(formatLogLine).filter(line => line !== "").join("\n");
    
    logTextContent = `### 🔊︲ประวัติห้องของวันนี้ (${dateStr}) — ${totalDuration}\n` +
                     `-# จำนวนหน้า : ${currentPage}/${totalPages} (${PERIOD_LABELS[period]})\n\n` +
                     `${logLines}`;
  }

  // สร้าง Options Dropdown
  const selectOptions = Object.entries(PERIOD_LABELS).map(([val, label]) => {
    let emojiName = "⏰";
    if (val === "XB9EIxyvnY") emojiName = "🌙";
    if (val === "nXnimKWVOX") emojiName = "☀️";
    if (val === "5LO94h88EU") emojiName = "🌆";
    if (val === "bxE4waaQGS") emojiName = "🌌";

    return {
      label,
      value: val,
      emoji: { name: emojiName },
      default: val === period
    };
  });

  const avatarUrl = targetUser.displayAvatarURL({ extension: "png", size: 256 }) || targetUser.defaultAvatarURL;

  return {
    flags: FLAG_V2, // ไม่เป็น Ephemeral ตามที่ลูกค้าต้องการ
    components: [
      {
        type: 17,
        components: [
          {
            type: 9,
            components: [
              {
                type: 10,
                content: profileContent
              }
            ],
            accessory: {
              type: 11,
              media: {
                url: avatarUrl
              }
            }
          },
          {
            type: 14,
            spacing: 2
          },
          {
            type: 10,
            content: logTextContent
          },
          {
            type: 14,
            spacing: 2
          },
          {
            type: 1,
            components: [
              {
                type: 3,
                options: selectOptions,
                placeholder: "⏰︲เลือกช่วงเวลาที่ต้องการดู",
                custom_id: `vh_sel:${targetUser.id}`,
                min_values: 1,
                max_values: 1
              }
            ]
          },
          {
            type: 1,
            components: [
              {
                style: 2,
                type: 2,
                custom_id: `vh_btn:prev:${targetUser.id}:${period}:${currentPage}`,
                emoji: { name: "⬅️" },
                disabled: currentPage <= 1
              },
              {
                style: 2,
                type: 2,
                custom_id: `vh_btn:next:${targetUser.id}:${period}:${currentPage}`,
                emoji: { name: "➡️" },
                disabled: currentPage >= totalPages
              },
              {
                style: 2,
                type: 2,
                custom_id: `vh_btn:first:${targetUser.id}:${period}:${currentPage}`,
                label: "หน้าแรก",
                disabled: currentPage <= 1
              },
              {
                style: 2,
                type: 2,
                custom_id: `vh_btn:last:${targetUser.id}:${period}:${currentPage}`,
                label: "หน้าสุดท้าย",
                disabled: currentPage >= totalPages
              }
            ]
          }
        ]
      }
    ]
  };
}

/**
 * การตั้งค่าคำสั่ง /ประวัติลงห้อง
 * @param {Client} client 
 */
function setupVoiceHistory(client) {
  // 1. ลงทะเบียน Slash Command
  client.once("clientReady", async () => {
    try {
      const { getValidGuild } = require("../../utils/guildFilter");
      const guildId = process.env.GUILD_ID || "1144251788493602848";
      const guild = getValidGuild(client, guildId);

      if (guild) {
        await guild.commands.create({
          name: "ประวัติลงห้อง",
          description: "ตรวจสอบประวัติห้องคุยเสียงของวันนี้",
          options: [
            {
              name: "user",
              description: "เลือกสมาชิกที่ต้องการตรวจสอบ (เว้นว่างเพื่อตรวจสอบตัวเอง)",
              type: 6, // USER
              required: false
            }
          ]
        });
        console.log(`[voiceHistory] Command /ประวัติลงห้อง registered on guild ${guild.name}.`);
      } else {
        console.warn("[voiceHistory] No guild found for slash command registration.");
      }
    } catch (err) {
      console.error("[voiceHistory] Failed to register slash command:", err.message);
    }
  });

  // 2. จัดการ Event Interaction
  client.on(Events.InteractionCreate, async (interaction) => {
    // ── 2.1 จัดการ Slash Command ──────────────────────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === "ประวัติลงห้อง") {
      // ตรวจเช็ค Blacklist
      if (checkUserBlacklisted(interaction.member)) {
        const payload = blacklistPayload(interaction.user.id);
        payload.flags = FLAG_V2_EPH;
        return interaction.reply(payload);
      }

      // ตรวจเช็คช่องการรันคำสั่ง
      if (!ALLOWED_CHANNELS.includes(interaction.channelId)) {
        return interaction.reply({
          content: `❌ คำสั่งนี้สามารถใช้งานได้เฉพาะในห้องที่กำหนดเท่านั้นนะคะ (<#1524123194653671464> หรือ <#1524124043022831717>)`,
          flags: FLAG_EPHEMERAL
        });
      }

      const supabase = getSupabase();
      if (!supabase) {
        return interaction.reply({
          content: "❌ ระบบเกิดข้อผิดพลาด (Database Connection Error) กรุณาแจ้งผู้พัฒนาระบบ",
          flags: FLAG_EPHEMERAL
        });
      }

      // ตรวจเช็คคูลดาวน์ (ยกเว้น Owner และยศ STAFF_ROLE_ID)
      const now = Date.now();
      const cooldownName = "voiceHistory";
      if (!isExemptFromCooldown(interaction)) {
        const expiresAt = await getCooldown(supabase, interaction.user.id, cooldownName);
        if (now < expiresAt) {
          const readyTimestamp = Math.floor(expiresAt / 1000);
          return interaction.reply({
            content: cooldownContent(interaction.user.id, readyTimestamp),
            flags: FLAG_V2_EPH
          });
        }
      }

      const targetUser = interaction.options.getUser("user") || interaction.user;

      // ส่ง Defer Reply ไว้ก่อนเนื่องจากต้องมีการเรียก DB
      await interaction.deferReply();

      // บันทึก Cooldown
      if (!isExemptFromCooldown(interaction)) {
        await setCooldown(supabase, interaction.user.id, cooldownName, now + 60000); // 1 นาที
      }

      // ดึงข้อมูลสำหรับ Target User เฉพาะของ "วันนี้"
      const { start, end } = getTodayRangeUTC7();
      const { data: retrievedLogs, error } = await supabase
        .from("voice_logs")
        .select("*")
        .eq("user_id", targetUser.id)
        .gte("timestamp", start)
        .lte("timestamp", end);

      if (error) {
        console.error("[voiceHistory] Supabase fetch error:", error.message);
        return interaction.editReply({ content: "❌ ไม่สามารถดึงประวัติได้ในขณะนี้ กรุณาลองใหม่อีกครั้งค่ะ" });
      }

      // ตรวจสอบว่า targetUser มี member caching หรือไม่
      let targetMember = null;
      try {
        targetMember = await interaction.guild.members.fetch(targetUser.id).catch(() => null);
      } catch (e) {
        // ignore
      }
      targetUser.member = targetMember;

      const payload = buildVoiceHistoryPayload(targetUser, retrievedLogs || [], "uA21LdmKiE", 1);
      return interaction.editReply(payload);
    }

    // ── 2.2 จัดการปุ่มกด (Buttons) ──────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith("vh_btn:")) {
      // ตรวจเช็ค Blacklist ของคนกด
      if (checkUserBlacklisted(interaction.member)) {
        const payload = blacklistPayload(interaction.user.id);
        payload.flags = FLAG_V2_EPH;
        return interaction.reply(payload);
      }

      const parts = interaction.customId.split(":");
      const action = parts[1];
      const targetUserId = parts[2];
      const period = parts[3];
      const currentPage = parseInt(parts[4], 10);

      const supabase = getSupabase();
      if (!supabase) return;

      // ปิดสถานะปุ่ม (Disable) ป้องกันคนกดซ้ำซ้อน
      const disabledComponents = getDisabledComponents(interaction.message.components);
      await interaction.update({ components: disabledComponents });

      // ดึงข้อมูลใหม่
      const { start, end } = getTodayRangeUTC7();
      const { data: retrievedLogs, error } = await supabase
        .from("voice_logs")
        .select("*")
        .eq("user_id", targetUserId)
        .gte("timestamp", start)
        .lte("timestamp", end);

      if (error) {
        console.error("[voiceHistory] Supabase fetch error during pagination:", error.message);
        return interaction.editReply({ content: "❌ ไม่สามารถเปลี่ยนหน้าได้เนื่องจากฐานข้อมูลขัดข้อง" });
      }

      // กรองและคำนวณจำนวนหน้า
      const filteredLogs = filterLogsByPeriod(retrievedLogs || [], period);
      const ITEMS_PER_PAGE = 10;
      const totalPages = Math.max(1, Math.ceil(filteredLogs.length / ITEMS_PER_PAGE));

      let newPage = currentPage;
      if (action === "prev") newPage = Math.max(1, currentPage - 1);
      if (action === "next") newPage = Math.min(totalPages, currentPage + 1);
      if (action === "first") newPage = 1;
      if (action === "last") newPage = totalPages;

      const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
      if (!targetUser) return;
      
      let targetMember = null;
      try {
        targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
      } catch (e) {
        // ignore
      }
      targetUser.member = targetMember;

      const payload = buildVoiceHistoryPayload(targetUser, retrievedLogs || [], period, newPage);
      return interaction.editReply(payload);
    }

    // ── 2.3 จัดการเมนูเลือกช่วงเวลา (Dropdown Menu) ──────────────────────
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith("vh_sel:")) {
      // ตรวจเช็ค Blacklist ของคนสับเปลี่ยนเมนู
      if (checkUserBlacklisted(interaction.member)) {
        const payload = blacklistPayload(interaction.user.id);
        payload.flags = FLAG_V2_EPH;
        return interaction.reply(payload);
      }

      const parts = interaction.customId.split(":");
      const targetUserId = parts[1];
      const selectedPeriod = interaction.values[0];

      const supabase = getSupabase();
      if (!supabase) return;

      // ปิดปุ่มทั้งหมดชั่วคราว
      const disabledComponents = getDisabledComponents(interaction.message.components);
      await interaction.update({ components: disabledComponents });

      // ดึงข้อมูล
      const { start, end } = getTodayRangeUTC7();
      const { data: retrievedLogs, error } = await supabase
        .from("voice_logs")
        .select("*")
        .eq("user_id", targetUserId)
        .gte("timestamp", start)
        .lte("timestamp", end);

      if (error) {
        console.error("[voiceHistory] Supabase fetch error during dropdown switch:", error.message);
        return interaction.editReply({ content: "❌ ไม่สามารถแสดงประวัติได้เนื่องจากฐานข้อมูลขัดข้อง" });
      }

      const targetUser = await interaction.client.users.fetch(targetUserId).catch(() => null);
      if (!targetUser) return;

      let targetMember = null;
      try {
        targetMember = await interaction.guild.members.fetch(targetUserId).catch(() => null);
      } catch (e) {
        // ignore
      }
      targetUser.member = targetMember;

      const payload = buildVoiceHistoryPayload(targetUser, retrievedLogs || [], selectedPeriod, 1);
      return interaction.editReply(payload);
    }
  });

  console.log("[voiceHistory] ✅ ระบบเช็กประวัติลงห้อง /ประวัติลงห้อง พร้อมทำงาน");
}

module.exports = { setupVoiceHistory };
