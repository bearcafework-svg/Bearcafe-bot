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
const { queueVerifiedMember } = require("./staffNotifier");
const { blacklistPayload } = require("../shared/tarotComponents");
const { safeShowModal, safeUpdate } = require("../../../utils/discordSafety");

// Supabase client initialization
const supabase = createClient(
  process.env.POINTS_SUPABASE_URL || process.env.SUPABASE_URL,
  process.env.POINTS_SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
);

// Constants
const VERIFY_CHANNEL_ID = process.env.VERIFY_CHANNEL_ID || "1524124097448116477";
const WELCOME_CHANNEL_ID = "1524124134387224828";
const MEMBER_ROLE_ID = "1144700895020462200";
const BLOCKED_ROLES = sharedConfig.role_blacklist || [];
const REGISTRATION_PANEL_IMAGE_URL = "https://cdn.discordapp.com/attachments/1504118856690569226/1526215897436524644/VER.2__Final.jpg?ex=6a64b751&is=6a6365d1&hm=25a22fbf5bf3741963bc480eee19c0b00d4fe5583ac6aa2221be0d4f29c6f5a2&";

function getRegPanelPayload() {
  return {
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
            type: 12,
            items: [
              {
                media: {
                  url: REGISTRATION_PANEL_IMAGE_URL
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
          }
        ]
      }
    ]
  };
}

// 4 Link buttons for greeting new members (we'll pick 2 at random)
const WELCOME_BUTTON_POOL = [
  {
    type: 2,
    style: 5,
    label: "︲ซื้อยศลิมิเต็ด 2026",
    emoji: { id: "1542162263253848164", name: "Limited_26", animated: false },
    url: "https://discord.com/channels/1144251788493602848/1542161645243998392"
  },
  {
    type: 2,
    style: 5,
    label: "︲สินค้าคาเฟ่เริ่มต้น 15 บาท",
    emoji: { id: "1548947725133942824", name: "643900sevlev", animated: true },
    url: "https://discord.com/channels/1144251788493602848/1524124124836790294"
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
    label: "︲หาคนรับฟังอยู่ใช่มั้ยคะ คลิกเลย!",
    emoji: { id: "1531390206614311033", name: "184293bunnywave", animated: true },
    url: "https://discord.gg/EbH2m6PBvy"
  }
];

/**
 * Checks if the user's name matches/contains any banned words from Supabase table 'banned_words'
 * @param {GuildMember} member 
 * @returns {Promise<string|null>} The matched banned word or null
 */
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function matchesBannedWord(text, bannedWord) {
  if (!text || !bannedWord) return false;

  // สำหรับคำภาษาอังกฤษ/ตัวเลขสั้นๆ (เช่น av, sex) ให้เช็คแบบ Word Boundary (\b) เพื่อไม่ให้ติดคำผสมอย่าง avy, avatar, heavy
  if (/^[a-zA-Z0-9_]+$/.test(bannedWord)) {
    const regex = new RegExp(`\\b${escapeRegex(bannedWord)}\\b`, "i");
    return regex.test(text);
  }

  // สำหรับคำอื่นๆ หรือภาษาไทย เช็คขอบเขตของคำหรือสัญลักษณ์คั่น
  const boundaryRegex = new RegExp(`(?:^|[^a-zA-Z0-9\\u0E00-\\u0E7F])${escapeRegex(bannedWord)}(?:$|[^a-zA-Z0-9\\u0E00-\\u0E7F])`, "i");
  return boundaryRegex.test(text);
}

let bannedWordsCache = null;
let bannedWordsCacheExpiry = 0;

/**
 * Check member username / nickname against banned_name table in Supabase
 */
async function checkBannedName(member) {
  try {
    const now = Date.now();
    let wordsData = bannedWordsCache;
    if (!wordsData || now > bannedWordsCacheExpiry) {
      const { data, error } = await supabase
        .from("banned_name")
        .select("word");

      if (error) {
        console.error("[verification] Error fetching banned words from DB:", error.message);
      } else {
        wordsData = data || [];
        bannedWordsCache = wordsData;
        bannedWordsCacheExpiry = now + 5 * 60 * 1000; // Cache 5 mins
      }
    }

    if (!wordsData || wordsData.length === 0) {
      return null;
    }

    const username = member.user.username;
    const displayName = member.displayName;
    const nickname = member.nickname || "";

    console.log(`[verification] Checking member name. User: ${member.user.tag}. Username: "${username}", DisplayName: "${displayName}", Nickname: "${nickname}"`);

    for (const item of wordsData) {
      const bannedWord = item.word.trim();
      if (!bannedWord) continue;

      if (
        matchesBannedWord(username, bannedWord) ||
        matchesBannedWord(displayName, bannedWord) ||
        matchesBannedWord(nickname, bannedWord)
      ) {
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
    // 0. Defer interaction immediately to prevent 3-second token expiration (10062 Unknown interaction)
    if (!interaction.deferred && !interaction.replied) {
      if (interaction.isModalSubmit()) {
        await interaction.deferReply({ flags: 32768 | 64 }).catch(() => { });
      } else {
        await interaction.deferUpdate().catch(() => { });
      }
    }

    // 1. Assign role
    await member.roles.add(MEMBER_ROLE_ID);

    // 1.1 Queue verified member for batched staff notification
    try {
      queueVerifiedMember(interaction.guild, member);
    } catch (notifierErr) {
      console.error("[verification] Error queueing member for staff alert:", notifierErr);
    }

    // 2. Fetch staff members to get random staff nickname & notes
    let staffName = "ทีมงาน";
    let staffNotes = "ยินดีต้อนรับนะ ขอให้เธอได้เจอเพื่อนดี ๆ มีความสุข สนุกกับทุกช่วงเวลา และสมหวังในทุกสิ่งที่ตั้งใจ <a:bearg23:1396016002818506754>";

    try {
      const { data: staffList, error: staffErr } = await supabase
        .from("staff_members")
        .select("nickname, notes");

      if (!staffErr && staffList && staffList.length > 0) {
        const validStaff = staffList.filter(s => s.notes && s.notes.trim().length > 0);
        if (validStaff.length > 0) {
          const randomStaff = validStaff[Math.floor(Math.random() * validStaff.length)];
          staffName = randomStaff.nickname || "ทีมงาน";
          staffNotes = randomStaff.notes.trim();
        }
      }
    } catch (err) {
      console.error("[verification] Error fetching staff_members for welcome notes:", err);
    }

    // 3. Generate and send welcome message with 2 random buttons
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
              content: `## <a:bear_hi:1144698250306257037>︲<@${member.user.id}>  เธอคือหมีตัวใหม่หรอ ยินดีต้อนรับน้า!\n> (<a:27073hispeechbubble:1518217054711189644>)⠀**คุณ${staffName}** บอกว่า ${staffNotes}\n> (<:bearcafe_star:1212856675053346897>)⠀อย่าลืมอ่าน <#1524123185325543587> ด้วยนะคะ ขอบคุณค่ะ!\n> (<a:59217leaf:1512014878796152862>)⠀เปิดการมองเห็นห้อง <#1524122867178930237>`
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

    const welcomeChannel = interaction.guild.channels.cache.get(WELCOME_CHANNEL_ID) ||
      await interaction.guild.channels.fetch(WELCOME_CHANNEL_ID).catch(() => null);
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

    // 4. Inform user of success (ephemeral V2)
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

    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(successPayload).catch(async () => {
        await interaction.followUp(successPayload).catch(() => { });
      });
    } else {
      if (interaction.isModalSubmit()) {
        await interaction.reply(successPayload).catch(() => { });
      } else {
        await interaction.update(successPayload).catch(() => { });
      }
    }

  } catch (err) {
    if (err?.code !== 10062) {
      console.error("[verification] Failed to complete verification:", err);
    }
    const errText = "❌ เกิดข้อผิดพลาดระหว่างการรับยศลงทะเบียน กรุณาติดต่อผู้ดูแลระบบค่ะ";
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: errText, flags: 64 }).catch(() => { });
    } else {
      await interaction.reply({ content: errText, flags: 64 }).catch(() => { });
    }
  }
}

/**
 * Payload สำหรับบอร์ดลงทะเบียนสมาชิกใหม่
 */
function buildRegistrationPanelPayload() {
  return {
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
                  url: REGISTRATION_PANEL_IMAGE_URL
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
                label: "︲ไม่ทำก่อนลงทะเบียน พลาด!",
                emoji: { id: "1396434906057281596", name: "imsupersurprised", animated: false },
                url: "https://discord.com/channels/1144251788493602848/1524122867178930237"
              }
            ]
          }
        ]
      }
    ]
  };
}

/**
 * Payload สำหรับแผงตั้งค่าข้อความต้อนรับของทีมงาน
 */
function buildStaffWelcomePanelPayload() {
  return {
    flags: 32768,
    components: [
      {
        type: 17,
        components: [
          {
            type: 12,
            items: [
              {
                media: {
                  url: "https://media.discordapp.net/attachments/1524704267015819274/1531288461514899637/NewsBoard_-_bearcafe_15.png?ex=6a68ab03&is=6a675983&hm=6d63d26048c723f924163c4194ec811b26d169897840392fdf606ef9b209126d&=&format=webp&quality=lossless"
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
            content: "## <:bee20000:1256669436350562355>︲__` 𝖲𝖾𝗍 𝗆𝖾𝗌𝗌𝖺𝗀𝖾 ₊ ตั้งค่าข้อความต้อนรับ 𓂃 `__"
          },
          {
            type: 1,
            components: [
              {
                style: 3,
                type: 2,
                label: "︲แก้ไขข้อความของคุณ",
                emoji: {
                  id: "1372837492205555812",
                  name: "3602exclamationmarkbubble",
                  animated: true
                },
                flow: {
                  actions: []
                },
                custom_id: "p_328884649147240449"
              }
            ]
          }
        ]
      }
    ]
  };
}

/**
 * Feature initialization function
 * @param {Client} client 
 */
function setupVerification(client) {
  // ── 1. Event: guildMemberAdd ─────────────────────────────────────
  client.on(Events.GuildMemberAdd, async (member) => {
    try {
      const channel = member.guild.channels.cache.get(VERIFY_CHANNEL_ID) ||
        await member.guild.channels.fetch(VERIFY_CHANNEL_ID).catch(() => null);
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
        const payload = buildRegistrationPanelPayload();
        await message.channel.send(payload);
        // Delete setup command
        try {
          await message.delete();
        } catch (e) { }

      } catch (err) {
        console.error("[verification] Failed to send registration panel:", err);
      }
    }

    if (message.content.trim() === "b!reset-staff") {
      // Check if Owner only
      const isOwner = message.author.id === message.guild.ownerId;

      if (!isOwner) {
        return message.reply({
          content: "❌ คำสั่งนี้สามารถใช้งานได้เฉพาะเจ้าของเซิร์ฟเวอร์ (Owner) เท่านั้นค่ะ"
        });
      }

      try {
        const payload = buildStaffWelcomePanelPayload();
        await message.channel.send(payload);
        try {
          await message.delete();
        } catch (e) { }
      } catch (err) {
        console.error("[verification] Failed to send reset-staff panel:", err);
      }
    }
  });

  function prepareNotesForModal(notes) {
    if (!notes) return "";
    let trimmed = notes.trim();
    if (trimmed.length <= 100) return trimmed;
    let sliced = trimmed.slice(0, 100);
    sliced = sliced.replace(/<a?:?[a-zA-Z0-9_]*$/, "").trim();
    return sliced;
  }

  // ── 3. Event: interactionCreate (Buttons, Select Menus, Modals) ───────
  client.on(Events.InteractionCreate, async (interaction) => {
    try {
      // ─── Button: แก้ไขข้อความของคุณ (p_328884649147240449) ─────────────
      if (interaction.isButton() && interaction.customId === "p_328884649147240449") {
        const DEFAULT_WELCOME_NOTES = "ยินดีต้อนรับนะ ขอให้เธอได้เจอเพื่อนดี ๆ มีความสุข สนุกกับทุกช่วงเวลา และสมหวังในทุกสิ่งที่ตั้งใจ";
        let currentNotes = DEFAULT_WELCOME_NOTES;

        try {
          const { data: staffData, error: dbErr } = await supabase
            .from("staff_members")
            .select("notes, updated_at")
            .eq("discord_id", interaction.user.id)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (dbErr) {
            console.error("[verification] DB Error fetching staff notes for modal:", dbErr.message);
          }

          if (staffData && staffData.notes && staffData.notes.trim().length > 0) {
            currentNotes = staffData.notes.trim();
          }
        } catch (e) {
          console.error("[verification] Error fetching staff notes for modal:", e);
        }

        const modal = new ModalBuilder()
          .setCustomId("modal_staff_welcome_notes")
          .setTitle("ตั้งค่าข้อความต้อนรับ");

        const notesInput = new TextInputBuilder()
          .setCustomId("staff_notes_input")
          .setLabel("ข้อความต้อนรับของคุณ (10-100 ตัวอักษร)")
          .setStyle(TextInputStyle.Paragraph)
          .setPlaceholder("กรอกข้อความต้อนรับ...")
          .setMinLength(10)
          .setMaxLength(100)
          .setRequired(true);

        const safeNotes = prepareNotesForModal(currentNotes);
        if (safeNotes) {
          notesInput.setValue(safeNotes);
        }

        const row = new ActionRowBuilder().addComponents(notesInput);
        modal.addComponents(row);

        return await interaction.showModal(modal);
      }

      // ─── Modal Submit: แก้ไขข้อความต้อนรับของ staff ─────────────
      if (interaction.isModalSubmit() && interaction.customId === "modal_staff_welcome_notes") {
        const newNotes = interaction.fields.getTextInputValue("staff_notes_input").trim();

        if (newNotes.length < 10 || newNotes.length > 100) {
          return interaction.reply({
            content: "❌ ข้อความต้อนรับต้องมีความยาวระหว่าง 10 ถึง 100 ตัวอักษรค่ะ",
            flags: 64
          });
        }

        const { data: staffRows, error: fetchErr } = await supabase
          .from("staff_members")
          .select("id")
          .eq("discord_id", interaction.user.id);

        if (fetchErr) {
          console.error("[verification] DB Error checking staff_member:", fetchErr);
          return interaction.reply({
            content: "❌ เกิดข้อผิดพลาดในการเชื่อมต่อฐานข้อมูล กรุณาลองใหม่อีกครั้งค่ะ",
            flags: 64
          });
        }

        if (staffRows && staffRows.length > 0) {
          const { error: updateErr } = await supabase
            .from("staff_members")
            .update({ notes: newNotes, updated_at: new Date().toISOString() })
            .eq("discord_id", interaction.user.id);

          if (updateErr) {
            console.error("[verification] DB Error updating staff notes:", updateErr);
            return interaction.reply({
              content: "❌ บันทึกข้อมูลไม่สำเร็จ เกิดข้อผิดพลาดจากระบบฐานข้อมูลค่ะ",
              flags: 64
            });
          }
        } else {
          // หากยังไม่มีแถวใน staff_members ให้เพิ่มแถวใหม่ให้อัตโนมัติ
          const { error: insertErr } = await supabase
            .from("staff_members")
            .insert({
              discord_id: interaction.user.id,
              nickname: interaction.member?.displayName || interaction.user.username,
              notes: newNotes,
              status: "Active",
              updated_at: new Date().toISOString()
            });

          if (insertErr) {
            console.error("[verification] DB Error inserting staff notes:", insertErr);
            return interaction.reply({
              content: "❌ บันทึกข้อมูลไม่สำเร็จ เกิดข้อผิดพลาดจากระบบฐานข้อมูลค่ะ",
              flags: 64
            });
          }
        }

        const successPayload = {
          flags: 32768 | 64, // Ephemeral V2
          components: [
            {
              type: 17,
              components: [
                { type: 14, spacing: 2 },
                {
                  type: 10,
                  content: `## <:50121checkmark:1358584609087946867>︲__\` ตั้งค่าข้อความต้อนรับสำเร็จ \`__\nบันทึกข้อความต้อนรับของคุณเป็น:\n**${newNotes}**\nเรียบร้อยแล้วค่ะ! ✨`
                },
                { type: 14, spacing: 2 }
              ]
            }
          ]
        };

        return interaction.reply(successPayload);
      }

      // ─── Button: ลงทะเบียน ──────────────────────────────────────────
      if (interaction.isButton() && interaction.customId === "p_323843380868026369") {
        if (!interaction.deferred && !interaction.replied) {
          await interaction.deferReply({ flags: 32768 | 64 }).catch(() => { });
        }

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
          return interaction.editReply(payload);
        }

        // 2. Check banned words
        const bannedWord = await checkBannedName(member);
        if (bannedWord) {
          return interaction.editReply({
            content: `❌ ชื่อของคุณมีคำไม่เหมาะสมที่ระบบไม่อนุญาตค่ะ (ตรวจพบคำว่า: **${bannedWord}**)\n\n**กรุณาเปลี่ยนชื่อใหม่ของคุณก่อนกดลงทะเบียนอีกครั้งนะคะ!**\n*หากพบว่าหลังจากเข้ากลุ่มมีการเปลี่ยนชื่อกลับไปเป็นชื่อที่ไม่ดีหรือแฝงคำไม่สุภาพ จะถูกลงโทษตามกฎของเซิร์ฟเวอร์ทันทีค่ะ*`,
            flags: 64 // Ephemeral
          });
        }

        // 3. Send registration options menu directly (ephemeral component v2)
        await interaction.editReply(getRegPanelPayload());
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

          await safeShowModal(interaction, modal);
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

          await safeShowModal(interaction, modal);
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

          await safeUpdate(interaction, bearPayload);
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
      if (err?.code === 10062) {
        console.warn("[verification] Interaction timed out or already expired (10062):", err.message);
      } else {
        console.error("[verification] Interaction error:", err);
      }
    }
  });

  console.log("[verification] ✅ Verification system loaded successfully");
}

module.exports = {
  setupVerification,
  buildRegistrationPanelPayload,
  buildStaffWelcomePanelPayload
};
