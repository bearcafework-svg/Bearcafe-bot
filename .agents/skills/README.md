# Agent Skills Index

ดัชนีรวมรายการ Agent Skills ของโปรเจกต์ เรียงลำดับตามชื่อโฟลเดอร์ขึ้นต้นด้วย `skill-` เพื่อให้สามารถค้นหาและเรียกใช้ผ่านสัญลักษณ์ `@` ใน Antigravity IDE ได้อย่างสะดวกรวดเร็ว

---

## skill-analyze-log
วิเคราะห์ log, stack trace และรวบรวมหลักฐานเพื่อหาสาเหตุของปัญหา

**ใช้เมื่อ:**
- ต้องวิเคราะห์ Error log / Stack trace / Runtime failure
- ต้องการแยกแยะสาเหตุหลัก (Root cause) ออกจากผลกระทบข้างเคียง

**ชื่อโฟลเดอร์:** `skill-analyze-log`  
**เรียกใช้:**  
`@skill-analyze-log`

---

## skill-diagnose-system
วินิจฉัยระบบหรือฟีเจอร์ที่ทำงานผิดปกติ ไม่ครบถ้วน หรือไม่ตรงตามข้อกำหนด

**ใช้เมื่อ:**
- ระบบทำงานผิดพลาดโดยไม่มี Error log หรือได้ผลลัพธ์ไม่ตรงตามที่คาดหวัง
- ต้องการไล่เรียง Execution Flow (Expected vs Actual) ก่อนเสนอวิธีแก้ไข

**ชื่อโฟลเดอร์:** `skill-diagnose-system`  
**เรียกใช้:**  
`@skill-diagnose-system`

---

## skill-discord-check
ตรวจสอบและทบทวนฟีเจอร์ Discord Bot ด้านความถูกต้อง สิทธิ์ และประสิทธิภาพ

**ใช้เมื่อ:**
- ตรวจสอบหรือแก้ไขฟีเจอร์ Discord Bot
- ตรวจสอบ Permissions, Intents, Event Handling, Interaction Timeout และ API Rate Limits

**ชื่อโฟลเดอร์:** `skill-discord-check`  
**เรียกใช้:**  
`@skill-discord-check`

---

## skill-fix-error
สืบหาและแก้ไขข้อผิดพลาด (Application Errors) พร้อมยืนยันผลการแก้ไข

**ใช้เมื่อ:**
- ต้องการสืบหาสาเหตุและดำเนินการแก้ไข Bug หรือ Runtime Error
- ตรวจสอบและทดสอบยืนยันหลังการแก้ไขโค้ด

**ชื่อโฟลเดอร์:** `skill-fix-error`  
**เรียกใช้:**  
`@skill-fix-error`

---

## skill-plan
วางแผนการพัฒนาหรือปรับปรุงระบบอย่างเป็นขั้นตอน (Implementation Plan) ก่อนลงมือทำ

**ใช้เมื่อ:**
- มีโจทย์ชัดเจนและต้องการแผนการพัฒนาที่ระบุไฟล์ที่จะแก้ไข, Data Flow, Security และแผนการทดสอบ
- ต้องการประเมินความเสี่ยงและขั้นตอนการทำงานอย่างเป็นระบบ

**ชื่อโฟลเดอร์:** `skill-plan`  
**เรียกใช้:**  
`@skill-plan`

---

## skill-pre-deploy
ตรวจสอบความพร้อมของระบบก่อนนำขึ้น Production (Pre-deployment readiness check)

**ใช้เมื่อ:**
- ก่อนทำการ Deploy แอปพลิเคชัน, Discord Bot, Web App หรือ Database Changes
- ตรวจสอบ Build, Unit Tests, Configuration, Secret Leakage และ Security Risks

**ชื่อโฟลเดอร์:** `skill-pre-deploy`  
**เรียกใช้:**  
`@skill-pre-deploy`

---

## skill-review-code
รีวิวโค้ดเน้นด้านความถูกต้อง ความปลอดภัย ประสิทธิภาพ และความเสี่ยงในการกระทบส่วนอื่น

**ใช้เมื่อ:**
- ต้องการรีวิวโค้ดที่เขียนขึ้นใหม่ หรือตรวจสอบ Diff ของโปรเจกต์
- ตรวจสอบคุณภาพโค้ดก่อนรวมโค้ดหรือ Deploy

**ชื่อโฟลเดอร์:** `skill-review-code`  
**เรียกใช้:**  
`@skill-review-code`

---

## skill-supabase-check
ตรวจสอบและ Audit การใช้งาน Supabase Database, RLS และ Edge Functions

**ใช้เมื่อ:**
- ทบทวนการออกแบบฐานข้อมูล Supabase, Migrations, RLS Policies, RPC Functions
- ตรวจสอบความปลอดภัยและการเข้าถึงข้อมูลใน Supabase

**ชื่อโฟลเดอร์:** `skill-supabase-check`  
**เรียกใช้:**  
`@skill-supabase-check`

---

## skill-system-consult
ให้คำปรึกษาด้านสถาปัตยกรรมและการออกแบบระบบก่อนเริ่มพัฒนา

**ใช้เมื่อ:**
- ต้องการแนวทางการออกแบบสถาปัตยกรรมระบบ (System Architecture) ใหม่
- วางแผน User Flow, Database Design, Integration Boundaries และเปรียบเทียบทางเลือก

**ชื่อโฟลเดอร์:** `skill-system-consult`  
**เรียกใช้:**  
`@skill-system-consult`
