// ===================================================
// src/akari/commands/pointsCommands.js
// ระบบคำสั่งเช็กแต้ม (/points) และกระดานจัดอันดับ (/leaderboard) ของ Akari Bot
// ออกแบบตามมาตรฐาน Discord Component V2 (flags: 32768, Container type 17)
// ===================================================

const { MessageFlags } = require("discord.js");
const {
  getTenantLeaderboard,
  getUserTenantRank,
} = require("../minigames/minigamesEngine");
const { getTenantStoreConfig } = require("../store/storeEngine");

const FLAG_V2 = MessageFlags.IsComponentsV2 || 32768;

const DEFAULT_CURRENCY_EMOJI = "<:strawberryv2:1548976664090779650>";
const BEE_HEADER_EMOJI = "<:bee20000:1256669436350562355>";

const TOP_EMOJIS = {
  1: "<a:top_one:1150848398774247564>",
  2: "<a:top_two:1150848396190568448>",
  3: "<a:top_three:1150849072299769896>",
  4: "4️⃣",
  5: "5️⃣",
  6: "6️⃣",
  7: "7️⃣",
  8: "8️⃣",
  9: "9️⃣",
  10: "🔟",
};

/**
 * ดึง Rank Emoji สำหรับหน้าเช็กแต้ม (1-3 ใช้ไอคอนเคลื่อนไหว, อันดับอื่นใช้ 🏅)
 */
function getRankEmojiForPoints(rank) {
  if (rank === 1) return TOP_EMOJIS[1];
  if (rank === 2) return TOP_EMOJIS[2];
  if (rank === 3) return TOP_EMOJIS[3];
  return "🏅";
}

/**
 * สร้าง Component V2 สำหรับหน้าเช็กแต้มผู้เล่น (/points)
 */
function buildUserPointsPayload(targetUser, scoreData, currencyEmoji) {
  const avatarUrl =
    targetUser.displayAvatarURL({ extension: "png", size: 256, forceStatic: false }) ||
    targetUser.defaultAvatarURL;

  const username = targetUser.username || "Unknown";
  const rank = scoreData.rank ?? "-";
  const totalPlayers = scoreData.totalPlayers || 0;
  const points = Number(scoreData.points || 0);
  const wins = Number(scoreData.wins || 0);

  const rankEmoji = getRankEmojiForPoints(rank);
  const rankDisplay =
    rank === "-"
      ? "ยังไม่มีอันดับ *(ยังไม่เคยได้รับแต้ม)*"
      : `**#${rank}** (จากทั้งหมด ${totalPlayers.toLocaleString()} คน)`;

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 9,
            components: [
              {
                type: 10,
                content:
                  `## ${BEE_HEADER_EMOJI}︲__\` 𝖴𝗌𝖾𝗋 𝗉𝗈𝗂𝗇𝗍𝗌 ₊ ข้อมูลคะแนนผู้เล่น 𓂃 \`__\n` +
                  `> 👤⠀**ผู้เล่น:** <@${targetUser.id}> (\`${username}\`)\n` +
                  `> ${rankEmoji}⠀**อันดับเซิร์ฟเวอร์:** ${rankDisplay}\n\n` +
                  `> ${currencyEmoji}⠀**แต้มสะสมปัจจุบัน:** **${points.toLocaleString()}** แต้ม\n` +
                  `> 🎮⠀**สถิติชนะมินิเกม:** **${wins.toLocaleString()}** ครั้ง`,
              },
            ],
            accessory: {
              type: 11,
              media: {
                url: avatarUrl,
              },
            },
          },
          {
            type: 14,
            spacing: 2,
          },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 2,
                custom_id: "akari_view_leaderboard",
                label: "︲กระดานจัดอันดับ",
                emoji: {
                  name: "🏆",
                },
              },
              {
                type: 2,
                style: 2,
                custom_id: "akari_view_store",
                label: "︲ร้านค้าแลกรางวัล (กำลังพัฒนา)",
                emoji: {
                  name: "🛒",
                },
                disabled: true,
              },
            ],
          },
        ],
      },
    ],
  };
}

/**
 * สร้าง Component V2 สำหรับหน้ากระดานจัดอันดับ (/leaderboard)
 */
function buildLeaderboardPayload(guild, leaderboardList, sortBy = "points", currencyEmoji) {
  const isWinsMode = sortBy === "wins";
  const sortModeText = isWinsMode ? "จำนวนชนะสูงสุด" : "แต้มสะสมสูงสุด";

  let listContent = "";
  if (!leaderboardList || leaderboardList.length === 0) {
    listContent = "> *ยังไม่มีข้อมูลคะแนนในเซิร์ฟเวอร์นี้ มาร่วมเล่นมินิเกมสะสมแต้มเป็นคนแรกกันเถอะ! ✨*";
  } else {
    const lines = leaderboardList.map((row, index) => {
      const position = index + 1;
      const emoji = TOP_EMOJIS[position] || `**#${position}**`;
      const pts = Number(row.points || 0).toLocaleString();
      const wins = Number(row.wins || 0).toLocaleString();

      if (isWinsMode) {
        return `${emoji}⠀<@${row.user_id}> — **${wins}** ครั้ง • \`${pts} แต้ม\``;
      }
      return `${emoji}⠀<@${row.user_id}> — **${pts}** ${currencyEmoji} • \`${wins} ชนะ\``;
    });
    listContent = lines.join("\n");
  }

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `## ${BEE_HEADER_EMOJI}︲__\` 𝖫𝖾𝖺𝖽𝖾𝗋𝖻𝗈𝖺𝗋𝖽 ₊ กระดานจัดอันดับมินิเกม 𓂃 \`__\n` +
              `-# จัดอันดับประจำเซิร์ฟเวอร์ • โหมด: **${sortModeText}**`,
          },
          {
            type: 14,
            spacing: 1,
          },
          {
            type: 10,
            content: listContent,
          },
          {
            type: 14,
            spacing: 2,
          },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: isWinsMode ? 2 : 1, // Primary if points active
                custom_id: "akari_lb_by_points",
                label: "︲เรียงตามแต้ม",
                emoji: {
                  name: "💰",
                },
              },
              {
                type: 2,
                style: isWinsMode ? 1 : 2, // Primary if wins active
                custom_id: "akari_lb_by_wins",
                label: "︲เรียงตามจำนวนชนะ",
                emoji: {
                  name: "🎮",
                },
              },
              {
                type: 2,
                style: 2,
                custom_id: "akari_lb_refresh",
                label: "︲รีเฟรช",
                emoji: {
                  name: "🔄",
                },
              },
            ],
          },
        ],
      },
    ],
  };
}

// ─── Command Handlers ────────────────────────────────────────────────────────

/**
 * จัดการคำสั่ง /points
 */
async function handlePointsCommand(interaction, supabase) {
  await interaction.deferReply({ flags: FLAG_V2 }).catch(() => {});

  const guildId = interaction.guildId;
  const targetUser = interaction.options.getUser("user") || interaction.user;

  try {
    const [scoreData, storeConfig] = await Promise.all([
      getUserTenantRank(supabase, guildId, targetUser.id),
      getTenantStoreConfig(supabase, guildId),
    ]);

    const currencyEmoji = storeConfig?.currency_emoji || DEFAULT_CURRENCY_EMOJI;
    const payload = buildUserPointsPayload(targetUser, scoreData, currencyEmoji);

    await interaction.editReply(payload);
  } catch (err) {
    console.error("[akari-points] handlePointsCommand error:", err.message);
    await interaction.editReply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## <:68440x:1358584606911369226>︲__\` Error ₊ เกิดข้อผิดพลาด 𓂃 \`__\n> ไม่สามารถดึงข้อมูลคะแนนได้: ${err.message}`,
            },
          ],
        },
      ],
    }).catch(() => {});
  }
}

/**
 * จัดการคำสั่ง /leaderboard
 */
async function handleLeaderboardCommand(interaction, supabase, sortBy = "points") {
  await interaction.deferReply({ flags: FLAG_V2 }).catch(() => {});

  const guildId = interaction.guildId;

  try {
    const [leaderboardList, storeConfig] = await Promise.all([
      getTenantLeaderboard(supabase, guildId, 10, false, sortBy),
      getTenantStoreConfig(supabase, guildId),
    ]);

    const currencyEmoji = storeConfig?.currency_emoji || DEFAULT_CURRENCY_EMOJI;
    const payload = buildLeaderboardPayload(interaction.guild, leaderboardList, sortBy, currencyEmoji);

    await interaction.editReply(payload);
  } catch (err) {
    console.error("[akari-points] handleLeaderboardCommand error:", err.message);
    await interaction.editReply({
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## <:68440x:1358584606911369226>︲__\` Error ₊ เกิดข้อผิดพลาด 𓂃 \`__\n> ไม่สามารถดึงกระดานจัดอันดับได้: ${err.message}`,
            },
          ],
        },
      ],
    }).catch(() => {});
  }
}

/**
 * จัดการปุ่มกดทั้งหมดของระบบ Points และ Leaderboard
 */
async function handlePointsButtonInteraction(interaction, supabase) {
  const customId = interaction.customId;
  const guildId = interaction.guildId;

  // 1. ปุ่มดูกระดานจัดอันดับจากการ์ดเช็กแต้ม
  if (customId === "akari_view_leaderboard") {
    await interaction.deferUpdate().catch(() => {});

    try {
      const [leaderboardList, storeConfig] = await Promise.all([
        getTenantLeaderboard(supabase, guildId, 10, false, "points"),
        getTenantStoreConfig(supabase, guildId),
      ]);

      const currencyEmoji = storeConfig?.currency_emoji || DEFAULT_CURRENCY_EMOJI;
      const payload = buildLeaderboardPayload(interaction.guild, leaderboardList, "points", currencyEmoji);

      await interaction.editReply(payload);
    } catch (err) {
      console.error("[akari-points] akari_view_leaderboard error:", err.message);
    }
    return;
  }

  // 2. ปุ่มสลับเรียงตามแต้ม
  if (customId === "akari_lb_by_points") {
    await interaction.deferUpdate().catch(() => {});

    try {
      const [leaderboardList, storeConfig] = await Promise.all([
        getTenantLeaderboard(supabase, guildId, 10, false, "points"),
        getTenantStoreConfig(supabase, guildId),
      ]);

      const currencyEmoji = storeConfig?.currency_emoji || DEFAULT_CURRENCY_EMOJI;
      const payload = buildLeaderboardPayload(interaction.guild, leaderboardList, "points", currencyEmoji);

      await interaction.editReply(payload);
    } catch (err) {
      console.error("[akari-points] akari_lb_by_points error:", err.message);
    }
    return;
  }

  // 3. ปุ่มสลับเรียงตามจำนวนชนะ
  if (customId === "akari_lb_by_wins") {
    await interaction.deferUpdate().catch(() => {});

    try {
      const [leaderboardList, storeConfig] = await Promise.all([
        getTenantLeaderboard(supabase, guildId, 10, false, "wins"),
        getTenantStoreConfig(supabase, guildId),
      ]);

      const currencyEmoji = storeConfig?.currency_emoji || DEFAULT_CURRENCY_EMOJI;
      const payload = buildLeaderboardPayload(interaction.guild, leaderboardList, "wins", currencyEmoji);

      await interaction.editReply(payload);
    } catch (err) {
      console.error("[akari-points] akari_lb_by_wins error:", err.message);
    }
    return;
  }

  // 4. ปุ่มรีเฟรชกระดานจัดอันดับ
  if (customId === "akari_lb_refresh") {
    await interaction.deferUpdate().catch(() => {});

    try {
      // ตรวจสอบจากข้อความเดิมว่าเป็นโหมดชนะหรือแต้ม
      const currentContent = interaction.message?.components?.[0]?.components?.[0]?.content || "";
      const isWins = currentContent.includes("จำนวนชนะสูงสุด");
      const sortBy = isWins ? "wins" : "points";

      // บังคับ force fetch ล่าสุด
      const [leaderboardList, storeConfig] = await Promise.all([
        getTenantLeaderboard(supabase, guildId, 10, true, sortBy),
        getTenantStoreConfig(supabase, guildId),
      ]);

      const currencyEmoji = storeConfig?.currency_emoji || DEFAULT_CURRENCY_EMOJI;
      const payload = buildLeaderboardPayload(interaction.guild, leaderboardList, sortBy, currencyEmoji);

      await interaction.editReply(payload);
    } catch (err) {
      console.error("[akari-points] akari_lb_refresh error:", err.message);
    }
    return;
  }
}

// ─── Slash Commands Definition ───────────────────────────────────────────────

const POINTS_SLASH_COMMANDS = [
  {
    name: "points",
    description: "ตรวจสอบคะแนนสะสมและสถิติมินิเกมของคุณหรือสมาชิกในเซิร์ฟเวอร์",
    options: [
      {
        name: "user",
        description: "เลือกผู้เล่นที่ต้องการตรวจเช็กแต้ม (หากไม่เลือกจะแสดงของตนเอง)",
        type: 6, // USER
        required: false,
      },
    ],
  },
  {
    name: "leaderboard",
    description: "ดูกระดานจัดอันดับ Top 10 ผู้เล่นมินิเกมประจำเซิร์ฟเวอร์",
  },
];

module.exports = {
  POINTS_SLASH_COMMANDS,
  handlePointsCommand,
  handleLeaderboardCommand,
  handlePointsButtonInteraction,
  buildUserPointsPayload,
  buildLeaderboardPayload,
};
