// scratch/test_main_slash_optimization.js
const assert = require('assert');
const { GUILD_SLASH_COMMANDS, areCommandsEqual } = require('../src/commands/slashCommandRegistry');

console.log('🧪 Testing Main Bot Slash Command Optimization...');

// 1. Check areCommandsEqual with identical commands
const mockCollection = {
  size: GUILD_SLASH_COMMANDS.length,
  find: (predicate) => GUILD_SLASH_COMMANDS.find(predicate)
};

const isEqual = areCommandsEqual(mockCollection, GUILD_SLASH_COMMANDS);
assert.strictEqual(isEqual, true, 'Should detect identical commands');
console.log('  ✅ Identical commands detection passed');

// 2. Check areCommandsEqual with missing command
const mockMissingCollection = {
  size: GUILD_SLASH_COMMANDS.length - 1,
  find: (predicate) => GUILD_SLASH_COMMANDS.slice(1).find(predicate)
};
const isMissingEqual = areCommandsEqual(mockMissingCollection, GUILD_SLASH_COMMANDS);
assert.strictEqual(isMissingEqual, false, 'Should detect missing commands');
console.log('  ✅ Missing command detection passed');

console.log('🎉 ALL MAIN BOT SLASH OPTIMIZATION TESTS PASSED! 🐻⚡');
