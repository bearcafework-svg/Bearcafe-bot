// src/features/cafe/systems/brewingSystem.js
// Beverage Crafting / Brewing Station System for Bear Café

const { MENU_ITEMS, TEMPERATURES, SUGAR_LEVELS, TOPPINGS } = require("../generators/orderGenerator");

/**
 * สลับเบสเครื่องดื่มไปยังตัวถัดไปในเมนู
 */
function cycleBrewBase(session) {
  const currentIndex = MENU_ITEMS.findIndex((m) => m.name === session.currentBrew.itemName);
  const nextIndex = (currentIndex + 1) % MENU_ITEMS.length;
  const nextItem = MENU_ITEMS[nextIndex];

  session.currentBrew.itemId = nextItem.id;
  session.currentBrew.itemName = nextItem.name;
  session.currentBrew.icon = nextItem.icon;
  return session.currentBrew;
}

/**
 * สลับอุณหภูมิ (ร้อน -> เย็น -> ปั่น)
 */
function cycleBrewTemperature(session) {
  const currentIndex = TEMPERATURES.indexOf(session.currentBrew.temperature);
  const nextIndex = (currentIndex + 1) % TEMPERATURES.length;
  session.currentBrew.temperature = TEMPERATURES[nextIndex];
  return session.currentBrew;
}

/**
 * สลับระดับความหวาน (0% -> 25% -> 100% -> 150%)
 */
function cycleBrewSugar(session) {
  const currentIndex = SUGAR_LEVELS.indexOf(session.currentBrew.sugar);
  const nextIndex = (currentIndex + 1) % SUGAR_LEVELS.length;
  session.currentBrew.sugar = SUGAR_LEVELS[nextIndex];
  return session.currentBrew;
}

/**
 * สลับท็อปปิ้ง (ไม่มี -> น้ำผึ้งป่า -> วิปครีม -> ฟองนม -> ช็อกชิพ)
 */
function cycleBrewTopping(session) {
  const currentIndex = TOPPINGS.indexOf(session.currentBrew.topping);
  const nextIndex = (currentIndex + 1) % TOPPINGS.length;
  session.currentBrew.topping = TOPPINGS[nextIndex];
  return session.currentBrew;
}

/**
 * ตรวจสอบความถูกต้องของการชงเทียบกับออเดอร์ของลูกค้า
 */
function evaluateBrewMatch(order, currentBrew) {
  if (!order || !currentBrew) {
    return { isPerfectMatch: false, matchScore: 0, mismatches: ["ไม่พบข้อมูล"] };
  }

  const mismatches = [];

  // เช็คเมนูหลัก
  if (order.itemName !== currentBrew.itemName) {
    mismatches.push(`เครื่องดื่มผิด (ลูกค้าสั่ง: ${order.itemName} แต่คุณชง: ${currentBrew.itemName})`);
  }

  // เช็คอุณหภูมิ
  if (order.temperature !== currentBrew.temperature) {
    mismatches.push(`อุณหภูมิไม่ตรง (ลูกค้าสั่ง: ${order.temperature} แต่คุณชง: ${currentBrew.temperature})`);
  }

  // เช็คระดับความหวาน
  if (order.sugar !== currentBrew.sugar) {
    mismatches.push(`ระดับความหวานไม่ตรง (ลูกค้าสั่ง: ${order.sugar} แต่คุณชง: ${currentBrew.sugar})`);
  }

  // เช็คท็อปปิ้ง
  if (order.topping !== currentBrew.topping) {
    mismatches.push(`ท็อปปิ้งไม่ตรง (ลูกค้าสั่ง: ${order.topping} แต่คุณใส่: ${currentBrew.topping})`);
  }

  const isPerfectMatch = mismatches.length === 0;
  const matchScore = Math.max(0, 4 - mismatches.length) * 25; // 0, 25, 50, 75, 100%

  return {
    isPerfectMatch,
    matchScore,
    mismatches
  };
}

module.exports = {
  cycleBrewBase,
  cycleBrewTemperature,
  cycleBrewSugar,
  cycleBrewTopping,
  evaluateBrewMatch
};
