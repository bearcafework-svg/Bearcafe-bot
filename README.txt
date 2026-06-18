ระบบสร้างห้อง Voice Channel อัตโนมัติ
- กดเข้า Lobby → บอทสร้างห้องใหม่ + ย้ายไปให้เลย
- ห้องว่างนาน 2 นาที → ลบอัตโนมัติ
- ห้องจัดเรียงอยู่ในโซนของตัวเอง ไม่รก

----------------------------------------------------------------
  โครงสร้างไฟล์
----------------------------------------------------------------

discord-smart-rooms/
├── index.js                  จุดเริ่มต้น รัน bot และ events
├── config.js                 ตั้งค่าโซน / lobbyChannelId ทั้งหมด
├── package.json              dependencies
├── .env.example              template สำหรับ token
├── .gitignore                ไม่ให้ .env ขึ้น git
│
├── events/
│   └── voiceStateUpdate.js   จับคนเข้า/ออก voice channel
│
├── handlers/
│   ├── roomCreator.js        สร้างห้องใหม่ + จัด position
│   ├── roomDestroyer.js      mark ห้องว่าง / ลบห้อง
│   ├── roomMonitor.js        loop ตรวจห้องว่างทุก 60 วิ
│
├── state/
│   └── redisClient.js        เชื่อม Upstash Redis เก็บ state
│
└── utils/
    ├── nameGenerator.js      สุ่มชื่อห้องตามธีมของโซน
    └── zoneResolver.js       แปลง channelId → zone
