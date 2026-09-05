// src/utils/cooldownManager.js

/**
 * ดึงข้อมูลคูลดาวน์จาก Supabase
 * @param {Object} supabase 
 * @param {string} userId 
 * @param {string} commandName 
 * @returns {Promise<number>} timestamp ที่หมดคูลดาวน์ (ms) ถ้าไม่มีคืนค่า 0
 */
async function getCooldown(supabase, userId, commandName) {
  try {
    const { data, error } = await supabase
      .from('user_cooldowns')
      .select('expires_at')
      .eq('discord_id', userId)
      .eq('command', commandName)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return 0; // ไม่พบข้อมูล แปลว่าไม่มีคูลดาวน์
      console.error(`[cooldownManager] getCooldown error for ${commandName}:`, error.message);
      return 0;
    }
    return data?.expires_at ?? 0;
  } catch (err) {
    console.error(`[cooldownManager] getCooldown exception for ${commandName}:`, err.message);
    return 0;
  }
}

/**
 * บันทึก/อัปเดตคูลดาวน์ลง Supabase
 * @param {Object} supabase 
 * @param {string} userId 
 * @param {string} commandName 
 * @param {number} expiresAtMs 
 */
async function setCooldown(supabase, userId, commandName, expiresAtMs) {
  try {
    const { error } = await supabase
      .from('user_cooldowns')
      .upsert(
        { discord_id: userId, command: commandName, expires_at: expiresAtMs },
        { onConflict: 'discord_id, command' }
      );

    if (error) {
      console.error(`[cooldownManager] setCooldown error for ${commandName}:`, error.message);
    }
  } catch (err) {
    console.error(`[cooldownManager] setCooldown exception for ${commandName}:`, err.message);
  }
}

module.exports = { getCooldown, setCooldown };
