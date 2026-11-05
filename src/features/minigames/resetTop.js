// src/features/minigames/resetTop.js — คำสั่ง b!reset-top จัดอันดับหมีติดเกม!
const { createClient } = require("@supabase/supabase-js");
const { AttachmentBuilder } = require("discord.js");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const axios = require("axios");
const path = require("path");
const rootDir = path.resolve(__dirname, __dirname.includes("src" + path.sep + "main") ? "../../../.." : "../../..");
const sharedConfig = require(path.join(rootDir, "src/sharedSettings.json"));
const { safeDeferUpdate, safeRespond } = require(path.join(rootDir, "utils/discordSafety"));
const { createProtectedSupabaseClient } = require(path.join(rootDir, "src/services/supabaseTrafficGuard"));
require(path.join(rootDir, "src/utils/fontLoader"));

// Cooldown 5 นาที สำหรับปุ่ม 🔄 refresh (ms)
const REFRESH_COOLDOWN_MS = 5 * 60 * 1000;
let lastResetAt = 0; // timestamp ที่กด reset หรือ refresh

// ── ตั้งค่าช่วงเวลาการแข่งขัน Season 1 ───
const SEASON_1_START_ISO = "2026-08-01T00:00:00+07:00";
const SEASON_1_END_ISO = "2026-09-10T23:59:59+07:00";
const SEASON_1_PERIOD_TEXT = "1 ส.ค. 2026 – 10 ก.ย. 2026 (23:59 น.)";
const SEASON_PERIOD_TEXT = SEASON_1_PERIOD_TEXT;

// ── ตั้งค่าช่วงเวลากระดานประจำเดือน (Monthly Leaderboard) ───
const THAI_MONTH_NAMES_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม"
];
const THAI_MONTH_NAMES_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."
];

/**
 * คำนวณช่วงเวลากระดานประจำเดือนปัจจุบันแบบ Dynamic (เวลาประเทศไทย Asia/Bangkok UTC+7)
 */
function getBangkokCurrentMonthPeriod(targetDate = new Date()) {
  const year = parseInt(targetDate.toLocaleDateString("en-US", { timeZone: "Asia/Bangkok", year: "numeric" }), 10);
  const month = parseInt(targetDate.toLocaleDateString("en-US", { timeZone: "Asia/Bangkok", month: "numeric" }), 10);

  const monthStr = String(month).padStart(2, "0");
  const lastDay = new Date(year, month, 0).getDate();
  const lastDayStr = String(lastDay).padStart(2, "0");

  const startTime = `${year}-${monthStr}-01T00:00:00+07:00`;
  const endTime = `${year}-${monthStr}-${lastDayStr}T23:59:59+07:00`;

  const monthFull = THAI_MONTH_NAMES_FULL[month - 1] || "";
  const monthShort = THAI_MONTH_NAMES_SHORT[month - 1] || "";
  const periodText = `1 ${monthShort} ${year} – ${lastDay} ${monthShort} ${year} (23:59 น.)`;

  const nextMonth = (month % 12) + 1; // 1-12
  const nextYear = month === 12 ? year + 1 : year;
  const nextMonthFull = THAI_MONTH_NAMES_FULL[nextMonth - 1] || "";
  const nextMonthReportDate = `1 ${nextMonthFull} ${nextYear}`;

  return {
    isMonthly: true,
    year,
    month,
    lastDay,
    monthName: monthFull,
    monthShort,
    nextMonth,
    nextYear,
    nextMonthFull,
    nextMonthReportDate,
    startTime,
    endTime,
    periodText,
    title: `## <:bee20000:1256669436350562355>︲__\` 𝖱𝖺𝗇𝗄 𝗍𝗁𝖾 𝗐𝗂𝗇𝗇𝖾𝗋𝗌 ₊ จัดอันดับประจำเดือน${monthFull} 𓂃 \`__`,
    periodLabel: `📅 **ระยะเวลากระดานประจำเดือน:** \` ${periodText} \`\n`
  };
}

// ── Channel & Message Constants ───
const EVENT_ANNOUNCE_CHANNEL_ID = "1524123305471115287"; // 🎀︰ประกาศอีเว้นท์
const LEADERBOARD_CHANNEL_ID = "1535546990711283743";    // 🏆︰จัดอันดับหมีติดเกม
const LEADERBOARD_MESSAGE_ID = "1536940318761558057";    // ข้อความบอร์ดเดิมที่จะ Edit
const MONTHLY_SUMMARY_CHANNEL_ID = "1551533172682919997"; // 📋︰สรุปผล 1-10 อัตโนมัติทุกสิ้นเดือน 23:59
const LEADERBOARD_BANNER_URL = "https://media.discordapp.net/attachments/1565777850022232075/1567877913620123688/9bfe82457ed513d5.png?ex=6aedc798&is=6aec7618&hm=45113c7564c7dc2c139de987f3c8a00d9ca8a9c11ab6855a679991e12d63ebe8&=&format=webp&quality=lossless&width=525&height=350";

/**
 * ดึงสถานะช่วงเวลาที่กำลัง Active อยู่ในปัจจุบัน
 */
function getCurrentActivePeriod() {
  const isPastSeason1 = Date.now() >= new Date(SEASON_1_END_ISO).getTime();
  if (isPastSeason1) {
    return getBangkokCurrentMonthPeriod();
  }
  const monthly = getBangkokCurrentMonthPeriod();
  return {
    isMonthly: false,
    year: monthly.year,
    lastDay: monthly.lastDay,
    nextMonthReportDate: monthly.nextMonthReportDate,
    monthName: "Season 1",
    startTime: SEASON_1_START_ISO,
    endTime: SEASON_1_END_ISO,
    periodText: SEASON_1_PERIOD_TEXT,
    title: "## <:bee20000:1256669436350562355>︲__` 𝖫𝖾𝖺𝖽𝖾𝗋𝖻𝗈𝖺𝗋𝖽 ₊ จัดอันดับหมีติดเกม! 𓂃 `__",
    periodLabel: `🎁 **ระยะเวลาแข่งขัน (ขยายเวลาชดเชย):** \` ${SEASON_1_PERIOD_TEXT} \`\n`
  };
}

// ── ดึงข้อมูล Top Winners จาก minigame_wins (ผ่าน RPC / View / Aggregation) ───
async function fetchTopMinigameWins(supabase, limit = 10, gameId = null, startTime = null, endTime = null) {
  if (!supabase) return [];

  const activePeriod = getCurrentActivePeriod();
  const effectiveStart = startTime || activePeriod.startTime;
  const effectiveEnd = endTime || activePeriod.endTime;
  const parsedGameId = gameId && gameId !== 'all' ? parseInt(gameId, 10) : null;

  try {
    // 1. ลองเรียก RPC get_minigame_leaderboard พร้อมช่วงเวลา
    const { data: rpcData, error: rpcError } = await supabase
      .rpc("get_minigame_leaderboard", {
        days_limit: null,
        filter_game_id: parsedGameId,
        start_time: effectiveStart,
        end_time: effectiveEnd
      });

    if (!rpcError && rpcData && rpcData.length > 0) {
      return rpcData.slice(0, limit).map(row => ({
        discord_id: row.discord_id,
        wins: parseInt(row.wins || 0, 10),
        points: parseInt(row.points || 0, 10)
      }));
    }

    // 2. ถ้า RPC ไม่พร้อม ให้ Fallback ดึงจาก minigame_wins พร้อมกรองช่วงเวลา
    let query = supabase
      .from("minigame_wins")
      .select("discord_id, points_earned")
      .gte("created_at", effectiveStart)
      .lte("created_at", effectiveEnd);

    if (parsedGameId) {
      query = query.eq("game_id", parsedGameId);
    }

    const { data, error } = await query.range(0, 49999);

    if (error) {
      console.error("[resetTop] Error fetching minigame_wins:", error.message);
      return [];
    }

    const stats = {};
    for (const row of data || []) {
      const uid = row.discord_id;
      if (uid) {
        if (!stats[uid]) {
          stats[uid] = { wins: 0, points: 0 };
        }
        stats[uid].wins += 1;
        stats[uid].points += parseInt(row.points_earned || 0, 10);
      }
    }

    return Object.entries(stats)
      .map(([uid, s]) => ({ discord_id: uid, wins: s.wins, points: s.points }))
      .sort((a, b) => b.wins - a.wins || b.points - a.points)
      .slice(0, limit);
  } catch (err) {
    console.error("[resetTop] Error in fetchTopMinigameWins:", err.message);
    return [];
  }
}

// ── ดึงข้อมูลอันดับเฉพาะบุคคลสำหรับปุ่ม 🏆 อันดับของฉัน ─────────
async function getUserMinigameRank(supabase, userId, gameId = null, startTime = null, endTime = null) {
  if (!supabase || !userId) return null;

  const activePeriod = getCurrentActivePeriod();
  const effectiveStart = startTime || activePeriod.startTime;
  const effectiveEnd = endTime || activePeriod.endTime;
  const parsedGameId = gameId && gameId !== 'all' ? parseInt(gameId, 10) : null;

  try {
    let sortedList = [];

    // 1. เรียก RPC get_minigame_leaderboard พร้อมช่วงเวลา
    const { data: rpcData, error: rpcError } = await supabase
      .rpc("get_minigame_leaderboard", {
        days_limit: null,
        filter_game_id: parsedGameId,
        start_time: effectiveStart,
        end_time: effectiveEnd
      });

    if (!rpcError && rpcData) {
      sortedList = rpcData.map(row => ({
        discord_id: row.discord_id,
        wins: parseInt(row.wins || 0, 10),
        points: parseInt(row.points || 0, 10)
      }));
    } else {
      // 2. Fallback ดึงจาก minigame_wins พร้อมกรองช่วงเวลา
      let query = supabase
        .from("minigame_wins")
        .select("discord_id, points_earned")
        .gte("created_at", effectiveStart)
        .lte("created_at", effectiveEnd);

      if (parsedGameId) {
        query = query.eq("game_id", parsedGameId);
      }

      const { data, error } = await query.range(0, 49999);

      if (error) return null;

      const stats = {};
      for (const row of data || []) {
        const uid = row.discord_id;
        if (uid) {
          if (!stats[uid]) stats[uid] = { wins: 0, points: 0 };
          stats[uid].wins += 1;
          stats[uid].points += parseInt(row.points_earned || 0, 10);
        }
      }
      sortedList = Object.entries(stats)
        .map(([uid, s]) => ({ discord_id: uid, wins: s.wins, points: s.points }))
        .sort((a, b) => b.wins - a.wins || b.points - a.points);
    }

    const index = sortedList.findIndex(item => item.discord_id === userId);
    if (index === -1) {
      return { rank: null, totalPlayers: sortedList.length, wins: 0, points: 0 };
    }

    return {
      rank: index + 1,
      totalPlayers: sortedList.length,
      wins: parseInt(sortedList[index].wins || 0, 10),
      points: parseInt(sortedList[index].points || 0, 10)
    };
  } catch (err) {
    console.error("[resetTop] Error fetching user rank:", err.message);
    return null;
  }
}

// ── ดึงข้อมูล Guild Member (Avatar + Name + Handle + ID) ───────
async function getMemberDetail(guild, userId) {
  try {
    let member = null;
    let user = null;
    let displayName = "—";
    let usernameHandle = "";
    let avatarUrl = null;

    try {
      member = await guild.members.fetch(userId);
      user = member.user;
      displayName = member.displayName || user.globalName || user.username;
      usernameHandle = `@${user.username}`;
      avatarUrl = member.displayAvatarURL({ size: 256, extension: "png", forceStatic: true });
    } catch {
      if (guild?.client) {
        user = await guild.client.users.fetch(userId).catch(() => null);
        if (user) {
          displayName = user.globalName || user.username;
          usernameHandle = `@${user.username}`;
          avatarUrl = user.displayAvatarURL({ size: 256, extension: "png", forceStatic: true });
        }
      }
    }

    if (!avatarUrl) {
      avatarUrl = `https://cdn.discordapp.com/embed/avatars/0.png`;
    }

    const idText = userId ? `ID: ${userId}` : "";
    return { avatarUrl, displayName, usernameHandle, idText };
  } catch {
    return {
      avatarUrl: `https://cdn.discordapp.com/embed/avatars/0.png`,
      displayName: "—",
      usernameHandle: "",
      idText: userId ? `ID: ${userId}` : ""
    };
  }
}

// ── Helper สำหรับวาด Rounded Rectangle ใน Canvas ──────────────
function drawRoundedRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// ── Font Fallback รวมฟอนต์ภาษาไทยและ Emoji สำหรับ Canvas ────
const FONT_FALLBACK = '"Noto Sans Thai", "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", "Segoe UI Symbol", "Segoe UI", Arial, sans-serif';

// ── Helper ตัดข้อความยาวเกินไปใน Canvas (รองรับ Emoji & Unicode) ─
function truncateText(ctx, text, maxWidth, font) {
  ctx.font = font;
  if (!text) return "";
  // กรอง Discord custom emoji syntax <:name:id> หรือ <a:name:id> ออกเพื่อไม่ให้แสดง ID ดิบ
  let cleanText = String(text).replace(/<a?:(\w+):\d+>/g, "$1").trim();
  // แปลงตัวอักษรแบบพิเศษ (เช่น Mathematical Alphanumeric) ให้อ่านได้ในทุกฟอนต์ และตัด invisible characters
  cleanText = cleanText.normalize("NFKD").replace(/[\u200B-\u200D\uFEFF]/g, "").trim();

  if (ctx.measureText(cleanText).width <= maxWidth) return cleanText;

  // ตัดตัวอักษรแบบ Unicode code points เพื่อป้องกัน Surrogate pair แตก
  const chars = Array.from(cleanText);
  while (chars.length > 0) {
    chars.pop();
    const candidate = chars.join("") + "...";
    if (ctx.measureText(candidate).width <= maxWidth) {
      return candidate;
    }
  }
  return "...";
}

// ── วาด Vector Icon Crown (อันดับ 1) ──────────────────────────
function drawCrownVector(ctx, cx, cy, color) {
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx - 10, cy + 6);
  ctx.lineTo(cx - 12, cy - 6);
  ctx.lineTo(cx - 5, cy - 1);
  ctx.lineTo(cx, cy - 9);
  ctx.lineTo(cx + 5, cy - 1);
  ctx.lineTo(cx + 12, cy - 6);
  ctx.lineTo(cx + 10, cy + 6);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ── วาด Vector Icon Medal (อันดับ 2 & 3) ──────────────────────
function drawMedalVector(ctx, cx, cy, color) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 2;

  // Circle medal
  ctx.beginPath();
  ctx.arc(cx, cy - 2, 7, 0, Math.PI * 2);
  ctx.stroke();

  // Ribbons
  ctx.beginPath();
  ctx.moveTo(cx - 4, cy + 4);
  ctx.lineTo(cx - 7, cy + 11);
  ctx.lineTo(cx - 2, cy + 9);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx + 4, cy + 4);
  ctx.lineTo(cx + 7, cy + 11);
  ctx.lineTo(cx + 2, cy + 9);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

// ── สร้างรูปภาพ Top 1-3 Leaderboard Canvas ตามรูปตัวอย่าง ─────
async function generateTop3Canvas(top3Details, periodText = null) {
  const width = 960;
  const height = 420;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");

  // พื้นหลังมืด
  ctx.fillStyle = "#0A0A0C";
  ctx.fillRect(0, 0, width, height);

  const spots = [
    {
      rank: 1,
      label: "อันดับ 1 [Gold Champion]",
      cx: 480, boxX: 330, boxY: 65, boxW: 300, boxH: 315, r: 24,
      bg: "#141009", border: "#F59E0B", pillBg: "#F59E0B", pillText: "#100C04",
      badgeBg: "#2E1E05", badgeBorder: "#F59E0B", iconType: "crown",
      avatarR: 40, borderW: 3.5,
      detail: top3Details[0] || { displayName: "—", usernameHandle: "", idText: "", wins: 0, points: 0, avatarUrl: null },
      statColor: "#F59E0B", isCenter: true
    },
    {
      rank: 2,
      label: "อันดับ 2 [Silver]",
      cx: 165, boxX: 30, boxY: 115, boxW: 270, boxH: 265, r: 20,
      bg: "#0F1218", border: "#252F3E", pillBg: "#1C2534", pillText: "#B0BEC5",
      badgeBg: "#18202C", badgeBorder: "#37474F", iconType: "medal",
      avatarR: 32, borderW: 3,
      detail: top3Details[1] || { displayName: "—", usernameHandle: "", idText: "", wins: 0, points: 0, avatarUrl: null },
      statColor: "#ECEFF1", isCenter: false
    },
    {
      rank: 3,
      label: "อันดับ 3 [Bronze]",
      cx: 795, boxX: 660, boxY: 115, boxW: 270, boxH: 265, r: 20,
      bg: "#150E09", border: "#4E260F", pillBg: "#6E260E", pillText: "#FF8A65",
      badgeBg: "#2B1408", badgeBorder: "#7C2D12", iconType: "medal",
      avatarR: 32, borderW: 3,
      detail: top3Details[2] || { displayName: "—", usernameHandle: "", idText: "", wins: 0, points: 0, avatarUrl: null },
      statColor: "#FF8A65", isCenter: false
    }
  ];

  for (const s of spots) {
    ctx.save();

    // แสงเรืองแสงสีทองสำหรับการ์ดอันดับ 1
    if (s.isCenter) {
      ctx.shadowColor = "rgba(245, 158, 11, 0.25)";
      ctx.shadowBlur = 20;
    }

    // กรอบการ์ด
    drawRoundedRect(ctx, s.boxX, s.boxY, s.boxW, s.boxH, s.r);
    ctx.fillStyle = s.bg;
    ctx.fill();
    ctx.lineWidth = s.isCenter ? 2.5 : 2;
    ctx.strokeStyle = s.border;
    ctx.stroke();
    ctx.restore();

    // วงกลมไอคอนด้านบนสุดของการ์ด
    const badgeR = s.isCenter ? 26 : 22;
    const badgeY = s.boxY - 8;
    ctx.save();
    ctx.beginPath();
    ctx.arc(s.cx, badgeY, badgeR, 0, Math.PI * 2);
    ctx.fillStyle = s.badgeBg;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = s.badgeBorder;
    ctx.stroke();

    // วาดไอคอน Crown หรือ Medal
    if (s.iconType === "crown") {
      drawCrownVector(ctx, s.cx, badgeY, s.border);
    } else {
      drawMedalVector(ctx, s.cx, badgeY, s.pillText);
    }
    ctx.restore();

    // Pill Badge หัวข้ออันดับ
    const nameFontPill = `bold ${s.isCenter ? 13 : 12}px ${FONT_FALLBACK}`;
    ctx.font = nameFontPill;
    const textMetrics = ctx.measureText(s.label);
    const pillW = textMetrics.width + 30;
    const pillH = s.isCenter ? 28 : 24;
    const pillX = s.cx - pillW / 2;
    const pillY = badgeY + badgeR + 12;

    drawRoundedRect(ctx, pillX, pillY, pillW, pillH, pillH / 2);
    ctx.fillStyle = s.pillBg;
    ctx.fill();
    if (!s.isCenter) {
      ctx.strokeStyle = s.border;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    ctx.fillStyle = s.pillText;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(s.label, s.cx, pillY + pillH / 2);

    // ดึงรูปโปรไฟล์ Avatar
    const avatarY = pillY + pillH + s.avatarR + 14;
    let avatarImg = null;
    if (s.detail.avatarUrl) {
      try {
        avatarImg = await loadImage(s.detail.avatarUrl);
      } catch (e1) {
        try {
          const res = await fetch(s.detail.avatarUrl, { signal: AbortSignal.timeout(4000) });
          if (res.ok) {
            const arrayBuf = await res.arrayBuffer();
            avatarImg = await loadImage(Buffer.from(arrayBuf));
          }
        } catch (e2) {
          try {
            const res = await axios.get(s.detail.avatarUrl, {
              responseType: "arraybuffer",
              timeout: 4000,
              headers: { "User-Agent": "BearCafeBot/1.0" }
            });
            avatarImg = await loadImage(Buffer.from(res.data));
          } catch (e3) {
            console.warn(`[resetTop] Unable to load avatar for ${s.detail.idText || s.rank}:`, e3.message);
          }
        }
      }
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(s.cx, avatarY, s.avatarR, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (avatarImg) {
      ctx.drawImage(avatarImg, s.cx - s.avatarR, avatarY - s.avatarR, s.avatarR * 2, s.avatarR * 2);
    } else {
      ctx.fillStyle = "#1A181C";
      ctx.fill();
      ctx.fillStyle = "#94A3B8";
      ctx.font = `bold ${Math.round(s.avatarR * 0.7)}px ${FONT_FALLBACK}`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const initial = (s.detail.displayName || "?")[0] || "?";
      ctx.fillText(initial.toUpperCase(), s.cx, avatarY + 2);
    }
    ctx.restore();

    // วาดขอบวงกลมรูปโปรไฟล์
    ctx.save();
    ctx.beginPath();
    ctx.arc(s.cx, avatarY, s.avatarR, 0, Math.PI * 2);
    ctx.lineWidth = s.borderW;
    ctx.strokeStyle = s.border;
    if (s.isCenter) {
      ctx.shadowColor = s.border;
      ctx.shadowBlur = 10;
    }
    ctx.stroke();
    ctx.restore();

    // แสดงชื่อ Display Name
    const fontName = `bold ${s.isCenter ? 16 : 14}px ${FONT_FALLBACK}`;
    const displayTitle = truncateText(ctx, s.detail.displayName, s.boxW - 24, fontName);
    ctx.fillStyle = "#FFFFFF";
    ctx.font = fontName;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const nameY = avatarY + s.avatarR + 10;
    ctx.fillText(displayTitle, s.cx, nameY);

    // แสดง Username Handle & ID
    let currentY = nameY + (s.isCenter ? 20 : 18);
    if (s.detail.usernameHandle) {
      ctx.fillStyle = s.isCenter ? "#9E9793" : "#64748B";
      ctx.font = `12px ${FONT_FALLBACK}`;
      ctx.fillText(s.detail.usernameHandle, s.cx, currentY);
      currentY += 16;
    }
    if (s.detail.idText) {
      ctx.fillStyle = s.isCenter ? "#756E6A" : "#475569";
      ctx.font = `11px ${FONT_FALLBACK}`;
      ctx.fillText(s.detail.idText, s.cx, currentY);
    }

    // แสดงผล ชนะ X ครั้ง [Y แต้ม] ด้านล่างสุด (ใส่ลูกน้ำตัวเลข)
    const winsFormatted = (Number(s.detail.wins) || 0).toLocaleString();
    const pointsFormatted = (Number(s.detail.points) || 0).toLocaleString();
    const statsText = `ชนะ ${winsFormatted} ครั้ง [${pointsFormatted} แต้ม]`;
    ctx.fillStyle = s.statColor;
    ctx.font = `bold ${s.isCenter ? 16 : 14}px ${FONT_FALLBACK}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(statsText, s.cx, s.boxY + s.boxH - 16);
  }

  return canvas.toBuffer("image/png");
}

const GAME_LIST = [
  { label: "รวมทุกเกม (Overall)", value: "all", emoji: "🏆" },
  { label: "เติมคำศัพท์ (ไทย)", value: "1", emoji: "🇹🇭" },
  { label: "เติมคำศัพท์ (อังกฤษ)", value: "2", emoji: "🇬🇧" },
  { label: "สุ่มโจทย์คณิตฯ", value: "3", emoji: "🔢" },
  { label: "ทายคำจากคำใบ้", value: "4", emoji: "💡" },
  { label: "ฟังเสียงแล้วพิมพ์ตอบ (อังกฤษ)", value: "5", emoji: "🎧" },
  { label: "พิมพ์คำต่อไปนี้ (ไทย)", value: "6", emoji: "⌨️" },
  { label: "พิมพ์คำต่อไปนี้ (อังกฤษ)", value: "7", emoji: "💻" },
  { label: "ทายคำแปลภาษาอังกฤษ", value: "8", emoji: "🌐" },
  { label: "ทายคำแปลภาษาไทย", value: "9", emoji: "🇹🇭" },
  { label: "เกมต่อคำ", value: "10", emoji: "🔗" },
  { label: "ฟังเสียงแล้วพิมพ์ตอบ (ไทย)", value: "11", emoji: "🔊" },
  { label: "จริงหรือเท็จ", value: "12", emoji: "❓" },
  { label: "เรียงประโยคภาษาอังกฤษ", value: "13", emoji: "🔤" }
];

// ── สร้าง Component V2 Payload สำหรับกระดานจัดอันดับ ───────────────
async function buildTopLeaderboardPayload(guild, supabase, options = {}) {
  const activePeriod = options.isMonthly
    ? getBangkokCurrentMonthPeriod()
    : getCurrentActivePeriod();

  const effectiveStart = options.startTime || activePeriod.startTime;
  const effectiveEnd = options.endTime || activePeriod.endTime;

  const top10 = await fetchTopMinigameWins(supabase, 10, options.gameId || null, effectiveStart, effectiveEnd);

  // สัญลักษณ์อันดับ
  const rankEmojis = [
    "<a:top_one:1150848398774247564>",
    "<a:top_two:1150848396190568448>",
    "<a:top_three:1150849072299769896>",
    "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"
  ];

  function formatRankLine(index, user) {
    const emoji = rankEmojis[index];
    if (user && user.discord_id) {
      const winsStr = (Number(user.wins) || 0).toLocaleString();
      const pointsStr = (Number(user.points) || 0).toLocaleString();
      return `- ${emoji} <@${user.discord_id}> — **<:15394trophy:1567879322537164820> __${winsStr}__ <:strawberryv2:1520439075100688614> __${pointsStr}__**`;
    }
    return `- ${emoji} <@0> — **<:15394trophy:1567879322537164820> __0__ <:strawberryv2:1520439075100688614> __0__**`;
  }

  const top1to3Lines = [
    formatRankLine(0, top10[0]),
    formatRankLine(1, top10[1]),
    formatRankLine(2, top10[2])
  ].join("\n");

  const top4to6Lines = [
    formatRankLine(3, top10[3]),
    formatRankLine(4, top10[4]),
    formatRankLine(5, top10[5])
  ].join("\n");

  const top7to10Lines = [
    formatRankLine(6, top10[6]),
    formatRankLine(7, top10[7]),
    formatRankLine(8, top10[8]),
    formatRankLine(9, top10[9])
  ].join("\n");

  const monthName = activePeriod.monthName || "พฤศจิกายน";
  const year = activePeriod.year || 2026;
  const lastDay = activePeriod.lastDay || 30;
  const nextMonthReportDate = activePeriod.nextMonthReportDate || "1 ธันวาคม 2026";

  const rulesContent = `## <:bee20000:1256669436350562355>︲__\` 𝖱𝖺𝗇𝗄 𝗍𝗁𝖾 𝗐𝗂𝗇𝗇𝖾𝗋𝗌 ₊ จัดอันดับประจำเดือน${monthName} 𓂃 \`__\n` +
    `-# 1. **ระยะเวลากิจกรรม:** 1 ${monthName} ${year} – ${lastDay} ${monthName} ${year} เวลา 23:59 น.\n` +
    `-# 2. **มูลค่าของรางวัล:** มูลค่าที่ระบุเป็นเพียงมูลค่าประกอบการแสดงผล ไม่สามารถแลกเปลี่ยนหรือทดแทนเป็นเงินสดได้\n` +
    `-# 3. **การรับรางวัล:** ผู้ได้รับรางวัลต้องมารายงานตัวในวันที่ **${nextMonthReportDate}** ผ่านห้อง <#1524124116053917747> พร้อมแนบภาพหน้าจอจากห้อง <#1524123305471115287> เพื่อยืนยันสิทธิ์\n` +
    `-# 4. **ระยะเวลารับรางวัล:** ผู้ได้รับรางวัลมีเวลา **7 วันนับจากวันที่ ${nextMonthReportDate}** ในการยืนยันและรับรางวัล หากพ้นกำหนดจะถือว่าสละสิทธิ์\n` +
    `-# 5. **การยืนยันสิทธิ์:** ต้องแสดงหลักฐานให้ครบถ้วนตามที่กำหนด จึงจะสามารถรับรางวัลได้`;

  const prize1Content = `## <:68492gift:1276130500410605609> : ห้องส่วนตัว 3 เดือน มูลค่า <:bankmoney:1567217849968234658> __117 บาท__\n${top1to3Lines}`;
  const prize2Content = `## <:68492gift:1276130500410605609> : ยศตกแต่ง 5 ยศ มูลค่า <:bankmoney:1567217849968234658> __75 บาท__\n${top4to6Lines}`;
  const prize3Content = `## <:68492gift:1276130500410605609> : บอทคุโบะพรีเมียมขั้น 1 <:22594lootbox:1538601553542512701> __4 รางวัล__\n${top7to10Lines}`;

  const resetTimestamp = lastResetAt ? Math.floor(lastResetAt / 1000) : Math.floor(Date.now() / 1000);
  const resetText = `<t:${resetTimestamp}:F>`;

  const body = {
    flags: 32768,
    components: [
      {
        type: 17,
        components: [
          {
            type: 12,
            items: [
              {
                media: {
                  url: LEADERBOARD_BANNER_URL
                }
              }
            ]
          },
          {
            type: 10,
            content: rulesContent
          },
          {
            type: 14,
            spacing: 2,
            divider: true
          },
          {
            type: 10,
            content: prize1Content
          },
          {
            type: 14,
            spacing: 1,
            divider: true
          },
          {
            type: 10,
            content: prize2Content
          },
          {
            type: 14,
            spacing: 1,
            divider: true
          },
          {
            type: 10,
            content: prize3Content
          },
          {
            type: 14,
            spacing: 1,
            divider: false
          },
          {
            type: 9,
            components: [
              {
                type: 10,
                content: "> <:15394trophy:1567879322537164820> **เช็กอันดับตัวเอง:** *คลิกปุ่มเพื่อดูอันดับของคุณ*"
              }
            ],
            accessory: {
              style: 1,
              type: 2,
              label: "อันดับของฉัน",
              custom_id: "minigame_my_rank",
              flow: {
                actions: []
              }
            }
          },
          {
            type: 9,
            components: [
              {
                type: 10,
                content: `> <a:7596clock:1160230591892029510> **รีเซ็ตข้อมูลล่าสุด:** ${resetText}`
              }
            ],
            accessory: {
              style: 2,
              type: 2,
              emoji: {
                name: "🔄"
              },
              custom_id: "minigame_top_refresh"
            }
          }
        ]
      }
    ]
  };

  return { payload: body, attachment: null };
}

// ── สร้างการ์ดประกาศผลผู้ชนะ Season 1 (Final Announcement Card) ───────
async function buildSeasonFinalAnnouncementPayload(guild, supabase) {
  // ดึง Top 10 ของ Season 1 (1 ส.ค. - 10 ก.ย. 23:59:59)
  const top10 = await fetchTopMinigameWins(supabase, 10, null, SEASON_1_START_ISO, SEASON_1_END_ISO);

  // ดึงรายละเอียด Top 3 สำหรับสร้างภาพ Canvas
  const top3Details = [];
  for (let i = 0; i < Math.min(3, top10.length); i++) {
    const item = top10[i];
    const detail = await getMemberDetail(guild, item.discord_id);
    top3Details.push({
      displayName: detail.displayName,
      usernameHandle: detail.usernameHandle,
      idText: detail.idText,
      avatarUrl: detail.avatarUrl,
      wins: item.wins,
      points: item.points
    });
  }

  const imageBuffer = await generateTop3Canvas(top3Details);
  const attachment = new AttachmentBuilder(imageBuffer, { name: "season1_final_top3.png" });

  const pi = sharedConfig.point_icon;
  const pointEmojiStr = pi && pi.id ? `<:${pi.name}:${pi.id}>` : `🍓`;

  const rankEmojis = [
    "<a:top_one:1150848398774247564>",
    "<a:top_two:1150848396190568448>",
    "<a:top_three:1150849072299769896>",
    "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"
  ];

  const lines = [
    "# 🏆︲__` 𝖲𝖾𝖺𝗌𝗈𝗇 𝟣 𝖥𝗂𝗇𝖺𝗅 ₊ สรุปผลการแข่งขันหมีติดเกม! 𓂃 `__",
    `- -# การแข่งขันมินิเกม Season 1 สิ้นสุดลงแล้วอย่างเป็นทางการ (\` ${SEASON_1_PERIOD_TEXT} \`)\n`,
    "### 🎁 สรุปรางวัลประจำ Season 1:",
    "💸 **อันดับ 1-3 :** เงินรางวัล 100 บาท",
    "<:bee20000:1256669436350562355> **อันดับ 4-6 :** ส่วนลดซื้อสินค้า 50% (เลือกได้สินค้าเดียว)",
    `<:strawberryv2:1520439075100688614> **อันดับ 7-10 :** แต้มกิจกรรม 5,000 แต้ม\n`,
    "### 👑 สรุปผลคะแนน 10 อันดับแรกประจำ Season 1:"
  ];

  const mentionsList = [];
  for (let i = 0; i < 10; i++) {
    const emoji = rankEmojis[i];
    if (i < top10.length) {
      const item = top10[i];
      const winsStr = (Number(item.wins) || 0).toLocaleString();
      const pointsStr = (Number(item.points) || 0).toLocaleString();
      lines.push(`${emoji} — <@${item.discord_id}> ชนะ ${winsStr} ครั้ง (${pointEmojiStr} ${pointsStr})`);
      mentionsList.push(`<@${item.discord_id}>`);
    } else {
      lines.push(`${emoji} — <@0> ชนะ 0 ครั้ง (${pointEmojiStr} 0)`);
    }
  }

  lines.push("\n> 💖 **ขอแสดงความยินดีกับผู้ชนะทุกท่าน!**");
  lines.push("> 📌 **คำแนะนำ:** ขอให้ผู้ชนะอันดับ 1 - 10 ทุกท่าน **รอการติดต่อจากทีมงานเพื่อรับรางวัล** นะคะ *(ทีมงานจะติดต่อในเวลาทำการเท่านั้น รบกวนไม่เร่งหรือทักข้อความส่วนตัวเข้ามานะคะ 🐻💖)*");

  const contentText = lines.join("\n");

  const mentionContent = mentionsList.length > 0
    ? `🎉 ขอแสดงความยินดีกับผู้ชนะ Season 1 ทุกท่านด้วยนะคะ! ${mentionsList.join(' ')}`
    : `🎉 ขอแสดงความยินดีกับผู้ชนะ Season 1 ทุกท่านด้วยนะคะ!`;

  const payload = {
    flags: 32768,
    components: [
      {
        type: 17,
        components: [
          {
            type: 12,
            items: [
              {
                media: {
                  url: "attachment://season1_final_top3.png"
                }
              }
            ]
          },
          {
            type: 14,
            spacing: 2
          },
          {
            type: 10,
            content: contentText
          },
          {
            type: 14,
            spacing: 2,
            divider: true
          },
          {
            type: 10,
            content: `-# 🎮 แข่งขันต่อใน **กระดานจัดอันดับประจำเดือนกันยายน** ได้ที่ห้อง <#${LEADERBOARD_CHANNEL_ID}> ทันทีค่ะ!`
          }
        ]
      }
    ]
  };

  return { payload, attachment, mentionContent };
}

// ตัวแปรล็อกในหน่วยความจำเพื่อป้องกันการรันซ้ำ
let hasExecutedTransition = false;

// ── ดำเนินการ Transition สรุปผล Season 1 และสลับสู่ Monthly Leaderboard ─
async function executeSeasonTransition(client, supabase, options = {}) {
  const { force = false } = options;
  if (hasExecutedTransition && !force) {
    console.log("[resetTop] Season transition already executed in this process. Skipping.");
    return { success: false, message: "Already executed" };
  }

  const { getRedis } = require(path.join(rootDir, "state/redisClient"));
  let redis = null;
  try {
    redis = getRedis();
  } catch (e) {
    console.warn("[resetTop] Redis not available:", e.message);
  }

  if (!force && redis) {
    try {
      const alreadyDone = await redis.get("minigame:season_1_announced");
      if (alreadyDone) {
        console.log("[resetTop] Season 1 transition already marked done in Redis.");
        hasExecutedTransition = true;
        return { success: false, message: "Already done in Redis" };
      }
    } catch (e) {
      console.warn("[resetTop] Redis check error:", e.message);
    }
  }

  try {
    const guild = client.guilds.cache.get("1144251788493602848") ||
                  await client.guilds.fetch("1144251788493602848").catch(() => null);
    if (!guild) {
      console.error("[resetTop] Guild 1144251788493602848 not found for season transition!");
      return { success: false, message: "Guild not found" };
    }

    // 1. ส่งการ์ดประกาศผล Season 1 ในห้อง 🎀︰ประกาศอีเว้นท์ (1524123305471115287)
    console.log("[resetTop] 📢 Building Season 1 final announcement card...");
    const announceCh = guild.channels.cache.get(EVENT_ANNOUNCE_CHANNEL_ID) ||
                       await guild.channels.fetch(EVENT_ANNOUNCE_CHANNEL_ID).catch(() => null);

    if (announceCh && announceCh.isTextBased()) {
      const { payload: announcePayload, attachment: announceAttachment, mentionContent } = await buildSeasonFinalAnnouncementPayload(guild, supabase);
      if (mentionContent) {
        await announceCh.send({ content: mentionContent });
      }
      await announceCh.send({ ...announcePayload, files: [announceAttachment] });
      console.log(`[resetTop] ✅ Season 1 final announcement card sent to #${announceCh.name} (${EVENT_ANNOUNCE_CHANNEL_ID})!`);
    } else {
      console.warn(`[resetTop] ⚠️ Could not find event announcement channel ${EVENT_ANNOUNCE_CHANNEL_ID}`);
    }

    // 2. อัปเดตกระดานคะแนนในห้อง 🏆︰จัดอันดับหมีติดเกม (1535546990711283743) ให้กลายเป็น Monthly
    console.log("[resetTop] 🔄 Updating leaderboard message to Monthly mode...");
    const leaderboardCh = guild.channels.cache.get(LEADERBOARD_CHANNEL_ID) ||
                          await guild.channels.fetch(LEADERBOARD_CHANNEL_ID).catch(() => null);

    if (leaderboardCh && leaderboardCh.isTextBased()) {
      const { payload: monthlyPayload, attachment: monthlyAttachment } = await buildTopLeaderboardPayload(guild, supabase, { isMonthly: true });
      const targetMsg = await leaderboardCh.messages.fetch(LEADERBOARD_MESSAGE_ID).catch(() => null);

      if (targetMsg) {
        await targetMsg.edit({ ...monthlyPayload, files: monthlyAttachment ? [monthlyAttachment] : [] });
        console.log(`[resetTop] ✅ Existing leaderboard message ${LEADERBOARD_MESSAGE_ID} updated to Monthly!`);
      } else {
        const newMsg = await leaderboardCh.send({ ...monthlyPayload, files: monthlyAttachment ? [monthlyAttachment] : [] });
        console.log(`[resetTop] ⚠️ Existing message not found. Posted new monthly leaderboard message ${newMsg.id}!`);
      }
    } else {
      console.warn(`[resetTop] ⚠️ Could not find leaderboard channel ${LEADERBOARD_CHANNEL_ID}`);
    }

    hasExecutedTransition = true;
    if (redis) {
      await redis.set("minigame:season_1_announced", "true").catch(() => {});
    }

    return { success: true };
  } catch (err) {
    console.error("[resetTop] ❌ Error executing season transition:", err);
    return { success: false, error: err.message };
  }
}

// เพดานเวลาสูงสุดในแต่ละรอบการตั้งเวลาเพื่อป้องกัน Node.js 32-bit signed integer overflow (ขีดจำกัดสูงสุดคือ ~24.85 วัน)
const MAX_SAFE_TIMEOUT_MS = 24 * 60 * 60 * 1000; // ตรวจสอบและหน่วงเวลาทีละไม่เกิน 24 ชั่วโมง

// ── ตั้งเวลาอัตโนมัติ 23:59:59 คืนนี้เพื่อเปลี่ยนผ่านซีซั่น ──────────
function scheduleSeasonTransition(client, supabase) {
  const endTime = new Date(SEASON_1_END_ISO).getTime();
  const msUntilEnd = endTime - Date.now();

  if (msUntilEnd > 0) {
    if (msUntilEnd > MAX_SAFE_TIMEOUT_MS) {
      setTimeout(() => {
        scheduleSeasonTransition(client, supabase);
      }, MAX_SAFE_TIMEOUT_MS);
      return;
    }

    const minutesLeft = Math.round(msUntilEnd / 1000 / 60);
    console.log(`[resetTop] ⏰ Season 1 transition scheduled in ${minutesLeft} minutes (at 23:59:59 tonight)`);

    setTimeout(async () => {
      console.log(`[resetTop] 🔔 It is 23:59:59! Starting automated Season 1 -> Monthly transition...`);
      await executeSeasonTransition(client, supabase);
    }, msUntilEnd);
  } else {
    // หากบอทเริ่มทำงานหลัง 23:59:59 ให้ตรวจเช็กเพื่อรันย้อนหลังครั้งเดียว
    setTimeout(async () => {
      await executeSeasonTransition(client, supabase);
    }, 5000);
  }
}

// ── ตั้งเวลาอัตโนมัติ 23:59:59 ทุกคืนวันสิ้นเดือนเพื่อส่งสรุป 1-10 และอัปเดต Monthly Leaderboard ──
function scheduleMonthlyTransition(client, supabase) {
  try {
    const period = getBangkokCurrentMonthPeriod();
    const endMs = new Date(period.endTime).getTime();
    const now = Date.now();
    let msUntilEnd = endMs - now;

    if (msUntilEnd <= 0) {
      msUntilEnd = 5000;
    }

    // หากระยะเวลาถึงสิ้นเดือนนานกว่า 24 ชั่วโมง ให้หน่วงเวลาทีละ 24 ชม. แล้วคำนวณใหม่ ป้องกัน 32-bit integer overflow (> 24.85 วัน)
    if (msUntilEnd > MAX_SAFE_TIMEOUT_MS) {
      const daysLeft = (msUntilEnd / (1000 * 60 * 60 * 24)).toFixed(1);
      console.log(`[resetTop] ⏰ Monthly transition is in ~${daysLeft} days. Sleeping for 24h before re-checking...`);
      setTimeout(() => {
        scheduleMonthlyTransition(client, supabase);
      }, MAX_SAFE_TIMEOUT_MS);
      return;
    }

    const minutesLeft = Math.round(msUntilEnd / 1000 / 60);
    console.log(`[resetTop] ⏰ Monthly leaderboard transition scheduled in ${minutesLeft} minutes (for end of month at 23:59:59)`);

    setTimeout(async () => {
      console.log(`[resetTop] 🔔 End of month reached! Sending top 10 summary and auto-refreshing monthly leaderboard...`);
      try {
        const guild = client.guilds.cache.get("1144251788493602848") ||
                      await client.guilds.fetch("1144251788493602848").catch(() => null);

        // 1. ดึงข้อมูล 1-10 อันดับของเดือนที่เพิ่งสิ้นสุด
        const currentPeriod = getBangkokCurrentMonthPeriod();
        const top10 = await fetchTopMinigameWins(supabase, 10, null, currentPeriod.startTime, currentPeriod.endTime);

        // 2. ส่งรายชื่อ 1-10 ไปยัง channel 1551533172682919997
        try {
          const summaryCh = client.channels.cache.get(MONTHLY_SUMMARY_CHANNEL_ID) ||
                            await client.channels.fetch(MONTHLY_SUMMARY_CHANNEL_ID).catch(() => null);

          if (summaryCh && summaryCh.isTextBased()) {
            const summaryLines = [
              `🏆 **สรุปผลจัดอันดับหมีติดเกมประจำเดือน${currentPeriod.monthName} ${currentPeriod.year}**`
            ];

            if (!top10 || top10.length === 0) {
              summaryLines.push("*(ไม่มีประวัติผู้ชนะในเดือนนี้)*");
            } else {
              for (let i = 0; i < top10.length; i++) {
                const item = top10[i];
                const winsStr = (Number(item.wins) || 0).toLocaleString();
                const pointsStr = (Number(item.points) || 0).toLocaleString();
                summaryLines.push(`${i + 1}. <@${item.discord_id}> ชนะ ${winsStr} แต้ม ${pointsStr}`);
              }
            }

            await summaryCh.send({ content: summaryLines.join("\n") });
            console.log(`[resetTop] ✅ Monthly top 10 summary sent to #${summaryCh.name || MONTHLY_SUMMARY_CHANNEL_ID}`);
          } else {
            console.warn(`[resetTop] ⚠️ Could not find monthly summary channel ${MONTHLY_SUMMARY_CHANNEL_ID}`);
          }
        } catch (sumErr) {
          console.error("[resetTop] Error sending monthly top 10 summary:", sumErr.message);
        }

        // 3. อัปเดตกระดานคะแนนในห้อง LEADERBOARD_CHANNEL_ID
        if (guild) {
          const leaderboardCh = guild.channels.cache.get(LEADERBOARD_CHANNEL_ID) ||
                                await guild.channels.fetch(LEADERBOARD_CHANNEL_ID).catch(() => null);
          if (leaderboardCh && leaderboardCh.isTextBased()) {
            const { payload: monthlyPayload, attachment: monthlyAttachment } = await buildTopLeaderboardPayload(guild, supabase, { isMonthly: true });
            const targetMsg = await leaderboardCh.messages.fetch(LEADERBOARD_MESSAGE_ID).catch(() => null);
            if (targetMsg) {
              await targetMsg.edit({ ...monthlyPayload, files: monthlyAttachment ? [monthlyAttachment] : [] });
              console.log(`[resetTop] ✅ Monthly leaderboard auto-updated for message ${LEADERBOARD_MESSAGE_ID}`);
            }
          }
        }
      } catch (err) {
        console.error("[resetTop] Error in auto monthly leaderboard transition:", err.message);
      } finally {
        // วนลูปตั้งเวลาสำหรับสิ้นเดือนถัดไปต่อเนื่อง
        setTimeout(() => {
          scheduleMonthlyTransition(client, supabase);
        }, 5000);
      }
    }, msUntilEnd);
  } catch (err) {
    console.error("[resetTop] Failed to schedule monthly transition:", err.message);
  }
}

// ══════════════════════════════════════════════════════════════
//  setupResetTop — เชื่อมกับ client
// ══════════════════════════════════════════════════════════════
function setupResetTop(client, supabaseClient) {
  const supabase = supabaseClient || createProtectedSupabaseClient(
    process.env.POINTS_SUPABASE_URL || process.env.SUPABASE_URL,
    process.env.POINTS_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } },
    "leaderboard"
  );

  // ตั้งเวลา Transition สู่ Monthly อัตโนมัติ ณ 23:59:59
  scheduleSeasonTransition(client, supabase);
  // ตั้งเวลาตัดรอบประจำเดือนอัตโนมัติทุกสิ้นเดือน
  scheduleMonthlyTransition(client, supabase);

  // (คำสั่งสร้างกระดานจัดอันดับ b!reset-top ถูกย้ายไปเป็น Slash Command /send-component [Owner Only])

  // 2. Interaction: ปุ่ม 🔄 refresh
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId !== "minigame_top_refresh") return;

    const now = Date.now();
    const diff = now - lastResetAt;

    if (lastResetAt > 0 && diff < REFRESH_COOLDOWN_MS) {
      const nextTs = Math.floor((lastResetAt + REFRESH_COOLDOWN_MS) / 1000);
      return safeRespond(interaction, {
        content: `## <:bear_star1:1152782839671169184>︲คุณสามารถกดรีเซ็ตข้อมูลได้อีก <t:${nextTs}:R>`,
        flags: 64
      });
    }

    if (!(await safeDeferUpdate(interaction))) return;

    try {
      lastResetAt = now;
      const { payload, attachment } = await buildTopLeaderboardPayload(interaction.guild, supabase);
      await interaction.editReply({ ...payload, files: attachment ? [attachment] : [] });
    } catch (err) {
      console.error("[resetTop] minigame_top_refresh error:", err);
    }
  });

  // 3. Interaction: ปุ่ม 🏆 อันดับของฉัน
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId !== "minigame_my_rank") return;

    try {
      const userRank = await getUserMinigameRank(supabase, interaction.user.id);
      const username = interaction.member?.displayName || interaction.user.globalName || interaction.user.username;
      const avatarUrl = interaction.user.displayAvatarURL({ extension: "png", size: 512, forceStatic: true });

      if (userRank && userRank.rank) {
        const rankFormatted = Number(userRank.rank).toLocaleString();
        const totalPlayersFormatted = Number(userRank.totalPlayers || 0).toLocaleString();
        const winsFormatted = Number(userRank.wins || 0).toLocaleString();
        const pointsFormatted = Number(userRank.points || 0).toLocaleString();

        return interaction.reply({
          flags: 32768 | 64, // Component V2 + Ephemeral
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `## <:bee20000:1256669436350562355>︲__\` อันดับของคุณ ${username} 𓂃 \`__`
                },
                {
                  type: 14,
                  spacing: 2
                },
                {
                  type: 9,
                  components: [
                    {
                      type: 10,
                      content: `- **\` 📊 อันดับของคุณ \`** *!*\n  - อันดับที่ **${rankFormatted}** (จากผู้เล่นทั้งหมด ${totalPlayersFormatted} คน)\n  - ชนะทั้งหมด: <:15394trophy:1567879322537164820> **__${winsFormatted} ครั้ง__**\n  -  คะแนนรวมที่ได้: <:strawberryv2:1520439075100688614> **__${pointsFormatted} แต้ม__**`
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
                  divider: false
                },
                {
                  type: 1,
                  components: [
                    {
                      type: 2,
                      style: 5,
                      label: "︲เริ่มเล่นมินิเกม",
                      emoji: {
                        id: "1372837492205555812",
                        name: "3602exclamationmarkbubble",
                        animated: true
                      },
                      url: "https://discord.com/channels/1144251788493602848/1534433651482300507"
                    }
                  ]
                }
              ]
            }
          ]
        });
      } else {
        return interaction.reply({
          flags: 32768 | 64, // Component V2 + Ephemeral
          components: [
            {
              type: 17,
              components: [
                {
                  type: 10,
                  content: `## <:lowwarning:1548772721679278180>︲__\` ไม่พบข้อมูลของ ${username} 𓂃 \`__`
                },
                {
                  type: 14,
                  spacing: 2
                },
                {
                  type: 10,
                  content: "*คุณยังไม่มีประวัติการชนะมินิเกมในรอบนี้เลยค่ะ มาลองร่วมสนุกเล่นมินิเกมเพื่อสะสมชัยชนะกันนะคะ!*"
                },
                {
                  type: 14,
                  divider: false
                },
                {
                  type: 1,
                  components: [
                    {
                      type: 2,
                      style: 5,
                      label: "︲เริ่มเล่นมินิเกม",
                      emoji: {
                        id: "1372837492205555812",
                        name: "3602exclamationmarkbubble",
                        animated: true
                      },
                      url: "https://discord.com/channels/1144251788493602848/1534433651482300507"
                    }
                  ]
                }
              ]
            }
          ]
        });
      }
    } catch (err) {
      console.error("[resetTop] minigame_my_rank error:", err);
      safeRespond(interaction, {
        content: "❌ เกิดข้อผิดพลาดในการโหลดข้อมูลอันดับของคุณค่ะ",
        flags: 64
      }).catch(() => { });
    }
  });

  // 4. Interaction: StringSelectMenu minigame_select_filter (ดูอันดับรายเกม)
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isStringSelectMenu()) return;
    if (interaction.customId !== "minigame_select_filter") return;

    const selectedValue = interaction.values[0];
    const gameInfo = GAME_LIST.find(g => g.value === selectedValue) || GAME_LIST[0];

    try {
      // 1. ดึง Top 10 ของเกมที่เลือกตาม Active Period
      const top10 = await fetchTopMinigameWins(supabase, 10, selectedValue);
      // 2. ดึงอันดับของผู้ใช้งานที่กดเลือก
      const userRank = await getUserMinigameRank(supabase, interaction.user.id, selectedValue);

      const pi = sharedConfig.point_icon;
      const pointEmojiStr = pi && pi.id ? `<:${pi.name}:${pi.id}>` : `🍓`;

      const rankEmojis = [
        "<a:top_one:1150848398774247564>",
        "<a:top_two:1150848396190568448>",
        "<a:top_three:1150849072299769896>",
        "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"
      ];

      const lines = [];
      for (let i = 0; i < 10; i++) {
        const emoji = rankEmojis[i];
        if (i < top10.length) {
          const item = top10[i];
          const winsStr = (Number(item.wins) || 0).toLocaleString();
          const pointsStr = (Number(item.points) || 0).toLocaleString();
          lines.push(`${emoji} — <@${item.discord_id}> ชนะ ${winsStr} ครั้ง (${pointEmojiStr} ${pointsStr})`);
        } else {
          lines.push(`${emoji} — <@0> ชนะ 0 ครั้ง (${pointEmojiStr} 0)`);
        }
      }

      // ข้อความอันดับผู้เล่น
      let userRankText = '';
      if (userRank && userRank.rank) {
        const rankBadge = userRank.rank === 1 ? "🥇" : userRank.rank === 2 ? "🥈" : userRank.rank === 3 ? "🥉" : "📊";
        const winsStr = (Number(userRank.wins) || 0).toLocaleString();
        const pointsStr = (Number(userRank.points) || 0).toLocaleString();
        const totalPStr = (Number(userRank.totalPlayers) || 0).toLocaleString();
        userRankText = `👤 **อันดับของคุณ (<@${interaction.user.id}>) ในเกมนี้:**\n${rankBadge} **อันดับที่ ${userRank.rank}** (จาก ${totalPStr} คน) | ⚔️ **ชนะ ${winsStr} ครั้ง** (${pointEmojiStr} **${pointsStr} แต้ม**)`;
      } else {
        userRankText = `👤 **อันดับของคุณ (<@${interaction.user.id}>):** ยังไม่มีประวัติการชนะในเกมนี้ค่ะ 🎮`;
      }

      // ตอบกลับแบบ Component V2 (32768) + Ephemeral (64)
      await interaction.reply({
        flags: 32768 | 64,
        components: [
          {
            type: 17,
            components: [
              {
                type: 12,
                items: [
                  {
                    media: {
                      url: LEADERBOARD_BANNER_URL
                    }
                  }
                ]
              },
              { type: 14, spacing: 2, divider: true },
              {
                type: 10,
                content: `## ${gameInfo.emoji}︲__\` 𝖫𝖾𝖺𝖽𝖾𝗋𝖻𝗈𝖺𝗋𝖽 ₊ ${gameInfo.label} 𓂃 \`__\n` + lines.join("\n")
              },
              { type: 14, spacing: 2, divider: true },
              {
                type: 10,
                content: userRankText
              }
            ]
          }
        ]
      });

      // รีเซ็ตตัวเลือกใน SelectMenu บนข้อความหลัก เพื่อให้สามารถกดเลือก Option เดิมซ้ำได้ใหม่
      if (interaction.message) {
        const updatedComponents = interaction.message.components.map(row => {
          const rowJson = row.toJSON();
          if (rowJson.type === 1 && Array.isArray(rowJson.components)) {
            rowJson.components = rowJson.components.map(comp => {
              if (comp.custom_id === 'minigame_select_filter') {
                return {
                  ...comp,
                  options: comp.options.map(opt => ({ ...opt, default: false }))
                };
              }
              return comp;
            });
          }
          return rowJson;
        });

        await interaction.message.edit({ components: updatedComponents }).catch(() => { });
      }
    } catch (err) {
      console.error("[resetTop] minigame_select_filter error:", err);
      safeRespond(interaction, {
        content: "❌ เกิดข้อผิดพลาดในการโหลดจัดอันดับรายเกมค่ะ",
        flags: 64
      }).catch(() => { });
    }
  });
}

module.exports = {
  setupResetTop,
  executeSeasonTransition,
  buildSeasonFinalAnnouncementPayload,
  buildTopLeaderboardPayload,
  fetchTopMinigameWins,
  getUserMinigameRank,
  getBangkokCurrentMonthPeriod,
  getCurrentActivePeriod
};
