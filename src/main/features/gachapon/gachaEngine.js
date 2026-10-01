// src/main/features/gachapon/gachaEngine.js
// แกนประมวลผลระบบสุ่มกาชาปอง (Gachapon Engine)

const DEFAULT_SETTINGS = {
  dev_unlimited: true,
  single_roll_price: 100,
  ten_roll_price: 900,
  banner_url: "https://cdn.discordapp.com/attachments/1524704267015819274/1524758921233825852/-_6.png",
  title: "🎰 𝖡𝖾𝖺𝗋 𝖢𝖺𝖿𝖾 𝖫𝗎𝖼𝗄𝗒 𝖦𝖺𝖼𝗁𝖺 ₊ ตู้สุ่มของรางวัลคาเฟ่หมี 𓂃",
  description: "หมุนตู้สุ่มลุ้นรับแต้มสะสม, สิทธิ์บ้านเช่าห้องเสียงส่วนตัว, ยศเปลี่ยนสีชื่อ และยศพิเศษประจำเซิร์ฟเวอร์!"
};

/**
 * ดึงข้อมูลการตั้งค่าระบบกาชาปองจาก Supabase
 */
async function getGachaSettings(supabase) {
  if (!supabase) return DEFAULT_SETTINGS;
  try {
    const { data, error } = await supabase
      .from("gacha_settings")
      .select("value")
      .eq("key", "main_gacha")
      .maybeSingle();

    if (error || !data?.value) return DEFAULT_SETTINGS;
    return { ...DEFAULT_SETTINGS, ...data.value };
  } catch (err) {
    console.error("[gachapon] getGachaSettings error:", err.message);
    return DEFAULT_SETTINGS;
  }
}

/**
 * ดึงรายการของรางวัลที่เปิดใช้งาน (Active Items)
 */
async function getActiveGachaItems(supabase) {
  if (!supabase) return [];
  try {
    const { data, error } = await supabase
      .from("gacha_items")
      .select("*")
      .eq("is_active", true)
      .order("weight", { ascending: false });

    if (error || !data) {
      console.error("[gachapon] getActiveGachaItems error:", error?.message);
      return [];
    }
    return data;
  } catch (err) {
    console.error("[gachapon] getActiveGachaItems exception:", err.message);
    return [];
  }
}

/**
 * ดึงแต้มสะสมปัจจุบันของผู้ใช้
 */
async function getUserPoints(supabase, userId) {
  if (!supabase || !userId) return 0;
  try {
    const { data, error } = await supabase
      .from("user_points")
      .select("points")
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) return 0;
    return Number(data.points || 0);
  } catch {
    return 0;
  }
}

/**
 * ปรับปรุงแต้มสะสมของผู้ใช้
 */
async function updateUserPoints(supabase, userId, delta) {
  if (!supabase || !userId || delta === 0) return 0;
  try {
    const current = await getUserPoints(supabase, userId);
    const updated = Math.max(0, current + delta);

    await supabase.from("user_points").upsert(
      {
        user_id: userId,
        points: updated,
        updated_at: new Date().toISOString()
      },
      { onConflict: "user_id" }
    );
    return updated;
  } catch (err) {
    console.error("[gachapon] updateUserPoints error:", err.message);
    return 0;
  }
}

/**
 * ฟังก์ชันสุ่มเลือกไอเทม 1 ชิ้นตามค่าน้ำหนัก (Weighted Random Sampling)
 */
function pickWeightedItem(items) {
  if (!items || items.length === 0) return null;
  const totalWeight = items.reduce((sum, item) => sum + Math.max(1, Number(item.weight || 1)), 0);
  let randomVal = Math.random() * totalWeight;

  for (const item of items) {
    const weight = Math.max(1, Number(item.weight || 1));
    if (randomVal < weight) {
      return item;
    }
    randomVal -= weight;
  }
  return items[items.length - 1];
}

/**
 * หมุนกาชาปอง (Roll Gacha)
 * @param {import('discord.js').User} user
 * @param {import('discord.js').GuildMember} member
 * @param {number} times จำนวนครั้งที่หมุน (1 หรือ 10)
 * @param {object} supabase
 * @returns {Promise<{ success: boolean, results?: Array, error?: string, remainingPoints?: number }>}
 */
async function rollGacha(user, member, times, supabase) {
  if (!user || !supabase) {
    return { success: false, error: "ระบบไม่พร้อมใช้งานในขณะนี้ค่ะ" };
  }

  // 🚫 ตรวจสอบ role_blacklist
  const sharedSettings = require("../../sharedSettings.json");
  const roleBlacklist = sharedSettings.role_blacklist || [];
  if (member?.roles?.cache?.some((r) => roleBlacklist.includes(r.id))) {
    return { success: false, error: "ขออภัยค่ะ บัญชีของคุณไม่สามารถใช้งานระบบกาชาปองได้ในขณะนี้" };
  }

  const settings = await getGachaSettings(supabase);
  const items = await getActiveGachaItems(supabase);

  if (!items || items.length === 0) {
    return { success: false, error: "ขออภัยค่ะ ขณะนี้ยังไม่มีของรางวัลเปิดให้สุ่มในตู้กาชาปอง" };
  }

  const isDevUnlimited = Boolean(settings.dev_unlimited);
  const cost = times >= 10 ? (settings.ten_roll_price || 900) : (settings.single_roll_price || 100);

  // 1. ตรวจสอบแต้มสะสมหากไม่ใช่โหมด Dev Unlimited
  let userPoints = await getUserPoints(supabase, user.id);
  if (!isDevUnlimited) {
    if (userPoints < cost) {
      return {
        success: false,
        error: `แต้มสะสมของคุณไม่เพียงพอสำหรับการสุ่ม (${times} ครั้ง ใช้ **${cost}** แต้ม แต่คุณมี **${userPoints}** แต้มค่ะ)`
      };
    }
    // หักแต้มค่าหมุน
    userPoints = await updateUserPoints(supabase, user.id, -cost);
  }

  const rollResults = [];
  let totalBonusPointsGranted = 0;

  // 2. ดำเนินการสุ่มตามจำนวนครั้ง
  for (let i = 0; i < times; i++) {
    const item = pickWeightedItem(items);
    if (!item) continue;

    let isDuplicate = false;
    let compensatedPoints = 0;
    const rewardVal = item.reward_value || {};

    // ── ตรวจสอบและมอบของรางวัลตามหมวดหมู่ ──
    if (item.category === "points") {
      const pts = Number(rewardVal.points || 50);
      await updateUserPoints(supabase, user.id, pts);
      totalBonusPointsGranted += pts;
    } else if (item.category === "special_role") {
      const roleId = rewardVal.role_id;
      if (roleId && member) {
        const hasRole = member.roles?.cache?.has(roleId);
        if (hasRole) {
          isDuplicate = true;
          compensatedPoints = item.compensation_points || 500;
          await updateUserPoints(supabase, user.id, compensatedPoints);
          totalBonusPointsGranted += compensatedPoints;
        } else {
          try {
            await member.roles.add(roleId);
          } catch (rErr) {
            console.warn(`[gachapon] Failed to assign role ${roleId}:`, rErr.message);
          }
        }
      }
    } else if (item.category === "color_role") {
      // มอบสิทธิ์เปลี่ยนสี หรือชดเชยแต้ม
      const freeChanges = Number(rewardVal.free_changes || 1);
      compensatedPoints = (item.compensation_points || 150) * freeChanges;
      await updateUserPoints(supabase, user.id, compensatedPoints);
      totalBonusPointsGranted += compensatedPoints;
      isDuplicate = false;
    } else if (item.category === "rent_house") {
      // ขยายเวลาสัญญาบ้านเช่า หรือเพิ่มประวัติ
      const rentDays = Number(rewardVal.rent_days || 3);
      try {
        const { data: existingContract } = await supabase
          .from("rent_house_contracts")
          .select("*")
          .eq("user_id", user.id)
          .eq("status", "ACTIVE")
          .order("expires_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (existingContract) {
          const currentExpiry = new Date(existingContract.expires_at || Date.now());
          const newExpiry = new Date(currentExpiry.getTime() + rentDays * 24 * 60 * 60 * 1000);
          await supabase
            .from("rent_house_contracts")
            .update({ expires_at: newExpiry.toISOString(), updated_at: new Date().toISOString() })
            .eq("id", existingContract.id);
        } else {
          const now = new Date();
          const expiresAt = new Date(now.getTime() + rentDays * 24 * 60 * 60 * 1000);
          await supabase.from("rent_house_contracts").insert({
            user_id: user.id,
            discord_name: user.username,
            rent_type: "GACHA_REWARD",
            rent_days: rentDays,
            status: "ACTIVE",
            starts_at: now.toISOString(),
            expires_at: expiresAt.toISOString(),
            created_at: now.toISOString()
          });
        }
      } catch (hErr) {
        console.warn("[gachapon] rent_house update error:", hErr.message);
      }
    }

    // บันทึก Log ลง Supabase
    try {
      await supabase.from("gacha_roll_logs").insert({
        discord_id: user.id,
        item_id: item.id,
        category: item.category,
        rarity: item.rarity,
        item_name: item.name,
        reward_snapshot: rewardVal,
        is_duplicate: isDuplicate,
        compensated_points: compensatedPoints
      });
    } catch (logErr) {
      console.warn("[gachapon] Failed to insert roll log:", logErr.message);
    }

    rollResults.push({
      item,
      isDuplicate,
      compensatedPoints
    });
  }

  const finalPoints = await getUserPoints(supabase, user.id);

  return {
    success: true,
    results: rollResults,
    isDevUnlimited,
    costPaid: isDevUnlimited ? 0 : cost,
    totalBonusPointsGranted,
    finalPoints
  };
}

/**
 * ดึงประวัติการสุ่มกาชาปองล่าสุดของผู้ใช้
 */
async function getUserGachaHistory(userId, supabase, limit = 10) {
  if (!supabase || !userId) return [];
  try {
    const { data, error } = await supabase
      .from("gacha_roll_logs")
      .select("*")
      .eq("discord_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data;
  } catch (err) {
    console.error("[gachapon] getUserGachaHistory error:", err.message);
    return [];
  }
}

module.exports = {
  DEFAULT_SETTINGS,
  getGachaSettings,
  getActiveGachaItems,
  getUserPoints,
  updateUserPoints,
  rollGacha,
  getUserGachaHistory
};
