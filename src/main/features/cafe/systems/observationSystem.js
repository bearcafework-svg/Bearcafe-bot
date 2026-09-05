// src/features/cafe/systems/observationSystem.js
// Observation System สำหรับตรวจสอบสิ่งผิดปกติ 5 จุด

const OBSERVATION_TARGETS = {
  customer: { id: "customer", label: "👤 ตรวจสอบลูกค้า", name: "ลูกค้า" },
  order: { id: "order", label: "📋 ตรวจสอบออเดอร์", name: "ออเดอร์" },
  table: { id: "table", label: "🪑 ตรวจสอบโต๊ะ", name: "โต๊ะ" },
  clock: { id: "clock", label: "⏰ ตรวจสอบเวลา", name: "เวลา" },
  mirror: { id: "mirror", label: "🪞 ตรวจสอบกระจก", name: "กระจก" }
};

const NORMAL_CLUES = {
  customer: [
    "คุณสังเกตดวงตาและท่าทางของลูกค้า... ทุกอย่างดูเป็นมิตรและปกติ มีลมหายใจและกระพริบตาเป็นธรรมชาติ",
    "ลูกค้าหยิบสมุดขึ้นมาอ่านอย่างสงบ ท่าทางเป็นลูกค้าประจำที่เหนื่อยล้าจากการทำงานตามปกติ",
    "ลูกค้ายิ้มให้คุณอย่างอบอุ่น ไม่มีสิ่งใดผิดปกติในร่างกายหรือการแต่งกายเลย"
  ],
  order: [
    "รายการออเดอร์เขียนชัดเจน ส่วนผสมทุกอย่างถูกต้องตามสูตรของร้าน Bear Café",
    "ตรวจสอบใบคำสั่งซื้อแล้ว ตัวหนังสือหมึกพิมพ์คมชัด ไม่มีอะไรผิดแปลก",
    "สูตรเครื่องดื่มที่สั่งตรงตามมาตรฐานคาเฟ่ ไซส์และระดับความหวานปกติ"
  ],
  table: [
    "โต๊ะไม้สะอาดเรียบร้อย มีกลิ่นกาแฟอ่อนๆ ไร้ร่องรอยแปลกประหลาด",
    "ไม่มีสิ่งแปลกปลอมบนโต๊ะ มีเพียงกระดาษทิชชู่และแจกันดอกไม้เล็กๆ วางอยู่",
    "พื้นผิวโต๊ะมั่นคง ไม่มีรอยขีดข่วนผิดปกติหรือของเหลวแปลกหน้า"
  ],
  clock: [
    "เข็มวินาทีเดินเป็นจังหวะ ติ๊ก... ต็อก... เวลาเดินตรงกับนาฬิกาข้อมือของคุณ",
    "นาฬิกาแขวนผนังทำงานปกติ แสงไฟสลัวๆ ตกกระทบหน้าปัดอย่างสงบ",
    "เวลาปัจจุบันเดินหน้าไปอย่างสม่ำเสมอ บรรยากาศกะดึกเงียบสงบ"
  ],
  mirror: [
    "ภาพสะท้อนในกระจกเงาสะท้อนภาพคุณและลูกค้าได้อย่างสมบูรณ์แบบ ท่าทางตรงกันทุกประการ",
    "ในกระจกสะท้อนโคมไฟและเก้าอี้ในร้านอย่างถูกต้อง ไม่มีสิ่งลวงตาใดๆ",
    "คุณสบตากับเงาของตัวเองในกระจก ทุกอย่างยังคงประสานกันดี"
  ]
};

function performObservation(session, targetId) {
  const target = OBSERVATION_TARGETS[targetId];
  if (!target) {
    return { success: false, error: "ไม่พบจุดตรวจสอบที่ระบุ" };
  }

  // เช็คว่าใช้สิทธิ์สังเกตการณ์เกินโควต้าหรือไม่
  if (session.observationsUsed >= session.observationsLimit) {
    return {
      success: false,
      error: `คุณใช้สิทธิ์สังเกตการณ์ครบ ${session.observationsLimit} ครั้งแล้วในรอบนี้! โปรดตัดสินใจ`
    };
  }

  session.observationsUsed += 1;

  let observationText = "";
  let hasClue = false;

  if (session.currentAnomaly && session.currentAnomaly.clues && session.currentAnomaly.clues[targetId]) {
    observationText = session.currentAnomaly.clues[targetId];
    hasClue = true;
  } else {
    const list = NORMAL_CLUES[targetId] || ["ทุกอย่างดูปกติเรียบร้อยดี"];
    observationText = list[Math.floor(Math.random() * list.length)];
  }

  const resultEntry = {
    target: targetId,
    label: target.label,
    text: observationText,
    hasClue: hasClue,
    timestamp: Date.now()
  };

  session.observationHistory.push(resultEntry);
  session.status = "OBSERVING";

  return {
    success: true,
    entry: resultEntry,
    observationsRemaining: session.observationsLimit - session.observationsUsed
  };
}

module.exports = {
  OBSERVATION_TARGETS,
  NORMAL_CLUES,
  performObservation
};
