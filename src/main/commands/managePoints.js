// src/commands/managePoints.js
// ระบบจัดการแต้ม (Points) และเค้ก (Cakes) ในตาราง user_points บน Supabase 2
// สิทธิ์: เฉพาะ Server Owner หรือ Bot Owner เท่านั้น
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

/**
 * ตรวจสอบสิทธิ์ว่าเป็น Owner หรือไม่
 * @param {import("discord.js").ChatInputCommandInteraction} interaction 
 */
function isOwnerUser(interaction) {
  const userId = interaction.user?.id;
  if (!userId) return false;

  const botOwnerId = process.env.OWNER_ID || "944920660759707658";
  const guildOwnerId = interaction.guild?.ownerId;

  return userId === botOwnerId || (Boolean(guildOwnerId) && userId === guildOwnerId);
}

/**
 * ติดตั้งระบบจัดการแต้ม
 * @param {import("discord.js").Client} client 
 */
function setupManagePoints(client) {
  registerCommand("จัดการแต้ม", async (interaction) => {
    // 1. ตรวจสอบสิทธิ์ — เฉพาะ Owner เท่านั้น
    if (!isOwnerUser(interaction)) {
      return interaction.reply({
        content: "❌ ขออภัยค่ะ เฉพาะ **Server Owner** เท่านั้นที่สามารถใช้คำสั่งนี้ได้",
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
        .select("discord_id, points, cakes")
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

      let newPoints = currentPoints;
      let newCakes = currentCakes;
      let changeText = "";
      let typeLabel = "";
      let unit = "";

      if (type === "point") {
        typeLabel = "🍵 แต้ม (point)";
        unit = "แต้ม";
        if (action === "add") {
          newPoints = currentPoints + amount;
          changeText = `+${amount.toLocaleString()}`;
        } else {
          newPoints = Math.max(0, currentPoints - amount);
          changeText = `-${amount.toLocaleString()}`;
        }
      } else {
        typeLabel = "🍰 เค้ก (cake)";
        unit = "ชิ้น";
        if (action === "add") {
          newCakes = currentCakes + amount;
          changeText = `+${amount.toLocaleString()}`;
        } else {
          newCakes = Math.max(0, currentCakes - amount);
          changeText = `-${amount.toLocaleString()}`;
        }
      }

      // 4. บันทึก/อัปเดตข้อมูลลง Supabase 2
      const { error: upsertErr } = await supabase
        .from("user_points")
        .upsert(
          {
            discord_id: targetUser.id,
            points: newPoints,
            cakes: newCakes,
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

      // 5. สร้างการ์ดผลลัพธ์แบบ Ephemeral
      const isAdd = action === "add";
      const oldVal = type === "point" ? currentPoints : currentCakes;
      const newVal = type === "point" ? newPoints : newCakes;

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
          { name: "👑 ผู้ดำเนินการ", value: `<@${interaction.user.id}> (Owner)`, inline: false }
        )
        .setFooter({ text: "Bear Cafe • Points Management (Supabase 2) • Ephemeral" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      console.log(`[managePoints] 👑 Owner ${interaction.user.tag || interaction.user.id} ${action} ${amount} ${type} for user ${targetUser.id} (${oldVal} -> ${newVal})`);
    } catch (err) {
      console.error("[managePoints] Unexpected error:", err);
      return interaction.editReply({
        content: `❌ เกิดข้อผิดพลาดไม่คาดคิด: ${err.message}`,
      });
    }
  });

  console.log("[managePoints] ✅ ลงทะเบียนคำสั่ง /จัดการแต้ม (Owner Only) เรียบร้อย");
}

module.exports = { setupManagePoints };
