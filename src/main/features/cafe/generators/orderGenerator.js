// src/features/cafe/generators/orderGenerator.js
// Order Generator สำหรับ Bear Café

const MENU_ITEMS = [
  { id: "long_coffee", name: "กาแฟคุยยาว", icon: "☕" },
  { id: "comfort_cocoa", name: "โกโก้พักใจ", icon: "🍫" },
  { id: "warm_tea", name: "ชาอุ่นใจ", icon: "🍵" },
  { id: "forest_matcha", name: "มัทฉะป่าสน", icon: "🍃" },
  { id: "honey_milk", name: "นมสดน้ำผึ้ง", icon: "🥛" },
  { id: "caramel_latte", name: "คาราเมลลาเต้", icon: "🍯" }
];

const SIZES = ["เล็ก (Small)", "กลาง (Medium)", "ใหญ่ (Large)"];
const SUGAR_LEVELS = ["ไม่หวาน (0%)", "หวานน้อย (25%)", "หวานปกติ (100%)", "หวานฉ่ำ (150%)"];
const TEMPERATURES = ["ร้อน (Hot)", "เย็น (Iced)", "ปั่น (Frappe)"];
const TOPPINGS = [
  "ไม่มี (None)",
  "น้ำผึ้งป่า (Wild Honey)",
  "วิปครีมหมีนุ่ม (Bear Whip)",
  "ฟองนมเนียน (Milk Foam)",
  "ช็อกโกแลตชิพ (Choco Chips)"
];

function generateOrder(customer) {
  const item = MENU_ITEMS[Math.floor(Math.random() * MENU_ITEMS.length)];
  const size = SIZES[Math.floor(Math.random() * SIZES.length)];
  const sugar = SUGAR_LEVELS[Math.floor(Math.random() * SUGAR_LEVELS.length)];
  const temperature = TEMPERATURES[Math.floor(Math.random() * TEMPERATURES.length)];
  const topping = TOPPINGS[Math.floor(Math.random() * TOPPINGS.length)];

  return {
    itemId: item.id,
    itemName: item.name,
    icon: item.icon,
    size: size,
    sugar: sugar,
    temperature: temperature,
    topping: topping
  };
}

module.exports = {
  generateOrder,
  MENU_ITEMS,
  SIZES,
  SUGAR_LEVELS,
  TEMPERATURES,
  TOPPINGS
};
