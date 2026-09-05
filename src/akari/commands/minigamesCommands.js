// ===================================================
// src/akari/commands/minigamesCommands.js
// ระบบคำสั่งผู้ดูแลระบบสำหรับ Akari Bot (/setup-games, /setting-games, /clear)
// รองรับการตอบกลับด้วย Discord Component V2 (Type 17 Container) ตกแต่งสไตล์ตรงตาม EMOJIS.md
// ===================================================

const {
  ChannelType,
  PermissionFlagsBits,
  MessageFlags,
} = require("discord.js");
const { spawnQuestion, invalidateSettingsCache } = require("../minigames/minigamesEngine");

const FLAG_V2 = MessageFlags.IsComponentsV2 || 32768;

const DEFAULT_ACCESSORY = {
  type: 2,
  style: 5,
  label: "Akari Bot",
  emoji: { name: "🏮" },
  url: "https://discord.com",
};

const AKARI_GAME_NAMES = {
  1: "🎮︲เติมคำศัพท์-ไทย",
  2: "🎮︲เติมคำศัพท์-อังกฤษ",
  3: "🎲︲สุ่มโจทย์คณิต",
  4: "💡︲ทายคำจากคำใบ้",
  5: "🔊︲ฟังเสียงตอบ-อังกฤษ",
  6: "✏️︲พิมพ์ตามคำ-ไทย",
  7: "✏️︲พิมพ์ตามคำ-อังกฤษ",
  8: "🔤︲ทายคำแปล-อังกฤษ",
  9: "🔤︲ทายคำแปล-ไทย",
  10: "🔀︲เกมต่อคำ",
  11: "🔊︲ฟังเสียงตอบ-ไทย",
  12: "⚖️︲จริงหรือเท็จ",
};

const GAME_DESCRIPTIONS = {
  1: "เติมคำศัพท์ภาษาไทยที่ถูกซ่อนอยู่",
  2: "เติมคำศัพท์ภาษาอังกฤษที่ถูกซ่อนอยู่",
  3: "สุ่มโจทย์คณิตศาสตร์ คิดเลขเร็ว",
  4: "ทายคำศัพท์ลับจากคำใบ้ที่กำหนด",
  5: "ฟังเสียงภาษาอังกฤษแล้วพิมพ์ตอบให้ถูกต้อง",
  6: "แข่งพิมพ์ข้อความภาษาไทยตามโจทย์",
  7: "แข่งพิมพ์ข้อความภาษาอังกฤษตามโจทย์",
  8: "ทายคำแปลคำศัพท์ภาษาอังกฤษเป็นไทย",
  9: "ทายคำแปลคำศัพท์ภาษาไทยเป็นอังกฤษ",
  10: "เกมพยางค์ต่อพยางค์",
  11: "ฟังเสียงภาษาไทยแล้วพิมพ์ตอบให้ถูกต้อง",
  12: "ทายข้อความโจทย์ว่าจริงหรือเท็จ",
};

/**
 * ลงทะเบียน Slash Commands สำหรับ Akari Bot เมื่อบอทพร้อม
 * @param {import('discord.js').Client} client 
 */
async function registerAkariCommands(client) {
  client.once("ready", async () => {
    try {
      if (!client.application) return;

      await client.application.commands.set([
        {
          name: "setup-games",
          description: "ติดตั้งระบบมินิเกมอัตโนมัติ สร้างช่องและเริ่มสปอว์นโจทย์ข้อแรกทันที (เฉพาะผู้ดูแลระบบ)",
          default_member_permissions: PermissionFlagsBits.ManageChannels.toString(),
          options: [
            {
              name: "preset",
              description: "เลือกกลุ่มมินิเกมที่ต้องการเปิดใช้งาน",
              type: 3, // STRING
              required: true,
              choices: [
                { name: "🏆 ทุกมินิเกม (เปิดครบทั้ง 12 เกม)", value: "all" },
                { name: "🔥 มินิเกมยอดฮิต (Top 5 Games)", value: "popular" },
                { name: "🔤 เกมเน้นภาษาและความรู้ (Language & Quiz)", value: "language" },
              ],
            },
            {
              name: "category",
              description: "เลือก Category ที่ต้องการให้สร้างช่องมินิเกมไว้ข้างใน (หากไม่เลือกจะสร้างใหม่ให้อัตโนมัติ)",
              type: 7, // CHANNEL
              channel_types: [ChannelType.GuildCategory],
              required: false,
            },
          ],
        },
        {
          name: "setting-games",
          description: "เปิด/ปิด การใช้งานมินิเกมแต่ละเกมย่อยในเซิร์ฟเวอร์ (เฉพาะผู้ดูแลระบบ)",
          default_member_permissions: PermissionFlagsBits.ManageChannels.toString(),
        },
        {
          name: "clear",
          description: "ลบช่องทุกประเภทภายในหมวดหมู่ที่กำหนด (เฉพาะเจ้าของเซิร์ฟเวอร์เท่านั้น)",
          default_member_permissions: PermissionFlagsBits.Administrator.toString(),
          options: [
            {
              name: "category",
              description: "เลือกหมวดหมู่ (Category) ที่ต้องการลบช่องข้างใน",
              type: 7, // CHANNEL
              channel_types: [ChannelType.GuildCategory],
              required: true,
            },
          ],
        },
      ]);

      console.log("🏮 [AkariCommands] ลงทะเบียน Slash Commands (/setup-games, /setting-games, /clear) สำเร็จแล้ว!");
    } catch (e) {
      console.error("❌ [AkariCommands] Register Slash Commands Error:", e.message);
    }
  });
}

/**
 * จัดการคำสั่ง /setup-games (Component V2 - ตกแต่งสไตล์ EMOJIS.md)
 */
async function handleSetupGames(interaction, supabase, client) {
  const { member, guild, options } = interaction;

  if (!member.permissions.has(PermissionFlagsBits.ManageChannels) && !member.permissions.has(PermissionFlagsBits.Administrator)) {
    const errorText = `## <:bear7:1148271118709436416>︲คุณต้องมีสิทธิ์ **จัดการช่อง (Manage Channels)** หรือ **ผู้ดูแลระบบ (Administrator)** เพื่อใช้คำสั่งนี้ <:cuteplant:1152834055528783872>`;
    return interaction.reply({
      flags: FLAG_V2 | MessageFlags.Ephemeral,
      components: [
        {
          type: 17,
          components: [
            {
              type: 9,
              components: [{ type: 10, content: errorText }],
              accessory: DEFAULT_ACCESSORY,
            }
          ]
        }
      ]
    });
  }

  await interaction.deferReply();

  const preset = options.getString("preset");
  const targetCategoryOption = options.getChannel("category");

  let targetCategory = targetCategoryOption;

  if (!targetCategory) {
    try {
      targetCategory = await guild.channels.create({
        name: "🎮 𝖠𝖪𝖠𝖱𝖨 𝖬𝖨𝖭𝖨𝖦𝖠𝖬𝖤𝖲",
        type: ChannelType.GuildCategory,
        reason: "Akari Bot Auto Setup Games Category",
      });
    } catch (e) {
      const errText = `## <:68440x:1358584606911369226>︲ไม่สามารถสร้าง Category ใหม่ได้: ${e.message}`;
      return interaction.editReply({
        flags: FLAG_V2,
        components: [
          {
            type: 17,
            components: [
              {
                type: 9,
                components: [{ type: 10, content: errText }],
                accessory: DEFAULT_ACCESSORY,
              }
            ]
          }
        ]
      });
    }
  }

  let selectedGameIds = [];
  if (preset === "all") {
    selectedGameIds = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
  } else if (preset === "popular") {
    selectedGameIds = [1, 2, 3, 4, 10];
  } else if (preset === "language") {
    selectedGameIds = [1, 2, 5, 8, 9, 11];
  }

  const createdChannelsInfo = [];

  for (const gameId of selectedGameIds) {
    const channelName = AKARI_GAME_NAMES[gameId] || `🎮︲มินิเกม-${gameId}`;
    const topic = GAME_DESCRIPTIONS[gameId] || "มินิเกม Akari Bot";

    try {
      const newChannel = await guild.channels.create({
        name: channelName,
        type: ChannelType.GuildText,
        parent: targetCategory.id,
        topic: `🎮 ${topic} | ขับเคลื่อนโดย Akari Bot 🏮`,
        reason: `Akari Setup Minigame #${gameId}`,
      });

      if (supabase) {
        await supabase.from("tenant_minigame_channels").upsert(
          {
            guild_id: guild.id,
            game_id: gameId,
            channel_id: newChannel.id,
            created_at: new Date().toISOString(),
          },
          { onConflict: "guild_id,game_id" }
        );

        await supabase.from("tenant_minigame_settings").upsert(
          {
            guild_id: guild.id,
            game_id: gameId,
            enabled: true,
            canvas_theme: "cyber",
            points_per_win: 10,
          },
          { onConflict: "guild_id,game_id" }
        );
      }

      await spawnQuestion(client, newChannel, gameId, guild.id, supabase);
      createdChannelsInfo.push(`• **${channelName}** — <#${newChannel.id}>`);
    } catch (e) {
      console.error(`❌ [SetupGames] Error creating channel for game #${gameId}:`, e.message);
    }
  }

  const contentText =
    `### <:bee20000:1256669436350562355>︲__\` 𝖠𝖪𝖠𝖱𝖨 𝖬𝖨𝖭𝖨𝖦𝖠𝖬𝖤𝖲 ₊ ติดตั้งระบบมินิเกมเรียบร้อยแล้ว 𓂃 \`__\n` +
    `📌 **หมวดหมู่ (Category):** **${targetCategory.name}**\n` +
    `🎮 **สร้างและเปิดใช้งานแล้ว:** **${createdChannelsInfo.length}** ช่องมินิเกม\n\n` +
    `${createdChannelsInfo.join("\n")}\n\n` +
    `-# ✨ โจทย์และ Components V2 ข้อแรกถูกส่งลงในช่องเรียบร้อยแล้ว สมาชิกสามารถเริ่มเล่นได้ทันที! ︲ ดำเนินการโดย <@${interaction.user.id}> <:cuteplant:1152834055528783872>`;

  const payload = {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 9,
            components: [{ type: 10, content: contentText }],
            accessory: DEFAULT_ACCESSORY,
          }
        ]
      }
    ]
  };

  return interaction.editReply(payload);
}

/**
 * จัดการคำสั่ง /setting-games (Component V2 - ตกแต่งสไตล์ EMOJIS.md)
 */
async function handleSettingGames(interaction, supabase) {
  const { member, guild } = interaction;

  if (!member.permissions.has(PermissionFlagsBits.ManageChannels) && !member.permissions.has(PermissionFlagsBits.Administrator)) {
    const errorText = `## <:bear7:1148271118709436416>︲คุณต้องมีสิทธิ์ **จัดการช่อง (Manage Channels)** หรือ **ผู้ดูแลระบบ (Administrator)** เพื่อใช้คำสั่งนี้ <:cuteplant:1152834055528783872>`;
    return interaction.reply({
      flags: FLAG_V2 | MessageFlags.Ephemeral,
      components: [
        {
          type: 17,
          components: [
            {
              type: 9,
              components: [{ type: 10, content: errorText }],
              accessory: DEFAULT_ACCESSORY,
            }
          ]
        }
      ]
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  let settingsMap = {};
  if (supabase) {
    const { data } = await supabase
      .from("tenant_minigame_settings")
      .select("game_id, enabled")
      .eq("guild_id", guild.id);

    if (data) {
      data.forEach((row) => {
        settingsMap[row.game_id] = row.enabled;
      });
    }
  }

  const selectOptions = Object.keys(AKARI_GAME_NAMES).map((idStr) => {
    const gId = parseInt(idStr);
    const isEnabled = settingsMap[gId] !== false;
    return {
      label: `${isEnabled ? "🟢" : "🔴"} ${AKARI_GAME_NAMES[gId]}`,
      description: GAME_DESCRIPTIONS[gId],
      value: `toggle_${gId}`,
    };
  });

  const resetOptions = [
    {
      label: "🔄 สปอว์นโจทย์ใหม่ทุกเกมที่เปิดอยู่ (Reset All Games)",
      description: "รีเซ็ตและส่งการ์ดโจทย์ใหม่ลงทุกช่องมินิเกมของเซิร์ฟเวอร์",
      value: "reset_all",
    },
    ...Object.keys(AKARI_GAME_NAMES).map((idStr) => {
      const gId = parseInt(idStr);
      return {
        label: `🔄 รีเซ็ตโจทย์ใหม่: ${AKARI_GAME_NAMES[gId]}`,
        description: `ส่งการ์ดโจทย์ข้อใหม่ลงในช่องมินิเกม #${gId}`,
        value: `reset_${gId}`,
      };
    })
  ];

  const contentText =
    `### <:bee20000:1256669436350562355>︲__\` 𝖠𝖪𝖠𝖱𝖨 𝖲𝖤𝖳𝖳𝖨𝖭𝖦𝖲 ₊ จัดการมินิเกม 𓂃 \`__\n` +
    `# 🟢/🔴 สลับสถานะเปิด-ปิด หรือ 🔄 เลือกสั่งสปอว์นส่งโจทย์ใหม่\n` +
    `-# - เมนูแรก: เลือกมินิเกมเพื่อสลับสถานะเปิด/ปิด ︲ เมนูสอง: เลือกมินิเกมเพื่อสั่งส่งโจทย์ข้อใหม่ทันที <:cuteplant:1152834055528783872>`;

  const payload = {
    flags: FLAG_V2 | MessageFlags.Ephemeral,
    components: [
      {
        type: 17,
        components: [
          {
            type: 9,
            components: [{ type: 10, content: contentText }],
            accessory: DEFAULT_ACCESSORY,
          },
          { type: 14, spacing: 2 },
          {
            type: 1,
            components: [
              {
                type: 3,
                custom_id: "akari_setting_toggle_menu",
                placeholder: "🟢/🔴 เลือกมินิเกมเพื่อสลับสถานะ เปิด / ปิด",
                options: selectOptions
              }
            ]
          },
          { type: 14, spacing: 1 },
          {
            type: 1,
            components: [
              {
                type: 3,
                custom_id: "akari_setting_reset_menu",
                placeholder: "🔄 เลือกมินิเกมเพื่อสั่ง สปอว์น/ส่งโจทย์ใหม่ ทันที",
                options: resetOptions
              }
            ]
          }
        ]
      }
    ]
  };

  return interaction.editReply(payload);
}

/**
 * จัดการ Interaction เมื่อกดเปลี่ยนสถานะเปิด/ปิดใน /setting-games (Component V2 - ตกแต่งสไตล์ EMOJIS.md)
 */
async function handleSettingToggle(interaction, supabase) {
  if (!interaction.isStringSelectMenu() || interaction.customId !== "akari_setting_toggle_menu") return;

  const selectedValue = interaction.values[0];
  if (!selectedValue.startsWith("toggle_")) return;

  const gameId = parseInt(selectedValue.replace("toggle_", ""));
  const guildId = interaction.guild.id;

  let currentEnabled = true;
  if (supabase) {
    const { data } = await supabase
      .from("tenant_minigame_settings")
      .select("enabled")
      .eq("guild_id", guildId)
      .eq("game_id", gameId)
      .maybeSingle();

    if (data && typeof data.enabled === "boolean") {
      currentEnabled = data.enabled;
    }

    const nextEnabled = !currentEnabled;

    await supabase.from("tenant_minigame_settings").upsert(
      {
        guild_id: guildId,
        game_id: gameId,
        enabled: nextEnabled,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "guild_id,game_id" }
    );

    invalidateSettingsCache(guildId);

    const gameName = AKARI_GAME_NAMES[gameId] || `มินิเกม #${gameId}`;
    const statusStr = nextEnabled ? "🟢 เปิดใช้งาน (Enabled)" : "🔴 ปิดใช้งาน (Disabled)";

    const contentText =
      `### <:50121checkmark:1358584609087946867>︲__\` 𝖲𝖤𝖳𝖳𝖨𝖭𝖦 𝖴𝖯𝖣𝖠𝖳𝖤𝖣 𓂃 \`__\n` +
      `# สลับสถานะมินิเกม **${gameName}** ➔ **${statusStr}** เรียบร้อยแล้ว!\n` +
      `-# อัปเดตการตั้งค่าใน Database และล้าง In-Memory Cache เรียบร้อยแล้ว <:cuteplant:1152834055528783872>`;

    return interaction.reply({
      flags: FLAG_V2 | MessageFlags.Ephemeral,
      components: [
        {
          type: 17,
          components: [
            {
              type: 9,
              components: [{ type: 10, content: contentText }],
              accessory: DEFAULT_ACCESSORY,
            }
          ]
        }
      ]
    });
  } else {
    const contentText =
      `### <:68440x:1358584606911369226>︲__\` RAM FALLBACK MODE 𓂃 \`__\n` +
      `# ทำงานในโหมด RAM Fallback ไม่สามารถบันทึกตั้งค่าลง Database ได้`;

    return interaction.reply({
      flags: FLAG_V2 | MessageFlags.Ephemeral,
      components: [
        {
          type: 17,
          components: [
            {
              type: 9,
              components: [{ type: 10, content: contentText }],
              accessory: DEFAULT_ACCESSORY,
            }
          ]
        }
      ]
    });
  }
}

/**
 * จัดการคำสั่ง /clear (เฉพาะเจ้าของเซิร์ฟเวอร์ / Server Owner เท่านั้น)
 */
async function handleClearCategory(interaction, supabase) {
  const { guild, member, options } = interaction;

  // ตรวจสอบสิทธิ์ Server Owner เท่านั้น
  if (interaction.user.id !== guild.ownerId) {
    const noPermText = `## <:bear7:1148271118709436416>︲คำสั่งนี้อนุญาตให้ใช้งานได้เฉพาะ **เจ้าของเซิร์ฟเวอร์ (Server Owner)** เท่านั้นนะคะ <:cuteplant:1152834055528783872>`;
    return interaction.reply({
      flags: FLAG_V2 | MessageFlags.Ephemeral,
      components: [
        {
          type: 17,
          components: [
            {
              type: 9,
              components: [{ type: 10, content: noPermText }],
              accessory: DEFAULT_ACCESSORY,
            }
          ]
        }
      ]
    });
  }

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const targetCategory = options.getChannel("category");

  if (!targetCategory || targetCategory.type !== ChannelType.GuildCategory) {
    const invalidText = `## <:68440x:1358584606911369226>︲กรุณาเลือกหมวดหมู่ (Guild Category) ที่ถูกต้อง`;
    return interaction.editReply({
      flags: FLAG_V2 | MessageFlags.Ephemeral,
      components: [
        {
          type: 17,
          components: [
            {
              type: 9,
              components: [{ type: 10, content: invalidText }],
              accessory: DEFAULT_ACCESSORY,
            }
          ]
        }
      ]
    });
  }

  // Fetch ช่องทั้งหมดใน Guild เพื่อให้ได้ Cache ครบถ้วนที่สุด
  await guild.channels.fetch().catch(() => {});
  const channelsToDelete = guild.channels.cache.filter((c) => c.parentId === targetCategory.id);

  if (channelsToDelete.size === 0) {
    // พยายามลบ Category ที่ว่างเปล่า
    await targetCategory.delete("Akari Bot /clear Category Cleanup").catch(() => {});

    const emptyText =
      `### <:bee20000:1256669436350562355>︲__\` 𝖠𝖪𝖠𝖱𝖨 𝖢𝖫𝖤𝖠𝖱 𓂃 \`__\n` +
      `# ไม่พบช่องประเภทใดๆ อยู่ในหมวดหมู่ **${targetCategory.name}**\n` +
      `-# ลบหมวดหมู่ที่ว่างเปล่าออกเรียบร้อยแล้ว <:cuteplant:1152834055528783872>`;

    return interaction.editReply({
      flags: FLAG_V2 | MessageFlags.Ephemeral,
      components: [
        {
          type: 17,
          components: [
            {
              type: 9,
              components: [{ type: 10, content: emptyText }],
              accessory: DEFAULT_ACCESSORY,
            }
          ]
        }
      ]
    });
  }

  const startTime = Date.now();
  const totalChannels = channelsToDelete.size;
  let deletedCount = 0;
  let failedCount = 0;

  const channelList = Array.from(channelsToDelete.values());

  for (let i = 0; i < channelList.length; i++) {
    const ch = channelList[i];

    // แสดงผลความคืบหน้า (Progress UI)
    const progressText =
      `### <:bee20000:1256669436350562355>︲__\` 𝖠𝖪𝖠𝖱𝖨 𝖢𝖫𝖤𝖠𝖱 ₊ กำลังลบช่องในหมวดหมู่ . . . 𓂃 \`__\n` +
      `📌 **หมวดหมู่ (Category):** **${targetCategory.name}**\n` +
      `⏳ **ความคืบหน้า:** \`${deletedCount}/${totalChannels}\` ช่อง (\`${Math.round((deletedCount / totalChannels) * 100)}%\`)\n` +
      `🗑️ **กำลังลบ:** **${ch.name}**\n\n` +
      `-# 🛡️ มีการหน่วงเวลา 1.2 วินาทีต่อช่อง เพื่อป้องกัน Discord API Rate Limit ︲ <a:7596clock:1160230591892029510>`;

    await interaction.editReply({
      flags: FLAG_V2 | MessageFlags.Ephemeral,
      components: [
        {
          type: 17,
          components: [
            {
              type: 9,
              components: [{ type: 10, content: progressText }],
              accessory: DEFAULT_ACCESSORY,
            }
          ]
        }
      ]
    }).catch(() => {});

    // ลบช่องทาง Discord
    try {
      await ch.delete("Akari Bot /clear Category Cleanup");
      deletedCount++;

      // ล้างข้อมูลใน Supabase DB (ถ้ามี)
      if (supabase) {
        try {
          const { data: chRow } = await supabase
            .from("tenant_minigame_channels")
            .select("game_id")
            .eq("guild_id", guild.id)
            .eq("channel_id", ch.id)
            .maybeSingle();

          if (chRow && chRow.game_id) {
            await supabase
              .from("tenant_minigame_settings")
              .delete()
              .eq("guild_id", guild.id)
              .eq("game_id", chRow.game_id);
          }

          await supabase.from("tenant_minigame_channels").delete().eq("channel_id", ch.id);
          await supabase.from("tenant_minigame_active_sessions").delete().eq("guild_id", guild.id).eq("channel_id", ch.id);
          invalidateSettingsCache(guild.id);
        } catch (_) {}
      }
    } catch (err) {
      console.error(`❌ [ClearCategory] Error deleting channel ${ch.name} (${ch.id}):`, err.message);
      failedCount++;
    }

    // หน่วงเวลา 1.2 วินาทีต่อช่องเพื่อป้องกัน Discord API Rate Limits (429)
    await new Promise((r) => setTimeout(r, 1200));
  }

  // ลบหมวดหมู่ (Category) หลังจากลบช่องภายในทั้งหมดเรียบร้อยแล้ว
  await targetCategory.delete("Akari Bot /clear Category Cleanup").catch(() => {});

  const timeTakenSeconds = Math.max(1, Math.round((Date.now() - startTime) / 1000));

  const completedText =
    `### <:50121checkmark:1358584609087946867>︲__\` 𝖠𝖪𝖠𝖱𝖨 𝖢𝖫𝖤𝖠𝖱 ₊ เคลียร์หมวดหมู่สำเร็จเรียบร้อย 𓂃 \`__\n` +
    `📌 **หมวดหมู่เดิม:** **${targetCategory.name}**\n` +
    `🗑️ **ลบช่องสำเร็จทั้งหมด:** **${deletedCount}** ช่อง ${failedCount > 0 ? `(ล้มเหลว: ${failedCount})` : ''}\n` +
    `⏱️ **เวลาที่ใช้:** **${timeTakenSeconds}** วินาที\n\n` +
    `-# ✨ ลบช่องทุกประเภทในหมวดหมู่ และล้างข้อมูลตั้งค่าเรียบร้อยแล้ว ︲ ดำเนินการโดย <@${interaction.user.id}> <:cuteplant:1152834055528783872>`;

  return interaction.editReply({
    flags: FLAG_V2 | MessageFlags.Ephemeral,
    components: [
      {
        type: 17,
        components: [
          {
            type: 9,
            components: [{ type: 10, content: completedText }],
            accessory: DEFAULT_ACCESSORY,
          }
        ]
      }
    ]
  });
}

/**
 * จัดการ Interaction เมื่อกดสั่งสปอว์น/รีเซ็ตโจทย์ใหม่ใน /setting-games
 */
async function handleSettingReset(interaction, supabase, client) {
  if (!interaction.isStringSelectMenu() || interaction.customId !== "akari_setting_reset_menu") return;

  const selectedValue = interaction.values[0];
  if (!selectedValue.startsWith("reset_")) return;

  const guild = interaction.guild;
  const guildId = guild.id;

  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  if (selectedValue === "reset_all") {
    let resetCount = 0;
    if (supabase) {
      const { data: channels } = await supabase
        .from("tenant_minigame_channels")
        .select("game_id, channel_id")
        .eq("guild_id", guildId);

      if (Array.isArray(channels)) {
        for (const row of channels) {
          const channel = await client.channels.fetch(row.channel_id).catch(() => null);
          if (channel) {
            await spawnQuestion(client, channel, row.game_id, guildId, supabase);
            resetCount++;
          }
        }
      }
    }

    const contentText =
      `### <:50121checkmark:1358584609087946867>︲__\` 𝖦𝖠𝖬𝖤𝖲 𝖱𝖤𝖲𝖤𝖳 𝖲𝖴𝖢𝖢𝖤𝖲𝖲 𓂃 \`__\n` +
      `# รีเซ็ตและส่งการ์ดโจทย์ใหม่ลงทุกช่องมินิเกมสำเร็จ! (**${resetCount}** ช่อง)\n` +
      `-# ผู้เล่นสามารถเริ่มเล่นและตอบคำถามข้อใหม่ในทุกช่องได้ทันที <:cuteplant:1152834055528783872>`;

    return interaction.editReply({
      flags: FLAG_V2 | MessageFlags.Ephemeral,
      components: [
        {
          type: 17,
          components: [
            {
              type: 9,
              components: [{ type: 10, content: contentText }],
              accessory: DEFAULT_ACCESSORY,
            }
          ]
        }
      ]
    });
  } else {
    const gameId = parseInt(selectedValue.replace("reset_", ""));
    const gameName = AKARI_GAME_NAMES[gameId] || `มินิเกม #${gameId}`;
    let success = false;

    if (supabase) {
      const { data: row } = await supabase
        .from("tenant_minigame_channels")
        .select("channel_id")
        .eq("guild_id", guildId)
        .eq("game_id", gameId)
        .maybeSingle();

      if (row && row.channel_id) {
        const channel = await client.channels.fetch(row.channel_id).catch(() => null);
        if (channel) {
          await spawnQuestion(client, channel, gameId, guildId, supabase);
          success = true;
        }
      }
    }

    const contentText = success
      ? `### <:50121checkmark:1358584609087946867>︲__\` 𝖦𝖠𝖬𝖤 𝖱𝖤𝖲𝖤𝖳 𝖲𝖴𝖢𝖢𝖤𝖲𝖲 𓂃 \`__\n` +
        `# รีเซ็ตและส่งการ์ดโจทย์ใหม่สำหรับ **${gameName}** สำเร็จ!\n` +
        `-# ส่งข้อความโจทย์ข้อใหม่ลงในช่องมินิเกมเรียบร้อยแล้ว <:cuteplant:1152834055528783872>`
      : `### <:68440x:1358584606911369226>︲__\` 𝖢𝖧𝖠𝖭𝖭𝖤𝖫 𝖭𝖮𝖳 𝖥𝖮𝖴𝖭𝖖 𓂃 \`__\n` +
        `# ไม่พบช่องทางสำหรับ **${gameName}** ในเซิร์ฟเวอร์นี้ (กรุณารัน /setup-games ก่อน)`;

    return interaction.editReply({
      flags: FLAG_V2 | MessageFlags.Ephemeral,
      components: [
        {
          type: 17,
          components: [
            {
              type: 9,
              components: [{ type: 10, content: contentText }],
              accessory: DEFAULT_ACCESSORY,
            }
          ]
        }
      ]
    });
  }
}

module.exports = {
  registerAkariCommands,
  handleSetupGames,
  handleSettingGames,
  handleSettingToggle,
  handleSettingReset,
  handleClearCategory,
};
