// points/checkIn.js
// ระบบเช็กอินรับแต้มแบบใหม่

const { createClient } = require('@supabase/supabase-js');
const { MessageFlags } = require('discord.js');
const cfg = require('./settingCheckIn.json');
const { blacklistPayload, cooldownContent } = require('../features/shared/tarotComponents');

// ─── Cooldown store (in-memory) ───────────────────────────────────────────────
const cooldowns = new Map();

const FLAG_V2 = MessageFlags.IsComponentsV2; // 32768
const FLAG_EPHEMERAL = MessageFlags.Ephemeral; // 64

// ─── Helper: atomic upsert แต้ม ──────────────────────────────────────────────
async function addPoints(supabase, userId, pointsDelta) {
  const { data, error } = await supabase.rpc('add_tarot_points', {
    p_discord_id: userId,
    p_points_delta: pointsDelta,
    p_tarot_delta: 0,
  });
  if (error) {
    console.error('[checkIn] addPoints RPC error:', error.message);
    // Fallback if RPC fails
    const { data: row } = await supabase
      .from('user_points')
      .select('points')
      .eq('discord_id', userId)
      .single();
      
    const newPoints = (row?.points ?? 0) + pointsDelta;
    await supabase.from('user_points').upsert(
      { discord_id: userId, points: newPoints },
      { onConflict: 'discord_id' }
    );
    return newPoints;
  }
  return data?.[0]?.new_points ?? 0;
}

// ─── Random Reward ────────────────────────────────────────────────────────────
function rollReward() {
  const roll = Math.random() * 100;
  let cumulative = 0;
  for (const tier of cfg.tiers) {
    cumulative += tier.rate;
    if (roll <= cumulative) {
      return tier;
    }
  }
  return cfg.tiers[0]; // Fallback to common
}

// ─── Payloads ─────────────────────────────────────────────────────────────────
function buildLoadingPayload(randomMessage) {
  const containerComponents = [];
  if (cfg.loading_gif) {
    containerComponents.push({ type: 12, items: [{ media: { url: cfg.loading_gif } }] });
    containerComponents.push({ type: 14, spacing: 2 });
  }
  
  containerComponents.push({
    type: 10,
    content: `## <a:rollingstar:1150845686628229151>︲__\` 𝖱𝖾𝗐𝖺𝗋𝖽 𝖱𝗈𝗎𝗅𝖾𝗍𝗍𝖾 ₊ กำลังสุ่มรางวัล . . . \`__\n> <a:27073hispeechbubble:1518217054711189644>︰${randomMessage} <:cuteplant:1152834055528783872>`
  });
  containerComponents.push({ type: 14, spacing: 2 });

  return {
    flags: FLAG_V2,
    components: [{
      type: 17,
      components: containerComponents
    }]
  };
}

function buildClaimPayload(tier, nextCooldownTimestamp, premiumRoleInfo) {
  const pi = cfg.point_icon;
  const iconStr = pi.animated ? `<a:${pi.name}:${pi.id}>` : `<:${pi.name}:${pi.id}>`;

  let content = `## ${iconStr}︲__\` 𝖢𝗅𝖺𝗂𝗆 𝖱𝖾𝗐𝖺𝗋𝖽 ₊ ยินดีด้วยคุณได้รับ ${tier.points.toLocaleString()} 𓂃 \`__\n` +
    `> <a:27073hispeechbubble:1518217054711189644>︰คุณสามารถเช็กแต้มและแลกยศตกแต่งได้ที่ <#1145305334806741122>\n` +
    `> <a:7596clock:1160230591892029510>︰กลับมาเช็กอินได้ใน <t:${nextCooldownTimestamp}:R> <:cuteplant:1152834055528783872>\n`;

  if (premiumRoleInfo) {
    content += `\nสุดยอด! ${premiumRoleInfo.emoji}**︲\`@${premiumRoleInfo.name}\`** ปลดล็อกความสามารถสุดพิเศษ ทำให้เวลาในการเช็กอินลดลงแบบเห็นได้ชัด!`;
  }

  const containerComponents = [];
  containerComponents.push({ type: 12, items: [{ media: { url: tier.url } }] });
  containerComponents.push({ type: 14, spacing: 2 });

  containerComponents.push({
    type: 10,
    content: content
  });
  containerComponents.push({ type: 14, spacing: 2 });
  containerComponents.push({
    type: 1,
    components: [{
      type: 2,
      style: 5,
      label: "︲คลิกเพื่อเช็กแต้ม",
      emoji: { id: "1256669436350562355", name: "bee20000", animated: false },
      url: "https://discord.com/channels/1144251788493602848/1145305334806741122"
    }]
  });

  return {
    flags: FLAG_V2,
    components: [{
      type: 17,
      components: containerComponents
    }]
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────
function setupCheckIn(client) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  client.on('messageCreate', async (message) => {
    if (!message.guild) return;
    if (message.author.bot) return;
    if (message.channel.id !== cfg.channel_id) return;
    
    // ต้องพิมพ์คำว่า "เช็กอิน" หรือ "เช็คอิน" เป๊ะๆ
    const contentText = message.content.trim();
    if (contentText !== 'เช็กอิน' && contentText !== 'เช็คอิน') return;

    const member = message.member;
    const userId = message.author.id;

    // ── ตรวจ Blacklist Role ─────────────────────────────────────────────────
    const isBlacklisted = cfg.role_blacklist.some(id => member.roles.cache.has(id));
    if (isBlacklisted) {
      const sent = await message.reply(blacklistPayload(userId));
      setTimeout(() => sent.delete().catch(() => {}), 5000);
      return;
    }

    // ── ตรวจสอบ Cooldown ──────────────────────────────────────────────────────
    const has2h = member.roles.cache.has(cfg.roles.premium_2h);
    const has4h = member.roles.cache.has(cfg.roles.premium_4h);
    
    let cdDuration = cfg.cooldown_ms.normal;
    if (has2h) cdDuration = cfg.cooldown_ms.premium_2h;
    else if (has4h) cdDuration = cfg.cooldown_ms.premium_4h;

    const now = Date.now();
    const cdExpiry = cooldowns.get(userId) ?? 0;
    
    if (now < cdExpiry) {
      const readyTimestamp = Math.floor(cdExpiry / 1000);
      await message.reply({ content: cooldownContent(userId, readyTimestamp) });
      return;
    }

    message.react('1358584609087946867').catch(() => {});

    // ตั้งค่า Cooldown ล่วงหน้า ป้องกันคนสแปมส่งข้อความรัวๆ
    const nextExpiry = now + cdDuration;
    cooldowns.set(userId, nextExpiry);

    // ── แสดงข้อความ Loading ────────────────────────────────────────────────
    const randomMsgIndex = Math.floor(Math.random() * cfg.random_messages.length);
    const loadingMessageText = cfg.random_messages[randomMsgIndex];
    const loadingPayload = buildLoadingPayload(loadingMessageText);
    
    const sentMsg = await message.reply(loadingPayload);

    // ── หน่วงเวลา 7 วินาที ─────────────────────────────────────────────────
    await new Promise(resolve => setTimeout(resolve, 7000));

    // ── สุ่มรางวัล & แจกแต้ม ──────────────────────────────────────────────────
    const rewardTier = rollReward();
    await addPoints(supabase, userId, rewardTier.points);

    // ── สร้างข้อความเคลมรางวัลและอัปเดต ──────────────────────────────────────────
    let premiumRoleInfo = null;
    if (has2h) {
      premiumRoleInfo = {
        name: member.guild.roles.cache.get(cfg.roles.premium_2h)?.name || 'Premium',
        emoji: '<:GoldenBean:1521243296956027041>'
      };
    } else if (has4h) {
      premiumRoleInfo = {
        name: member.guild.roles.cache.get(cfg.roles.premium_4h)?.name || 'Premium',
        emoji: '<:SilverBean:1521243279159591083>'
      };
    }
    
    const nextExpiryTimestamp = Math.floor(nextExpiry / 1000);
    const claimPayload = buildClaimPayload(rewardTier, nextExpiryTimestamp, premiumRoleInfo);

    // ลบข้อความเก่าแล้วส่งใหม่ (ตามที่ผู้ใช้รีเควส "รอ 7 วิแล้วลบส่งอันใหม่")
    await sentMsg.delete().catch(() => {});
    await message.reply(claimPayload);
  });

  console.log('[checkIn] Module loaded successfully');
}

module.exports = { setupCheckIn };
