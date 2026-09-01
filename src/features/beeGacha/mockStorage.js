// src/features/beeGacha/mockStorage.js
// ระบบจัดการคลังชุดแต่งผึ้งแบบ Mock Local File Storage (Zero Supabase Egress Mode)
const fs = require('fs');
const path = require('path');

const STORAGE_PATH = path.join(__dirname, 'mockGachaStorage.json');

function loadStorage() {
  try {
    if (fs.existsSync(STORAGE_PATH)) {
      const data = fs.readFileSync(STORAGE_PATH, 'utf8');
      return JSON.parse(data);
    }
  } catch (err) {
    console.error('[mockStorage] Error loading file:', err.message);
  }
  return { users: {} };
}

function saveStorage(store) {
  try {
    fs.writeFileSync(STORAGE_PATH, JSON.stringify(store, null, 2), 'utf8');
  } catch (err) {
    console.error('[mockStorage] Error saving file:', err.message);
  }
}

function getUserGachaData(userId) {
  const store = loadStorage();
  if (!store.users[userId]) {
    store.users[userId] = {
      points: 2000, // แต้มตั้งต้นสำหรับทดสอบสุ่มกาชา
      honey_dust: 0,
      inventory: [], // รายชื่อ cosmetic_id ที่สะสม
      equipped: {
        BACKGROUND: null,
        OUTFIT: null,
        HAT: null,
        ACCESSORY: null
      }
    };
    saveStorage(store);
  }
  return store.users[userId];
}

function updateUserGachaData(userId, updaterFn) {
  const store = loadStorage();
  const userData = getUserGachaData(userId);
  const updated = updaterFn(userData);
  store.users[userId] = { ...userData, ...updated };
  saveStorage(store);
  return store.users[userId];
}

module.exports = {
  getUserGachaData,
  updateUserGachaData
};
