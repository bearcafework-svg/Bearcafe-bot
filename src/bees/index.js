// src/bees/index.js
// จุดเชื่อมต่อหลักของระบบเจ้าผึ้ง (Bee System Feature Entry Point)

const { createClient } = require('@supabase/supabase-js');
const sharedSettings = require('../sharedSettings.json');
const {
  getSettingBee,
  spawnBee,
  scheduleNextAutoSpawn,
  handleBeeInteraction,
  checkAndCleanExpiredBees
} = require('./beeManager');

function setupBees(client) {
  // สร้าง Supabase Client
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  client.once('clientReady', async () => {
    try {
      const guildId = process.env.GUILD_ID || '1144251788493602848';
      const guild = client.guilds.cache.get(guildId);
      if (guild) {
        // ลงทะเบียน /spawn_bee
        await guild.commands.create({
          name: 'spawn_bee',
          description: '[Staff Only] สุ่มหรือปล่อยเจ้าผึ้งออกมาในสวนคาเฟ่หมี',
          options: [
            {
              name: 'bee_id',
              description: 'ระบุตัวผึ้งที่ต้องการทดสอบปล่อย (เว้นว่างไว้เพื่อสุ่ม)',
              type: 3, // String
              required: false,
              autocomplete: true
            }
          ]
        });

        // ลงทะเบียน /bee_config
        await guild.commands.create({
          name: 'bee_config',
          description: '[Staff Only] ตรวจสอบและดูสถานะการตั้งค่าระบบเจ้าผึ้ง'
        });

        console.log('[bees] Commands /spawn_bee & /bee_config registered successfully.');
      }
    } catch (err) {
      console.error('[bees] Failed to register slash commands:', err.message);
    }

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
          .filter((b) => b.name.toLowerCase().includes(focusedValue) || b.id.toLowerCase().includes(focusedValue))
          .slice(0, 25)
          .map((b) => ({
            name: `${b.enabled ? '🟢' : '🔴'} ${b.name} (${b.id})`,
            value: b.id
          }));

        return interaction.respond(filtered);
      }

      if (interaction.isChatInputCommand()) {
        const staffRoles = sharedSettings.staff_roles || [];
        const isStaff =
          staffRoles.some((id) => interaction.member?.roles?.cache?.has(id)) ||
          interaction.guild?.ownerId === interaction.user.id;

        // 1. คำสั่ง /spawn_bee
        if (interaction.commandName === 'spawn_bee') {
          if (!isStaff) {
            return interaction.reply({
              content: '## ⚠️︲เฉพาะ Staff ของคาเฟ่หมีเท่านั้นที่สามารถใช้คำสั่งนี้ได้ค่ะ',
              flags: 64
            });
          }

          const requestedBeeId = interaction.options.getString('bee_id');
          await interaction.reply({
            content: `## 🐝︲กำลังปล่อยเจ้าผึ้ง (${requestedBeeId || 'สุ่มอัตโนมัติ'}) ลงในสวนเรียบร้อยแล้วค่ะ!`,
            flags: 64
          });

          await spawnBee(client, requestedBeeId);
          return;
        }

        // 2. คำสั่ง /bee_config
        if (interaction.commandName === 'bee_config') {
          if (!isStaff) {
            return interaction.reply({
              content: '## ⚠️︲เฉพาะ Staff ของคาเฟ่หมีเท่านั้นที่สามารถใช้คำสั่งนี้ได้ค่ะ',
              flags: 64
            });
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
          });
        }
      }

      // 3. จัดการ Button Interaction ของระบบผึ้ง
      await handleBeeInteraction(interaction, client, supabase);
    } catch (err) {
      console.error('[bees] interactionCreate error:', err.message);
    }
  });
}

module.exports = { setupBees };
