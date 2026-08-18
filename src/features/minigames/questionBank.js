// src/features/minigames/questionBank.js — คลังโจทย์และการสร้างโจทย์ไดนามิกสำหรับทั้ง 10 มินิเกม (Shared Vocabulary & Dynamic Choices)

const DEFAULT_QUESTIONS = {
  1: [ // เติมคำศัพท์ไทย & เรียงคำไทย
    { id: 101, word_or_question: "สวัสดี", answer: "สวัสดี" },
    { id: 102, word_or_question: "ขอบคุณ", answer: "ขอบคุณ" },
    { id: 103, word_or_question: "ประเทศไทย", answer: "ประเทศไทย" },
    { id: 104, word_or_question: "มิตรภาพ", answer: "มิตรภาพ" },
    { id: 105, word_or_question: "ความสุข", answer: "ความสุข" },
    { id: 106, word_or_question: "ไอศกรีม", answer: "ไอศกรีม" },
    { id: 107, word_or_question: "ธรรมชาติ", answer: "ธรรมชาติ" },
    { id: 108, word_or_question: "คอมพิวเตอร์", answer: "คอมพิวเตอร์" }
  ],
  2: [ // เติมคำศัพท์อังกฤษ & เรียงคำอังกฤษ
    { id: 201, word_or_question: "apple", answer: "apple" },
    { id: 202, word_or_question: "banana", answer: "banana" },
    { id: 203, word_or_question: "friendship", answer: "friendship" },
    { id: 204, word_or_question: "welcome", answer: "welcome" },
    { id: 205, word_or_question: "sunshine", answer: "sunshine" },
    { id: 206, word_or_question: "butterfly", answer: "butterfly" },
    { id: 207, word_or_question: "computer", answer: "computer" }
  ],
  4: [ // ทายคำจากคำใบ้ (มีระดับความยาก: easy [2-3แต้ม], medium [4-6แต้ม], hard [7-10แต้ม])
    { id: 401, word_or_question: "สุนัข", answer: "สุนัข", hints: ["เป็นสัตว์สี่ขา", "ส่งเสียงร้องโฮ่งๆ", "เพื่อนที่ซื่อสัตย์ของมนุษย์"], difficulty: "easy" },
    { id: 402, word_or_question: "แมว", answer: "แมว", hints: ["เป็นสัตว์เลี้ยงยอดนิยม", "ส่งเสียงร้องเหมียวๆ", "ชอบนอนและจับหนู"], difficulty: "easy" },
    { id: 403, word_or_question: "ช้าง", answer: "ช้าง", hints: ["เป็นสัตว์คู่บ้านคู่เมืองไทย", "ตัวใหญ่ มีงวง มีงา", "ชอบกินอ้อยและกล้วย"], difficulty: "medium" },
    { id: 404, word_or_question: "ดวงอาทิตย์", answer: "ดวงอาทิตย์", hints: ["อยู่บนท้องฟ้า", "ให้แสงสว่างและความร้อนในตอนกลางวัน", "ขึ้นทางทิศตะวันออก"], difficulty: "medium" },
    { id: 405, word_or_question: "คอมพิวเตอร์", answer: "คอมพิวเตอร์", hints: ["เป็นอุปกรณ์อิเล็กทรอนิกส์", "มีหน้าจอ แป้นพิมพ์ และเมาส์", "ใช้ประมวลผลและทำงาน"], difficulty: "hard" }
  ],
  7: [ // พิมพ์คำต่อไปนี้ (ไทย)
    { id: 701, word_or_question: "หมีคาเฟ่ต้อนรับเสมอ", answer: "หมีคาเฟ่ต้อนรับเสมอ" },
    { id: 702, word_or_question: "ยิ้มสดใสในทุกวัน", answer: "ยิ้มสดใสในทุกวัน" },
    { id: 703, word_or_question: "กาแฟหอมหวานกลมกล่อม", answer: "กาแฟหอมหวานกลมกล่อม" },
    { id: 704, word_or_question: "ความพยายามไม่เคยทรยศใคร", answer: "ความพยายามไม่เคยทรยศใคร" }
  ],
  8: [ // พิมพ์คำต่อไปนี้ (อังกฤษ)
    { id: 801, word_or_question: "Welcome to Bear Cafe", answer: "Welcome to Bear Cafe" },
    { id: 802, word_or_question: "Have a wonderful day", answer: "Have a wonderful day" },
    { id: 803, word_or_question: "Stay happy and positive", answer: "Stay happy and positive" },
    { id: 804, word_or_question: "Practice makes perfect", answer: "Practice makes perfect" }
  ],
  9: [ // คลังคู่แปลภาษา (อังกฤษ <-> ไทย) ใช้สำหรับ Game 9 & 10
    { id: 901, word_or_question: "Banana", answer: "กล้วย" },
    { id: 902, word_or_question: "Apple", answer: "แอปเปิ้ล" },
    { id: 903, word_or_question: "Cat", answer: "แมว" },
    { id: 904, word_or_question: "Book", answer: "หนังสือ" },
    { id: 905, word_or_question: "Butterfly", answer: "ผีเสื้อ" },
    { id: 906, word_or_question: "Orange", answer: "ส้ม" },
    { id: 907, word_or_question: "Dog", answer: "สุนัข" },
    { id: 908, word_or_question: "House", answer: "บ้าน" },
    { id: 909, word_or_question: "Water", answer: "น้ำ" },
    { id: 910, word_or_question: "Sky", answer: "ท้องฟ้า" }
  ],
  11: [ // เกมต่อคำ (Dynamic Choice Generator)
    { id: 1101, word_or_question: "น้ำ", answer: "แข็ง" },
    { id: 1102, word_or_question: "ดาว", answer: "ตก" },
    { id: 1103, word_or_question: "ไฟ", answer: "ฟ้า" },
    { id: 1104, word_or_question: "พัด", answer: "ลม" },
    { id: 1105, word_or_question: "รถ", answer: "ไฟ" }
  ],
  12: [ // ข้อไหนไม่เข้าพวก (Category-based Generator)
    { id: 1201, word_or_question: "🐶", answer: "🐶", category: "สัตว์" },
    { id: 1202, word_or_question: "🐱", answer: "🐱", category: "สัตว์" },
    { id: 1203, word_or_question: "🐭", answer: "🐭", category: "สัตว์" },
    { id: 1204, word_or_question: "🐰", answer: "🐰", category: "สัตว์" },
    { id: 1205, word_or_question: "🍎", answer: "🍎", category: "ผลไม้" },
    { id: 1206, word_or_question: "🍌", answer: "🍌", category: "ผลไม้" },
    { id: 1207, word_or_question: "🍊", answer: "🍊", category: "ผลไม้" },
    { id: 1208, word_or_question: "🚗", answer: "🚗", category: "ยานพาหนะ" },
    { id: 1209, word_or_question: "✈️", answer: "✈️", category: "ยานพาหนะ" }
  ],
  13: [ // จริงหรือเท็จ
    { id: 1301, word_or_question: "แมวเป็นสัตว์เลี้ยงลูกด้วยนม", answer: "จริง", options: ["จริง", "เท็จ"] },
    { id: 1302, word_or_question: "ดวงอาทิตย์ขึ้นทางทิศตะวันตก", answer: "เท็จ", options: ["จริง", "เท็จ"] },
    { id: 1303, word_or_question: "ประเทศไทยมี 77 จังหวัด", answer: "จริง", options: ["จริง", "เท็จ"] }
  ]
};

// Tracks asked question IDs per game to avoid consecutive repeats
const askedHistory = new Map();

// Helper: Shuffle array
function shuffleArray(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Generate Math Problem (Game 3)
function generateMathProblem() {
  const difficulties = ["easy", "medium", "hard"];
  const diff = difficulties[Math.floor(Math.random() * difficulties.length)];

  let num1, num2, op, answer, rewardPoints, diffLabel;

  if (diff === "easy") {
    diffLabel = "ง่าย";
    rewardPoints = Math.floor(Math.random() * 2) + 2; // 2-3 pts
    num1 = Math.floor(Math.random() * 9) + 1;
    num2 = Math.floor(Math.random() * 9) + 1;
    op = Math.random() < 0.5 ? "+" : "-";
    if (op === "-" && num1 < num2) [num1, num2] = [num2, num1];
    answer = op === "+" ? num1 + num2 : num1 - num2;
  } else if (diff === "medium") {
    diffLabel = "ปานกลาง";
    rewardPoints = Math.floor(Math.random() * 3) + 4; // 4-6 pts
    op = Math.random() < 0.25 ? "x" : (Math.random() < 0.5 ? "+" : "-");
    if (op === "x") {
      num1 = Math.floor(Math.random() * 9) + 2;
      num2 = Math.floor(Math.random() * 9) + 2;
      answer = num1 * num2;
    } else {
      num1 = Math.floor(Math.random() * 90) + 10;
      num2 = Math.floor(Math.random() * 90) + 10;
      if (op === "-" && num1 < num2) [num1, num2] = [num2, num1];
      answer = op === "+" ? num1 + num2 : num1 - num2;
    }
  } else { // hard
    diffLabel = "ยาก";
    rewardPoints = Math.floor(Math.random() * 4) + 7; // 7-10 pts
    op = Math.random() < 0.35 ? "x" : (Math.random() < 0.5 ? "+" : "-");
    if (op === "x") {
      num1 = Math.floor(Math.random() * 89) + 10;
      num2 = Math.floor(Math.random() * 9) + 2;
      answer = num1 * num2;
    } else {
      num1 = Math.floor(Math.random() * 9000) + 100;
      num2 = Math.floor(Math.random() * 9000) + 100;
      if (op === "-" && num1 < num2) [num1, num2] = [num2, num1];
      answer = op === "+" ? num1 + num2 : num1 - num2;
    }
  }

  return {
    gameId: 3,
    difficulty: diffLabel,
    rewardPoints,
    questionStr: `${num1} ${op} ${num2} = ?`,
    wordOrQuestion: `${num1} ${op} ${num2} = ?`,
    answer: String(answer)
  };
}

// Generate missing letters for Thai (Game 1) or English (Game 2)
function maskWord(word, isThai = true) {
  if (!word) return { maskedStr: "" };

  const units = isThai ? getGraphemeClusters(word) : Array.from(word);
  if (units.length <= 2) {
    return { maskedStr: units.join(" ") };
  }

  const countToMask = Math.max(1, Math.floor(units.length * 0.45));
  let maskIndices = new Set();
  let attempts = 0;

  do {
    maskIndices = new Set();
    const availableIndices = Array.from({ length: units.length }, (_, i) => i);
    const shuffled = shuffleArray(availableIndices);

    // Prefer non-adjacent positions for natural distribution
    for (const idx of shuffled) {
      if (maskIndices.size >= countToMask) break;
      if (units.length >= countToMask * 2) {
        if (maskIndices.has(idx - 1) || maskIndices.has(idx + 1)) continue;
      }
      maskIndices.add(idx);
    }

    // Fallback if non-adjacent filter was too restrictive
    while (maskIndices.size < countToMask) {
      const idx = Math.floor(Math.random() * units.length);
      maskIndices.add(idx);
    }

    attempts++;
  } while (maskIndices.size === 0 && attempts < 10);

  const maskedUnits = units.map((u, i) => (maskIndices.has(i) ? "_" : u));
  const initialRevealedIndices = Array.from({ length: units.length }, (_, i) => i).filter(i => !maskIndices.has(i));
  return {
    maskedStr: maskedUnits.join(" "),
    initialRevealedIndices
  };
}

/**
 * Splits a Thai word into Unicode Grapheme Clusters (user-perceived characters).
 * Uses Intl.Segmenter if available, with grapheme-splitter / regex fallbacks.
 */
function getGraphemeClusters(word) {
  if (!word) return [];
  if (typeof Intl !== "undefined" && Intl.Segmenter) {
    const segmenter = new Intl.Segmenter("th", { granularity: "grapheme" });
    return Array.from(segmenter.segment(word), (s) => s.segment);
  }
  try {
    const GraphemeSplitter = require("grapheme-splitter");
    const splitter = new GraphemeSplitter();
    return splitter.splitGraphemes(word);
  } catch {
    const matches = word.match(/[\u0E00-\u0E7F][\u0E30-\u0E3A\u0E47-\u0E4E]*/g);
    return matches || Array.from(word);
  }
}

/**
 * Scramble word for Games 5 & 6 based on language rules:
 * - Thai (Game 5): split into Unicode Grapheme Clusters, shuffle clusters without breaking tone marks/vowels.
 *   Skip words containing < 4 Unicode grapheme clusters.
 * - English (Game 6): split into individual letters, preserve casing.
 *   Skip words < 4 letters.
 * - Ensure shuffled word is NOT identical to original word (reshuffle if same).
 * - No brackets, pipes, commas, or spaces.
 */
function scrambleWord(word, isThai = /[\u0E00-\u0E7F]/.test(word)) {
  if (!word) return "";

  let clusters = isThai ? getGraphemeClusters(word) : Array.from(word);
  if (clusters.length < 2) return word;

  let scrambled = "";
  let attempts = 0;

  do {
    const shuffled = shuffleArray(clusters);
    scrambled = shuffled.join("").replace(/[\[\]\|, ]/g, "");
    attempts++;
  } while (scrambled === word && attempts < 100);

  if (scrambled === word && clusters.length >= 2) {
    const reversed = [...clusters].reverse();
    scrambled = reversed.join("").replace(/[\[\]\|, ]/g, "");
  }

  return scrambled;
}

/**
 * Fetch Next Question for any game (1-10) with Shared Vocabulary Pool & Dynamic 3-Choice Generation
 */
async function getNextQuestion(supabase, gameId, gameSettings = null) {
  if (gameId === 3) {
    return generateMathProblem();
  }

  let questionsPool = [];
  let allTranslations = [];

  if (supabase) {
    // Determine target game_id filters for shared vocabulary pool
    let targetGameIds = [gameId];
    if (gameId === 1 || gameId === 5) targetGameIds = [1, 5, 9, 10];
    if (gameId === 2 || gameId === 6) targetGameIds = [2, 6, 9, 10];
    if (gameId === 9 || gameId === 10) targetGameIds = [9, 10, 1, 2, 5, 6];

    const { data, error } = await supabase
      .from("minigame_questions")
      .select("*")
      .in("game_id", targetGameIds)
      .eq("is_active", true);

    if (!error && data && data.length > 0) {
      questionsPool = data;
    }
  }

  // Fallback to default questions if DB is empty
  if (questionsPool.length === 0) {
    if (gameId === 1 || gameId === 5) questionsPool = DEFAULT_QUESTIONS[1];
    else if (gameId === 2 || gameId === 6) questionsPool = DEFAULT_QUESTIONS[2];
    else if (gameId === 9 || gameId === 10) questionsPool = DEFAULT_QUESTIONS[9];
    else questionsPool = DEFAULT_QUESTIONS[gameId] || [];
  }

  if (questionsPool.length === 0) {
    return null;
  }

  // Filter candidates per game logic (Strictly filter out words with length <= 3 for games 1, 2, 5, 6)
  let candidates = [];
  if (gameId === 1 || gameId === 5) {
    // Thai games: extract words that are Thai & length > 3
    candidates = questionsPool.map(q => {
      const isThaiAnswer = /[\u0E00-\u0E7F]/.test(q.answer);
      const isThaiWord = /[\u0E00-\u0E7F]/.test(q.word_or_question);
      const word = isThaiAnswer ? q.answer : (isThaiWord ? q.word_or_question : null);
      if (!word) return null;
      if (getGraphemeClusters(word).length <= 3) {
        return null;
      }
      return { id: q.id, word_or_question: word, answer: word, category: q.category || 'คำทั่วไป' };
    }).filter(Boolean);
    if (candidates.length === 0) candidates = DEFAULT_QUESTIONS[1];
  } else if (gameId === 2 || gameId === 6) {
    // English games: extract words that are English & length > 3
    candidates = questionsPool.map(q => {
      const isEngWord = /[a-zA-Z]/.test(q.word_or_question);
      const isEngAnswer = /[a-zA-Z]/.test(q.answer);
      const word = isEngWord ? q.word_or_question : (isEngAnswer ? q.answer : null);
      if (!word) return null;
      if (word.length <= 3) {
        return null;
      }
      return { id: q.id, word_or_question: word, answer: word, category: q.category || 'General' };
    }).filter(Boolean);
    if (candidates.length === 0) candidates = DEFAULT_QUESTIONS[2];
  } else if (gameId === 9 || gameId === 10) {
    // Translation pairs (English word <-> Thai translation)
    candidates = questionsPool.filter(q => /[a-zA-Z]/.test(q.word_or_question) && /[\u0E00-\u0E7F]/.test(q.answer));
    if (candidates.length === 0) candidates = DEFAULT_QUESTIONS[9];
    allTranslations = [...candidates];
  } else {
    candidates = questionsPool;
    if (candidates.length === 0) candidates = DEFAULT_QUESTIONS[gameId] || [];
  }

  if (candidates.length === 0) {
    candidates = DEFAULT_QUESTIONS[gameId] || DEFAULT_QUESTIONS[1];
  }

  // Avoid consecutive repeats
  const historyKey = `game_${gameId}`;
  let history = askedHistory.get(historyKey) || [];
  let validCandidates = candidates.filter(q => !history.includes(q.id || q.word_or_question));
  if (validCandidates.length === 0) {
    history = [];
    validCandidates = candidates;
  }

  const selected = validCandidates[Math.floor(Math.random() * validCandidates.length)];
  history.push(selected.id || selected.word_or_question);
  if (history.length > Math.floor(candidates.length / 2)) {
    history.shift();
  }
  askedHistory.set(historyKey, history);

  // Default rewards calculated dynamically from minigame_settings minPoints & maxPoints
  let minP = (gameSettings && typeof gameSettings.minPoints === 'number') ? gameSettings.minPoints : 3;
  let maxP = (gameSettings && typeof gameSettings.maxPoints === 'number') ? gameSettings.maxPoints : 6;
  if (minP > maxP) [minP, maxP] = [maxP, minP];
  let rewardPoints = Math.floor(Math.random() * (maxP - minP + 1)) + minP;
  let difficulty = null;
  let wordOrQuestion = selected.word_or_question;
  let answer = selected.answer;
  let options = [];

  // Game 4 Difficulty mapping
  if (gameId === 4) {
    const diff = selected.difficulty || "medium";
    if (diff === "easy") {
      rewardPoints = Math.floor(Math.random() * 2) + 2; // 2-3 pts
      difficulty = "ง่าย";
    } else if (diff === "medium") {
      rewardPoints = Math.floor(Math.random() * 3) + 4; // 4-6 pts
      difficulty = "ปานกลาง";
    } else {
      rewardPoints = Math.floor(Math.random() * 4) + 7; // 7-10 pts
      difficulty = "ยาก";
    }
  }

  // Games 9 & 10: Dynamic 3-Choice Generation
  if (gameId === 9) {
    // Game 9: English word -> Thai choices
    wordOrQuestion = selected.word_or_question; // English word
    answer = selected.answer;                   // Thai answer
    const wrongPool = allTranslations.map(t => t.answer).filter(a => a !== answer);
    const shuffledWrong = shuffleArray(wrongPool);
    const choices = [answer, shuffledWrong[0] || 'ส้ม', shuffledWrong[1] || 'กล้วย'];
    options = shuffleArray(choices);
  } else if (gameId === 10) {
    // Game 10: Thai word -> English choices
    wordOrQuestion = selected.answer;           // Thai word
    answer = selected.word_or_question;         // English answer
    const wrongPool = allTranslations.map(t => t.word_or_question).filter(w => w !== answer);
    const shuffledWrong = shuffleArray(wrongPool);
    const choices = [answer, shuffledWrong[0] || 'Orange', shuffledWrong[1] || 'Banana'];
    options = shuffleArray(choices);
  } else if (gameId === 12) {
    // Game 12: Odd One Out (Category-based Dynamic Generator)
    if (selected.options && selected.options.length >= 4) {
      wordOrQuestion = selected.word_or_question || 'อันไหนไม่เข้าพวก?';
      answer = selected.answer;
      options = shuffleArray(selected.options);
    } else {
      // Group candidates by category
      const categoriesMap = new Map();
      for (const item of candidates) {
        const cat = item.category || 'ทั่วไป';
        if (!categoriesMap.has(cat)) categoriesMap.set(cat, []);
        categoriesMap.get(cat).push(item);
      }

      const availableCategories = Array.from(categoriesMap.keys()).filter(c => categoriesMap.get(c).length >= 3);

      if (availableCategories.length >= 2) {
        const mainCat = availableCategories[Math.floor(Math.random() * availableCategories.length)];
        const mainItems = shuffleArray(categoriesMap.get(mainCat)).slice(0, 3);
        
        const otherCategories = availableCategories.filter(c => c !== mainCat);
        const oddCat = otherCategories[Math.floor(Math.random() * otherCategories.length)];
        const oddItem = shuffleArray(categoriesMap.get(oddCat))[0];

        wordOrQuestion = 'อันไหนไม่เข้าพวก?';
        answer = oddItem.answer || oddItem.word_or_question;
        const allChoices = [...mainItems.map(i => i.answer || i.word_or_question), answer];
        options = shuffleArray(allChoices);
      } else {
        wordOrQuestion = selected.word_or_question || 'อันไหนไม่เข้าพวก?';
        answer = selected.answer;
        options = Array.isArray(selected.options) ? shuffleArray(selected.options) : ['🐶', '🐱', '🐭', '🍎'];
      }
    }
  } else if (gameId === 11) {
    // Game 11: Word Association (Dynamic Choice Generator from Answer Pool)
    wordOrQuestion = selected.word_or_question;
    answer = selected.answer;

    if (selected.options && selected.options.length >= 3) {
      options = shuffleArray(selected.options);
    } else {
      // Pick 2 wrong answers dynamically from candidate answers
      const wrongPool = candidates
        .map(c => c.answer)
        .filter(a => a && a.trim() !== answer.trim());
      const shuffledWrong = shuffleArray(wrongPool);
      
      const choices = [answer];
      if (shuffledWrong[0]) choices.push(shuffledWrong[0]);
      if (shuffledWrong[1]) choices.push(shuffledWrong[1]);

      // Fallback choices if pool has < 3 words
      const fallbackWrongs = ['ตก', 'ฟ้า', 'ลม', 'บิน', 'แดง', 'ใส'];
      for (const fw of fallbackWrongs) {
        if (choices.length >= 3) break;
        if (!choices.includes(fw)) choices.push(fw);
      }

      options = shuffleArray(choices);
    }
  } else if (gameId === 13) {
    wordOrQuestion = selected.word_or_question;
    answer = selected.answer;
    if (Array.isArray(selected.options) && selected.options.length > 0) {
      options = ["จริง", "เท็จ"];
    } else {
      options = ["จริง", "เท็จ"];
    }
  }

  return {
    gameId,
    id: selected.id,
    wordOrQuestion,
    answer,
    initialRevealedIndices,
    hints: selected.hints || [],
    options,
    difficulty,
    category: selected.category || 'คำทั่วไป',
    rewardPoints
  };
}

/**
 * Dynamic Hint Generator for Games 1, 2, 5, 6
 */
function generateHint(gameId, questionData, hintLevel, previousHintData = null) {
  const fullAnswer = String(questionData.answer || '').trim();
  const isThai = gameId === 1 || gameId === 5;
  const clusters = isThai ? getGraphemeClusters(fullAnswer) : Array.from(fullAnswer);
  const totalLength = clusters.length;

  if (gameId === 1 || gameId === 2) {
    let revealedIndices = new Set(previousHintData?.revealedIndices || []);
    
    if (revealedIndices.size === 0 && questionData.initialRevealedIndices && questionData.initialRevealedIndices.length > 0) {
      questionData.initialRevealedIndices.forEach(idx => revealedIndices.add(idx));
    }

    const unrevealedIndices = [];
    for (let i = 0; i < totalLength; i++) {
      if (!revealedIndices.has(i)) {
        unrevealedIndices.push(i);
      }
    }

    if (unrevealedIndices.length <= 1) {
      return {
        error: "ไม่สามารถใช้คำใบ้เพิ่มได้แล้วค่ะ (ต้องเหลืออย่างน้อย 1 ช่องสำหรับคำตอบ)",
        hintText: null,
        updatedHintData: previousHintData
      };
    }

    let countToReveal = 1;
    if (hintLevel === 2) {
      const maxPossible = unrevealedIndices.length - 1;
      countToReveal = Math.max(1, Math.floor(unrevealedIndices.length * 0.5));
      if (countToReveal > maxPossible) countToReveal = maxPossible;
    }

    const shuffledUnrevealed = shuffleArray([...unrevealedIndices]);
    const newlyRevealed = shuffledUnrevealed.slice(0, countToReveal);
    newlyRevealed.forEach(idx => revealedIndices.add(idx));

    const formattedDisplay = clusters.map((char, i) => revealedIndices.has(i) ? char : '_').join(' ');

    const hintTitle = hintLevel === 1 ? '🔎 คำใบ้ 1 (เปิดอักษร 1 ตัว)' : '💡 คำใบ้ 2 (เปิดอักษรเพิ่ม)';
    const hintMsg = `### ${hintTitle}\n\`\`\`\n${formattedDisplay}\n\`\`\`\n-# หักแต้มเรียบร้อยแล้วค่ะ! เหลือช่องให้คุณเติมคำตอบเองด้วยนะคะ 🐻✨`;

    return {
      error: null,
      hintText: hintMsg,
      updatedHintData: { revealedIndices: Array.from(revealedIndices) }
    };
  }

  if (gameId === 5 || gameId === 6) {
    let lockedIndices = new Set(previousHintData?.lockedIndices || []);
    
    const unlockedIndices = [];
    for (let i = 0; i < totalLength; i++) {
      if (!lockedIndices.has(i)) {
        unlockedIndices.push(i);
      }
    }

    if (unlockedIndices.length <= 1) {
      return {
        error: "ไม่สามารถใช้คำใบ้เพิ่มได้แล้วค่ะ (ต้องเหลืออย่างน้อย 1 ตำแหน่งสำหรับเรียงคำ)",
        hintText: null,
        updatedHintData: previousHintData
      };
    }

    let countToLock = 1;
    if (hintLevel === 2) {
      const maxPossible = unlockedIndices.length - 1;
      countToLock = Math.max(1, Math.floor(unlockedIndices.length * 0.5));
      if (countToLock > maxPossible) countToLock = maxPossible;
    }

    const shuffledUnlocked = shuffleArray([...unlockedIndices]);
    const newlyLocked = shuffledUnlocked.slice(0, countToLock);
    newlyLocked.forEach(idx => lockedIndices.add(idx));

    const lockedListStr = Array.from(lockedIndices)
      .sort((a, b) => a - b)
      .map(idx => `• ตำแหน่งที่ **${idx + 1}** คือ **"${clusters[idx]}"**`)
      .join('\n');

    const formattedDisplay = clusters.map((char, i) => lockedIndices.has(i) ? `[ ${char} ]` : '[ _ ]').join(' ');

    const hintTitle = hintLevel === 1 ? '🔎 คำใบ้ 1 (ล็อกตำแหน่ง 1 ตัว)' : '💡 คำใบ้ 2 (ล็อกตำแหน่งเพิ่ม)';
    const hintMsg = `### ${hintTitle}\n\`\`\`\n${formattedDisplay}\n\`\`\`\n${lockedListStr}\n-# หักแต้มเรียบร้อยแล้วค่ะ! จัดเรียงตัวอักษรที่เหลือให้ถูกต้องนะคะ 🐻✨`;

    return {
      error: null,
      hintText: hintMsg,
      updatedHintData: { lockedIndices: Array.from(lockedIndices) }
    };
  }

  return { error: "เกมนี้ไม่รองรับระบบคำใบ้ค่ะ", hintText: null, updatedHintData: null };
}

module.exports = {
  getNextQuestion,
  generateMathProblem,
  maskWord,
  scrambleWord,
  getGraphemeClusters,
  generateHint
};

