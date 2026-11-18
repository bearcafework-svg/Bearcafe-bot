// src/features/coinGacha/coinGachaService.js
// Business Logic และ Database Service สำหรับระบบหมีโยนเหรียญ

const { getSupabaseClient } = require("../../services/supabaseClient");
const { sendRollLogWebhook } = require("./coinGachaWebhook");
const { ROLL_COOLDOWN_MS, ROLE_DUPLICATE_POINTS, ALLOWED_CLAIM_ROLES } = require("./coinGachaConfig");

// In-Memory Cooldown Tracking (4 วินาที ป้องกันการสแปมปุ่ม)
const rollCooldowns = new Map();

// เคลียร์ RAM ทุก 10 นาที
setInterval(() => {
  const now = Date.now();
  for (const [userId, ts] of rollCooldowns.entries()) {
    if (now - ts > 60000) {
      rollCooldowns.delete(userId);
    }
  }
}, 600000).unref();

/**
 * 1. ตรวจสอบคูลดาวน์ของผู้ใช้
 */
function checkRollCooldown(userId) {
  const now = Date.now();
  const lastTime = rollCooldowns.get(userId) || 0;
  if (now - lastTime < ROLL_COOLDOWN_MS) {
    const waitSec = Math.ceil((ROLL_COOLDOWN_MS - (now - lastTime)) / 1000);
    return { onCooldown: true, waitSec };
  }
  return { onCooldown: false, waitSec: 0 };
}

/**
 * 2. บันทึกเวลาเริ่มสุ่มของผู้ใช้
 */
function setRollCooldown(userId) {
  rollCooldowns.set(userId, Date.now());
}

/**
 * 3. ตรวจสอบสถานะการรับแต้มครั้งแรกของผู้ใช้
 */
async function getUserFirstTimeStatus(userId) {
  const sb = getSupabaseClient();
  if (!sb) return false;

  const { data } = await sb
    .from("user_points")
    .select("has_claimed_gacha_first_time")
    .eq("discord_id", userId)
    .maybeSingle();

  return !!(data && data.has_claimed_gacha_first_time);
}

/**
 * 4. เช็กยอดเหรียญคงเหลือของผู้ใช้
 */
async function getUserCoins(userId) {
  const sb = getSupabaseClient();
  if (!sb) return 0;

  const { data } = await sb
    .from("user_points")
    .select("gacha_coins")
    .eq("discord_id", userId)
    .maybeSingle();

  return (data && data.gacha_coins) ? Number(data.gacha_coins) : 0;
}

/**
 * 5. ประมวลผลการโยนเหรียญสุ่มรางวัล
 */
async function executeCoinRoll(user, member) {
  const userId = user.id;

  // เช็กคูลดาวน์ 4 วินาที
  const cd = checkRollCooldown(userId);
  if (cd.onCooldown) {
    return {
      success: false,
      error: "COOLDOWN",
      message: `⏳ กรุณารอสักครู่ (${cd.waitSec} วินาที) ก่อนกดโยนเหรียญใหม่อีกครั้งนะคะ`
    };
  }

  setRollCooldown(userId);

  const sb = getSupabaseClient();
  if (!sb) {
    return {
      success: false,
      error: "DATABASE_UNAVAILABLE",
      message: "❌ ไม่สามารถเชื่อมต่อฐานข้อมูลได้ในขณะนี้ กรุณาลองใหม่อีกครั้งค่ะ"
    };
  }

  // เรียกใช้ Atomic RPC Function
  const { data: rollResult, error: rpcError } = await sb.rpc("fn_roll_coin_gacha", {
    p_discord_id: userId
  });

  if (rpcError) {
    console.error("[coinGachaService] RPC Error:", rpcError);
    return {
      success: false,
      error: "RPC_ERROR",
      message: `❌ เกิดข้อผิดพลาดในระบบตู้สุ่ม: ${rpcError.message}`
    };
  }

  if (!rollResult.success) {
    return {
      success: false,
      error: rollResult.error,
      message: rollResult.message || "เกิดข้อผิดพลาดในการสุ่ม",
      remainingCoins: rollResult.remaining_coins
    };
  }

  // ดึงสถานะรับแต้มครั้งแรก
  const hasClaimedFirstTime = await getUserFirstTimeStatus(userId);

  let fallbackNotice = null;

  // จัดการกรณีรางวัลแบบอัตโนมัติ (auto)
  if (rollResult.reward_type === "auto") {
    // ก) กรณีให้ยศ (role_id)
    if (rollResult.role_id) {
      const targetRoleId = rollResult.role_id;
      const alreadyHasRole = member?.roles?.cache?.has(targetRoleId);

      if (alreadyHasRole) {
        // ผู้เล่นมียศนี้อยู่แล้ว -> แปลงเป็นแต้มสำรองอัตโนมัติ
        fallbackNotice = `คุณมียศนี้อยู่แล้ว ระบบจึงแปลงเป็นแต้มโบนัส +${ROLE_DUPLICATE_POINTS} แต้มให้แทนค่ะ`;
        await sb
          .from("user_points")
          .update({
            points: sb.raw(`COALESCE(points, 0) + ${ROLE_DUPLICATE_POINTS}`),
            updated_at: new Date().toISOString()
          })
          .eq("discord_id", userId)
          .catch(async () => {
            // fallback หาก raw SQL ไม่ทำงาน
            const { data: cur } = await sb.from("user_points").select("points").eq("discord_id", userId).maybeSingle();
            const curPoints = (cur && cur.points) ? Number(cur.points) : 0;
            await sb.from("user_points").update({ points: curPoints + ROLE_DUPLICATE_POINTS }).eq("discord_id", userId);
          });
      } else if (member && member.roles) {
        // มอบยศให้ทันที
        await member.roles.add(targetRoleId).catch((err) => {
          console.error(`[coinGachaService] Failed to add role ${targetRoleId} to ${userId}:`, err.message);
        });
      }
    }

    // ข) กรณีให้แต้ม (points_reward)
    if (rollResult.points_reward && rollResult.points_reward > 0) {
      const pts = Number(rollResult.points_reward);
      const { data: cur } = await sb.from("user_points").select("points").eq("discord_id", userId).maybeSingle();
      const curPoints = (cur && cur.points) ? Number(cur.points) : 0;
      await sb.from("user_points").update({
        points: curPoints + pts,
        updated_at: new Date().toISOString()
      }).eq("discord_id", userId);
    }
  }

  // ส่ง Log Real-time Webhook แบบ Asynchronous (ไม่บล็อกการตอบกลับ)
  sendRollLogWebhook({
    discordId: userId,
    userAvatar: user.displayAvatarURL ? user.displayAvatarURL({ dynamic: true }) : null,
    tier: rollResult.tier,
    rewardName: rollResult.reward_name,
    timestamp: Math.floor(Date.now() / 1000)
  }).catch(() => {});

  const expiryTimestamp = rollResult.expires_at ? Math.floor(new Date(rollResult.expires_at).getTime() / 1000) : null;

  return {
    success: true,
    rollData: rollResult,
    hasClaimedFirstTime,
    fallbackNotice,
    expiryTimestamp
  };
}

/**
 * 6. ดึงประวัติการสุ่มของผู้ใช้ (แบ่งหน้า หน้าละ 50 รายการ)
 */
async function getUserRollHistory(userId, page = 1) {
  const sb = getSupabaseClient();
  if (!sb) return { items: [], totalPages: 1, currentPage: 1 };

  const PAGE_SIZE = 50;
  const pageNum = Math.max(1, parseInt(page, 10) || 1);
  const from = (pageNum - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  // นับจำนวนทั้งหมด
  const { count } = await sb
    .from("gacha_coin_rolls")
    .select("*", { count: "exact", head: true })
    .eq("discord_id", userId);

  const totalCount = count || 0;
  const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

  // ดึงข้อมูลรายการ
  const { data: items, error } = await sb
    .from("gacha_coin_rolls")
    .select("id, tier, reward_name, history_name, reward_type, is_claimed, expires_at, created_at")
    .eq("discord_id", userId)
    .order("created_at", { ascending: false })
    .range(from, to);

  if (error) {
    console.error("[coinGachaService] Error fetching roll history:", error);
    return { items: [], totalPages: 1, currentPage: 1 };
  }

  return {
    items: items || [],
    totalPages,
    currentPage: pageNum
  };
}

/**
 * 7. ให้แต้มครั้งแรกผ่านคำสั่ง /รับแต้มครั้งแรก
 */
async function claimFirstTimeBonus(executorMember, targetUser) {
  // ตรวจสอบสิทธิ์ผู้ใช้คำสั่ง
  const hasPermission = executorMember?.permissions?.has("Administrator") ||
    executorMember?.roles?.cache?.some((r) => ALLOWED_CLAIM_ROLES.includes(r.id));

  if (!hasPermission) {
    return {
      success: false,
      error: "NO_PERMISSION",
      message: "❌ ขออภัยค่ะ เฉพาะทีมงานที่มีสิทธิ์เท่านั้นที่สามารถใช้คำสั่งนี้ได้นะคะ"
    };
  }

  const sb = getSupabaseClient();
  if (!sb) {
    return {
      success: false,
      error: "DATABASE_UNAVAILABLE",
      message: "❌ ไม่สามารถเชื่อมต่อฐานข้อมูลได้ในขณะนี้"
    };
  }

  const targetId = targetUser.id;

  // ดึงข้อมูลผู้ใช้เป้าหมาย
  const { data: userData } = await sb
    .from("user_points")
    .select("points, has_claimed_gacha_first_time")
    .eq("discord_id", targetId)
    .maybeSingle();

  if (userData && userData.has_claimed_gacha_first_time) {
    return {
      success: false,
      error: "ALREADY_CLAIMED",
      message: `⚠️ สมาชิก <@${targetId}> เคยได้รับแต้มโบนัสครั้งแรกไปแล้วค่ะ!`
    };
  }

  const currentPoints = (userData && userData.points) ? Number(userData.points) : 0;
  const newPoints = currentPoints + 500;

  if (!userData) {
    // หากยังไม่มีแถวในตาราง สร้างใหม่
    await sb.from("user_points").insert({
      discord_id: targetId,
      points: 500,
      has_claimed_gacha_first_time: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
  } else {
    // อัปเดตแถวเดิม
    await sb.from("user_points").update({
      points: newPoints,
      has_claimed_gacha_first_time: true,
      updated_at: new Date().toISOString()
    }).eq("discord_id", targetId);
  }

  return {
    success: true,
    message: `✅ มอบแต้มโบนัสครั้งแรก **+500 แต้ม** ให้แก่ <@${targetId}> สำเร็จเรียบร้อยแล้วค่ะ! (แต้มรวมปัจจุบัน: ${newPoints} แต้ม)`
  };
}

module.exports = {
  checkRollCooldown,
  setRollCooldown,
  getUserFirstTimeStatus,
  getUserCoins,
  executeCoinRoll,
  getUserRollHistory,
  claimFirstTimeBonus
};
