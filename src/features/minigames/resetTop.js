// src/features/minigames/resetTop.js — คำสั่ง b!reset-top จัดอันดับหมีติดเกม!
const { createClient } = require("@supabase/supabase-js");
const { AttachmentBuilder } = require("discord.js");
const { createCanvas, loadImage } = require("@napi-rs/canvas");
const axios = require("axios");
const sharedConfig = require("../../sharedSettings.json");
const { safeDeferUpdate, safeRespond } = require("../../../utils/discordSafety");
require("../../utils/fontLoader");

// Cooldown 5 นาที สำหรับปุ่ม 🔄 refresh (ms)
const REFRESH_COOLDOWN_MS = 5 * 60 * 1000;
let lastResetAt = 0; // timestamp ที่กด reset หรือ refresh

// ── ดึงข้อมูล Top Winners จาก minigame_wins (ผ่าน RPC / View / Aggregation) ───
async function fetchTopMinigameWins(supabase, limit = 10) {
  if (!supabase) return [];

  try {
    // 1. ลองเรียก RPC get_minigame_leaderboard ก่อน
    const { data: rpcData, error: rpcError } = await supabase
      .rpc("get_minigame_leaderboard", { days_limit: null, filter_game_id: null });

    if (!rpcError && rpcData && rpcData.length > 0) {
      return rpcData.slice(0, limit).map(row => ({
        discord_id: row.discord_id,
        wins: parseInt(row.wins || 0, 10),
        points: parseInt(row.points || 0, 10)
      }));
    }

    // 2. ถ้า RPC ไม่พร้อม ให้ลองดึงจาก View minigame_leaderboard_summary
    const { data: viewData, error: viewError } = await supabase
      .from("minigame_leaderboard_summary")
      .select("discord_id, wins, points")
      .limit(limit);

    if (!viewError && viewData && viewData.length > 0) {
      return viewData.map(row => ({
        discord_id: row.discord_id,
        wins: parseInt(row.wins || 0, 10),
        points: parseInt(row.points || 0, 10)
      }));
    }

    // 3. Fallback: ดึงจาก minigame_wins พร้อมขยาย range ป้องกันติด limit 1,000 แถว
    const { data, error } = await supabase
      .from("minigame_wins")
      .select("discord_id, points_earned")
      .range(0, 49999);

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
async function getUserMinigameRank(supabase, userId) {
  if (!supabase || !userId) return null;

  try {
    let sortedList = [];

    // 1. ลองเรียก RPC
    const { data: rpcData, error: rpcError } = await supabase
      .rpc("get_minigame_leaderboard", { days_limit: null, filter_game_id: null });

    if (!rpcError && rpcData) {
      sortedList = rpcData.map(row => ({
        discord_id: row.discord_id,
        wins: parseInt(row.wins || 0, 10),
        points: parseInt(row.points || 0, 10)
      }));
    } else {
      // 2. ลองเรียก View
      const { data: viewData, error: viewError } = await supabase
        .from("minigame_leaderboard_summary")
        .select("discord_id, wins, points");

      if (!viewError && viewData) {
        sortedList = viewData.map(row => ({
          discord_id: row.discord_id,
          wins: parseInt(row.wins || 0, 10),
          points: parseInt(row.points || 0, 10)
        }));
      } else {
        // 3. Fallback
        const { data, error } = await supabase
          .from("minigame_wins")
          .select("discord_id, points_earned")
          .range(0, 49999);

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
async function generateTop3Canvas(top3Details) {
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

// ── สร้าง Component V2 Payload + รูปภาพแบนเนอร์ ───────────────
async function buildTopLeaderboardPayload(guild, supabase) {
  const top10 = await fetchTopMinigameWins(supabase, 10);

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
    "## <:bee20000:1256669436350562355>︲__` 𝖫𝖾𝖺𝖽𝖾𝗋𝖻𝗈𝖺𝗋𝖽 ₊ จัดอันดับหมีติดเกม! 𓂃 `__"
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

// ══════════════════════════════════════════════════════════════
//  setupResetTop — เชื่อมกับ client
// ══════════════════════════════════════════════════════════════
function setupResetTop(client, supabaseClient) {
  const supabase = supabaseClient || createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  // 1. คำสั่ง b!reset-top (Owner เท่านั้น)
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (message.content.trim().toLowerCase() !== "b!reset-top") return;
    if (!message.guild) return;

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
      const userRank = await getUserMinigameRank(supabase, interaction.user.id);
      const pi = sharedConfig.point_icon;
      const pointEmojiStr = pi && pi.id ? `<:${pi.name}:${pi.id}>` : `🍓`;

      if (!userRank || !userRank.rank) {
        return safeRespond(interaction, {
          content: `## <:bee20000:1256669436350562355>︲__\` สถิติจัดอันดับมินิเกมของคุณ 𓂃 \`__\n\n<@${interaction.user.id}> คุณยังไม่มีประวัติการชนะมินิเกมเลยค่ะ 🎮\nมาลองร่วมสนุกเล่นมินิเกมเพื่อสะสมชัยชนะกันนะคะ!`,
          flags: 64
        });
      }

      const rankBadge = userRank.rank === 1 ? "🥇" : userRank.rank === 2 ? "🥈" : userRank.rank === 3 ? "🥉" : "📊";

      return safeRespond(interaction, {
        content: `## <:bee20000:1256669436350562355>︲__\` สถิติจัดอันดับมินิเกมของคุณ 𓂃 \`__\n\n<@${interaction.user.id}>\n${rankBadge} **อันดับของคุณ:** **อันดับที่ ${userRank.rank}** (จากผู้เล่นทั้งหมด ${userRank.totalPlayers} คน)\n⚔️ **ชนะทั้งหมด:** **${userRank.wins}** ครั้ง\n${pointEmojiStr} **คะแนนรวมที่ได้:** **${userRank.points}** แต้ม`,
        flags: 64
      });
    } catch (err) {
      console.error("[resetTop] minigame_my_rank error:", err);
      safeRespond(interaction, {
        content: "❌ เกิดข้อผิดพลาดในการโหลดข้อมูลอันดับของคุณค่ะ",
        flags: 64
      }).catch(() => { });
    }
  });
}

module.exports = { setupResetTop };
