// src/features/minigames/resetTop.js — คำสั่ง b!reset-top จัดอันดับหมีติดเกม!
const { createClient } = require("@supabase/supabase-js");
const { AttachmentBuilder } = require("discord.js");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const path = require("path");
const rootDir = path.resolve(__dirname, __dirname.includes("src" + path.sep + "main") ? "../../../.." : "../../..");
const sharedConfig = require(path.join(rootDir, "src/sharedSettings.json"));
const { safeDeferUpdate, safeRespond } = require(path.join(rootDir, "utils/discordSafety"));
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
const MONTHLY_START_ISO = "2026-09-01T00:00:00+07:00";
const MONTHLY_END_ISO = "2026-09-30T23:59:59+07:00";
const MONTHLY_PERIOD_TEXT = "1 ก.ย. 2026 – 30 ก.ย. 2026 (23:59 น.)";

// ── Channel & Message Constants ───
const EVENT_ANNOUNCE_CHANNEL_ID = "1524123305471115287"; // 🎀︰ประกาศอีเว้นท์
const LEADERBOARD_CHANNEL_ID = "1535546990711283743";    // 🏆︰จัดอันดับหมีติดเกม
const LEADERBOARD_MESSAGE_ID = "1536940318761558057";    // ข้อความบอร์ดเดิมที่จะ Edit

/**
 * ดึงสถานะช่วงเวลาที่กำลัง Active อยู่ในปัจจุบัน
 */
function getCurrentActivePeriod() {
  const isPastSeason1 = Date.now() >= new Date(SEASON_1_END_ISO).getTime();
  if (isPastSeason1) {
    return {
      isMonthly: true,
      startTime: MONTHLY_START_ISO,
      endTime: MONTHLY_END_ISO,
      periodText: MONTHLY_PERIOD_TEXT,
      title: "## <:bee20000:1256669436350562355>︲__` 𝖬𝗈𝗇𝗍𝗁𝗅𝗒 𝖫𝖾𝖺𝖽𝖾𝗋𝖻𝗈𝖺𝗋𝖽 ₊ จัดอันดับประจำเดือนกันยายน 𓂃 `__",
      periodLabel: `📅 **ระยะเวลากระดานประจำเดือน:** \` ${MONTHLY_PERIOD_TEXT} \`\n`
    };
  }
  return {
    isMonthly: false,
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
    const member = await guild.members.fetch(userId);
    const avatarUrl = member.displayAvatarURL({ size: 256, extension: "png" }) ||
      `https://cdn.discordapp.com/embed/avatars/0.png`;
    const displayName = member.displayName || member.user.username;
    const usernameHandle = `@${member.user.username}`;
    const idText = `ID: ${member.id}`;
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

// ── Helper ตัดข้อความยาวเกินไปใน Canvas ───────────────────────
function truncateText(ctx, text, maxWidth, font) {
  ctx.font = font;
  if (ctx.measureText(text).width <= maxWidth) return text;
  let str = text;
  while (str.length > 0 && ctx.measureText(str + "...").width > maxWidth) {
    str = str.slice(0, -1);
  }
  return str + "...";
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

  // วาด Header Pill Badge แจ้งเตือนระยะเวลาแข่งขันที่ด้านบนสุด Canvas
  const activePeriod = getCurrentActivePeriod();
  const effectivePeriod = periodText || activePeriod.periodText;
  const seasonHeaderLabel = periodText
    ? `🏆 SEASON 1 [FINAL]: ${effectivePeriod}`
    : (activePeriod.isMonthly ? `📅 MONTHLY LEADERBOARD: ${effectivePeriod}` : `🎁 SEASON 1: ${effectivePeriod}`);
  ctx.font = 'bold 12px "Noto Sans Thai", "Leelawadee UI", "Segoe UI", sans-serif';
  const headerMetrics = ctx.measureText(seasonHeaderLabel);
  const headerPillW = headerMetrics.width + 36;
  const headerPillH = 26;
  const headerPillX = (width - headerPillW) / 2;
  const headerPillY = 16;

  ctx.save();
  drawRoundedRect(ctx, headerPillX, headerPillY, headerPillW, headerPillH, 13);
  ctx.fillStyle = "#1E1B2E";
  ctx.fill();
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = "#8B5CF6";
  ctx.stroke();

  ctx.fillStyle = "#A78BFA";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(seasonHeaderLabel, width / 2, headerPillY + headerPillH / 2);
  ctx.restore();

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
    const nameFontPill = `bold ${s.isCenter ? 13 : 12}px "Noto Sans Thai", "Leelawadee UI", "Segoe UI", sans-serif`;
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
    let imgBuffer = null;
    if (s.detail.avatarUrl) {
      try {
        const res = await axios.get(s.detail.avatarUrl, {
          responseType: "arraybuffer",
          timeout: 4000,
          headers: { "User-Agent": "BearCafeBot/1.0" }
        });
        imgBuffer = Buffer.from(res.data);
      } catch (e) {
        // เงียบหากดึงรูปไม่ได้
      }
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(s.cx, avatarY, s.avatarR, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (imgBuffer) {
      try {
        const img = await loadImage(imgBuffer);
        ctx.drawImage(img, s.cx - s.avatarR, avatarY - s.avatarR, s.avatarR * 2, s.avatarR * 2);
      } catch {
        ctx.fillStyle = "#1A181C";
        ctx.fill();
      }
    } else {
      ctx.fillStyle = "#1A181C";
      ctx.fill();
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
    const fontName = `bold ${s.isCenter ? 16 : 14}px "Noto Sans Thai", "Leelawadee UI", "Segoe UI", sans-serif`;
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
      ctx.font = '12px "Noto Sans Thai", "Segoe UI", sans-serif';
      ctx.fillText(s.detail.usernameHandle, s.cx, currentY);
      currentY += 16;
    }
    if (s.detail.idText) {
      ctx.fillStyle = s.isCenter ? "#756E6A" : "#475569";
      ctx.font = '11px "Noto Sans Thai", "Segoe UI", sans-serif';
      ctx.fillText(s.detail.idText, s.cx, currentY);
    }

    // แสดงผล ชนะ X ครั้ง [Y แต้ม] ด้านล่างสุด
    const statsText = `ชนะ ${s.detail.wins} ครั้ง [${s.detail.points} แต้ม]`;
    ctx.fillStyle = s.statColor;
    ctx.font = `bold ${s.isCenter ? 16 : 14}px "Noto Sans Thai", "Leelawadee UI", "Segoe UI", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText(statsText, s.cx, s.boxY + s.boxH - 16);
  }

  return canvas.toBuffer("image/png");
}

const GAME_LIST = [
  { label: "รวมทุกเกม (Overall)", value: "all", emoji: "🏆" },
  { label: "1. เติมคำศัพท์ (ไทย)", value: "1", emoji: "🇹🇭" },
  { label: "2. เติมคำศัพท์ (อังกฤษ)", value: "2", emoji: "🇬🇧" },
  { label: "3. สุ่มโจทย์คณิตฯ", value: "3", emoji: "🔢" },
  { label: "4. ทายคำจากคำใบ้", value: "4", emoji: "💡" },
  { label: "5. ฟังเสียงแล้วพิมพ์ตอบ (อังกฤษ)", value: "5", emoji: "🎧" },
  { label: "6. พิมพ์คำต่อไปนี้ (ไทย)", value: "6", emoji: "⌨️" },
  { label: "7. พิมพ์คำต่อไปนี้ (อังกฤษ)", value: "7", emoji: "💻" },
  { label: "8. ทายคำแปลภาษาอังกฤษ", value: "8", emoji: "🌐" },
  { label: "9. ทายคำแปลภาษาไทย", value: "9", emoji: "🇹🇭" },
  { label: "10. เกมต่อคำ", value: "10", emoji: "🔗" },
  { label: "11. ฟังเสียงแล้วพิมพ์ตอบ (ไทย)", value: "11", emoji: "🔊" },
  { label: "12. จริงหรือเท็จ", value: "12", emoji: "❓" }
];

// ── สร้าง Component V2 Payload + รูปภาพแบนเนอร์ สำหรับกระดานจัดอันดับ ───────────────
async function buildTopLeaderboardPayload(guild, supabase, options = {}) {
  const activePeriod = options.isMonthly
    ? {
        isMonthly: true,
        startTime: MONTHLY_START_ISO,
        endTime: MONTHLY_END_ISO,
        periodText: MONTHLY_PERIOD_TEXT,
        title: "## <:bee20000:1256669436350562355>︲__` 𝖬𝗈𝗇𝗍𝗁𝗅𝗒 𝖫𝖾𝖺𝖽𝖾𝗋𝖻𝗈𝖺𝗋𝖽 ₊ จัดอันดับประจำเดือนกันยายน 𓂃 `__",
        periodLabel: `📅 **ระยะเวลากระดานประจำเดือน:** \` ${MONTHLY_PERIOD_TEXT} \`\n`
      }
    : getCurrentActivePeriod();

  const effectiveStart = options.startTime || activePeriod.startTime;
  const effectiveEnd = options.endTime || activePeriod.endTime;

  const top10 = await fetchTopMinigameWins(supabase, 10, options.gameId || null, effectiveStart, effectiveEnd);

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

  // สร้างรูปภาพ Canvas
  const imageBuffer = await generateTop3Canvas(top3Details);
  const attachment = new AttachmentBuilder(imageBuffer, { name: "top_leaderboard.png" });

  // ดึง point_icon จาก sharedSettings.json
  const pi = sharedConfig.point_icon;
  const pointEmojiStr = pi && pi.id ? `<:${pi.name}:${pi.id}>` : `🍓`;

  // สร้างข้อความ Leaderboard 10 อันดับ
  const rankEmojis = [
    "<a:top_one:1150848398774247564>",
    "<a:top_two:1150848396190568448>",
    "<a:top_three:1150849072299769896>",
    "4️⃣", "5️⃣", "6️⃣", "7️⃣", "8️⃣", "9️⃣", "🔟"
  ];

  const lines = [
    activePeriod.title,
    activePeriod.periodLabel
  ];

  for (let i = 0; i < 10; i++) {
    const emoji = rankEmojis[i];
    if (i < top10.length) {
      const item = top10[i];
      lines.push(`${emoji} — <@${item.discord_id}> ชนะ ${item.wins} ครั้ง (${pointEmojiStr} ${item.points})`);
    } else {
      lines.push(`${emoji} — <@0> ชนะ 0 ครั้ง (${pointEmojiStr} 0)`);
    }
  }

  const contentText = lines.join("\n") + "\n";

  const resetText = lastResetAt
    ? `<t:${Math.floor(lastResetAt / 1000)}:F>`
    : "ยังไม่ได้รีเซ็ต";

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
                  url: "attachment://top_leaderboard.png"
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
            spacing: 2
          },
          {
            type: 1,
            components: [
              {
                type: 3,
                custom_id: "minigame_select_filter",
                placeholder: "🔍︲เลือกดูจัดอันดับเฉพาะรายเกม...",
                options: GAME_LIST.map(g => ({
                  label: g.label,
                  value: g.value,
                  emoji: { name: g.emoji }
                }))
              }
            ]
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
                content: `**รีเซ็ตข้อมูลล่าสุด:** ${resetText}`
              }
            ],
            accessory: {
              style: 2,
              type: 2,
              emoji: { name: "🔄" },
              flow: { actions: [] },
              custom_id: "minigame_top_refresh"
            }
          },
          {
            type: 9,
            components: [
              {
                type: 10,
                content: `**เช็กอันดับตัวเอง:** คลิกปุ่มเพื่อดูอันดับของคุณ`
              }
            ],
            accessory: {
              style: 1,
              type: 2,
              label: "︲อันดับของฉัน",
              emoji: { name: "🏆" },
              flow: { actions: [] },
              custom_id: "minigame_my_rank"
            }
          }
        ]
      }
    ]
  };

  return { payload: body, attachment };
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
      lines.push(`${emoji} — <@${item.discord_id}> ชนะ ${item.wins} ครั้ง (${pointEmojiStr} ${item.points})`);
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
    content: mentionContent,
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

  return { payload, attachment };
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
      const { payload: announcePayload, attachment: announceAttachment } = await buildSeasonFinalAnnouncementPayload(guild, supabase);
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
        await targetMsg.edit({ ...monthlyPayload, files: [monthlyAttachment] });
        console.log(`[resetTop] ✅ Existing leaderboard message ${LEADERBOARD_MESSAGE_ID} updated to Monthly!`);
      } else {
        const newMsg = await leaderboardCh.send({ ...monthlyPayload, files: [monthlyAttachment] });
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

// ── ตั้งเวลาอัตโนมัติ 23:59:59 คืนนี้เพื่อเปลี่ยนผ่านซีซั่น ──────────
function scheduleSeasonTransition(client, supabase) {
  const endTime = new Date(SEASON_1_END_ISO).getTime();
  const msUntilEnd = endTime - Date.now();

  if (msUntilEnd > 0) {
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

// ══════════════════════════════════════════════════════════════
//  setupResetTop — เชื่อมกับ client
// ══════════════════════════════════════════════════════════════
function setupResetTop(client, supabaseClient) {
  const supabase = supabaseClient || createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  // ตั้งเวลา Transition สู่ Monthly อัตโนมัติ ณ 23:59:59
  scheduleSeasonTransition(client, supabase);

  // 1. คำสั่งสำหรับ Owner (b!reset-top และ b!force-season-transition)
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (!message.guild) return;

    const content = message.content.trim().toLowerCase();

    // 1.1 บังคับคำนวณและสลับซีซั่นทันที (สำหรับทดสอบ / แมนนวล)
    if (content === "b!force-season-transition") {
      const OWNER_ID = process.env.OWNER_ID;
      const isOwner = message.author.id === OWNER_ID || message.author.id === message.guild.ownerId;
      if (!isOwner) return;

      await message.reply("⏳ กำลังดำเนินการ Season Transition...");
      const res = await executeSeasonTransition(client, supabase, { force: true });
      if (res.success) {
        await message.channel.send("✅ ดำเนินการ Season Transition และสลับสู่ Monthly เรียบร้อยแล้วค่ะ!");
      } else {
        await message.channel.send(`❌ ผลการทำงาน: ${res.error || res.message}`);
      }
      return;
    }

    // 1.2 คำสั่งสร้างบอร์ด b!reset-top
    if (content === "b!reset-top") {
      const OWNER_ID = process.env.OWNER_ID;
      const isOwner = message.author.id === OWNER_ID || message.author.id === message.guild.ownerId;

      if (!isOwner) {
        return message.reply({ content: "❌ คำสั่งนี้ใช้ได้เฉพาะ Owner เท่านั้นค่ะ", flags: 64 });
      }

      try {
        await message.delete().catch(() => { });
        lastResetAt = Date.now();

        const { payload, attachment } = await buildTopLeaderboardPayload(message.guild, supabase);
        await message.channel.send({ ...payload, files: [attachment] });
      } catch (err) {
        console.error("[resetTop] b!reset-top error:", err);
        message.channel.send("❌ เกิดข้อผิดพลาดในการโหลดข้อมูลตารางอันดับค่ะ").catch(() => { });
      }
    }
  });

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
      await interaction.editReply({ ...payload, files: [attachment] });
    } catch (err) {
      console.error("[resetTop] minigame_top_refresh error:", err);
    }
  });

  // 3. Interaction: ปุ่ม 🏆 อันดับของฉัน
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    if (interaction.customId !== "minigame_my_rank") return;

    try {
      const activePeriod = getCurrentActivePeriod();
      const periodName = activePeriod.isMonthly ? "ประจำเดือนกันยายน" : "Season 1";
      const userRank = await getUserMinigameRank(supabase, interaction.user.id);
      const pi = sharedConfig.point_icon;
      const pointEmojiStr = pi && pi.id ? `<:${pi.name}:${pi.id}>` : `🍓`;

      let userRankText = '';
      if (!userRank || !userRank.rank) {
        userRankText = `### <:bee20000:1256669436350562355>︲__\` สถิติจัดอันดับมินิเกม${periodName}ของคุณ 𓂃 \`__\n\n<@${interaction.user.id}> คุณยังไม่มีประวัติการชนะมินิเกมในรอบนี้เลยค่ะ 🎮\nมาลองร่วมสนุกเล่นมินิเกมเพื่อสะสมชัยชนะกันนะคะ!`;
      } else {
        const rankBadge = userRank.rank === 1 ? "🥇" : userRank.rank === 2 ? "🥈" : userRank.rank === 3 ? "🥉" : "📊";
        userRankText = `### <:bee20000:1256669436350562355>︲__\` สถิติจัดอันดับมินิเกม${periodName}ของคุณ 𓂃 \`__\n\n<@${interaction.user.id}>\n${rankBadge} **อันดับของคุณ:** **อันดับที่ ${userRank.rank}** (จากผู้เล่นทั้งหมด ${userRank.totalPlayers} คน)\n⚔️ **ชนะทั้งหมด:** **${userRank.wins}** ครั้ง\n${pointEmojiStr} **คะแนนรวมที่ได้:** **${userRank.points}** แต้ม`;
      }

      return interaction.reply({
        flags: 32768 | 64, // Component V2 + Ephemeral
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: userRankText
              }
            ]
          }
        ]
      });
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
          lines.push(`${emoji} — <@${item.discord_id}> ชนะ ${item.wins} ครั้ง (${pointEmojiStr} ${item.points})`);
        } else {
          lines.push(`${emoji} — <@0> ชนะ 0 ครั้ง (${pointEmojiStr} 0)`);
        }
      }

      // ข้อความอันดับผู้เล่น
      let userRankText = '';
      if (userRank && userRank.rank) {
        const rankBadge = userRank.rank === 1 ? "🥇" : userRank.rank === 2 ? "🥈" : userRank.rank === 3 ? "🥉" : "📊";
        userRankText = `👤 **อันดับของคุณ (<@${interaction.user.id}>) ในเกมนี้:**\n${rankBadge} **อันดับที่ ${userRank.rank}** (จาก ${userRank.totalPlayers} คน) | ⚔️ **ชนะ ${userRank.wins} ครั้ง** (${pointEmojiStr} **${userRank.points} แต้ม**)`;
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
                type: 10,
                content: `### ${gameInfo.emoji}︲__\` 𝖫𝖾𝖺𝖽𝖾𝗋𝖻𝗈𝖺𝗋𝖽 ₊ ${gameInfo.label} 𓂃 \`__`
              },
              { type: 14, spacing: 2 },
              {
                type: 10,
                content: lines.join("\n")
              },
              { type: 14, spacing: 2 },
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
  getUserMinigameRank
};
