// src/bees/beePayloads.js
// สร้าง Component v2 สำหรับผึ้งแต่ละสถานะ โดยฝังบทพูดไว้ใน Component v2 โดยตรง

let sharedSettings;
try {
  sharedSettings = require('../../sharedSettings.json');
} catch {
  sharedSettings = require('../sharedSettings.json');
}
const settingBee = require('./settingBee.json');

const FLAG_V2 = 32768; // MessageFlags.IsComponentsV2

// ─── Helper: ดึง Point Icon string ──────────────────────────────────────────
function getPointIconStr() {
  const pi = sharedSettings.point_icon;
  if (!pi) return '<:strawberryv2:1520439075100688614>';
  return pi.animated ? `<a:${pi.name}:${pi.id}>` : `<:${pi.name}:${pi.id}>`;
}

// ─── Helper: ดึง Garden Background URL Fallback ──────────────────────────────

const CUTEPLANT_EMOJI = "<:cuteplant:1152834055528783872>";

// ─── Helper: จัดรูปแบบบทพูดเจ้าผึ้งให้ลงท้ายด้วย cuteplant 1 อันเสมอ ──────────────
function formatBeeDialogue(rawText) {
  if (!rawText || typeof rawText !== "string") return CUTEPLANT_EMOJI;
  const clean = rawText.replace(/<:cuteplant:1152834055528783872>/g, "").trim();
  return clean + " " + CUTEPLANT_EMOJI;
}
function getGardenUrl(gardenUrl) {
  return gardenUrl || "https://cdn.discordapp.com/attachments/1528780402544611348/1528780439836430487/Garden.png";
}

// ─── 1. Payload: Component v2 อันที่ 1 (Spawn Message) ──────────────────────
function buildBeeSpawnPayload(beeConfig, customId, isReady = false, gardenUrl = null) {
  const iconStr = getPointIconStr();
  const bgUrl = getGardenUrl(gardenUrl || beeConfig.garden_background_url);
  const beeImgUrl = beeConfig.spawn_image_url || beeConfig.image_url || bgUrl;

  const dialogueText =
    beeConfig.dialogue_spawn ||
    beeConfig.dialogues?.spawn ||
    "(บินวนแถวสวนของคาเฟ่หมี) ว้าว~ สตรอว์เบอร์รีแดงฉ่ำเลย! ต้องรีบเก็บน้ำหวานไปทำรังแล้ว~";

  const tipText =
    beeConfig.tips ||
    beeConfig.tip ||
    beeConfig.hint ||
    "สะสมสตรอว์เบอร์รีให้ได้มากที่สุด เพื่อนำไปแลกของตกแต่งสุดน่ารัก แต่อย่าประมาท เพราะเจ้าผึ้งอาจบินมาต่อยคุณได้ทุกเมื่อ!";

  const buttonConfig = isReady
    ? {
        style: 3,
        type: 2,
        label: "︲คลิกฉันสิ! คลิกฉันสิ!",
        emoji: {
          id: "1185955795968471140",
          name: "brainless",
          animated: false
        },
        custom_id: customId,
        disabled: false
      }
    : {
        style: 2,
        type: 2,
        label: "︲𝐖𝐚𝐢𝐭𝐢𝐧𝐠 . . .",
        emoji: {
          id: "1369767704919150626",
          name: "happyflower",
          animated: true
        },
        custom_id: customId,
        disabled: true
      };

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 14,
            divider: false
          },
          {
            type: 9,
            components: [
              {
                type: 10,
                content:
                  `## <:bee20000:1256669436350562355>︲__\` 𝖡𝖾𝖾 ₊ ${beeConfig.name || 'เจ้าผึ้งอ้วนตัวกลม'} 𓂃 \`__\n` +
                  `-# <a:3602exclamationmarkbubble:1372837492205555812>⠀**บทพูดเจ้าผึ้ง** : ${formatBeeDialogue(dialogueText)}\n` +
                  ` > (${iconStr})⠀**__\`𝗍𝗂𝗉𝗌\`__** : ${tipText}`
              }
            ],
            accessory: {
              type: 11,
              media: {
                url: beeImgUrl
              }
            }
          },
          {
            type: 14,
            divider: false,
            spacing: 2
          },
          {
            type: 12,
            items: [
              {
                media: {
                  url: bgUrl
                }
              }
            ]
          },
          {
            type: 14,
            divider: true,
            spacing: 2
          },
          {
            type: 1,
            components: [buttonConfig]
          }
        ]
      }
    ]
  };
}

// ─── 2. Payload: Result Message (ชนะ) ───────────────────────────────────────
function buildBeeWinPayload(beeConfig, userId, pointsGained, gardenUrl = null) {
  const iconStr = getPointIconStr();
  const bgUrl = getGardenUrl(gardenUrl || beeConfig.garden_background_url);
  const beeImgUrl = beeConfig.win_image_url || beeConfig.image_url || bgUrl;

  const dialogueText =
    beeConfig.dialogue_win ||
    beeConfig.dialogues?.win ||
    "(ตกใจ) ห๊ะ!? สตรอว์เบอร์รีหายไปไหน!? ใครกล้ามาขโมยของฉันเนี่ย!";

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 14,
            divider: false
          },
          {
            type: 9,
            components: [
              {
                type: 10,
                content:
                  `## <:bee20000:1256669436350562355>︲__\` 𝖡𝖾𝖾 ₊ ${beeConfig.name || 'เจ้าผึ้งอ้วนตัวกลม'} 𓂃 \`__\n` +
                  `-# <a:3602exclamationmarkbubble:1372837492205555812>⠀**บทพูดเจ้าผึ้ง** : ${formatBeeDialogue(dialogueText)}\n` +
                  ` > (${iconStr})⠀**__\`𝗋𝖾𝗐𝖺𝗋𝖽\`__** : <@${userId}> ได้รับ **+${pointsGained}**`
              }
            ],
            accessory: {
              type: 11,
              media: {
                url: beeImgUrl
              }
            }
          },
          {
            type: 14,
            divider: false,
            spacing: 2
          },
          {
            type: 12,
            items: [
              {
                media: {
                  url: bgUrl
                }
              }
            ]
          },
          {
            type: 14,
            spacing: 2
          },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: "︲คลิกเพื่อเช็กแต้ม",
                emoji: {
                  id: "1522154708200849449",
                  name: "bagpack_icon",
                  animated: false
                },
                url: "https://discord.com/channels/1144251788493602848/1524123727724417276"
              },
              {
                style: 2,
                type: 2,
                label: "︲ผึ้งคืออะไร",
                emoji: {
                  id: "1370964974733758474",
                  name: "28906question",
                  animated: false
                },
                custom_id: "bee_info"
              }
            ]
          }
        ]
      }
    ]
  };
}

// ─── 3. Payload: Result Message (แพ้ปกติ) ────────────────────────────────────
function buildBeeLossPayload(beeConfig, userId, pointsLost, gardenUrl = null) {
  const iconStr = getPointIconStr();
  const bgUrl = getGardenUrl(gardenUrl || beeConfig.garden_background_url);
  const beeImgUrl = beeConfig.lose_image_url || beeConfig.image_url || bgUrl;

  const dialogueText =
    beeConfig.dialogue_loss ||
    beeConfig.dialogues?.lose ||
    beeConfig.dialogues?.loss ||
    "(ต่อย) นี่แน่ะ! บังอาจจะมาขโมยสตรอว์เบอร์รีของฉัน อย่าให้เห็นอีกนะไอหมีบ้า?!";

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 14,
            divider: false
          },
          {
            type: 9,
            components: [
              {
                type: 10,
                content:
                  `## <:bee20000:1256669436350562355>︲__\` 𝖡𝖾𝖾 ₊ ${beeConfig.name || 'เจ้าผึ้งอ้วนตัวกลม'} 𓂃 \`__\n` +
                  `-# <a:3602exclamationmarkbubble:1372837492205555812>⠀**บทพูดเจ้าผึ้ง** : ${formatBeeDialogue(dialogueText)}\n` +
                  ` > (${iconStr})⠀**__\`𝗋𝖾𝗐𝖺𝗋𝖽\`__** : เจ้าผึ้งขโมยสตรอว์เบอร์รีของ <@${userId}> **-${pointsLost}**`
              }
            ],
            accessory: {
              type: 11,
              media: {
                url: beeImgUrl
              }
            }
          },
          {
            type: 14,
            divider: false,
            spacing: 2
          },
          {
            type: 12,
            items: [
              {
                media: {
                  url: bgUrl
                }
              }
            ]
          },
          {
            type: 14,
            spacing: 2
          },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: "︲คลิกเพื่อเช็กแต้ม",
                emoji: {
                  id: "1522154708200849449",
                  name: "bagpack_icon",
                  animated: false
                },
                url: "https://discord.com/channels/1144251788493602848/1524123727724417276"
              },
              {
                style: 2,
                type: 2,
                label: "︲ผึ้งคืออะไร",
                emoji: {
                  id: "1370964974733758474",
                  name: "28906question",
                  animated: false
                },
                custom_id: "bee_info"
              }
            ]
          }
        ]
      }
    ]
  };
}

// ─── 4. Payload: Result Message (แพ้ติดพิษ -150) ──────────────────────────────
function buildBeePoisonLossPayload(beeConfig, userId, pointsLost = 150, gardenUrl = null) {
  const iconStr = getPointIconStr();
  const bgUrl = getGardenUrl(gardenUrl || beeConfig.garden_background_url);
  const beeImgUrl = beeConfig.poison_image_url || beeConfig.lose_image_url || beeConfig.image_url || bgUrl;

  const dialogueText =
    beeConfig.dialogue_poison ||
    beeConfig.dialogues?.poison ||
    "(ต่อย) น่าสงสาร~ ไม่มีสตรอว์เบอร์รีให้ฉันปล้นกลับ งั้นแกก็ติดพิษฉันไปซะ!";

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 14,
            divider: false
          },
          {
            type: 9,
            components: [
              {
                type: 10,
                content:
                  `## <:bee20000:1256669436350562355>︲__\` 𝖡𝖾𝖾 ₊ ${beeConfig.name || 'เจ้าผึ้งอ้วนตัวกลม'} 𓂃 \`__\n` +
                  `-# <a:3602exclamationmarkbubble:1372837492205555812>⠀**บทพูดเจ้าผึ้ง** : ${formatBeeDialogue(dialogueText)}\n` +
                  ` > (${iconStr})⠀**__\`𝗋𝖾𝗐𝖺𝗋𝖽\`__** : <@${userId}> ติดพิษเจ้าผึ้ง เสียสตรอว์เบอร์รีไป **-${pointsLost}**`
              }
            ],
            accessory: {
              type: 11,
              media: {
                url: beeImgUrl
              }
            }
          },
          {
            type: 14,
            divider: false,
            spacing: 2
          },
          {
            type: 12,
            items: [
              {
                media: {
                  url: bgUrl
                }
              }
            ]
          },
          {
            type: 14,
            spacing: 2
          },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: "︲คลิกเพื่อเช็กแต้ม",
                emoji: {
                  id: "1522154708200849449",
                  name: "bagpack_icon",
                  animated: false
                },
                url: "https://discord.com/channels/1144251788493602848/1524123727724417276"
              },
              {
                style: 2,
                type: 2,
                label: "︲ผึ้งคืออะไร",
                emoji: {
                  id: "1370964974733758474",
                  name: "28906question",
                  animated: false
                },
                custom_id: "bee_info"
              }
            ]
          }
        ]
      }
    ]
  };
}

// ─── 5. Payload: Expired Message (ไม่มีการตอบสนองภายใน 15 นาที) ────────────────
function buildBeeExpiredPayload(beeConfig, gardenUrl = null) {
  const bgUrl = getGardenUrl(gardenUrl || beeConfig?.garden_background_url);
  const expiredTmpl = settingBee?.expired_template || {};

  const expireImgUrl =
    beeConfig?.expire_image_url ||
    expiredTmpl.expire_image_url ||
    "https://cdn.discordapp.com/attachments/1524704267015819274/1535772084284821556/a3f90f4310003ac808ae430a9bae79ed.gif?ex=6a78fab6&is=6a77a936&hm=2e479154b92d3fe2d9a668a4f08d77f2dd79433bf7786d8cd8a58a67a7c0dd92&";

  const beeName = beeConfig?.name || 'เจ้าผึ้งอ้วนตัวกลม';
  const dialogueText =
    beeConfig?.dialogue_expired ||
    beeConfig?.dialogues?.expired ||
    expiredTmpl.dialogue ||
    "(บินกลับรัง) แถวนี้หวานหมูชะมัด นำน้ำผึ้งกลับรังดีกว่า ดีนะแถวนี้ไม่มีพวกหมีอ้วน ๆ";

  const noticeText =
    beeConfig?.notice_expired ||
    expiredTmpl.notice_text ||
    "เนื่องจากไม่มีหมีตัวใดสนใจผึ้ง ผึ้งเลยบินหายไปแล้ว . . .";

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          {
            type: 14,
            divider: false
          },
          {
            type: 9,
            components: [
              {
                type: 10,
                content:
                  `## <:bee20000:1256669436350562355>︲__\` 𝖡𝖾𝖾 ₊ ${beeName} 𓂃 \`__\n` +
                  `-# <a:3602exclamationmarkbubble:1372837492205555812>⠀**บทพูดเจ้าผึ้ง** : ${formatBeeDialogue(dialogueText)}\n` +
                  ` > (<:strawberryv2:1520439075100688614>)⠀**__\`𝗆𝗌𝗀\`__** : ${noticeText}`
              }
            ],
            accessory: {
              type: 11,
              media: {
                url: expireImgUrl
              }
            }
          },
          {
            type: 14,
            divider: false,
            spacing: 2
          },
          {
            type: 12,
            items: [
              {
                media: {
                  url: bgUrl
                }
              }
            ]
          },
          {
            type: 14,
            spacing: 2
          },
          {
            type: 1,
            components: [
              {
                style: 4,
                type: 2,
                label: "︲คลิกไม่ได้แล้ว",
                emoji: {
                  id: "1094704718200193124",
                  name: "blubbers",
                  animated: true
                },
                disabled: true,
                flow: {
                  actions: []
                },
                custom_id: "bee_expired_disabled"
              },
              {
                style: 2,
                type: 2,
                label: "︲ผึ้งคืออะไร",
                emoji: {
                  id: "1370964974733758474",
                  name: "28906question",
                  animated: false
                },
                custom_id: "bee_info"
              }
            ]
          }
        ]
      }
    ]
  };
}

// ─── 6. Payload: Queen Bee Result Message (ขโมยสำเร็จ) ─────────────────────────
function buildQueenBeeWinPayload(beeConfig, userId, winResult, gardenUrl = null) {
  const iconStr = getPointIconStr();
  const bgUrl = getGardenUrl(gardenUrl || beeConfig.garden_background_url);
  const isRole = winResult.type === 'role' || winResult.isCrown;
  const beeImgUrl = (isRole ? (beeConfig.crown_image_url || beeConfig.win_image_url) : beeConfig.win_image_url) || beeConfig.image_url || bgUrl;

  const dialogueText = isRole
    ? (beeConfig.dialogues?.crown || "(ตกใจ) หืม? เดี๋ยวสิ... มงกุฎฉันหายไปไหน? นั่นของสำคัญที่สุดเลย... ใครกันนะที่กล้าขโมยของฉันไปแบบนี้ ?")
    : (beeConfig.dialogue_win || beeConfig.dialogues?.win || "(ตกใจ) มะ…ไม่จริง… สตรอเบอรี่ของฉัน… น้ำหวานของรังเรา… ถูกใครขโมยไป…?");

  let rewardText = '';
  const actionButtons = [];

  if (isRole) {
    if (winResult.convertedToJackpot) {
      rewardText = `🎉 **ขโมยสำเร็จ!** เนื่องจาก <@${userId}> มียศมงกุฎอยู่แล้ว จึงได้รับแจ็กพอตแทน **+9,999**`;
      actionButtons.push({
        type: 2,
        style: 5,
        label: "︲คลิกเพื่อเช็กแต้ม",
        emoji: { id: "1522154708200849449", name: "bagpack_icon", animated: false },
        url: "https://discord.com/channels/1144251788493602848/1524123727724417276"
      });
    } else {
      rewardText = `คุณได้รับยศเปลี่ยนสีชื่อราคา 99 บาท`;
      actionButtons.push({
        type: 2,
        style: 5,
        label: "︲คลิกเพื่อเริ่มใช้",
        emoji: { id: "1202930121149775914", name: "lgbeet", animated: false },
        url: "https://discord.com/channels/1144251788493602848/1524123572757467167"
      });
    }
  } else if (winResult.type === 'jackpot') {
    rewardText = `🎉 **JACKPOT แตก!** <@${userId}> ขโมยสมบัติก้อนโต ได้รับ **+${winResult.points.toLocaleString()}**`;
    actionButtons.push({
      type: 2,
      style: 5,
      label: "︲คลิกเพื่อเช็กแต้ม",
      emoji: { id: "1522154708200849449", name: "bagpack_icon", animated: false },
      url: "https://discord.com/channels/1144251788493602848/1524123727724417276"
    });
  } else {
    rewardText = `<@${userId}> ขโมยสำเร็จ! ได้รับ **+${winResult.points.toLocaleString()}**`;
    actionButtons.push({
      type: 2,
      style: 5,
      label: "︲คลิกเพื่อเช็กแต้ม",
      emoji: { id: "1522154708200849449", name: "bagpack_icon", animated: false },
      url: "https://discord.com/channels/1144251788493602848/1524123727724417276"
    });
  }

  if (winResult.capped && winResult.maxPoints) {
    rewardText += ` *(แต้มชนเพดานเลเวลสูงสุดที่ ${winResult.maxPoints.toLocaleString()})*`;
  }

  actionButtons.push({
    style: 2,
    type: 2,
    label: "︲ผึ้งคืออะไร",
    emoji: { id: "1370964974733758474", name: "28906question", animated: false },
    custom_id: "bee_info"
  });

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          { type: 14, divider: false },
          {
            type: 9,
            components: [
              {
                type: 10,
                content:
                  `## <:bee20000:1256669436350562355>︲__\` 𝖡𝖾𝖾 ₊ ${beeConfig.name || 'นางพญาผึ้งอ้วนตัวกลม'} 𓂃 \`__\n` +
                  `-# <a:3602exclamationmarkbubble:1372837492205555812>⠀**บทพูดเจ้าผึ้ง** : ${formatBeeDialogue(dialogueText)}\n` +
                  ` > (${iconStr})⠀**__\`𝗋𝖾𝗐𝖺𝗋𝖽\`__** : ${rewardText}`
              }
            ],
            accessory: {
              type: 11,
              media: { url: beeImgUrl }
            }
          },
          { type: 14, divider: false, spacing: 2 },
          {
            type: 12,
            items: [{ media: { url: bgUrl } }]
          },
          { type: 14, spacing: 2 },
          {
            type: 1,
            components: actionButtons
          }
        ]
      }
    ]
  };
}

// ─── 7. Payload: Queen Bee Result Message (ขโมยล้มเหลว) ───────────────────────
function buildQueenBeeLossPayload(beeConfig, userId, lossResult, gardenUrl = null) {
  const iconStr = getPointIconStr();
  const bgUrl = getGardenUrl(gardenUrl || beeConfig.garden_background_url);
  const beeImgUrl = (lossResult.type === 'poison'
    ? (beeConfig.poison_image_url || beeConfig.lose_image_url)
    : (lossResult.type === 'bankrupt'
      ? (beeConfig.bankrupt_image_url || beeConfig.lose_image_url)
      : beeConfig.lose_image_url)) || beeConfig.image_url || bgUrl;

  let dialogueText = '';
  let penaltyText = '';

  if (lossResult.type === 'bankrupt') {
    dialogueText =
      beeConfig.dialogues?.bankrupt ||
      "(ต่อย) แกขโมยผิดคนแล้วไอหมีจอมตะกละ! ฉันจะขโมยสตรอเบอรี่ทั้งหมดของแก วะฮ่า!";
    penaltyText = `เจ้าผึ้งขโมยสตรอเบอรี่ของ <@${userId}> **-${lossResult.previousPoints.toLocaleString()} (หมดตัวทันที)**`;
  } else if (lossResult.type === 'poison') {
    dialogueText =
      beeConfig.dialogue_poison ||
      beeConfig.dialogues?.poison ||
      "(ต่อย) น่าสงสาร~ ไม่มีสตรอเบอรี่ให้ฉันปล้นกลับ งั้นแกก็ติดพิษฉันไปซะ!";
    penaltyText = `<@${userId}> ติดพิษนางพญาผึ้งอ้วนตัวกลม **-${lossResult.points.toLocaleString()}**`;
  } else {
    dialogueText =
      beeConfig.dialogue_loss ||
      beeConfig.dialogues?.lose ||
      "(ต่อย) คิดว่าฉันอ้วนกลมแล้วจะไม่เห็นเหรอ? นี่แน่ะ! อย่าให้เห็นอีกนะไอหมีจอมตะกละ?!";
    penaltyText = `เจ้าผึ้งขโมยสตรอเบอรี่ของ <@${userId}> **-${lossResult.points.toLocaleString()}**`;
  }

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          { type: 14, divider: false },
          {
            type: 9,
            components: [
              {
                type: 10,
                content:
                  `## <:bee20000:1256669436350562355>︲__\` 𝖡𝖾𝖾 ₊ ${beeConfig.name || 'นางพญาผึ้งอ้วนตัวกลม'} 𓂃 \`__\n` +
                  `-# <a:3602exclamationmarkbubble:1372837492205555812>⠀**บทพูดเจ้าผึ้ง** : ${formatBeeDialogue(dialogueText)}\n` +
                  ` > (${iconStr})⠀**__\`𝗋𝖾𝗐𝖺𝗋𝖽\`__** : ${penaltyText}`
              }
            ],
            accessory: {
              type: 11,
              media: { url: beeImgUrl }
            }
          },
          { type: 14, divider: false, spacing: 2 },
          {
            type: 12,
            items: [{ media: { url: bgUrl } }]
          },
          { type: 14, spacing: 2 },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: "︲คลิกเพื่อเช็กแต้ม",
                emoji: { id: "1522154708200849449", name: "bagpack_icon", animated: false },
                url: "https://discord.com/channels/1144251788493602848/1524123727724417276"
              },
              {
                style: 2,
                type: 2,
                label: "︲ผึ้งคืออะไร",
                emoji: { id: "1370964974733758474", name: "28906question", animated: false },
                custom_id: "bee_info"
              }
            ]
          }
        ]
      }
    ]
  };
}

// ─── 8. Payload: Vampire Bee Result Message (โดนดูดเอง) ─────────────────────────
function buildVampireDrainSelfPayload(beeConfig, userId, lossPoints, gardenUrl = null) {
  const iconStr = getPointIconStr();
  const bgUrl = getGardenUrl(gardenUrl || beeConfig.garden_background_url);
  const beeImgUrl = beeConfig.lose_image_url || beeConfig.image_url || bgUrl;

  const dialogueText =
    beeConfig.dialogue_loss ||
    beeConfig.dialogues?.lose ||
    "(หัวเราะเบาๆ) โอ๊ยย ขอโทษที~ ปีกมันลั่นอะ~ ฮึๆๆ แย่จัง...ดูดหมดเลยแฮะ~!";

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          { type: 14, divider: false },
          {
            type: 9,
            components: [
              {
                type: 10,
                content:
                  `## <:bee20000:1256669436350562355>︲__\` 𝖡𝖾𝖾 ₊ ${beeConfig.name || 'เจ้าผึ้งแวมไพร์'} 𓂃 \`__\n` +
                  `-# <a:3602exclamationmarkbubble:1372837492205555812>⠀**บทพูดเจ้าผึ้ง** : ${formatBeeDialogue(dialogueText)}\n` +
                  ` > (${iconStr})⠀**__\`𝗋𝖾𝗐𝖺𝗋𝖽\`__** : เจ้าผึ้งแวมไพร์ดูดสตรอเบอรี่ของ <@${userId}> **-${lossPoints.toLocaleString()}**`
              }
            ],
            accessory: {
              type: 11,
              media: { url: beeImgUrl }
            }
          },
          { type: 14, divider: false, spacing: 2 },
          {
            type: 12,
            items: [{ media: { url: bgUrl } }]
          },
          { type: 14, spacing: 2 },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: "︲คลิกเพื่อเช็กแต้ม",
                emoji: { id: "1522154708200849449", name: "bagpack_icon", animated: false },
                url: "https://discord.com/channels/1144251788493602848/1524123727724417276"
              },
              {
                style: 2,
                type: 2,
                label: "︲ผึ้งคืออะไร",
                emoji: { id: "1370964974733758474", name: "28906question", animated: false },
                custom_id: "bee_info"
              }
            ]
          }
        ]
      }
    ]
  };
}

// ─── 9. Payload: Vampire Bee Awaken Message (ปลุกพลังแวมไพร์ 60 วิ) ─────────────
function buildVampireAwakenPayload(beeConfig, userId, expireTimestamp, gardenUrl = null) {
  const iconStr = getPointIconStr();
  const bgUrl = getGardenUrl(gardenUrl || beeConfig.garden_background_url);
  const beeImgUrl = beeConfig.awaken_image_url || beeConfig.lose_image_url || beeConfig.image_url || bgUrl;

  const dialogueText =
    beeConfig.dialogues?.awaken ||
    "(กระซิบ) มาเถอะ...มาเป็นเหมือนข้าสิ สัมผัสรสของน้ำผึ้งที่ไม่ใช่แค่หวาน...แต่มันคือพลัง!";

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          { type: 14, divider: false },
          {
            type: 9,
            components: [
              {
                type: 10,
                content:
                  `## <:bee20000:1256669436350562355>︲__\` 𝖡𝖾𝖾 ₊ ${beeConfig.name || 'เจ้าผึ้งแวมไพร์'} 𓂃 \`__\n` +
                  `-# <a:3602exclamationmarkbubble:1372837492205555812>⠀**บทพูดเจ้าผึ้ง** : ${formatBeeDialogue(dialogueText)}\n` +
                  `### ❝ คุณสามารถแท็กใครก็ได้เพื่อทำการดูดแต้ม (${iconStr}) ของเขาภายใน <t:${expireTimestamp}:R> ❞\n` +
                  `> (${iconStr})⠀**__\`𝗍𝗂𝗉𝗌\`__** : <@${userId}> พิมพ์แท็กเพื่อน เช่น \`@ชื่อเพื่อน\` ในห้องนี้ได้ทันทีเลยน้า (แนะนำให้รีบแท็ก ไม่งั้นผึ้งอาจโมโหได้นะ!)`
              }
            ],
            accessory: {
              type: 11,
              media: { url: beeImgUrl }
            }
          },
          { type: 14, divider: false, spacing: 2 },
          {
            type: 12,
            items: [{ media: { url: bgUrl } }]
          },
          { type: 14, spacing: 2 },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: "︲คลิกเพื่อเช็กแต้ม",
                emoji: { id: "1522154708200849449", name: "bagpack_icon", animated: false },
                url: "https://discord.com/channels/1144251788493602848/1524123727724417276"
              },
              {
                style: 2,
                type: 2,
                label: "︲ผึ้งคืออะไร",
                emoji: { id: "1370964974733758474", name: "28906question", animated: false },
                custom_id: "bee_info"
              }
            ]
          }
        ]
      }
    ]
  };
}

// ─── 10. Payload: Vampire Bee Target Result Message (ผลลัพธ์หลังแท็ก) ───────────
function buildVampireTargetResultPayload(beeConfig, userId, targetId, resultData, gardenUrl = null) {
  const iconStr = getPointIconStr();
  const bgUrl = getGardenUrl(gardenUrl || beeConfig.garden_background_url);
  
  let beeImgUrl = beeConfig.image_url;
  if (resultData.type === 'drain') {
    beeImgUrl = beeConfig.win_image_url || beeConfig.image_url;
  } else if (resultData.type === 'bot') {
    beeImgUrl = beeConfig.bot_image_url || beeConfig.win_image_url || beeConfig.image_url;
  } else if (resultData.type === 'poor') {
    beeImgUrl = beeConfig.poor_image_url || beeConfig.awaken_image_url || beeConfig.lose_image_url || beeConfig.image_url;
  } else if (resultData.type === 'owner') {
    beeImgUrl = beeConfig.owner_image_url || beeConfig.awaken_image_url || beeConfig.lose_image_url || beeConfig.image_url;
  } else if (resultData.type === 'self') {
    beeImgUrl = beeConfig.lose_image_url || beeConfig.awaken_image_url || beeConfig.image_url;
  } else {
    beeImgUrl = beeConfig.win_image_url || beeConfig.image_url;
  }
  beeImgUrl = beeImgUrl || bgUrl;

  let dialogueText = '';
  let rewardText = '';

  if (resultData.type === 'bot') {
    dialogueText = "(หัวร้อน) นี่มันไม่ใช่แวมไพร์นะ...นี่มัน ‘แวมปลอม’ แล้วล่ะ!! ข้าจะเอาปีกฟาดเจ้าให้รู้ว่า เขี้ยวของแวมไพร์น่ะ มีไว้ดูดเหยื่อ ไม่ใช่ดูดพลาสติก!!!";
    rewardText = `<@${userId}> คุณดูดบอทไม่ได้นะ มันไม่มีชีวิต..`;
  } else if (resultData.type === 'self') {
    dialogueText = "(หัวร้อน) ข้าให้ไปฝึกดูดอย่างเนียน ดูดแบบเงียบ ดูดแบบเลือดเย็น... ไม่ใช่ดูดตัวเองแล้วหัวเราะคิกคักอยู่คนเดียวแบบนั้น!!!";
    rewardText = `<@${userId}> คุณดูดตัวเองทำไม มันไม่ได้แต้ม..`;
  } else if (resultData.type === 'owner') {
    dialogueText = "(หัวเราะ) เจ้าก็ช่างกล้าเนอะ! คิดจะดูดแต้มราชินีของข้า ไม่มีวันซะหรอก!!";
    rewardText = `เจ้าผึ้งแวมไพร์ดูดสตรอเบอรี่ของ <@${userId}> **-500** + **\`หมดเวลา 5 นาที\`**`;
  } else if (resultData.type === 'poor') {
    dialogueText = "(ขำ) ข้าเป็นแวมไพร์...ไม่ใช่เจ้าหนี้~ ไม่ตามดูดคนจนหรอกน่า~ หึๆๆ~";
    rewardText = `<@${userId}> ได้รับสตรอเบอรี่ **+50** จากโครงการผึ้งจนแล้วจนอีก`;
    if (resultData.capped && resultData.maxPoints) {
      rewardText += ` *(แต้มชนเพดานเลเวลสูงสุดที่ ${resultData.maxPoints.toLocaleString()})*`;
    }
  } else {
    // drain
    dialogueText =
      beeConfig.dialogue_win ||
      beeConfig.dialogues?.win ||
      "(ยิ้มฟันเหยิน) โอ้โห...~ ใครบอกว่าเป็นผึ้งแวมไพร์ต้องใช้เวลาฝึกนาน? เจ้าเนี่ยแหละ...มือใหม่แต่ไฟแรง แถม มีเสน่ห์น่าขนลุก จนแวมไพร์รุ่นเก่ายังต้องหันมามอง";
    rewardText = `<@${userId}> ดูดสตรอเบอรี่ของ <@${targetId}> **+${resultData.points.toLocaleString()}**`;
    if (resultData.capped && resultData.maxPoints) {
      rewardText += ` *(แต้มชนเพดานเลเวลสูงสุดที่ ${resultData.maxPoints.toLocaleString()})*`;
    }
  }

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          { type: 14, divider: false },
          {
            type: 9,
            components: [
              {
                type: 10,
                content:
                  `## <:bee20000:1256669436350562355>︲__\` 𝖡𝖾𝖾 ₊ ${beeConfig.name || 'เจ้าผึ้งแวมไพร์'} 𓂃 \`__\n` +
                  `-# <a:3602exclamationmarkbubble:1372837492205555812>⠀**บทพูดเจ้าผึ้ง** : ${formatBeeDialogue(dialogueText)}\n` +
                  ` > (${iconStr})⠀**__\`𝗋𝖾𝗐𝖺𝗋𝖽\`__** : ${rewardText}`
              }
            ],
            accessory: {
              type: 11,
              media: { url: beeImgUrl }
            }
          },
          { type: 14, divider: false, spacing: 2 },
          {
            type: 12,
            items: [{ media: { url: bgUrl } }]
          },
          { type: 14, spacing: 2 },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: "︲คลิกเพื่อเช็กแต้ม",
                emoji: { id: "1522154708200849449", name: "bagpack_icon", animated: false },
                url: "https://discord.com/channels/1144251788493602848/1524123727724417276"
              },
              {
                style: 2,
                type: 2,
                label: "︲ผึ้งคืออะไร",
                emoji: { id: "1370964974733758474", name: "28906question", animated: false },
                custom_id: "bee_info"
              }
            ]
          }
        ]
      }
    ]
  };
}

// ─── 9. Payload: Spy Bee Spawn Message (มีดาว 3 ดวงให้แย่งเก็บ) ──────────────
function buildSpyBeeSpawnPayload(beeConfig, customIdPrefix, starsState = [true, true, true], isReady = false, gardenUrl = null) {
  const iconStr = getPointIconStr();
  const bgUrl = getGardenUrl(gardenUrl || beeConfig?.garden_background_url);
  const beeImgUrl = beeConfig?.spawn_image_url || bgUrl;

  const dialogueText =
    beeConfig?.dialogue_spawn ||
    beeConfig?.dialogues?.spawn ||
    "(เดินมาหาคุณ) ผมเป็นผึ้งจริง ๆ นะ แต่นั่นไม่ใช่ประเด็น ดูนี่สิฮับ ระหว่างทางผมเก็บดาวมาได้... คุณลองกดดูสิ <:cuteplant:1152834055528783872>";

  const tipText =
    beeConfig?.tips ||
    beeConfig?.tip ||
    beeConfig?.hint ||
    "หมูผสมผึ้ง? ไว้ใจได้มั้ยเนี่ย..";

  let buttons = [];
  if (!isReady) {
    buttons = [
      {
        style: 2,
        type: 2,
        label: "︲𝐖𝐚𝐢𝐭𝐢𝐧𝐠 . . .",
        emoji: {
          id: "1369767704919150626",
          name: "happyflower",
          animated: true
        },
        custom_id: `${customIdPrefix}_waiting`,
        disabled: true
      }
    ];
  } else {
    // 3 Star Buttons: All style 1, emoji only, no text label
    const starConfigs = [
      {
        emojiAvailable: { id: "1412644235479617536", name: "cutesystar3", animated: false },
        emojiClaimed: { id: "1144701793989840997", name: "line", animated: false }
      },
      {
        emojiAvailable: { id: "1412644239002570882", name: "cutesystar2", animated: false },
        emojiClaimed: { id: "1144701793989840997", name: "line", animated: false }
      },
      {
        emojiAvailable: { id: "1412644241624006666", name: "cutesystar", animated: false },
        emojiClaimed: { id: "1144701793989840997", name: "line", animated: false }
      }
    ];

    buttons = starConfigs.map((sc, idx) => {
      const isAvailable = starsState[idx] === true;
      return {
        style: 1,
        type: 2,
        emoji: isAvailable ? sc.emojiAvailable : sc.emojiClaimed,
        custom_id: `${customIdPrefix}_${idx}`,
        disabled: !isAvailable
      };
    });
  }

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          { type: 14, divider: false },
          {
            type: 9,
            components: [
              {
                type: 10,
                content:
                  `## <:bee20000:1256669436350562355>︲__\` 𝖡𝖾𝖾 ₊ ${beeConfig?.name || 'เจ้าผึ้งสายลับ'} 𓂃 \`__\n` +
                  `-# <a:3602exclamationmarkbubble:1372837492205555812>⠀**บทพูดเจ้าผึ้ง** : ${formatBeeDialogue(dialogueText)}\n` +
                  ` > (${iconStr})⠀**__\`𝗍𝗂𝗉𝗌\`__** : ${tipText}`
              }
            ],
            accessory: {
              type: 11,
              media: { url: beeImgUrl }
            }
          },
          { type: 14, divider: false, spacing: 2 },
          {
            type: 12,
            items: [{ media: { url: bgUrl } }]
          },
          { type: 14, divider: true, spacing: 2 },
          {
            type: 1,
            components: buttons
          }
        ]
      }
    ]
  };
}

// ─── 10. Payload: Spy Bee Star Reward Message (+point, -point, meme, role) ───
function buildSpyBeeRewardPayload(beeConfig, userId, rewardType, rewardData, gardenUrl = null) {
  const iconStr = getPointIconStr();
  const bgUrl = getGardenUrl(gardenUrl || beeConfig?.garden_background_url);
  const dialogues = beeConfig?.dialogues || {};

  let dialogueText = "";
  let rewardText = "";
  let rewardImgUrl = "";
  let bottomBgUrl = bgUrl;
  let actionRowComponents = [];

  if (rewardType === '+point') {
    const points = rewardData?.amount || 50;
    dialogueText = dialogues.plus_point || "(นอนอ้วน) ผมว่าคุณดูหิวนะครับ งั้นผมแบ่งสตรอเบอรี่ให้นะ! <:cuteplant:1152834055528783872>";
    rewardText = `<@${userId}> ได้รับสตรอเบอรี่ **+${points}**`;
    rewardImgUrl = beeConfig?.plus_point_image_url || "https://cdn.discordapp.com/attachments/1528780402544611348/1546790968391368814/spy_bee2.png?ex=6aa1b998&is=6aa06818&hm=bed3d1f4df24ad7dd567c749eb8c0ae59c0d939be8d2607d6bf9e4230eb8c132&";
    actionRowComponents.push({
      style: 5,
      type: 2,
      label: "︲เช็กแต้มของคุณ",
      emoji: { id: "1522154708200849449", name: "bagpack_icon", animated: false },
      url: "https://discord.com/channels/1144251788493602848/1524123727724417276"
    });
  } else if (rewardType === '-point') {
    const points = rewardData?.amount || 50;
    dialogueText = dialogues.minus_point || "(น้ำลายไหล) ฮือ ผมขอโทษนะครับ.. แต่ผมหิวอะ ขอกินสตรอเบอรี่ของคุณเลยละกัน! <:cuteplant:1152834055528783872>";
    rewardText = `<@${userId}> ได้รับสตรอเบอรี่ **-${points}**`;
    rewardImgUrl = beeConfig?.minus_point_image_url || "https://cdn.discordapp.com/attachments/1528780402544611348/1546790968634904717/spy_bee3.png?ex=6aa1b998&is=6aa06818&hm=45d2537ddf1d439b06edda3bf79d9cf9f8bdca107248c58eef984dbb10ebba95&";
    actionRowComponents.push({
      style: 5,
      type: 2,
      label: "︲เช็กแต้มของคุณ",
      emoji: { id: "1522154708200849449", name: "bagpack_icon", animated: false },
      url: "https://discord.com/channels/1144251788493602848/1524123727724417276"
    });
  } else if (rewardType === 'meme') {
    dialogueText = dialogues.meme || "(ทำหน้าหล่อ ๆ) ผมหล่อมั้ยครับ 🥺? <:cuteplant:1152834055528783872>";
    rewardText = `<@${userId}> เอ่อ.. การได้เห็นหน้าหล่อ ๆ ก็อาจเป็นรางวัลหละมั้ง...`;
    rewardImgUrl = beeConfig?.meme_thumbnail_url || "https://cdn.discordapp.com/attachments/1528780402544611348/1546790968995352677/spy_bee4.png?ex=6aa1b998&is=6aa06818&hm=44922dd2749b7c8741efdb05dc58a38bd0cb156e9ef95428d9f3759bdbe88256&";
    const memeList = beeConfig?.meme_images || [
      "https://cdn.discordapp.com/attachments/1524704267015819274/1546984124378775612/e43a4db17ac11dd160d1a974253804ac.png?ex=6aa1c4bc&is=6aa0733c&hm=c432f8ae4820e7994518968b9c1bc067857022bb91a388add42605604f2a6f75&",
      "https://cdn.discordapp.com/attachments/1524704267015819274/1546984124768722954/80e20c6f19c62c914683b5a9c2885c8c.png?ex=6aa1c4bc&is=6aa0733c&hm=c136740748b66851a2eac558e8b86f1b1872d486d7e192cad34a2f3216f76f01&",
      "https://cdn.discordapp.com/attachments/1524704267015819274/1546984125104259152/144a132fb3cc3d235be6070522199b8d.png?ex=6aa1c4bd&is=6aa0733d&hm=e3542333e2e66521f3cefaccd2b69d047e8fc5977ea7e393bb512ee84e384644&"
    ];
    const randomMeme = memeList[Math.floor(Math.random() * memeList.length)];
    bottomBgUrl = (rewardData?.memeUrl && rewardData.memeUrl !== bgUrl) ? rewardData.memeUrl : randomMeme;
  } else if (rewardType === 'role') {
    dialogueText = dialogues.role || "(นอนอ้วน) คุณลองพิมพ์ตามที่ผมบอกสิฮะ!~ <:cuteplant:1152834055528783872>";
    rewardText = `<@${userId}> จงพิมพ์คำว่า ||อู๊ดอู๊ด|| ₍ᐢ･⚇･ᐢ₎`;
    rewardImgUrl = beeConfig?.role_image_url || "https://cdn.discordapp.com/attachments/1528780402544611348/1546982928146505821/spy_bee6.png?ex=6aa1c39f&is=6aa0721f&hm=6650e4c4d5ec26b4c6d5b1b022e583ce62a6613de1c20f0e4c98f114c979628d&";
  }

  const innerComponents = [
    { type: 14, divider: false },
    {
      type: 9,
      components: [
        {
          type: 10,
          content:
            `## <:bee20000:1256669436350562355>︲__\` 𝖡𝖾𝖾 ₊ ${beeConfig?.name || 'เจ้าผึ้งสายลับ'} 𓂃 \`__\n` +
            `-# <a:3602exclamationmarkbubble:1372837492205555812>⠀**บทพูดเจ้าผึ้ง** : ${formatBeeDialogue(dialogueText)}\n` +
            ` > (${iconStr})⠀**__\`${rewardType === 'role' ? '𝗊𝗎𝖾𝗌𝗍' : '𝗋𝖾𝗐𝖺𝗋𝖽'}\`__** : ${rewardText}`
        }
      ],
      accessory: {
        type: 11,
        media: { url: rewardImgUrl }
      }
    },
    { type: 14, divider: false, spacing: 2 },
    {
      type: 12,
      items: [{ media: { url: bottomBgUrl } }]
    }
  ];

  if (actionRowComponents.length > 0) {
    innerComponents.push({ type: 14, divider: true, spacing: 2 });
    innerComponents.push({
      type: 1,
      components: actionRowComponents
    });
  }

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: innerComponents
      }
    ]
  };
}

// ─── 11. Payload: Spy Bee Quest Result (เมื่อพิมพ์ "อู๊ด" / "อู๊ดอู๊ด") ──────────
function buildSpyBeeQuestResultPayload(beeConfig, userId, questType, rewardPoints = 0, gardenUrl = null) {
  const iconStr = getPointIconStr();
  const bgUrl = getGardenUrl(gardenUrl || beeConfig?.garden_background_url);
  const dialogues = beeConfig?.dialogues || {};

  if (questType === 'role_grant') {
    // ผู้เล่นยังไม่มียศอีเวนต์ถาวร -> ได้รับยศ
    const dialogueText = dialogues.quest_role_grant || "อู๊ด ๆ คุณคือเพื่อนของผม รับยศพิเศษไปซะ <:cuteplant:1152834055528783872>";
    const thumbUrl = beeConfig?.quest_role_thumbnail_url || "https://cdn.discordapp.com/attachments/1525750929775923210/1546983397983785111/75b74c18fb5ad611312fabcb81576ed0.png?ex=6aa1c40f&is=6aa0728f&hm=81913b3958da5a45a5413587c11b5968a85893ea3bb932958f9b24e4c66dc102&";

    return {
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            { type: 14, divider: false },
            {
              type: 9,
              components: [
                {
                  type: 10,
                  content:
                    `## <:bearcafe_star:1212856675053346897>︲__\`คุณได้รับยศ ₊ ミ ③ Baby Carrot 𓂃 \`__\n` +
                    `-# <a:3602exclamationmarkbubble:1372837492205555812>⠀**บทพูดเจ้าผึ้ง** : ${formatBeeDialogue(dialogueText)}\n` +
                    ` > (${iconStr})⠀**__\`𝗋𝖾𝗐𝖺𝗋𝖽\`__** : ยินดีด้วย <@${userId}> คุณได้รับยศอีเวนต์ถาวรเรียบร้อยแล้ว!`
                }
              ],
              accessory: {
                type: 11,
                media: { url: thumbUrl }
              }
            },
            { type: 14, divider: false, spacing: 2 },
            {
              type: 12,
              items: [{ media: { url: bgUrl } }]
            }
          ]
        }
      ]
    };
  } else {
    // ผู้เล่นมียศอยู่แล้ว -> ได้แต้มสตรอว์เบอร์รีปลอบใจ
    const dialogueText = dialogues.quest_points_grant || "(ยืนมอง) เหมือนคุณจะมียศของผมแล้วนะฮับ งั้นผมให้สตรอเบอรี่คุณแทนละกัน! <:cuteplant:1152834055528783872>";
    const thumbUrl = beeConfig?.quest_points_thumbnail_url || beeConfig?.plus_point_image_url || "https://cdn.discordapp.com/attachments/1528780402544611348/1546790968391368814/spy_bee2.png?ex=6aa1b998&is=6aa06818&hm=bed3d1f4df24ad7dd567c749eb8c0ae59c0d939be8d2607d6bf9e4230eb8c132&";

    return {
      flags: FLAG_V2,
      components: [
        {
          type: 17,
          components: [
            { type: 14, divider: false },
            {
              type: 9,
              components: [
                {
                  type: 10,
                  content:
                    `## <:bee20000:1256669436350562355>︲__\` 𝖡𝖾𝖾 ₊ ${beeConfig?.name || 'เจ้าผึ้งสายลับ'} 𓂃 \`__\n` +
                    `-# <a:3602exclamationmarkbubble:1372837492205555812>⠀**บทพูดเจ้าผึ้ง** : ${formatBeeDialogue(dialogueText)}\n` +
                    ` > (${iconStr})⠀**__\`𝗋𝖾𝗐𝖺𝗋𝖽\`__** : เจ้าผึ้งสายลับคายสตรอเบอรี่ให้ <@${userId}> **+${rewardPoints}** ${iconStr}`
                }
              ],
              accessory: {
                type: 11,
                media: { url: thumbUrl }
              }
            },
            { type: 14, divider: false, spacing: 2 },
            {
              type: 12,
              items: [{ media: { url: bgUrl } }]
            },
            { type: 14, divider: true, spacing: 2 },
            {
              type: 1,
              components: [
                {
                  style: 5,
                  type: 2,
                  label: "︲เช็กแต้มของคุณ",
                  emoji: { id: "1522154708200849449", name: "bagpack_icon", animated: false },
                  url: "https://discord.com/channels/1144251788493602848/1524123727724417276"
                }
              ]
            }
          ]
        }
      ]
    };
  }
}

// ─── 12. Payload: Spy Bee All Stars Gone (เมื่อดาวหมดทั้ง 3 ดวง) ─────────────
function buildSpyBeeAllGonePayload(beeConfig, userId = null, gardenUrl = null) {
  // รองรับกรณีเรียกแบบเดิมที่ส่ง (beeConfig, gardenUrl)
  if (typeof userId === 'string' && (userId.startsWith('http://') || userId.startsWith('https://'))) {
    gardenUrl = userId;
    userId = null;
  }
  const iconStr = getPointIconStr();
  const bgUrl = getGardenUrl(gardenUrl || beeConfig?.garden_background_url);
  const dialogueText = beeConfig?.dialogues?.all_gone || "(ตกใจ) โหคุณครับ หิวกระหายอะไรขนาดนั้น ดาวผมหายหมดเลยอะ T-T <:cuteplant:1152834055528783872>";
  const imgUrl = beeConfig?.all_gone_image_url || "https://cdn.discordapp.com/attachments/1448266116307877990/1448280278056439878/11.png";
  const userTag = userId ? `<@${userId}> ` : "";

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          { type: 14, divider: false },
          {
            type: 9,
            components: [
              {
                type: 10,
                content:
                  `## <:bee20000:1256669436350562355>︲__\` 𝖡𝖾𝖾 ₊ ${beeConfig?.name || 'เจ้าผึ้งสายลับ'} 𓂃 \`__\n` +
                  `-# <a:3602exclamationmarkbubble:1372837492205555812>⠀**บทพูดเจ้าผึ้ง** : ${formatBeeDialogue(dialogueText)}\n` +
                  ` > (${iconStr})⠀**__\`𝗆𝗌𝗀\`__** : ${userTag}ดาวทั้งหมดในรอบนี้ถูกผู้เล่นในคาเฟ่เก็บไปจนหมดแล้ว!`
              }
            ],
            accessory: {
              type: 11,
              media: { url: imgUrl }
            }
          },
          { type: 14, divider: false, spacing: 2 },
          {
            type: 12,
            items: [{ media: { url: bgUrl } }]
          }
        ]
      }
    ]
  };
}

// ─── 13. Payload: Math Bee Spawn Message (โจทย์คณิตศาสตร์ + 3 ช้อยส์) ─────────
function buildMathBeeSpawnPayload(beeConfig, mathData, customIdPrefix, isReady = false, gardenUrl = null) {
  const iconStr = getPointIconStr();
  const bgUrl = getGardenUrl(gardenUrl || beeConfig?.garden_background_url);
  const beeImgUrl = beeConfig?.spawn_image_url || beeConfig?.image_url || bgUrl;

  const dialogueText =
    beeConfig?.dialogue_spawn ||
    beeConfig?.dialogues?.spawn ||
    "(ไม้ชี้กระดาน) เธอ เธอนั่นแหละ! เอาแต่เหม่ออยู่ได้ ไหนลองตอบหน่อยซิว่าโจทย์ข้อนี้ตอบอะไร?";

  let buttons = [];
  if (!isReady) {
    buttons = [
      {
        style: 2,
        type: 2,
        label: "︲กำลังโหลดโจทย์ . . .",
        emoji: {
          id: "1369767704919150626",
          name: "happyflower",
          animated: true
        },
        custom_id: `${customIdPrefix}_waiting`,
        disabled: true
      }
    ];
  } else {
    // 3 Choices Buttons: Styles 1, 3, 4, numbers only, no emoji
    const choices = mathData?.choices || [];
    const choiceStyles = [1, 3, 4];
    buttons = choices.map((choice, idx) => ({
      style: choiceStyles[idx] || 1,
      type: 2,
      label: String(choice.label),
      custom_id: `${customIdPrefix}_${idx}`
    }));
  }

  const question = mathData?.questionText || '1 + 1 = ?';
  const tierName = mathData?.tierName || 'หลักหน่วย';
  const rewardPts = mathData?.rewardPoints || 15;

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          { type: 14, divider: false },
          {
            type: 9,
            components: [
              {
                type: 10,
                content:
                  `## <:bee20000:1256669436350562355>︲__\` 𝖡𝖾𝖾 ₊ ${beeConfig?.name || 'อาจารย์บีเรขา'} 𓂃 \`__\n` +
                  `-# <a:3602exclamationmarkbubble:1372837492205555812>⠀**บทพูดเจ้าผึ้ง** : ${formatBeeDialogue(dialogueText)}\n` +
                  `### 📐︲โจทย์คณิตศาสตร์ (${tierName}): **\` ${question} \`**\n` +
                  `> (${iconStr})⠀**__\`reward\`__** : ตอบถูกคนแรกรับทันที **+${rewardPts}** แต้ม *(ตอบผิดโดนหัก -10~50!)*`
              }
            ],
            accessory: {
              type: 11,
              media: { url: beeImgUrl }
            }
          },
          { type: 14, divider: false, spacing: 2 },
          {
            type: 12,
            items: [{ media: { url: bgUrl } }]
          },
          { type: 14, divider: true, spacing: 2 },
          {
            type: 1,
            components: buttons
          }
        ]
      }
    ]
  };
}

// ─── 14. Payload: Math Bee Win Message (ตอบถูกคนแรก) ─────────────────────────
function buildMathBeeWinPayload(beeConfig, userId, mathData, gardenUrl = null) {
  const iconStr = getPointIconStr();
  const bgUrl = getGardenUrl(gardenUrl || beeConfig?.garden_background_url);
  const beeImgUrl = beeConfig?.win_image_url || beeConfig?.image_url || bgUrl;

  const dialogueText =
    beeConfig?.dialogue_win ||
    beeConfig?.dialogues?.win ||
    "(เต้นรอบตัวคุณ) เก่งมาก คุณคือผึ้งหน้าห้อง ผึ้งเด็กเรียนยังไงล่ะ! <:cuteplant:1152834055528783872>";

  const rewardPts = mathData?.rewardPoints || 15;
  const rawQuestion = mathData?.questionText || '';
  const cleanQuestion = rawQuestion.replace(/\s*=\s*\?$/, '').trim();
  const answer = mathData?.correctAnswer !== undefined ? mathData.correctAnswer : '';

  let rewardText = `<@${userId}> ตอบถูกเป็นคนแรก! ได้รับ **+${rewardPts}**`;
  if (mathData?.capped && mathData?.maxPoints) {
    rewardText += ` *(แต้มชนเพดานเลเวลสูงสุดที่ ${mathData.maxPoints.toLocaleString()})*`;
  }

  return {
    flags: FLAG_V2,
    components: [
      {
        type: 17,
        components: [
          { type: 14, divider: false },
          {
            type: 9,
            components: [
              {
                type: 10,
                content:
                  `## <:bee20000:1256669436350562355>︲__\` 𝖡𝖾𝖾 ₊ ${beeConfig?.name || 'อาจารย์บีเรขา'} 𓂃 \`__\n` +
                  `-# <a:3602exclamationmarkbubble:1372837492205555812>⠀**บทพูดเจ้าผึ้ง** : ${formatBeeDialogue(dialogueText)}\n` +
                  `### 🎯︲เฉลย: **\` ${cleanQuestion} = ${answer} \`**\n` +
                  `> (${iconStr})⠀**__\`reward\`__** : ${rewardText}`
              }
            ],
            accessory: {
              type: 11,
              media: { url: beeImgUrl }
            }
          },
          { type: 14, divider: false, spacing: 2 },
          {
            type: 12,
            items: [{ media: { url: bgUrl } }]
          },
          { type: 14, spacing: 2 },
          {
            type: 1,
            components: [
              {
                type: 2,
                style: 5,
                label: "︲เช็กแต้มของคุณ",
                emoji: { id: "1522154708200849449", name: "bagpack_icon", animated: false },
                url: "https://discord.com/channels/1144251788493602848/1524123727724417276"
              },
              {
                style: 2,
                type: 2,
                label: "︲ผึ้งคืออะไร",
                emoji: { id: "1370964974733758474", name: "28906question", animated: false },
                custom_id: "bee_info"
              }
            ]
          }
        ]
      }
    ]
  };
}

module.exports = {
  buildBeeSpawnPayload,
  buildBeeWinPayload,
  buildBeeLossPayload,
  buildBeePoisonLossPayload,
  buildBeeExpiredPayload,
  buildQueenBeeWinPayload,
  buildQueenBeeLossPayload,
  buildVampireDrainSelfPayload,
  buildVampireAwakenPayload,
  buildVampireTargetResultPayload,
  buildSpyBeeSpawnPayload,
  buildSpyBeeRewardPayload,
  buildSpyBeeQuestResultPayload,
  buildSpyBeeAllGonePayload,
  buildMathBeeSpawnPayload,
  buildMathBeeWinPayload
};
