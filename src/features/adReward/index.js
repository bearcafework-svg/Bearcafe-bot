// src/features/adReward/index.js — ระบบทุบกล่องดูโฆษณา (LootLabs Verified Ad Box Roulette)
const { createClient } = require("@supabase/supabase-js");
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const cfg = require("./settingAd.json");
const sharedConfig = require("../../sharedSettings.json");
const { blacklistPayload } = require("../shared/tarotComponents");
const {
  buildBoxGridRows,
  buildLootLabsUrl,
  registerActiveSession
} = require("./adBoxManager");

// ── Main Setup ──────────────────────────────────────────────────────────
function setupAdReward(client) {
  let supabase = null;
  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY) {
    supabase = createClient(
      process.env.SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    );
  }

  // ── A. Message Event (b!box) ──────────────────────────────────────────────
  client.on("messageCreate", async (message) => {
    if (message.author.bot || !message.guild) return;
    const content = message.content.trim().toLowerCase();
    if (content !== "b!box") return;

    const member = message.member;
    const userId = message.author.id;

    // Check Blacklist
    const isBlacklisted = sharedConfig.role_blacklist?.some(id => member?.roles?.cache?.has(id));
    if (isBlacklisted) {
      return message.reply(blacklistPayload(userId));
    }

    const embed = new EmbedBuilder()
      .setColor("#FFB6C1")
      .setTitle(`🎁︲__\` 𝖠𝖽 𝖡𝗈𝗑 𝖱𝗈𝗎𝗅𝖾𝗍𝗍𝖾 ₊ กล่องสุ่มดูโฆษณารับแต้ม \`__`)
      .setDescription(
        `> ${cfg.emojis.bubble}︰เลือกกล่องที่คุณชอบ **1 ใบ** จาก 9 ใบด้านล่าง!\n` +
        `> ${cfg.emojis.fire}︰Streak ปัจจุบัน: **1 วัน** (+10% Point Bonus)\n` +
        `> 📊︰สิทธิ์วันนี้: **1/3 ครั้ง**\n` +
        `> ${cfg.emojis.star}︰รางวัลสูงสุด: **🎰 1,000 Points!**`
      )
      .setFooter({ text: "Bear Cafe • LootLabs Ad Box Roulette", iconURL: message.guild.iconURL() })
      .setTimestamp();

    const rows = buildBoxGridRows(userId);

    await message.reply({
      embeds: [embed],
      components: rows,
    });
  });

  // ── B. Interaction Event (Buttons) ─────────────────────────────────────────
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;
    const { customId } = interaction;

    if (!customId.startsWith("adbox_")) return;

    const parts = customId.split("_");
    const action = parts[1]; // select, reselect
    const param1 = parts[2]; // boxNum or target
    const targetUserId = parts[3];

    // Check ownership of interaction
    if (targetUserId && interaction.user.id !== targetUserId) {
      return interaction.reply({
        content: `❌ ปุ่มนี้ใช้ได้เฉพาะ <@${targetUserId}> ที่เรียกคำสั่ง b!box เท่านั้นค่ะ`,
        flags: 64 // Ephemeral
      });
    }

    // ── 1. Selecting a Box (adbox_select_<boxNum>_<userId>) ─────────────────
    if (action === "select") {
      const boxNum = parseInt(param1, 10);
      const userId = interaction.user.id;

      // สร้าง unique clickId สำหรับ puid
      const clickId = `BOX_${userId}_${boxNum}_${Date.now()}`;
      const expireTimestamp = Math.floor(Date.now() / 1000) + (cfg.token_expire_minutes * 60);

      // บันทึก Transaction ลง Supabase
      if (supabase) {
        try {
          await supabase.from("lootlabs_box_transactions").insert({
            discord_user_id: userId,
            guild_id: interaction.guildId,
            box_id: boxNum,
            click_id: clickId,
            status: "pending",
            expires_at: new Date(Date.now() + cfg.token_expire_minutes * 60 * 1000).toISOString()
          });
        } catch (e) {
          console.error("[adReward] Failed to insert transaction to Supabase:", e.message);
        }
      }

      // สร้าง URL LootLabs ที่มี puid ผ่าน LootLabs API แบบอัตโนมัติ 100%
      const lootlabsUrl = await buildLootLabsUrl(clickId, boxNum);

      // บันทึก Active Session ใน Memory เพื่อรอ Postback มาอัปเดต UI
      registerActiveSession(clickId, {
        interaction,
        userId,
        boxNum,
        channelId: interaction.channelId,
        guildId: interaction.guildId
      });

      const updatedGridRows = buildBoxGridRows(userId, boxNum);

      // Action row with LootLabs Link Button & Reselect
      const actionRow = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setLabel(`🎬 ดูโฆษณาเปิดกล่อง #${boxNum} (LootLabs)`)
          .setURL(lootlabsUrl)
          .setStyle(ButtonStyle.Link),
        new ButtonBuilder()
          .setCustomId(`adbox_reselect_0_${userId}`)
          .setLabel("🔄 เปลี่ยนกล่อง")
          .setStyle(ButtonStyle.Secondary)
      );

      const embed = new EmbedBuilder()
        .setColor("#FFD700")
        .setTitle(`✨︲__\` คุณเลือก [กล่อง #${boxNum}] เรียบร้อยแล้ว! \`__`)
        .setDescription(
          `> ${cfg.emojis.bubble}︰โปรดกดปุ่ม **"ดูโฆษณาเปิดกล่อง #${boxNum}"** เพื่อทำภารกิจบน LootLabs\n` +
          `> ⚡︰เมื่อทำภารกิจสำเร็จ ระบบ LootLabs จะยิงสัญญาณยืนยันกลับมา **เปิดกล่องและแจกแต้มให้อัตโนมัติ!**\n\n` +
          `> ⏳ สถานะ: **กำลังรอการยืนยันจาก LootLabs (Postback)...**\n` +
          `> ⏰ ลิงก์นี้หมดอายุใน: <t:${expireTimestamp}:R> ${cfg.emojis.plant}`
        )
        .setFooter({ text: "Bear Cafe • LootLabs Verified System", iconURL: interaction.guild?.iconURL() });

      return interaction.update({
        embeds: [embed],
        components: [...updatedGridRows, actionRow]
      });
    }

    // ── 2. Reselecting Box (adbox_reselect_0_<userId>) ──────────────────────
    if (action === "reselect") {
      const initialGridRows = buildBoxGridRows(interaction.user.id);

      const embed = new EmbedBuilder()
        .setColor("#FFB6C1")
        .setTitle(`🎁︲__\` 𝖠𝖽 𝖡𝗈𝗑 𝖱𝗈𝗎𝗅𝖾𝗍𝗍𝖾 ₊ กล่องสุ่มดูโฆษณารับแต้ม \`__`)
        .setDescription(
          `> ${cfg.emojis.bubble}︰เลือกกล่องที่คุณชอบ **1 ใบ** จาก 9 ใบด้านล่าง!\n` +
          `> ${cfg.emojis.fire}︰Streak ปัจจุบัน: **1 วัน** (+10% Point Bonus)\n` +
          `> 📊︰สิทธิ์วันนี้: **1/3 ครั้ง**\n` +
          `> ${cfg.emojis.star}︰รางวัลสูงสุด: **🎰 1,000 Points!**`
        )
        .setFooter({ text: "Bear Cafe • LootLabs Ad Box Roulette", iconURL: interaction.guild?.iconURL() });

      return interaction.update({
        embeds: [embed],
        components: initialGridRows
      });
    }
  });

  console.log("✅ [adReward] Module loaded successfully (b!box + LootLabs Postback ready)");
}

module.exports = { setupAdReward };
