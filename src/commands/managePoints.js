// src/commands/managePoints.js
// ระบบจัดการแต้ม (Points) และเค้ก (Cakes) ในตาราง user_points บน Supabase 2
// สิทธิ์: Server Owner, Bot Owner หรือทีมงานยศที่ได้รับอนุญาต
// การแสดงผล: Ephemeral (ehp)

const { EmbedBuilder } = require("discord.js");
const { createClient } = require("@supabase/supabase-js");
const { registerCommand } = require("../interactions/router");

const SUPABASE_2_URL =
  process.env.POINTS_SUPABASE_URL ||
  process.env.HEALJAI_SUPABASE_URL ||
  process.env.SUPABASE_URL ||
  "https://fqzhcpzxdlnvhvlqspgc.supabase.co";

const SUPABASE_2_KEY =
  process.env.POINTS_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.HEALJAI_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase2Instance = null;
function getSupabase2Client() {
  if (!supabase2Instance) {
    supabase2Instance = createClient(SUPABASE_2_URL, SUPABASE_2_KEY, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
    });
  }
  return supabase2Instance;
}

const ALLOWED_STAFF_ROLE_IDS = [
  "1144697989986791576",
  "1144698080239829092",
];

/**
 * ตรวจสอบสิทธิ์ว่ามีสิทธิ์จัดการแต้มหรือไม่ (Owner หรือ Staff ยศที่กำหนด)
 * @param {import("discord.js").ChatInputCommandInteraction} interaction 
 */
function canManagePoints(interaction) {
  const userId = interaction.user?.id;
  if (!userId) return false;

  const botOwnerId = process.env.OWNER_ID || "944920660759707658";
  const guildOwnerId = interaction.guild?.ownerId;

  // 1. ตรวจสอบ Owner (Bot Owner หรือ Server Owner)
  if (userId === botOwnerId || (Boolean(guildOwnerId) && userId === guildOwnerId)) {
    return true;
  }

  // 2. ตรวจสอบยศ Staff ที่ได้รับอนุญาต (1144697989986791576, 1144698080239829092)
  const member = interaction.member;
  if (member?.roles) {
    if (member.roles.cache && typeof member.roles.cache.some === "function") {
      if (member.roles.cache.some((r) => ALLOWED_STAFF_ROLE_IDS.includes(r.id))) return true;
    } else if (Array.isArray(member.roles)) {
      if (member.roles.some((rId) => ALLOWED_STAFF_ROLE_IDS.includes(rId))) return true;
    }
  }

  return false;
}

/**
 * ติดตั้งระบบจัดการแต้ม
 * @param {import("discord.js").Client} client 
 */
function setupManagePoints(client) {
  registerCommand("จัดการแต้ม", async (interaction) => {
    // 1. ตรวจสอบสิทธิ์ — เฉพาะ Owner หรือ Staff ยศที่ได้รับอนุญาต
    if (!canManagePoints(interaction)) {
      return interaction.reply({
        content: "❌ ขออภัยค่ะ เฉพาะ **Server Owner** หรือ **ทีมงานที่ได้รับอนุญาต** เท่านั้นที่สามารถใช้คำสั่งนี้ได้",
        ephemeral: true,
      });
    }

    // 2. ตอบรับการโต้ตอบล่วงหน้าแบบ Ephemeral (ป้องกัน Interaction Timeout)
    await interaction.deferReply({ ephemeral: true }).catch(() => {});

    const targetUser = interaction.options.getUser("user");
    const action = interaction.options.getString("action"); // "add" | "remove"
    const type = interaction.options.getString("type"); // "point" | "cake"
    const amount = interaction.options.getInteger("amount");

    if (!targetUser || !action || !type || amount === null || amount <= 0) {
      return interaction.editReply({
        content: "⚠️ กรุณาระบุข้อมูลให้ครบถ้วนและถูกต้อง (amount ต้องมากกว่า 0)",
      });
    }

    const supabase = getSupabase2Client();
    if (!supabase) {
      return interaction.editReply({
        content: "❌ ไม่สามารถเชื่อมต่อฐานข้อมูล Supabase 2 ได้ กรุณาตรวจสอบการตั้งค่าระบบ",
      });
    }

    try {
      // 3. ดึงข้อมูลปัจจุบันจากตาราง user_points บน Supabase 2
      const { data: row, error: fetchErr } = await supabase
        .from("user_points")
        .select("discord_id, points, cakes, gacha_coins")
        .eq("discord_id", targetUser.id)
        .maybeSingle();

      if (fetchErr) {
        console.error("[managePoints] Fetch error:", fetchErr.message);
        return interaction.editReply({
          content: `❌ เกิดข้อผิดพลาดในการดึงข้อมูลจาก Supabase 2: ${fetchErr.message}`,
        });
      }

      const currentPoints = Number(row?.points || 0);
      const currentCakes = Number(row?.cakes || 0);
      const currentGachaCoins = Number(row?.gacha_coins || 0);

      let newPoints = currentPoints;
      let newCakes = currentCakes;
      let newGachaCoins = currentGachaCoins;
      let changeText = "";
      let typeLabel = "";
      let unit = "";

      if (type === "point") {
        typeLabel = "🍵 แต้ม (point)";
        unit = "แต้ม";
        if (action === "add") {
          const targetMember = interaction.guild?.members.cache.get(targetUser.id) || await interaction.guild?.members.fetch(targetUser.id).catch(() => null);
          const { addPointsWithCap } = require("../utils/pointManager");
          const pointRes = await addPointsWithCap(supabase, targetMember, targetUser.id, amount, {
            ignoreDailyCap: true,
            allowOverflowExceedCap: true
          });
          newPoints = pointRes.points;
          changeText = `+${amount.toLocaleString()}`;
          if (pointRes.toOverflow > 0) {
            changeText += ` (เข้ากระเป๋า ${pointRes.toWallet.toLocaleString()}, เข้าแต้มส่วนเกิน ${pointRes.toOverflow.toLocaleString()})`;
          }
        } else {
          newPoints = Math.max(0, currentPoints - amount);
          changeText = `-${amount.toLocaleString()}`;
          const { error: upsertErr } = await supabase
            .from("user_points")
            .upsert(
              {
                discord_id: targetUser.id,
                points: newPoints,
                cakes: newCakes,
                gacha_coins: newGachaCoins,
                updated_at: new Date().toISOString(),
              },
              { onConflict: "discord_id" }
            );

          if (upsertErr) {
            console.error("[managePoints] Upsert error:", upsertErr.message);
            return interaction.editReply({
              content: `❌ เกิดข้อผิดพลาดในการบันทึกข้อมูลลง Supabase 2: ${upsertErr.message}`,
            });
          }
        }
      } else if (type === "cake") {
        typeLabel = "🍰 เค้ก (cake)";
        unit = "ชิ้น";
        if (action === "add") {
          newCakes = currentCakes + amount;
          changeText = `+${amount.toLocaleString()}`;
        } else {
          newCakes = Math.max(0, currentCakes - amount);
          changeText = `-${amount.toLocaleString()}`;
        }

        const { error: upsertErr } = await supabase
          .from("user_points")
          .upsert(
            {
              discord_id: targetUser.id,
              points: newPoints,
              cakes: newCakes,
              gacha_coins: newGachaCoins,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "discord_id" }
          );

        if (upsertErr) {
          console.error("[managePoints] Upsert error:", upsertErr.message);
          return interaction.editReply({
            content: `❌ เกิดข้อผิดพลาดในการบันทึกข้อมูลลง Supabase 2: ${upsertErr.message}`,
          });
        }
      } else if (type === "gacha_coin" || type === "coin" || type === "gacha_coins") {
        typeLabel = "🪙 แต้มกาชา (gacha_coin)";
        unit = "เหรียญ";
        if (action === "add") {
          newGachaCoins = currentGachaCoins + amount;
          changeText = `+${amount.toLocaleString()}`;
        } else {
          newGachaCoins = Math.max(0, currentGachaCoins - amount);
          changeText = `-${amount.toLocaleString()}`;
        }

        const { error: upsertErr } = await supabase
          .from("user_points")
          .upsert(
            {
              discord_id: targetUser.id,
              points: newPoints,
              cakes: newCakes,
              gacha_coins: newGachaCoins,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "discord_id" }
          );

        if (upsertErr) {
          console.error("[managePoints] Upsert error:", upsertErr.message);
          return interaction.editReply({
            content: `❌ เกิดข้อผิดพลาดในการบันทึกข้อมูลลง Supabase 2: ${upsertErr.message}`,
          });
        }
      } else {
        return interaction.editReply({
          content: "⚠️ ประเภทที่เลือกไม่ถูกต้อง (ต้องเป็น point, cake หรือ gacha_coin)",
        });
      }

      // 5. สร้างการ์ดผลลัพธ์แบบ Ephemeral
      const isAdd = action === "add";
      let oldVal = currentPoints;
      let newVal = newPoints;
      if (type === "cake") {
        oldVal = currentCakes;
        newVal = newCakes;
      } else if (type === "gacha_coin" || type === "coin" || type === "gacha_coins") {
        oldVal = currentGachaCoins;
        newVal = newGachaCoins;
      }

      const isOwner = (interaction.user?.id === (process.env.OWNER_ID || "944920660759707658")) ||
                      (Boolean(interaction.guild?.ownerId) && interaction.user?.id === interaction.guild?.ownerId);
      const operatorRoleText = isOwner ? "(Owner)" : "(Staff)";

      const embed = new EmbedBuilder()
        .setTitle("🐻︲จัดการแต้มสำเร็จ (Supabase 2)")
        .setColor(isAdd ? 0x57F287 : 0xED4245)
        .setThumbnail(targetUser.displayAvatarURL({ extension: "png", size: 256 }))
        .addFields(
          { name: "👤 สมาชิก", value: `<@${targetUser.id}> (\`${targetUser.id}\`)`, inline: true },
          { name: "🏷️ รายการ", value: typeLabel, inline: true },
          { name: "\u200B", value: "\u200B", inline: true },
          { name: "📊 ยอดเดิม", value: `\`${oldVal.toLocaleString()}\` ${unit}`, inline: true },
          { name: "🔄 การปรับปรุง", value: `\`${changeText}\` ${unit}`, inline: true },
          { name: "✨ ยอดคงเหลือใหม่", value: `\`${newVal.toLocaleString()}\` ${unit}`, inline: true },
          { name: "👑 ผู้ดำเนินการ", value: `<@${interaction.user.id}> ${operatorRoleText}`, inline: false }
        )
        .setFooter({ text: "Bear Cafe • Points Management (Supabase 2) • Ephemeral" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      console.log(`[managePoints] 👑 User ${interaction.user.tag || interaction.user.id} (${operatorRoleText}) ${action} ${amount} ${type} for user ${targetUser.id} (${oldVal} -> ${newVal})`);
    } catch (err) {
      console.error("[managePoints] Unexpected error:", err);
      return interaction.editReply({
        content: `❌ เกิดข้อผิดพลาดไม่คาดคิด: ${err.message}`,
      });
    }
  });

  console.log("[managePoints] ✅ ลงทะเบียนคำสั่ง /จัดการแต้ม (Owner & Staff) เรียบร้อย");
}

module.exports = { setupManagePoints };
