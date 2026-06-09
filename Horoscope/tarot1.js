// Horoscope/tarot1.js
// คำสั่ง "ดูคำทำนาย" — สุ่มไพ่ทาโรต์ + ระบบ Mission

const { createClient } = require('@supabase/supabase-js');
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
    if (error.code === 'PGRST116') return { points: 0, tarot_point: 0, mission_claimed: false }; // row not found
    console.error('[tarot1] getUserRow error:', error.message);
    return { points: 0, tarot_point: 0, mission_claimed: false };
  }
  return data ?? { points: 0, tarot_point: 0, mission_claimed: false };
}

// ─── Helper: atomic upsert แต้ม ──────────────────────────────────────────────
// ต้องสร้าง RPC ใน Supabase SQL Editor ก่อน (ดู SQL ด้านล่าง)
// CREATE OR REPLACE FUNCTION add_tarot_points(p_discord_id TEXT, p_points_delta INTEGER, p_tarot_delta INTEGER)
// RETURNS TABLE(new_points INTEGER, new_tarot_point INTEGER) LANGUAGE plpgsql AS $$
// BEGIN
//   INSERT INTO user_points (discord_id, points, tarot_point)
//   VALUES (p_discord_id, p_points_delta, p_tarot_delta)
//   ON CONFLICT (discord_id) DO UPDATE
//     SET points=user_points.points+p_points_delta, tarot_point=user_points.tarot_point+p_tarot_delta, updated_at=now();
//   RETURN QUERY SELECT points, tarot_point FROM user_points WHERE discord_id=p_discord_id;
// END; $$;
async function addPoints(supabase, userId, pointsDelta, tarotPointDelta = 0) {
  const { data, error } = await supabase.rpc('add_tarot_points', {
    p_discord_id:   userId,
    p_points_delta: pointsDelta,
    p_tarot_delta:  tarotPointDelta,
  });
  if (error) {
    console.error('[tarot1] addPoints RPC error:', error.message);
    // fallback non-atomic (กรณียังไม่ได้สร้าง RPC)
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
        { type: 12, items: [{ media: { url: 'https://cdn.discordapp.com/attachments/1144675871798591569/1462062737537372337/GIF_20260117_193001_429.gif' } }] },
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
function buildCardPayload(card, earnedPoints) {
  const pi = cfg.point_icon;
  return {
    flags: FLAG_V2,
    components: [{
      type: 17,
      components: [
        { type: 12, items: [{ media: { url: card.img } }] },
        { type: 14, spacing: 2 },
        {
          type: 9,
          components: [{
            type: 10,
            content:
              `## ${cfg.emojis.purpleween}︲__\` ${card.name} ₊ ☾ 𓂃 \`__\n` +
              `-# ${card.meaning} ${cfg.emojis.plant}\n\n` +
              `> ${card.prediction}`
          }],
          // Link button ห้ามมี custom_id
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
              custom_id: 'tarot_other_commands',
              label:     '︲ดูดวงแบบอื่น',
              emoji:     { id: '1256669436350562355', name: 'bee20000', animated: false },
              flow:      { actions: [] }
            },
            {
              // Link button ห้ามมี custom_id
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
function buildCombinedPayload(card, earnedPoints, tarotPoint, isComplete) {
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
        { type: 12, items: [{ media: { url: card.img } }] },
        { type: 14, spacing: 2 },
        {
          type: 9,
          components: [{
            type: 10,
            content:
              `## ${cfg.emojis.purpleween}︲__\` ${card.name} ₊ ☾ 𓂃 \`__\n` +
              `-# ${card.meaning} ${cfg.emojis.plant}\n\n` +
              `> ${card.prediction}`
          }],
          // Link button ห้ามมี custom_id
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
              custom_id: 'tarot_other_commands',
              label:     '︲ดูดวงแบบอื่น',
              emoji:     { id: '1256669436350562355', name: 'bee20000', animated: false },
              flow:      { actions: [] }
            },
            {
              // Link button ห้ามมี custom_id
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
function setupTarot1(client) {

  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  // ── Listener: ข้อความ "ดูคำทำนาย" ──────────────────────────────────────────
  client.on('messageCreate', async (message) => {
    if (!message.guild)     return;
    if (message.author.bot) return;
    if (message.channel.id !== cfg.channel_id) return;
    if (message.content.trim() !== 'ดูคำทำนาย') return;

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

    // ── เตรียมข้อมูลทั้งหมดระหว่างรอ 5 วินาที (ให้ smooth ไม่มี gap) ────────
    const [userRow] = await Promise.all([
      getUserRow(supabase, userId),
      new Promise(r => setTimeout(r, 5000))
    ]);
    const tarotPoint = userRow.tarot_point ?? 0;

    // ── สุ่มไพ่ + แต้ม ───────────────────────────────────────────────────────
    const cardId       = String(randInt(1, 78));
    const card         = infotarot.cards[cardId];
    const earnedPoints = randInt(cfg.point_reward_min, cfg.point_reward_max);

    // ── ตรวจว่ากดรับรางวัลไปแล้วหรือยัง (ดูจาก mission_claimed ใน DB) ─────────
    // ไม่ดูจาก tarotPoint เพราะ 50 แล้วยังไม่กด != กดแล้ว
    const alreadyClaimed = userRow.mission_claimed === true;

    // ── บันทึกแต้มลง Supabase (atomic) ──────────────────────────────────────
    // tarot_point หยุดนับที่ mission_target เพื่อป้องกัน 49→51
    // กรณียังไม่กดรับ: บวกได้สูงสุดถึง mission_target เท่านั้น
    const tarotDelta        = alreadyClaimed ? 0 : Math.min(1, cfg.mission_target - tarotPoint);
    const { newTarotPoint } = await addPoints(supabase, userId, earnedPoints, tarotDelta);
    const missionComplete   = newTarotPoint >= cfg.mission_target;

    // ── ลบ loading + ส่ง result พร้อมกัน (ไม่มี gap) ─────────────────────────
    const deletePromise = loadingMsg.deletable
      ? loadingMsg.delete().catch(err => console.error('[tarot1] delete loading error:', err.message))
      : Promise.resolve();

    const sendPromise = alreadyClaimed
      ? message.reply(buildCardPayload(card, earnedPoints))
      : message.reply(buildCombinedPayload(card, earnedPoints, newTarotPoint, missionComplete));

    await Promise.all([deletePromise, sendPromise]);
  });

  // ── Listener: Interaction (ปุ่ม) ────────────────────────────────────────────
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const { customId, user, member } = interaction;

    // ── ปุ่ม: ดูดวงแบบอื่น ─────────────────────────────────────────────────
    if (customId === 'tarot_other_commands') {
      // ✅ ใช้ flags: FLAG_V2_EPH แทน ephemeral: true (deprecated)
      const payload = otherCommandsPayload();
      await interaction.reply({
        flags:      FLAG_V2_EPH,   // Component v2 (32768) | Ephemeral (64) = 32832
        components: payload.components
      });
      return;
    }

// ── ปุ่ม: กดรับรางวัล Mission ─────────────────────────────────────────
    if (customId === 'tarot_mission_claim') {
      const userRow    = await getUserRow(supabase, user.id);
      const tarotPoint = userRow.tarot_point ?? 0;

      if (tarotPoint < cfg.mission_target) {
        await interaction.reply({
          flags:   FLAG_EPHEMERAL,
          content: '❌ แต้มดูดวงของคุณยังไม่ครบนะคะ!'
        });
        return;
      }

      // เพิ่ม role
      try {
        if (!member.roles.cache.has(cfg.mission_reward_role)) {
          await member.roles.add(cfg.mission_reward_role);
        }
      } catch (err) {
        console.error('[tarot1] addRole error:', err.message);
      }

      // เพิ่มแต้มรางวัล (atomic) + mark mission_claimed = true
      await Promise.all([
        addPoints(supabase, user.id, cfg.mission_reward_points, 0),
        supabase.from('user_points').update({ mission_claimed: true }).eq('discord_id', user.id)
      ]);

      // ฟังก์ชันสำหรับค้นหาและแก้ไขปุ่มใน Component V2 ทุกระดับชั้น (Recursive)
      const updateButtonDeep = (components) => {
        return components.map(c => {
          // ดึง Raw object ออกมาจาก discord.js (ถ้าถูก Cache ไว้)
          let comp = typeof c.toJSON === 'function' ? c.toJSON() : { ...c };

          // ถ้าเจอปุ่มเป้าหมาย ให้ทำการเปลี่ยนหน้าตาและปิดการกด (disabled)
          if (comp.custom_id === 'tarot_mission_claim') {
            return {
              ...comp,
              label:    'รับรางวัลเรียบร้อย!',
              emoji:    { id: '1358584609087946867', name: '50121checkmark', animated: false },
              disabled: true,
              style:    1 // เปลี่ยนเป็นสีหลัก (Primary) เพื่อให้ดูเหมือนสำเร็จแล้ว
            };
          }

          // ถ้า Component นี้มีลูกซ้อนอยู่ข้างใน (เช่น Type 17 หรือ Type 1) ให้ทะลวงลงไปหาต่อ
          if (comp.components) {
            comp.components = updateButtonDeep(comp.components);
          }
          return comp;
        });
      };

      // นำโครงสร้างเดิมมาอัปเดตปุ่มเป้าหมาย
      const updatedComponents = updateButtonDeep(interaction.message.components);

      // อัปเดต UI กลับไป พร้อมแนบ flags: FLAG_V2 
      await interaction.update({
        flags: FLAG_V2, 
        components: updatedComponents
      });
    }
  });

  console.log('[tarot1] ✅ ระบบดูดวง tarot1 พร้อมใช้งาน');
}

module.exports = { setupTarot1 };
