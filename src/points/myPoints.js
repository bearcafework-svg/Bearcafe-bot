const { createClient } = require('@supabase/supabase-js');
const { MessageFlags } = require('discord.js');
const cfg = require('./settingCheckIn.json');
const { blacklistPayload } = require('../features/shared/tarotComponents');

const FLAG_V2 = 32768; // MessageFlags.IsComponentsV2
const FLAG_EPHEMERAL = 64; // MessageFlags.Ephemeral

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

async function getUserData(supabase, userId) {
  const { data } = await supabase
    .from('user_points')
    .select('points, cakes')
    .eq('discord_id', userId)
    .single();
  return {
    points: data?.points ?? 0,
    cakes: data?.cakes ?? 0
  };
}

function buildMainPayload(interaction, points, cakes, maxPoints, page = 1) {
  const avatarUrl = interaction.member.displayAvatarURL({ extension: 'png', size: 128 });
  const username = interaction.user.displayName || interaction.user.username;
  const cakeUrl = cfg.cake_images[Math.min(cakes, 4)];

  const options = [];
  const rolesList = page === 1 ? cfg.roles_exchange : cfg.roles_exchange_page2;

  for (const role of rolesList) {
    const roleName = interaction.guild?.roles.cache.get(role.id)?.name || 'Unknown Role';
    options.push({
      label: roleName,
      value: role.id,
      emoji: { id: role.emoji_id, name: role.emoji_name, animated: false }
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
      style: 3, type: 2, custom_id: "mypoints_claim_cake", disabled: false,
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
            content: `## <:bagpack_icon:1522154708200849449>︲__\` 𝖬𝗒 𝗉𝗈𝗂𝗇𝗍𝗌 ₊ ${username} \`__\n-# สะสมเค้กครบ 4 ชิ้น รับฟรี 1 ยศ เลือกได้จากคลังยศกว่า **30 ยศ** เปลี่ยนสไตล์ให้โปรไฟล์ของคุณได้ตามใจ พร้อมสะสมต่อเพื่อปลดล็อกรางวัลอีกมากมาย <:cuteplant:1152834055528783872>\n\n> <:bee20000:1256669436350562355>︰แต้มตอนนี้ของคุณ \`${points.toLocaleString()}\` / \`${maxPoints.toLocaleString()}\`\n> <a:59217leaf:1512014878796152862>︰สะสมแต้ม <:strawberryv2:1520439075100688614> **750 แต้ม** เพื่อรับเค้ก <:cake_point:1522152896035033098> **1 ชิ้น** สำหรับแลกยศฟรี!`
          }],
          accessory: { type: 11, media: { url: avatarUrl } }
        },
        { type: 14, spacing: 2 },
        {
          type: 1,
          components: [{
            type: 3,
            custom_id: "mypoints_role_select",
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
            { type: 2, style: 5, label: "︲สุ่มรางวัลเช็กอิน (ฟรี)", emoji: { id: "1301541277992485005", name: "secret_box", animated: true }, url: "https://discord.com/channels/1144251788493602848/1359232430455783564" },
            { type: 2, style: 5, label: "︲ปฎิทินเช็กอิน 28 วัน (ฟรี)", emoji: { id: "1276130500410605609", name: "68492gift", animated: false }, url: "https://bearcafe4commu.vercel.app/" }
          ]
        }
      ]
    }]
  };
}

function setupMyPoints(client) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  client.once('clientReady', async () => {
    try {
      const guild = client.guilds.cache.get('1144251788493602848');
      if (guild) {
        await guild.commands.create({
          name: 'แต้มของฉัน',
          description: 'ดูแต้มสะสมปัจจุบัน และสิทธิ์ในการแลกรางวัลต่าง ๆ'
        });
        console.log('[myPoints] Command /แต้มของฉัน registered on guild.');
      }
    } catch (e) {
      console.error('[myPoints] Failed to register command:', e.message);
    }
  });

  client.on('interactionCreate', async (interaction) => {
    if (interaction.isChatInputCommand() && interaction.commandName === 'แต้มของฉัน') {
      if (interaction.channelId !== '1145305334806741122') {
        return interaction.reply({ content: 'คำสั่งนี้ใช้ได้เฉพาะห้อง <#1145305334806741122> เท่านั้นนะคะ', flags: FLAG_EPHEMERAL });
      }

      const isBlacklisted = cfg.role_blacklist.some(id => interaction.member.roles.cache.has(id));
      if (isBlacklisted) {
        return interaction.reply(blacklistPayload(interaction.user.id));
      }

      const userId = interaction.user.id;
      const { points, cakes } = await getUserData(supabase, userId);
      const maxPoints = getMaxPoints(interaction.member);

      const payload = buildMainPayload(interaction, points, cakes, maxPoints, 1);
      await interaction.reply(payload);
    }

    if (interaction.isButton()) {
      if (interaction.customId === 'mypoints_claim_cake') {
        const userId = interaction.user.id;
        let { points, cakes } = await getUserData(supabase, userId);
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
          payload.components[0].components[0].items[0].media.url = "https://cdn.discordapp.com/attachments/1144675871798591569/1484555089682370650/ec9c6c23727474db.png";

          payload.components[0].components[2].components[0].content = payload.components[0].components[2].components[0].content.replace(
            "> <a:59217leaf:1512014878796152862>︰สะสมแต้ม <:strawberryv2:1520439075100688614> **750 แต้ม** เพื่อรับเค้ก <:cake_point:1522152896035033098> **1 ชิ้น** สำหรับแลกยศฟรี!",
            `> <a:59217leaf:1512014878796152862>︰คุณแลกเค้กไม่สำเร็จ แต่ได้รับแต้มคืน <:strawberryv2:1520439075100688614> **${refund.toLocaleString()} แต้ม** ลองใหม่อีกครั้งนะ!`
          );

          await interaction.update(payload);
        }
      }
    }

    if (interaction.isStringSelectMenu() && interaction.customId === 'mypoints_role_select') {
      const selectedValue = interaction.values[0];
      const userId = interaction.user.id;

      if (selectedValue === 'next_page') {
        const optionsPage2 = [];
        for (const role of cfg.roles_exchange_page2) {
          const roleName = interaction.guild?.roles.cache.get(role.id)?.name || 'Unknown Role';
          optionsPage2.push({
            label: roleName,
            value: role.id,
            emoji: { id: role.emoji_id, name: role.emoji_name, animated: false }
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
                  custom_id: "mypoints_role_select",
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
                { style: 3, type: 2, custom_id: `mypoints_confirm_${roleId}`, label: "ยืนยัน" },
                { style: 4, type: 2, custom_id: "mypoints_cancel", disabled: true, label: "ยกเลิกโดยกดคำว่า \"ปิดข้อความ\"" }
              ]
            }
          ]
        }]
      };
      await interaction.reply(confirmPayload);
    }

    if (interaction.isButton() && interaction.customId.startsWith('mypoints_confirm_')) {
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
    }
  });
}

module.exports = { setupMyPoints };
