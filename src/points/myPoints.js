const { getSupabaseClient } = require('../services/supabaseClient');
const { MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const cfg = require('./settingCheckIn.json');
const sharedConfig = require('../sharedSettings.json');
cfg.role_blacklist = sharedConfig.role_blacklist;
const { blacklistPayload } = require('../features/shared/tarotComponents');

const FLAG_V2 = 32768; // MessageFlags.IsComponentsV2
const FLAG_EPHEMERAL = 64; // MessageFlags.Ephemeral

const { getTodayBangkok, getDailyCap, getDailyResetTimestamp } = require('../utils/pointManager');

function getMaxPoints(member) {
  let maxPoints = cfg.DEFAULT_CAP;
  if (!member || !member.roles) return maxPoints;
  for (const [roleId, cap] of Object.entries(cfg.ROLE_CAPS)) {
    if (member.roles.cache.has(roleId)) {
      if (cap > maxPoints) maxPoints = cap;
    }
  }
  return maxPoints;
}

async function getUserData(supabase, userId, member = null) {
  const { data } = await supabase
    .from('user_points')
    .select('points, cakes, daily_points, last_reset_date')
    .eq('discord_id', userId)
    .maybeSingle();

  let points = data?.points ?? 0;
  let cakes = data?.cakes ?? 0;
  const today = getTodayBangkok();
  let dailyPoints = (data?.last_reset_date === today) ? (data?.daily_points ?? 0) : 0;

  if (member) {
    const maxPoints = getMaxPoints(member);
    if (points > maxPoints) {
      points = maxPoints;
      await supabase
        .from('user_points')
        .update({ points: maxPoints })
        .eq('discord_id', userId);
      console.log(`[myPoints] User ${userId} points (${data?.points}) exceeded max cap (${maxPoints}). Automatically capped to ${maxPoints}.`);
    }
  }

  return {
    points,
    cakes,
    dailyPoints
  };
}

function buildMainPayload(interaction, points, cakes, maxPoints, page = 1, dailyPoints = 0) {
  const avatarUrl = interaction.member.displayAvatarURL({ extension: 'png', size: 128 });
  const username = interaction.user.displayName || interaction.user.username;
  const cakeUrl = cfg.cake_images[Math.min(cakes, 4)];
  const dailyCap = getDailyCap(maxPoints);
  const resetTimestamp = getDailyResetTimestamp();

  const options = [];
  const rolesList = page === 1 ? cfg.roles_exchange : cfg.roles_exchange_page2;

  for (const role of rolesList) {
    const roleName = interaction.guild?.roles.cache.get(role.id)?.name || 'Unknown Role';
    const hasEmoji = role.emoji_id && (interaction.guild?.emojis.cache.has(role.emoji_id) || interaction.client?.emojis.cache.has(role.emoji_id));
    const emojiObj = hasEmoji
      ? { id: role.emoji_id, name: role.emoji_name, animated: false }
      : { name: "🎀" };

    options.push({
      label: roleName,
      value: role.id,
      emoji: emojiObj
    });
  }

  // add pagination option
  if (page === 1) {
    options.push({
      label: "คลิกเพื่อดูยศอีก 6 . . .",
      value: "next_page",
      emoji: { id: "1150845686628229151", name: "rollingstar", animated: true }
    });
  }

  let claimButton = {};
  if (cakes >= 4) {
    claimButton = {
      style: 1, type: 2, custom_id: "mypoints_claim_max", disabled: true,
      label: "︲คุณสามารถแลกยศได้แล้ว", emoji: { name: "⬆️" }
    };
  } else if (points < 750) {
    claimButton = {
      style: 4, type: 2, custom_id: "mypoints_claim_not_enough", disabled: true,
      label: `︲ขาดอีก ${(750 - points).toLocaleString()} แต้มเพื่อแลกเค้ก`,
      emoji: { id: "1358584606911369226", name: "68440x", animated: false }
    };
  } else {
    claimButton = {
      style: 3, type: 2, custom_id: `mypoints_claim_cake_${interaction.user.id}`, disabled: false,
      label: "︲แต้มครบ! คลิกเพื่อแลกเค้ก",
      emoji: { id: "1358584609087946867", name: "50121checkmark", animated: false }
    };
  }

  return {
    flags: FLAG_V2,
    components: [{
      type: 17,
      components: [
        { type: 12, items: [{ media: { url: cakeUrl } }] },
        { type: 14, spacing: 2 },
        {
          type: 9,
          components: [{
            type: 10,
            content: `## <:bagpack_icon:1522154708200849449>︲__\` 𝖬𝗒 𝗉𝗈𝗂𝗇𝗍𝗌 ₊ ${username} \`__\n-# สะสมเค้กครบ 4 ชิ้น รับฟรี 1 ยศ เลือกได้จากคลังยศกว่า **30 ยศ** เปลี่ยนสไตล์ให้โปรไฟล์ของคุณได้ตามใจ พร้อมสะสมต่อเพื่อปลดล็อกรางวัลอีกมากมาย <:cuteplant:1152834055528783872>\n\n> <:bee20000:1256669436350562355>︰แต้มตอนนี้ของคุณ \`${points.toLocaleString()}\` / \`${maxPoints.toLocaleString()}\`\n> <a:7596clock:1160230591892029510>︰แต้มรับวันนี้ \`${dailyPoints.toLocaleString()}\` / \`${dailyCap.toLocaleString()}\` แต้ม (รีเซ็ตใน <t:${resetTimestamp}:R>)\n> <a:59217leaf:1512014878796152862>︰สะสมแต้ม <:strawberryv2:1520439075100688614> **750 แต้ม** เพื่อรับเค้ก <:cake_point:1522152896035033098> **1 ชิ้น** สำหรับแลกยศฟรี!`
          }],
          accessory: { type: 11, media: { url: avatarUrl } }
        },
        { type: 14, spacing: 2 },
        {
          type: 1,
          components: [{
            type: 3,
            custom_id: `mypoints_role_select_${interaction.user.id}`,
            options: options,
            placeholder: "🐻︲เลือกยศที่ต้องการแลก",
            min_values: 1, max_values: 1, disabled: false
          }]
        },
        { type: 14, divider: false },
        {
          type: 1,
          components: [
            claimButton,
            {
              type: 2,
              style: 1,
              custom_id: `mypoints_open_redeem_modal_${interaction.user.id}`,
              label: "︲กรอกโค้ดรับรางวัล",
              emoji: { id: "1276130500410605609", name: "68492gift", animated: false }
            },
            { type: 2, style: 5, label: "︲สุ่มรางวัลเช็กอิน (ฟรี)", emoji: { id: "1301541277992485005", name: "secret_box", animated: true }, url: "https://discord.com/channels/1144251788493602848/1524122838775238777" }
          ]
        }
      ]
    }]
  };
}

const { registerCommand, registerButton, registerSelectMenu, registerModal } = require('../interactions/router');

function setupMyPoints(client) {
  const supabase = getSupabaseClient();

  // ── จัดการ Slash Command ──────────────────────────────────────────
  registerCommand('แต้มของฉัน', async (interaction) => {
    if (interaction.channelId !== '1524123727724417276') {
      return interaction.reply({ content: 'คำสั่งนี้ใช้ได้เฉพาะห้อง <#1524123727724417276> เท่านั้นนะคะ', flags: FLAG_EPHEMERAL });
    }

    const isBlacklisted = cfg.role_blacklist.some(id => interaction.member.roles.cache.has(id));
    if (isBlacklisted) {
      return interaction.reply(blacklistPayload(interaction.user.id));
    }

    const userId = interaction.user.id;
    const { points, cakes, dailyPoints } = await getUserData(supabase, userId, interaction.member);
    const maxPoints = getMaxPoints(interaction.member);

    const payload = buildMainPayload(interaction, points, cakes, maxPoints, 1, dailyPoints);
    await interaction.reply(payload);
  });

  // ── จัดการกดปุ่มแลกเค้ก ───────────────────────────────────────────
  registerButton('mypoints_claim_cake_', async (interaction) => {
    const ownerId = interaction.customId.replace('mypoints_claim_cake_', '');
    const userId = interaction.user.id;

    if (userId !== ownerId) {
      return interaction.reply({ content: '## <:bear7:1148271118709436416>︲ปุ่มนี้กดได้เฉพาะเจ้าของคำสั่งเท่านั้นนะคะ ꒰⑅ᵕ༚ᵕ꒱˖\u2661', flags: FLAG_EPHEMERAL });
    }

    let { points, cakes } = await getUserData(supabase, userId, interaction.member);
    const maxPoints = getMaxPoints(interaction.member);

    if (cakes >= 4 || points < 750) {
      return interaction.reply({ content: "## <:cat5:1297905123498000394> แหนะ เห็นนะ จะขี้โกงหรอ แต้มเธอไม่พอให้แลกนะคะ", flags: FLAG_EPHEMERAL });
    }

    const isSuccess = Math.random() < 0.85;

    if (isSuccess) {
      points -= 750;
      cakes += 1;
      await supabase.from('user_points').upsert({ discord_id: userId, points, cakes }, { onConflict: 'discord_id' });
      const payload = buildMainPayload(interaction, points, cakes, maxPoints, 1);
      await interaction.update(payload);
    } else {
      // 15% fail
      const refund = Math.floor(Math.random() * (375 - 100 + 1)) + 100;
      points = points - 750 + refund;
      await supabase.from('user_points').upsert({ discord_id: userId, points }, { onConflict: 'discord_id' });

      let payload = buildMainPayload(interaction, points, cakes, maxPoints, 1);

      // Replace content for failure
      payload.components[0].components[0].items[0].media.url = "https://cdn.discordapp.com/attachments/1524704267015819274/1524741224517472406/425f72edbda608d3.png";

      payload.components[0].components[2].components[0].content = payload.components[0].components[2].components[0].content.replace(
        "> <a:59217leaf:1512014878796152862>︰สะสมแต้ม <:strawberryv2:1520439075100688614> **750 แต้ม** เพื่อรับเค้ก <:cake_point:1522152896035033098> **1 ชิ้น** สำหรับแลกยศฟรี!",
        `> <a:59217leaf:1512014878796152862>︰คุณแลกเค้กไม่สำเร็จ แต่ได้รับแต้มคืน <:strawberryv2:1520439075100688614> **${refund.toLocaleString()} แต้ม** ลองใหม่อีกครั้งนะ!`
      );

      await interaction.update(payload);
    }
  });

  // ── จัดการเลือกยศจาก Select Menu ────────────────────────────────────
  registerSelectMenu('mypoints_role_select_', async (interaction) => {
    const ownerId = interaction.customId.replace('mypoints_role_select_', '');
    const userId = interaction.user.id;

    if (userId !== ownerId) {
      return interaction.reply({ content: '## <:bear7:1148271118709436416>︲เมนูนี้ใช้ได้เฉพาะเจ้าของคำสั่งเท่านั้นนะคะ ꒰⑅ᵕ༚ᵕ꒱˖♡', flags: FLAG_EPHEMERAL });
    }

    const selectedValue = interaction.values[0];

    if (selectedValue === 'next_page') {
      const optionsPage2 = [];
      for (const role of cfg.roles_exchange_page2) {
        const roleName = interaction.guild?.roles.cache.get(role.id)?.name || 'Unknown Role';
        const hasEmoji = role.emoji_id && (interaction.guild?.emojis.cache.has(role.emoji_id) || interaction.client?.emojis.cache.has(role.emoji_id));
        const emojiObj = hasEmoji
          ? { id: role.emoji_id, name: role.emoji_name, animated: false }
          : { name: "🎀" };

        optionsPage2.push({
          label: roleName,
          value: role.id,
          emoji: emojiObj
        });
      }
      const payload = {
        flags: FLAG_V2 | FLAG_EPHEMERAL,
        components: [{
          type: 17,
          components: [
            { type: 14, spacing: 2 },
            {
              type: 1,
              components: [{
                type: 3,
                custom_id: `mypoints_role_select_${ownerId}`,
                options: optionsPage2,
                placeholder: "🐻︲เลือกยศที่ต้องการแลก",
                min_values: 1, max_values: 1, disabled: false
              }]
            },
            { type: 14, spacing: 2 }
          ]
        }]
      };
      return interaction.reply(payload);
    }

    const roleId = selectedValue;
    const { cakes } = await getUserData(supabase, userId);

    if (cakes < 4) {
      return interaction.reply({ content: "## <:bear7:1148271118709436416>︲เค้กของคุณไม่พอ", flags: FLAG_EPHEMERAL });
    }

    if (interaction.member.roles.cache.has(roleId)) {
      return interaction.reply({ content: `## <:bear7:1148271118709436416>︲คุณมียศ <@&${roleId}> แล้วน้า ลองแลกยศอื่นดูนะคะ ꒰⑅ᵕ༚ᵕ꒱˖♡`, flags: FLAG_EPHEMERAL });
    }

    // Show confirmation prompt
    const confirmPayload = {
      flags: FLAG_V2 | FLAG_EPHEMERAL,
      components: [{
        type: 17,
        components: [
          { type: 14, spacing: 2 },
          {
            type: 10,
            content: `## <:bee20000:1256669436350562355>︲ต้องการแลกยศ <@&${roleId}> หรือไม่?\nเมื่อยืนยันการแลกแล้ว <:cake_point:1522152896035033098> เค้กทั้งหมดของคุณจะถูกใช้จนเหลือ **0 ชิ้น** และไม่สามารถยกเลิกหรือขอคืนได้ กรุณาตรวจสอบให้แน่ใจก่อนดำเนินการ <:cuteplant:1152834055528783872>\n`
          },
          { type: 14, spacing: 2 },
          {
            type: 1,
            components: [
              { style: 3, type: 2, custom_id: `mypoints_confirm_${roleId}`, label: "︲ยืนยัน", emoji: { id: "1358584609087946867", name: "50121checkmark", animated: false } },
              { style: 4, type: 2, custom_id: "mypoints_cancel", disabled: true, label: "ยกเลิกโดยกดคำว่า \"ปิดข้อความ\"" }
            ]
          }
        ]
      }]
    };
    await interaction.reply(confirmPayload);
  });

  // ── จัดการยืนยันแลกยศ ──────────────────────────────────────────────
  registerButton('mypoints_confirm_', async (interaction) => {
    const roleId = interaction.customId.replace('mypoints_confirm_', '');
    const userId = interaction.user.id;

    const { cakes } = await getUserData(supabase, userId);
    if (cakes < 4) {
      return interaction.reply({ content: "## <:bear7:1148271118709436416>︲เค้กของคุณไม่พอ", flags: FLAG_EPHEMERAL });
    }

    if (interaction.member.roles.cache.has(roleId)) {
      return interaction.reply({ content: `## <:bear7:1148271118709436416>︲คุณมียศ <@&${roleId}> แล้วน้า ลองแลกยศอื่นดูนะคะ ꒰⑅ᵕ༚ᵕ꒱˖♡`, flags: FLAG_EPHEMERAL });
    }

    try {
      await interaction.member.roles.add(roleId);
      await supabase.from('user_points').update({ cakes: 0 }).eq('discord_id', userId);

      const successPayload = {
        flags: FLAG_V2 | FLAG_EPHEMERAL,
        components: [{
          type: 17,
          components: [
            { type: 14, spacing: 2 },
            {
              type: 10,
              content: `## <:bee20000:1256669436350562355>︲__\` 𝖲𝗎𝖼𝖼𝖾𝖾𝖽 ₊ แลกยศเรียบร้อย \`__\nยินดีด้วย! ได้รับยศ <@&${roleId}> เรียบร้อยแล้ว อย่าลืมเอาไปอวดเพื่อน ๆ ด้วยนะคะ ส่วนเค้กทั้งหมดของคุณ หมีขอแอบหยิบไปกินจนเหลือ **0 ชิ้น** แล้วน้า~ <:cuteplant:1152834055528783872>`
            },
            { type: 14, spacing: 2 }
          ]
        }]
      };
      await interaction.update(successPayload);
    } catch (err) {
      console.error('[myPoints] Error giving role:', err.message);
      await interaction.reply({ content: "เกิดข้อผิดพลาดในการมอบยศ โปรดลองอีกครั้ง", flags: FLAG_EPHEMERAL });
    }
  });

  // ── จัดการกดปุ่มเปิด Modal กรอกโค้ดรับรางวัล ───────────────────────
  registerButton('mypoints_open_redeem_modal_', async (interaction) => {
    const ownerId = interaction.customId.replace('mypoints_open_redeem_modal_', '');
    const userId = interaction.user.id;

    if (userId !== ownerId) {
      return interaction.reply({
        content: '## <:bear7:1148271118709436416>︲ปุ่มนี้กดได้เฉพาะเจ้าของคำสั่งเท่านั้นนะคะ ꒰⑅ᵕ༚ᵕ꒱˖♡',
        flags: FLAG_EPHEMERAL
      });
    }

    const modal = new ModalBuilder()
      .setCustomId(`mypoints_redeem_modal_${interaction.user.id}`)
      .setTitle("🎁 กรอกโค้ดรับรางวัล");

    const codeInput = new TextInputBuilder()
      .setCustomId("redeem_code_input")
      .setLabel("ระบุโค้ดรางวัล (Redeem Code)")
      .setStyle(TextInputStyle.Short)
      .setPlaceholder("เช่น BEARCAFE2026")
      .setMinLength(2)
      .setMaxLength(32)
      .setRequired(true);

    modal.addComponents(new ActionRowBuilder().addComponents(codeInput));
    await interaction.showModal(modal);
  });

  // ── จัดการส่งฟอร์ม Modal กรอกโค้ดรับรางวัล ────────────────────────
  registerModal('mypoints_redeem_modal_', async (interaction) => {
    const ownerId = interaction.customId.replace('mypoints_redeem_modal_', '');
    const userId = interaction.user.id;

    if (userId !== ownerId) {
      return interaction.reply({
        content: '## <:bear7:1148271118709436416>︲ฟอร์มนี้กดได้เฉพาะเจ้าของคำสั่งเท่านั้นนะคะ ꒰⑅ᵕ༚ᵕ꒱˖♡',
        flags: FLAG_EPHEMERAL
      });
    }

    const isBlacklisted = cfg.role_blacklist.some(id => interaction.member?.roles?.cache?.has(id));
    if (isBlacklisted) {
      return interaction.reply(blacklistPayload(userId));
    }

    const code = interaction.fields.getTextInputValue('redeem_code_input')?.trim()?.toUpperCase();
    if (!code) {
      return interaction.reply({
        flags: FLAG_V2 | FLAG_EPHEMERAL,
        components: [{
          type: 17,
          components: [
            {
              type: 10,
              content: '## ❌︲__` กรุณาระบุโค้ดรางวัล `__\n- คุณยังไม่ได้กรอกโค้ดรางวัล กรุณาลองใหม่อีกครั้งค่ะ'
            }
          ]
        }]
      });
    }

    try {
      const { data: codeData, error: codeErr } = await supabase
        .from('redeem_codes')
        .select('*')
        .eq('code', code)
        .maybeSingle();

      if (codeErr) {
        console.error('[myPoints] Error fetching redeem code:', codeErr.message);
        return interaction.reply({
          flags: FLAG_V2 | FLAG_EPHEMERAL,
          components: [{
            type: 17,
            components: [
              {
                type: 10,
                content: '## ❌︲__` เกิดข้อผิดพลาดในระบบ `__\n- ไม่สามารถตรวจสอบโค้ดได้ในขณะนี้ กรุณาลองใหม่ภายหลังค่ะ'
              }
            ]
          }]
        });
      }

      // 2.1 ไม่พบโค้ดในระบบ
      if (!codeData) {
        return interaction.reply({
          flags: FLAG_V2 | FLAG_EPHEMERAL,
          components: [{
            type: 17,
            components: [
              {
                type: 10,
                content: `## ❌︲__\` ไม่พบโค้ดนี้ในระบบ \`__\n- โค้ด \`"${code}"\` ไม่ถูกต้องหรือไม่มีอยู่ในระบบค่ะ\n- รบกวนตรวจสอบตัวสะกด พิมพ์เล็ก/พิมพ์ใหญ่ แล้วลองใหม่อีกครั้งนะคะ`
              }
            ]
          }]
        });
      }

      // 2.4 โค้ดถูกปิดใช้งาน
      if (codeData.is_enabled === false) {
        return interaction.reply({
          flags: FLAG_V2 | FLAG_EPHEMERAL,
          components: [{
            type: 17,
            components: [
              {
                type: 10,
                content: `## ⏳︲__\` โค้ดนี้ไม่สามารถใช้งานได้ในขณะนี้ \`__\n- โค้ด \`"${code}"\` ถูกปิดการใช้งานชั่วคราวค่ะ\n- หากสงสัยสามารถสอบถามทีมงานเพิ่มเติมได้เลยนะคะ`
              }
            ]
          }]
        });
      }

      const now = new Date();

      // 2.4 ยังไม่ถึงเวลาใช้งาน
      if (codeData.start_at && new Date(codeData.start_at) > now) {
        const startTs = Math.floor(new Date(codeData.start_at).getTime() / 1000);
        return interaction.reply({
          flags: FLAG_V2 | FLAG_EPHEMERAL,
          components: [{
            type: 17,
            components: [
              {
                type: 10,
                content: `## ⏳︲__\` โค้ดยังไม่ถึงเวลาใช้งาน \`__\n- โค้ด \`"${code}"\` จะเริ่มเปิดให้ใช้งานใน <t:${startTs}:R> ค่ะ\n- รอกิจกรรมเริ่มต้นก่อนนะคะ 🐻💖`
              }
            ]
          }]
        });
      }

      // 2.4 โค้ดหมดอายุ
      if (codeData.end_at && new Date(codeData.end_at) < now) {
        return interaction.reply({
          flags: FLAG_V2 | FLAG_EPHEMERAL,
          components: [{
            type: 17,
            components: [
              {
                type: 10,
                content: `## ⏳︲__\` โค้ดหมดอายุแล้ว \`__\n- โค้ด \`"${code}"\` สิ้นสุดระยะเวลาการใช้งานแล้วค่ะ\n- รอติดตามกิจกรรมและโค้ดแจกฟรีรอบถัดไปน้า!`
              }
            ]
          }]
        });
      }

      // 2.3 โควต้าเต็ม
      if (codeData.max_uses && codeData.max_uses > 0 && (codeData.used_count ?? 0) >= codeData.max_uses) {
        return interaction.reply({
          flags: FLAG_V2 | FLAG_EPHEMERAL,
          components: [{
            type: 17,
            components: [
              {
                type: 10,
                content: `## 🔒︲__\` สิทธิ์การใช้งานเต็มแล้ว \`__\n- ขออภัยด้วยนะคะ โค้ด \`"${code}"\` มีผู้ใช้สิทธิ์ครบตามจำนวนที่กำหนดแล้วค่ะ\n- รอติดตามกิจกรรมและโค้ดแจกฟรีรอบถัดไปน้า!`
              }
            ]
          }]
        });
      }

      // 2.2 เคยแลกรับโค้ดนี้ไปแล้ว
      const { data: existingLog } = await supabase
        .from('redeem_logs')
        .select('id')
        .eq('discord_id', userId)
        .eq('code', codeData.code)
        .maybeSingle();

      if (existingLog) {
        return interaction.reply({
          flags: FLAG_V2 | FLAG_EPHEMERAL,
          components: [{
            type: 17,
            components: [
              {
                type: 10,
                content: `## ⚠️︲__\` คุณเคยใช้โค้ดนี้ไปแล้ว \`__\n- บัญชี <@${userId}> เคยแลกรับรางวัลจากโค้ด \`"${code}"\` ไปแล้วค่ะ\n- โค้ดนี้จำกัดสิทธิ์ 1 ครั้งต่อ 1 บัญชีเท่านั้นนะคะ 🐻💖`
              }
            ]
          }]
        });
      }

      // 🟢 ดำเนินการมอบรางวัล
      const granted = {};
      let pointsAdded = 0;
      let roleGranted = null;
      let roleAddSuccess = true;

      // จัดการแต้ม
      let currentPoints = 0;
      const maxCap = getMaxPoints(interaction.member);
      if (codeData.reward_type === 'points' || codeData.reward_type === 'both') {
        pointsAdded = codeData.points ?? 0;
        granted.pointsAdded = pointsAdded;

        const { data: userRow } = await supabase
          .from('user_points')
          .select('points, max_cap')
          .eq('discord_id', userId)
          .maybeSingle();

        currentPoints = userRow?.points ?? 0;
        const newPoints = Math.min(currentPoints + pointsAdded, maxCap);

        await supabase.from('user_points').upsert({
          discord_id: userId,
          points: newPoints,
          max_cap: maxCap,
          updated_at: new Date().toISOString()
        }, { onConflict: 'discord_id' });

        currentPoints = newPoints;
      }

      // จัดการยศ
      if ((codeData.reward_type === 'role' || codeData.reward_type === 'both') && codeData.role_id) {
        roleGranted = codeData.role_id;
        granted.roleGranted = roleGranted;

        try {
          if (interaction.member && !interaction.member.roles.cache.has(roleGranted)) {
            await interaction.member.roles.add(roleGranted, `Redeem Code: ${codeData.code}`);
          }
        } catch (roleErr) {
          console.error(`[myPoints] Failed to add role ${roleGranted} to user ${userId}:`, roleErr.message);
          roleAddSuccess = false;
        }
      }

      // บันทึก log และเพิ่ม used_count
      await supabase.from('redeem_logs').insert({
        discord_id: userId,
        code: codeData.code,
        reward_details: granted,
        redeemed_at: new Date().toISOString()
      });

      await supabase.from('redeem_codes').update({
        used_count: (codeData.used_count ?? 0) + 1
      }).eq('id', codeData.id);

      // สร้าง Component V2 ตามเงื่อนไขความสำเร็จ
      const checkPointsBtnRow = {
        type: 1,
        components: [
          {
            type: 2,
            style: 5,
            label: "︲คลิกเพื่อเช็กแต้ม",
            emoji: { id: "1522154708200849449", name: "bagpack_icon", animated: false },
            url: "https://discord.com/channels/1144251788493602848/1524123727724417276"
          }
        ]
      };

      const components = [];

      if (codeData.reward_type === 'points') {
        const successContent = `## <:strawberryv2:1520439075100688614>︲__\` แลกรับรางวัลสำเร็จ 𓂃 \`__\n- ยินดีด้วยนะคะ : <@${userId}> *!*\n- คุณได้รับ **+${pointsAdded.toLocaleString()} แต้ม** จากโค้ด \`"${code}"\` <:cuteplant:1152834055528783872>\n- แต้มปัจจุบันสะสมเป็น: \` ${currentPoints.toLocaleString()} / ${maxCap.toLocaleString()} \` แต้ม`;
        components.push({ type: 10, content: successContent });
        components.push({ type: 14, spacing: 2 });
        components.push(checkPointsBtnRow);
      } else if (codeData.reward_type === 'role') {
        let roleNotice = `- คุณได้รับยศ <@&${roleGranted}> จากโค้ด \`"${code}"\` เรียบร้อยแล้วค่ะ 🐻🎉\n- ไปแต่งโปรไฟล์หรืออวดเพื่อนๆ ในห้องแชทได้เลยน้า!`;
        if (!roleAddSuccess) {
          roleNotice = `- คุณได้รับสิทธิ์ยศ <@&${roleGranted}> จากโค้ด \`"${code}"\` เรียบร้อยแล้วค่ะ (แต่บอทไม่สามารถส่งยศให้อัตโนมัติได้ กรุณาติดต่อแอดมินนะคะ)`;
        }
        const successContent = `## <:strawberryv2:1520439075100688614>︲__\` แลกรับรางวัลสำเร็จ 𓂃 \`__\n- ยินดีด้วยนะคะ : <@${userId}> *!*\n${roleNotice}`;
        components.push({ type: 10, content: successContent });
      } else {
        // both
        let roleLine = `  • ได้รับยศ: <@&${roleGranted}> เข้าโปรไฟล์แล้วค่ะ ✨`;
        if (!roleAddSuccess) {
          roleLine = `  • สิทธิ์ยศ: <@&${roleGranted}> (บอทไม่สามารถส่งยศให้อัตโนมัติได้ กรุณาติดต่อแอดมินนะคะ)`;
        }
        const successContent = `## <:strawberryv2:1520439075100688614>︲__\` แลกรับรางวัลสำเร็จ 𓂃 \`__\n- ยินดีด้วยนะคะ : <@${userId}> *!*\n- คุณได้รับรางวัลใหญ่จากโค้ด \`"${code}"\` ครบถ้วน:\n  • ได้รับแต้ม: **+${pointsAdded.toLocaleString()} แต้ม** (ยอดรวม \` ${currentPoints.toLocaleString()} / ${maxCap.toLocaleString()} \`)\n${roleLine}`;
        components.push({ type: 10, content: successContent });
        components.push({ type: 14, spacing: 2 });
        components.push(checkPointsBtnRow);
      }

      return interaction.reply({
        flags: FLAG_V2 | FLAG_EPHEMERAL,
        components: [
          {
            type: 17,
            components
          }
        ]
      });

    } catch (err) {
      console.error('[myPoints] Redeem error:', err.message);
      return interaction.reply({
        flags: FLAG_V2 | FLAG_EPHEMERAL,
        components: [{
          type: 17,
          components: [
            {
              type: 10,
              content: '## ❌︲__` เกิดข้อผิดพลาดในการแลกรับรางวัล `__\n- กรุณาลองใหม่อีกครั้ง หรือติดต่อผู้ดูแลระบบค่ะ'
            }
          ]
        }]
      });
    }
  });
}

module.exports = { setupMyPoints };
