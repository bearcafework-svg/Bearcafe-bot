// src/features/coinGacha/coinGachaService.js
// Business Logic และ Database Service สำหรับระบบหมีโยนเหรียญ

const { getSupabaseClient } = require("../../services/supabaseClient");
const { sendRollLogWebhook } = require("./coinGachaWebhook");
const { ROLL_COOLDOWN_MS, ROLE_DUPLICATE_POINTS, ALLOWED_CLAIM_ROLES } = require("./coinGachaConfig");
const { addPointsWithCap } = require("../../utils/pointManager");

// In-Memory Cooldown Tracking (4 วินาที ป้องกันการสแปมปุ่ม)
const rollCooldowns = new Map();

// เคลียร์ RAM ทุก 10 นาที เพื่อป้องกัน Memory Leak
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
  try {
    const sb = getSupabaseClient();
    if (!sb) return false;

    // ดึงเฉพาะ column ที่ต้องการ เพื่อลด Supabase Egress
    const { data, error } = await sb
      .from("user_points")
      .select("has_claimed_gacha_first_time")
      .eq("discord_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[coinGachaService] getUserFirstTimeStatus error:", error.message);
      return false;
    }

    return !!(data && data.has_claimed_gacha_first_time);
  } catch (err) {
    console.error("[coinGachaService] getUserFirstTimeStatus exception:", err.message);
    return false;
  }
}

/**
 * 4. เช็กยอดเหรียญคงเหลือของผู้ใช้
 */
async function getUserCoins(userId) {
  try {
    const sb = getSupabaseClient();
    if (!sb) return 0;

    // ดึงเฉพาะ column gacha_coins เพื่อลด Supabase Egress
    const { data, error } = await sb
      .from("user_points")
      .select("gacha_coins")
      .eq("discord_id", userId)
      .maybeSingle();

    if (error) {
      console.error("[coinGachaService] getUserCoins error:", error.message);
      return 0;
    }

    return (data && data.gacha_coins) ? Number(data.gacha_coins) : 0;
  } catch (err) {
    console.error("[coinGachaService] getUserCoins exception:", err.message);
    return 0;
  }
}

/**
 * 5. ประมวลผลการโยนเหรียญสุ่มรางวัล
 */
async function executeCoinRoll(user, member) {
  try {
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

    // เรียกใช้ Atomic RPC Function (ประมวลผลบน Postgres ทั้งหมด ส่งออกเฉพาะ JSON ลด Egress)
    const { data: rollResult, error: rpcError } = await sb.rpc("fn_roll_coin_gacha", {
      p_discord_id: userId
    });

    if (rpcError) {
      console.error("[coinGachaService] RPC Error:", rpcError.message);
      return {
        success: false,
        error: "RPC_ERROR",
        message: `❌ เกิดข้อผิดพลาดในระบบตู้สุ่ม: ${rpcError.message}`
      };
    }

    if (!rollResult || !rollResult.success) {
      return {
        success: false,
        error: rollResult?.error || "ROLL_FAILED",
        message: rollResult?.message || "เกิดข้อผิดพลาดในการสุ่ม",
        remainingCoins: rollResult?.remaining_coins ?? 0
      };
    }

    // ดึงสถานะรับแต้มครั้งแรก (มี try...catch ภายใน)
    const hasClaimedFirstTime = await getUserFirstTimeStatus(userId);

    let fallbackNotice = null;

    // จัดการกรณีรางวัลแบบอัตโนมัติ (auto)
    if (rollResult.reward_type === "auto") {
      // ก) กรณีให้ยศ (role_id)
      if (rollResult.role_id) {
        const targetRoleId = rollResult.role_id;
        const alreadyHasRole = member?.roles?.cache?.has(targetRoleId);

        if (alreadyHasRole) {
          // ผู้เล่นมียศนี้อยู่แล้ว -> แปลงเป็นแต้มสำรองตามที่ตั้งค่าไว้ในของรางวัลชิ้นนี้
          const compPoints = Number(rollResult.duplicate_compensation_points) || ROLE_DUPLICATE_POINTS;
          fallbackNotice = `คุณมียศนี้อยู่แล้ว ระบบจึงแปลงเป็นแต้มโบนัส +${compPoints} แต้มให้แทนค่ะ`;

          try {
            if (typeof addPointsWithCap === "function") {
              await addPointsWithCap(sb, member, userId, compPoints, {
                ignoreDailyCap: true,
                allowOverflowExceedCap: true
              });
            } else {
              const { data: cur } = await sb.from("user_points").select("points").eq("discord_id", userId).maybeSingle();
              const curPoints = (cur && cur.points) ? Number(cur.points) : 0;
              await sb.from("user_points").update({
                points: curPoints + compPoints,
                updated_at: new Date().toISOString()
              }).eq("discord_id", userId);
            }
          } catch (compErr) {
            console.error(`[coinGachaService] Failed to award duplicate compensation points to ${userId}:`, compErr.message);
          }
        } else if (member && member.roles) {
          // มอบยศให้ทันที ดักจับ error ไม่ให้ระบบล่มหากบอทขาด Permission
          try {
            await member.roles.add(targetRoleId);
          } catch (roleErr) {
            console.error(`[coinGachaService] Failed to add role ${targetRoleId} to ${userId}:`, roleErr.message);
          }
        }
      }

      // ข) กรณีให้แต้ม (points_reward)
      if (rollResult.points_reward && rollResult.points_reward > 0) {
        const pts = Number(rollResult.points_reward);
        try {
          if (typeof addPointsWithCap === "function") {
            await addPointsWithCap(sb, member, userId, pts, {
              ignoreDailyCap: true,
              allowOverflowExceedCap: true
            });
          } else {
            const { data: cur } = await sb.from("user_points").select("points").eq("discord_id", userId).maybeSingle();
            const curPoints = (cur && cur.points) ? Number(cur.points) : 0;
            await sb.from("user_points").update({
              points: curPoints + pts,
              updated_at: new Date().toISOString()
            }).eq("discord_id", userId);
          }
        } catch (ptsErr) {
          console.error(`[coinGachaService] Failed to award points reward to ${userId}:`, ptsErr.message);
        }
      }
    }

    // ส่ง Log Real-time Webhook แบบ Asynchronous (ไม่บล็อกการตอบกลับและดักจับ error)
    sendRollLogWebhook({
      discordId: userId,
      userAvatar: user.displayAvatarURL ? user.displayAvatarURL({ extension: "png", size: 256 }) : null,
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
  } catch (fatalErr) {
    console.error("[coinGachaService] executeCoinRoll fatal exception:", fatalErr.message);
    return {
      success: false,
      error: "INTERNAL_ERROR",
      message: `❌ เกิดข้อผิดพลาดภายในระบบ: ${fatalErr.message}`
    };
  }
}

/**
 * 6. ดึงประวัติการสุ่มของผู้ใช้ (แบ่งหน้า หน้าละ 50 รายการ)
 */
async function getUserRollHistory(userId, page = 1) {
  try {
    const sb = getSupabaseClient();
    if (!sb) return { items: [], totalPages: 1, currentPage: 1 };

    const PAGE_SIZE = 50;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const from = (pageNum - 1) * PAGE_SIZE;
    const to = from + PAGE_SIZE - 1;

    // นับจำนวนทั้งหมด โดยใช้ head: true ไม่ดาวน์โหลดข้อมูลแถว เพื่อประหยัด Supabase Egress
    const { count, error: countErr } = await sb
      .from("gacha_coin_rolls")
      .select("*", { count: "exact", head: true })
      .eq("discord_id", userId);

    if (countErr) {
      console.error("[coinGachaService] Error counting roll history:", countErr.message);
    }

    const totalCount = count || 0;
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));

    // ดึงเฉพาะ column ที่จำเป็น เพื่อประหยัด Supabase Egress Bandwidth
    const { data: items, error: selectErr } = await sb
      .from("gacha_coin_rolls")
      .select("id, tier, reward_name, history_name, reward_type, is_claimed, expires_at, created_at")
      .eq("discord_id", userId)
      .order("created_at", { ascending: false })
      .range(from, to);

    if (selectErr) {
      console.error("[coinGachaService] Error fetching roll history:", selectErr.message);
      return { items: [], totalPages: 1, currentPage: 1 };
    }

    return {
      items: items || [],
      totalPages,
      currentPage: pageNum
    };
  } catch (err) {
    console.error("[coinGachaService] getUserRollHistory exception:", err.message);
    return { items: [], totalPages: 1, currentPage: 1 };
  }
}

/**
 * 7. ให้แต้มครั้งแรกผ่านคำสั่ง /รับแต้มครั้งแรก
 */
async function claimFirstTimeBonus(executorMember, targetUser) {
  try {
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

    // ดึงเฉพาะ column ที่จำเป็นเพื่อประหยัด Egress
    const { data: userData, error: fetchErr } = await sb
      .from("user_points")
      .select("points, has_claimed_gacha_first_time")
      .eq("discord_id", targetId)
      .maybeSingle();

    if (fetchErr) {
      console.error("[coinGachaService] claimFirstTimeBonus fetch error:", fetchErr.message);
      return {
        success: false,
        error: "DB_FETCH_ERROR",
        message: `❌ เกิดข้อผิดพลาดในการตรวจสอบข้อมูลผู้ใช้: ${fetchErr.message}`
      };
    }

    if (userData && userData.has_claimed_gacha_first_time) {
      return {
        success: false,
        error: "ALREADY_CLAIMED",
        message: `⚠️ สมาชิก <@${targetId}> เคยได้รับแต้มโบนัสครั้งแรกไปแล้วค่ะ!`
      };
    }

    // เพิ่มแต้มผ่าน pointManager หรือตรงลง DB
    let newPoints = 500;
    try {
      if (typeof addPointsWithCap === "function") {
        const pointRes = await addPointsWithCap(sb, executorMember, targetId, 500, {
          ignoreDailyCap: true,
          allowOverflowExceedCap: true
        });
        newPoints = pointRes?.points ?? 500;
        await sb
          .from("user_points")
          .update({ has_claimed_gacha_first_time: true, updated_at: new Date().toISOString() })
          .eq("discord_id", targetId);
      } else {
        const curPoints = (userData && userData.points) ? Number(userData.points) : 0;
        newPoints = curPoints + 500;
        if (!userData) {
          await sb.from("user_points").insert({
            discord_id: targetId,
            points: 500,
            has_claimed_gacha_first_time: true,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString()
          });
        } else {
          await sb.from("user_points").update({
            points: newPoints,
            has_claimed_gacha_first_time: true,
            updated_at: new Date().toISOString()
          }).eq("discord_id", targetId);
        }
      }
    } catch (saveErr) {
      console.error("[coinGachaService] claimFirstTimeBonus save error:", saveErr.message);
      return {
        success: false,
        error: "SAVE_ERROR",
        message: `❌ เกิดข้อผิดพลาดในการบันทึกแต้ม: ${saveErr.message}`
      };
    }

    return {
      success: true,
      message: `✅ มอบแต้มโบนัสครั้งแรก **+500 แต้ม** ให้แก่ <@${targetId}> สำเร็จเรียบร้อยแล้วค่ะ! (แต้มรวมปัจจุบัน: ${newPoints} แต้ม)`
    };
  } catch (err) {
    console.error("[coinGachaService] claimFirstTimeBonus exception:", err.message);
    return {
      success: false,
      error: "INTERNAL_ERROR",
      message: `❌ เกิดข้อผิดพลาดในการมอบแต้ม: ${err.message}`
    };
  }
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
