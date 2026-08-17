// src/commands/giveFlower.js
// ระบบ Slash Command /มอบดอกไม้ พร้อมระบบคูลดาวน์ Blacklist และ persistence session

const { createClient } = require("@supabase/supabase-js");
const { MessageFlags, Events } = require("discord.js");
const sharedConfig = require("../sharedSettings.json");
const { blacklistPayload, cooldownContent } = require("../features/shared/tarotComponents");
const { getCooldown, setCooldown } = require("../utils/cooldownManager");

const FLAG_V2 = MessageFlags.IsComponentsV2 || 32768;
const FLAG_EPHEMERAL = MessageFlags.Ephemeral || 64;

const TARGET_ROLE_ID = "1288406430864511029"; // ยศพิเศษเมื่อรับดอกไม้
const TARGET_CHANNEL_ID = "1524124280281890938"; // ห้องที่อนุญาตให้ใช้คำสั่ง
const WITHERED_IMG = "https://cdn.discordapp.com/attachments/1524704267015819274/1532863674866470992/Flower.png?ex=6a6e660b&is=6a6d148b&hm=cfcd56b1a805ba7e1b3c12fb34e543c4a574dc2d3526911ff768e31a61b38c00&";

const FLOWERS = {
  white_rose: {
    flower: "White rose (กุหลาบขาว)",
    mean: "แด่เธอ ผู้เป็นรักครั้งใหม่",
    img: "https://cdn.discordapp.com/attachments/1524704267015819274/1532862615137685615/1.png?ex=6a6f0dce&is=6a6dbc4e&hm=3bd2f07add99d8e390152b955b686a94da040afc36c7b0c38fde837487db2c76&"
  },
  lilac: {
    flower: "Lilac (ไลแลค)",
    mean: "แด่รักแรกเมื่อพานพบเจอกัน",
    img: "https://cdn.discordapp.com/attachments/1524704267015819274/1532862615607578835/2.png?ex=6a6f0dce&is=6a6dbc4e&hm=9ab4eb71297d8f8c5cbc4b0f3213ccbe16e93a885fc0af998aca9c1aa7d1b238&"
  },
  hydrangea: {
    flower: "Hydrangea (ไฮเดรนเยีย)",
    mean: "ขอบคุณ เธอผู้ที่เข้าใจกัน",
    img: "https://cdn.discordapp.com/attachments/1524704267015819274/1532862615884398773/3.png?ex=6a6f0dce&is=6a6dbc4e&hm=1ce60676cdddb3190be31a7e492ce23933f73fb73ff8ec986b63a662ab869b1e&"
  },
  lily: {
    flower: "Lily (ลิลลี่)",
    mean: "ยินดีเมื่อได้พบเธอ",
    img: "https://cdn.discordapp.com/attachments/1524704267015819274/1532862616165158992/4.png?ex=6a6f0dce&is=6a6dbc4e&hm=bdd10f258d61c6d5ebeac8ece07d5dcd46c1ae597084f3188055167fc72c2909&"
  },
  sunflower: {
    flower: "Sunflower (ทานตะวัน)",
    mean: "เธอผู้เป็นคนหวังที่รอคอย",
    img: "https://cdn.discordapp.com/attachments/1524704267015819274/1532862616509218947/5.png?ex=6a6f0dce&is=6a6dbc4e&hm=a916f3ef8f534c1b2dd002403a8e14d43df5e9e07e2118e871d49a34b5478650&"
  },
  peony: {
    flower: "Peony (พีโอนี)",
    mean: "ความภักดีที่จะมอบแด่เธอ",
    img: "https://cdn.discordapp.com/attachments/1524704267015819274/1532862616773329190/6.png?ex=6a6f0dcf&is=6a6dbc4f&hm=c06307360b110658a52d5ee0c8d91f4379fff76483b3fde1df80e8a833d3d781&"
  },
  white_tulip: {
    flower: "White Tulip (ทิวลิปขาว)",
    mean: "ความจริงใจที่อยากมอบแด่เธอ",
    img: "https://cdn.discordapp.com/attachments/1524704267015819274/1532862617033642115/7.png?ex=6a6f0dcf&is=6a6dbc4f&hm=40c6715638c5258cb8dc844b45641759bb4c41b82806222dc917336e5c7d41cc&"
  },
  daffodil: {
    flower: "Daffodil (แดฟโฟดิล)",
    mean: "ความยินดีที่ได้มอบมิตรภาพดี ๆ แด่เธอ",
    img: "https://cdn.discordapp.com/attachments/1524704267015819274/1532862617306267668/8.png?ex=6a6f0dcf&is=6a6dbc4f&hm=0a6a95f826e00fed748f9bc955f7a3c69f4c1ab9e98d80b86bc3105a2c6ce7b0&"
  },
  forget_me_not: {
    flower: "Forget me not (ฟอร์เก็ตมีน็อต)",
    mean: "อย่าลืมวันวานที่เราได้พบเจอกัน",
    img: "https://cdn.discordapp.com/attachments/1524704267015819274/1532862617553604679/9.png?ex=6a6f0dcf&is=6a6dbc4f&hm=0b8f25d27dc9017fc730dbedcc21be631fcb7a825bc65a6ac43b11ecd277496b&"
  },
  lavender: {
    flower: "Lavender (ลาเวนเดอร์)",
    mean: "เธอคือ ความสงบเมื่อใช้เวลาร่วมกัน",
    img: "https://cdn.discordapp.com/attachments/1524704267015819274/1532862617813516430/10.png?ex=6a6f0dcf&is=6a6dbc4f&hm=b28b0d0490f70389ddd5a95c40154fe4adfa09ce1be022aaae8bf769694d2207&"
  }
};

const activeTimers = new Map();
const inMemorySessions = new Map();

function getFlowerInfo(key) {
  if (FLOWERS[key]) return FLOWERS[key];
  for (const k in FLOWERS) {
    if (FLOWERS[k].flower === key) return FLOWERS[k];
  }
  return FLOWERS.white_rose;
}

function checkUserBlacklisted(member) {
  if (!member || !member.roles) return false;
  return sharedConfig.role_blacklist.some(id => member.roles.cache.has(id));
}

function buildInitialPayload(senderId, targetId, flowerName, imgUrl, expireTimestamp, sessionId) {
  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 9,
            components: [
              {
                type: 10,
                content:
                  `## <a:rosegarden_event:1288394384177500201>︲__\` 𝖳𝖺𝗄𝖾 𝗆𝖾 ₊ เธอจะรับดอกไม้มั้ยคะ ? 𓂃 \`__\n` +
                  `<:line:1144701793989840997>\n` +
                  `**รายละเอียด:**\n` +
                  `> (<:bee20000:1256669436350562355>)⠀<@${senderId}> มอบดอกไม้ให้ <@${targetId}> เธอจะรับมั้ยนะ?\n` +
                  `> (<:cuteplant:1152834055528783872>)⠀**${flowerName}** ความหมายของดอกไม้จะปรากฎต่อเมื่อคุณรับดอกไม้\n` +
                  `> (<a:7596clock:1160230591892029510>)⠀คุณมีเวลา <t:${expireTimestamp}:R> ในการรับดอกไม้ ก่อนที่มันจะเฉาและหายไป`
              }
            ],
            accessory: {
              type: 11,
              media: {
                url: imgUrl
              }
            }
          },
          {
            type: 14,
            spacing: 2
          },
          {
            type: 1,
            components: [
              {
                style: 3,
                type: 2,
                label: "︲รับดอกไม้",
                emoji: {
                  id: "1310598361459462175",
                  name: "95323thumbs",
                  animated: false
                },
                custom_id: `give_flower:accept:${sessionId}`,
                flow: {
                  actions: []
                }
              },
              {
                style: 4,
                type: 2,
                label: "︲ปฎิเสธดอกไม้!!",
                emoji: {
                  id: "1310598359152857199",
                  name: "2531thumbsdown",
                  animated: false
                },
                custom_id: `give_flower:decline:${sessionId}`,
                flow: {
                  actions: []
                }
              }
            ]
          }
        ]
      }
    ]
  };
}

function buildWitheredPayload(senderId, targetId) {
  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 9,
            components: [
              {
                type: 10,
                content:
                  `## 💀︲__\` 𝖥𝗅𝗈𝗐𝖾𝗋 ₊ ดอกไม้เฉาแล้ว . . . 𓂃 \`__\n` +
                  `<:line:1144701793989840997>\n` +
                  `**รายละเอียด:**\n` +
                  `> (<:bee20000:1256669436350562355>)⠀<@${senderId}> ดูเหมือนว่า <@${targetId}> จะรับดอกไม้ของเธอไม่ทันนะ มันเฉาตายหมดแล้ว . . .`
              }
            ],
            accessory: {
              type: 11,
              media: {
                url: WITHERED_IMG
              }
            }
          },
          {
            type: 14,
            spacing: 2
          }
        ]
      }
    ]
  };
}

function buildAcceptedPayload(senderId, targetId, flowerName, mean, imgUrl) {
  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 9,
            components: [
              {
                type: 10,
                content:
                  `## <a:rosegarden_event:1288394384177500201>︲__\` ยินดีด้วย ₊ เธอรับดอกไม้ของคุณแล้ว! 𓂃 \`__\n` +
                  `<:line:1144701793989840997>\n` +
                  `**รายละเอียด:**\n` +
                  `> (<:bee20000:1256669436350562355>)⠀<@${targetId}> รับดอกไม้ของ <@${senderId}> เรียบร้อย\n` +
                  `> (<:cuteplant:1152834055528783872>)⠀**${flowerName}** ${mean}\n` +
                  `> (<a:3602exclamationmarkbubble:1372837492205555812>)⠀<@${targetId}> ได้รับยศพิเศษ **\` @ミ ③ Flower for u \`**`
              }
            ],
            accessory: {
              type: 11,
              media: {
                url: imgUrl
              }
            }
          },
          {
            type: 14,
            spacing: 2
          }
        ]
      }
    ]
  };
}

function buildDeclinedPayload(senderId, targetId) {
  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 10,
            content: `## <a:rosegarden_event:1288394384177500201>⠀<@${senderId}> เสียใจด้วย <@${targetId}> ปฎิเสธดอกไม้ของคุณ!`
          }
        ]
      }
    ]
  };
}

async function handleTimeoutSession(client, supabase, session) {
  try {
    inMemorySessions.delete(session.id);
    const channel = await client.channels.fetch(session.channel_id).catch(() => null);
    if (channel) {
      const msg = await channel.messages.fetch(session.message_id).catch(() => null);
      if (msg) {
        await msg.edit(buildWitheredPayload(session.sender_id, session.target_id)).catch(() => null);
      }
    }
  } catch (err) {
    console.error("[giveFlower] Error handling timeout session:", err.message);
  } finally {
    try {
      await supabase.from("flower_sessions").delete().eq("id", session.id);
    } catch (e) {
      // ignore
    }
  }
}

function scheduleSessionTimeout(client, supabase, session) {
  if (activeTimers.has(session.id)) {
    clearTimeout(activeTimers.get(session.id));
  }
  const remainingMs = session.expires_at - Date.now();
  if (remainingMs <= 0) {
    handleTimeoutSession(client, supabase, session);
    return;
  }
  const timer = setTimeout(() => {
    activeTimers.delete(session.id);
    handleTimeoutSession(client, supabase, session);
  }, remainingMs);
  activeTimers.set(session.id, timer);
}

async function restoreSessionsFromDb(client, supabase) {
  try {
    const { data, error } = await supabase.from("flower_sessions").select("*");
    if (error) {
      if (error.code !== "42P01") { // ignore table does not exist initially
        console.error("[giveFlower] Failed to restore sessions from DB:", error.message);
      }
      return;
    }
    if (data && data.length > 0) {
      console.log(`[giveFlower] Restoring ${data.length} active flower session(s) from DB...`);
      for (const session of data) {
        inMemorySessions.set(session.id, session);
        scheduleSessionTimeout(client, supabase, session);
      }
    }
  } catch (err) {
    console.error("[giveFlower] Exception restoring sessions:", err.message);
  }
}

function setupGiveFlower(client) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  client.once("clientReady", async () => {
    try {
      const { getValidGuild } = require("../../utils/guildFilter");
      const guildId = process.env.GUILD_ID || "1144251788493602848";
      const guild = getValidGuild(client, guildId);

      if (guild) {
        await guild.commands.create({
          name: "มอบดอกไม้",
          description: "มอบดอกไม้ให้สมาชิกที่คุณรู้สึกดีด้วย",
          options: [
            {
              name: "user",
              description: "เลือกสมาชิกที่ต้องการมอบดอกไม้ให้",
              type: 6, // USER
              required: true
            },
            {
              name: "flower",
              description: "เลือกดอกไม้ที่ต้องการมอบ",
              type: 3, // STRING
              required: true,
              choices: Object.keys(FLOWERS).map(key => ({
                name: FLOWERS[key].flower,
                value: key
              }))
            }
          ]
        });
        console.log(`[giveFlower] Command /มอบดอกไม้ registered on guild ${guild.name}.`);
      } else {
        console.warn("[giveFlower] No guild found for slash command registration.");
      }

      await restoreSessionsFromDb(client, supabase);
    } catch (err) {
      console.error("[giveFlower] Failed during clientReady setup:", err.message);
    }
  });

  client.on(Events.InteractionCreate, async (interaction) => {
    // ── 1. Slash Command Handling ──────────────────────────────────────────
    if (interaction.isChatInputCommand() && interaction.commandName === "มอบดอกไม้") {
      // 1.0 Channel check
      if (interaction.channelId !== TARGET_CHANNEL_ID) {
        return interaction.reply({
          content: `คำสั่งนี้ใช้ได้เฉพาะห้อง <#${TARGET_CHANNEL_ID}> เท่านั้นนะคะ`,
          flags: FLAG_EPHEMERAL
        });
      }

      const member = interaction.member;
      const userId = interaction.user.id;

      // 1.1 Role blacklist check
      if (checkUserBlacklisted(member)) {
        const payload = blacklistPayload(userId);
        payload.flags = FLAG_V2;
        return interaction.reply(payload);
      }

      // 1.2 Target check
      const targetUser = interaction.options.getUser("user");
      if (!targetUser) {
        return interaction.reply({
          content: "❌ กรุณาระบุสมาชิกที่ต้องการมอบดอกไม้ให้ค่ะ",
          flags: FLAG_EPHEMERAL
        });
      }
      if (targetUser.id === userId) {
        return interaction.reply({
          content: "❌ คุณไม่สามารถมอบดอกไม้ให้ตัวเองได้นะคะ",
          flags: FLAG_EPHEMERAL
        });
      }
      if (targetUser.bot) {
        return interaction.reply({
          content: "❌ คุณไม่สามารถมอบดอกไม้ให้บอทได้นะคะ",
          flags: FLAG_EPHEMERAL
        });
      }

      // 1.3 Cooldown 1m (60,000 ms)
      const now = Date.now();
      const cdExpiry = await getCooldown(supabase, userId, "giveFlower");
      if (now < cdExpiry) {
        const readyTimestamp = Math.floor(cdExpiry / 1000);
        return interaction.reply({
          content: cooldownContent(userId, readyTimestamp),
          flags: FLAG_EPHEMERAL
        });
      }

      const flowerKey = interaction.options.getString("flower");
      const flowerObj = getFlowerInfo(flowerKey);

      // Set cooldown 1 minute
      await setCooldown(supabase, userId, "giveFlower", now + 60000);

      const expireTimestamp = Math.floor((now + 30 * 60 * 1000) / 1000);
      const sessionId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);

      const payload = buildInitialPayload(userId, targetUser.id, flowerObj.flower, flowerObj.img, expireTimestamp, sessionId);

      try {
        await interaction.reply(payload);
        const replyMsg = await interaction.fetchReply();

        const session = {
          id: sessionId,
          channel_id: interaction.channelId,
          message_id: replyMsg.id,
          sender_id: userId,
          target_id: targetUser.id,
          flower_key: flowerKey,
          expires_at: now + 30 * 60 * 1000
        };

        // Save session to Memory & DB
        inMemorySessions.set(sessionId, session);
        const { error: insertErr } = await supabase.from("flower_sessions").insert(session);
        if (insertErr) {
          console.error("[giveFlower] Could not persist session to DB:", insertErr.message);
        }

        // Schedule timeout
        scheduleSessionTimeout(client, supabase, session);
      } catch (err) {
        console.error("[giveFlower] Error sending initial reply:", err.message);
      }
      return;
    }

    // ── 2. Button Interaction Handling ─────────────────────────────────────
    if (interaction.isButton() && interaction.customId.startsWith("give_flower:")) {
      const parts = interaction.customId.split(":");
      const action = parts[1];
      const sessionId = parts[2];

      const member = interaction.member;
      const userId = interaction.user.id;

      // 2.1 Role blacklist check for button clicker
      if (checkUserBlacklisted(member)) {
        const payload = blacklistPayload(userId);
        payload.flags = FLAG_V2;
        return interaction.reply(payload);
      }

      // Fetch session from Memory first, then DB fallback
      let session = inMemorySessions.get(sessionId);

      if (!session) {
        try {
          const { data } = await supabase
            .from("flower_sessions")
            .select("*")
            .eq("id", sessionId)
            .single();
          if (data) session = data;
        } catch (err) {
          // Ignore DB error
        }
      }

      if (!session) {
        return interaction.reply({
          content: "❌ ดอกไม้นี้ถูกดำเนินการไปแล้วหรือหมดเวลาแล้วค่ะ",
          flags: FLAG_EPHEMERAL
        });
      }

      // 2.2 Target authorization check (only tagged user can click)
      if (userId !== session.target_id) {
        return interaction.reply({
          content: `❌ เฉพาะ <@${session.target_id}> เท่านั้นที่สามารถกดรับหรือปฏิเสธดอกไม้นี้ได้ค่ะ`,
          flags: FLAG_EPHEMERAL
        });
      }

      // Clear memory, timer and remove from DB
      inMemorySessions.delete(sessionId);
      if (activeTimers.has(sessionId)) {
        clearTimeout(activeTimers.get(sessionId));
        activeTimers.delete(sessionId);
      }
      try {
        await supabase.from("flower_sessions").delete().eq("id", sessionId);
      } catch (e) {
        // ignore
      }

      const flowerObj = getFlowerInfo(session.flower_key);

      // Delete old message containing slash command and buttons
      await interaction.message.delete().catch(() => null);

      if (action === "accept") {
        // แอดบทบาท "1288406430864511029" ให้ผู้โดนแท็ก
        try {
          const guildMember = await interaction.guild?.members.fetch(session.target_id).catch(() => null);
          if (guildMember) {
            await guildMember.roles.add(TARGET_ROLE_ID).catch(err => {
              console.error("[giveFlower] Failed to add special role:", err.message);
            });
          }
        } catch (err) {
          console.error("[giveFlower] Error fetching guild member for role addition:", err.message);
        }

        const acceptedPayload = buildAcceptedPayload(
          session.sender_id,
          session.target_id,
          flowerObj.flower,
          flowerObj.mean,
          flowerObj.img
        );

        await interaction.channel.send(acceptedPayload).catch(err => {
          console.error("[giveFlower] Error sending accepted payload:", err.message);
        });
      } else if (action === "decline") {
        const declinedPayload = buildDeclinedPayload(session.sender_id, session.target_id);

        await interaction.channel.send(declinedPayload).catch(err => {
          console.error("[giveFlower] Error sending declined payload:", err.message);
        });
      }
    }
  });

  console.log("[giveFlower] ✅ ระบบ /มอบดอกไม้ พร้อมใช้งาน");
}

module.exports = { setupGiveFlower };
