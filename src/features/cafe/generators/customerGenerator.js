// src/features/cafe/generators/customerGenerator.js
// Customer Generator สำหรับ Bear Café

const CUSTOMER_TEMPLATES = [
  {
    id: "brown_bear",
    name: "คุณหมีน้ำตาล",
    emoji: "🐻",
    personality: "Friendly (เป็นมิตร สุภาพ)",
    avatar: "https://cdn.discordapp.com/attachments/1524704267015819274/1534568886135947415/IMG_25680923184720328.png",
    dialogues: [
      "สวัสดีครับ วันนี้อากาศเย็นสบายดีนะ ขอกาแฟอุ่นๆ สักแก้วครับ",
      "ขอกาแฟคุยยาวหนึ่งแก้วครับ นั่งทำงานต่ออีกนิด",
      "ร้านนี้บรรยากาศอบอุ่นเหมือนเดิมเลยนะครับ ขอเมนูเดิมเลยครับ",
      "วันนี้เหนื่อยทั้งวันเลย ขอกาแฟหอมๆ ช่วยปลุกหน่อยนะ"
    ],
    behavior: "ยิ้มอย่างเป็นมิตร พลางจัดกระเป๋าเอกสารและหยิบหนังสือขึ้นมาอ่านเงียบๆ"
  },
  {
    id: "polar_bear",
    name: "คุณหมีขาว",
    emoji: "🐻‍❄️",
    personality: "Quiet (เงียบขรึม รักความสงบ)",
    avatar: "https://cdn.discordapp.com/attachments/1524704267015819274/1534568886135947415/IMG_25680923184720328.png",
    dialogues: [
      "สวัสดี... ขอโกโก้พักใจแก้วนึงครับ",
      "...ชอบมุมตรงนี้มาก มันเงียบสงบดี",
      "ขอเครื่องดื่มอุ่นๆ ดื่มคลายหนาวหน่อยนะ...",
      "วันนี้ขออะไรหวานๆ ไม่หวานมากนะ..."
    ],
    behavior: "นั่งนิ่งๆ สวมผ้าพันคอสีคราม มองออกไปนอกหน้าต่างอย่างผ่อนคลาย"
  },
  {
    id: "panda_bear",
    name: "คุณหมีแพนด้า",
    emoji: "🐼",
    personality: "Cheerful (ร่าเริง สดใส)",
    avatar: "https://cdn.discordapp.com/attachments/1524704267015819274/1534568886135947415/IMG_25680923184720328.png",
    dialogues: [
      "เย้! ในที่สุดร้านก็เปิด ขอชาเขียวหอมๆ เพิ่มหวานหน่อยนะ!",
      "วันนี้มีขนมปังใบไผ่ไหมนะ? ขอน้ำหวานๆ คู่กันแก้วนึงน้า!",
      "สวัสดีค้าบ! เหนื่อยจากการกลิ้งมาทั้งวัน ขอดื่มน้ำเติมพลังหน่อย!",
      "กลิ่นในร้านหอมมากเลย ขอเมนูที่หวานที่สุดเลยนะค้าบ!"
    ],
    behavior: "โบกมือทักทายอย่างร่าเริง นั่งฮัมเพลงเบาๆ พร้อมกับโยกตัวไปมา"
  },
  {
    id: "grizzly_bear",
    name: "คุณหมีกริซลีย์",
    emoji: "🐻",
    personality: "Energetic (กระตือรือร้น ตรงไปตรงมา)",
    avatar: "https://cdn.discordapp.com/attachments/1524704267015819274/1534568886135947415/IMG_25680923184720328.png",
    dialogues: [
      "ฮ่า! สวัสดีบาริสต้า ขอไซส์ใหญ่สุดเลยนะ กำลังจะไปเดินทางต่อ!",
      "ขอกาแฟเข้มๆ เต็มแก้ว น้ำผึ้งนิดหน่อย!",
      "วันนี้พลังงานล้นเหลือ ขอเครื่องดื่มเย็นๆ ชื่นใจแก้วนึง!",
      "ร้านนี้เปิดกะดึกด้วยเหรอ ยอดเยี่ยมไปเลย ขอแก้วโปรดหน่อยสิ!"
    ],
    behavior: "วางกระเป๋าเดินทางลงข้างเก้าอี้ด้วยความกระฉับกระเฉง มองดูเมนูอย่างตั้งใจ"
  },
  {
    id: "spectacled_bear",
    name: "คุณหมีแว่น",
    emoji: "🧸",
    personality: "Observant (ช่างสังเกต ขี้เกรงใจ)",
    avatar: "https://cdn.discordapp.com/attachments/1524704267015819274/1534568886135947415/IMG_25680923184720328.png",
    dialogues: [
      "ขอรบกวนด้วยนะครับ ขอชาอุ่นใจแก้วเล็กแก้วหนึ่งครับ",
      "ขอดื่มชาร้อนระหว่างอ่านบันทึกเล่มนี้หน่อยนะครับ",
      "ขออภัยที่มารบกวนดึกๆ นะครับ ขอเครื่องดื่มเบาๆ สักแก้วครับ",
      "วันนี้แสงไฟในร้านสวยมากเลยครับ ขอชาร้อนสูตรปกติแก้วนึงครับ"
    ],
    behavior: "ขยับแว่นตากรอบกลมให้เข้าที่ ค่อยๆ นั่งลงบนเก้าอี้อย่างระมัดระวัง"
  },
  {
    id: "sun_bear",
    name: "คุณหมีหมา",
    emoji: "🐻",
    personality: "Playful (ขี้เล่น อารมณ์ดี)",
    avatar: "https://cdn.discordapp.com/attachments/1524704267015819274/1534568886135947415/IMG_25680923184720328.png",
    dialogues: [
      "ฮี่ๆ ขอนมสดคาราเมลหวานฉ่ำเพิ่มวิปครีมหน่อยนะ!",
      "ได้ยินว่าร้านนี้มีน้ำผึ้งป่าแท้ๆ ขอลองหน่อยสิ!",
      "มาแวะพักแป๊บเดียว ขอน้ำหวานเย็นเจี๊ยบสักแก้วนะบาริสต้า!",
      "แวะมาหาอะไรดื่มดึกๆ ขอนมสดหอมๆ แก้วนึงครับ!"
    ],
    behavior: "นั่งเก้าอี้หมุนไปมา ยิ้มกว้างเผยให้เห็นแววตาซุกซน"
  }
];

function generateCustomer() {
  const template = CUSTOMER_TEMPLATES[Math.floor(Math.random() * CUSTOMER_TEMPLATES.length)];
  const dialogue = template.dialogues[Math.floor(Math.random() * template.dialogues.length)];

  return {
    id: template.id,
    name: template.name,
    emoji: template.emoji,
    personality: template.personality,
    dialogue: dialogue,
    avatar: template.avatar,
    behavior: template.behavior
  };
}

module.exports = {
  generateCustomer,
  CUSTOMER_TEMPLATES
};
