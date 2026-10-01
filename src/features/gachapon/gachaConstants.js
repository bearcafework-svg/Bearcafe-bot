// src/features/gachapon/gachaConstants.js
// ค่าคงที่และโครงสร้างข้อมูลสำหรับระบบกาชาปอง Bear Cafe

const FLAG_V2 = 32768; // MessageFlags.IsComponentsV2
const FLAG_EPHEMERAL = 64; // MessageFlags.Ephemeral
const FLAG_V2_EPHEMERAL = FLAG_V2 | FLAG_EPHEMERAL;

const DEFAULT_BANNER_URL = "https://cdn.discordapp.com/attachments/1524704267015819274/1524758921233825852/-_6.png";

const RARITY_COLORS = {
  COMMON: "#9E9E9E",
  RARE: "#2196F3",
  EPIC: "#9C27B0",
  LEGENDARY: "#FFD700",
};

const RARITY_EMOJIS = {
  COMMON: "⚪",
  RARE: "🔵",
  EPIC: "🟣",
  LEGENDARY: "🟡",
};

const RARITY_NAMES = {
  COMMON: "ทั่วไป (Common)",
  RARE: "หายาก (Rare)",
  EPIC: "มหากาพย์ (Epic)",
  LEGENDARY: "ตำนาน (Legendary)",
};

const CATEGORY_EMOJIS = {
  points: "🪙",
  rent_house: "🏠",
  color_role: "🎨",
  special_role: "👑",
};

module.exports = {
  FLAG_V2,
  FLAG_EPHEMERAL,
  FLAG_V2_EPHEMERAL,
  DEFAULT_BANNER_URL,
  RARITY_COLORS,
  RARITY_EMOJIS,
  RARITY_NAMES,
  CATEGORY_EMOJIS,
};
