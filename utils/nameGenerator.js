// ===================================================
// utils/nameGenerator.js — สุ่มชื่อห้องตามโซน
// ===================================================

// สุ่มชื่อจาก nameThemes ของโซน
// ถ้าชื่อซ้ำกับห้องที่มีอยู่แล้ว จะเติม #2, #3 ต่อท้าย
function formatThemeName(theme, member) {
  const username = member?.user?.username || member?.displayName || "username";
  return theme.replace(/username/g, username);
}

function makeUniqueName(base, existingNames) {
  if (!existingNames.includes(base)) {
    return base;
  }

  let counter = 2;
  while (existingNames.includes(`${base} #${counter}`)) {
    counter++;
  }
  return `${base} #${counter}`;
}

function generateRoomName(zone, existingNames = [], member = null) {
  const themes = zone.nameThemes.map((theme) => formatThemeName(theme, member));
  const shuffled = [...themes].sort(() => Math.random() - 0.5);

  for (const name of shuffled) {
    if (!existingNames.includes(name)) {
      return name;
    }
  }

  // ถ้าชื่อธีมหมดแล้ว ใส่ตัวเลขต่อท้าย
  const base = themes[Math.floor(Math.random() * themes.length)];
  return makeUniqueName(base, existingNames);
}

module.exports = { generateRoomName };
