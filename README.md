# Environmental Intelligence & Action Management — Operational MVP

เว็บภาษาไทยสำหรับบันทึกข้อมูลสิ่งแวดล้อม ตรวจอนุมัติ ดู KPI และติดตามการแก้ไขปัญหาจนตรวจสอบและปิดงาน ใช้ Next.js 16, React, TypeScript และ PostgreSQL SQL migrations

สถานะและข้อจำกัดที่ยังเหลือจากสเปกฉบับเต็มดู [IMPLEMENTATION_STATUS.md](IMPLEMENTATION_STATUS.md) ระบบนี้เป็น Operational MVP สำหรับตรวจรับในเครื่อง ยังไม่ใช่การรับรองความสอดคล้องทางกฎหมายหรือ production deployment

## เตรียม deploy บน Render

ใช้ Node Web Service และ PostgreSQL ใน region เดียวกัน (Singapore) ไม่ใช้ Static Site หรือฐานข้อมูล PGlite บน filesystem ของ Render

- Build Command: `npm ci --include=dev && npm run build` (ต้องมี `tsx` สำหรับ startup/worker)
- Start Command: `npm run start:hosted`
- Health Check: `/api/health`
- Environment: `NODE_VERSION=24`, `LOCAL_DEVELOPMENT=false`, `DB_DRIVER=postgres`, `DATABASE_URL` เป็น Internal Database URL, `AUTH_MODE=google`, `INLINE_WORKER=false`, `EVIDENCE_PROVIDER=remote`
- `APP_URL` ตั้งเป็น HTTPS URL ของเว็บ หรือปล่อยให้ startup ใช้ `RENDER_EXTERNAL_URL` อัตโนมัติ
- Google ต้องตั้ง `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI=https://<hostname>/api/auth/google/callback` และ provision บัญชีที่อนุญาตก่อนใช้ บัญชี Demo ในเครื่องใช้ Google login ไม่ได้
- `SEED_DEMO=true` ใช้ได้เฉพาะฐาน Demo แยกต่างหาก; ค่าเริ่มต้นไม่ seed และ startup จะปฏิเสธหากมี Site จริงอยู่
- Startup จะ serialize migrations/seed ด้วย PostgreSQL advisory lock และ bind `0.0.0.0:$PORT`; การเปลี่ยนฐานข้อมูลไม่ใช่ migration rollback อัตโนมัติ
- ปิด public inbound ของ PostgreSQL ใช้ private network ระหว่างบริการ ไม่เก็บ secrets ใน GitHub

Render Free เหมาะสำหรับทดลอง: เว็บพักหลังไม่มี traffic 15 นาที, PostgreSQL Free หมดอายุหลังสร้าง 30 วันและไม่มี backup; ดู [ข้อจำกัดปัจจุบัน](https://render.com/docs/free) ก่อนใช้ระยะยาว Worker และ private storage gateway สำหรับงานจริงต้องตั้งค่าต่างหาก Local adapters ไม่เปิดใช้บนเว็บออนไลน์

### Demo ออนไลน์สำหรับส่งลิงก์

ตั้ง `AUTH_MODE=hosted-demo`, `SEED_DEMO=true`, `DEMO_ACCESS_CODE` เป็นรหัสสุ่มอย่างน้อย 16 ตัวอักษร ร่วมกับค่า hosted ด้านบน รหัสเก็บใน Environment ของ Render เท่านั้น ไม่ใส่ GitHub หรือ `NEXT_PUBLIC_*` ผู้เข้าชมใช้บัญชี `นาย I • ผู้เข้าชม Demo` ซึ่ง backend จำกัดให้อ่านและ export เฉพาะ `site-a` ที่เป็น Demo ไม่มีสิทธิ์แก้ไข นำเข้า อนุมัติ หรือปิดงาน แม้เพิ่ม grants ให้บัญชีนี้ก็ตาม

Session มีอายุ 8 ชั่วโมง ใช้ Secure/HttpOnly/SameSite cookie; เมื่อเปลี่ยนรหัสเข้าชมและ redeploy session เดิมจะไม่ผ่านการตรวจอีก Login ถูกจำกัดคำขอต่อ process โหมดนี้ใช้ฐานข้อมูล Demo แยกเท่านั้นและ startup ปฏิเสธฐานที่มี Site จริง เก็บประวัติ login/download ได้ แต่คำสั่งเปลี่ยนข้อมูลธุรกิจทั้งหมดถูกปฏิเสธ หน้าประชุมและ export ใช้ข้อมูลอนุมัติแล้วเหมือนระบบในเครื่อง

Google, local login และ worker ไม่เปิดใช้ใน Demo ออนไลน์ เมื่อต้องการใช้งานจริงให้ตั้ง deployment และฐานข้อมูลแยก พร้อม Google allowlist, storage gateway, worker และ backup ตามหัวข้อ production

## เริ่มใช้งานในเครื่อง

ต้องมี Node.js 22 ขึ้นไป และ npm (เครื่องที่ตรวจใช้ Node 24) เปิด PowerShell ในโฟลเดอร์โปรเจกต์:

```powershell
npm ci
Copy-Item .env.example .env
npm run db:setup
npm run dev
```

เปิด <http://localhost:3000> หรือ <http://127.0.0.1:3000> แล้วเลือกบัญชี Demo หน้าเข้าสู่ระบบ ข้อมูลถูกบันทึกจริงในฐานข้อมูล PostgreSQL ผ่าน PGlite ที่ `.local/database` และหลักฐานอยู่ที่ `.local/evidence` ไม่มี mock array ที่ใช้แทนการบันทึกธุรกิจ

PGlite เป็น development adapter ใน process เดียว ใช้เฉพาะเครื่องพัฒนา ห้ามเปิดสอง server หรือรัน migration/seed พร้อม server ที่ใช้โฟลเดอร์ฐานข้อมูลเดียวกัน ให้หยุด server ก่อนรันคำสั่งฐานข้อมูล สำรองทั้งฐานข้อมูลและหลักฐานขณะ server หยุด หรือใช้ PostgreSQL server สำหรับงานหลาย process

`db:setup` รัน migration แล้ว seed ซ้ำได้โดยไม่เพิ่มข้อมูลตั้งต้นซ้ำ ข้อมูล Demo ถูกทำเครื่องหมายที่ Site/record และ UI; seed ไม่ล้างข้อมูลเดิม มีข้อมูลย้อนหลัง 7 วันและชุดประชุม **1–30 กันยายน 2569 (2026)** ใน Site A หากมีข้อมูลที่อนุมัติแล้ว seed จะรักษารุ่นเดิมไว้ หากต้องการฐานทดสอบใหม่ ให้เปลี่ยน `PGLITE_DIR` และ `EVIDENCE_DIR` เป็นโฟลเดอร์ใหม่

## ใช้ PostgreSQL server

มี `compose.yaml` สำหรับ PostgreSQL 17 (รหัสผ่านในไฟล์เป็นค่า development):

```powershell
docker compose up -d
```

ตั้งค่า `.env` แล้วรัน `npm run db:setup` ก่อนเริ่มเว็บ:

```dotenv
DB_DRIVER=postgres
DATABASE_URL=postgresql://environment:environment@localhost:5432/environment
LOCAL_DEVELOPMENT=true
AUTH_MODE=local
EVIDENCE_PROVIDER=local
```

Migration อยู่ใน `migrations/` บันทึกเวอร์ชันใน `schema_migrations` แยกคำสั่งได้ด้วย `npm run db:migrate` และ `npm run db:seed` ทดสอบ SQL ชุดเดียวกันบน PostgreSQL จริงแล้ว ไม่ต้องติดตั้ง PostgreSQL เพื่อทดลองโหมด PGlite

## บัญชี Demo

Local login ไม่มีรหัสผ่าน และเปิดได้ต่อเมื่อ `LOCAL_DEVELOPMENT=true`, `AUTH_MODE=local`, APP_URL และ Host เป็น loopback เท่านั้น ห้ามนำโหมดนี้ขึ้น public URL

| ID / อีเมล                       | บทบาท       | ใช้ตรวจรับ                                           |
| -------------------------------- | ----------- | ---------------------------------------------------- |
| `eo` / `eo@demo.local`           | EO          | บันทึก นำเข้า ส่งตรวจ สร้าง Issue                    |
| `es1` / `es1@demo.local`         | ES          | ตรวจข้อมูล อนุมัติ Master มอบหมายงาน                 |
| `es2` / `es2@demo.local`         | ES          | ผู้ตรวจอิสระ ตรวจหลักฐานและปิดงาน                    |
| `owner` / `owner@demo.local`     | DO          | รับงาน วิเคราะห์ ทำ Action และส่งตรวจผลงาน           |
| `manager` / `manager@demo.local` | MG          | อ่านภาพรวมและส่งออกรายงาน                            |
| `admin` / `admin@demo.local`     | SA          | ตั้งค่า Master และผู้ใช้ ไม่มีสิทธิ์อ่านข้อมูลธุรกิจ |
| `auditor` / `auditor@demo.local` | AV          | อ่านข้อมูลและ Audit ไม่ส่งออก                        |
| `eo-b` / `eo-b@demo.local`       | EO — Site B | ทดสอบการป้องกันอ่าน/แก้ไขข้อมูลข้าม Site             |

บัญชีอื่นอยู่ Site A ส่วน Site B ใช้เป็น fixture ทดสอบ scope ต้องเพิ่ม ES และอนุมัติ workflow ที่มีผู้ตรวจของ Site B ก่อนใช้ flow อนุมัติของ Site B จริง

ชื่อแสดง Demo ใช้ **นาย A–H** ตามลำดับบัญชีในตาราง (A=`eo`, B=`es1`, C=`es2`, D=`owner`, E=`manager`, F=`admin`, G=`auditor`, H=`eo-b`) Migration 006 เปลี่ยนชื่อในฐาน Demo เดิมด้วย โดย ID/อีเมล/สิทธิ์และประวัติเดิมยังอ้างอิงได้

## Dashboard และการนำเสนอรายเดือน

- Overview มีแนวโน้มบนการ์ด KPI, กราฟน้ำใช้–น้ำเสียที่บำบัด, กราฟประสิทธิภาพ 4 หมวดต่อปริมาณผลิต และสัดส่วนประเภทขยะ กดจุดเพื่อเปิดข้อมูลต้นทางได้
- `/analysis/monthly` เปิด **ชุดประชุมทุกหมวด** เป็นค่าเริ่มต้น: ภาพรวมเพื่อการตัดสินใจ, ประสิทธิภาพ 4 หมวด, ขยะจำแนกประเภท และกราฟคุณภาพน้ำเสีย 8 ค่า รวม 8 หน้าสำหรับ PDF เลือกเดือนปฏิทินที่ปิดแล้วล่าสุดเมื่อไม่มีตัวกรอง; ปุ่ม **Demo กันยายน 2569** เลือกชุดตัวอย่างเต็มเดือน
- แท็บ **วิเคราะห์คู่ข้อมูล** มี 5 คู่: น้ำใช้–น้ำเสียที่บำบัด และน้ำใช้/น้ำเสียที่บำบัด/พลังงาน/ขยะเกิดขึ้น เทียบกับผลผลิต
- แต่ละชุดมีแนวโน้มคู่, scatter, จำนวนวันที่ครบ/ตัดออก, Pearson r และอัตราส่วน **ผลรวม Y ÷ ผลรวม X ของวันที่ครบคู่** ใช้ข้อมูล APPROVED และ expected slots ของทั้งสองชุดครบเท่านั้น ไม่มีตารางคาดหวังจะไม่ถือว่าครบ ข้อมูลบางส่วนยังดูได้ในตารางประกอบ แต่ไม่เข้าสถิติ/กราฟคู่
- กราฟต่างหน่วยแยกแกนซ้าย/ขวา ความสูงเส้นไม่ใช้เปรียบเทียบโดยตรง; r ต้องมีอย่างน้อย 3 คู่และค่าไม่คงที่ ค่าสหสัมพันธ์ไม่พิสูจน์สาเหตุ น้ำเสียที่บำบัดไม่เท่ากับปริมาณปล่อยให้นิคมฯ โดยอัตโนมัติ
- กราฟประสิทธิภาพแสดงปริมาณคู่กับผลผลิต และอัตรารายวัน m³/t, kWh/t, kg/t พร้อมเป้าหมายภายในที่ผ่านอนุมัติและมีผลตามวันนั้น อัตรารวมใช้ Σทรัพยากร ÷ Σผลผลิต ไม่เฉลี่ยอัตรารายวัน วันผลิตศูนย์เว้นอัตรารายวัน แต่ภาระทรัพยากรของวันครบคู่ยังอยู่ในอัตรารวมและแสดงแยกให้ตรวจสอบ
- ตาราง 3 วันที่อัตราสูงสุดช่วยเลือกประเด็นตรวจสอบ; EO/ES เปิด Issue จากวันนั้นโดยแนบข้อมูลทรัพยากรต้นทางและ IDs ประกอบได้ ทีมยังต้องตรวจสาเหตุและมอบหมายผู้รับผิดชอบตาม workflow เดิม ข้อมูลขาด/บางส่วนไม่ทำให้เกิดศูนย์หรือข้อสรุปว่ามีประสิทธิภาพดี
- ตั้งเป้าหมายจริงผ่าน Master **เป้าหมายประสิทธิภาพต่อผลผลิต**: หมวด หน่วยทรัพยากร หน่วยผลิต ค่าสูงสุด เอกสารอ้างอิงและวันเริ่มใช้ → คนอื่นอนุมัติ ไม่รับเป้าหมายทับซ้อนสำหรับหมวด/ฐานหน่วยเดียวกัน เป้าหมาย Demo เป็นค่าฝึกใช้งาน ไม่ใช่ benchmark ของโรงงานหรือกฎหมาย
- EO/ES/MG พิมพ์หรือบันทึก PDF แนวนอนจากเบราว์เซอร์ และดาวน์โหลดกราฟ SVG พร้อม Site/ช่วงเวลา/ป้าย Demo/หน่วย/ข้อจำกัดได้ หน้าเตรียมประชุมเป็น live analysis; หากต้องการเก็บฉบับที่ตรวจอนุมัติแล้วให้สร้าง Snapshot ในเมนูรายงาน

### ขยะจำแนกประเภท

มีกราฟสัดส่วนและแนวโน้มรายวัน **Recycle (ไม่อันตราย), ขยะอันตราย, ขยะทั่วไป, ยังไม่ระบุประเภท** แสดงเฉพาะ GENERATED ไม่รวมธุรกรรมจัดการ/ขนย้ายเข้ากับยอดเกิดขึ้น เลือกประเภทในแบบบันทึกหรือกำหนดประเภทประจำจุดวัดได้ โดยเก็บรุ่น Master ไว้ใน snapshot

หากใช้จุดยอดรวมกับจุดย่อย BREAKDOWN ระบบใช้ยอดรวมเป็นหลักและแยกประเภทจากยอดย่อยที่อนุมัติแล้ว โดยไม่บวกซ้ำ ส่วนต่างแสดงยังไม่ระบุ ถ้ายอดย่อยมากกว่ายอดรวมจะแจ้งให้กระทบยอดและไม่แสดงสัดส่วนที่ขัดกัน คำว่า Recycle เป็นประเภทขยะเกิดขึ้น **ไม่ใช่อัตราส่งรีไซเคิลสำเร็จ** ชุด Demo จำลองสัดส่วนแยกประเภทและระบุไว้ในหมายเหตุ

ชุดกันยายนมีวันที่ผลิตศูนย์ 13 ก.ย., ภาระการล้างระบบ 18 ก.ย., พลังงานสูง 17–19 ก.ย. และขยะสูง 22 ก.ย. เพื่อทดลองการตัดสินใจ ข้อมูลที่มีอยู่เดิมไม่ถูกแก้ย้อนหลัง จึงไม่ควรอ่านเหตุการณ์สมมติเหล่านี้เป็นข้อเท็จจริงของโรงงาน

### คุณภาพน้ำเสียก่อนส่งให้นิคมฯ

`/monitoring/wastewater` มีกราฟ pH, BOD₅, COD, TSS, TDS, น้ำมันและไขมัน, TKN และอุณหภูมิ แยกจุดวัดและ Sample ID ผลแบบ `<`/`>` เก็บค่าดิบและเว้นจุดกราฟ ไม่ใช้ค่าขอบเขตแทนผลจริง ไม่เฉลี่ย pH หรือรวมผลต่างตัวอย่างเป็นปริมาณ

เส้นสีส้มเป็น **เกณฑ์อ้างอิงทั่วไปที่รอยืนยัน** จาก [ประกาศ กนอ. 76/2560 เรื่องรับน้ำเสียเข้าระบบบำบัดส่วนกลาง](https://www.ieat.go.th/web-upload/1xff0d34e409a13ef56eea54c52a291126/m_document/8213/14655/file_download/11440161adc9f368d838422d49b7de74.pdf) ตรวจเอกสารเมื่อ 2026-10-04 (pH 5.5–9, BOD₅ 500, COD 750, TSS 200, TDS 3,000, oil/grease 10, TKN 100 mg/L และอุณหภูมิ 45°C) **ไม่ใช่การยืนยันว่าเกณฑ์นี้ใช้กับโรงงานหรือนิคมฯ นี้ และไม่ใช่การตรวจข้อกฎหมายครบทุกพารามิเตอร์** ไม่ใช้มาตรฐานระบายสู่สิ่งแวดล้อมแทนเกณฑ์รับเข้าระบบ

Seed เพิ่มจุด `LAB-IEAT` ที่มี `discharge_context=IEAT_CENTRAL` และผลตรวจ **Demo** ครบ 30 วัน × 8 พารามิเตอร์ของกันยายน พร้อมชุด 7 วันเดิมในฐานจริง การ์ดทั้ง 8 แสดงแนวโน้มพร้อมกราฟใหญ่รายพารามิเตอร์ ชุดประชุมจัดกราฟ 4 ค่าต่อหน้า แยกจุดวัดและระบุผลนอกช่วงอ้างอิง โดยไม่หารความเข้มข้นหรือ pH ด้วยปริมาณผลิต เกณฑ์ `IEAT76_*` อยู่ DRAFT ไม่มี alert/ผลผ่านกฎหมายจากเส้นอ้างอิง ต้องยืนยันชื่อนิคมฯ ข้อตกลงรับน้ำเสีย ฉบับประกาศ หน่วยและขอบเขต แล้วแก้ Master ให้ผู้ตรวจอิสระอนุมัติพร้อมยืนยันกฎหมายก่อนเปิดใช้ เกณฑ์ที่ใช้ประเมินแต่ละผลและรุ่นดูในตารางข้อมูลต้นทางของกราฟ

## ลอง flow หลัก

### บันทึก → ส่งตรวจ → อนุมัติ → KPI

1. เข้าบัญชี `eo` เปิดข้อมูลสิ่งแวดล้อม เพิ่มข้อมูล เลือกวันที่ จุดวัด พารามิเตอร์ หน่วย และค่า บันทึกเป็นร่าง
2. เปิดรายการแล้วส่งตรวจ การเว้นว่างไม่ใช่ศูนย์ ต้องมีค่าที่ถูกต้องก่อนส่ง
3. ออกจากระบบ เข้าบัญชี `es1` เปิดรายการและอนุมัติ (เจ้าของรายการหรือผู้ส่งตรวจอนุมัติตนเองไม่ได้)
4. เปิด Overview/Monitoring เลือกช่วงวันที่ให้ครอบคลุมรายการ ค่า KPI มาจากข้อมูล APPROVED เท่านั้น กดข้อมูลต้นทางเพื่อดูรายการ สูตร และประวัติ
5. หากแก้ข้อมูลที่อนุมัติแล้ว ให้สร้าง revision ระบุเหตุผล ระหว่างรอตรวจ KPI ยังใช้รุ่นเดิม เมื่ออนุมัติรุ่นใหม่จึงแทนรุ่นเดิม รายงาน snapshot เดิมไม่เปลี่ยนย้อนหลัง

ตัวอย่างข้อมูลน้ำใช้ Site A เลือก `W-MAIN`, `WATER_USE`, `CONSUMED`, `m3` ค่า 200 จะเกินเกณฑ์ **Demo** 180 m³ ที่ใช้สาธิตเท่านั้น ไม่ใช่เกณฑ์กฎหมาย

### Alert → Issue → Assign → Action → Verify → Close

1. ข้อมูลที่อนุมัติและเกินกฎที่เปิดใช้ทำให้เกิด Alert เปิดหน้าแจ้งเตือน สร้าง Issue (มี Alert และ Issue ตัวอย่างใน seed)
2. `es1` มอบหมาย `owner` เป็นผู้รับผิดชอบ และ `es2` เป็นผู้ตรวจอิสระ กำหนดวันเสร็จ
3. `owner` เริ่มตรวจสอบ บันทึกสาเหตุ/แผน ทำ Action ทุกข้อให้เสร็จพร้อมผลการทำงาน แนบ PDF/PNG/JPG ในแท็บหลักฐาน แล้วส่งตรวจผลงาน
4. `es2` เปิดหลักฐาน ตรวจ checklist ให้ครบ บันทึกผลตรวจผ่าน จากนั้นปิดงานพร้อมสรุป หากไม่ผ่านให้ส่งกลับแก้ไข
5. การเปลี่ยน Action/หลักฐานหลังตรวจผ่านทำให้ต้องตรวจใหม่ เปิดงานที่ปิดแล้วใหม่ได้โดยระบุเหตุผล ประวัติรอบเดิมยังอยู่

ผู้สร้าง Issue ผู้รับผิดชอบ และผู้ทำ Action ไม่สามารถตรวจผ่าน/ปิดงานของตนเองได้ Workflow ที่กำหนด retest ต้องมีผล LAB ที่อนุมัติและผ่านเกณฑ์เชื่อมกับ Issue ก่อนส่งตรวจ

### Master / Import / Report

- Master เป็นรุ่นมีวันเริ่มใช้: ร่าง → ส่งตรวจ → ES คนอื่นอนุมัติ หน่วยผลิต เกณฑ์ ตารางคาดหวัง ปฏิทิน จุดวัด checklist และผู้ตรวจแก้ไขได้ เกณฑ์กฎหมายยังเป็นร่างจนยืนยันอย่างชัดเจน
- Import CSV UTF-8 (20 MB) หรือ XLSX (10 MB, หลังขยายไม่เกิน 100 MB): เลือก sheet/map columns รูปแบบวัน ISO/DMY/MDY และ CE/BE → งาน preview → ตรวจ error → ยืนยัน → งานนำเข้าร่าง รองรับไม่เกิน 50,000 แถว/50 คอลัมน์ สูตร Excel ไม่รับเป็นข้อมูล ไม่มี overwrite รายการซ้ำ และ partial import ต้องยืนยัน แสดง preview 200 แถวพร้อมดาวน์โหลด error CSV ผลนำเข้ายังต้องส่งตรวจ
- งาน import เก็บคิว/cursor ในฐานข้อมูล ประมวลผล preview ครั้งละ 100 แถว และบันทึกครั้งละ 50 แถว ความคืบหน้า commit พร้อมข้อมูล เมื่อ worker หยุดจะทำต่อได้ ตรวจสิทธิ์ผู้สร้างใหม่ทุกชุด หาก permission ถูกถอนจะหยุดเป็น FAILED ปุ่ม retry ใช้หลังแก้สาเหตุ ข้อมูลชุดที่บันทึกสำเร็จก่อนเกิด error ยังคงเป็น DRAFT ไม่ถูกย้อนลบ
- Reports สร้าง snapshot ตาม Site/ช่วงวัน → ส่งตรวจ → คนอื่นอนุมัติ → เผยแพร่ → ส่งออก CSV/XLSX/PDF การแก้ข้อมูลภายหลังไม่แก้ snapshot เก่า PDF ใช้ Noto Sans Thai (OFL) แบบ offline และลิงก์ข้อมูลต้นทางที่ยังตรวจสิทธิ์
- Alerts ข้อมูลขาดตรวจช่วง 7 วันที่ผ่านมาและวันนี้ตามเวลาครบกำหนด Site และตรวจงานเกินกำหนด มีปุ่มสแกนและ scheduler ทุกนาทีที่ทำงานแม้ปิดเบราว์เซอร์ แต่ server/worker ต้องยังรันอยู่

รายการข้อมูลสิ่งแวดล้อม/การผลิต/คิวตรวจใช้ search และ pagination ฝั่งฐานข้อมูล หน้าภาพรวมโหลดข้อมูลประกอบล่าสุด 500 รายการ แต่ KPI คำนวณจากข้อมูลทั้งหมดในช่วงวัน และ source link สามารถโหลด revision เก่าได้โดยตรง

### Worker และ scheduler

Local PGlite ใช้ `INLINE_WORKER=true` ใน Next.js process เดียวกับฐานข้อมูล และ `WORKER_USER_ID=es2` สำหรับ Demo ไม่เปิด worker แยกด้วย PGlite เมื่อใช้ PostgreSQL production ให้ตั้ง `INLINE_WORKER=false` แล้วเปิด worker แยก:

```powershell
npm run worker
```

ตั้ง `WORKER_USER_ID` เป็นบัญชี ES ที่องค์กร provision และให้ grant เฉพาะ Site ที่อนุญาต ถ้าไม่ตั้งค่า worker จะประมวลผล import เท่านั้น scheduler ตรวจสิทธิ์ปัจจุบันทุกครั้ง และบันทึกเวลาสแกนต่อ Site ป้องกันงานซ้ำ ให้จัดการ process ด้วย service supervisor และตั้ง restart policy ทั้งเว็บและ worker สำหรับ production แบบ serverless ต้องใช้ worker ที่รันต่อเนื่องนอก request lifecycle

## การตรวจสอบ

```powershell
npm run typecheck
npm test
npm run test:postgres
npm run test:e2e
npm run build
npm start
```

`test:postgres` เปิด PostgreSQL จริงที่พอร์ต 55433 ชั่วคราว ใช้ฐานทดสอบใหม่ใน `.local/postgres-check-*` แล้วหยุด server ต้องไม่มีบริการอื่นใช้พอร์ตนี้ Binary มาจาก devDependency `embedded-postgres` ไม่แตะฐานธุรกิจ

`test:e2e` ใช้ Microsoft Edge และสร้างฐาน PGlite ใหม่ใน `.local/e2e-*` เปิด server ที่พอร์ต 3100 ใช้ build directory `.next-e2e` แยกจากแอปหลัก และหยุด server หลังเสร็จ บนระบบที่ไม่มี Edge ให้ติดตั้ง Playwright Chromium (`npx playwright install chromium`) แล้วตั้ง `$env:PLAYWRIGHT_CHANNEL='chromium'` ภาพตรวจอยู่ `test-results/` ไม่แก้ฐาน Demo หลัก อย่ารัน E2E พร้อมแก้ source/migration

## เชื่อม Google และ storage จริง

ตั้ง `LOCAL_DEVELOPMENT=false`, `DB_DRIVER=postgres`, `AUTH_MODE=google`, `APP_URL=https://...` และใช้ HTTPS ตั้ง `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` ให้ตรง redirect URI ที่ลงทะเบียน (`https://.../api/auth/google/callback`) OAuth ตรวจ state, PKCE, nonce, issuer, audience และ verified email ผู้ใช้ต้องถูกสร้างไว้ล่วงหน้าและมีสิทธิ์ Site จึงเข้าได้ ไม่มี auto-grant จากอีเมล

ฐาน production ใหม่ให้รัน **migration อย่างเดียว** แล้วให้ผู้ดูแลฐาน provision organization/site และ SA พร้อม grants ขององค์กรจริง ห้ามใช้ seed Demo เป็นข้อมูล production จากนั้น SA สร้างผู้ใช้ EO/ES อย่างน้อยสองคนและตั้งค่า Master ให้ ES อิสระอนุมัติ ค่าเริ่มต้นตัวอย่างต้องผ่านการตรวจขององค์กรก่อนใช้ SA เพิ่มและแก้ไข Site ภายในองค์กรผ่าน `/admin/sites` ได้ และเพิ่มบัญชีในองค์กรเดิมให้ Site ใหม่ผ่านหน้าผู้ใช้ บัญชี Demo สร้าง Site ที่ติดป้าย Demo เสมอ

สำหรับองค์กรใหม่ ใช้ CLI ของผู้ดูแลฐาน (transaction atomic; ไม่แก้ผู้ใช้เดิม):

```powershell
Copy-Item provision.example.json .local/provision.json
# แก้ข้อมูลองค์กร Site และ adminEmail ในไฟล์ให้เป็นของจริงก่อนรัน
npm run provision -- .local/provision.json
```

การสร้างองค์กรใหม่ต้องใช้สิทธิ์ดูแลฐานข้อมูลผ่าน CLI ไม่เปิด self-registration หรือสร้าง tenant ข้ามองค์กรจากหน้าเว็บ ไม่มีการแปลง Demo เป็นข้อมูลจริงอัตโนมัติ

ตัวอย่าง provision ขั้นต้น (เปลี่ยนค่าตัวอย่างเป็นข้อมูลจริงก่อนใช้):

```sql
BEGIN;
INSERT INTO organizations(id,name) VALUES ('your-org','ชื่อองค์กร');
INSERT INTO sites(id,organization_id,code,name,timezone,demo)
VALUES ('your-site','your-org','SITE01','ชื่อโรงงาน','Asia/Bangkok',false);
INSERT INTO users(id,organization_id,email,name,demo)
VALUES ('your-admin','your-org','admin@your-domain.example','ผู้ดูแลระบบ',false);
INSERT INTO grants(user_id,site_id,role) VALUES ('your-admin','your-site','SA');
COMMIT;
```

ตั้ง `EVIDENCE_PROVIDER=gateway`, `STORAGE_GATEWAY_URL`, `STORAGE_GATEWAY_TOKEN` ให้ชี้บริการจัดเก็บ private ที่องค์กรเตรียมไว้ สัญญา adapter:

- `PUT {gateway}/objects/{uuid}`: raw bytes, `Authorization: Bearer ...`, Content-Type และ `X-Content-SHA256` (SHA256 ของ bytes) ต้องตรวจมัลแวร์และตอบ JSON `{"scan_status":"CLEAN"}` เมื่อผ่านจริงเท่านั้น
- `GET {gateway}/objects/{uuid}`: Authorization แบบเดียวกัน คืน bytes ต้นฉบับ ห้ามแก้เนื้อหาภายใต้ key เดิม ระบบตรวจ checksum ทุกครั้งที่อ่าน/ตรวจรับ
- ผู้ใช้ดาวน์โหลดผ่าน API ที่ตรวจสิทธิ์ Site ห้ามเปิด bucket/object URL เป็น public จัด backup/retention และ lifecycle ของ orphan object ฝั่ง gateway

Local adapter ตรวจชนิดไฟล์/ขนาด/active PDF แต่ **ไม่ได้สแกนมัลแวร์** จึงติดสถานะ `DEV_VALIDATED` และปิดใช้เมื่อไม่ใช่ local development ส่วน Google/storage gateway มี integration code แต่ยังไม่ได้ตรวจ end-to-end กับ credentials/บริการจริง

## โครงสร้างและการดูแล

- `src/lib/`: domain rules, สิทธิ์ Site, analytics, import, storage, auth; `service.ts` เป็น transactional command boundary
- `src/components/`: UI ภาษาไทย; `src/app/api/[...path]/route.ts`: authenticated HTTP endpoints
- `migrations/`: schema และ trigger ป้องกันแก้ facts/snapshot/audit ย้อนหลัง; `tests/`: domain, workbook และ browser acceptance
- `.env.example`: ค่า configuration; ห้าม commit `.env`, `.local`, token หรือหลักฐานจริง

ก่อน deploy ต้องตั้ง PostgreSQL/backups/restore drill, HTTPS/secrets, Google OAuth, storage+malware scanner, scheduler ที่ได้รับสิทธิ์และการเฝ้าระวังบริการ ตรวจผู้ใช้/ขอบเขต Site, เกณฑ์ที่ยืนยันแล้ว, retention และทดสอบ production integration เพิ่ม รายละเอียดขอบเขตที่ยังไม่ครบอยู่ใน IMPLEMENTATION_STATUS.md
