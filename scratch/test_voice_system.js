const assert = require("assert");
const config = require("../config");
const { checkVipRoomsExpiry } = require("../handlers/roomDestroyer");
const { GUILD_SLASH_COMMANDS } = require("../src/commands/slashCommandRegistry");

console.log("=== Testing 1: config.roomThemes ===");
assert(config.roomThemes, "roomThemes must exist");
assert.strictEqual(config.roomThemes.bear_cafe.userLimit, 6);
assert.strictEqual(config.roomThemes.bear_cafe.rooms.length, 12);
assert.strictEqual(config.roomThemes.flower_nature.userLimit, 7);
assert.strictEqual(config.roomThemes.flower_nature.rooms.length, 10);
assert.strictEqual(config.roomThemes.fruit_fluffy.userLimit, 8);
assert.strictEqual(config.roomThemes.fruit_fluffy.rooms.length, 12);
assert.strictEqual(config.roomThemes.vegetable_fluffy.userLimit, 9);
assert.strictEqual(config.roomThemes.vegetable_fluffy.rooms.length, 10);
console.log("✅ All 4 roomThemes verified with correct limits and room counts!");

console.log("=== Testing 2: config.zones ===");
const zoneIds = config.zones.map(z => z.id);
assert.deepStrictEqual(zoneIds, ["vip", "sleep_single", "sleep_double", "sleep_group"]);
assert(!config.zones.some(z => z.separatorName), "No zone should have a separatorName");
console.log("✅ Zones verified: Only VIP and bedrooms remain, zero separators!");

console.log("=== Testing 3: Slash Command /คัดลอกสิทธิ์หมวดหมู่ ===");
const copyCmd = GUILD_SLASH_COMMANDS.find(c => c.name === "คัดลอกสิทธิ์หมวดหมู่");
assert(copyCmd, "คัดลอกสิทธิ์หมวดหมู่ command must be registered");
const themeOption = copyCmd.options.find(o => o.name === "theme");
assert(themeOption, "theme option must exist in copy command");
assert.strictEqual(themeOption.choices.length, 4, "Must have 4 theme choices");
console.log("✅ Slash command option 'theme' verified with 4 choices!");

console.log("=== Testing 4: formatRemainingTime format logic ===");
const { formatRemainingTime } = require("../handlers/roomDestroyer");

// มากกว่า 60 นาที: แสดงเป็นชั่วโมงเท่านั้น (ไม่แสดงนาที)
assert.strictEqual(formatRemainingTime(24 * 60 * 60 * 1000), "🗑️ ห้องจะถูกลบ 24 ชั่วโมง");
assert.strictEqual(formatRemainingTime((23 * 60 + 45) * 60 * 1000), "🗑️ ห้องจะถูกลบ 24 ชั่วโมง");
assert.strictEqual(formatRemainingTime((22 * 60 + 30) * 60 * 1000), "🗑️ ห้องจะถูกลบ 23 ชั่วโมง");
assert.strictEqual(formatRemainingTime((2 * 60 + 10) * 60 * 1000), "🗑️ ห้องจะถูกลบ 3 ชั่วโมง");
assert.strictEqual(formatRemainingTime((1 * 60 + 1) * 60 * 1000), "🗑️ ห้องจะถูกลบ 2 ชั่วโมง");

// 60 นาทีสุดท้าย: แสดงเป็นนาที
assert.strictEqual(formatRemainingTime(60 * 60 * 1000), "🗑️ ห้องจะถูกลบ 60 นาที");
assert.strictEqual(formatRemainingTime(59 * 60 * 1000), "🗑️ ห้องจะถูกลบ 59 นาที");
assert.strictEqual(formatRemainingTime(12 * 60 * 1000), "🗑️ ห้องจะถูกลบ 12 นาที");
assert.strictEqual(formatRemainingTime(2 * 60 * 1000), "🗑️ ห้องจะถูกลบ 2 นาที");
assert.strictEqual(formatRemainingTime(1 * 60 * 1000), "🚫 ห้องจะถูกลบ 1 นาที");
assert.strictEqual(formatRemainingTime(30 * 1000), "🚫 ห้องจะถูกลบ 1 นาที");
assert.strictEqual(formatRemainingTime(0), "🚫 ห้องจะถูกลบ 1 นาที");
console.log("✅ Voice Status formatting matches all user specifications exactly!");

console.log("\n🎉 ALL TESTS PASSED SUCCESSFULLY!");
