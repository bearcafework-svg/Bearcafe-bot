// src/bees/beePayloads.js
// สร้าง Component v2 สำหรับผึ้งแต่ละสถานะ โดยฝังบทพูดไว้ใน Component v2 โดยตรง

const sharedSettings = require('../sharedSettings.json');

const FLAG_V2 = 32768; // MessageFlags.IsComponentsV2

// ─── Helper: ดึง Point Icon string ──────────────────────────────────────────
function getPointIconStr() {
  const pi = sharedSettings.point_icon;
  if (!pi) return '<:strawberryv2:1520439075100688614>';
  return pi.animated ? `<a:${pi.name}:${pi.id}>` : `<:${pi.name}:${pi.id}>`;
}

// ─── Helper: ดึง Garden Background URL Fallback ──────────────────────────────
function getGardenUrl(gardenUrl) {
  return gardenUrl || "https://cdn.discordapp.com/attachments/1528780402544611348/1528780439836430487/Garden.png";
}

// ─── 1. Payload: Component v2 อันที่ 1 (Spawn Message) ──────────────────────
function buildBeeSpawnPayload(beeConfig, customId, isReady = false, gardenUrl = null) {
  const iconStr = getPointIconStr();
  const bgUrl = getGardenUrl(gardenUrl || beeConfig.garden_background_url);
  const beeImgUrl = beeConfig.spawn_image_url || beeConfig.image_url || bgUrl;

  const dialogueText = "(บินวนแถวสวนของคาเฟ่หมี) ว้าว~ สตรอว์เบอร์รีแดงฉ่ำเลย! ต้องรีบเก็บน้ำหวานไปทำรังแล้ว~";

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
        style: 1,
        type: 2,
        label: "︲กำลังโหลดผึ้ง . . .",
        emoji: {
          id: "1299694108541190197",
          name: "5285bearroll",
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
                  `-# <a:3602exclamationmarkbubble:1372837492205555812>⠀**บทพูดเจ้าผึ้ง** : ${dialogueText} <:cuteplant:1152834055528783872>\n` +
                  ` > (${iconStr})⠀**__\`𝗍𝗂𝗉𝗌\`__** : สะสมสตรอว์เบอร์รีให้ได้มากที่สุด เพื่อนำไปแลกของตกแต่งสุดน่ารัก แต่อย่าประมาท เพราะเจ้าผึ้งอาจบินมาต่อยคุณได้ทุกเมื่อ!`
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

  const dialogueText = "(ตกใจ) ห๊ะ!? สตรอว์เบอร์รีหายไปไหน!? ใครกล้ามาขโมยของฉันเนี่ย!";

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
                  `-# <a:3602exclamationmarkbubble:1372837492205555812>⠀**บทพูดเจ้าผึ้ง** : ${dialogueText} <:cuteplant:1152834055528783872>\n` +
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

  const dialogueText = "(ต่อย) นี่แน่ะ! บังอาจจะมาขโมยสตรอว์เบอร์รีของฉัน อย่าให้เห็นอีกนะไอหมีบ้า?!";

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
                  `-# <a:3602exclamationmarkbubble:1372837492205555812>⠀**บทพูดเจ้าผึ้ง** : ${dialogueText} <:cuteplant:1152834055528783872>\n` +
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
  const beeImgUrl = beeConfig.poison_image_url || beeConfig.image_url || bgUrl;

  const dialogueText = "(ต่อย) น่าสงสาร~ ไม่มีสตรอว์เบอร์รีให้ฉันปล้นกลับ งั้นแกก็ติดพิษฉันไปซะ!";

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
                  `-# <a:3602exclamationmarkbubble:1372837492205555812>⠀**บทพูดเจ้าผึ้ง** : ${dialogueText} <:cuteplant:1152834055528783872>\n` +
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
  const expireImgUrl = beeConfig?.expire_image_url ||
    "https://cdn.discordapp.com/attachments/1524704267015819274/1535772084284821556/a3f90f4310003ac808ae430a9bae79ed.gif?ex=6a78fab6&is=6a77a936&hm=2e479154b92d3fe2d9a668a4f08d77f2dd79433bf7786d8cd8a58a67a7c0dd92&";

  const beeName = beeConfig?.name || 'เจ้าผึ้งอ้วนตัวกลม';

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
                  `-# <a:3602exclamationmarkbubble:1372837492205555812>⠀**บทพูดเจ้าผึ้ง** : (บินกลับรัง) แถวหนีหวานหมู่ชะมัด นำน้ำผึ้งกลับรังดีกว่า ดีนะแถวนี้ไม่มีพวกหมีอ้วน ๆ <:cuteplant:1152834055528783872>\n` +
                  ` > (<:strawberryv2:1520439075100688614>)⠀**__\`𝗆𝗌𝗀\`__** : เนื่องจากไม่มีหมีตัวใดสนใจผึ้ง ผึ้งเลยบินหายไปแล้ว . . .`
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

module.exports = {
  buildBeeSpawnPayload,
  buildBeeWinPayload,
  buildBeeLossPayload,
  buildBeePoisonLossPayload,
  buildBeeExpiredPayload
};
