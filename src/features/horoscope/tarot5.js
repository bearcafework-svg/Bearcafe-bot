// Horoscope/tarot5.js
// คำสั่ง "เลือกหมี" — เลือกหมี 1-3 ตัว → สุ่มไพ่ทาโรต์ + ระบบ Mission

const { createClient } = require('@supabase/supabase-js');
const { MessageFlags }  = require('discord.js');
const cfg        = require('./settingtarot.json');
const infotarot3 = require('./Infotarot3.json');
const { blacklistPayload, cooldownContent, otherCommandsPayload } = require('../shared/tarotComponents');

// ─── Cooldown store (in-memory) ───────────────────────────────────────────────
const cooldowns = new Map();

// ─── Flag constants ───────────────────────────────────────────────────────────
const FLAG_V2        = MessageFlags.IsComponentsV2;  // 32768
const FLAG_EPHEMERAL = MessageFlags.Ephemeral;        // 64
const FLAG_V2_EPH    = FLAG_V2 | FLAG_EPHEMERAL;      // Component v2 + ephemeral

// ─── ภาพหมีตามปุ่มที่กด ───────────────────────────────────────────────────────
const BEAR_IMAGES = {
  'tarot5_bear_1': 'https://cdn.discordapp.com/attachments/1144675871798591569/1515372890797904044/2.png',
  'tarot5_bear_2': 'https://cdn.discordapp.com/attachments/1144675871798591569/1515372891376586812/3.png',
  'tarot5_bear_3': 'https://cdn.discordapp.com/attachments/1144675871798591569/1515372890214629558/4.png',
};

// ─── Helper: random int ───────────────────────────────────────────────────────
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Helper: ดึง user row จาก user_points ────────────────────────────────────
async function getUserRow(supabase, userId) {
  const { data, error } = await supabase
    .from('user_points')
    .select('points, tarot_point, mission_claimed')
    .eq('discord_id', userId)
    .single();
  if (error) {
    if (error.code === 'PGRST116') return { points: 0, tarot_point: 0, mission_claimed: false };
    console.error('[tarot5] getUserRow error:', error.message);
    return { points: 0, tarot_point: 0, mission_claimed: false };
  }
  return data ?? { points: 0, tarot_point: 0, mission_claimed: false };
}

// ─── Helper: atomic upsert แต้ม ──────────────────────────────────────────────
async function addPoints(supabase, userId, pointsDelta, tarotPointDelta = 0) {
  const { data, error } = await supabase.rpc('add_tarot_points', {
    p_discord_id:   userId,
    p_points_delta: pointsDelta,
    p_tarot_delta:  tarotPointDelta,
  });
  if (error) {
    console.error('[tarot5] addPoints RPC error:', error.message);
    const row = await getUserRow(supabase, userId);
    const newPoints     = (row.points      ?? 0) + pointsDelta;
    const newTarotPoint = (row.tarot_point ?? 0) + tarotPointDelta;
    await supabase.from('user_points').upsert(
      { discord_id: userId, points: newPoints, tarot_point: newTarotPoint },
      { onConflict: 'discord_id' }
    );
    return { newPoints, newTarotPoint };
  }
  const row = data?.[0] ?? { new_points: 0, new_tarot_point: 0 };
  return { newPoints: row.new_points, newTarotPoint: row.new_tarot_point };
}

// ─── Helper: Progress Bar ─────────────────────────────────────────────────────
function buildProgressBar(tarotPoint) {
  const pb     = cfg.progress_bar;
  const filled = Math.min(Math.floor((tarotPoint / pb.max_points) * pb.slots), pb.slots);
  let bar = '';
  for (let i = 0; i < pb.slots; i++) {
    const isFill = i < filled;
    if (i === 0)                 bar += isFill ? pb.left_fill   : pb.left_empty;
    else if (i === pb.slots - 1) bar += isFill ? pb.right_fill  : pb.right_empty;
    else                         bar += isFill ? pb.middle_fill : pb.middle_empty;
  }
  return bar;
}

// ─── Helper: point icon emoji string ─────────────────────────────────────────
function pointIconStr() {
  const pi = cfg.point_icon;
  return pi.animated ? `<a:${pi.name}:${pi.id}>` : `<:${pi.name}:${pi.id}>`;
}

// ─── Payload: Loading (เลือกหมี) ─────────────────────────────────────────────
// ไม่มี timer 5 วินาที — รอให้สมาชิกกดปุ่มหมี 1-3 แทน
function buildLoadingPayload() {
  return {
    flags: FLAG_V2,
    components: [{
      type: 17,
      components: [
        { type: 14, spacing: 2 },
        { type: 12, items: [{ media: { url: 'https://cdn.discordapp.com/attachments/1144675871798591569/1515372383605751848/GIF_20260613_220800_767.gif' } }] },
        { type: 14, spacing: 2 },
        {
          type: 10,
          content:
            `## <:starquestionmark:1352954565041061929>︲__\` 𝖯𝗂𝖼𝗄 𝖺 𝖡𝖾𝖺𝗋 ₊ เลือกหมี 1 ตัว 𓂃 \`__\n` +
            `-# คำทำนายนี้เป็นเพียงการคาดการณ์ อาจไม่ตรงกับความเป็นจริง ขอให้ใช้วิจารณญาณในการอ่าน และใช้งานเพื่อความบันเทิงน้า <:cuteplant:1152834055528783872>`
        },
        { type: 14, spacing: 2 },
        {
          type: 1,
          components: [
            {
              type:      2,
              style:     3,
              custom_id: 'tarot5_bear_1',
              emoji:     { id: '1515373187821736006', name: 'pickabear_1', animated: false },
              flow:      { actions: [] }
            },
            {
              type:      2,
              style:     3,
              custom_id: 'tarot5_bear_2',
              emoji:     { id: '1515373224748122132', name: 'pickabear_2', animated: false },
              flow:      { actions: [] }
            },
            {
              type:      2,
              style:     3,
              custom_id: 'tarot5_bear_3',
              emoji:     { id: '1515373255517671485', name: 'pickabear_3', animated: false },
              flow:      { actions: [] }
            }
          ]
        }
      ]
    }]
  };
}

// ─── Payload: Card Only (กรณีกดรับรางวัลไปแล้ว) ──────────────────────────────
function buildCardPayload(bearImgUrl, card, earnedPoints) {
  const pi = cfg.point_icon;
  return {
    flags: FLAG_V2,
    components: [{
      type: 17,
      components: [
        { type: 12, items: [{ media: { url: bearImgUrl } }] },
        { type: 14, spacing: 2 },
        {
          type: 9,
          components: [{
            type: 10,
            content:
              `## <a:orangeblossom:1515376212225294346>︲__\` ไพ่ประจำวันนี้คือ ₊ ${card.name} 𓂃 \`__\n` +
              `-# คำแนะนำวันนี้ : **${card.guild}** <:cuteplant:1152834055528783872>`
          }],
          accessory: {
            type:  11,
            media: { url: card.img }
          }
        },
        { type: 14, spacing: 1, divider: false },
        {
          type: 9,
          components: [{
            type: 10,
            content:
              ` - 💕⠀**ความรัก**\n` +
              `  - __\`โสด\`__: ${card.single}\n` +
              `  - __\`มีแฟน\`__: ${card.love}`
          }],
          accessory: {
            type:  2,
            style: 5,
            label: `ได้รับ +${earnedPoints} แต้ม`,
            emoji: { id: pi.id, name: pi.name, animated: pi.animated },
            url:   'https://discord.com/channels/1144251788493602848/1145305334806741122'
          }
        },
        { type: 14, divider: false },
        {
          type: 10,
          content: ` - 💼⠀**การงาน**\n  - ${card.job}`
        },
        { type: 14, divider: false },
        {
          type: 10,
          content: ` - 💸⠀**การเงิน**\n  - ${card.money}`
        },
        { type: 14, divider: false },
        {
          type: 10,
          content: ` - 💉⠀**สุขภาพ**\n  - ${card.heal}`
        },
        { type: 14, spacing: 2 },
        {
          type: 1,
          components: [
            {
              type:      2,
              style:     1,
              custom_id: 'tarot_other_commands',
              label:     '︲ดูดวงแบบอื่น',
              emoji:     { id: '1256669436350562355', name: 'bee20000', animated: false },
              flow:      { actions: [] }
            },
            {
              type:  2,
              style: 5,
              label: 'ดูดวงฟรี!',
              url:   `https://discord.com/channels/1144251788493602848/${cfg.channels.horoscope_info_channel}`
            }
          ]
        }
      ]
    }]
  };
}

// ─── Payload: Mission + Card รวมกัน ──────────────────────────────────────────
function buildCombinedPayload(bearImgUrl, card, earnedPoints, tarotPoint, isComplete) {
  const pi = cfg.point_icon;
  return {
    flags: FLAG_V2,
    components: [{
      type: 17,
      components: [
        // ── Mission block ──────────────────────────────────────────────────────
        { type: 14, spacing: 2 },
        {
          type: 9,
          components: [{
            type: 10,
            content:
              `## ${cfg.emojis.gift}︲__\` 𝖬𝗂𝗌𝗌𝗂𝗈𝗇 ₊ ภารกิจรับยศฟรี! 𓂃 \`__\n` +
              `- **ภารกิจของเธอ:** เพียงใช้คำสั่งดูดวง คำสั่งไหนก็ได้รวมกัน ${cfg.mission_target} ครั้ง ก็รับยศพิเศษจากคาเฟ่หมีไปเลย ${cfg.emojis.sparkles}\n` +
              `- **ยศที่คุณจะได้รับ:** **\`@ヽเจ้าหมีสายมู ✱\` + ${pointIconStr()}${cfg.mission_reward_points}**\n\n` +
              `**ความคืบหน้า ${tarotPoint}/${cfg.mission_target}**\n` +
              `## ${buildProgressBar(tarotPoint)}`
          }],
          accessory: {
            type: 11,
            media: { url: 'https://media.discordapp.net/attachments/1144675871798591569/1377501031541506162/64603-purpleween.png?ex=6a2793ce&is=6a26424e&hm=aaa4a4ffaa1643c61b7de85b7ba56bca75dbc88d0c1116f39d2692991e6e7709&format=webp&quality=lossless&width=160&height=160&' }
          }
        },
        { type: 14, spacing: 1, divider: false },
        {
          type: 1,
          components: [{
            type:      2,
            style:     isComplete ? 3 : 1,
            custom_id: 'tarot_mission_claim',
            label:     'กดรับรางวัล',
            disabled:  !isComplete,
            flow:      { actions: [] }
          }]
        },
        // ── Separator ─────────────────────────────────────────────────────────
        { type: 14, spacing: 2 },
        // ── Card block ────────────────────────────────────────────────────────
        { type: 12, items: [{ media: { url: bearImgUrl } }] },
        { type: 14, spacing: 2 },
        {
          type: 9,
          components: [{
            type: 10,
            content:
              `## <a:orangeblossom:1515376212225294346>︲__\` ไพ่ประจำวันนี้คือ ₊ ${card.name} 𓂃 \`__\n` +
              `-# คำแนะนำวันนี้ : **${card.guild}** <:cuteplant:1152834055528783872>`
          }],
          accessory: {
            type:  11,
            media: { url: card.img }
          }
        },
        { type: 14, spacing: 1, divider: false },
        {
          type: 9,
          components: [{
            type: 10,
            content:
              ` - 💕⠀**ความรัก**\n` +
              `  - __\`โสด\`__: ${card.single}\n` +
              `  - __\`มีแฟน\`__: ${card.love}`
          }],
          accessory: {
            type:  2,
            style: 5,
            label: `ได้รับ +${earnedPoints} แต้ม`,
            emoji: { id: pi.id, name: pi.name, animated: pi.animated },
            url:   'https://discord.com/channels/1144251788493602848/1145305334806741122'
          }
        },
        { type: 14, divider: false },
        {
          type: 10,
          content: ` - 💼⠀**การงาน**\n  - ${card.job}`
        },
        { type: 14, divider: false },
        {
          type: 10,
          content: ` - 💸⠀**การเงิน**\n  - ${card.money}`
        },
        { type: 14, divider: false },
        {
          type: 10,
          content: ` - 💉⠀**สุขภาพ**\n  - ${card.heal}`
        },
        { type: 14, spacing: 2 },
        {
          type: 1,
          components: [
            {
              type:      2,
              style:     1,
              custom_id: 'tarot_other_commands',
              label:     '︲ดูดวงแบบอื่น',
              emoji:     { id: '1256669436350562355', name: 'bee20000', animated: false },
              flow:      { actions: [] }
            },
            {
              type:  2,
              style: 5,
              label: 'ดูดวงฟรี!',
              url:   `https://discord.com/channels/1144251788493602848/${cfg.channels.horoscope_info_channel}`
            }
          ]
        }
      ]
    }]
  };
}

// ─── Setup ───────────────────────────────────────────────────────────────────
function setupTarot5(client) {

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  // ── Listener: ข้อความ "เลือกหมี" ────────────────────────────────────────────
  client.on('messageCreate', async (message) => {
    if (!message.guild)     return;
    if (message.author.bot) return;
    if (message.channel.id !== cfg.channel_id) return;
    if (message.content.trim() !== 'เลือกหมี') return;

    const member = message.member;
    const userId = message.author.id;

    // ── ตรวจ Blacklist Role ─────────────────────────────────────────────────
    const isBlacklisted = cfg.role_blacklist.some(id => member.roles.cache.has(id));
    if (isBlacklisted) {
      const sent = await message.reply(blacklistPayload(userId));
      setTimeout(() => sent.delete().catch(() => {}), 5000);
      return;
    }

    // ── ตรวจ Cooldown ────────────────────────────────────────────────────────
    const isPremium  = cfg.role_premium.some(id => member.roles.cache.has(id));
    const cdDuration = isPremium ? cfg.cooldown_premium_ms : cfg.cooldown_normal_ms;
    const now        = Date.now();
    const cdExpiry   = cooldowns.get(userId) ?? 0;

    if (now < cdExpiry) {
      await message.reply({ content: cooldownContent(userId, Math.floor(cdExpiry / 1000)) });
      return;
    }
    cooldowns.set(userId, now + cdDuration);

    // ── ส่ง Loading reply (แสดงปุ่มหมี 3 ตัว รอให้กด) ──────────────────────
    await message.reply(buildLoadingPayload());
    // หมายเหตุ: ไม่เก็บ loadingMsg เพราะจะ editReply ผ่าน interaction แทน
  });

  // ── Listener: Interaction (ปุ่ม) ────────────────────────────────────────────
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const { customId, user, member } = interaction;

    // ── ปุ่ม: เลือกหมี 1-3 ────────────────────────────────────────────────
    if (customId in BEAR_IMAGES) {
      try {
        await interaction.deferUpdate();

        const bearImgUrl = BEAR_IMAGES[customId];

        // ดึงข้อมูล user + สุ่มไพ่พร้อมกัน
        const [userRow] = await Promise.all([
          getUserRow(supabase, user.id),
          new Promise(r => setTimeout(r, 1000)) // หน่วงเล็กน้อยให้ smooth
        ]);
        const tarotPoint = userRow.tarot_point ?? 0;

        // สุ่มไพ่ (1-78) จาก Infotarot3.json
        const cardId       = String(randInt(1, 78));
        const card         = infotarot3.cards[cardId];
        const earnedPoints = randInt(cfg.point_reward_min, cfg.point_reward_max);

        const alreadyClaimed = userRow.mission_claimed === true;

        // บันทึกแต้ม
        const tarotDelta        = alreadyClaimed ? 0 : Math.min(1, cfg.mission_target - tarotPoint);
        const { newTarotPoint } = await addPoints(supabase, user.id, earnedPoints, tarotDelta);
        const missionComplete   = newTarotPoint >= cfg.mission_target;

        // อัปเดต message เดิม (แทนที่ปุ่มหมีด้วยผลลัพธ์)
        const resultPayload = alreadyClaimed
          ? buildCardPayload(bearImgUrl, card, earnedPoints)
          : buildCombinedPayload(bearImgUrl, card, earnedPoints, newTarotPoint, missionComplete);

        await interaction.editReply({
          flags:      FLAG_V2,
          components: resultPayload.components
        });

      } catch (error) {
        if (error.code !== 40060 && error.code !== 10062) {
          console.error('[tarot5] Bear pick error:', error);
        }
      }
      return;
    }

    // ── ปุ่ม: ดูดวงแบบอื่น ─────────────────────────────────────────────────
    if (customId === 'tarot_other_commands') {
      const payload = otherCommandsPayload();
      await interaction.reply({
        flags:      FLAG_V2_EPH,
        components: payload.components
      });
      return;
    }

    // ── ปุ่ม: กดรับรางวัล Mission ─────────────────────────────────────────
    if (customId === 'tarot_mission_claim') {
      try {
        await interaction.deferUpdate();

        const userRow    = await getUserRow(supabase, user.id);
        const tarotPoint = userRow.tarot_point ?? 0;

        if (tarotPoint < cfg.mission_target) {
          await interaction.followUp({
            flags:   FLAG_EPHEMERAL,
            content: '❌ แต้มดูดวงของคุณยังไม่ครบนะคะ!'
          });
          return;
        }

        // เพิ่ม Role
        try {
          if (!member.roles.cache.has(cfg.mission_reward_role)) {
            await member.roles.add(cfg.mission_reward_role);
          }
        } catch (err) {
          console.error('[tarot5] addRole error:', err.message);
        }

        // เพิ่มแต้มรางวัล + mark mission_claimed = true
        await Promise.all([
          addPoints(supabase, user.id, cfg.mission_reward_points, 0),
          supabase.from('user_points').update({ mission_claimed: true }).eq('discord_id', user.id)
        ]);

        // อัปเดตปุ่ม (Recursive)
        const updateButtonDeep = (components) => {
          return components.map(c => {
            let comp = typeof c.toJSON === 'function' ? c.toJSON() : { ...c };

            if (comp.custom_id === 'tarot_mission_claim') {
              return {
                ...comp,
                label:    '︲รับรางวัลเรียบร้อย!',
                emoji:    { id: '1358584609087946867', name: '50121checkmark', animated: false },
                disabled: true,
                style:    1
              };
            }

            if (comp.components) {
              comp.components = updateButtonDeep(comp.components);
            }
            return comp;
          });
        };

        const updatedComponents = updateButtonDeep(interaction.message.components);

        await interaction.editReply({
          flags:      FLAG_V2,
          components: updatedComponents
        });

      } catch (error) {
        if (error.code !== 40060 && error.code !== 10062) {
          console.error('[tarot5] Mission Claim Error:', error);
        }
      }
    }
  });

  console.log('[tarot5] ✅ ระบบดูดวง tarot5 พร้อมใช้งาน');
}

module.exports = { setupTarot5 };