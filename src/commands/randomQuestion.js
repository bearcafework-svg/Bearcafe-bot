// src/commands/randomQuestion.js
// ระบบ Slash Command /สุ่มคำถาม สุ่มคำถามจากตาราง public.question_collect

const { createClient } = require("@supabase/supabase-js");
const { MessageFlags, Events } = require("discord.js");
const sharedConfig = require("../sharedSettings.json");
const { blacklistPayload, cooldownContent } = require("../features/shared/tarotComponents");
const { getCooldown, setCooldown } = require("../utils/cooldownManager");

const TARGET_CHANNEL_ID = "1524124012492619847";
const FLAG_V2 = MessageFlags.IsComponentsV2 || 32768;
const FLAG_EPHEMERAL = MessageFlags.Ephemeral || 64;

const CATEGORY_MAP = {
  general: "👤 ทั่วไป",
  love: "❤️ ความรัก",
  favorites: "🎨 ความชอบ",
  thoughts: "💭 มุมมอง",
  choose: "🎲 สมมติว่า...",
  funny: "😂 เรื่องฮา",
  food: "🍜 อาหาร",
  gaming: "🎮 เกม",
  entertainment: "🎬 บันเทิง"
};

function setupRandomQuestion(client) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  client.once("clientReady", async () => {
    try {
      const guildId = process.env.GUILD_ID || "1144251788493602848";
      const guild = client.guilds.cache.get(guildId) || client.guilds.cache.first();

      if (guild) {
        await guild.commands.create({
          name: "สุ่มคำถาม",
          description: "สุ่มคำถามเพื่อกระชับความสัมพันธ์",
          options: [
            {
              name: "category",
              description: "เลือกหมวดหมู่คำถาม (ไม่จำเป็นต้องเลือก)",
              type: 3, // STRING
              required: false,
              choices: [
                { name: "👤 ทั่วไป", value: "general" },
                { name: "❤️ ความรัก", value: "love" },
                { name: "🎨 ความชอบ", value: "favorites" },
                { name: "💭 มุมมอง", value: "thoughts" },
                { name: "🎲 สมมติว่า...", value: "choose" },
                { name: "😂 เรื่องฮา", value: "funny" },
                { name: "🍜 อาหาร", value: "food" },
                { name: "🎮 เกม", value: "gaming" },
                { name: "🎬 บันเทิง", value: "entertainment" }
              ]
            }
          ]
        });
        console.log(`[randomQuestion] Command /สุ่มคำถาม registered on guild ${guild.name}.`);
      } else {
        console.warn("[randomQuestion] No guild found for slash command registration.");
      }
    } catch (err) {
      console.error("[randomQuestion] Failed to register slash command:", err.message);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    if (!interaction.isChatInputCommand()) return;
    if (interaction.commandName !== "สุ่มคำถาม") return;

    // 1. ตอบสนองเฉพาะ ChannelID = 1524124012492619847
    if (interaction.channelId !== TARGET_CHANNEL_ID) {
      return interaction.reply({
        content: `คำสั่งนี้ใช้ได้เฉพาะห้อง <#${TARGET_CHANNEL_ID}> เท่านั้นนะคะ`,
        flags: FLAG_EPHEMERAL
      });
    }

    const member = interaction.member;
    const userId = interaction.user.id;

    // 2. ตรวจสอบ role_blacklist
    const isBlacklisted = sharedConfig.role_blacklist.some(id => member?.roles?.cache?.has(id));
    if (isBlacklisted) {
      const payload = blacklistPayload(userId);
      payload.flags = FLAG_V2;
      return interaction.reply(payload);
    }

    // 3. Cooldown 5 วินาที
    const now = Date.now();
    const cdExpiry = await getCooldown(supabase, userId, "randomQuestion");
    if (now < cdExpiry) {
      const readyTimestamp = Math.floor(cdExpiry / 1000);
      return interaction.reply({
        content: cooldownContent(userId, readyTimestamp),
        flags: FLAG_EPHEMERAL
      });
    }
    await setCooldown(supabase, userId, "randomQuestion", now + 5000);

    // 4. แปลง category เป็นภาษาไทย (ถ้าไม่ได้เลือก ให้เป็น "สุ่มจากทุกหมวดหมู่")
    const rawCategory = interaction.options.getString("category");
    const categoryDisplay = rawCategory && CATEGORY_MAP[rawCategory]
      ? CATEGORY_MAP[rawCategory]
      : "สุ่มจากทุกหมวดหมู่";

    // 5. ส่ง Component v2 เริ่มต้น (แสดงสถานะกำลังสุ่ม...)
    const initialPayload = {
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `### <:bee20000:1256669436350562355>︲__\` คำถามหมวดหมู่: ${categoryDisplay} \`__\n# <a:516185loading:1510390943172399195>⠀คุณจะได้คำถามอะไรกันนะ . . .\n-# คำแนะนำ: เอาไว้เล่นกับที่คุณอยากทำความรู้จักด้วย แต่จะเล่นคนเดียวตอบคนเดียวก็ได้ค้าบ ʕ •ᴥ• ʔ ♡₊˚`
            }
          ]
        }
      ]
    };

    try {
      await interaction.reply(initialPayload);

      // 6. ดึงคำถามจาก Supabase ตาราง question_collect ระหว่างรอ 5 วินาที
      let query = supabase.from("question_collect").select("question_text");
      if (rawCategory) {
        query = query.eq("category", rawCategory);
      }

      const [dbResult] = await Promise.all([
        query,
        new Promise(resolve => setTimeout(resolve, 5000))
      ]);

      let questionText = "ยังไม่มีคำถามในหมวดหมู่นี้ในระบบ";
      if (dbResult.data && dbResult.data.length > 0) {
        const randomIndex = Math.floor(Math.random() * dbResult.data.length);
        questionText = dbResult.data[randomIndex].question_text;
      } else if (dbResult.error) {
        console.error("[randomQuestion] Supabase query error:", dbResult.error.message);
      }

      // 7. แก้ไขข้อความหลังจาก 5 วินาทีด้วยคำถามที่สุ่มได้
      const editedPayload = {
        flags: FLAG_V2,
        components: [
          {
            type: 17,
            components: [
              {
                type: 10,
                content: `### <:bee20000:1256669436350562355>︲__\` คำถามหมวดหมู่: ${categoryDisplay} \`__\n# ${questionText}\n-# คำแนะนำ: เอาไว้เล่นกับที่คุณอยากทำความรู้จักด้วย แต่จะเล่นคนเดียวตอบคนเดียวก็ได้ค้าบ ʕ •ᴥ• ʔ ♡₊˚`
              }
            ]
          }
        ]
      };

      await interaction.editReply(editedPayload);
    } catch (err) {
      if (err.code !== 10062 && err.code !== 40060) {
        console.error("[randomQuestion] Interaction error:", err);
      }
    }
  });

  console.log("[randomQuestion] ✅ ระบบ /สุ่มคำถาม พร้อมใช้งาน");
}

module.exports = { setupRandomQuestion };
