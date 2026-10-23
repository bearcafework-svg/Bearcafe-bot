#!/usr/bin/env node
// ==============================================================================
// scripts/sync-kuma-slash-commands.js
// เครื่องมือส่วนกลางสำหรับตรวจสอบและซิงก์ Slash Commands ของบอท Kuma (Option B)
// 
// การใช้งาน:
//   node scripts/sync-kuma-slash-commands.js --dry-run   (ดูความเปลี่ยนแปลงโดยยังไม่ส่งไป Discord)
//   node scripts/sync-kuma-slash-commands.js             (ซิงก์คำสั่งขึ้น Discord API ทันที)
//   node scripts/sync-kuma-slash-commands.js --guild <guild_id> (ซิงก์เฉพาะกิลด์ที่ระบุ)
// ==============================================================================

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { REST, Routes } = require('discord.js');

const CONFIG_PATH = path.resolve(__dirname, '../config/kuma-slash-commands.json');
const botToken = process.env.KUMA_BOT_TOKEN || process.env.AKARI_BOT_TOKEN;

if (!botToken) {
  console.error('\n❌ [Error] ไม่พบ KUMA_BOT_TOKEN หรือ AKARI_BOT_TOKEN ในไฟล์ .env');
  process.exit(1);
}

if (!fs.existsSync(CONFIG_PATH)) {
  console.error(`\n❌ [Error] ไม่พบไฟล์คอนฟิกคำสั่ง: ${CONFIG_PATH}`);
  process.exit(1);
}

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');
const guildIdx = args.indexOf('--guild');
const targetGuildId = guildIdx !== -1 && args[guildIdx + 1] ? args[guildIdx + 1] : null;

// 1. โหลดและ Validate JSON Configuration
let configData;
try {
  configData = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
} catch (e) {
  console.error(`\n❌ [Error] รูปแบบ JSON ใน ${CONFIG_PATH} ไม่ถูกต้อง:`, e.message);
  process.exit(1);
}

const globalCommands = Array.isArray(configData.globalCommands) ? configData.globalCommands : [];
const guildCommands = configData.guildCommands || {};

// ตรวจสอบความถูกต้องของคำสั่ง (Discord Validation Rules)
function validateCommands(commands, scopeName = 'Global') {
  const errors = [];
  const nameRegex = /^[a-z0-9_-]{1,32}$/;

  commands.forEach((cmd, idx) => {
    const prefix = `[${scopeName} #${idx + 1} /${cmd.name || 'unnamed'}]`;
    if (!cmd.name || !nameRegex.test(cmd.name)) {
      errors.push(`${prefix} ชื่อคำสั่งต้องเป็นตัวพิมพ์เล็ก ตัวเลข, ขีด หรืออันเดอร์สกอร์ (1-32 ตัวอักษร)`);
    }
    if (!cmd.description || cmd.description.trim().length === 0 || cmd.description.length > 100) {
      errors.push(`${prefix} คำอธิบายต้องมีความยาว 1-100 ตัวอักษร (ปัจจุบัน: ${cmd.description?.length || 0})`);
    }

    if (Array.isArray(cmd.options)) {
      cmd.options.forEach((opt, oIdx) => {
        const oPrefix = `${prefix} Option #${oIdx + 1} (${opt.name || 'unnamed'})`;
        if (!opt.name || !nameRegex.test(opt.name)) {
          errors.push(`${oPrefix} ชื่อ Option ต้องเป็นตัวพิมพ์เล็ก (1-32 ตัวอักษร)`);
        }
        if (!opt.description || opt.description.trim().length === 0 || opt.description.length > 100) {
          errors.push(`${oPrefix} คำอธิบาย Option ต้องมีความยาว 1-100 ตัวอักษร (ปัจจุบัน: ${opt.description?.length || 0})`);
        }
        if (!opt.type || typeof opt.type !== 'number' || opt.type < 1 || opt.type > 11) {
          errors.push(`${oPrefix} ชนิดของ Option (type) ไม่ถูกต้อง (ต้องเป็นตัวเลข 1-11)`);
        }
      });
    }
  });

  return errors;
}

const validationErrors = [
  ...validateCommands(globalCommands, 'Global'),
  ...Object.entries(guildCommands).flatMap(([gId, cmds]) => validateCommands(cmds, `Guild ${gId}`))
];

if (validationErrors.length > 0) {
  console.error('\n⚠️ [Validation Failed] พบข้อผิดพลาดในไฟล์ config/kuma-slash-commands.json:');
  validationErrors.forEach((err) => console.error(`  - ${err}`));
  console.error('\nกรุณาแก้ไขข้อผิดพลาดดังกล่าวก่อนทำการซิงก์');
  process.exit(1);
}

// 2. ดำเนินการซิงก์ผ่าน Discord REST API
const rest = new REST({ version: '10' }).setToken(botToken);

async function main() {
  console.log('===============================================================');
  console.log('🐻 [Kuma Bot] ส่วนกลางจัดการ Slash Commands (Option B Sync Tool)');
  console.log('===============================================================');
  if (isDryRun) {
    console.log('🔍 [โหมดทดสอบ / DRY-RUN] เปรียบเทียบข้อมูลโดยไม่แก้ไขบน Discord API');
  }

  // ดึง Application ID ของบอทจาก Discord อัตโนมัติ
  console.log('\n📡 กำลังตรวจสอบ Application ID ของบอทจาก Discord API...');
  const app = await rest.get(Routes.oauth2CurrentApplication());
  const clientId = app.id;
  console.log(`✅ เชื่อมต่อบอทสำเร็จ: ${app.name} (Client ID: ${clientId})`);

  // ก. ซิงก์ Global Commands
  if (!targetGuildId) {
    console.log(`\n🌐 กำลังตรวจสอบ Global Slash Commands (${globalCommands.length} คำสั่งใน JSON)...`);
    const existingGlobals = await rest.get(Routes.applicationCommands(clientId));
    
    console.log(`   - ปัจจุบันมีบน Discord: ${existingGlobals.length} คำสั่ง`);
    console.log(`   - รายการในไฟล์คอนฟิก: ${globalCommands.map(c => `/${c.name}`).join(', ')}`);

    // เปรียบเทียบความแตกต่าง
    const existingMap = new Map(existingGlobals.map(c => [c.name, c]));
    const diffs = [];

    globalCommands.forEach((cmd) => {
      const existing = existingMap.get(cmd.name);
      if (!existing) {
        diffs.push(`➕ เพิ่มคำสั่งใหม่: /${cmd.name} - "${cmd.description}"`);
      } else if (existing.description !== cmd.description) {
        diffs.push(`✏️ แก้ไขคำอธิบาย: /${cmd.name}`);
        diffs.push(`     เดิม:  "${existing.description}"`);
        diffs.push(`     ใหม่:  "${cmd.description}"`);
      }
    });

    existingGlobals.forEach((c) => {
      if (!globalCommands.some(cmd => cmd.name === c.name)) {
        diffs.push(`🗑️ จะถูกนำออก: /${c.name}`);
      }
    });

    if (diffs.length > 0) {
      console.log('\n📝 รายการความเปลี่ยนแปลง (Changes):');
      diffs.forEach(d => console.log(`   ${d}`));
    } else {
      console.log('   ✨ ทุกคำสั่งและคำอธิบายตรงกับ Discord แล้ว');
    }

    if (!isDryRun) {
      console.log('\n🚀 กำลังยิงอัปเดต Global Commands ไปยัง Discord API...');
      const updated = await rest.put(
        Routes.applicationCommands(clientId),
        { body: globalCommands }
      );
      console.log(`🎉 [สำเร็จ] อัปเดต Global Slash Commands (${updated.length} คำสั่ง) เรียบร้อยแล้ว!`);
      console.log('💡 หมายเหตุ: Global Commands อาจใช้เวลา sync บน Discord Client ทั่วโลกประมาณ 1-5 นาที');
    }
  }

  // ข. ซิงก์ Guild-Specific Commands
  const guildsToSync = targetGuildId 
    ? { [targetGuildId]: guildCommands[targetGuildId] || [] }
    : guildCommands;

  for (const [gId, cmds] of Object.entries(guildsToSync)) {
    console.log(`\n🏰 [Guild ${gId}] กำลังตรวจสอบ Guild Commands (${cmds.length} คำสั่ง)...`);
    const existingGuild = await rest.get(Routes.applicationGuildCommands(clientId, gId)).catch(() => []);
    console.log(`   - ปัจจุบันบนกิลด์: ${existingGuild.length} คำสั่ง`);
    console.log(`   - รายการในไฟล์คอนฟิก: ${cmds.map(c => `/${c.name}`).join(', ') || '(ไม่มี)'}`);

    if (!isDryRun) {
      const updatedGuild = await rest.put(
        Routes.applicationGuildCommands(clientId, gId),
        { body: cmds }
      );
      console.log(`🎉 [สำเร็จ] อัปเดต Guild Commands ให้กิลด์ ${gId} (${updatedGuild.length} คำสั่ง) เรียบร้อยแล้ว! (มีผลทันที)`);
    }
  }

  console.log('\n===============================================================');
  console.log(isDryRun ? '✨ การจำลองตรวจสอบเสร็จสมบูรณ์ (รันแบบไม่มี --dry-run เพื่อบันทึกจริง)' : '✨ การซิงก์คำสั่งทั้งหมดเสร็จสมบูรณ์ 100%');
  console.log('===============================================================\n');
}

main().catch((err) => {
  console.error('\n❌ [Fatal Error] เกิดข้อผิดพลาดระหว่างซิงก์คำสั่ง:', err.message);
  if (err.rawError) {
    console.error('รายละเอียดจาก Discord:', JSON.stringify(err.rawError, null, 2));
  }
  process.exit(1);
});
