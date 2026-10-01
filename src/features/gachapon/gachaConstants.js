// src/features/gachapon/gachaConstants.js
// ค่าคงที่และโครงสร้างข้อมูลสำหรับระบบกาชาปอง Bear Cafe

const FLAG_V2 = 32768; // MessageFlags.IsComponentsV2
const FLAG_EPHEMERAL = 64; // MessageFlags.Ephemeral
const FLAG_V2_EPHEMERAL = FLAG_V2 | FLAG_EPHEMERAL;

const DEFAULT_BANNER_URL = "https://cdn.discordapp.com/attachments/1524704267015819274/1524758921233825852/-_6.png";

const TIER_COLORS = {
  UR: "#FFD700",
  SSR: "#9C27B0",
  SR: "#2196F3",
  R: "#4CAF50",
  N: "#9E9E9E",
  LEGENDARY: "#FFD700",
  EPIC: "#9C27B0",
  RARE: "#2196F3",
  COMMON: "#9E9E9E",
};

const TIER_EMOJIS = {
  UR: "🟡",
  SSR: "🟣",
  SR: "🔵",
  R: "🟢",
  N: "⚪",
  LEGENDARY: "🟡",
  EPIC: "🟣",
  RARE: "🔵",
  COMMON: "⚪",
};

const TIER_NAMES = {
  UR: "UR (Ultra Rare - พิเศษสุด)",
  SSR: "SSR (Super Special - มหากาพย์)",
  SR: "SR (Super Rare - หายากพิเศษ)",
  R: "R (Rare - หายาก)",
  N: "N (Normal - ทั่วไป)",
};

const CATEGORY_EMOJIS = {
  points: "🪙",
  rent_house: "🏠",
  rent_house_days: "🏠",
  color_role: "🎨",
  special_role: "👑",
};

module.exports = {
  FLAG_V2,
  FLAG_EPHEMERAL,
  FLAG_V2_EPHEMERAL,
  DEFAULT_BANNER_URL,
  TIER_COLORS,
  TIER_EMOJIS,
  TIER_NAMES,
  RARITY_COLORS: TIER_COLORS,
  RARITY_EMOJIS: TIER_EMOJIS,
  RARITY_NAMES: TIER_NAMES,
  CATEGORY_EMOJIS,
};

