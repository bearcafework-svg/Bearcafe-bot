// src/features/beeGacha/gachaService.js
// Service จัดการ Logic สุ่มกาชา แต้ม คลัง และการสวมใส่ชุดผึ้ง (Primary Supabase DB + Zero Egress Fallback)

const { createClient } = require('@supabase/supabase-js');
const cfg = require('./settingGacha.json');
const { getUserGachaData: getLocalGachaData, updateUserGachaData: updateLocalGachaData } = require('./mockStorage');
const logger = require('../../../utils/logger');

let supabaseClient = null;
let isQuotaRestricted = false;

function getSupabase() {
  if (isQuotaRestricted) return null;
  if (!supabaseClient && process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabaseClient = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
  }
  return supabaseClient;
}

function handleQuotaError(err) {
  const msg = err?.message || err?.details || (typeof err === 'string' ? err : '');
  if (msg.includes('exceed_egress_quota') || msg.includes('restricted') || err?.code === '402') {
    if (!isQuotaRestricted) {
      isQuotaRestricted = true;
      logger.warn('SUPABASE', 'BeeGacha: Egress Quota Exceeded. Switched to Zero-Egress local fallback mode.');
    }
    return true;
  }
  return false;
}

/**
 * สุ่มไอเทม 1 ชิ้นตามน้ำหนัก Rarity (Weighted Random Roll)
 */
function getRandomCosmetic(guaranteedRarity = null) {
  let cosmeticsPool = cfg.cosmetics;
  if (guaranteedRarity) {
    const higherOrEqualRarities = ['RARE', 'EPIC', 'LEGENDARY'];
    cosmeticsPool = cfg.cosmetics.filter(c => higherOrEqualRarities.includes(c.rarity));
  }

  const totalWeight = cosmeticsPool.reduce((sum, item) => sum + (cfg.rarity_weights[item.rarity] || 10), 0);
  let randomNum = Math.random() * totalWeight;

  for (const cosmetic of cosmeticsPool) {
    const weight = cfg.rarity_weights[cosmetic.rarity] || 10;
    if (randomNum <= weight) {
      return cosmetic;
    }
    randomNum -= weight;
  }

  return cosmeticsPool[0];
}

/**
 * ดึงข้อมูลกาชาของผู้ใช้ (อ่านจาก Supabase เป็นหลัก ตกหล่นใช้ Local)
 */
async function getUserGachaData(userId) {
  const supabase = getSupabase();
  if (!supabase) {
    return getLocalGachaData(userId);
  }

  try {
    // ดึงแต้มจาก user_points
    const { data: pointRow, error: pointErr } = await supabase
      .from('user_points')
      .select('points')
      .eq('discord_id', userId)
      .maybeSingle();

    if (pointErr && handleQuotaError(pointErr)) {
      return getLocalGachaData(userId);
    }

    const currentPoints = pointRow?.points ?? 2000;

    // ดึงข้อมูลกู้คืนจาก user_bee_gacha
    const { data: gachaRow, error: gachaErr } = await supabase
      .from('user_bee_gacha')
      .select('*')
      .eq('discord_id', userId)
      .maybeSingle();

    if (gachaErr && handleQuotaError(gachaErr)) {
      return getLocalGachaData(userId);
    }

    const defaultEquipped = { BACKGROUND: null, OUTFIT: null, HAT: null, ACCESSORY: null };

    if (!gachaRow) {
      // ลงทะเบียนใหม่ใน Supabase
      const newRecord = {
        discord_id: userId,
        honey_dust: 0,
        inventory: [],
        equipped: defaultEquipped
      };
      await supabase.from('user_bee_gacha').upsert(newRecord).catch(() => {});
      return {
        points: currentPoints,
        honey_dust: 0,
        inventory: [],
        equipped: defaultEquipped
      };
    }

    return {
      points: currentPoints,
      honey_dust: gachaRow.honey_dust || 0,
      inventory: Array.isArray(gachaRow.inventory) ? gachaRow.inventory : [],
      equipped: typeof gachaRow.equipped === 'object' && gachaRow.equipped ? gachaRow.equipped : defaultEquipped
    };

  } catch (err) {
    console.error('[gachaService] Error fetching user gacha data:', err.message);
    return getLocalGachaData(userId);
  }
}

/**
 * ทำการสุ่มกาชา 1x หรือ 10x
 */
async function rollGacha(userId, count = 1) {
  const userData = await getUserGachaData(userId);
  const cost = count === 10 ? cfg.ten_roll_price : cfg.single_roll_price;

  if (userData.points < cost) {
    return {
      success: false,
      message: `แต้มของคุณไม่เพียงพอ! ต้องการ **${cost} แต้ม** (คุณมี **${userData.points} แต้ม**)`
    };
  }

  const rolledResults = [];
  let addedDust = 0;

  const newPoints = userData.points - cost;
  const newInventory = [...userData.inventory];
  let newDust = userData.honey_dust;

  for (let i = 0; i < count; i++) {
    const guaranteed = (count === 10 && i === 9) ? 'RARE' : null;
    const item = getRandomCosmetic(guaranteed);
    const isDuplicate = newInventory.includes(item.id);

    if (isDuplicate) {
      newDust += item.dust_value;
      addedDust += item.dust_value;
      rolledResults.push({ ...item, isDuplicate: true, dustEarned: item.dust_value });
    } else {
      newInventory.push(item.id);
      rolledResults.push({ ...item, isDuplicate: false, dustEarned: 0 });
    }
  }

  const supabase = getSupabase();
  if (supabase) {
    try {
      // 1. อัปเดตแต้มคงเหลือใน user_points
      await supabase
        .from('user_points')
        .upsert({ discord_id: userId, points: newPoints });

      // 2. อัปเดตผงน้ำผึ้งและคลังใน user_bee_gacha
      await supabase
        .from('user_bee_gacha')
        .upsert({
          discord_id: userId,
          honey_dust: newDust,
          inventory: newInventory,
          equipped: userData.equipped,
          updated_at: new Date().toISOString()
        });

    } catch (err) {
      if (!handleQuotaError(err)) {
        console.error('[gachaService] Error updating Supabase gacha:', err.message);
      }
      // Fallback update to local
      updateLocalGachaData(userId, () => ({
        points: newPoints,
        honey_dust: newDust,
        inventory: newInventory
      }));
    }
  } else {
    updateLocalGachaData(userId, () => ({
      points: newPoints,
      honey_dust: newDust,
      inventory: newInventory
    }));
  }

  const updatedUserData = await getUserGachaData(userId);

  return {
    success: true,
    cost,
    results: rolledResults,
    addedDust,
    userData: updatedUserData
  };
}

/**
 * สลับสวมใส่ไอเทมแต่งตัวผึ้ง
 */
async function equipItem(userId, cosmeticId) {
  const userData = await getUserGachaData(userId);
  const cosmetic = cfg.cosmetics.find(c => c.id === cosmeticId);

  if (!cosmetic) return { success: false, message: 'ไม่พบไอเทมนี้ในระบบ' };
  if (!userData.inventory.includes(cosmeticId)) return { success: false, message: 'คุณยังไม่ได้ครอบครองไอเทมชิ้นนี้' };

  const currentEquipped = { ...userData.equipped };
  if (currentEquipped[cosmetic.slot] === cosmeticId) {
    currentEquipped[cosmetic.slot] = null;
  } else {
    currentEquipped[cosmetic.slot] = cosmeticId;
  }

  const supabase = getSupabase();
  if (supabase) {
    try {
      await supabase
        .from('user_bee_gacha')
        .upsert({
          discord_id: userId,
          honey_dust: userData.honey_dust,
          inventory: userData.inventory,
          equipped: currentEquipped,
          updated_at: new Date().toISOString()
        });
    } catch (err) {
      if (!handleQuotaError(err)) {
        console.error('[gachaService] Error equipping item in Supabase:', err.message);
      }
      updateLocalGachaData(userId, () => ({ equipped: currentEquipped }));
    }
  } else {
    updateLocalGachaData(userId, () => ({ equipped: currentEquipped }));
  }

  const updatedUserData = await getUserGachaData(userId);

  return {
    success: true,
    equipped: updatedUserData.equipped,
    cosmetic
  };
}

module.exports = {
  rollGacha,
  equipItem,
  getUserGachaData
};
