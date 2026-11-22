// src/features/loyKrathong/loyKrathongService.js
// ตัวจัดการการทำงานฐานข้อมูลและการส่งข้อความกระทง

const { createClient } = require("@supabase/supabase-js");
const { TARGET_CHANNEL_ID } = require("./loyKrathongConfig");
const { buildLoyKrathongChannelPayload } = require("./loyKrathongPayloads");

let supabaseInstance = null;

function getSupabase() {
  if (!supabaseInstance) {
    if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return null;
    }
    supabaseInstance = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
          detectSessionInUrl: false,
        },
      }
    );
  }
  return supabaseInstance;
}

/**
 * ดำเนินการส่งกระทงเข้าห้องและบันทึกประวัติลง Supabase พร้อมคำนวณการแจกเหรียญ 10 เหรียญ
 * @param {object} params
 * @param {import('discord.js').Client} params.client
 * @param {string} params.senderId
 * @param {string} params.receiverId
 * @param {string} params.message
 */
async function processKrathongSubmission({ client, senderId, receiverId, message }) {
  const cleanMessage = (message || "").trim();
  if (!cleanMessage) {
    throw new Error("ข้อความไม่สามารถเป็นค่าว่างได้ค่ะ");
  }

  if (cleanMessage.length > 2000) {
    throw new Error("ข้อความมีความยาวเกินกำหนด (สูงสุดไม่เกิน 2,000 ตัวอักษร) ค่ะ");
  }

  // 1. ดึงห้องปลายทางสำหรับแสดงกระทง
  const targetChannel = await client.channels.fetch(TARGET_CHANNEL_ID).catch(() => null);
  if (!targetChannel || !targetChannel.isTextBased()) {
    throw new Error(`ไม่พบห้องปลายทางสำหรับส่งกระทง (<#${TARGET_CHANNEL_ID}>) หรือบอทไม่มีสิทธิ์เข้าถึงค่ะ`);
  }

  // 2. ส่งการ์ดกระทง Component V2 ไปยังห้องปลายทาง
  const timestamp = Math.floor(Date.now() / 1000);
  const channelPayload = buildLoyKrathongChannelPayload(receiverId, cleanMessage, timestamp);

  try {
    await targetChannel.send(channelPayload);
  } catch (sendErr) {
    console.error("[loyKrathong] Failed to send krathong message to channel:", sendErr);
    throw new Error(`ระบบ Discord ปฏิเสธการส่งข้อความ: ${sendErr.message || "Unknown error"}`);
  }

  // 3. ตรวจสอบและบันทึกลง Supabase
  const supabase = getSupabase();
  let isFirstTime = false;

  if (supabase) {
    try {
      // ตรวจสอบว่าผู้ใช้เคยได้รับรางวัลเหรียญ 10 เหรียญหรือยัง
      const { data: existingReward, error: checkErr } = await supabase
        .from("loy_krathong_messages")
        .select("id")
        .eq("sender_id", senderId)
        .eq("reward_given", true)
        .limit(1);

      if (checkErr) {
        console.warn("[loyKrathong] Check existing reward warning:", checkErr.message);
      }

      isFirstTime = !existingReward || existingReward.length === 0;

      if (isFirstTime) {
        // อัปเดตเพิ่มเหรียญ gacha_coins +10 ใน user_points
        const { data: userPointRow } = await supabase
          .from("user_points")
          .select("gacha_coins")
          .eq("discord_id", senderId)
          .maybeSingle();

        const currentCoins = Number(userPointRow?.gacha_coins || 0);
        await supabase
          .from("user_points")
          .upsert(
            {
              discord_id: senderId,
              gacha_coins: currentCoins + 10,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "discord_id" }
          );

        console.log(`[loyKrathong] 🎁 มอบเหรียญกาชา +10 ให้กับผู้ใช้ ${senderId} สำเร็จ (ยอดรวม: ${currentCoins + 10})`);
      }

      // บันทึกประวัติการส่งกระทงลงตาราง loy_krathong_messages
      await supabase.from("loy_krathong_messages").insert({
        sender_id: senderId,
        receiver_id: receiverId,
        message: cleanMessage,
        reward_given: isFirstTime,
        channel_id: TARGET_CHANNEL_ID,
      });
    } catch (dbErr) {
      console.error("[loyKrathong] Database error during krathong processing:", dbErr);
      // ข้อความถูกส่งไปในดิสคอร์ดเรียบร้อยแล้ว แม้ DB จะมีปัญหาชั่วคราว
    }
  }

  return {
    success: true,
    isFirstTime,
    cleanMessage,
  };
}

module.exports = {
  processKrathongSubmission,
  getSupabase,
};
