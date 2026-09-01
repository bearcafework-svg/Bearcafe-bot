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

---

## skill-feature

ควบคุมการออกแบบและพัฒนาฟีเจอร์ใหม่แบบครบวงจร (End-to-End Feature Development) ให้สอดคล้องกับสถาปัตยกรรมของบอต Bear Cafe

**ใช้เมื่อ:**

* ต้องการพัฒนาฟีเจอร์ใหม่, ระบบมินิเกม, ระบบแต้ม, ร้านค้า หรือคำสั่ง Discord ใหม่
* วางโครงสร้างโค้ดตั้งแต่ Database Schema (Supabase) -> Service Logic -> Controller Handler -> UI Feedback
* ต้องการจำกัดและป้องกันปัญหา Supabase Quota / Egress Exceeded และจัดการ Interaction Timeout

**ชื่อโฟลเดอร์:** `skill-feature`

**เรียกใช้:**

`@skill-feature`

---

## skill-refactor

ปรับปรุงโครงสร้างโค้ดและลดภาระทางเทคนิค (Technical Debt) โดยไม่กระทบการทำงานเดิมของระบบ

**ใช้เมื่อ:**

* ต้องการแยก Business Logic, Database Calls และ UI Payload ออกจาก Interaction Handlers
* ลดความซ้ำซ้อนของโค้ด (DRY) เช่น การรวม Constants, Shared Payloads หรือ Wrappers
* ปรับจูนและรวมคิวรี Supabase เพื่อลด Data Transfer / Egress
* ปรับเปลี่ยนคำสั่ง Discord API ให้ครอบด้วย Safety Wrappers เพื่อป้องกัน Interaction Errors

**ชื่อโฟลเดอร์:** `skill-refactor`

**เรียกใช้:**

`@skill-refactor`

---

## skill-learn

ศูนย์รวมและจัดเก็บบันทึกองค์ความรู้ เทคนิคเฉพาะทาง (Tech Quirks) และแนวทางแก้ปัญหาของระบบ

**ใช้เมื่อ:**

* แก้ปัญหาบั๊กที่ซับซ้อนสำเร็จ และต้องการบันทึก Root Cause ไว้ป้องกันเกิดซ้ำ
* ค้นพบข้อจำกัด/วิธีรับมือกับบริการภายนอก เช่น Supabase Quota Limits, Discord API Timeouts หรือ Canvas Font Rendering
* ต้องการสร้างเอกสาร Post-mortem หรือ Standard Operating Procedure (SOP) ประจำโปรเจกต์

**ชื่อโฟลเดอร์:** `skill-learn`

**เรียกใช้:**

`@skill-learn`

---

## skill-logger

จัดระเบียบและปรับแต่งข้อความ Terminal Console Log ในขณะเริ่มต้นรันบอทและระหว่างการทำงาน ให้เป็นรูปแบบ CLI Dashboard อ่านง่ายระดับมืออาชีพ

**ใช้เมื่อ:**

* ปรับแต่งข้อความ `console.log` ที่รบกวนหน้าจอให้เป็นระเบียบสวยงาม
* บันทึกสถานะการทำงานของบอทแบ่งหมวดหมู่ (`[CORE]`, `[COMMANDS]`, `[CLEANUP]`, `[DATABASE]`, `[SECURITY]`, `[MODULE]`)
* จัดการแสดงคำเตือน Supabase Egress Quota Exceeded แบบ Warning Banner สวยงาม

**ชื่อโฟลเดอร์:** `skill-logger`

**เรียกใช้:**

`@skill-logger`

---
skill-impact-analysis
วิเคราะห์ผลกระทบแบบลูกโซ่และตรวจสอบความเชื่อมโยงของไฟล์ทั้งระบบ (Discord Bot, Database, Config และ Frontend bear-cafe-web) ก่อนและหลังการแก้ไขโค้ด

ใช้เมื่อ:

ต้องการเปลี่ยนชื่อตัวแปร, Game ID, Role ID, Custom ID, หรือแก้ Config Key ที่มีหลายไฟล์เรียกใช้

ปรับเปลี่ยน Database Schema, Supabase RPC หรือโครงสร้าง JSON ที่เชื่อมโยงระหว่าง Bot และ Web Dashboard

ต้องการให้ AI กวาดหาทุกไฟล์ที่เกี่ยวข้อง (Blast Radius) และอัปเดตไปพร้อมกันแบบ Synchronized เพื่อไม่ให้หน้าเว็บหรือบอตพัง

ชื่อโฟลเดอร์: skill-impact-analysis

เรียกใช้:

@skill-impact-analysis

วิธีสั่งงานร่วมกับ Antigravity IDE เพื่อไม่ให้เกิดการแก้ไฟล์เดียวทิ้งไว้
เมื่อต้องการเปลี่ยนค่าหรือแก้ระบบที่มีความเชื่อมโยง ให้พิมพ์สั่งโดยเรียกใช้ @skill-impact-analysis นำหน้าเสมอ เช่น:

@skill-impact-analysis ฉันต้องการเปลี่ยน Game ID จาก 1 เป็น 2 ช่วยสแกนหาไฟล์ที่เกี่ยวข้องทั้งหมดทั้งในฝั่ง bot, config, database และหน้าแสดงผลของ bear-cafe-web พร้อมทำ Checklist ให้ดูก่อนแก้

AI จะหยุดการแก้แบบโดดเดี่ยว และกวาดค้นหาไฟล์ทั่วทั้ง Workspace เพื่อนำเสนอ Cross-System Impact Report ให้เห็นภาพรวมทั้งหมดก่อนเริ่มแก้ไขไฟล์พร้อมกันทุกจุด