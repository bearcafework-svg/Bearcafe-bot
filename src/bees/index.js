// src/bees/index.js
// จุดเชื่อมต่อหลักของระบบเจ้าผึ้ง (Bee System Feature Entry Point)

const { createClient } = require('@supabase/supabase-js');
const sharedSettings = require('../sharedSettings.json');
const {
  getSettingBee,
  spawnBee,
  scheduleNextAutoSpawn,
  handleBeeInteraction,
  handleSpyBeeChatMessage,
  checkAndCleanExpiredBees,
  generateMathProblem
} = require('./beeManager');
const {
  buildBeeSpawnPayload,
  buildBeeWinPayload,
  buildBeeLossPayload,
  buildBeePoisonLossPayload,
  buildBeeExpiredPayload,
  buildQueenBeeWinPayload,
  buildQueenBeeLossPayload,
  buildVampireDrainSelfPayload,
  buildVampireAwakenPayload,
  buildVampireTargetResultPayload,
  buildSpyBeeSpawnPayload,
  buildSpyBeeRewardPayload,
  buildSpyBeeQuestResultPayload,
  buildSpyBeeAllGonePayload,
  buildMathBeeSpawnPayload,
  buildMathBeeWinPayload
} = require('./beePayloads');

function setupBees(client) {
  // สร้าง Supabase Client
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  client.once('clientReady', async () => {
    // (Slash commands /spawn_bee, /bee_config, /test_bee ลงทะเบียนรวมที่ slashCommandRegistry)

    // เช็กและแก้ไขข้อความผึ้งที่ค้างเกิน 15 นาที
    await checkAndCleanExpiredBees(client);

    // เริ่มต้น Auto Spawn Loop
    scheduleNextAutoSpawn(client);
  });

  client.on('interactionCreate', async (interaction) => {
    try {
      // Autocomplete สำหรับ /spawn_bee
      if (interaction.isAutocomplete() && interaction.commandName === 'spawn_bee') {
        const setting = getSettingBee();
        const bees = setting.bees || [];
        const focusedValue = interaction.options.getFocused().toLowerCase();

        const filtered = bees
          .filter(
            (b) =>
              b.name.toLowerCase().includes(focusedValue) ||
              b.id.toLowerCase().includes(focusedValue) ||
              String(b.sequence_order).includes(focusedValue) ||
              `ผึ้ง${b.sequence_order}`.includes(focusedValue)
          )
          .slice(0, 25)
          .map((b) => ({
            name: `${b.sequence_order || '•'}. ${b.name} (${b.id})`,
            value: b.id
          }));

        return interaction.respond(filtered);
      }

      if (interaction.isChatInputCommand()) {
        const staffRoles = sharedSettings.staff_roles || [];
        const memberRoles = interaction.member?.roles;
        const hasStaffRole = staffRoles.some((id) =>
          memberRoles?.cache ? memberRoles.cache.has(id) : (Array.isArray(memberRoles) ? memberRoles.includes(id) : false)
        );
        const isStaff =
          hasStaffRole ||
          interaction.guild?.ownerId === interaction.user.id ||
          interaction.user.id === process.env.OWNER_ID;

        // 1. คำสั่ง /spawn_bee
        if (interaction.commandName === 'spawn_bee') {
          if (!isStaff) {
            return interaction.reply({
              content: '## ⚠️︲เฉพาะ Staff ของคาเฟ่หมีเท่านั้นที่สามารถใช้คำสั่งนี้ได้ค่ะ',
              flags: 64
            }).catch(() => {});
          }

          const requestedBeeId = interaction.options.getString('bee_id');
          const targetChannel = interaction.options.getChannel('channel');
          const targetChannelId = targetChannel?.id || null;

          await interaction.reply({
            content: `## 🐝︲กำลังปล่อยเจ้าผึ้ง (${requestedBeeId || 'สุ่มอัตโนมัติ'})${targetChannel ? ` ลงในช่อง <#${targetChannel.id}>` : ' ลงในสวน'} เรียบร้อยแล้วค่ะ!`,
            flags: 64
          }).catch(() => {});

          await spawnBee(client, requestedBeeId, targetChannelId);
          return;
        }

        // 2. คำสั่ง /bee_config
        if (interaction.commandName === 'bee_config') {
          if (!isStaff) {
            return interaction.reply({
              content: '## ⚠️︲เฉพาะ Staff ของคาเฟ่หมีเท่านั้นที่สามารถใช้คำสั่งนี้ได้ค่ะ',
              flags: 64
            }).catch(() => {});
          }

          const setting = getSettingBee();
          const beesText = (setting.bees || [])
            .map(
              (b) =>
                `- ${b.enabled ? '🟢' : '🔴'} **${b.name}** (\`${b.id}\`): ชนะ ${(b.win_rate * 100).toFixed(0)}% | แต้ม +${b.min_win_points}-${b.max_win_points} | เสีย -${b.min_loss_points}-${b.max_loss_points}`
            )
            .join('\n');

          const statusContent =
            `## 🐝︲__\` 𝖡𝖾𝖾 𝖲𝗒𝗌𝗍𝖾𝗆 ₊ สถานะระบบเจ้าผึ้ง 𓂃 \`__\n` +
            `- **สถานะ Auto Spawn**: ${setting.auto_spawn_enabled ? '🟢 เปิดใช้งาน' : '🔴 ปิดใช้งาน'}\n` +
            `- **ช่วงเวลาสุ่ม**: ทุกๆ ${setting.min_spawn_minutes} - ${setting.max_spawn_minutes} นาที\n` +
            `- **โหมดการส่ง**: \`${setting.spawn_mode || 'weighted_random'}\`\n\n` +
            `### 📋 รายชื่อผึ้งในระบบ:\n${beesText}`;

          return interaction.reply({
            flags: 32768 | 64, // Ephemeral V2
            components: [
              {
                type: 17,
                components: [
                  { type: 14, spacing: 2, divider: false },
                  { type: 10, content: statusContent },
                  { type: 14, spacing: 2, divider: false }
                ]
              }
            ]
          }).catch(() => {});
        }

        // 3. คำสั่ง /test_bee (สำหรับทดสอบพรีวิว UI หรือปล่อยผึ้งมาเล่นจริง)
        if (interaction.commandName === 'test_bee') {
          if (!isStaff) {
            return interaction.reply({
              content: '## ⚠️︲เฉพาะ Staff ของคาเฟ่หมีเท่านั้นที่สามารถใช้คำสั่งนี้ได้ค่ะ',
              flags: 64
            }).catch(() => {});
          }

          const beeId = interaction.options.getString('bee_id');
          const mode = interaction.options.getString('mode') || 'spawn';
          const targetState = interaction.options.getString('state') || null;

          const setting = getSettingBee();
          const beeConfig = (setting.bees || []).find((b) => b.id === beeId) || { id: beeId, name: beeId };
          const bgUrl = setting.garden_background_url;
          const dummyUserId = interaction.user.id;

          // 3.1 โหมดปล่อยให้กดเล่นจริง (Interactive Spawn)
          if (mode === 'spawn') {
            await interaction.reply({
              content: `## 🧪︲[โหมดทดสอบ] กำลังปล่อย **${beeConfig.name}** ออกมาให้กดทดสอบในห้องนี้ค่ะ!`,
              flags: 64
            }).catch(() => {});
            await spawnBee(client, beeId, interaction.channelId);
            return;
          }

          // 3.2 โหมดพรีวิว Component v2 (Preview States)
          await interaction.reply({
            content: `## 🎨︲[โหมดพรีวิว] กำลังแสดงผล UI สถานะต่างๆ ของ **${beeConfig.name}** ในห้องนี้ค่ะ!`,
            flags: 64
          }).catch(() => {});

          const channel = interaction.channel;
          if (!channel) return;

          // ฟังก์ชันส่งพรีวิว
          const sendPreview = async (title, payload) => {
            await channel.send({ content: `### 📌 พรีวิวสถานะ: **${title}**` }).catch(() => {});
            await channel.send(payload).catch((e) => console.error('[bees] Preview send error:', e.message));
          };

          // ก) ผึ้งอ้วนตัวกลม (fat_round_bee)
          if (beeId === 'fat_round_bee') {
            if (!targetState || targetState === 'spawn') {
              await sendPreview('1. เกิดใหม่ (Spawn - Waiting)', buildBeeSpawnPayload(beeConfig, 'preview_wait', false, bgUrl));
              await sendPreview('2. เกิดใหม่พร้อมกด (Spawn - Ready)', buildBeeSpawnPayload(beeConfig, 'preview_ready', true, bgUrl));
            }
            if (!targetState || targetState === 'win') {
              await sendPreview('3. ขโมยสตรอว์เบอร์รีสำเร็จ (Win)', buildBeeWinPayload(beeConfig, dummyUserId, 35, bgUrl));
            }
            if (!targetState || targetState === 'loss') {
              await sendPreview('4. โดนต่อยแต้มลด (Loss)', buildBeeLossPayload(beeConfig, dummyUserId, 25, bgUrl));
            }
            if (!targetState || targetState === 'poison') {
              await sendPreview('5. แต้มไม่พอ โดนพิษเต็มแรง (Poison)', buildBeePoisonLossPayload(beeConfig, dummyUserId, 150, bgUrl));
            }
            if (!targetState || targetState === 'expired') {
              await sendPreview('6. บินกลับรังเมื่อไม่มีคนสนใจ 15 นาที (Expired)', buildBeeExpiredPayload(beeConfig, bgUrl));
            }
            return;
          }

          // ข) นางพญาผึ้ง (queen_bee)
          if (beeId === 'queen_bee') {
            if (!targetState || targetState === 'spawn') {
              await sendPreview('1. เกิดใหม่พร้อมกด (Spawn - Ready)', buildBeeSpawnPayload(beeConfig, 'preview_ready', true, bgUrl));
            }
            if (!targetState || targetState === 'win') {
              await sendPreview('2. ขโมยสตรอว์เบอร์รีสำเร็จ (Win Normal)', buildQueenBeeWinPayload(beeConfig, dummyUserId, { isCrown: false, points: 75 }, bgUrl));
            }
            if (!targetState || targetState === 'crown') {
              await sendPreview('3. แจ็กพอตขโมยมงกุฎสำเร็จ! (Win Crown Jackpot)', buildQueenBeeWinPayload(beeConfig, dummyUserId, { isCrown: true, points: 250 }, bgUrl));
            }
            if (!targetState || targetState === 'loss') {
              await sendPreview('4. โดนต่อยแต้มลด (Loss)', buildQueenBeeLossPayload(beeConfig, dummyUserId, { type: 'normal', points: 60 }, bgUrl));
            }
            if (!targetState || targetState === 'poison') {
              await sendPreview('5. ล้มละลาย โดนยึดแต้มหมดตัว (Bankrupt)', buildQueenBeeLossPayload(beeConfig, dummyUserId, { type: 'bankrupt', previousPoints: 420 }, bgUrl));
              await sendPreview('6. โดนพิษนางพญา (Poison)', buildQueenBeeLossPayload(beeConfig, dummyUserId, { type: 'poison', points: 300 }, bgUrl));
            }
            if (!targetState || targetState === 'expired') {
              await sendPreview('7. บินกลับรังเมื่อไม่มีคนสนใจ 15 นาที (Expired)', buildBeeExpiredPayload(beeConfig, bgUrl));
            }
            return;
          }

          // ค) เจ้าผึ้งแวมไพร์ (vampire_bee)
          if (beeId === 'vampire_bee') {
            if (!targetState || targetState === 'spawn') {
              await sendPreview('1. เกิดใหม่ตอนหลับ (Spawn - Ready)', buildBeeSpawnPayload(beeConfig, 'preview_ready', true, bgUrl));
            }
            if (!targetState || targetState === 'loss') {
              await sendPreview('2. โดนกัดดูดพลังตัวเอง (Drain Self)', buildVampireDrainSelfPayload(beeConfig, dummyUserId, 20, bgUrl));
            }
            if (!targetState || targetState === 'awaken') {
              const expireTimestamp = Math.floor(Date.now() / 1000) + 60;
              await sendPreview('3. ผึ้งตื่นขึ้นมา ให้เวลาแท็กเพื่อน 60 วินาที (Awaken)', buildVampireAwakenPayload(beeConfig, dummyUserId, expireTimestamp, bgUrl));
            }
            if (!targetState || targetState === 'vampire_drain') {
              await sendPreview('4.1 ดูดแต้มเพื่อนสำเร็จ (Drain Success)', buildVampireTargetResultPayload(beeConfig, dummyUserId, client.user.id, { type: 'drain', points: 50 }, bgUrl));
              await sendPreview('4.2 แอบดูดบอท (Drain Bot)', buildVampireTargetResultPayload(beeConfig, dummyUserId, client.user.id, { type: 'bot' }, bgUrl));
              await sendPreview('4.3 แอบดูดคนจน (Drain Poor)', buildVampireTargetResultPayload(beeConfig, dummyUserId, client.user.id, { type: 'poor', points: 50 }, bgUrl));
              await sendPreview('4.4 แอบดูดเจ้าของเซิร์ฟ/บอส (Drain Owner)', buildVampireTargetResultPayload(beeConfig, dummyUserId, client.user.id, { type: 'owner' }, bgUrl));
            }
            if (!targetState || targetState === 'expired') {
              await sendPreview('5. บินกลับรังเมื่อไม่มีคนสนใจ 15 นาที (Expired)', buildBeeExpiredPayload(beeConfig, bgUrl));
            }
            return;
          }

          // ง) เจ้าผึ้งสายลับ (spy_bee)
          if (beeId === 'spy_bee') {
            if (!targetState || targetState === 'spawn') {
              await sendPreview('1. เกิดใหม่ 3 ดาว (Spawn 3 Stars)', buildSpyBeeSpawnPayload(beeConfig, 'preview_spy', [true, true, true], true, bgUrl));
            }
            if (!targetState || targetState === 'spy_rewards') {
              await sendPreview('2.1 สุ่มได้แต้มบวก (+point)', buildSpyBeeRewardPayload(beeConfig, dummyUserId, '+point', { amount: 50 }, bgUrl));
              await sendPreview('2.2 สุ่มโดนกินแต้ม (-point)', buildSpyBeeRewardPayload(beeConfig, dummyUserId, '-point', { amount: 50 }, bgUrl));
              await sendPreview('2.3 สุ่มได้รูปภาพมีม (meme)', buildSpyBeeRewardPayload(beeConfig, dummyUserId, 'meme', { memeUrl: bgUrl }, bgUrl));
              await sendPreview('2.4 สุ่มได้เควสต์พิมพ์ อู๊ดอู๊ด (role quest)', buildSpyBeeRewardPayload(beeConfig, dummyUserId, 'role', {}, bgUrl));
              await sendPreview('2.5 ดาวหมดทั้ง 3 ดวง (All Stars Gone)', buildSpyBeeAllGonePayload(beeConfig, bgUrl));
            }
            if (!targetState || targetState === 'quest') {
              await sendPreview('3.1 ได้รับยศอีเวนต์ถาวร (Quest Role Grant)', buildSpyBeeQuestResultPayload(beeConfig, dummyUserId, 'role_grant'));
              await sendPreview('3.2 มียศอยู่แล้ว รับแต้มสตรอว์เบอร์รีแทน (Quest Points Grant)', buildSpyBeeQuestResultPayload(beeConfig, dummyUserId, 'points_grant', 150));
            }
            if (!targetState || targetState === 'expired') {
              await sendPreview('4. บินกลับรังเมื่อไม่มีคนสนใจ 15 นาที (Expired)', buildBeeExpiredPayload(beeConfig, bgUrl));
            }
            return;
          }

          // จ) ผึ้งบีเรขา (math_bee)
          if (beeId === 'math_bee') {
            const mathSample = generateMathProblem();
            if (!targetState || targetState === 'spawn') {
              await sendPreview('1. เกิดใหม่พร้อมโจทย์คณิตและ 3 ช้อยส์ (Spawn)', buildMathBeeSpawnPayload(beeConfig, mathSample, 'preview_math', true, bgUrl));
            }
            if (!targetState || targetState === 'win') {
              await sendPreview('2. ตอบถูกคนแรกรับแต้ม (Win)', buildMathBeeWinPayload(beeConfig, dummyUserId, mathSample, bgUrl));
            }
            if (!targetState || targetState === 'expired') {
              await sendPreview('3. บินกลับรังเมื่อไม่มีคนสนใจ 15 นาที (Expired)', buildBeeExpiredPayload(beeConfig, bgUrl));
            }
            return;
          }
        }
      }

      // 3. จัดการ Button Interaction ของระบบผึ้ง
      await handleBeeInteraction(interaction, client, supabase);
    } catch (err) {
      console.error('[bees] interactionCreate error:', err.message);
    }
  });

  // 4. ดักจับข้อความในแชทสำหรับเควสต์หมู "อู๊ด" / "อู๊ดอู๊ด"
  client.on('messageCreate', async (message) => {
    try {
      await handleSpyBeeChatMessage(message);
    } catch (err) {
      console.error('[bees] messageCreate error:', err.message);
    }
  });
}

module.exports = { setupBees };
