// Horoscope/tarot3.js
// คำสั่ง "เขย่าเซียมซี" — สุ่มรูปเซียมซี + ระบบ Mission

const { createClient } = require('@supabase/supabase-js');
const { safeRespond } = require("../../../utils/discordSafety");
const { MessageFlags }  = require('discord.js');
const cfg       = require('./settingtarot.json');
const infotarot = require('./Infotarot.json');
const { blacklistPayload, cooldownContent, otherCommandsPayload } = require('../shared/tarotComponents');

// ─── Cooldown store (in-memory) ───────────────────────────────────────────────
const cooldowns = new Map();

// ─── Flag constants ───────────────────────────────────────────────────────────
const FLAG_V2        = MessageFlags.IsComponentsV2;  // 32768
const FLAG_EPHEMERAL = MessageFlags.Ephemeral;        // 64
const FLAG_V2_EPH    = FLAG_V2 | FLAG_EPHEMERAL;      // Component v2 + ephemeral
const OTHER_COMMANDS_ID = 'tarot3_other_commands';
const MISSION_CLAIM_ID  = 'tarot3_mission_claim';

// ─── Siamsee card image URLs (1–15) ──────────────────────────────────────────
const CARD_IMAGES = {
  1:  'https://cdn.discordapp.com/attachments/1144675871798591569/1422920724883968010/1.png',
  2:  'https://cdn.discordapp.com/attachments/1144675871798591569/1422920725286617128/2.png',
  3:  'https://cdn.discordapp.com/attachments/1144675871798591569/1422920725689536562/3.png',
  4:  'https://cdn.discordapp.com/attachments/1144675871798591569/1422920726104510544/4.png',
  5:  'https://cdn.discordapp.com/attachments/1144675871798591569/1422920726448439378/5.png',
  6:  'https://cdn.discordapp.com/attachments/1144675871798591569/1422920726918467636/6.png',
  7:  'https://cdn.discordapp.com/attachments/1144675871798591569/1422920727346024458/7.png',
  8:  'https://cdn.discordapp.com/attachments/1144675871798591569/1422920727752868033/8.png',
  9:  'https://cdn.discordapp.com/attachments/1144675871798591569/1422920728206118952/9.png',
  10: 'https://cdn.discordapp.com/attachments/1144675871798591569/1422920728583475230/10.png',
  11: 'https://cdn.discordapp.com/attachments/1144675871798591569/1422920744739934238/11.png',
  12: 'https://cdn.discordapp.com/attachments/1144675871798591569/1422920745134067752/12.png',
  13: 'https://cdn.discordapp.com/attachments/1144675871798591569/1422920745566339163/13.png',
  14: 'https://cdn.discordapp.com/attachments/1144675871798591569/1422920745939505193/14.png',
  15: 'https://cdn.discordapp.com/attachments/1144675871798591569/1422920746329444362/15.png',
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
    console.error('[tarot3] getUserRow error:', error.message);
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
    console.error('[tarot3] addPoints RPC error:', error.message);
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

// ─── Payload: Loading ─────────────────────────────────────────────────────────
function buildLoadingPayload() {
  return {
    flags: FLAG_V2,
    components: [{
      type: 17,
      components: [
        { type: 14, spacing: 2 },
        { type: 12, items: [{ media: { url: 'https://cdn.discordapp.com/attachments/1144675871798591569/1422919451422101546/siamsee.gif' } }] },
        { type: 14, spacing: 2 },
        {
          type: 10,
          content:
            `## ${cfg.emojis.loading}︲__\` กำลังเขย่าเซียมซี! 𓂃 \`__\n` +
            `คำทำนายนี้เป็นเพียงการคาดการณ์ อาจไม่ตรงกับความเป็นจริง ขอให้ใช้วิจารณญาณในการอ่าน และใช้งานเพื่อความบันเทิงน้า ${cfg.emojis.plant}\n`
        },
        { type: 14, spacing: 2 }
      ]
    }]
  };
}

// ─── Payload: Card Only (กรณีกดรับรางวัลไปแล้ว) ──────────────────────────────
function buildCardPayload(cardImgUrl, earnedPoints) {
  const pi = cfg.point_icon;
  return {
    flags: FLAG_V2,
    components: [{
      type: 17,
      components: [
        { type: 12, items: [{ media: { url: cardImgUrl } }] },
        { type: 14, spacing: 2 },
        {
          type: 9,
          components: [{
            type: 10,
            content: `คำทำนายนี้เป็นเพียงการคาดการณ์ อาจไม่ตรงกับความเป็นจริง ขอให้ใช้วิจารณญาณในการอ่าน และใช้งานเพื่อความบันเทิงน้า <:cuteplant:1152834055528783872>`
          }],
          accessory: {
            type:  2,
            style: 5,
            label: `ได้รับ +${earnedPoints} แต้ม`,
            emoji: { id: pi.id, name: pi.name, animated: pi.animated },
            url:   'https://discord.com/channels/1144251788493602848/1145305334806741122'
          }
        },
        { type: 14, spacing: 2 },
        {
          type: 1,
          components: [
            {
              type:      2,
              style:     1,
              custom_id: OTHER_COMMANDS_ID,
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

// ─── Payload: Mission + Card รวมกัน (ส่ง reply เดียว) ────────────────────────
function buildCombinedPayload(cardImgUrl, earnedPoints, tarotPoint, isComplete) {
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
            custom_id: MISSION_CLAIM_ID,
            label:     'กดรับรางวัล',
            disabled:  !isComplete,
            flow:      { actions: [] }
          }]
        },
        // ── Separator ─────────────────────────────────────────────────────────
        { type: 14, spacing: 2 },
        // ── Card block ────────────────────────────────────────────────────────
        { type: 12, items: [{ media: { url: cardImgUrl } }] },
        { type: 14, spacing: 2 },
        {
          type: 9,
          components: [{
            type: 10,
            content: `คำทำนายนี้เป็นเพียงการคาดการณ์ อาจไม่ตรงกับความเป็นจริง ขอให้ใช้วิจารณญาณในการอ่าน และใช้งานเพื่อความบันเทิงน้า <:cuteplant:1152834055528783872>`
          }],
          accessory: {
            type:  2,
            style: 5,
            label: `ได้รับ +${earnedPoints} แต้ม`,
            emoji: { id: pi.id, name: pi.name, animated: pi.animated },
            url:   'https://discord.com/channels/1144251788493602848/1145305334806741122'
          }
        },
        { type: 14, spacing: 2 },
        {
          type: 1,
          components: [
            {
              type:      2,
              style:     1,
              custom_id: OTHER_COMMANDS_ID,
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
function setupTarot3(client) {

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  // ── Listener: ข้อความ "เขย่าเซียมซี" ───────────────────────────────────────
  client.on('messageCreate', async (message) => {
    if (!message.guild)     return;
    if (message.author.bot) return;
    if (message.channel.id !== cfg.channel_id) return;
    if (message.content.trim() !== 'เขย่าเซียมซี') return;

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

    // ── ส่ง Loading reply ────────────────────────────────────────────────────
    const loadingMsg = await message.reply(buildLoadingPayload());

    // ── เตรียมข้อมูลทั้งหมดระหว่างรอ 5 วินาที ────────────────────────────────
    const [userRow] = await Promise.all([
      getUserRow(supabase, userId),
      new Promise(r => setTimeout(r, 5000))
    ]);
    const tarotPoint = userRow.tarot_point ?? 0;

    // ── สุ่มรูปเซียมซี (1–15) + แต้ม ────────────────────────────────────────
    const cardId       = randInt(1, 15);
    const cardImgUrl   = CARD_IMAGES[cardId];
    const earnedPoints = randInt(cfg.point_reward_min, cfg.point_reward_max);

    // ── ตรวจว่ากดรับรางวัลไปแล้วหรือยัง ──────────────────────────────────────
    const alreadyClaimed = userRow.mission_claimed === true;

    // ── บันทึกแต้มลง Supabase (atomic) ──────────────────────────────────────
    const tarotDelta        = alreadyClaimed ? 0 : Math.min(1, cfg.mission_target - tarotPoint);
    const { newTarotPoint } = await addPoints(supabase, userId, earnedPoints, tarotDelta);
    const missionComplete   = newTarotPoint >= cfg.mission_target;

    // ── ลบ loading + ส่ง result พร้อมกัน ─────────────────────────────────────
    const deletePromise = loadingMsg.deletable
      ? loadingMsg.delete().catch(err => console.error('[tarot3] delete loading error:', err.message))
      : Promise.resolve();

    const sendPromise = alreadyClaimed
      ? message.reply(buildCardPayload(cardImgUrl, earnedPoints))
      : message.reply(buildCombinedPayload(cardImgUrl, earnedPoints, newTarotPoint, missionComplete));

    await Promise.all([deletePromise, sendPromise]);
  });

  // ── Listener: Interaction (ปุ่ม) ────────────────────────────────────────────
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const { customId, user, member } = interaction;

    // ── ปุ่ม: ดูดวงแบบอื่น ─────────────────────────────────────────────────
    if (customId === OTHER_COMMANDS_ID) {
      const payload = otherCommandsPayload();
      await safeRespond(interaction, {
        flags:      FLAG_V2_EPH,
        components: payload.components
      });
      return;
    }

    // ── ปุ่ม: กดรับรางวัล Mission ─────────────────────────────────────────
    if (customId === MISSION_CLAIM_ID) {
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
          console.error('[tarot3] addRole error:', err.message);
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

            if (comp.custom_id === MISSION_CLAIM_ID) {
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
          console.error('[tarot3] Mission Claim Error:', error);
        }
      }
    }
  });

  console.log('[tarot3] ✅ ระบบดูดวง tarot3 พร้อมใช้งาน');
}

module.exports = { setupTarot3 };
