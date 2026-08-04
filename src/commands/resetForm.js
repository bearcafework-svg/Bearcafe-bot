// src/commands/resetForm.js
// ระบบส่งแบบฟอร์มรับสมัครทีมงาน (Recruitment Form System Component V2)
// รองรับคำสั่ง b!reset-form (Owner เท่านั้น), role_blacklist, และ Cooldown ผ่าน Supabase

const { createClient } = require("@supabase/supabase-js");
const { MessageFlags } = require("discord.js");
const sharedConfig = require("../sharedSettings.json");
const { safeRespond } = require("../../utils/discordSafety");
const { getCooldown, setCooldown } = require("../utils/cooldownManager");
const { cooldownContent, blacklistPayload } = require("../features/shared/tarotComponents");

// Discord Flags
const FLAG_V2 = MessageFlags.IsComponentsV2; // 32768
const FLAG_EPHEMERAL = MessageFlags.Ephemeral; // 64
const FLAG_V2_EPH = FLAG_V2 | FLAG_EPHEMERAL; // 32832

const COOLDOWN_MS = 3000; // Cooldown 5 วินาทีต่อการกดปุ่ม

// ─── Component Payloads ──────────────────────────────────────────────────────

// Main Panel 1
const MAIN_PANEL_1 = {
  flags: FLAG_V2,
  components: [
    {
      type: 17,
      components: [
        {
          type: 12,
          items: [
            {
              media: {
                url: "https://cdn.discordapp.com/attachments/1524742861223100416/1525192989855453284/NewsBoard_-_bearcafe_5.png?ex=6a68e7a9&is=6a679629&hm=133287b5ba31bb77ef7bfb7a1cab11dd3fe54c043d2de82bdb44852a44ce3a16&"
              }
            }
          ]
        },
        {
          type: 14,
          spacing: 2,
          divider: true
        },
        {
          type: 10,
          content: "## <a:bearg14:1396016043490672711>︲__` เปิดรับสมัครทีมงานคาเฟ่หมี `__\nคาเฟ่หมีกำลังมองหาทีมงานที่จะมาช่วยดูแลบรรยากาศ พัฒนาชุมชน และสร้างพื้นที่อบอุ่นให้ทุกคนได้ใช้เวลาร่วมกันอย่างสนุกและปลอดภัย ไม่จำเป็นต้องเก่งที่สุด แค่มีความรับผิดชอบ เข้ากับคนอื่นได้ และอยากเติบโตไปพร้อมกับทีมก็พอแล้วค่ะ <:cuteplant:1152834055528783872>"
        },
        {
          type: 14,
          spacing: 2,
          divider: true
        },
        {
          type: 12,
          items: [
            {
              media: {
                url: "https://cdn.discordapp.com/attachments/1524704267015819274/1525192648540029010/NewsBoard_-_bearcafe_4.png?ex=6a68e758&is=6a6795d8&hm=9cfc0e24fc9c3da7417f90c2901e5ac340a28348589b32b0631ddad18aa2c601&"
              }
            }
          ]
        },
        {
          type: 9,
          components: [
            {
              type: 10,
              content: "- <:28906question:1370964974733758474>  __**`เกณฑ์การสมัคร`**__ : รับสมัครสมาชิกที่มีอายุ **18 ปีขึ้นไป**"
            }
          ],
          accessory: {
            style: 3,
            type: 2,
            label: "︲สนใจตำหน่ง",
            emoji: { id: "1372837492205555812", name: "3602exclamationmarkbubble", animated: true },
            flow: {
              actions: []
            },
            custom_id: "p_299778864823930912"
          }
        },
        {
          type: 14,
          spacing: 2,
          divider: true
        },
        {
          type: 12,
          items: [
            {
              media: {
                url: "https://cdn.discordapp.com/attachments/1524704267015819274/1525191468590043316/2.png?ex=6a68e63e&is=6a6794be&hm=5d2fc9d1041492930de51cebc20e76bed3a13af9af7b02bc9dc133c456a93d11&"
              }
            }
          ]
        },
        {
          type: 9,
          components: [
            {
              type: 10,
              content: "- <:28906question:1370964974733758474>  __**`เกณฑ์การสมัคร`**__ : รับสมัครสมาชิกที่มีอายุ **18 ปีขึ้นไป**"
            }
          ],
          accessory: {
            style: 3,
            type: 2,
            label: "︲สนใจตำหน่ง",
            emoji: { id: "1372837492205555812", name: "3602exclamationmarkbubble", animated: true },
            flow: {
              actions: []
            },
            custom_id: "p_299780318032826369"
          }
        },
        {
          type: 14,
          spacing: 2,
          divider: true
        }
      ]
    }
  ]
};

// Main Panel 2
const MAIN_PANEL_2 = {
  flags: FLAG_V2,
  components: [
    {
      type: 17,
      components: [
        {
          type: 12,
          items: [
            {
              media: {
                url: "https://cdn.discordapp.com/attachments/1524704267015819274/1525191467776213153/4.png?ex=6a68e63e&is=6a6794be&hm=73c67936495f1c9fc72bb400281683ee4d0130eab119761c1c4ec051fac84bb8&"
              }
            }
          ]
        },
        {
          type: 9,
          components: [
            {
              type: 10,
              content: "- <:28906question:1370964974733758474>  __**`เกณฑ์การสมัคร`**__ : รับสมัครสมาชิกที่มีอายุ **18 ปีขึ้นไป**"
            }
          ],
          accessory: {
            style: 3,
            type: 2,
            label: "︲สนใจตำหน่ง",
            emoji: { id: "1372837492205555812", name: "3602exclamationmarkbubble", animated: true },
            flow: {
              actions: []
            },
            custom_id: "p_299782993805840416"
          }
        },
        {
          type: 14,
          spacing: 2,
          divider: true
        },
        {
          type: 12,
          items: [
            {
              media: {
                url: "https://cdn.discordapp.com/attachments/1524704267015819274/1525191467449061486/3.png?ex=6a68e63e&is=6a6794be&hm=5b6ae35e0ca59f655523e9f401a26905e340cc4c4dccebc8377884e388736be7&"
              }
            }
          ]
        },
        {
          type: 9,
          components: [
            {
              type: 10,
              content: "- <:28906question:1370964974733758474>  __**`เกณฑ์การสมัคร`**__ : รับสมัครสมาชิกที่มีอายุ **18 ปีขึ้นไป**"
            }
          ],
          accessory: {
            style: 3,
            type: 2,
            label: "︲สนใจตำหน่ง",
            emoji: { id: "1372837492205555812", name: "3602exclamationmarkbubble", animated: true },
            flow: {
              actions: []
            },
            custom_id: "p_299782044467073027"
          }
        },
        {
          type: 14,
          spacing: 2,
          divider: true
        },
        {
          type: 12,
          items: [
            {
              media: {
                url: "https://cdn.discordapp.com/attachments/1524704267015819274/1525191468342575204/6.png?ex=6a68e63e&is=6a6794be&hm=f5108e7deb2308ae0dff3131e79a6e5ff6a381ed9ce9f5af2c3b2ac4092c6a63&"
              }
            }
          ]
        },
        {
          type: 9,
          components: [
            {
              type: 10,
              content: "- <:28906question:1370964974733758474>  __**`เกณฑ์การสมัคร`**__ : รับสมัครสมาชิกที่มีอายุ **18 ปีขึ้นไป**"
            }
          ],
          accessory: {
            style: 3,
            type: 2,
            label: "︲สนใจตำหน่ง",
            emoji: { id: "1372837492205555812", name: "3602exclamationmarkbubble", animated: true },
            flow: {
              actions: []
            },
            custom_id: "p_315497091738636293"
          }
        },
        {
          type: 14,
          spacing: 2,
          divider: true
        }
      ]
    }
  ]
};

// Response for Barista
const RESPONSE_BARISTA = {
  flags: FLAG_V2_EPH,
  components: [
    {
      type: 17,
      components: [
        {
          type: 12,
          items: [
            {
              media: {
                url: "https://cdn.discordapp.com/attachments/1524704267015819274/1525192648540029010/NewsBoard_-_bearcafe_4.png?ex=6a527dd8&is=6a512c58&hm=3711ab1e33974d74456d58ba7f924da9629b66650ac1af19d828c59f9e9e156c&"
              }
            }
          ]
        },
        {
          type: 9,
          components: [
            {
              type: 10,
              content: "## <:bear_star1:1152782839671169184>︲**__`รบกวนอ่านข้อตกลงก่อนสมัคร`__**"
            }
          ],
          accessory: {
            style: 1,
            type: 2,
            label: "︲อ่านข้อตกลง",
            emoji: { id: "1533982607170080819", name: "445181discordorbsbook", animated: false },
            flow: {
              actions: []
            },
            custom_id: "p_328492582675943430"
          }
        },
        {
          type: 14,
          spacing: 2
        },
        {
          type: 9,
          components: [
            {
              type: 10,
              content: "# <@&1144701361448038512> 𓂃 <a:99322sparkles:1372427884479778908>\n<:line:1144701793989840997>\n- **__`หน้าที่`__**\n  - ดูแลความปลอดภัยของคาเฟ่ ทั้งในแชทและห้องพูดคุย\n  - รับมือและจัดการปัญหาที่เกิดขึ้นภายในคาเฟ่อย่างเป็นระบบ\n  - ควบคุมความเรียบร้อยของคาเฟ่ ให้เป็นพื้นที่ที่น่าอยู่และเป็นมิตร\n  - ประสานงานกับทีมงานอื่น ๆ เมื่อต้องแก้ไขปัญหาสำคัญ\n\n- **__`คุณสมบัติ`__**\n  - มีความเป็นกลางและสามารถตัดสินใจอย่างยุติธรรม\n  - ตัดสินใจได้อย่างเด็ดขาดเมื่อเผชิญสถานการณ์สำคัญ\n  - แก้ไขปัญหาเฉพาะหน้าได้อย่างรวดเร็วและรอบคอบ\n  - มีเหตุผล ใจเย็น และสามารถควบคุมอารมณ์ได้ดี\n  - สื่อสารได้ดี น้ำเสียงน่าฟัง พูดจาฉะฉานและเข้าใจง่าย"
            }
          ],
          accessory: {
            style: 3,
            type: 2,
            label: "︲สมัครตำแหน่งนี้",
            emoji: { id: "1396016002818506754", name: "bearg23", animated: true },
            flow: {
              actions: []
            },
            custom_id: "p_328492684232626183"
          }
        },
        {
          type: 14,
          spacing: 2
        }
      ]
    }
  ]
};

// Response for Service
const RESPONSE_SERVICE = {
  flags: FLAG_V2_EPH,
  components: [
    {
      type: 17,
      components: [
        {
          type: 12,
          items: [
            {
              media: {
                url: "https://media.discordapp.net/attachments/1524704267015819274/1525191468590043316/2.png?ex=6a527cbe&is=6a512b3e&hm=7bccd025c27bf1ea1ea0f99d613a6fa803ba272df6253d95e181924ba3177131&=&format=webp&quality=lossless"
              }
            }
          ]
        },
        {
          type: 9,
          components: [
            {
              type: 10,
              content: "## <:bear_star1:1152782839671169184>︲**__`รบกวนอ่านข้อตกลงก่อนสมัคร`__**"
            }
          ],
          accessory: {
            style: 1,
            type: 2,
            label: "︲อ่านข้อตกลง",
            emoji: { id: "1533982607170080819", name: "445181discordorbsbook", animated: false },
            custom_id: "p_315502247003820042",
            flow: {
              actions: []
            }
          }
        },
        {
          type: 14,
          spacing: 2
        },
        {
          type: 9,
          components: [
            {
              type: 10,
              content: "# <@&1144696486815342673> 𓂃 <a:99322sparkles:1372427884479778908>\n<:line:1144701793989840997>\n- **__`หน้าที่`__**\n  - ดูแลและจัดการเรื่องการซื้อขายภายในคาเฟ่\n  - ให้บริการเกี่ยวกับยศและระบบต่าง ๆ \n  - ตรวจสอบและดูแลความถูกต้องของธุรกรรมภายในคาเฟ่\n  - ดำเนินการเกี่ยวกับ: การซื้อยศ, การเช่าบ้านหมี, การรับสิทธิ์บูสต์, การเพิ่ม-ลบ-แก้ไขยศส่วนตัว, การรับโดเนท\n\n- **__`คุณสมบัติ`__**\n  - มีความรวดเร็วและสามารถโฟกัสกับงานได้ดี\n  - ให้บริการสมาชิกด้วยความสุภาพและเป็นมิตร\n  - รับมือกับปัญหาหรือข้อขัดข้องระหว่างการให้บริการได้อย่างมีประสิทธิภาพ\n  - รอบคอบและสามารถตรวจสอบรายละเอียดธุรกรรมได้อย่างแม่นยำ"
            }
          ],
          accessory: {
            style: 3,
            type: 2,
            label: "︲สมัครตำแหน่งนี้",
            emoji: { id: "1396016002818506754", name: "bearg23", animated: true },
            custom_id: "p_315502430684975115",
            flow: {
              actions: []
            }
          }
        },
        {
          type: 14,
          spacing: 2
        }
      ]
    }
  ]
};

// Response for Content
const RESPONSE_CONTENT = {
  flags: FLAG_V2_EPH,
  components: [
    {
      type: 17,
      components: [
        {
          type: 12,
          items: [
            {
              media: {
                url: "https://media.discordapp.net/attachments/1524704267015819274/1525191467776213153/4.png?ex=6a527cbe&is=6a512b3e&hm=632eb8e9b39cbf58b2dce8eb705fb8f1d05c447d777cad453e511989dc8d6549&=&format=webp&quality=lossless"
              }
            }
          ]
        },
        {
          type: 9,
          components: [
            {
              type: 10,
              content: "## <:bear_star1:1152782839671169184>︲**__`รบกวนอ่านข้อตกลงก่อนสมัคร`__**"
            }
          ],
          accessory: {
            style: 1,
            type: 2,
            label: "︲อ่านข้อตกลง",
            emoji: { id: "1533982607170080819", name: "445181discordorbsbook", animated: false },
            custom_id: "p_315502680170565644",
            flow: {
              actions: []
            }
          }
        },
        {
          type: 14,
          spacing: 2
        },
        {
          type: 9,
          components: [
            {
              type: 10,
              content: "# <@&1243548916121731072> 𓂃 <a:99322sparkles:1372427884479778908>\n<:line:1144701793989840997>\n- **__`หน้าที่`__**\n  - สร้างคอนเทนต์ของคาเฟ่ เช่น คลิปสั้น, มีม, โพสต์ หรือสื่อสนุก ๆ ตามสไตล์ของตัวเอง\n  - ช่วยคิดไอเดียและนำเสนอบรรยากาศดี ๆ ให้คาเฟ่ดูมีชีวิตชีวาอยู่เสมอ\n  - ลงผลงานหรือคอนเทนต์ของคาเฟ่เป็นครั้งคราว (ประมาณเดือนละ 2 ชิ้น แบบยืดหยุ่นได้)\n  - ถ่ายทอดความเป็นคาเฟ่ให้สมาชิกใหม่และคนภายนอกรู้จักผ่านผลงานของตัวเอง\n\n- **__`คุณสมบัติ`__**\n  - **จำเป็นต้องมีผลงานหรือพอร์ตเพื่อใช้ในการพิจารณา**\n  - ชอบทำคอนเทนต์ ตัดต่อคลิป หรือมีไอเดียสร้างสรรค์\n  - ใช้งานแอปตัดต่อหรือออกแบบพื้นฐานได้ เช่น Canva, CapCut หรืออื่น ๆ\n  - มีความรับผิดชอบและสื่อสารกับทีมได้ดี\n  - เปิดรับฟีดแบ็กและพร้อมพัฒนาผลงานของตัวเอง"
            }
          ],
          accessory: {
            style: 3,
            type: 2,
            label: "︲สมัครตำแหน่งนี้",
            emoji: { id: "1396016002818506754", name: "bearg23", animated: true },
            custom_id: "p_315500592833236993",
            flow: {
              actions: []
            }
          }
        },
        {
          type: 14,
          spacing: 2
        }
      ]
    }
  ]
};

// Response for Graphic
const RESPONSE_GRAPHIC = {
  flags: FLAG_V2_EPH,
  components: [
    {
      type: 17,
      components: [
        {
          type: 12,
          items: [
            {
              media: {
                url: "https://media.discordapp.net/attachments/1524704267015819274/1525191467449061486/3.png?ex=6a527cbe&is=6a512b3e&hm=a392b286bb7dadb80f1063d1247e643bef8e55bff304f157bac3c9e13a8e31fb&=&format=webp&quality=lossless"
              }
            }
          ]
        },
        {
          type: 9,
          components: [
            {
              type: 10,
              content: "## <:bear_star1:1152782839671169184>︲**__`รบกวนอ่านข้อตกลงก่อนสมัคร`__**"
            }
          ],
          accessory: {
            style: 1,
            type: 2,
            label: "︲อ่านข้อตกลง",
            emoji: { id: "1533982607170080819", name: "445181discordorbsbook", animated: false },
            custom_id: "p_315503715010220033"
          }
        },
        {
          type: 14,
          spacing: 2
        },
        {
          type: 9,
          components: [
            {
              type: 10,
              content: "# <@&1144696977808965642> 𓂃 <a:99322sparkles:1372427884479778908>\n<:line:1144701793989840997>\n- **__`หน้าที่`__**\n  - ออกแบบป้ายประกาศ โพสเตอร์ หรือสื่อต่าง ๆ ภายในคาเฟ่ให้ดูน่าสนใจ\n  - ช่วยสร้างภาพลักษณ์และบรรยากาศของคาเฟ่ผ่านงานออกแบบ\n  - ออกแบบสื่อสำหรับกิจกรรม ข่าวสาร หรือคอนเทนต์ต่าง ๆ ของเซิร์ฟเวอร์\n  - ร่วมเสนอไอเดียและสไตล์ใหม่ ๆ ให้คาเฟ่ดูมีเอกลักษณ์มากขึ้น\n\n- **__`คุณสมบัติ`__**\n  - **จำเป็นต้องมีผลงานหรือพอร์ตเพื่อใช้ในการพิจารณา**\n  - หากมีประสบการณ์เกี่ยวกับ UX/UI จะเริ่ดกว่า\n  - ชอบงานออกแบบและมีความคิดสร้างสรรค์\n  - ใช้งานโปรแกรมหรือแอปออกแบบพื้นฐานได้ เช่น Canva, Photoshop หรืออื่น ๆ\n  - เข้าใจโทนสี ฟอนต์ หรือการจัดวางองค์ประกอบเบื้องต้น\n  - มีความรับผิดชอบและสามารถพูดคุยทำงานร่วมกับทีมได้"
            }
          ],
          accessory: {
            style: 3,
            type: 2,
            label: "︲สมัครตำแหน่งนี้",
            emoji: { id: "1396016002818506754", name: "bearg23", animated: true },
            custom_id: "p_315503876352512002",
            flow: {
              actions: []
            }
          }
        },
        {
          type: 14,
          spacing: 2
        }
      ]
    }
  ]
};

// Response for Cozy
const RESPONSE_COZY = {
  flags: FLAG_V2_EPH,
  components: [
    {
      type: 17,
      components: [
        {
          type: 12,
          items: [
            {
              media: {
                url: "https://media.discordapp.net/attachments/1524704267015819274/1525191468342575204/6.png?ex=6a527cbe&is=6a512b3e&hm=3bc905ec501421105b631cb1024abc7081a890265ffd8c96d287967736a14a1d&=&format=webp&quality=lossless"
              }
            }
          ]
        },
        {
          type: 9,
          components: [
            {
              type: 10,
              content: "## <:bear_star1:1152782839671169184>︲**__`รบกวนอ่านข้อตกลงก่อนสมัคร`__**"
            }
          ],
          accessory: {
            style: 1,
            type: 2,
            label: "︲อ่านข้อตกลง",
            emoji: { id: "1533982607170080819", name: "445181discordorbsbook", animated: false },
            custom_id: "p_315504071454756867",
            flow: {
              actions: []
            }
          }
        },
        {
          type: 14,
          spacing: 2
        },
        {
          type: 9,
          components: [
            {
              type: 10,
              content: "# <@&1205512963058962482> 𓂃 <a:99322sparkles:1372427884479778908>\n<:line:1144701793989840997>\n- **__`หน้าที่`__**\n  - สร้างสีสันและความคึกคักภายในช่องแชทต่าง ๆ\n  - ต้อนรับสมาชิกใหม่และช่วยทำให้พวกเขารู้สึกยินดีและเป็นส่วนหนึ่งของคาเฟ่\n  - สร้างสีสันในแชทให้ไม่เงียบและกระตุ้นให้สมาชิกมีการพูดคุยกัน\n  - ควบคุมเป้าหมายการพิมพ์ 2,400 / เดือน ตกวันละ 80 ข้อความโดยเฉลี่ย\n  - ไม่จำเป็นต้องเข้าไปในห้องคาเฟ่ เพียงแค่ดูแลแชทหลัก\n\n- **__`คุณสมบัติ`__**\n  - มีความเฟรนลี่และสามารถเข้ากับสมาชิกได้หลากหลายประเภท\n  - พิมพ์คุยได้อย่างคล่องแคล่วและปรับตัวกับสถานการณ์ต่าง ๆ ได้ดี\n  - ใช้ภาษาพิมพ์ได้อย่างสร้างสรรค์ มีความน่าสนใจและไม่หยาบคาย\n  - สามารถสร้างความบันเทิงในแชทได้โดยไม่ให้ดูน่าเบื่อ"
            }
          ],
          accessory: {
            style: 3,
            type: 2,
            label: "︲สมัครตำแหน่งนี้",
            emoji: { id: "1396016002818506754", name: "bearg23", animated: true },
            custom_id: "p_315504596912967693"
          }
        },
        {
          type: 14,
          spacing: 2
        }
      ]
    }
  ]
};

// Response for "อ่านข้อตกลง"
const RESPONSE_TERMS = {
  flags: FLAG_V2_EPH,
  components: [
    {
      type: 17,
      components: [
        {
          type: 12,
          items: [
            {
              media: {
                url: "https://cdn.discordapp.com/attachments/1524742861223100416/1525192989855453284/NewsBoard_-_bearcafe_5.png?ex=6a586ce9&is=6a571b69&hm=a7426cf088b8592dcbf3292bc7e318b65a0eda9e1663905dcc7e1852bcff217e&"
              }
            }
          ]
        },
        {
          type: 14,
          spacing: 2
        },
        {
          type: 10,
          content: "## <:bear_star1:1152782839671169184>︲**__` ข้อตกลง `__**\n1. ต้องไม่ติดโทษภายในคาเฟ่หมี และต้องเข้าร่วมเซิร์ฟเวอร์มาแล้วอย่างน้อย **3 วัน**\n2. ทีมงานคาเฟ่หมีควรเป็นความรับผิดชอบหลัก <:68440x:1358584606911369226> ไม่รับทีมงานจากเซิร์ฟเวอร์อื่นในช่วงปฏิบัติงาน\n3. กรุณาเปิด **2FA (ยืนยันตัวตนสองชั้น)** ก่อนเข้าสัมภาษณ์ [คลิกเพื่อดูวิธีเปิด](https://youtu.be/e5NkMt4tzBQ?si=xvUEi8cWCablythD)\n4. เหตุผลในการสมัครควรเขียนให้ **เหมาะสม** และใช้ข้อมูลจริงในการสมัคร\n5. การคัดเลือกและเรียกสัมภาษณ์จะพิจารณาจากความเหมาะสมของใบสมัครเป็นหลัก\n6. หากพบการกรอกเล่น ป่วน หรือไม่จริงจัง ทีมงานอาจงดรับสมัครในอนาคต\n7. ใบสมัครมีอายุ **48 ชั่วโมง** หากไม่ตอบกลับภายในเวลาที่กำหนด จะต้องสมัครใหม่อีกครั้ง\n8. ไม่อนุญาตให้ออกระหว่างช่วงฝึกงาน กรุณาจัดการเวลาและความพร้อมของตนเองก่อนสมัคร\n  - ยกเว้นกรณีจำเป็นจริง ๆ เช่น ปัญหาสุขภาพ การเรียน งาน หรือเหตุฉุกเฉินที่ไม่สามารถปฏิบัติงานต่อได้"
        },
        {
          type: 14,
          spacing: 2
        },
        {
          type: 10,
          content: "## <:bear_star1:1152782839671169184>︲**__` คุณสมบัติพื้นฐาน `__**\n  - **(🌈)  รับทุกเพศ** ไม่จำกัด เพศชาย, เพศหญิง และเพศทางเลือก\n  - **(💪🏻)  มีความอดทน** และกระตือรือร้นในการทำงาน\n  - **(👥)  มีทักษะการทำงานร่วมกับผู้อื่น** และสามารถปรับตัวเข้ากับทีมได้ดี\n  - **(🎖)  มีทักษะการใช้โปรแกรม** เช่น Discord, Google Sheet, Discord Webhook, Notion\n  - **(📚)  มีความรับผิดชอบ** และสามารถจัดการงานให้เสร็จตามกำหนดเวลา\n  - **(👑)  มีความตั้งใจ** และมุ่งมั่นในการพัฒนาตนเองและคาเฟ่\n  - **(❤)  เปิดรับคำติชม** และสามารถเรียนรู้จากข้อเสนอแนะได้"
        },
        {
          type: 14,
          spacing: 2
        },
        {
          type: 10,
          content: "## <:bear_star1:1152782839671169184>︲**__` ระยะการฝึกงาน `__**\n> ระยะฝึกงานประมาณ **7 – 15 วัน** หรือมากกว่านั้น ขึ้นอยู่กับการพิจารณาของเจ้าของเซิร์ฟเวอร์และความเหมาะสมในการปฏิบัติงาน <:cuteplant:1152834055528783872>"
        },
        {
          "type": 14,
          "spacing": 2
        },
        {
          type: 10,
          content: "## <:bear_star1:1152782839671169184>︲**__` สิ่งที่คุณจะได้รับเมื่อผ่านฝึกงาน `__**\n\n  * สิทธิ์ในการจัดการห้องพูดคุย เช่น เปิด-ปิดไมค์ เปิด-ปิดหูฟัง ย้ายสมาชิก และฟีเจอร์เพิ่มเติมตามตำแหน่ง\n  * สามารถเปลี่ยนสีชื่อได้ที่ <#1524123572757467167>\n  * สามารถเข้าโซน VIP ได้ <:cuteplant:1152834055528783872>\n## <a:bearg11:1396016056035840140>︲หมายเหตุ:\n`สิทธิพิเศษทั้งหมดเป็นสิทธิ์เฉพาะทีมงาน และจะถูกถอดคืนเมื่อพ้นจากตำแหน่งนะคะ`\n"
        },
        {
          type: 14,
          spacing: 2
        }
      ]
    }
  ]
};

// Response for "สมัครตำแหน่งนี้"
const RESPONSE_FORM = {
  flags: FLAG_V2_EPH,
  components: [
    {
      type: 17,
      components: [
        {
          type: 10,
          content: "## <:bear_star1:1152782839671169184>︲**__`ขั้นตอนการส่งแบบฟอร์ม`__**\n1. คัดลอกแบบฟอร์มด้านล่าง\n2. อ่านรายละเอียดและกรอกข้อมูลให้ครบถ้วน\n3. ส่งแบบฟอร์มผ่านแชทส่วนตัวของ <@&1508821424129835118> **เพียง 1 คน**\n\n**หมายเหตุ**\n> * ห้ามส่งแบบฟอร์มเดียวกันให้ทีมงานหลายคน หากตรวจพบจะ **ตัดสิทธิ์การสัมภาษณ์ถาวร**\n> * หากส่งแบบฟอร์มแล้วไม่ได้รับการตอบกลับภายใน **24 ชั่วโมง** สามารถแจ้ง <@944920660759707658> ได้ทันที\n> * **กรุณา @เพื่อน ก่อนทักทุกครั้ง** เพื่อให้ทีมงานได้รับการแจ้งเตือนและตอบกลับได้รวดเร็วยิ่งขึ้น"
        },
        {
          type: 14,
          spacing: 2
        },
        {
          type: 10,
          content: "```\n# 🐻︲__แบบฟอร์ม__\n- ชื่อ:\n- อายุ:\n- วันเดือนปีเกิด: (กรอกเป็น ค.ศ. ตัวอย่าง 01/01/2001)\n- ตำแหน่ง: \n- ทักษะในการทำงาน:\n- เวลาในการทำงาน:\n- เหตุผล:```"
        }
      ]
    }
  ]
};

// Map of Custom ID -> Response Payload
const CUSTOM_ID_RESPONSES = {
  // Main role interest buttons
  "p_299778864823930912": RESPONSE_BARISTA,
  "p_299780318032826369": RESPONSE_SERVICE,
  "p_299782993805840416": RESPONSE_CONTENT,
  "p_299782044467073027": RESPONSE_GRAPHIC,
  "p_315497091738636293": RESPONSE_COZY,

  // "อ่านข้อตกลง" buttons
  "p_328492582675943430": RESPONSE_TERMS,
  "p_315502247003820042": RESPONSE_TERMS,
  "p_315502680170565644": RESPONSE_TERMS,
  "p_315503715010220033": RESPONSE_TERMS,
  "p_315504071454756867": RESPONSE_TERMS,

  // "สมัครตำแหน่งนี้" buttons
  "p_328492684232626183": RESPONSE_FORM,
  "p_315502430684975115": RESPONSE_FORM,
  "p_315500592833236993": RESPONSE_FORM,
  "p_315503876352512002": RESPONSE_FORM,
  "p_315504596912967693": RESPONSE_FORM,
};

function setupResetForm(client) {
  const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  // 1. คำสั่งสร้างพาเนล b!reset-form (Owner เท่านั้น)
  client.on("messageCreate", async (message) => {
    if (message.author.bot) return;
    if (message.content.trim().toLowerCase() !== "b!reset-form") return;
    if (!message.guild) return;

    const OWNER_ID = process.env.OWNER_ID;
    const isOwner = (message.author.id === OWNER_ID || message.author.id === message.guild.ownerId);

    if (!isOwner) {
      return message.reply({ content: "❌ คำสั่งนี้ใช้ได้เฉพาะ Owner เท่านั้นค่ะ", flags: FLAG_EPHEMERAL });
    }

    try {
      await message.delete().catch(() => { });
      await message.channel.send(MAIN_PANEL_1);
      await message.channel.send(MAIN_PANEL_2);
    } catch (err) {
      console.error("[resetForm] reset-form panel error:", err);
      message.channel.send("❌ เกิดข้อผิดพลาดในการสร้างแบบฟอร์มรับสมัครทีมงานค่ะ").catch(() => { });
    }
  });

  // 2. ตรวจสอบการกดปุ่ม Interaction
  client.on("interactionCreate", async (interaction) => {
    if (!interaction.isButton()) return;

    const { customId, member } = interaction;

    // ตรวจสอบว่า customId ตรงกับปุ่มในระบบ recruitment form หรือไม่
    const responsePayload = CUSTOM_ID_RESPONSES[customId];
    if (!responsePayload) return;

    if (!interaction.guild || !member) return;

    // ── ตรวจสอบ Blacklist ───────────────────────────────────────────
    const isBlacklisted = sharedConfig.role_blacklist.some(id => member.roles.cache.has(id));
    if (isBlacklisted) {
      const payload = blacklistPayload(member.id);
      payload.flags = FLAG_V2_EPH; // Ephemeral V2
      return safeRespond(interaction, payload);
    }

    // ── ตรวจสอบ Cooldown (เชื่อมกับ user_cooldowns table) ────────────
    const now = Date.now();
    const cdExpiry = await getCooldown(supabase, member.id, "recruitment_form");
    if (now < cdExpiry) {
      const readyTimestamp = Math.floor(cdExpiry / 1000);
      return safeRespond(interaction, {
        flags: FLAG_V2_EPH,
        components: [
          {
            type: 17,
            components: [
              { type: 14, spacing: 2 },
              {
                type: 10,
                content: cooldownContent(member.id, readyTimestamp)
              },
              { type: 14, spacing: 2 }
            ]
          }
        ]
      });
    }

    // บันทึก Cooldown ลง Supabase (5 วินาที)
    await setCooldown(supabase, member.id, "recruitment_form", now + COOLDOWN_MS);

    // ตอบกลับ Component V2 แบบ Ephemeral V2
    return safeRespond(interaction, responsePayload);
  });
}

module.exports = { setupResetForm };
