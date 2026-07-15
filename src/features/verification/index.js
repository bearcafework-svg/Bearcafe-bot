const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  Events,
  PermissionFlagsBits
} = require("discord.js");
const { createClient } = require("@supabase/supabase-js");
const sharedConfig = require("../../sharedSettings.json");
const { startQueueProcessor } = require("./queueProcessor");
const { blacklistPayload, dmClosedPayload } = require("../shared/tarotComponents");

// Supabase client initialization
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

// Constants
const VERIFY_CHANNEL_ID = process.env.VERIFY_CHANNEL_ID || "1524124097448116477";
const WELCOME_CHANNEL_ID = "1524124134387224828";
const MEMBER_ROLE_ID = "1144700895020462200";
const BLOCKED_ROLES = sharedConfig.role_blacklist || [];

// 4 Link buttons for greeting new members (we'll pick 2 at random)
const WELCOME_BUTTON_POOL = [
  {
    type: 2,
    style: 5,
    label: "︲สุ่มแชทหาเพื่อน",
    emoji: { id: "1518217054711189644", name: "27073hispeechbubble", animated: true },
    url: "https://discord.com/channels/1144251788493602848/1524124222555947109"
  },
  {
    type: 2,
    style: 5,
    label: "︲สร้างห้องของตัวเอง",
    emoji: { id: "1352955313648828477", name: "8439crownemoji3", animated: true },
    url: "https://discord.com/channels/1144251788493602848/1525400520934555790"
  },
  {
    type: 2,
    style: 5,
    label: "︲ดูดวงกับบอทฟรี",
    emoji: { id: "1428305761783517204", name: "58991purpleween", animated: false },
    url: "https://discord.com/channels/1144251788493602848/1524122936183754893"
  },
  {
    type: 2,
    style: 5,
    label: "︲ปฎิทินเช็กอิน 28 วัน (ฟรี)",
    emoji: { id: "1276130500410605609", name: "68492gift", animated: false },
    url: "https://bearcafe4commu.vercel.app/"
  }
];

/**
 * Checks if the user's name matches/contains any banned words from Supabase table 'banned_words'
 * @param {GuildMember} member 
 * @returns {Promise<string|null>} The matched banned word or null
 */
async function checkBannedName(member) {
  try {
    const { data: wordsData, error } = await supabase
      .from("banned_name")
      .select("word");

    if (error) {
      console.error("[verification] Error fetching banned words from DB:", error.message);
      return null;
    }

    if (!wordsData || wordsData.length === 0) {
      console.log("[verification] No banned words found in public.banned_words table.");
      return null;
    }

    const username = member.user.username.toLowerCase();
    const displayName = member.displayName.toLowerCase();
    const nickname = member.nickname ? member.nickname.toLowerCase() : "";

    console.log(`[verification] Checking member name. User: ${member.user.tag}. Username: "${username}", DisplayName: "${displayName}", Nickname: "${nickname}"`);

    for (const item of wordsData) {
      const bannedWord = item.word.toLowerCase().trim();
      if (!bannedWord) continue;

      if (username.includes(bannedWord) || displayName.includes(bannedWord) || nickname.includes(bannedWord)) {
        console.log(`[verification] Match detected! Banned word: "${bannedWord}" inside user: ${member.user.tag}`);
        return item.word;
      }
    }
  } catch (err) {
    console.error("[verification] Banned name check exception:", err);
  }
  return null;
}

/**
 * Handle new member verification success
 */
async function completeVerification(interaction) {
  const member = interaction.member;

  try {
    // 1. Assign role
    await member.roles.add(MEMBER_ROLE_ID);

    // 2. Generate and send welcome message with 2 random buttons
    const shuffled = [...WELCOME_BUTTON_POOL].sort(() => 0.5 - Math.random());
    const selectedButtons = shuffled.slice(0, 2);

    const welcomePayload = {
      flags: 32768, // V2 Components
      components: [
        {
          type: 17,
          components: [
            {
              type: 10,
              content: `## <a:bear_hi:1144698250306257037>︲<@${member.user.id}>  เธอคือหมีตัวใหม่หรอ ยินดีต้อนรับน้า!\n> (<:bearcafe_star:1212856675053346897>)⠀อย่าลืมอ่าน <#1524123185325543587> ด้วยนะคะ ขอบคุณค่ะ!\n> (<a:59217leaf:1512014878796152862>)⠀เปิดการมองเห็นห้อง <#1524122867178930237>`
            },
            {
              type: 14,
              spacing: 2
            },
            {
              type: 1,
              components: selectedButtons
            }
          ]
        }
      ]
    };

    const welcomeChannel = interaction.guild.channels.cache.get(WELCOME_CHANNEL_ID);
    if (welcomeChannel) {
      const welcomeMsg = await welcomeChannel.send(welcomePayload);

      // Delete welcome message after 5 minutes
      setTimeout(async () => {
        try {
          await welcomeMsg.delete();
        } catch (e) {
          // Message might already be deleted
        }
      }, 5 * 60 * 1000);
    } else {
      console.error(`[verification] Welcome channel ${WELCOME_CHANNEL_ID} not found.`);
    }

    // 3. Inform user of success (ephemeral V2)
    const successPayload = {
      flags: 32768 | 64, // Ephemeral V2
      components: [
        {
          type: 17,
          components: [
            { type: 14, spacing: 2 },
            {
              type: 10,
              content: `## 🎉︲ลงทะเบียนสำเร็จแล้วค่ะ!\nยินดีต้อนรับ <@${member.user.id}> เข้าสู่เซิร์ฟเวอร์ **Bear Cafe** อย่างเป็นทางการค่ะ 🐻💖\nคุณสามารถเข้าชมห้องต่างๆ ได้ทันที และมีบทยศสมาชิกเรียบร้อยแล้วค่ะ!`
            },
            { type: 14, spacing: 2 }
          ]
        }
      ]
    };

    if (interaction.isModalSubmit()) {
      await interaction.reply(successPayload);
    } else {
      await interaction.update(successPayload);
    }

  } catch (err) {
    console.error("[verification] Failed to complete verification:", err);
    const errText = "❌ เกิดข้อผิดพลาดระหว่างการรับยศลงทะเบียน กรุณาติดต่อผู้ดูแลระบบค่ะ";
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: errText, flags: 64 });
    } else {
      await interaction.reply({ content: errText, flags: 64 });
    }
  }
}

/**
 * Feature initialization function
 * @param {Client} client 
 */
function setupVerification(client) {
  // Start the background DM broadcast queue processor
  startQueueProcessor(client, supabase);

  // ── 1. Event: guildMemberAdd ─────────────────────────────────────
  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      const channel = member.guild.channels.cache.get(VERIFY_CHANNEL_ID);
      if (!channel) {
        console.warn(`[verification] Verification channel ${VERIFY_CHANNEL_ID} not found.`);
        return;
      }

      // Send join message
      const joinMsg = await channel.send({
        content: `# <:bear_star1:1152782839671169184>︲<@${member.user.id}> เข้ามาแล้วกดปุ่ม **ลงทะเบียน** ได้เลย *!*`
      });

      // Auto-delete after 1 minute
      setTimeout(async () => {
        try {
          await joinMsg.delete();
        } catch (err) {
          // Ignore if message already deleted
        }
      }, 60 * 1000);

    } catch (err) {
      console.error("[verification] Error handling GuildMemberAdd:", err);
    }
  });

  // ── 2. Event: messageCreate (Admin b!reset-verify) ──────────────────
  client.on(Events.MessageCreate, async (message) => {
    if (message.author.bot || !message.guild) return;

    if (message.content.trim() === "b!reset-verify") {
      // Check if Owner or Administrator
      const isOwner = message.author.id === message.guild.ownerId;
      const isAdmin = message.member && message.member.permissions.has(PermissionFlagsBits.Administrator);

      if (!isOwner && !isAdmin) {
        return message.reply({
          content: "❌ คำสั่งนี้สามารถใช้งานได้เฉพาะเจ้าของเซิร์ฟเวอร์ (Owner) เท่านั้นค่ะ"
        });
      }

      try {
        const payload = {
          content: "",
          embeds: [],
          attachments: [],
          flags: 32768, // Component v2
          components: [
            {
              type: 17,
              components: [
                {
                  type: 14,
                  spacing: 2
                },
                {
                  type: 10,
                  content: "## <:bee20000:1256669436350562355>︲__` 𝖦𝖾𝗍 𝗋𝖾𝗀𝗂𝗌𝗍𝖾𝗋 ₊ ลงทะเบียนค้าบ 𓂃 `__"
                },
                {
                  type: 12,
                  items: [
                    {
                      media: {
                        url: "https://cdn.discordapp.com/attachments/1504118856690569226/1526215897436524644/VER.2__Final.jpg?ex=6a5636d1&is=6a54e551&hm=2574997880dfe85d2476bb29b49d56688dac44bba082cbf010d5c4993c35ea9f&"
                      }
                    }
                  ]
                },
                {
                  type: 14,
                  spacing: 2
                },
                {
                  type: 1,
                  components: [
                    {
                      style: 3, // Success/Green
                      type: 2,
                      label: "︲ลงทะเบียน",
                      emoji: { id: "1212856675053346897", name: "bearcafe_star", animated: false },
                      custom_id: "p_323843380868026369"
                    },
                    {
                      type: 2,
                      style: 5, // Link
                      label: "ไม่ทำก่อนลงทะเบียน พลาด!",
                      emoji: { id: "1396434906057281596", name: "imsupersurprised", animated: false },
                      url: "https://discord.com/channels/1144251788493602848/1524122867178930237"
                    }
                  ]
                }
              ]
            }
          ]
        };

        await message.channel.send(payload);
        // Delete setup command
        try {
          await message.delete();
        } catch (e) { }

      } catch (err) {
        console.error("[verification] Failed to send registration panel:", err);
      }
    }

    if (message.content.trim() === "b!reset-notice") {
      // Check if Owner or Administrator
      const isOwner = message.author.id === message.guild.ownerId;
      const isAdmin = message.member && message.member.permissions.has(PermissionFlagsBits.Administrator);

      if (!isOwner && !isAdmin) {
        return message.reply({
          content: "❌ คำสั่งนี้สามารถใช้งานได้เฉพาะเจ้าของเซิร์ฟเวอร์ (Owner) เท่านั้นค่ะ"
        });
      }

      try {
        const payload = {
          content: "",
          embeds: [],
          attachments: [],
          flags: 32768, // Component v2
          components: [
            {
              type: 17,
              components: [
                {
                  type: 12,
                  items: [
                    {
                      media: {
                        url: "https://cdn.discordapp.com/attachments/1524742861223100416/1526862634417393767/NewsBoard_-_bearcafe_10.png?ex=6a589123&is=6a573fa3&hm=95f43cf66f3190947e1f4d4ea6315c4a574637e673c0d7ee3f9107d45510f6fb&"
                      }
                    }
                  ]
                },
                { type: 14, spacing: 2 },
                {
                  type: 10,
                  content: "## <:bee20000:1256669436350562355>︲__` 𝖭𝗈𝗍𝗂𝖿𝗂𝖼𝖺𝗍𝗂𝗈𝗇𝗌 ₊ เลือกการแจ้งเตือนที่ต้องการ 𓂃 `__\n-# เลือกรับการแจ้งเตือนเฉพาะหัวข้อที่คุณสนใจ เพื่อไม่ให้พลาดข่าวสารสำคัญและลดการแจ้งเตือนที่ไม่จำเป็น <:cuteplant:1152834055528783872>\n\n(🎉)⠀**__กิจกรรม__** — ลุ้นของรางวัล อีเวนต์ และกิจกรรมพิเศษ\n(📢)⠀**__ประกาศสำคัญ__** — ข่าวสำคัญที่อาจส่งผลต่อการใช้งานเซิร์ฟเวอร์\n(📰)⠀**__ข่าวสารทั่วไป__** — อัปเดตฟีเจอร์และความเคลื่อนไหวของ Bear Cafe\n(🎁)⠀**__สิทธิพิเศษและโปรโมชัน__** — โปรโมชัน และสิทธิพิเศษสำหรับสมาชิก\n"
                },
                { type: 14, spacing: 2 },
                {
                  type: 1,
                  components: [
                    {
                      style: 3,
                      type: 2,
                      label: "คลิกเพื่อเลือกรับการแจ้งเตือน",
                      flow: { actions: [] },
                      custom_id: "p_324458660380020737"
                    }
                  ]
                }
              ]
            }
          ]
        };

        await message.channel.send(payload);
        try {
          await message.delete();
        } catch (e) { }
      } catch (err) {
        console.error("[verification] Failed to send notification panel:", err);
      }
    }
  });

  // ── 3. Event: interactionCreate (Buttons, Select Menus, Modals) ───────
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // ─── Button: คลิกเพื่อเลือกรับการแจ้งเตือน (Notice Board) ─────────
      if (interaction.isButton() && interaction.customId === "p_324458660380020737") {
        // Fetch fresh member details to bypass cache latency
        let member = interaction.member;
        try {
          member = await interaction.guild.members.fetch(interaction.user.id);
        } catch (fetchErr) {
          console.warn("[verification] Failed to fetch fresh member for notice button, using cache:", fetchErr);
        }

        // Check blacklist roles
        const hasBlacklisted = member.roles.cache.some(r => BLOCKED_ROLES.includes(r.id));
        if (hasBlacklisted) {
          const payload = blacklistPayload(interaction.user.id);
          payload.flags = 32768 | 64; // Ephemeral V2
          return interaction.reply(payload);
        }

        // Defer reply since sending a test DM might take longer than 3 seconds
        await interaction.deferReply({ flags: 64 });

        const userId = interaction.user.id;
        const username = interaction.user.username;

        // Check if member DM is open (silent check)
        let dmOpen = false;
        let dmErrMessage = null;
        try {
          const dm = await interaction.user.createDM();
          const testMsg = await dm.send({ content: "\u200b" });
          await testMsg.delete().catch(() => { });
          dmOpen = true;
        } catch (err) {
          dmOpen = false;
          dmErrMessage = err.message || "Cannot DM user";
        }

        if (!dmOpen) {
          // Update status in member_dm_status
          await supabase.from("member_dm_status").upsert({
            user_id: userId,
            username: username,
            dm_status: "closed",
            last_checked_at: new Date().toISOString(),
            last_error: dmErrMessage
          });
          return interaction.editReply(dmClosedPayload());
        } else {
          // Update status to open
          await supabase.from("member_dm_status").upsert({
            user_id: userId,
            username: username,
            dm_status: "open",
            last_checked_at: new Date().toISOString(),
            last_error: null
          });
        }

        try {
          // Load current user options from DB
          const { data, error } = await supabase
            .from("dms_options")
            .select("option_value")
            .eq("user_id", userId);

          if (error) throw error;

          const activeOptions = data ? data.map(r => r.option_value) : [];
          const notifyPayload = buildNoticeSelectorPayload(userId, activeOptions);

          await interaction.editReply(notifyPayload);
        } catch (err) {
          console.error("[verification] Error loading notice choices:", err.message);
          await interaction.editReply({
            content: "❌ เกิดข้อผิดพลาดในการโหลดข้อมูลการรับแจ้งเตือน กรุณาลองอีกครั้งในภายหลังค่ะ"
          }).catch(() => { });
        }
        return;
      }

      // ─── Button: ลงทะเบียน ──────────────────────────────────────────
      if (interaction.isButton() && interaction.customId === "p_323843380868026369") {
        // Fetch fresh member details to bypass stale cache
        let member = interaction.member;
        try {
          member = await interaction.guild.members.fetch(interaction.user.id);
        } catch (fetchErr) {
          console.warn("[verification] Failed to fetch fresh member, using cached member details:", fetchErr);
        }

        // 1. Check blacklist roles
        const hasBlacklisted = member.roles.cache.some(r => BLOCKED_ROLES.includes(r.id));
        if (hasBlacklisted) {
          const payload = blacklistPayload(interaction.user.id);
          payload.flags = 32768 | 64; // Ephemeral V2
          return interaction.reply(payload);
        }

        // 2. Check banned words
        const bannedWord = await checkBannedName(member);
        if (bannedWord) {
          return interaction.reply({
            content: `❌ ชื่อของคุณมีคำไม่เหมาะสมที่ระบบไม่อนุญาตค่ะ (ตรวจพบคำว่า: **${bannedWord}**)\n\n**กรุณาเปลี่ยนชื่อใหม่ของคุณก่อนกดลงทะเบียนอีกครั้งนะคะ!**\n*หากพบว่าหลังจากเข้ากลุ่มมีการเปลี่ยนชื่อกลับไปเป็นชื่อที่ไม่ดีหรือแฝงคำไม่สุภาพ จะถูกลงโทษตามกฎของเซิร์ฟเวอร์ทันทีค่ะ*`,
            flags: 64 // Ephemeral
          });
        }

        // 3. Send notifications options menu (ephemeral component v2)
        const notifyPayload = {
          flags: 32768 | 64, // Ephemeral V2
          components: [
            {
              type: 17,
              components: [
                {
                  type: 12,
                  items: [
                    {
                      media: {
                        url: "https://cdn.discordapp.com/attachments/1524704267015819274/1526522750460498021/d8c5887ba3276d401ff1af64efa6add6.jpg?ex=6a575499&is=6a560319&hm=44ac8a4b15d5f3beed9c9a4c0413df475b60afdea1dc2e96035ee6499612bd04&"
                      }
                    }
                  ]
                },
                {
                  type: 14,
                  spacing: 2
                },
                {
                  type: 10,
                  content: "## <:bee20000:1256669436350562355>︲__` 𝖭𝗈𝗍𝗂𝖿𝗂𝖼𝖺𝗍𝗂𝗈𝗇𝗌 ₊ เลือกการแจ้งเตือนที่ต้องการ 𓂃 `__\n-# เลือกรับการแจ้งเตือนเฉพาะหัวข้อที่คุณสนใจ เพื่อไม่ให้พลาดข่าวสารสำคัญและลดการแจ้งเตือนที่ไม่จำเป็น <:cuteplant:1152834055528783872>\n"
                },
                {
                  type: 1,
                  components: [
                    {
                      type: 3, // Select Menu
                      custom_id: "p_324120127182213152",
                      min_values: 0,
                      max_values: 4,
                      placeholder: "🐻︲เลือกการแจ้งเตือนที่ต้องการ",
                      options: [
                        { label: "กิจกรรม", value: "49B40A9yBS", description: "ลุ้นของรางวัล อีเวนต์ และกิจกรรมพิเศษ", emoji: { name: "🎉" } },
                        { label: "ประกาศสำคัญ", value: "JNySCX80ja", description: "ข่าวสำคัญที่อาจส่งผลต่อการใช้งานเซิร์ฟเวอร์", emoji: { name: "📢" } },
                        { label: "ข่าวสารทั่วไป", value: "DsMHlVrjze", description: "อัปเดตฟีเจอร์และความเคลื่อนไหวของ Bear Cafe", emoji: { name: "📑" } },
                        { label: "โปรโมชันและโฆษณา", value: "6io1xnaMWJ", description: "โปรโมชัน และสิทธิพิเศษสำหรับสมาชิก", emoji: { name: "🎁" } }
                      ]
                    }
                  ]
                },
                {
                  type: 14,
                  spacing: 2
                },
                {
                  type: 1,
                  components: [
                    {
                      style: 4, // Danger/Red
                      type: 2,
                      label: "ข้ามไปลงทะเบียน",
                      custom_id: "p_324121851091488771"
                    }
                  ]
                }
              ]
            }
          ]
        };

        await interaction.reply(notifyPayload);
      }

      // ─── Select Menu: เลือกรับการแจ้งเตือน ──────────────────────────
      if (interaction.isStringSelectMenu() && interaction.customId === "p_324120127182213152") {
        const userId = interaction.user.id;
        const username = interaction.user.username;
        const selectedValues = interaction.values || [];

        // Check if this is the toggle flow (Notice Board) or the verification flow
        let isToggleFlow = false;
        try {
          const textComp = interaction.message?.components?.[0]?.components?.find(c => c.type === 10);
          if (textComp && textComp.content && textComp.content.includes("สถานะการรับของคุณ")) {
            isToggleFlow = true;
          }
        } catch (e) {
          console.error("[verification] Error parsing components:", e);
        }

        if (isToggleFlow) {
          // Check blacklist roles
          let member = interaction.member;
          try {
            member = await interaction.guild.members.fetch(interaction.user.id);
          } catch (fetchErr) {
            console.warn("[verification] Failed to fetch fresh member for toggle, using cached details:", fetchErr);
          }

          const hasBlacklisted = member.roles.cache.some(r => BLOCKED_ROLES.includes(r.id));
          if (hasBlacklisted) {
            const payload = blacklistPayload(interaction.user.id);
            payload.flags = 32768 | 64; // Ephemeral V2
            return interaction.reply(payload);
          }

          try {
            // Bulk update subscriptions
            // 1. Delete all existing options for the user
            const { error: delErr } = await supabase
              .from("dms_options")
              .delete()
              .eq("user_id", userId);
            if (delErr) throw delErr;

            // 2. Insert new options if selected
            if (selectedValues.length > 0) {
              const rows = selectedValues.map(val => ({
                user_id: userId,
                option_value: val
              }));
              const { error: insErr } = await supabase
                .from("dms_options")
                .insert(rows);
              if (insErr) throw insErr;

              await supabase.from("member_dm_status").upsert({
                user_id: userId,
                username: username,
                dm_status: "open",
                last_checked_at: new Date().toISOString(),
                last_error: null
              });
            }

            // Update the message in-place with the new selections
            const newPayload = buildNoticeSelectorPayload(userId, selectedValues);
            await interaction.update(newPayload);
          } catch (err) {
            console.error("[verification] Toggle option error:", err.message);
            await interaction.reply({
              content: "❌ เกิดข้อผิดพลาดในการบันทึกข้อมูลการรับแจ้งเตือน กรุณาลองอีกครั้งในภายหลังค่ะ",
              flags: 64
            }).catch(() => { });
          }
          return;
        }

        await interaction.deferReply({ flags: 64 });

        // Check if member DM is open (silent check)
        let dmOpen = false;
        let dmErrMessage = null;
        try {
          const dm = await interaction.user.createDM();
          const testMsg = await dm.send({ content: "\u200b" });
          await testMsg.delete().catch(() => { });
          dmOpen = true;
        } catch (err) {
          dmOpen = false;
          dmErrMessage = err.message || "Cannot DM user";
        }

        if (!dmOpen) {
          // If DM failed (typically error code 50007), tell user how to open DM
          // Update status in public.member_dm_status
          await supabase.from("member_dm_status").upsert({
            user_id: userId,
            username: username,
            dm_status: "closed",
            last_checked_at: new Date().toISOString(),
            last_error: dmErrMessage
          });

          return interaction.editReply(dmClosedPayload());
        }

        // DM success, update DB dms_options & member_dm_status
        try {
          // Update DM status to open
          await supabase.from("member_dm_status").upsert({
            user_id: userId,
            username: username,
            dm_status: "open",
            last_checked_at: new Date().toISOString(),
            last_error: null
          });

          // Delete existing subscriptions for this user
          await supabase.from("dms_options").delete().eq("user_id", userId);

          // Insert new selected subscriptions
          if (selectedValues.length > 0) {
            const rows = selectedValues.map((val) => ({
              user_id: userId,
              option_value: val
            }));
            await supabase.from("dms_options").insert(rows);
          }

          await interaction.editReply({
            content: `✅ **บันทึกการตั้งค่าการแจ้งเตือนเสร็จเรียบร้อยแล้วค่ะ!**\nบอทจะส่งข่าวสารที่คุณเลือกให้ทาง DM ค่ะ`
          });

        } catch (dbErr) {
          console.error("[verification] DB Error updating dms_options:", dbErr.message);
          await interaction.editReply({
            content: "❌ เกิดข้อผิดพลาดในการบันทึกข้อมูลเข้าฐานข้อมูล กรุณาลองอีกครั้งในภายหลังค่ะ"
          });
        }
      }

      // ─── Button: ข้ามไปลงทะเบียน ─────────────────────────────────────
      if (interaction.isButton() && interaction.customId === "p_324121851091488771") {
        // Edit original ephemeral Component v2 message to show registration options select menu
        const regPanelPayload = {
          flags: 32768 | 64, // Ephemeral V2
          components: [
            {
              type: 17,
              components: [
                {
                  type: 14,
                  spacing: 2
                },
                {
                  type: 10,
                  content: "## <:bee20000:1256669436350562355>︲__` 𝖦𝖾𝗍 𝗋𝖾𝗀𝗂𝗌𝗍𝖾𝗋 ₊ ลงทะเบียนค้าบ 𓂃 `__\n"
                },
                {
                  type: 1,
                  components: [
                    {
                      type: 3, // Select Menu
                      custom_id: "p_323844351765516304",
                      placeholder: "🐻︲กดเลือกวิธีลงทะเบียนตรงนี้",
                      min_values: 1,
                      max_values: 1,
                      options: [
                        { label: "บวกลบเลขอนุบาล", value: "HKTszMnwzB", emoji: { id: "1150302636990537858", name: "6322number1", animated: true } },
                        { label: "ชื่อเจ้าของเซิร์ฟเวอร์?", value: "M5mdb7gwLF", emoji: { id: "1150302632611688509", name: "1656number2", animated: true } },
                        { label: "หมีมีกี่ตัว?", value: "hp7I2ajKUR", emoji: { id: "1150302629071683668", name: "5370number3", animated: true } }
                      ]
                    }
                  ]
                },
                {
                  type: 14,
                  spacing: 2
                }
              ]
            }
          ]
        };

        await interaction.update(regPanelPayload);
      }

      // ─── Interaction: Select Menu Registration Method ─────────────────
      if (interaction.isStringSelectMenu() && interaction.customId === "p_323844351765516304") {
        const choice = interaction.values[0];

        // 1. Math Challenge
        if (choice === "HKTszMnwzB") {
          const isAdd = Math.random() > 0.5;
          let num1 = Math.floor(Math.random() * 9) + 1;
          let num2 = Math.floor(Math.random() * 9) + 1;

          if (!isAdd && num1 < num2) {
            // Swap to ensure no negative numbers
            const temp = num1;
            num1 = num2;
            num2 = temp;
          }

          const answer = isAdd ? (num1 + num2) : (num1 - num2);

          const modal = new ModalBuilder()
            .setCustomId(`modal_math:${answer}`)
            .setTitle("บวกลบเลขอนุบาล");

          const answerInput = new TextInputBuilder()
            .setCustomId("math_answer")
            .setLabel(`โจทย์: ${num1} ${isAdd ? "+" : "-"} ${num2} = ?`)
            .setPlaceholder("ได้คำตอบแล้วพิมพ์ได้เลย")
            .setStyle(TextInputStyle.Short)
            .setRequired(true);

          const row = new ActionRowBuilder().addComponents(answerInput);
          modal.addComponents(row);

          await interaction.showModal(modal);
        }

        // 2. Server Owner Trivia
        else if (choice === "M5mdb7gwLF") {
          const modal = new ModalBuilder()
            .setCustomId("modal_owner_name")
            .setTitle("ชื่อเจ้าของเซิร์ฟเวอร์?");

          const nameInput = new TextInputBuilder()
            .setCustomId("owner_answer")
            .setLabel("เจ้าของเซิร์ฟเวอร์ชื่อว่าอะไร ?")
            .setPlaceholder("ได้คำตอบแล้วพิมพ์ได้เลย")
            .setStyle(TextInputStyle.Short)
            .setMaxLength(5)
            .setRequired(true);

          const row = new ActionRowBuilder().addComponents(nameInput);
          modal.addComponents(row);

          await interaction.showModal(modal);
        }

        // 3. How many bears
        else if (choice === "hp7I2ajKUR") {
          const bearPayload = {
            flags: 32768 | 64, // Ephemeral V2
            components: [
              {
                type: 17,
                components: [
                  {
                    type: 14,
                    spacing: 2
                  },
                  {
                    type: 12,
                    items: [
                      {
                        media: {
                          url: "https://cdn.discordapp.com/attachments/1525750929775923210/1526532707255980073/43878e9184706de393fd84369e4fa092.jpg?ex=6a575ddf&is=6a560c5f&hm=7dcb1dcf0dc72c6ad6620b72188a294e60c321d3d22fdd6e1614bfc2a3ea13a6&"
                        }
                      }
                    ]
                  },
                  {
                    type: 14,
                    spacing: 2
                  },
                  {
                    type: 1,
                    components: [
                      { style: 1, type: 2, custom_id: "p_324129479838404611", label: "สาม" },
                      { style: 4, type: 2, custom_id: "p_324129553377136644", label: "three" },
                      { style: 3, type: 2, custom_id: "p_324129614886604805", label: "2+1" }
                    ]
                  }
                ]
              }
            ]
          };

          await interaction.update(bearPayload);
        }
      }

      // ─── Button: How many bears (any button is correct) ───────────────
      if (interaction.isButton() &&
        (interaction.customId === "p_324129479838404611" ||
          interaction.customId === "p_324129553377136644" ||
          interaction.customId === "p_324129614886604805")) {
        await completeVerification(interaction);
      }

      // ─── Modal Submit: Math Challenge ──────────────────────────────
      if (interaction.isModalSubmit() && interaction.customId.startsWith("modal_math:")) {
        const expected = interaction.customId.split(":")[1];
        const answer = interaction.fields.getTextInputValue("math_answer").trim();

        if (answer === expected) {
          await completeVerification(interaction);
        } else {
          await interaction.reply({
            content: "❌ คำตอบไม่ถูกต้องค่ะ ลองใหม่อีกครั้งนะคะ",
            flags: 64 // Ephemeral
          });
        }
      }

      // ─── Modal Submit: Owner Trivia ───────────────────────────────
      if (interaction.isModalSubmit() && interaction.customId === "modal_owner_name") {
        const answer = interaction.fields.getTextInputValue("owner_answer").trim();

        // Answer is "ซีบิว"
        if (answer === "ซีบิว") {
          await completeVerification(interaction);
        } else {
          await interaction.reply({
            content: "❌ คำตอบไม่ถูกต้องค่ะ ลองใหม่อีกครั้งนะคะ",
            flags: 64 // Ephemeral
          });
        }
      }

    } catch (err) {
      console.error("[verification] Interaction error:", err);
    }
  });

  console.log("[verification] ✅ Verification system loaded successfully");
}

// ── Helper: สร้าง Payload สำหรับเลือกรับการแจ้งเตือน ───────────────────────────
function buildNoticeSelectorPayload(userId, activeOptions) {
  const emojiActive = "<:50121checkmark:1358584609087946867>";
  const emojiInactive = "<:68440x:1358584606911369226>";

  const hasGit = activeOptions.includes("49B40A9yBS") ? emojiActive : emojiInactive;
  const hasNotice = activeOptions.includes("JNySCX80ja") ? emojiActive : emojiInactive;
  const hasGeneral = activeOptions.includes("DsMHlVrjze") ? emojiActive : emojiInactive;
  const hasPromo = activeOptions.includes("6io1xnaMWJ") ? emojiActive : emojiInactive;

  const contentText = `## <:bee20000:1256669436350562355>︲__\` 𝖭𝗈𝗍𝗂𝖿𝗂𝖼𝖺𝗍𝗂𝗈𝗇𝗌 ₊ เลือกการแจ้งเตือนที่ต้องการ 𓂃 \`__\n` +
    `-# เลือกรับการแจ้งเตือนเฉพาะหัวข้อที่คุณสนใจ เพื่อไม่ให้พลาดข่าวสารสำคัญและลดการแจ้งเตือนที่ไม่จำเป็น <:cuteplant:1152834055528783872>\n\n` +
    `**สถานะการรับของคุณ:** <@${userId}>\n\n` +
    `>>> ${hasGit}⠀**__กิจกรรม__** — ลุ้นของรางวัล อีเวนต์ และกิจกรรมพิเศษ\n` +
    `${hasNotice}⠀**__ประกาศสำคัญ__** — ข่าวสำคัญที่อาจส่งผลต่อการใช้งานเซิร์ฟเวอร์\n` +
    `${hasGeneral}⠀**__ข่าวสารทั่วไป__** — อัปเดตฟีเจอร์และความเคลื่อนไหวของ Bear Cafe\n` +
    `${hasPromo}⠀**__สิทธิพิเศษและโปรโมชัน__** — โปรโมชัน และสิทธิพิเศษสำหรับสมาชิก\n`;

  return {
    flags: 32768 | 64, // Ephemeral V2
    components: [
      {
        type: 17,
        components: [
          {
            type: 12,
            items: [
              {
                media: {
                  url: "https://cdn.discordapp.com/attachments/1524704267015819274/1526522750460498021/d8c5887ba3276d401ff1af64efa6add6.jpg?ex=6a575499&is=6a560319&hm=44ac8a4b15d5f3beed9c9a4c0413df475b60afdea1dc2e96035ee6499612bd04&"
                }
              }
            ]
          },
          { type: 14, spacing: 2 },
          {
            type: 10,
            content: contentText
          },
          { type: 14, spacing: 2 },
          {
            type: 1,
            components: [
              {
                type: 3,
                custom_id: "p_324120127182213152",
                options: [
                  {
                    label: "กิจกรรม",
                    value: "49B40A9yBS",
                    description: "ลุ้นของรางวัล อีเวนต์ และกิจกรรมพิเศษ",
                    emoji: { name: "🎉" },
                    default: activeOptions.includes("49B40A9yBS")
                  },
                  {
                    label: "ประกาศสำคัญ",
                    value: "JNySCX80ja",
                    description: "ข่าวสำคัญที่อาจส่งผลต่อการใช้งานเซิร์ฟเวอร์",
                    emoji: { name: "📢" },
                    default: activeOptions.includes("JNySCX80ja")
                  },
                  {
                    label: "ข่าวสารทั่วไป",
                    value: "DsMHlVrjze",
                    description: "อัปเดตฟีเจอร์และความเคลื่อนไหวของ Bear Cafe",
                    emoji: { name: "📑" },
                    default: activeOptions.includes("DsMHlVrjze")
                  },
                  {
                    label: "โปรโมชันและโฆษณา",
                    value: "6io1xnaMWJ",
                    description: "โปรโมชัน และสิทธิพิเศษสำหรับสมาชิก",
                    emoji: { name: "🎁" },
                    default: activeOptions.includes("6io1xnaMWJ")
                  }
                ],
                placeholder: "🐻︲เลือกการแจ้งเตือนที่ต้องการ",
                min_values: 0,
                max_values: 4,
                flows: {}
              }
            ]
          }
        ]
      }
    ]
  };
}

module.exports = { setupVerification };
