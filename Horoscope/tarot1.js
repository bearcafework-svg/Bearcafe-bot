// Horoscope/tarot1.js
// คำสั่ง "ดูคำทำนาย" — สุ่มไพ่ทาโรต์ + ระบบ Mission

const { createClient } = require('@supabase/supabase-js');
const cfg       = require('./settingtarot.json');
const infotarot = require('./Infotarot.json');
const { blacklistComponent, cooldownContent, otherCommandsComponent } = require('../shared/tarotComponents');

// ─── Cooldown store (in-memory) ───────────────────────────────────────────────
const cooldowns = new Map();

// ─── Helper: random int ───────────────────────────────────────────────────────
function randInt(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// ─── Helper: ดึง user row จาก user_points ────────────────────────────────────
// primary key คือ discord_id ตาม schema จริง
async function getUserRow(supabase, userId) {
  const { data, error } = await supabase
    .from('user_points')
    .select('points, tarot_point')
    .eq('discord_id', userId)   // ✅ แก้จาก member_id → discord_id
    .single();
  if (error) {
    // PGRST116 = row not found → คืนค่า default แทน throw
    if (error.code === 'PGRST116') return { points: 0, tarot_point: 0 };
    console.error('[tarot1] getUserRow error:', error.message);
    return { points: 0, tarot_point: 0 };
  }
  return data ?? { points: 0, tarot_point: 0 };
}

// ─── Helper: atomic upsert แต้ม ──────────────────────────────────────────────
// ใช้ upsert + onConflict + increment expression ผ่าน RPC เพื่อป้องกัน race condition
// Supabase ไม่รองรับ increment โดยตรงใน upsert → ใช้ RPC function ที่ต้องสร้างใน Supabase
//
// SQL ที่ต้องรันใน Supabase SQL Editor ครั้งเดียว:
// ─────────────────────────────────────────────────────────────────────────────
// CREATE OR REPLACE FUNCTION add_tarot_points(
//   p_discord_id TEXT,
//   p_points_delta INTEGER,
//   p_tarot_delta INTEGER
// ) RETURNS TABLE(new_points INTEGER, new_tarot_point INTEGER)
// LANGUAGE plpgsql AS $$
// BEGIN
//   INSERT INTO user_points (discord_id, points, tarot_point)
//   VALUES (p_discord_id, p_points_delta, p_tarot_delta)
//   ON CONFLICT (discord_id) DO UPDATE
//     SET points      = user_points.points      + p_points_delta,
//         tarot_point = user_points.tarot_point + p_tarot_delta,
//         updated_at  = now();
//   RETURN QUERY
//     SELECT points, tarot_point FROM user_points WHERE discord_id = p_discord_id;
// END;
// $$;
// ─────────────────────────────────────────────────────────────────────────────
async function addPoints(supabase, userId, pointsDelta, tarotPointDelta = 0) {
  const { data, error } = await supabase.rpc('add_tarot_points', {
    p_discord_id:   userId,
    p_points_delta: pointsDelta,
    p_tarot_delta:  tarotPointDelta,
  });
  if (error) {
    console.error('[tarot1] addPoints error:', error.message);
    // fallback: ดึงค่าเดิมแล้วบวกแบบเดิม (กรณี RPC ยังไม่ถูกสร้าง)
    const row = await getUserRow(supabase, userId);
    const newPoints     = (row.points      ?? 0) + pointsDelta;
    const newTarotPoint = (row.tarot_point ?? 0) + tarotPointDelta;
    await supabase
      .from('user_points')
      .upsert(
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

// ─── Component v2 payload: Loading ───────────────────────────────────────────
function buildLoadingPayload() {
  return {
    flags: 32768,
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

// ─── Component v2 payload: Mission (components1) ─────────────────────────────
function buildMissionPayload(tarotPoint, isComplete) {
  const progressBar = buildProgressBar(tarotPoint);
  return {
    flags: 32768,
    components: [{
      type: 17,
      components: [
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
              `${progressBar}`
          }],
          accessory: {
            type: 11,
            media: { url: 'https://media.discordapp.net/attachments/1144675871798591569/1377501031541506162/64603-purpleween.png?ex=6a2793ce&is=6a26424e&hm=aaa4a4ffaa1643c61b7de85b7ba56bca75dbc88d0c1116f39d2692991e6e7709&format=webp&quality=lossless&width=160&height=160&' }
          }
        },
        { type: 14, spacing: 2 },
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
        }
      ]
    }]
  };
}

// ─── Component v2 payload: Card Result (components2) ─────────────────────────
function buildCardPayload(card, earnedPoints) {
  const pi = cfg.point_icon;
  return {
    flags: 32768,
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
          // ✅ Link button (style 5) ห้ามมี custom_id — ลบออก
          accessory: {
            type:    2,
            style:   5,
            label:   `ได้รับ +${earnedPoints} แต้ม`,
            emoji:   { id: pi.id, name: pi.name, animated: pi.animated },
            url:     'https://discord.com/channels/1144251788493602848/1145305334806741122'
            // ไม่มี custom_id
          }
        },
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
              // ✅ Link button (style 5) ห้ามมี custom_id — ลบออก
              type:  2,
              style: 5,
              label: 'ดูดวงฟรี!',
              url:   `https://discord.com/channels/1144251788493602848/${cfg.channels.horoscope_info_channel}`
              // ไม่มี custom_id
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
    if (!message.guild)     return; // ไม่ตอบ DM
    if (message.author.bot) return;
    if (message.channel.id !== cfg.channel_id) return;
    if (message.content.trim() !== 'ดูคำทำนาย') return; // ตรงๆ เท่านั้น

    const member = message.member;
    const userId = message.author.id;

    // ── ตรวจ Blacklist Role ─────────────────────────────────────────────────
    const isBlacklisted = cfg.role_blacklist.some(id => member.roles.cache.has(id));
    if (isBlacklisted) {
      const { flags, components } = blacklistComponent(userId).data;
      const sent = await message.reply({ flags, components });
      setTimeout(() => sent.delete().catch(() => {}), 5000);
      return;
    }

    // ── ตรวจ Cooldown ────────────────────────────────────────────────────────
    const isPremium  = cfg.role_premium.some(id => member.roles.cache.has(id));
    const cdDuration = isPremium ? cfg.cooldown_premium_ms : cfg.cooldown_normal_ms;
    const now        = Date.now();
    const cdExpiry   = cooldowns.get(userId) ?? 0;

    if (now < cdExpiry) {
      const readyTs = Math.floor(cdExpiry / 1000);
      await message.reply({ content: cooldownContent(userId, readyTs) });
      return;
    }
    cooldowns.set(userId, now + cdDuration);

    // ── ส่ง Loading ──────────────────────────────────────────────────────────
    await message.reply(buildLoadingPayload());

    // ── รอ 5 วินาที (ห้ามแก้ไข loading message) ─────────────────────────────
    await new Promise(r => setTimeout(r, 5000));

    // ── ดึงข้อมูล User จาก Supabase (ก่อนบวกแต้ม) ───────────────────────────
    const userRow    = await getUserRow(supabase, userId);
    const tarotPoint = userRow.tarot_point ?? 0;   // ค่าก่อนบวก ใช้ตรวจ alreadyClaimed

    // ── สุ่มไพ่ id 1-78 ──────────────────────────────────────────────────────
    const cardId = String(randInt(1, 78));
    const card   = infotarot.cards[cardId];

    // ── สุ่มแต้ม min-max จาก settingtarot.json ───────────────────────────────
    const earnedPoints = randInt(cfg.point_reward_min, cfg.point_reward_max);

    // ── บันทึกแต้มลง Supabase (atomic) ──────────────────────────────────────
    const { newTarotPoint } = await addPoints(supabase, userId, earnedPoints, 1);
    const missionComplete   = newTarotPoint >= cfg.mission_target;

    // ── ส่ง Mission + Card ────────────────────────────────────────────────────
    // ซ่อน components1 เมื่อ tarot_point (ก่อนบวก) >= mission_target = กดรับรางวัลไปแล้ว
    const alreadyClaimed = tarotPoint >= cfg.mission_target;
    if (!alreadyClaimed) {
      await message.channel.send(buildMissionPayload(newTarotPoint, missionComplete));
    }
    await message.channel.send(buildCardPayload(card, earnedPoints));
  });

  // ── Listener: Interaction (ปุ่ม) ────────────────────────────────────────────
  client.on('interactionCreate', async (interaction) => {
    if (!interaction.isButton()) return;

    const { customId, user, member } = interaction;

    // ── ปุ่ม: ดูดวงแบบอื่น ─────────────────────────────────────────────────
    if (customId === 'tarot_other_commands') {
      const { flags, components } = otherCommandsComponent().data;
      await interaction.reply({ flags, components, ephemeral: true });
      return;
    }

    // ── ปุ่ม: กดรับรางวัล Mission ─────────────────────────────────────────
    if (customId === 'tarot_mission_claim') {
      const userRow    = await getUserRow(supabase, user.id);
      const tarotPoint = userRow.tarot_point ?? 0;

      if (tarotPoint < cfg.mission_target) {
        await interaction.reply({ content: '❌ แต้มดูดวงของคุณยังไม่ครบนะคะ!', ephemeral: true });
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

      // เพิ่มแต้มรางวัลลง Supabase (atomic)
      await addPoints(supabase, user.id, cfg.mission_reward_points, 0);

      // แก้ไขปุ่มเป็น "รับรางวัลเรียบร้อย!" + disabled
      await interaction.update({
        components: interaction.message.components.map(row => ({
          ...row,
          components: row.components.map(btn =>
            btn.custom_id === 'tarot_mission_claim'
              ? { ...btn, label: 'รับรางวัลเรียบร้อย!', emoji: { id: '1358584609087946867', name: '50121checkmark', animated: false }, disabled: true, style: 1 }
              : btn
          )
        }))
      });
    }
  });

  console.log('[tarot1] ✅ ระบบดูดวง tarot1 พร้อมใช้งาน');
}

module.exports = { setupTarot1 };
