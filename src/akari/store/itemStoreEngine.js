// ===================================================
// src/akari/store/itemStoreEngine.js
// ระบบคลังข้อมูลและตรรกะร้านค้าแลกยศบอทคุมะ (Kuma Role Store Engine)
// รองรับการเพิ่ม แก้ไข ลบ และแลกยศไม่จำกัดสล็อต (Free สูงสุด 10, Premium สูงสุด 30)
// ===================================================

const { getTenantStoreConfig } = require("./storeEngine");
const { getTenantPlan } = require("../minigames/minigamesEngine");

// In-Memory Cache เพื่อลดการ Query Supabase บ่อยครั้ง (TTL 5 นาที)
const itemsCache = new Map(); // guildId -> { data, expiresAt }
const CACHE_TTL_MS = 5 * 60 * 1000;

function invalidateItemsCache(guildId) {
  if (guildId) itemsCache.delete(guildId);
}

/**
 * ดึงรายการไอเทมทั้งหมดของ Guild
 * @param {object} supabase
 * @param {string} guildId
 * @param {boolean} onlyActive กรองเฉพาะไอเทมที่เปิดใช้งาน (is_active = true)
 * @returns {Promise<Array>}
 */
async function getGuildItems(supabase, guildId, onlyActive = false) {
  if (!guildId) return [];

  const now = Date.now();
  if (itemsCache.has(guildId)) {
    const cached = itemsCache.get(guildId);
    if (cached && now < cached.expiresAt && Array.isArray(cached.data)) {
      return onlyActive ? cached.data.filter((i) => i.is_active) : cached.data;
    }
  }

  if (!supabase) {
    return [];
  }

  try {
    const { data, error } = await supabase
      .from("tenant_store_items_v2")
      .select("*")
      .eq("guild_id", guildId)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true });

    if (error) {
      console.error(`[itemStoreEngine] getGuildItems error for ${guildId}:`, error.message);
      return [];
    }

    const items = Array.isArray(data) ? data : [];
    itemsCache.set(guildId, {
      data: items,
      expiresAt: now + CACHE_TTL_MS,
    });

    return onlyActive ? items.filter((i) => i.is_active) : items;
  } catch (err) {
    console.error(`[itemStoreEngine] getGuildItems unexpected error for ${guildId}:`, err.message);
    return [];
  }
}

/**
 * ดึงข้อมูลไอเทมเดี่ยวตาม ID
 */
async function getGuildItemById(supabase, guildId, itemId) {
  if (!guildId || !itemId) return null;
  const items = await getGuildItems(supabase, guildId, false);
  return items.find((i) => String(i.id) === String(itemId)) || null;
}

/**
 * สร้างไอเทมใหม่ลงในระบบ (พร้อมระบบตรวจสอบโควตา Free 10 / Premium 30)
 * @param {object} supabase
 * @param {string} guildId
 * @param {object} itemData
 * @returns {Promise<{ success: boolean, item?: object, error?: string, maxQuota?: number }>}
 */
async function createGuildItem(supabase, guildId, itemData) {
  if (!guildId || !supabase) {
    return { success: false, error: "ระบบฐานข้อมูลไม่พร้อมใช้งาน" };
  }

  try {
    // 1. ตรวจสอบโควตาตามระดับสมาชิก
    const planInfo = await getTenantPlan(guildId, supabase);
    const maxQuota = planInfo.isPremium ? 30 : 10;

    const existingItems = await getGuildItems(supabase, guildId, false);
    if (existingItems.length >= maxQuota) {
      return {
        success: false,
        error: `เซิร์ฟเวอร์ของคุณมีไอเทมครบกำหนดแล้ว (${existingItems.length}/${maxQuota} ชิ้น)${!planInfo.isPremium ? " (อัปเกรด Premium เพื่อเพิ่มได้สูงสุด 30 ชิ้น)" : ""}`,
        maxQuota,
      };
    }

    // 2. Insert ไอเทมใหม่
    const newItem = {
      guild_id: guildId,
      name: itemData.name.trim(),
      description: (itemData.description || "").trim(),
      points_cost: Math.max(1, Number(itemData.points_cost) || 100),
      reward_type: "role",
      role_id: itemData.role_id,
      stock: typeof itemData.stock === "number" ? itemData.stock : -1,
      emoji: (itemData.emoji || "🎁").trim(),
      is_active: itemData.is_active !== false,
      wins_required: Math.max(0, Number(itemData.wins_required) || 0),
      required_role_id: itemData.required_role_id || null,
      sort_order: existingItems.length,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    let data = null;
    let error = null;

    try {
      const res = await supabase
        .from("tenant_store_items_v2")
        .insert(newItem)
        .select()
        .single();
      data = res.data;
      error = res.error;
    } catch (e) {
      error = e;
    }

    if (error) {
      // หากคอลัมน์ wins_required หรือ required_role_id ยังไม่ได้รัน migration บน Supabase ให้ fallback บันทึกโดยละเว้นคอลัมน์ใหม่
      if (error.message && (error.message.includes("wins_required") || error.message.includes("required_role_id"))) {
        console.warn(`[itemStoreEngine] ⚠️ wins_required/required_role_id not migrated on Supabase, falling back:`, error.message);
        const fallbackItem = { ...newItem };
        delete fallbackItem.wins_required;
        delete fallbackItem.required_role_id;
        const resFallback = await supabase
          .from("tenant_store_items_v2")
          .insert(fallbackItem)
          .select()
          .single();
        data = resFallback.data;
        error = resFallback.error;
      }
    }

    if (error) {
      console.error(`[itemStoreEngine] createGuildItem error:`, error.message);
      return { success: false, error: error.message };
    }

    invalidateItemsCache(guildId);
    return { success: true, item: data || newItem };
  } catch (err) {
    console.error(`[itemStoreEngine] createGuildItem unexpected error:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * แก้ไขข้อมูลไอเทมเดิม
 */
async function updateGuildItem(supabase, guildId, itemId, updates) {
  if (!guildId || !itemId || !supabase) {
    return { success: false, error: "พารามิเตอร์ไม่ถูกต้อง" };
  }

  try {
    const cleanUpdates = {
      ...updates,
      updated_at: new Date().toISOString(),
    };
    delete cleanUpdates.id;
    delete cleanUpdates.guild_id;

    let data = null;
    let error = null;

    try {
      const res = await supabase
        .from("tenant_store_items_v2")
        .update(cleanUpdates)
        .eq("id", itemId)
        .eq("guild_id", guildId)
        .select()
        .single();
      data = res.data;
      error = res.error;
    } catch (e) {
      error = e;
    }

    if (error) {
      if (error.message && (error.message.includes("wins_required") || error.message.includes("required_role_id"))) {
        console.warn(`[itemStoreEngine] ⚠️ wins_required/required_role_id not migrated on Supabase, falling back update:`, error.message);
        delete cleanUpdates.wins_required;
        delete cleanUpdates.required_role_id;
        const resFallback = await supabase
          .from("tenant_store_items_v2")
          .update(cleanUpdates)
          .eq("id", itemId)
          .eq("guild_id", guildId)
          .select()
          .single();
        data = resFallback.data;
        error = resFallback.error;
      }
    }

    if (error) {
      console.error(`[itemStoreEngine] updateGuildItem error:`, error.message);
      return { success: false, error: error.message };
    }

    invalidateItemsCache(guildId);
    return { success: true, item: data };
  } catch (err) {
    console.error(`[itemStoreEngine] updateGuildItem unexpected error:`, err.message);
    return { success: false, error: err.message };
  }
}

/**
 * ลบไอเทมออกจากร้านค้า
 */
async function deleteGuildItem(supabase, guildId, itemId) {
  if (!guildId || !itemId || !supabase) return false;

  try {
    const { error } = await supabase
      .from("tenant_store_items_v2")
      .delete()
      .eq("id", itemId)
      .eq("guild_id", guildId);

    if (error) {
      console.error(`[itemStoreEngine] deleteGuildItem error:`, error.message);
      return false;
    }

    invalidateItemsCache(guildId);
    return true;
  } catch (err) {
    console.error(`[itemStoreEngine] deleteGuildItem unexpected error:`, err.message);
    return false;
  }
}

/**
 * ดึงคะแนนของผู้ใช้ในกิลด์
 */
async function getTenantUserPoints(supabase, guildId, userId) {
  if (!guildId || !userId || !supabase) return 0;
  try {
    const { flushTenantPoints } = require("../minigames/minigamesEngine");
    if (typeof flushTenantPoints === "function") {
      await flushTenantPoints(supabase, guildId, userId, 0, 0).catch(() => {});
    }
    const { data, error } = await supabase
      .from("tenant_minigame_scores")
      .select("points")
      .eq("guild_id", guildId)
      .eq("user_id", userId)
      .maybeSingle();

    if (!error && data) {
      return Number(data.points) || 0;
    }
  } catch (err) {
    console.warn(`[itemStoreEngine] getTenantUserPoints error:`, err.message);
  }
  return 0;
}

/**
 * ตรวจสอบความพร้อมของสมาชิกในการแลกไอเทมยศ
 */
async function checkItemRedemptionEligibility(supabase, guild, member, item) {
  if (!item || !item.is_active) {
    return { eligible: false, reason: "ของรางวัลนี้ยังไม่เปิดให้แลกในขณะนี้ครับ" };
  }

  // 1. ตรวจสอบสต็อก
  if (typeof item.stock === "number" && item.stock === 0) {
    return { eligible: false, reason: "ขออภัยครับ ของรางวัลชิ้นนี้สินค้าหมดแล้ว (Out of Stock)" };
  }

  // 2. ตรวจสอบยศซ้ำ (Duplicate Role Check)
  if (member.roles.cache.has(item.role_id)) {
    return { eligible: false, reason: `ท่านมียศ <@&${item.role_id}> อยู่แล้ว ไม่สามารถแลกซ้ำได้ครับ` };
  }

  // 3. ตรวจสอบเงื่อนไขขั้นสูง: ยศที่ต้องมีก่อนแลก (Required Role)
  if (item.required_role_id && !member.roles.cache.has(item.required_role_id)) {
    return {
      eligible: false,
      reason: `⚠️ **คุณสมบัติยังไม่ผ่านเกณฑ์สำหรับไอเทมนี้**\n> ไอเทมนี้สงวนสิทธิ์เฉพาะสมาชิกที่มียศ <@&${item.required_role_id}> เท่านั้นครับ 👑`,
      reasonType: "missing_required_role",
      requiredRoleId: item.required_role_id,
    };
  }

  // 4. ตรวจสอบเงื่อนไขขั้นสูง: จำนวนครั้งที่ชนะมินิเกมขั้นต่ำ (Wins Required)
  if (item.wins_required && item.wins_required > 0) {
    let userWins = 0;
    if (supabase) {
      try {
        const { data: scoreData } = await supabase
          .from("tenant_minigame_scores")
          .select("wins")
          .eq("guild_id", guild.id)
          .eq("user_id", member.id)
          .maybeSingle();
        userWins = Number(scoreData?.wins) || 0;
      } catch (e) {}
    }
    if (userWins < item.wins_required) {
      const diff = item.wins_required - userWins;
      return {
        eligible: false,
        reason: `⚠️ **คุณสมบัติยังไม่ผ่านเกณฑ์สำหรับไอเทมนี้**\n> ไอเทมนี้ต้องชนะมินิเกมอย่างน้อย **${item.wins_required.toLocaleString()}** ครั้ง\n> (ปัจจุบันคุณชนะแล้ว **${userWins.toLocaleString()}** ครั้ง — ขาดอีก **${diff.toLocaleString()}** ครั้งครับ) 🐻🎮`,
        reasonType: "wins_insufficient",
        userWins,
        requiredWins: item.wins_required,
        diff,
      };
    }
  }

  // 5. ตรวจสอบ Role Hierarchy ของบอท
  const me = guild.members.me;
  const targetRole = guild.roles.cache.get(item.role_id);
  if (!targetRole) {
    return { eligible: false, reason: "ไม่พบบทบาทในเซิร์ฟเวอร์ (อาจถูกลบไปแล้ว กรุณาแจ้งผู้ดูแลระบบ)" };
  }
  if (!me.permissions.has("ManageRoles") || (me.roles.highest.position <= targetRole.position)) {
    return {
      eligible: false,
      reason: "บอทไม่มีสิทธิ์มอบยศนี้ได้ (กรุณาให้แอดมินลากตำแหน่งยศของบอทให้อยู่สูงกว่ายศของรางวัล)",
    };
  }

  // 6. คำนวณส่วนลดตามยศ (Global Store Discount)
  const { getTenantStoreConfig } = require("./storeEngine");
  const storeConfig = await getTenantStoreConfig(supabase, guild.id);
  let maxDiscount = 0;
  let discountRoleId = null;
  const discounts = Array.isArray(storeConfig?.role_discounts) ? storeConfig.role_discounts : [];
  for (const d of discounts) {
    const p = Number(d.percent) || 0;
    if (d.role_id && p > maxDiscount && member.roles.cache.has(d.role_id)) {
      maxDiscount = p;
      discountRoleId = d.role_id;
    }
  }

  const originalCost = item.points_cost;
  const finalCost = maxDiscount > 0
    ? Math.max(1, Math.round(originalCost * (1 - maxDiscount / 100)))
    : originalCost;

  // 7. ตรวจสอบแต้มสะสม
  const currentPoints = await getTenantUserPoints(supabase, guild.id, member.id);
  if (currentPoints < finalCost) {
    return {
      eligible: false,
      reason: `แต้มสะสมของท่านไม่เพียงพอ (มี **${currentPoints.toLocaleString()}** แต้ม / ต้องการ **${finalCost.toLocaleString()}** แต้ม${maxDiscount > 0 ? ` [ลด ${maxDiscount}%]` : ""})`,
      currentPoints,
      finalCost,
      maxDiscount,
      discountRoleId,
      originalCost,
    };
  }

  return {
    eligible: true,
    currentPoints,
    finalCost,
    maxDiscount,
    discountRoleId,
    originalCost,
  };
}

/**
 * ดำเนินการแลกยศ (ตัดแต้ม, มอบยศ, ลดสต็อก, บันทึก Log พร้อม Auto-Rollback)
 */
async function executeRoleRedemption(client, supabase, guild, member, item) {
  const guildId = guild.id;
  const userId = member.id;

  const eligibility = await checkItemRedemptionEligibility(supabase, guild, member, item);
  if (!eligibility.eligible) {
    return { success: false, error: eligibility.reason, eligibility };
  }

  const cost = eligibility.finalCost ?? item.points_cost;
  const initialPoints = eligibility.currentPoints;
  const newPoints = initialPoints - cost;

  // 1. ตัดแต้มลง Supabase
  if (supabase) {
    try {
      const { error: deductErr } = await supabase
        .from("tenant_minigame_scores")
        .update({
          points: newPoints,
          updated_at: new Date().toISOString(),
        })
        .eq("guild_id", guildId)
        .eq("user_id", userId)
        .gte("points", cost);

      if (deductErr) throw deductErr;
    } catch (err) {
      console.error(`[itemStoreEngine] Point deduction error for ${userId}:`, err.message);
      return { success: false, error: "เกิดข้อผิดพลาดในการตัดแต้ม กรุณาลองใหม่อีกครั้งครับ" };
    }
  }

  // 2. มอบยศ Discord พร้อมระบบ Rollback
  const targetRole = guild.roles.cache.get(item.role_id);
  try {
    await member.roles.add(targetRole, `แลกยศด้วยแต้มมินิเกมบอท Kuma: ${item.name}`);
  } catch (roleErr) {
    console.error(`[itemStoreEngine] Role assignment failed for ${userId}:`, roleErr.message);
    // Auto-Rollback คืนแต้ม
    if (supabase) {
      await supabase
        .from("tenant_minigame_scores")
        .update({
          points: initialPoints,
          updated_at: new Date().toISOString(),
        })
        .eq("guild_id", guildId)
        .eq("user_id", userId)
        .catch(() => {});
    }
    return {
      success: false,
      error: "เกิดข้อผิดพลาดในการมอบยศ บอทได้ทำการคืนแต้มให้ท่านเรียบร้อยแล้วครับ",
    };
  }

  // 3. ลดสต็อกสินค้า (หากมีจำกัด)
  if (typeof item.stock === "number" && item.stock > 0 && supabase) {
    await supabase
      .from("tenant_store_items_v2")
      .update({ stock: Math.max(0, item.stock - 1) })
      .eq("id", item.id)
      .catch(() => {});
    invalidateItemsCache(guildId);
  }

  // 4. บันทึกประวัติ Redemptions
  if (supabase) {
    await supabase.from("tenant_store_redemptions").insert({
      guild_id: guildId,
      user_id: userId,
      item_id: item.id,
      item_name: item.name,
      role_id: item.role_id,
      points_spent: cost,
      created_at: new Date().toISOString(),
    }).catch((err) => console.warn(`[itemStoreEngine] Redemption log error:`, err.message));
  }

  // 5. ส่งใบเสร็จ Log Channel (ถ้าเซิร์ฟเวอร์ตั้งค่าไว้)
  try {
    const storeConfig = await getTenantStoreConfig(supabase, guildId);
    if (storeConfig && storeConfig.log_channel_id) {
      const logChannel = guild.channels.cache.get(storeConfig.log_channel_id) ||
        (await guild.channels.fetch(storeConfig.log_channel_id).catch(() => null));

      if (logChannel && typeof logChannel.send === "function") {
        const { buildStoreReceiptPayload } = require("./itemStorePayloads");
        const receiptPayload = buildStoreReceiptPayload(member, item, newPoints, storeConfig.currency_emoji);
        await logChannel.send(receiptPayload).catch(() => {});
      }
    }
  } catch (logErr) {
    console.warn(`[itemStoreEngine] Failed to dispatch store log:`, logErr.message);
  }

  return {
    success: true,
    newPoints,
    item,
    finalCost: cost,
    maxDiscount: eligibility.maxDiscount,
    discountRoleId: eligibility.discountRoleId,
  };
}

/**
 * ดึงรายการส่วนลดยศของร้านค้า
 */
async function getStoreDiscounts(supabase, guildId) {
  const { getTenantStoreConfig } = require("./storeEngine");
  const config = await getTenantStoreConfig(supabase, guildId);
  return Array.isArray(config?.role_discounts) ? config.role_discounts : [];
}

/**
 * บันทึกรายการส่วนลดยศของร้านค้า
 */
async function saveStoreDiscounts(supabase, guildId, discounts) {
  const { saveTenantStoreConfig } = require("./storeEngine");
  return await saveTenantStoreConfig(supabase, guildId, {
    role_discounts: Array.isArray(discounts) ? discounts : [],
  });
}

module.exports = {
  getGuildItems,
  getGuildItemById,
  createGuildItem,
  updateGuildItem,
  deleteGuildItem,
  getTenantUserPoints,
  checkItemRedemptionEligibility,
  executeRoleRedemption,
  getStoreDiscounts,
  saveStoreDiscounts,
  invalidateItemsCache,
};
