// ═══════════════════════════════════════════════════════════
//  donate.js — ระบบยอดโดเนท Top 10 + เช็คยอดส่วนตัว
// ═══════════════════════════════════════════════════════════
const { createClient } = require("@supabase/supabase-js");
const { safeDeferReply, safeRespond } = require("../../../utils/discordSafety");

const GUILD_ID = "1144251788493602848";
const EXCLUDED_USER_ID = "944920660759707658"; // ไม่จัดอันดับ แต่ดูยอดตัวเองได้

// Cooldown 24 ชม. (ms)
const REFRESH_COOLDOWN_MS = 24 * 60 * 60 * 1000;
let lastRefreshAt = 0; // timestamp ที่กด 🔄 ครั้งล่าสุด

async function safeDeferUpdate(interaction) {
  if (interaction.replied || interaction.deferred) return true;
  try {
    await interaction.deferUpdate();
    return true;
  } catch (err) {
    if (err.code !== 40060 && err.code !== 10062) {
      console.error("[donate] deferUpdate error:", err);
    }
    return false;
  }
}

// ── ตัวเลข Unicode Math Sans-Serif ──────────────────────────
const MATH_DIGITS = ["𝟢", "𝟣", "𝟤", "𝟥", "𝟦", "𝟧", "𝟨", "𝟩", "𝟪", "𝟫"];

/**
 * แปลงตัวเลขปกติ → Unicode math digits พร้อม comma ทุก 3 หลัก
 * เช่น 1200 → "𝟣,𝟤𝟢𝟢"
 */
function toMathNum(n) {
  const str = Math.round(n).toLocaleString("en-US"); // "1,200"
  return str.replace(/\d/g, d => MATH_DIGITS[parseInt(d)]);
}

// ── ดึง Avatar URL ของ Guild Member ─────────────────────────
async function getAvatarUrl(guild, userId) {
  try {
    const member = await guild.members.fetch(userId);
    // ลำดับ: Server Avatar → Global Avatar → Default
    return (
      member.displayAvatarURL({ size: 128, extension: "png" }) ||
      `https://cdn.discordapp.com/embed/avatars/0.png`
    );
  } catch {
    return `https://cdn.discordapp.com/embed/avatars/0.png`;
  }
}

// ── ดึง Username ของ Guild Member ───────────────────────────
async function getUsername(guild, userId) {
  try {
    const member = await guild.members.fetch(userId);
    return member.user.username;
  } catch {
    return userId;
  }
}

// ── แปลงวันที่เป็น Date / Timestamp ─────────────────────────
function parseTxDate(raw) {
  if (!raw) return null;
  const slashMatch = String(raw).trim().match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/);
  if (slashMatch) {
    const [, day, month, yearStr] = slashMatch;
    let year = parseInt(yearStr, 10);
    if (year > 2400) year -= 543;
    const d = new Date(year, parseInt(month, 10) - 1, parseInt(day, 10));
    if (!isNaN(d.getTime())) return d;
  }
  const d = new Date(raw);
  return isNaN(d.getTime()) ? null : d;
}

function getRecordTimestampSec(rawDate, logTimestamp) {
  const d = parseTxDate(rawDate) || (logTimestamp ? new Date(logTimestamp) : null);
  if (!d || isNaN(d.getTime())) return null;
  return Math.floor(d.getTime() / 1000);
}

// ── ดึงข้อมูลยอดโดเนทรวม Top N จาก Supabase ────────────────
async function fetchTopDonors(supabase, limit = 10) {
  const { data: legacyData, error: legacyError } = await supabase
    .from("trading_history")
    .select("member_id, amount, transaction, log_timestamp")
    .neq("member_id", EXCLUDED_USER_ID);

  if (legacyError) throw new Error(legacyError.message);

  const { data: newOrdersData, error: newOrdersError } = await supabase
    .from("orders")
    .select("member_id, total_amount, transaction_date, log_timestamp")
    .neq("member_id", EXCLUDED_USER_ID);

  if (newOrdersError) throw new Error(newOrdersError.message);

  // รวม amount พร้อมบันทึกวันที่แรกสุดและล่าสุดต่อ member_id
  const stats = {};
  const addRecord = (mid, amount, rawDate, logTs) => {
    if (!mid) return;
    if (!stats[mid]) {
      stats[mid] = { total: 0, firstTs: null, latestTs: null };
    }
    stats[mid].total += parseFloat(amount || 0);
    const ts = getRecordTimestampSec(rawDate, logTs);
    if (ts && ts > 0) {
      if (stats[mid].firstTs === null || ts < stats[mid].firstTs) {
        stats[mid].firstTs = ts;
      }
      if (stats[mid].latestTs === null || ts > stats[mid].latestTs) {
        stats[mid].latestTs = ts;
      }
    }
  };

  for (const row of legacyData || []) {
    addRecord(row.member_id, row.amount, row.transaction, row.log_timestamp);
  }

  for (const row of newOrdersData || []) {
    addRecord(row.member_id, row.total_amount, row.transaction_date, row.log_timestamp);
  }

  // เรียงมากไปน้อย
  return Object.entries(stats)
    .sort((a, b) => b[1].total - a[1].total)
    .slice(0, limit)
    .map(([uid, s]) => [uid, s.total, { firstTs: s.firstTs, latestTs: s.latestTs }]);
}

// ── ดึงยอดรวม + รายการล่าสุด ของ user คนนึง ─────────────────
async function fetchUserDonation(supabase, userId) {
  const { data: legacyData, error: legacyError } = await supabase
    .from("trading_history")
    .select("amount, transaction, log_timestamp")
    .eq("member_id", userId);

  if (legacyError) throw new Error(legacyError.message);

  const { data: newOrdersData, error: newOrdersError } = await supabase
    .from("orders")
    .select("total_amount, transaction_date, log_timestamp")
    .eq("member_id", userId);

  if (newOrdersError) throw new Error(newOrdersError.message);

  const hasLegacy = legacyData && legacyData.length > 0;
  const hasNew = newOrdersData && newOrdersData.length > 0;

  if (!hasLegacy && !hasNew) return null;

  const legacyTotal = hasLegacy ? legacyData.reduce((s, r) => s + parseFloat(r.amount || 0), 0) : 0;
  const newTotal = hasNew ? newOrdersData.reduce((s, r) => s + parseFloat(r.total_amount || 0), 0) : 0;
  const total = legacyTotal + newTotal;

  // หาข้อมูลล่าสุด
  let latestAmount = 0;
  let latestDate = null;

  const allRecords = [];

  if (hasLegacy) {
    for (const r of legacyData) {
      const d = parseTxDate(r.transaction) || (r.log_timestamp ? new Date(r.log_timestamp) : new Date(0));
      allRecords.push({
        amount: parseFloat(r.amount || 0),
        date: d,
        rawDate: r.transaction
      });
    }
  }

  if (hasNew) {
    for (const r of newOrdersData) {
      const d = parseTxDate(r.transaction_date) || (r.log_timestamp ? new Date(r.log_timestamp) : new Date(0));
      allRecords.push({
        amount: parseFloat(r.total_amount || 0),
        date: d,
        rawDate: r.transaction_date
      });
    }
  }

  // เรียงลำดับจากล่าสุดไปหาเก่าสุด
  allRecords.sort((a, b) => b.date.getTime() - a.date.getTime());

  if (allRecords.length > 0) {
    latestAmount = allRecords[0].amount;
    latestDate = allRecords[0].rawDate || null;
  }

  return { total, latestAmount, latestDate };
}

// ── สร้าง Component body สำหรับ Top Donate ──────────────────
async function buildTopDonateComponents(guild, supabase) {
  const top10 = await fetchTopDonors(supabase, 10);

  const rankEmojis = ["1️⃣", "2️⃣", "3️⃣", "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"];
  const topEmojis = [
    "<a:top_one:1150848398774247564>",
    "<a:top_two:1150848396190568448>",
    "<a:top_three:1150849072299769896>",
  ];

  const components = [
    // Banner
    {
      type: 12,
      items: [{
        media: {
          url: "https://cdn.discordapp.com/attachments/1565777850022232075/1575488742356164638/f740a27f2f5ad31d.png?ex=6b0977bb&is=6b08263b&hm=bce213e95abda3b03da0bfcb088bca0c111ad4a6d6a42f32ef2b37e76aadfb9f&"
        }
      }]
    },
    // Header
    {
      type: 10,
      content: "## <:bee20000:1256669436350562355>︲__` 𝖳𝗈𝗉 𝖣𝗈𝗇𝖺𝗍𝖾 ₊ ท็อปโดเนท 𓂃 `__ \n-# มาดูกันว่าใครสายเปย์ที่สุดในคาเฟ่หมี หากยอดโดเนทของคุณครบ **1,000 บาท** ขึ้นไปก็รับยศ <@&1185550863448682579> ผ่านห้อง <#1524124172580814979> ได้เลยค่ะ <:cuteplant:1152834055528783872>"
    },
    { type: 14, spacing: 2 },
    { type: 14, divider: false, spacing: 1 },
  ];

  // อันดับ 1–3 (มี avatar + วันที่โดเนทครั้งแรก/ล่าสุด)
  for (let i = 0; i < Math.min(3, top10.length); i++) {
    const [uid, total, meta] = top10[i];
    const avatarUrl = await getAvatarUrl(guild, uid);
    const formattedTotal = Math.round(total).toLocaleString("en-US");
    const firstTsText = meta?.firstTs ? `<t:${meta.firstTs}:F>` : "ไม่ระบุ";
    const latestTsText = meta?.latestTs ? `<t:${meta.latestTs}:R>` : "ไม่ระบุ";

    components.push({
      type: 9,
      components: [{
        type: 10,
        content: `### ${topEmojis[i]}︰<@${uid}> โดเนท <:bankmoney:1567217849968234658> __${formattedTotal}__ บาท\n-# โดเนทครั้งแรก : ${firstTsText}\n-# โดเนทล่าสุด : ${latestTsText}`
      }],
      accessory: {
        type: 11,
        media: { url: avatarUrl }
      }
    });
    components.push({ type: 14, spacing: 2 });
  }

  // อันดับ 4–10 (ข้อความล้วน รวมกัน)
  if (top10.length > 3) {
    const lines = [];
    for (let i = 3; i < top10.length; i++) {
      const [uid, total] = top10[i];
      const formattedTotal = Math.round(total).toLocaleString("en-US");
      lines.push(
        `### ${rankEmojis[i]}︰<@${uid}> โดเนท <:bankmoney:1567217849968234658> __${formattedTotal}__ บาท`
      );
    }
    components.push({ type: 10, content: lines.join("\n") });
    components.push({ type: 14, spacing: 2 });
  }

  // Footer: วันที่รีเซ็ต + ปุ่ม 🔄
  const resetText = lastRefreshAt
    ? `<t:${Math.floor(lastRefreshAt / 1000)}:F>`
    : "ยังไม่ได้รีเซ็ต";

  components.push({
    type: 9,
    components: [{
      type: 10,
      content: `**รีเซ็ตข้อมูลล่าสุด:** ${resetText}`
    }],
    accessory: {
      style: 2,
      type: 2,
      emoji: { name: "🔄" },
      custom_id: "donate_refresh"
    }
  });

  // ActionRow ด้านล่าง: ปุ่มเช็กยอดโดเนทของคุณ
  components.push({ type: 14, divider: false });
  components.push({
    type: 1,
    components: [
      {
        style: 2,
        type: 2,
        custom_id: "p_373089100418256897",
        label: "เช็กยอดโดเนทของคุณ:",
        disabled: true
      },
      {
        style: 3,
        type: 2,
        custom_id: "p_373089211718307842",
        emoji: {
          id: "1522154708200849449",
          name: "bagpack_icon",
          animated: false
        }
      }
    ]
  });

  return components;
}

// ── ส่ง / อัปเดต Top Donate Message ────────────────────────
async function sendOrUpdateTopDonate(channel, guild, supabase, existingMessage = null) {
  const components = await buildTopDonateComponents(guild, supabase);
  const body = {
    flags: 32768,
    components: [{ type: 17, components }]
  };

  if (existingMessage) {
    await existingMessage.edit(body);
  } else {
    await channel.send(body);
  }
}

const ws = require("ws");
if (!global.WebSocket) {
  global.WebSocket = ws;
}

// ══════════════════════════════════════════════════════════════
//  setupDonate — เชื่อมกับ client
// ══════════════════════════════════════════════════════════════
function setupDonate(client) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
    }
  );

  // ── คำสั่ง b!reset-donate (Owner เท่านั้น) ─────────────────
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (message.content.trim().toLowerCase() !== "b!reset-donate") return;

    const OWNER_ID = process.env.OWNER_ID; // ใส่ใน .env ว่า Owner Discord ID คือใคร
    if (message.author.id !== OWNER_ID) {
      return message.reply({ content: "❌ คำสั่งนี้ใช้ได้เฉพาะ Owner เท่านั้นค่ะ", flags: 64 });
    }

    try {
      await message.delete().catch(() => { });
      const guild = message.guild;
      await sendOrUpdateTopDonate(message.channel, guild, supabase);
    } catch (err) {
      console.error("[donate] reset-donate error:", err);
      message.channel.send("❌ เกิดข้อผิดพลาดในการโหลดข้อมูลค่ะ").catch(() => { });
    }
  });

  // ── Interaction: ปุ่ม 🔄 refresh ────────────────────────────
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    // ── ปุ่ม 🔄 อัปเดต Top Donate ───────────────────────────
    if (interaction.customId === "donate_refresh") {
      const now = Date.now();
      const diff = now - lastRefreshAt;

      if (lastRefreshAt > 0 && diff < REFRESH_COOLDOWN_MS) {
        // ยัง Cooldown อยู่
        const nextTs = Math.floor((lastRefreshAt + REFRESH_COOLDOWN_MS) / 1000);
        return safeRespond(interaction, {
          content: `## <:bear_star1:1152782839671169184>︲คุณสามารถกดรีเซ็ตข้อมูลได้อีก <t:${nextTs}:R>`,
          flags: 64
        });
      }

      if (!(await safeDeferUpdate(interaction))) return;

      try {
        lastRefreshAt = now;
        const guild = interaction.guild;
        const components = await buildTopDonateComponents(guild, supabase);
        await interaction.editReply({
          flags: 32768,
          components: [{ type: 17, components }]
        });
      } catch (err) {
        console.error("[donate] refresh error:", err);
      }
      return;
    }

    // ── ปุ่ม เช็คยอดของคุณ (รองรับทั้ง custom_id ใหม่และเดิม) ────────────────────
    if (interaction.customId === "p_373089211718307842" || interaction.customId === "donate_check_self") {
      const guild = interaction.guild;
      const userId = interaction.user.id;

      try {
        if (!(await safeDeferReply(interaction, { flags: 64 }))) return;
        const result = await fetchUserDonation(supabase, userId);

        if (!result || result.total === 0) {
          return safeRespond(interaction, {
            content: "## <:bear_star1:1152782839671169184>︲คุณยังไม่ได้โดเนทให้กับคาเฟ่หมีนะคะ !"
          });
        }

        const { total, latestAmount, latestDate } = result;
        const avatarUrl = await getAvatarUrl(guild, userId);
        const username = await getUsername(guild, userId);

        // หา rank ของ user นี้
        let rankText = "x";
        let titlePrefix = "นายทุนหมีฝึกหัดอันดับ";

        if (userId === EXCLUDED_USER_ID) {
          rankText = "x";
        } else {
          const allTop = await fetchTopDonors(supabase, 9999);
          const idx = allTop.findIndex(([uid]) => uid === userId);
          rankText = idx >= 0 ? (idx + 1).toLocaleString("en-US") : "x";
        }

        if (total >= 1000) {
          titlePrefix = "<@&1185550863448682579> อันดับ";
        }

        // จำนวนสมาชิก guild
        const memberCount = guild.memberCount;

        // แปลง transaction (YYYY-MM-DD) → Unix timestamp
        let latestTs = Math.floor(Date.now() / 1000);
        if (latestDate) {
          const d = parseTxDate(latestDate) || new Date(latestDate);
          if (d && !isNaN(d.getTime())) latestTs = Math.floor(d.getTime() / 1000);
        }

        const formattedMemberCount = memberCount.toLocaleString("en-US");
        const formattedTotal = Math.round(total).toLocaleString("en-US");
        const formattedLatest = Math.round(latestAmount).toLocaleString("en-US");

        const content =
          `## <:bee20000:1256669436350562355>︲__\` โดเนทของคุณ ${username} \`__ \n` +
          `- ${titlePrefix} **${rankText}** จาก ${formattedMemberCount} คน\n` +
          `  - โดเนทสะสม <:bankmoney:1567217849968234658> **__${formattedTotal} บาท__**\n` +
          `  - ล่าสุดแอบโยนปลาแซลมอนมาอีก <:bankmoney:1567217849968234658> **__${formattedLatest} บาท__** เมื่อ <t:${latestTs}:R> <:cuteplant:1152834055528783872>`;

        return safeRespond(interaction, {
          flags: 32768,
          components: [{
            type: 17,
            components: [
              {
                type: 9,
                components: [{ type: 10, content }],
                accessory: { type: 11, media: { url: avatarUrl } }
              }
            ]
          }]
        });

      } catch (err) {
        console.error("[donate] check-self error:", err);
        return safeRespond(interaction, { content: "❌ เกิดข้อผิดพลาดค่ะ กรุณาลองใหม่อีกครั้ง" });
      }
    }
  });
}

module.exports = {
  setupDonate,
  buildTopDonateComponents,
  sendOrUpdateTopDonate
};
