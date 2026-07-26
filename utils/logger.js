// utils/logger.js
// Custom High-Tech Console Logger for Bear Café Bot Engine

const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  gray: "\x1b[90m",
  
  // Custom RGB Colors
  cyan: "\x1b[38;2;45;212;191m",      // #2dd4bf (Teal/Cyan)
  amber: "\x1b[38;2;251;191;36m",    // #fbbf24 (Amber/Yellow)
  purple: "\x1b[38;2;192;132;252m",  // #c084fc (Purple/Violet)
  emerald: "\x1b[38;2;52;211;153m",  // #34d399 (Emerald Green)
  rose: "\x1b[38;2;244;63;94m",      // #f43f5e (Rose Red)
  orange: "\x1b[38;2;251;146;60m",   // #fb923c (Orange)
  blue: "\x1b[38;2;96;165;250m",     // #60a5fa (Sky Blue)
  whiteBold: "\x1b[1m\x1b[37m"
};

function getTimestamp() {
  const now = new Date();
  return now.toLocaleTimeString('th-TH', { hour12: false });
}

function formatTag(moduleName, colorFn, icon = '✦') {
  const timeStr = `${colors.dim}[${getTimestamp()}]${colors.reset}`;
  const tagStr = `${colorFn}${icon} [${moduleName.toUpperCase()}]${colors.reset}`;
  return `${timeStr} ${tagStr}`;
}

const logger = {
  info: (moduleName, message, ...args) => {
    console.log(`${formatTag(moduleName, colors.cyan, 'ℹ')} ${message}`, ...args);
  },
  success: (moduleName, message, ...args) => {
    console.log(`${formatTag(moduleName, colors.emerald, '✔')} ${colors.emerald}${message}${colors.reset}`, ...args);
  },
  warn: (moduleName, message, ...args) => {
    console.warn(`${formatTag(moduleName, colors.orange, '⚠')} ${colors.orange}${message}${colors.reset}`, ...args);
  },
  error: (moduleName, message, ...args) => {
    console.error(`${formatTag(moduleName, colors.rose, '✖')} ${colors.rose}${colors.bold}${message}${colors.reset}`, ...args);
  },
  bee: (message, ...args) => {
    console.log(`${formatTag('BEES', colors.amber, '🐝')} ${message}`, ...args);
  },
  sticky: (message, ...args) => {
    console.log(`${formatTag('STICKY', colors.cyan, '📌')} ${message}`, ...args);
  },
  secretChat: (message, ...args) => {
    console.log(`${formatTag('SECRET-CHAT', colors.purple, '🔒')} ${message}`, ...args);
  },
  banner: (botName, pingMs) => {
    const line = "═".repeat(60);
    console.log(`\n${colors.cyan}╔${line}╗${colors.reset}`);
    console.log(`${colors.cyan}║${colors.reset} ${colors.bold}${colors.amber}🐻 BEAR CAFÉ ENGINE 𓂃 HIGH-TECH DASHBOARD SYSTEM${colors.reset}     ${colors.cyan}║${colors.reset}`);
    console.log(`${colors.cyan}╠${line}╣${colors.reset}`);
    console.log(`${colors.cyan}║${colors.reset}  🤖 Bot Identity : ${colors.emerald}${colors.bold}${botName}${colors.reset}`);
    console.log(`${colors.cyan}║${colors.reset}  📡 Network Status: ${colors.blue}CONNECTED (${pingMs} ms)${colors.reset}`);
    console.log(`${colors.cyan}║${colors.reset}  🌐 Health Server : ${colors.cyan}http://localhost:8000${colors.reset}`);
    console.log(`${colors.cyan}║${colors.reset}  ⚡ System Status : ${colors.emerald}${colors.bold}ONLINE & ALL SYSTEMS OPERATIONAL${colors.reset}`);
    console.log(`${colors.cyan}╚${line}╝\n${colors.reset}`);
  }
};

module.exports = logger;
