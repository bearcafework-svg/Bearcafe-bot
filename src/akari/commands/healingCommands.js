// src/akari/commands/healingCommands.js
// ระบบ Slash Command /ขอกำลังใจ สำหรับ Kuma Bot
// จัดการสุ่มข้อความ Component V2, แก้ปัญหา Avatar ข้ามเซิร์ฟเวอร์, จัดการ Modal 3 ช่อง และ Cooldown

const { MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");

const FLAG_V2 = MessageFlags.IsComponentsV2 || 32768;
const DEFAULT_AVATAR = "https://cdn.discordapp.com/embed/avatars/0.png";
const COOLDOWN_DURATION_MS = 60 * 1000; // 60 วินาที

// In-Memory Cooldown Store สำหรับฟอร์มข้อความให้กำลังใจ (ความเร็ว 0ms และไม่ขึ้นกับ Schema ภายนอก)
const healingCooldowns = new Map(); // userId -> expireTimestamp (ms)

// In-Memory Avatar Cache เพื่อป้องกัน Rate Limit จากการยิง Discord API ซ้ำๆ
const avatarCache = new Map(); // discordId -> { url: string, expireAt: number }
const AVATAR_CACHE_TTL = 60 * 60 * 1000; // 1 ชั่วโมง

/**
 * ดึงภาพ Avatar สดจาก Discord ID ระดับ Global
 * @param {import("discord.js").Client} client 
 * @param {string} discordId 
 * @returns {Promise<string>}
 */
async function resolveUserAvatar(client, discordId) {
  if (!discordId) return DEFAULT_AVATAR;

  const now = Date.now();
  const cached = avatarCache.get(discordId);
  if (cached && now < cached.expireAt) {
    return cached.url;
  }

  try {
    const user = await client.users.fetch(discordId, { force: false }).catch(() => null);
    if (user) {
      const url = user.displayAvatarURL({ extension: "png", size: 256 });
      avatarCache.set(discordId, { url, expireAt: now + AVATAR_CACHE_TTL });
      return url;
    }
  } catch (err) {
    console.warn(`[kumaHealing] Failed to fetch global user avatar for ${discordId}:`, err.message);
  }

  return DEFAULT_AVATAR;
}

/**
 * ค้นหาหรือ Auto-provision Profile จาก discord_id
 * @param {Object} supabase 
 * @param {import("discord.js").User} user 
 * @returns {Promise<Object|null>}
 */
async function getOrCreateProfile(supabase, user) {
  const discordId = user.id;
  const username = user.username || user.tag || "ผู้ใช้ไม่ระบุชื่อ";
  const avatarUrl = user.displayAvatarURL({ extension: "png", size: 256 });

  try {
    // 1. ค้นหา profile เดิม
    const { data: existingProfile } = await supabase
      .from("profiles")
      .select("id, discord_id, username, avatar_url")
      .eq("discord_id", discordId)
      .maybeSingle();

    if (existingProfile && existingProfile.id) {
      return existingProfile;
    }

    // 2. ถ้ายังไม่มี ให้สร้าง profile ใหม่ (Service Role)
    const { data: newProfile, error: insertErr } = await supabase
      .from("profiles")
      .insert({
        discord_id: discordId,
        username: username,
        avatar_url: avatarUrl,
      })
      .select("id, discord_id, username, avatar_url")
      .single();

    if (insertErr) {
      console.warn("[kumaHealing] Auto-provision profile warning:", insertErr.message);
      const { data: retryProfile } = await supabase
        .from("profiles")
        .select("id, discord_id, username, avatar_url")
        .eq("discord_id", discordId)
        .maybeSingle();
      return retryProfile || null;
    }

    return newProfile;
  } catch (err) {
    console.error("[kumaHealing] Profile resolution error:", err.message);
    return null;
  }
}

/**
 * จัดการคำสั่ง Slash Command /ขอกำลังใจ
 */
async function handleKumaHealingCommand(interaction, kumaSupabase, client) {
  if (!kumaSupabase) {
    return interaction.reply({
      content: "❌ ระบบฐานข้อมูลไม่พร้อมใช้งานในขณะนี้ โปรดติดต่อผู้ดูแลระบบค่ะ",
      flags: MessageFlags.Ephemeral,
    });
  }

  try {
    // ดึงข้อความที่ได้รับการอนุมัติ (approved)
    const { data, error } = await kumaSupabase
      .from("healing_messages")
      .select(`
        message,
        profiles:author_id (
          username,
          avatar_url,
          discord_id
        )
      `)
      .eq("status", "approved");

    if (error) throw error;

    const userId = interaction.user.id;
    // กรองข้อความของตนเองออก หากมีข้อความของคนอื่น
    let candidates = (data || []).filter((r) => r.profiles?.discord_id !== userId);
    if (candidates.length === 0) {
      candidates = data || [];
    }

    let selectedMsg = null;
    if (candidates.length > 0) {
      const randomIndex = Math.floor(Math.random() * candidates.length);
      selectedMsg = candidates[randomIndex];
    } else {
      selectedMsg = {
        message: "เธอทำดีที่สุดแล้วน้า หมีเป็นกำลังใจให้เสมอค่ะ สู้ๆ นะคะ! 🧸💛",
        profiles: {
          username: "Bear Café Mascot",
          avatar_url: DEFAULT_AVATAR,
          discord_id: "",
        },
      };
    }

    const authorDiscordId = selectedMsg.profiles?.discord_id;
    const authorUsername = selectedMsg.profiles?.username || "ผู้ใช้ไม่ระบุชื่อ";

    // ดึง Avatar สดจาก Discord ID ระดับ Global
    const avatarUrl = await resolveUserAvatar(client, authorDiscordId);

    // สร้าง Payload Component V2
    const payload = {
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 14,
              spacing: 1,
              divider: false,
            },
            {
              type: 9,
              components: [
                {
                  type: 10,
                  content: `## <a:28457gameoverheart:1372833851092504637>︲__\` 𝖬𝖾𝗌𝗌𝖺𝖿𝖾 𝟦 𝗎 ₊ ข้อความนี้ของเธอ 𓂃 \`__\n### ${selectedMsg.message}\n-# - เจ้าของข้อความ: **__${authorUsername}__** <:cuteplant:1152834055528783872>\n\n`,
                },
              ],
              accessory: {
                type: 11,
                media: {
                  url: avatarUrl,
                },
              },
            },
            {
              type: 14,
              spacing: 2,
            },
            {
              type: 1,
              components: [
                {
                  style: 2,
                  type: 2,
                  label: "︲เพิ่มข้อความของคุณเอง!",
                  emoji: {
                    id: "1518217054711189644",
                    name: "27073hispeechbubble",
                    animated: true,
                  },
                  flow: {
                    actions: [],
                  },
                  custom_id: "kuma_healing_open_modal",
                },
              ],
            },
          ],
        },
      ],
    };

    return await interaction.reply(payload);
  } catch (err) {
    console.error("[kumaHealing] Command Error:", err.message);
    return await interaction.reply({
      content: "❌ เกิดข้อผิดพลาดในการดึงข้อความให้กำลังใจ โปรดลองใหม่อีกครั้งค่ะ",
      flags: MessageFlags.Ephemeral,
    });
  }
}

/**
 * จัดการเมื่อผู้ใช้กดปุ่ม "เพิ่มข้อความของคุณเอง!" เพื่อเปิด Modal 3 ช่อง
 */
async function handleKumaHealingButton(interaction, kumaSupabase) {
  if (!kumaSupabase) {
    return interaction.reply({
      content: "❌ ระบบฐานข้อมูลไม่พร้อมใช้งานในขณะนี้",
      flags: MessageFlags.Ephemeral,
    });
  }

  const userId = interaction.user.id;
  const now = Date.now();

  // 1. ตรวจสอบคูลดาวน์ก่อนเปิด Modal
  const cdExpiry = healingCooldowns.get(userId) || 0;
  if (now < cdExpiry) {
    const readyTimestamp = Math.floor(cdExpiry / 1000);
    return await interaction.reply({
      content: `⏳ คุณเพิ่งส่งหรือแก้ไขข้อความไป กรุณารออีก <t:${readyTimestamp}:R> ก่อนเปิดแก้ไขใหม่นะคะ`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // 2. ดึงหรือสร้าง Profile ของผู้ใช้
  const profile = await getOrCreateProfile(kumaSupabase, interaction.user);
  if (!profile) {
    return interaction.reply({
      content: "❌ ไม่สามารถเข้าถึงโปรไฟล์ของคุณได้ โปรดลองใหม่อีกครั้งค่ะ",
      flags: MessageFlags.Ephemeral,
    });
  }

  // 3. ดึงข้อความ 3 ช่องเดิมของผู้ใช้
  const { data: userMessages, error } = await kumaSupabase
    .from("healing_messages")
    .select("id, message, status, created_at")
    .eq("author_id", profile.id)
    .order("created_at", { ascending: true })
    .limit(3);

  if (error) {
    console.error("[kumaHealing] Error fetching user messages for modal:", error.message);
    return interaction.reply({
      content: "❌ เกิดข้อผิดพลาดในการดึงข้อมูลข้อความของคุณ",
      flags: MessageFlags.Ephemeral,
    });
  }

  // 4. สร้าง Modal Builder ขนาด 3 ช่อง
  const modal = new ModalBuilder()
    .setCustomId("kuma_healing_modal_submit")
    .setTitle("จัดการข้อความให้กำลังใจของคุณ");

  for (let i = 0; i < 3; i++) {
    const msg = userMessages && userMessages[i] ? userMessages[i] : null;
    let label = `⚪ รอการกรอก (ช่องที่ ${i + 1})`;
    if (msg) {
      if (msg.status === "approved") {
        label = `✅ ข้อความกำลังเผยแพร่ (ช่องที่ ${i + 1})`;
      } else if (msg.status === "pending") {
        label = `⏳ กำลังรอการตรวจสอบ (ช่องที่ ${i + 1})`;
      } else if (msg.status === "rejected") {
        label = `❌ ไม่ผ่านการอนุมัติ (ช่องที่ ${i + 1})`;
      }
    }

    const input = new TextInputBuilder()
      .setCustomId(`kuma_slot_${i + 1}_${msg ? msg.id : "new"}`)
      .setLabel(label)
      .setStyle(TextInputStyle.Paragraph)
      .setMaxLength(150)
      .setRequired(false)
      .setPlaceholder("พิมพ์ข้อความให้กำลังใจ (10-150 ตัวอักษร) หรือเว้นว่างเพื่อลบ");

    if (msg && msg.message) {
      input.setValue(msg.message);
    }

    modal.addComponents(new ActionRowBuilder().addComponents(input));
  }

  return await interaction.showModal(modal);
}

/**
 * จัดการเมื่อผู้ใช้ส่งแบบฟอร์ม Modal
 */
async function handleKumaHealingModalSubmit(interaction, kumaSupabase) {
  if (!kumaSupabase) {
    return interaction.reply({
      content: "❌ ระบบฐานข้อมูลไม่พร้อมใช้งานในขณะนี้",
      flags: MessageFlags.Ephemeral,
    });
  }

  const userId = interaction.user.id;
  const now = Date.now();

  // 1. ตรวจสอบคูลดาวน์ซ้ำ (Double-check)
  const cdExpiry = healingCooldowns.get(userId) || 0;
  if (now < cdExpiry) {
    const readyTimestamp = Math.floor(cdExpiry / 1000);
    return await interaction.reply({
      content: `⏳ คุณเพิ่งส่งแบบฟอร์มไป กรุณารออีก <t:${readyTimestamp}:R> ก่อนส่งใหม่อีกครั้งนะคะ`,
      flags: MessageFlags.Ephemeral,
    });
  }

  // UX ขั้นตอนการบันทึก: แสดงข้อความ Loading แบบ Ephemeral เหมือนระบบต้อนรับ
  await interaction.reply({
    content: "# <a:pinkloading:1562052463878602802>⠀` กำลังบันทึกการตั้งค่า . . . `",
    flags: MessageFlags.Ephemeral,
  });

  // 2. ดึง Profile
  const profile = await getOrCreateProfile(kumaSupabase, interaction.user);
  if (!profile) {
    return await interaction.editReply({
      content: "❌ ไม่สามารถเข้าถึงโปรไฟล์ของคุณได้ โปรดลองใหม่อีกครั้งค่ะ",
    });
  }

  // 3. ดึงข้อความเดิมจาก DB
  const { data: existingMessages, error: fetchErr } = await kumaSupabase
    .from("healing_messages")
    .select("id, message, status, created_at")
    .eq("author_id", profile.id)
    .order("created_at", { ascending: true })
    .limit(3);

  if (fetchErr) {
    console.error("[kumaHealing] Error fetching existing messages on submit:", fetchErr.message);
    return await interaction.editReply({
      content: "❌ เกิดข้อผิดพลาดในการตรวจสอบข้อมูลข้อความเดิม",
    });
  }

  // 4. ดึงคำต้องห้ามจาก banned_name
  let bannedWords = [];
  try {
    const { data: bannedData } = await kumaSupabase.from("banned_name").select("word");
    bannedWords = (bannedData || [])
      .map((r) => String(r.word || "").trim().toLowerCase())
      .filter(Boolean);
  } catch (err) {
    console.warn("[kumaHealing] Could not load banned words:", err.message);
  }

  // 5. ตรวจสอบความถูกต้องของแต่ละ Slot ก่อนบันทึก
  const slotValues = [];
  for (let i = 0; i < 3; i++) {
    // หา field ที่มี customId ขึ้นต้นด้วย kuma_slot_{i+1}_
    const field = interaction.fields.fields.find((f) => f.customId.startsWith(`kuma_slot_${i + 1}_`));
    const val = (field ? field.value : "").trim();

    if (val.length > 0) {
      if (val.length < 10) {
        return await interaction.editReply({
          content: `❌ ข้อความใน **ช่องที่ ${i + 1}** มีความยาว ${val.length} ตัวอักษร (ต้องมีอย่างน้อย 10 ตัวอักษร หรือเว้นว่างหากต้องการลบออกค่ะ)`,
        });
      }
      if (val.length > 150) {
        return await interaction.editReply({
          content: `❌ ข้อความใน **ช่องที่ ${i + 1}** มีความยาวเกิน 150 ตัวอักษรค่ะ`,
        });
      }

      // ตรวจสอบคำต้องห้าม
      const lower = val.toLowerCase();
      for (const bw of bannedWords) {
        if (lower.includes(bw)) {
          return await interaction.editReply({
            content: `❌ ข้อความใน **ช่องที่ ${i + 1}** มีคำที่ไม่ได้รับอนุญาตให้ใช้งาน (${bw}) โปรดแก้ไขข้อความค่ะ`,
          });
        }
      }
    }

    slotValues.push(val);
  }

  // 6. ดำเนินการ Create / Update / Delete
  const summaryLines = [];
  let hasChanged = false;

  for (let i = 0; i < 3; i++) {
    const existing = existingMessages && existingMessages[i] ? existingMessages[i] : null;
    const newVal = slotValues[i];

    if (!newVal) {
      // ผู้ใช้เว้นว่าง
      if (existing) {
        // ลบข้อความเดิมทิ้ง
        await kumaSupabase.from("healing_messages").delete().eq("id", existing.id);
        summaryLines.push(`• **ช่องที่ ${i + 1}:** 🗑️ ลบข้อความเดิมออกเรียบร้อย (คืนโควตาเป็น ⚪ รอการกรอก)`);
        hasChanged = true;
      } else {
        summaryLines.push(`• **ช่องที่ ${i + 1}:** ⚪ ว่างเปล่า (ไม่มีการเปลี่ยนแปลง)`);
      }
    } else {
      // ผู้ใช้กรอกข้อความ
      if (existing) {
        if (existing.message === newVal) {
          // ไม่ได้แก้ข้อความเดิม
          const st = existing.status === "approved" ? "✅ เผยแพร่" : "⏳ รอตรวจสอบ";
          summaryLines.push(`• **ช่องที่ ${i + 1}:** คงเดิม (${st})`);
        } else {
          // มีการแก้ไขข้อความเดิม -> บังคับปรับสถานะเป็น pending เสมอ
          await kumaSupabase
            .from("healing_messages")
            .update({ message: newVal, status: "pending" })
            .eq("id", existing.id);
          summaryLines.push(`• **ช่องที่ ${i + 1}:** ✏️ แก้ไขข้อความเรียบร้อย ➜ **⏳ กำลังรอการตรวจสอบ**`);
          hasChanged = true;
        }
      } else {
        // เพิ่มข้อความใหม่ใน Slot ว่าง -> บังคับเป็น pending
        await kumaSupabase.from("healing_messages").insert({
          author_id: profile.id,
          message: newVal,
          status: "pending",
        });
        summaryLines.push(`• **ช่องที่ ${i + 1}:** ✨ เพิ่มข้อความใหม่เรียบร้อย ➜ **⏳ กำลังรอการตรวจสอบ**`);
        hasChanged = true;
      }
    }
  }

  // 7. ตั้งค่าคูลดาวน์ 60 วินาที เมื่อมีการเปลี่ยนแปลงจริง
  if (hasChanged) {
    healingCooldowns.set(userId, Date.now() + COOLDOWN_DURATION_MS);
  }

  // แก้ไขเป็นบันทึกสำเร็จ เหมือนระบบแก้ไขข้อความต้อนรับ
  await interaction.editReply({
    content: "# <:50121checkmark:1358584609087946867>⠀` บันทึกข้อมูลสำเร็จ `",
  });

  // ลบ Ephemeral ภายใน 3 วินาที
  setTimeout(() => {
    interaction.deleteReply().catch(() => {});
  }, 3000);
}

module.exports = {
  handleKumaHealingCommand,
  handleKumaHealingButton,
  handleKumaHealingModalSubmit,
};
