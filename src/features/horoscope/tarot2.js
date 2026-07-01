// Horoscope/tarot2.js
// คำสั่ง "คำทำนายของฉัน" — สุ่มรูป quest + ระบบ Mission

const { createClient } = require('@supabase/supabase-js');
const { safeRespond } = require("../../../utils/discordSafety");
const { MessageFlags }  = require('discord.js');
const cfg       = require('./settingtarot.json');
const infotarot = require('./Infotarot.json');
const { blacklistPayload, cooldownContent, otherCommandsPayload } = require('../shared/tarotComponents');

// ─── Cooldown store (in-memory) ───────────────────────────────────────────────
const { getCooldown, setCooldown } = require('../../utils/cooldownManager');

// ─── Flag constants ───────────────────────────────────────────────────────────
const FLAG_V2        = MessageFlags.IsComponentsV2;  // 32768
const FLAG_EPHEMERAL = MessageFlags.Ephemeral;        // 64
const FLAG_V2_EPH    = FLAG_V2 | FLAG_EPHEMERAL;      // Component v2 + ephemeral
const OTHER_COMMANDS_ID = 'tarot2_other_commands';
const MISSION_CLAIM_ID  = 'tarot2_mission_claim';

// ─── Quest image URLs (1–40) ──────────────────────────────────────────────────
const QUEST_IMAGES = {
  1:  'https://cdn.discordapp.com/attachments/1144675871798591569/1361687764873252954/quest1.png',
  2:  'https://cdn.discordapp.com/attachments/1144675871798591569/1361687765343010856/quest2.png',
  3:  'https://cdn.discordapp.com/attachments/1144675871798591569/1361687765955117236/quest3.png',
  4:  'https://cdn.discordapp.com/attachments/1144675871798591569/1361687766450307112/quest4.png',
  5:  'https://cdn.discordapp.com/attachments/1144675871798591569/1361687766811021544/quest5.png',
  6:  'https://cdn.discordapp.com/attachments/1144675871798591569/1361687767255486664/quest6.png',
  7:  'https://cdn.discordapp.com/attachments/1144675871798591569/1361687767733502173/quest7.png',
  8:  'https://cdn.discordapp.com/attachments/1144675871798591569/1361687768161452203/quest8.png',
  9:  'https://cdn.discordapp.com/attachments/1144675871798591569/1361687768849322226/quest9.png',
  10: 'https://cdn.discordapp.com/attachments/1144675871798591569/1361687764344508519/quest10.png',
  11: 'https://cdn.discordapp.com/attachments/1144675871798591569/1361687794359074916/quest11.png',
  12: 'https://cdn.discordapp.com/attachments/1144675871798591569/1361687794904203467/quest12.png',
  13: 'https://cdn.discordapp.com/attachments/1144675871798591569/1361687795349065779/quest13.png',
  14: 'https://cdn.discordapp.com/attachments/1144675871798591569/1361687796187795768/quest14.png',
  15: 'https://cdn.discordapp.com/attachments/1144675871798591569/1361687796724793344/quest15.png',
  16: 'https://cdn.discordapp.com/attachments/1144675871798591569/1361687797207007262/quest16.png',
  17: 'https://cdn.discordapp.com/attachments/1144675871798591569/1361687797647413290/quest17.png',
  18: 'https://cdn.discordapp.com/attachments/1144675871798591569/1361687798176022759/quest18.png',
  19: 'https://cdn.discordapp.com/attachments/1144675871798591569/1361955651382677606/quest19.png.png',
  20: 'https://cdn.discordapp.com/attachments/1144675871798591569/1361687799031533690/quest20.png',
  21: 'https://cdn.discordapp.com/attachments/1144675871798591569/1408386900959690865/quest21.png',
  22: 'https://cdn.discordapp.com/attachments/1144675871798591569/1408386901479526442/quest22.png',
  23: 'https://cdn.discordapp.com/attachments/1144675871798591569/1408386901886505084/quest23.png',
  24: 'https://cdn.discordapp.com/attachments/1144675871798591569/1408386902339358792/quest24.png',
  25: 'https://cdn.discordapp.com/attachments/1144675871798591569/1408386902981218376/quest25.png',
  26: 'https://cdn.discordapp.com/attachments/1144675871798591569/1408386903488856104/quest26.png',
  27: 'https://cdn.discordapp.com/attachments/1144675871798591569/1408386903862153267/quest27.png',
  28: 'https://cdn.discordapp.com/attachments/1144675871798591569/1408386904298356806/quest28.png',
  29: 'https://cdn.discordapp.com/attachments/1144675871798591569/1408386904839163914/quest29.png',
  30: 'https://cdn.discordapp.com/attachments/1144675871798591569/1408386905266979039/quest30.png',
  31: 'https://cdn.discordapp.com/attachments/1144675871798591569/1408386930403704972/quest31.png',
  32: 'https://cdn.discordapp.com/attachments/1144675871798591569/1408386930931925034/quest32.png',
  33: 'https://cdn.discordapp.com/attachments/1144675871798591569/1408386931351490641/quest33.png',
  34: 'https://cdn.discordapp.com/attachments/1144675871798591569/1408386931708137532/quest34.png',
  35: 'https://cdn.discordapp.com/attachments/1144675871798591569/1408386932114854000/quest35.png',
  36: 'https://cdn.discordapp.com/attachments/1144675871798591569/1408386932555386933/quest36.png',
  37: 'https://cdn.discordapp.com/attachments/1144675871798591569/1408386932882280530/quest37.png',
  38: 'https://cdn.discordapp.com/attachments/1144675871798591569/1408386933192917083/quest38.png',
  39: 'https://cdn.discordapp.com/attachments/1144675871798591569/1408386933503164546/quest39.png',
  40: 'https://cdn.discordapp.com/attachments/1144675871798591569/1408386933838581860/quest40.png',
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
    console.error('[tarot2] getUserRow error:', error.message);
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
    console.error('[tarot2] addPoints RPC error:', error.message);
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
        { type: 12, items: [{ media: { url: 'https://cdn.discordapp.com/attachments/1144675871798591569/1361686555370061984/GIF_20250415_195548_457.gif?ex=67ffa8ed&is=67fe576d&hm=3e77e7087384ace99deb98b06d8bbf72a8d852db396cc4b9e784fb2d8210eaef&' } }] },
        { type: 14, spacing: 2 },
        {
          type: 10,
          content:
            `## ${cfg.emojis.loading}︲__\` คำทำนายกำลังจะปรากฎ! 𓂃 \`__\n` +
            `คำทำนายนี้เป็นเพียงการคาดการณ์ อาจไม่ตรงกับความเป็นจริง ขอให้ใช้วิจารณญาณในการอ่าน และใช้งานเพื่อความบันเทิงน้า ${cfg.emojis.plant}\n`
        },
        { type: 14, spacing: 2 }
      ]
    }]
  };
}

// ─── Payload: Card Only (กรณีกดรับรางวัลไปแล้ว tarot_point >= mission_target) ─
function buildCardPayload(questImgUrl, earnedPoints) {
  const pi = cfg.point_icon;
  return {
    flags: FLAG_V2,
    components: [{
      type: 17,
      components: [
        { type: 12, items: [{ media: { url: questImgUrl } }] },
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
function buildCombinedPayload(questImgUrl, earnedPoints, tarotPoint, isComplete) {
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
        { type: 12, items: [{ media: { url: questImgUrl } }] },
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
function setupTarot2(client) {

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  // ── Listener: ข้อความ "คำทำนายของฉัน" ──────────────────────────────────────
  client.on('messageCreate', async (message) => {
    if (!message.guild)     return;
    if (message.author.bot) return;
    if (message.channel.id !== cfg.channel_id) return;
    if (message.content.trim() !== 'คำทำนายของฉันคือ') return;

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
    const cdExpiry   = await getCooldown(supabase, userId, 'tarot2');

    if (now < cdExpiry) {
      await message.reply({ content: cooldownContent(userId, Math.floor(cdExpiry / 1000)) });
      return;
    }
    await setCooldown(supabase, userId, 'tarot2', now + cdDuration);

    // ── ส่ง Loading reply ────────────────────────────────────────────────────
    const loadingMsg = await message.reply(buildLoadingPayload());

    // ── เตรียมข้อมูลทั้งหมดระหว่างรอ 5 วินาที ────────────────────────────────
    const [userRow] = await Promise.all([
      getUserRow(supabase, userId),
      new Promise(r => setTimeout(r, 5000))
    ]);
    const tarotPoint = userRow.tarot_point ?? 0;

    // ── สุ่มรูป quest (1–40) + แต้ม ─────────────────────────────────────────
    const questId      = randInt(1, 40);
    const questImgUrl  = QUEST_IMAGES[questId];
    const earnedPoints = randInt(cfg.point_reward_min, cfg.point_reward_max);

    // ── ตรวจว่ากดรับรางวัลไปแล้วหรือยัง ──────────────────────────────────────
    const alreadyClaimed = userRow.mission_claimed === true;

    // ── บันทึกแต้มลง Supabase (atomic) ──────────────────────────────────────
    const tarotDelta        = alreadyClaimed ? 0 : Math.min(1, cfg.mission_target - tarotPoint);
    const { newTarotPoint } = await addPoints(supabase, userId, earnedPoints, tarotDelta);
    const missionComplete   = newTarotPoint >= cfg.mission_target;

    // ── ลบ loading + ส่ง result พร้อมกัน ─────────────────────────────────────
    const deletePromise = loadingMsg.deletable
      ? loadingMsg.delete().catch(err => console.error('[tarot2] delete loading error:', err.message))
      : Promise.resolve();

    const sendPromise = alreadyClaimed
      ? message.reply(buildCardPayload(questImgUrl, earnedPoints))
      : message.reply(buildCombinedPayload(questImgUrl, earnedPoints, newTarotPoint, missionComplete));

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
          console.error('[tarot2] addRole error:', err.message);
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
          console.error('[tarot2] Mission Claim Error:', error);
        }
      }
    }
  });

  console.log('[tarot2] ✅ ระบบดูดวง tarot2 พร้อมใช้งาน');
}

module.exports = { setupTarot2 };
