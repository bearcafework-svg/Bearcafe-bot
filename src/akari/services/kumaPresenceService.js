// ===================================================
// kumaPresenceService.js — ระบบหมุนเวียน Status / Presence สำหรับ Kuma Bot
// หมุนเวียนสถานะอัตโนมัติ 5 รูปแบบตามลำดับ พร้อม Rate Limit Cooldown Protection
// ===================================================

const { ActivityType } = require("discord.js");

// หมุนสถานะทุกๆ 30 วินาที (ปลอดภัยจาก Discord Gateway Rate Limit 5 ครั้ง / 20 วินาที)
const ROTATION_INTERVAL_MS = 30 * 1000;
// ดึงข้อมูลสถิติจาก Supabase ทุกๆ 5 นาที (ประหยัด Egress)
const STATS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

const GAME_NAMES = {
  1: "เติมคำศัพท์-ไทย",
  2: "เติมคำศัพท์-อังกฤษ",
  3: "สุ่มโจทย์คณิต",
  4: "ทายคำจากคำใบ้",
  5: "ฟังเสียงตอบ-อังกฤษ",
  6: "พิมพ์ตามคำ-ไทย",
  7: "พิมพ์ตามคำ-อังกฤษ",
  8: "ทายคำแปล-อังกฤษ",
  9: "ทายคำแปล-ไทย",
  10: "เกมต่อคำ",
  11: "ฟังเสียงตอบ-ไทย",
  12: "จริงหรือเท็จ",
  13: "เรียงประโยค-อังกฤษ",
  15: "ทายธงประเทศ",
  16: "นับจำนวนอีโมจิ",
};

const cachedStats = {
  playerCount: 156,
  totalWins: 13250,
  popularGame: "สุ่มโจทย์คณิต",
};

let currentStatusIndex = 0;
let rotationTimer = null;
let statsTimer = null;

/**
 * ดึงสถิติจริงจาก Supabase (จำนวนคนเล่น, ยอดชนะรวม, เกมยอดนิยม)
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
async function refreshStatsFromDb(supabase) {
  if (!supabase) return;
  try {
    // 1. ดึงข้อมูลคะแนนและยอดชนะ (แบบ Pagination ป้องกันติด Limit 1,000 แถว)
    const allScores = [];
    let fromScores = 0;
    const SCORES_PAGE_SIZE = 1000;
    let hasMoreScores = true;

    while (hasMoreScores) {
      const { data, error } = await supabase
        .from("tenant_minigame_scores")
        .select("wins")
        .range(fromScores, fromScores + SCORES_PAGE_SIZE - 1);

      if (error || !data || data.length === 0) break;
      allScores.push(...data);
      if (data.length < SCORES_PAGE_SIZE) {
        hasMoreScores = false;
      } else {
        fromScores += SCORES_PAGE_SIZE;
      }
    }

    if (allScores.length > 0) {
      cachedStats.playerCount = allScores.length;
      cachedStats.totalWins = allScores.reduce((sum, s) => sum + (s.wins || 0), 0);
    }

    // 2. ดึงสถิติช่องมินิเกม เพื่อหาเกมที่ติดตั้งมากที่สุด (แบบ Pagination ป้องกันติด Limit 1,000 แถว)
    const allChannels = [];
    let fromChannels = 0;
    const CHANNELS_PAGE_SIZE = 1000;
    let hasMoreChannels = true;

    while (hasMoreChannels) {
      const { data, error } = await supabase
        .from("tenant_minigame_channels")
        .select("game_id")
        .range(fromChannels, fromChannels + CHANNELS_PAGE_SIZE - 1);

      if (error || !data || data.length === 0) break;
      allChannels.push(...data);
      if (data.length < CHANNELS_PAGE_SIZE) {
        hasMoreChannels = false;
      } else {
        fromChannels += CHANNELS_PAGE_SIZE;
      }
    }

    if (allChannels.length > 0) {
      const counts = {};
      allChannels.forEach((c) => {
        const gid = Number(c.game_id);
        counts[gid] = (counts[gid] || 0) + 1;
      });

      let topGid = null;
      let maxCount = -1;
      for (const [gid, count] of Object.entries(counts)) {
        if (count > maxCount) {
          maxCount = count;
          topGid = Number(gid);
        }
      }

      if (topGid && GAME_NAMES[topGid]) {
        cachedStats.popularGame = GAME_NAMES[topGid];
      }
    }
  } catch (err) {
    console.warn("⚠️ [KumaBot:Presence] ไม่สามารถอัปเดตสถิติจาก DB ได้:", err.message);
  }
}

/**
 * สร้างรายการข้อความสถานะ 5 รูปแบบตามที่กำหนด
 * @param {import('discord.js').Client} client
 */
function getStatusList(client) {
  const serverCount = client.guilds?.cache?.size || 0;
  const memberCount = client.guilds?.cache?.reduce(
    (acc, g) => acc + (g.memberCount || 0),
    0
  ) || 0;

  return [
    // Status 1: บอทมินิเกมอันดับ #1 (ตัด — พัฒนาโดย Bear Cafe ครับ)
    "🎮 บอทมินิเกมอันดับ #1",

    // Status 2: กำลังเล่นอยู่ xx เซิร์ฟเวอร์ — xx คน
    `🟢 กำลังเล่นอยู่ ${serverCount.toLocaleString()} เซิร์ฟเวอร์ — ${memberCount.toLocaleString()} คน`,

    // Status 3: กำลังเล่นอยู่ xx คน (จำนวนผู้เล่นสะสม)
    `🟢 กำลังเล่นอยู่ ${cachedStats.playerCount.toLocaleString()} คน`,

    // Status 4: ยอดรอบชนะรวม xx รอบ
    `🟢 ยอดเล่นชนะรวม ${cachedStats.totalWins.toLocaleString()} รอบ`,

    // Status 5: เกมยอดนิยม {ชื่อเกม}
    `🎉 เกมยอดนิยม ${cachedStats.popularGame}`,
  ];
}

/**
 * อัปเดตสถานะของบอทไปยัง Discord Gateway
 * @param {import('discord.js').Client} client
 */
function updatePresence(client) {
  if (!client.user) return;

  const statuses = getStatusList(client);
  const statusText = statuses[currentStatusIndex % statuses.length];

  try {
    client.user.setPresence({
      activities: [
        {
          name: "custom",
          type: ActivityType.Custom,
          state: statusText,
        },
      ],
      status: "online",
    });
  } catch (err) {
    console.warn("⚠️ [KumaBot:Presence] อัปเดตสถานะไม่สำเร็จ:", err.message);
  }

  // เลื่อนไปสถานะถัดไป
  currentStatusIndex = (currentStatusIndex + 1) % statuses.length;
}

/**
 * ติดตั้งระบบหมุนเวียนสถานะสำหรับ Kuma Bot
 * @param {import('discord.js').Client} client
 * @param {import('@supabase/supabase-js').SupabaseClient} supabase
 */
function setupKumaPresence(client, supabase) {
  // ดึงสถิติครั้งแรก
  refreshStatsFromDb(supabase).then(() => {
    updatePresence(client);
  });

  // ตั้งเวลาหมุนสถานะทุกๆ 30 วินาที
  if (rotationTimer) clearInterval(rotationTimer);
  rotationTimer = setInterval(() => {
    updatePresence(client);
  }, ROTATION_INTERVAL_MS);

  // ตั้งเวลาดึงสถิติใหม่จาก Supabase ทุกๆ 5 นาที
  if (statsTimer) clearInterval(statsTimer);
  statsTimer = setInterval(() => {
    refreshStatsFromDb(supabase);
  }, STATS_REFRESH_INTERVAL_MS);

  console.log("🎮 [KumaBot:Presence] เริ่มระบบหมุนเวียนสถานะ 5 รูปแบบเรียบร้อยแล้ว (เปลี่ยนทุก 30s)");
}

module.exports = {
  setupKumaPresence,
  getStatusList,
};
