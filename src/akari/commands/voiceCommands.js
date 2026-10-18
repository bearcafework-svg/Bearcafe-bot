// ===================================================
// src/akari/commands/voiceCommands.js
// คำสั่ง /setting-voice สำหรับเลือกหมวดหมู่ห้องเสียง (Category)
// ที่อนุญาตให้ซิงค์ขึ้นหน้าเว็บ Bear Cafe (สูงสุด 5 หมวดหมู่)
// ===================================================

const {
  ChannelType,
  ChannelSelectMenuBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");

const FLAG_V2 = MessageFlags.IsComponentsV2 || 32768; // Component V2 flag (bit 15)
const VOICE_SETTING_COOLDOWN_MS = 3 * 60 * 1000; // คูลดาวน์ 3 นาที
const voiceCooldowns = new Map(); // guildId -> timestamp

const KUMA_BOT_INVITE_URL = "https://discord.com/oauth2/authorize?client_id=1538896195253178409";
const PREMIUM_CONTACT_URL = "https://discord.gg/2XqGPgYDN8";

/**
 * Slash Command definition for /setting-voice
 */
const SETTING_VOICE_SLASH_COMMAND = {
  name: "setting-voice",
  description: "ตั้งค่าหมวดหมู่ห้องเสียงที่อนุญาตให้แสดงบนเว็บไซต์ Bear Cafe (เฉพาะผู้ดูแลระบบ)",
  default_member_permissions: PermissionFlagsBits.ManageGuild.toString(),
};

/**
 * สร้าง Error/Notice Payload กรณีไม่มีสิทธิ์
 */
function buildNoPermissionPayload(customText = "คุณต้องมีสิทธิ์ **จัดการเซิร์ฟเวอร์ (Manage Server)** หรือ **ผู้ดูแลระบบ (Administrator)** เพื่อใช้คำสั่งนี้นะครับ!") {
  return {
    flags: MessageFlags.Ephemeral | FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `## <:lowwarning:1548772721679278180>︲__\` 𝖶𝖺𝗋𝗇𝗂𝗇𝗀 ₊ คุณไม่มีสิทธิ์ใช้คำสั่งนี้ 𓂃 \`__\n> ${customText}`,
          },
        ],
      },
    ],
  };
}

/**
 * จัดการคำสั่ง /setting-voice
 */
async function handleSettingVoiceCommand(interaction, supabase) {
  const { member, guild } = interaction;

  if (
    !member.permissions.has(PermissionFlagsBits.ManageGuild) &&
    !member.permissions.has(PermissionFlagsBits.Administrator)
  ) {
    return interaction.reply(buildNoPermissionPayload());
  }

  // 1. ตรวจสอบคูลดาวน์ 3 นาที
  const lastUsed = voiceCooldowns.get(guild.id);
  const now = Date.now();
  if (lastUsed && now - lastUsed < VOICE_SETTING_COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((VOICE_SETTING_COOLDOWN_MS - (now - lastUsed)) / 1000);
    return interaction.reply({
      flags: MessageFlags.Ephemeral | FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content:
                `## ⏳︲__\` 𝖢𝗈𝗈𝗅𝖽𝗈𝗐𝗇 ₊ คำสั่งอยู่ในช่วงคูลดาวน์ 𓂃 \`__\n` +
                `> กรุณารออีก **${remainingSeconds} วินาที** ก่อนทำการเปลี่ยนการตั้งค่าหมวดหมู่ใหม่อีกครั้งครับ`,
            },
          ],
        },
      ],
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral | FLAG_V2 });

  // 2. ดึงข้อมูล tenant_configs จาก Supabase
  let isPremium = false;
  let currentCategories = [];
  let planStatusText = "⚪ แผนปกติ (Standard)";

  if (supabase) {
    try {
      const { data: tenant } = await supabase
        .from("tenant_configs")
        .select("plan, expires_at, voice_display_categories")
        .eq("guild_id", guild.id)
        .maybeSingle();

      if (tenant) {
        currentCategories = Array.isArray(tenant.voice_display_categories)
          ? tenant.voice_display_categories
          : [];
        const isExpired = tenant.expires_at && new Date(tenant.expires_at) < new Date();
        if (tenant.plan === "premium" && !isExpired) {
          isPremium = true;
          planStatusText = "👑 แผนพรีเมี่ยม (Premium)";
        }
      }
    } catch (err) {
      console.warn("⚠️ [VoiceCommand] Failed to fetch tenant config:", err.message);
    }
  }

  // 3. แปลง ID เป็นชื่อ Category ในกิลด์
  const categoryNamesList = currentCategories
    .map((cId) => {
      const ch = guild.channels.cache.get(cId);
      return ch ? `• 📁 **${ch.name}** (\`${cId}\`)` : null;
    })
    .filter(Boolean);

  const currentDisplay =
    categoryNamesList.length > 0
      ? categoryNamesList.join("\n")
      : "_ยังไม่ได้เลือกหมวดหมู่ (ห้องเสียงจะไม่ถูกแสดงบนเว็บไซต์)_";

  // 4. สร้าง Channel Select Menu (เฉพาะ Category, สูงสุด 5)
  const categorySelect = new ChannelSelectMenuBuilder()
    .setCustomId("kuma_voice_category_select")
    .setPlaceholder("📁︲เลือกหมวดหมู่ห้องเสียง (เลือกได้สูงสุด 5 หมวดหมู่)...")
    .setChannelTypes([ChannelType.GuildCategory])
    .setMinValues(0)
    .setMaxValues(5);

  const clearBtn = new ButtonBuilder()
    .setCustomId("kuma_voice_category_clear")
    .setLabel("รีเซ็ต/ซ่อนห้องเสียงทั้งหมด")
    .setStyle(ButtonStyle.Secondary)
    .setEmoji("🗑️");

  const contactBtn = new ButtonBuilder()
    .setLabel("สมัคร Premium (59฿/ด.)")
    .setStyle(ButtonStyle.Link)
    .setURL(PREMIUM_CONTACT_URL)
    .setEmoji("👑");

  const rowMenu = new ActionRowBuilder().addComponents(categorySelect);
  const rowBtns = new ActionRowBuilder().addComponents(clearBtn, contactBtn);

  const noticeText = isPremium
    ? `> ✅ เซิร์ฟเวอร์ของคุณมีสิทธิ์ **Premium** แล้ว! เมื่อเลือกหมวดหมู่แล้ว ระบบจะเริ่มซิงค์ห้องและคนที่กำลังคุยไมค์ขึ้นหน้าเว็บ Bear Cafe ให้อัตโนมัติทุก 5-10 นาทีครับ`
    : `> ⚠️ **หมายเหตุ:** เซิร์ฟเวอร์ปัจจุบันยังไม่มีสิทธิ์ **Premium** คุณสามารถเลือกหมวดหมู่ล่วงหน้าไว้ได้ แต่ระบบจะยังไม่ดึงห้องเสียงขึ้นหน้าเว็บจนกว่าจะสมัคร Premium (59 บาท/เดือน) ติดต่อได้ที่ปุ่มด้านล่างครับ`;

  const payload = {
    flags: MessageFlags.Ephemeral | FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `## 🎙️︲__\` 𝖵𝗈𝗂𝖼𝖾 𝖲𝗒𝗇𝖼 ₊ ตั้งค่าหมวดหมู่ห้องเสียงขึ้นเว็บ 𓂃 \`__\n` +
              `-# สถานะเซิร์ฟเวอร์: **${planStatusText}**\n` +
              `${noticeText}\n\n` +
              `### 📋 หมวดหมู่ที่เลือกไว้ในปัจจุบัน (${categoryNamesList.length}/5):\n` +
              `${currentDisplay}\n\n` +
              `_💡 เลือกหมวดหมู่ที่ต้องการเปิดเผยด้านล่าง (เลือกได้ 0 - 5 หมวดหมู่):_`,
          },
          {
            type: 14,
            spacing: 2,
          },
          rowMenu.toJSON(),
          rowBtns.toJSON(),
        ],
      },
    ],
  };

  return interaction.editReply(payload);
}

/**
 * จัดการเมื่อแอดมินเลือกหมวดหมู่จาก Channel Select Menu
 */
async function handleVoiceCategorySelect(interaction, supabase) {
  const { member, guild, values } = interaction;

  if (
    !member.permissions.has(PermissionFlagsBits.ManageGuild) &&
    !member.permissions.has(PermissionFlagsBits.Administrator)
  ) {
    return interaction.reply(buildNoPermissionPayload());
  }

  // ตรวจสอบคูลดาวน์ 3 นาที
  const lastUsed = voiceCooldowns.get(guild.id);
  const now = Date.now();
  if (lastUsed && now - lastUsed < VOICE_SETTING_COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((VOICE_SETTING_COOLDOWN_MS - (now - lastUsed)) / 1000);
    return interaction.reply({
      flags: MessageFlags.Ephemeral | FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content:
                `## ⏳︲__\` 𝖢𝗈𝗈𝗅𝖽𝗈𝗐𝗇 ₊ คำสั่งอยู่ในช่วงคูลดาวน์ 𓂃 \`__\n` +
                `> กรุณารออีก **${remainingSeconds} วินาที** ก่อนทำการเปลี่ยนหมวดหมู่อีกครั้งครับ`,
            },
          ],
        },
      ],
    });
  }

  await interaction.deferUpdate();

  const selectedCategories = (values || []).slice(0, 5);

  if (supabase) {
    try {
      await supabase
        .from("tenant_configs")
        .upsert(
          {
            guild_id: guild.id,
            guild_name: guild.name,
            icon_url: guild.iconURL({ dynamic: true, size: 128 }) || null,
            voice_display_categories: selectedCategories,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "guild_id" }
        );
    } catch (err) {
      console.error("❌ [VoiceCommand] Failed to save categories to supabase:", err.message);
    }
  }

  // บันทึกเวลาคูลดาวน์ 3 นาที
  voiceCooldowns.set(guild.id, Date.now());

  const categoryNamesList = selectedCategories
    .map((cId) => {
      const ch = guild.channels.cache.get(cId);
      return ch ? `• 📁 **${ch.name}**` : `• 📁 \`${cId}\``;
    });

  const displayList =
    categoryNamesList.length > 0
      ? categoryNamesList.join("\n")
      : "_ไม่ได้เลือกหมวดหมู่ใดๆ (ห้องเสียงจะไม่ถูกนำขึ้นเว็บ)_";

  const payload = {
    flags: MessageFlags.Ephemeral | FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `## <:50121checkmark:1358584609087946867>︲__\` 𝖲𝗎𝖼𝖼𝖾𝗌𝗌 ₊ บันทึกหมวดหมู่ห้องเสียงเรียบร้อยแล้ว 𓂃 \`__\n` +
              `> ระบบบันทึก **${selectedCategories.length} หมวดหมู่** สำเร็จเรียบร้อยแล้ว!\n\n` +
              `### 📋 รายชื่อหมวดหมู่ที่ได้รับอนุญาตให้แสดง:\n` +
              `${displayList}\n\n` +
              `-# ⏳ คูลดาวน์การเปลี่ยนหมวดหมู่: **3 นาที**\n` +
              `-# 📡 ข้อมูลห้องเสียงและสมาชิกจะถูกซิงค์ขึ้นหน้าเว็บ Bear Cafe ในรอบถัดไป (สำหรับเซิร์ฟเวอร์ที่มี Premium)`,
          },
        ],
      },
    ],
  };

  return interaction.editReply(payload);
}

/**
 * จัดการเมื่อแอดมินกดยกเลิก/รีเซ็ตหมวดหมู่ทั้งหมด
 */
async function handleVoiceCategoryClear(interaction, supabase) {
  const { member, guild } = interaction;

  if (
    !member.permissions.has(PermissionFlagsBits.ManageGuild) &&
    !member.permissions.has(PermissionFlagsBits.Administrator)
  ) {
    return interaction.reply(buildNoPermissionPayload());
  }

  await interaction.deferUpdate();

  if (supabase) {
    try {
      await supabase
        .from("tenant_configs")
        .update({
          voice_display_categories: [],
          updated_at: new Date().toISOString(),
        })
        .eq("guild_id", guild.id);

      // เคลียร์ active_voice_rooms ออกจาก discord_servers ด้วย
      const { data: srv } = await supabase
        .from("discord_servers")
        .select("server_profile")
        .eq("discord_id", guild.id)
        .maybeSingle();

      if (srv && srv.server_profile) {
        const updated = { ...srv.server_profile };
        delete updated.active_voice_rooms;
        delete updated.active_voice_rooms_count;
        await supabase
          .from("discord_servers")
          .update({ server_profile: updated })
          .eq("discord_id", guild.id);
      }
    } catch (err) {
      console.error("❌ [VoiceCommand] Failed to clear voice categories:", err.message);
    }
  }

  // เซ็ตคูลดาวน์ 3 นาที
  voiceCooldowns.set(guild.id, Date.now());

  return interaction.editReply({
    flags: MessageFlags.Ephemeral | FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content:
              `## <:50121checkmark:1358584609087946867>︲__\` 𝖱𝖾𝗌𝖾𝗍 ₊ รีเซ็ตการตั้งค่าห้องเสียงเรียบร้อย 𓂃 \`__\n` +
              `> ระบบได้ล้างหมวดหมู่ทั้งหมดออกแล้ว ห้องเสียงของเซิร์ฟเวอร์คุณจะไม่ถูกนำขึ้นแสดงบนเว็บไซต์อีกต่อไปครับ\n` +
              `-# ⏳ คูลดาวน์การเปลี่ยนหมวดหมู่: **3 นาที**`,
          },
        ],
      },
    ],
  });
}

module.exports = {
  SETTING_VOICE_SLASH_COMMAND,
  handleSettingVoiceCommand,
  handleVoiceCategorySelect,
  handleVoiceCategoryClear,
};
