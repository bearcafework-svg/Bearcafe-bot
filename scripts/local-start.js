process.env.LOCAL_FAST_START = process.env.LOCAL_FAST_START || "true";
process.env.CLEAR_SLASH_COMMANDS_ON_START = process.env.CLEAR_SLASH_COMMANDS_ON_START || "false";

require("dotenv").config();

if (!process.env.BOT_TOKEN && process.env.DISCORD_TOKEN) {
  process.env.BOT_TOKEN = process.env.DISCORD_TOKEN;
}

console.log("[local] LOCAL_FAST_START=true");
console.log("[local] Skipping heavy startup cleanup/recovery. Use npm start to match Koyeb.");

require("../index");
