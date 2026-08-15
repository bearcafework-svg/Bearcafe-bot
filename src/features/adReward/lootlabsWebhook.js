// src/features/adReward/lootlabsWebhook.js
// Handler สำหรับรับ HTTP GET Postback จาก LootLabs เมื่อผู้ใช้ดูโฆษณาจบ

const url = require("url");
const cfg = require("./settingAd.json");
const { addPointsWithCap } = require("../../utils/pointManager");
const { onPostbackCompleted } = require("./adBoxManager");

/**
 * สุ่มรางวัลแต้ม
 */
function rollAdReward() {
  const rand = Math.random();
  if (rand < cfg.rewards.jackpot.chance) { // 1%
    return { type: "JACKPOT", points: cfg.rewards.jackpot.min, label: "🎰 1,000 Pt!" };
  } else if (rand < cfg.rewards.jackpot.chance + cfg.rewards.epic.chance) { // 9%
    return { type: "EPIC", points: cfg.rewards.epic.min, label: "🌟 500 Pt" };
  } else if (rand < cfg.rewards.jackpot.chance + cfg.rewards.epic.chance + cfg.rewards.rare.chance) { // 20%
    const pts = Math.floor(Math.random() * (cfg.rewards.rare.max - cfg.rewards.rare.min + 1)) + cfg.rewards.rare.min;
    return { type: "RARE", points: pts, label: `💎 ${pts} Pt` };
  } else { // 70%
    const pts = Math.floor(Math.random() * (cfg.rewards.common.max - cfg.rewards.common.min + 1)) + cfg.rewards.common.min;
    return { type: "COMMON", points: pts, label: `💰 ${pts} Pt` };
  }
}

/**
 * ประมวลผล HTTP GET Postback จาก LootLabs
 * URL Format: GET /api/lootlabs-postback?click_id={puid}&unique_id={unique_id}&ip={ip}
 */
async function handleLootLabsPostback(req, res, supabase, discordClient) {
  const parsedUrl = url.parse(req.url, true);
  const query = parsedUrl.query || {};

  const clickId = query.click_id || query.puid;
  const uniqueId = query.unique_id;
  const userIp = query.ip || req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  console.log(`[LootLabs Postback] Received: click_id=${clickId}, unique_id=${uniqueId}, ip=${userIp}`);

  if (!clickId) {
    res.writeHead(400, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Missing click_id / puid parameter" }));
  }

  try {
    // 1. ตรวจสอบ mock mode (สำหรับการทดสอบในสภาพแวดล้อม Local)
    if (!supabase) {
      console.warn("[LootLabs Postback] Supabase client unavailable. Processing in mock mode.");
      onPostbackCompleted({
        clickId,
        uniqueId: uniqueId || `MOCK-${Date.now()}`,
        userId: clickId.split("_")[0] || "unknown",
        boxNum: parseInt(clickId.split("_")[1], 10) || 1,
        reward: { type: "COMMON", points: 100, label: "💰 100 Pt" },
        newTotalPoints: 1000
      }, discordClient);

      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ ok: true, mode: "mock", clickId }));
    }

    // 2. ค้นหา Transaction Record ใน Database
    const { data: tx, error: fetchErr } = await supabase
      .from("lootlabs_box_transactions")
      .select("*")
      .eq("click_id", clickId)
      .maybeSingle();

    if (fetchErr || !tx) {
      console.error(`[LootLabs Postback] Transaction not found for click_id: ${clickId}`);
      res.writeHead(404, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ error: "Transaction click_id not found" }));
    }

    // 3. ป้องกันการประมวลผลซ้ำ (Atomic Check)
    if (tx.status === "completed") {
      console.log(`[LootLabs Postback] Transaction ${clickId} already completed. Ignoring.`);
      res.writeHead(200, { "Content-Type": "application/json" });
      return res.end(JSON.stringify({ status: "already_processed", clickId }));
    }

    if (uniqueId) {
      const { data: dupTx } = await supabase
        .from("lootlabs_box_transactions")
        .select("id")
        .eq("lootlabs_unique_id", uniqueId)
        .maybeSingle();

      if (dupTx) {
        console.warn(`[LootLabs Postback] Duplicate unique_id ${uniqueId} detected. Ignoring.`);
        res.writeHead(200, { "Content-Type": "application/json" });
        return res.end(JSON.stringify({ status: "duplicate_ignored", uniqueId }));
      }
    }

    // 4. สุ่มแจกแต้ม & บันทึกลง Supabase
    const reward = rollAdReward();
    const userId = tx.discord_user_id;
    const boxNum = tx.box_id;
    let newTotalPoints = null;

    // หา Guild & Member ใน Discord Client เพื่อคำนวณ Cap
    let member = null;
    if (discordClient && tx.guild_id) {
      try {
        const guild = discordClient.guilds.cache.get(tx.guild_id);
        if (guild) member = await guild.members.fetch(userId).catch(() => null);
      } catch (e) {
        // Fallback member null
      }
    }

    const resPoints = await addPointsWithCap(supabase, member, userId, reward.points);
    if (resPoints && resPoints.newPoints !== undefined) {
      newTotalPoints = resPoints.newPoints;
    }

    // 5. อัปเดตสถานะ Transaction เป็น completed
    await supabase
      .from("lootlabs_box_transactions")
      .update({
        status: "completed",
        lootlabs_unique_id: uniqueId || `LL-${Date.now()}`,
        reward_amount: reward.points,
        completed_at: new Date().toISOString()
      })
      .eq("click_id", clickId);

    // 6. แจ้งเตือนไปยัง Discord UI เพื่อเปิดกล่องแบบ Real-time
    onPostbackCompleted({
      clickId,
      uniqueId,
      userId,
      boxNum,
      reward,
      newTotalPoints,
      guildId: tx.guild_id
    }, discordClient);

    console.log(`✅ [LootLabs Postback] Successfully awarded ${reward.points} points to ${userId} (Box #${boxNum})`);

    res.writeHead(200, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({
      status: "success",
      click_id: clickId,
      user_id: userId,
      reward_points: reward.points
    }));
  } catch (err) {
    console.error("[LootLabs Postback] Processing error:", err);
    res.writeHead(500, { "Content-Type": "application/json" });
    return res.end(JSON.stringify({ error: "Internal server error" }));
  }
}

module.exports = { handleLootLabsPostback };
