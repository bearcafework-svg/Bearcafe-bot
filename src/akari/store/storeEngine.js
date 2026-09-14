// ===================================================
// src/akari/store/storeEngine.js
// ระบบคลังข้อมูลและตรรกะการทำงานของร้านค้าแลกของรางวัล Akari Bot (Store Engine)
// รองรับการทำงานคู่กับ Akari Supabase พร้อม Hybrid In-Memory Fallback
// ===================================================

// In-Memory Fallback & Cache
const storeConfigCache = new Map(); // guildId -> config
const storeItemsCache = new Map();  // guildId -> Map(slot -> item)
const userRedemptionsCache = new Map(); // `${guildId}:${userId}:${slot}` -> boolean

// ค่าเริ่มต้นสำหรับ Item 3 ช่อง (Slot 1, 2, 3)
function createDefaultItem(slot) {
  const defaultEmojis = { 1: "🎁", 2: "👑", 3: "☕" };
  const defaultNames = { 1: "ยศพิเศษประจำเซิร์ฟเวอร์", 2: "บัตรแลกเครื่องดื่ม/สิทธิพิเศษ", 3: "ของรางวัลพรีเมียม" };
  const defaultCosts = { 1: 200, 2: 500, 3: 1000 };

  return {
    slot,
    name: defaultNames[slot] || `ของรางวัลชิ้นที่ ${slot}`,
    description: "สะสมแต้มจากการเล่นมินิเกมเพื่อนำมาแลกรับของรางวัลนี้",
    points_cost: defaultCosts[slot] || (slot * 250),
    wins_required: 0,
    reward_type: slot === 1 ? "role" : "custom",
    role_id: null,
    limit_type: slot === 1 ? "once_per_user" : "unlimited",
    emoji: defaultEmojis[slot] || "🎁",
    is_active: false,
  };
}

/**
 * ดึงการตั้งค่าร้านค้าของแต่ละ Guild
 */
async function getTenantStoreConfig(supabase, guildId) {
  if (!guildId) return { guild_id: guildId, log_channel_id: null, is_enabled: true };

  if (storeConfigCache.has(guildId)) {
    return storeConfigCache.get(guildId);
  }

  if (!supabase) {
    const fallback = { guild_id: guildId, log_channel_id: null, is_enabled: true };
    storeConfigCache.set(guildId, fallback);
    return fallback;
  }

  try {
    const { data, error } = await supabase
      .from("tenant_store_configs")
      .select("guild_id, log_channel_id, is_enabled")
      .eq("guild_id", guildId)
      .maybeSingle();

    if (error || !data) {
      const fallback = { guild_id: guildId, log_channel_id: null, is_enabled: true };
      storeConfigCache.set(guildId, fallback);
      return fallback;
    }

    storeConfigCache.set(guildId, data);
    return data;
  } catch (err) {
    console.warn(`[akari-store] getTenantStoreConfig error for ${guildId}:`, err.message);
    const fallback = { guild_id: guildId, log_channel_id: null, is_enabled: true };
    storeConfigCache.set(guildId, fallback);
    return fallback;
  }
}

/**
 * บันทึกการตั้งค่าร้านค้า (เช่น ห้อง Log Channel หรือเปิด/ปิดร้าน)
 */
async function saveTenantStoreConfig(supabase, guildId, updates) {
  if (!guildId) return null;

  const current = await getTenantStoreConfig(supabase, guildId);
  const updated = {
    ...current,
    ...updates,
    guild_id: guildId,
    updated_at: new Date().toISOString(),
  };

  storeConfigCache.set(guildId, updated);

  if (supabase) {
    try {
      await supabase.from("tenant_store_configs").upsert(updated);
    } catch (err) {
      console.warn(`[akari-store] saveTenantStoreConfig DB error:`, err.message);
    }
  }

  return updated;
}

/**
 * ดึงรายการไอเทมทั้ง 3 Slots ของ Guild
 */
async function getTenantStoreItems(supabase, guildId) {
  if (!guildId) return [createDefaultItem(1), createDefaultItem(2), createDefaultItem(3)];

  if (storeItemsCache.has(guildId)) {
    const itemsMap = storeItemsCache.get(guildId);
    return [1, 2, 3].map((slot) => itemsMap.get(slot) || createDefaultItem(slot));
  }

  const itemsMap = new Map();
  [1, 2, 3].forEach((slot) => itemsMap.set(slot, createDefaultItem(slot)));

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("tenant_store_items")
        .select("*")
        .eq("guild_id", guildId)
        .order("slot", { ascending: true });

      if (!error && Array.isArray(data)) {
        data.forEach((item) => {
          if (item.slot >= 1 && item.slot <= 3) {
            itemsMap.set(item.slot, {
              slot: item.slot,
              name: item.name || `ของรางวัลชิ้นที่ ${item.slot}`,
              description: item.description || "",
              points_cost: Number(item.points_cost) || 100,
              wins_required: Number(item.wins_required) || 0,
              reward_type: item.reward_type || "custom",
              role_id: item.role_id || null,
              limit_type: item.limit_type || "unlimited",
              emoji: item.emoji || "🎁",
              is_active: Boolean(item.is_active),
            });
          }
        });
      }
    } catch (err) {
      console.warn(`[akari-store] getTenantStoreItems DB error for ${guildId}:`, err.message);
    }
  }

  storeItemsCache.set(guildId, itemsMap);
  return [1, 2, 3].map((slot) => itemsMap.get(slot));
}

/**
 * บันทึกการตั้งค่าไอเทมในแต่ละ Slot (1-3)
 */
async function saveTenantStoreItem(supabase, guildId, slot, itemData) {
  if (!guildId || slot < 1 || slot > 3) return null;

  let itemsMap = storeItemsCache.get(guildId);
  if (!itemsMap) {
    itemsMap = new Map();
    [1, 2, 3].forEach((s) => itemsMap.set(s, createDefaultItem(s)));
    storeItemsCache.set(guildId, itemsMap);
  }

  const current = itemsMap.get(slot) || createDefaultItem(slot);
  const updatedItem = {
    ...current,
    ...itemData,
    guild_id: guildId,
    slot,
    updated_at: new Date().toISOString(),
  };

  itemsMap.set(slot, updatedItem);

  if (supabase) {
    try {
      await supabase.from("tenant_store_items").upsert({
        guild_id: guildId,
        slot,
        name: updatedItem.name,
        description: updatedItem.description,
        points_cost: updatedItem.points_cost,
        wins_required: updatedItem.wins_required,
        reward_type: updatedItem.reward_type,
        role_id: updatedItem.role_id,
        limit_type: updatedItem.limit_type,
        emoji: updatedItem.emoji,
        is_active: updatedItem.is_active,
      });
    } catch (err) {
      console.warn(`[akari-store] saveTenantStoreItem DB error for ${guildId}:`, err.message);
    }
  }

  return updatedItem;
}

/**
 * ดึงคะแนนและจำนวนวินของผู้เล่น
 */
async function getUserTenantScore(supabase, guildId, userId) {
  if (!guildId || !userId) return { points: 0, wins: 0 };

  if (!supabase) return { points: 0, wins: 0 };

  try {
    const { data, error } = await supabase
      .from("tenant_minigame_scores")
      .select("points, wins")
      .eq("guild_id", guildId)
      .eq("user_id", userId)
      .maybeSingle();

    if (error || !data) {
      return { points: 0, wins: 0 };
    }

    return {
      points: Number(data.points) || 0,
      wins: Number(data.wins) || 0,
    };
  } catch (err) {
    console.warn(`[akari-store] getUserTenantScore error:`, err.message);
    return { points: 0, wins: 0 };
  }
}

/**
 * ตรวจสอบสิทธิ์การแลกของรางวัลของผู้เล่น
 */
async function checkUserRedemptionEligibility(supabase, guildId, userId, slotOrItem, optionalItem) {
  let slot = 1;
  let item = null;
  if (typeof slotOrItem === "object" && slotOrItem !== null) {
    item = slotOrItem;
    slot = item.slot || 1;
  } else {
    slot = Number(slotOrItem);
    item = optionalItem;
  }

  if (!item) {
    const items = await getTenantStoreItems(supabase, guildId);
    item = items.find((i) => i.slot === slot) || createDefaultItem(slot);
  }

  const userScore = await getUserTenantScore(supabase, guildId, userId);

  // 1. ตรวจสอบว่าไอเทมเปิดใช้งานอยู่หรือไม่
  if (!item.is_active) {
    return {
      eligible: false,
      reason: "ของรางวัลชิ้นนี้ยังไม่เปิดให้แลกในขณะนี้ค่ะ",
      currentPoints: userScore.points,
      currentWins: userScore.wins,
    };
  }

  // 2. ตรวจสอบแต้มสะสม
  if (userScore.points < item.points_cost) {
    const diff = item.points_cost - userScore.points;
    return {
      eligible: false,
      reason: `แต้มสะสมของคุณไม่เพียงพอค่ะ (ต้องการอีก **${diff.toLocaleString()} แต้ม**)`,
      currentPoints: userScore.points,
      currentWins: userScore.wins,
    };
  }

  // 3. ตรวจสอบจำนวนการชนะ (ถ้ามีกำหนด)
  if (item.wins_required > 0 && userScore.wins < item.wins_required) {
    const diffWins = item.wins_required - userScore.wins;
    return {
      eligible: false,
      reason: `จำนวนการชนะของคุณยังไม่ถึงเกณฑ์ค่ะ (ต้องการการชนะอีก **${diffWins.toLocaleString()} ครั้ง**)`,
      currentPoints: userScore.points,
      currentWins: userScore.wins,
    };
  }

  // 4. ตรวจสอบการจำกัดสิทธิ์ 1 ครั้งต่อผู้เล่น (Once per user)
  if (item.limit_type === "once_per_user") {
    const cacheKey = `${guildId}:${userId}:${slot}`;
    if (userRedemptionsCache.has(cacheKey)) {
      return {
        eligible: false,
        reason: "คุณเคยแลกรับของรางวัลชิ้นนี้ไปแล้วค่ะ (ของรางวัลนี้จำกัดสิทธิ์ 1 ครั้งต่อคน)",
        currentPoints: userScore.points,
        currentWins: userScore.wins,
      };
    }

    if (supabase) {
      try {
        const { data } = await supabase
          .from("tenant_store_redemptions")
          .select("id")
          .eq("guild_id", guildId)
          .eq("user_id", userId)
          .eq("slot", slot)
          .limit(1);

        if (data && data.length > 0) {
          userRedemptionsCache.set(cacheKey, true);
          return {
            eligible: false,
            reason: "คุณเคยแลกรับของรางวัลชิ้นนี้ไปแล้วค่ะ (ของรางวัลนี้จำกัดสิทธิ์ 1 ครั้งต่อคน)",
            currentPoints: userScore.points,
            currentWins: userScore.wins,
          };
        }
      } catch (_) {}
    }
  }

  return {
    eligible: true,
    currentPoints: userScore.points,
    currentWins: userScore.wins,
  };
}

/**
 * ดำเนินการแลกของรางวัล (ตัดแต้ม, มอบยศ Discord, ส่งใบเสร็จ Log, บันทึกประวัติ)
 */
async function executeRedemption(client, supabase, guild, member, slot, item) {
  const guildId = guild.id;
  const userId = member.id;

  // 1. ตรวจสอบสิทธิ์อีกครั้งเพื่อความปลอดภัย (Atomic Check)
  const eligibility = await checkUserRedemptionEligibility(supabase, guildId, userId, slot, item);
  if (!eligibility.eligible) {
    return { success: false, error: eligibility.reason };
  }

  // 2. ดำเนินการตัดแต้ม
  let newPoints = eligibility.currentPoints - item.points_cost;
  if (supabase) {
    try {
      const { data, error } = await supabase
        .from("tenant_minigame_scores")
        .update({
          points: newPoints,
          updated_at: new Date().toISOString(),
        })
        .eq("guild_id", guildId)
        .eq("user_id", userId)
        .gte("points", item.points_cost);

      if (error) {
        throw error;
      }
    } catch (err) {
      console.error(`[akari-store] Point deduction failed for ${userId}:`, err.message);
      return { success: false, error: "เกิดข้อผิดพลาดในการตัดแต้ม กรุณาลองใหม่อีกครั้งค่ะ" };
    }
  }

  // บันทึกลง cache ป้องกันการแลกซ้ำ
  const cacheKey = `${guildId}:${userId}:${slot}`;
  userRedemptionsCache.set(cacheKey, true);

  // 3. จัดการของรางวัลตามประเภท
  let roleAdded = false;
  let roleError = null;

  if (item.reward_type === "role" && item.role_id) {
    try {
      const role = guild.roles.cache.get(item.role_id) || (await guild.roles.fetch(item.role_id).catch(() => null));
      if (role) {
        await member.roles.add(role, `แลกของรางวัลมินิเกม Akari: ${item.name}`);
        roleAdded = true;
      } else {
        roleError = "ไม่พบบทบาทในเซิร์ฟเวอร์ (อาจถูกลบไปแล้ว)";
      }
    } catch (err) {
      console.error(`[akari-store] Failed to add role ${item.role_id} to ${userId}:`, err.message);
      roleError = "บอทไม่มีสิทธิ์มอบยศนี้ (กรุณาให้แอดมินลากตำแหน่งยศบอทไว้สูงกว่ายศของรางวัล)";
    }
  }

  // 4. บันทึกประวัติการแลกลงฐานข้อมูล
  if (supabase) {
    try {
      await supabase.from("tenant_store_redemptions").insert({
        guild_id: guildId,
        user_id: userId,
        slot,
        item_name: item.name,
        points_spent: item.points_cost,
        wins_at_redemption: eligibility.currentWins,
        reward_type: item.reward_type,
        role_id: item.role_id,
      });
    } catch (err) {
      console.warn(`[akari-store] Log redemption to DB failed:`, err.message);
    }
  }

  // 5. ส่งใบเสร็จแจ้งเตือนเข้าห้อง Log Channel ของแอดมิน (ถ้ามีการตั้งค่าไว้)
  const storeConfig = await getTenantStoreConfig(supabase, guildId);
  if (storeConfig.log_channel_id) {
    try {
      const logChannel = guild.channels.cache.get(storeConfig.log_channel_id) || (await guild.channels.fetch(storeConfig.log_channel_id).catch(() => null));
      if (logChannel && logChannel.isTextBased()) {
        const { buildRedemptionReceiptLog } = require("./storePayloads");
        const logPayload = buildRedemptionReceiptLog(guild, member.user, item, eligibility.currentPoints, newPoints, roleAdded, roleError);
        await logChannel.send(logPayload).catch(() => {});
      }
    } catch (err) {
      console.warn(`[akari-store] Failed to send log to channel:`, err.message);
    }
  }

  return {
    success: true,
    newPoints,
    roleAdded,
    roleError,
  };
}

module.exports = {
  createDefaultItem,
  getTenantStoreConfig,
  saveTenantStoreConfig,
  getTenantStoreItems,
  saveTenantStoreItem,
  getUserTenantScore,
  checkUserRedemptionEligibility,
  executeRedemption,
};
