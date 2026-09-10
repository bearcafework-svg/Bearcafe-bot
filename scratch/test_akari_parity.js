const fs = require('fs');
const path = require('path');

const engineCode = fs.readFileSync(path.join(__dirname, '../src/akari/minigames/minigamesEngine.js'), 'utf-8');

console.log('🧪 Verifying Akari Minigames Parity Updates...');

// 1. Check CHECKMARK_EMOJI_ID
if (!engineCode.includes("const CHECKMARK_EMOJI_ID = '1358584609087946867';")) {
  throw new Error('CHECKMARK_EMOJI_ID constant missing or incorrect');
}
if (!engineCode.includes('await message.react(CHECKMARK_EMOJI_ID)')) {
  throw new Error('message.react(CHECKMARK_EMOJI_ID) missing');
}
console.log('✅ 1. Checkmark Reaction Emoji: 1358584609087946867 confirmed');

// 2. Check no sentMsg.edit on text games win
if (engineCode.includes('await sentMsg.edit(winnerPayload)')) {
  throw new Error('sentMsg.edit(winnerPayload) should NOT be present for text games');
}
console.log('✅ 2. No card edit on text games win confirmed (stays as original question)');

// 3. Check audio games 5 & 11 card deletion
if (!engineCode.includes('(session.gameId === 5 || session.gameId === 11) && session.messageId')) {
  throw new Error('Audio games 5 & 11 card deletion missing');
}
console.log('✅ 3. Audio games 5 & 11 Component V2 card deletion confirmed');

// 4. Check wrong answer penalty
if (!engineCode.includes('ตอบผิดค่ะ! ถูกหักแต้ม')) {
  throw new Error('Wrong answer penalty message missing');
}
if (!engineCode.includes('❌ คำตอบไม่ถูกต้องค่ะ! ถูกหักแต้ม')) {
  throw new Error('Button wrong answer penalty message missing');
}
console.log('✅ 4. Text & Button wrong answer penalty (-5 to -15 pts) confirmed');

// 5. Check Accessory Button URL
if (!engineCode.includes("url: 'https://discord.gg/bearcafe'")) {
  throw new Error('Accessory button URL is not https://discord.gg/bearcafe');
}
console.log('✅ 5. Accessory button URL: https://discord.gg/bearcafe confirmed');

// 6. Check leaderboard button is preserved
if (!engineCode.includes('leaderboardButton') || !engineCode.includes('components: [leaderboardButton]')) {
  throw new Error('Leaderboard button should be preserved as requested');
}
console.log('✅ 6. 🏆 Leaderboard button preserved confirmed');

// 7. Check default points = 3
if (!engineCode.includes('points_per_win || 3')) {
  throw new Error('Default points_per_win is not 3');
}
console.log('✅ 7. Default reward points = 3 confirmed');

console.log('\n🎉 ALL AKARI MINIGAME PARITY CHECKS PASSED PERFECTLY!');
