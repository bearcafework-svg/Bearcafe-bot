---
name: component
description: ทำการคัดลอก Component v2 ออกมาในรูปแบบ Json ที่รองรับบน discohook.app ขอแบบ "flags": 32768
---

# Discord Component V2 Generator (`/component`)

คัดลอกและสร้างโครงสร้าง Discord Component V2 ในรูปแบบ JSON ที่รองรับบน [discohook.app](https://discohook.app) โดยเปิดใช้งาน `"flags": 32768` (MessageFlags.IsComponentsV2)

## กฎเหล็กของ Component V2
1. **ห้ามใส่ `content` ที่ Root Level**: ข้อความทั้งหมดต้องอยู่ใน `type: 10` (Text Display) ภายใน `type: 17` (Container)
2. **ห้ามปิดท้าย Container ด้วย Separator (`type: 14`)**: ชิ้นส่วนสุดท้ายต้องเป็น Text หรือ ActionRow เสมอ
3. **ปุ่มใน 1 แถว (`type: 1`) สูงสุด 5 ปุ่ม**: หากเกินต้องแยก ActionRow ใหม่
4. **Section (`type: 9`) ใส่ Accessory ได้ 1 ชิ้น**: เลือกระหว่างปุ่ม Link (`style: 5`) หรือ Thumbnail (`type: 11`)
