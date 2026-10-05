# Implementation status — 2026-10-05

## Demo Login และหน้าแนะนำ AI — 2026-10-05

- หน้า Login ของ hosted Demo แสดง `DEMO_ACCESS_CODE` จาก Environment ปัจจุบันในกรอบสีเหลืองใต้คำอธิบาย พร้อมปุ่มคัดลอก รหัสยังไม่ถูกเก็บใน Git แต่ตั้งใจแสดงต่อผู้เข้าชม จึงไม่ใช่ความลับหรือการจำกัดการเข้าถึงอีกต่อไป
- เพิ่มเมนูและหน้า `AI ช่วยวิเคราะห์ · เร็ว ๆ นี้` สำหรับผู้มีสิทธิ์อ่าน เพื่อแสดงแนวทางการตรวจแนวโน้ม เตรียมประเด็นประชุม และติดตามงาน หน้าแจ้งชัดว่ายังไม่เปิดใช้งาน ไม่มีการเชื่อมต่อหรือส่งข้อมูลไปยัง AI
- Hosted Demo ยังจำกัด Site A และสิทธิ์ read/export ที่ backend ตามเดิม; analytics ที่เปิดใช้ยังคำนวณจากข้อมูลอนุมัติ ไม่ใช้ผล AI
- ตรวจ `npm run check` ผ่าน: typecheck, 38/38 domain tests และ production build; browser test ของหน้า AI และ responsive navigation ผ่านบน Edge

## เตรียม Render — 2026-10-04

- เชื่อมบัญชี Render และพบ GitHub repository `natee-s/environmental-intelligence`
- สร้าง PostgreSQL Free `envira-demo-db` ใน Singapore (PostgreSQL 18), Available; วันหมดอายุที่ Dashboard ระบุ **2026-11-03**
- ปิด public inbound ของฐานข้อมูลแล้ว รับการเชื่อมต่อผ่าน private network เท่านั้น ไม่ export credentials ลงไฟล์
- เพิ่ม `npm run start:hosted`: ใช้ PostgreSQL, ปฏิเสธ local adapter, migrations/optional Demo seed ก่อนเปิด Next.js ที่ `0.0.0.0:$PORT`; ใช้ HTTPS URL ที่ Render กำหนดเมื่อไม่มี APP_URL
- ผู้ใช้เลือก Demo อ่านอย่างเดียวพร้อมรหัสเข้าชมแล้ว: เพิ่ม `hosted-demo` login, บัญชีผู้เข้าชมแยก, จำกัด Site/role ที่ backend, ปฏิเสธ commands และ revoke session เมื่อหมุนรหัส
- เพิ่ม migration `007_hosted_demo_sessions.sql` สำหรับผูก session กับ hash ของรหัสเข้าชม ไม่มี plaintext secret ในฐานข้อมูล/GitHub
- Web Service Free `environmental-intelligence` จาก `main` ใน Singapore: **Live** (commit `bd35a93`, 2026-10-04)
- URL: https://environmental-intelligence-onne.onrender.com — ใช้รหัสเข้าชมใน Environment ของ Render; สำเนา local อยู่ `.local/render-demo-access.txt` (gitignored) ไม่ใส่รหัสในเอกสารสาธารณะ
- Render startup ผ่าน migrations/seed และ health check ด้วย PostgreSQL 18, bind `0.0.0.0:10000`; local adapters/worker ไม่เปิดใช้
- Hosted smoke ผ่านเมื่อ 2026-10-04T16:02:50Z: HTTPS/PG health, unauthenticated 401, รหัสผิด 401, Origin ผิด 403, local/Google login ปิด, Secure cookie, permissions read/export, Site Demo เดียว, KPI 30 วัน, พารามิเตอร์น้ำเสีย 8 รายการ, mutation/cross-Site 403, Source link, CSV กันยายน และ logout revocation
- ตรวจหน้าจอออนไลน์ login → Overview → Wastewater/Monthly analysis; ภาพและผลตรวจอยู่ `.local/render-overview.jpg` / `.local/render-smoke.json` (gitignored)
- ตรวจหลังเพิ่ม startup: `npm run typecheck`, `npm run build` ผ่าน และ `npm test` ผ่าน 35/35
- ตรวจหลังเพิ่ม hosted Demo login: typecheck/build ผ่าน และ tests ผ่าน **38/38** รวมรหัสผิด, Site/role isolation, mutation denied, rotation/revocation
- PostgreSQL regression ผ่าน **27/27** หลังเพิ่ม migration 007; Render build ผ่านด้วย Node 24.21.0
- ข้อจำกัด hosting: ฐาน Free หมดอายุ 2026-11-03, เว็บพักเมื่อไม่ใช้งาน; Demo ไม่ใช้ private storage/worker/Google จริง ไม่ถือเป็น production UAT
- Auto-deploy จาก `main`; Build Filters ไม่ trigger เมื่อเปลี่ยนเฉพาะ README.md, IMPLEMENTATION_STATUS.md หรือ scripts/hosted-smoke.ts

## ผลส่งมอบในเครื่อง

Operational MVP มีข้อมูลจริงในฐานข้อมูลและ flow หลักครบ ใช้ Next.js 16.3.8 / TypeScript / PostgreSQL โดย local default ใช้ PGlite adapter ที่ persist ลง disk ส่วน driver `pg` ผ่านชุดทดสอบบน PostgreSQL จริงแล้ว **ยังไม่ใช่การตรวจรับ P1 ทุก requirement ของสเปกหรืออนุมัติขึ้น production** รายการที่ยังต้องทำ/ตั้งค่าระบุด้านล่าง

โปรเจกต์เริ่มจาก PROJECT_SPEC.md จึงสร้าง monolith ที่แยก domain ใน `src/lib/` และ UI ใน `src/components/` อ่าน AGENTS.md และเอกสาร Next ที่ติดตั้งก่อนเปลี่ยน source ไม่มีการใช้ service credentials จริงหรือส่งข้อความออกภายนอก

## สิ่งที่ทำแล้วตามลำดับ dependency

| ลำดับ | ส่วนงาน                    | ผลที่มีอยู่                                                                                                                                                                                                                                                                |
| ----- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1     | โครงสร้าง/ฐานข้อมูล/สิทธิ์ | SQL migrations 001–006, seed, PostgreSQL/PGlite drivers, DB session, Google OIDC integration, role + Site authorization ใน backend ทุก endpoint/command, SA ไม่มี business read โดยอัตโนมัติ                                                                               |
| 2     | Master                     | รุ่น/วันมีผล/การตรวจอิสระ, units/production units/products/departments/areas/assets, schedules/calendars/exemptions, workflows/checklists, rules, counter reset, Site administration และ CLI provision องค์กรแรก                                                           |
| 3     | ข้อมูล/ตรวจรับ             | Water/Wastewater/Energy/Waste/Production, CSV/XLSX mapping/preview/errors/partial import, durable background jobs, DRAFT→SUBMITTED→APPROVED, reject/void/revision, optimistic locking ของ facts, immutable approved payload                                                |
| 4     | Dashboard                  | Overview + Monitoring 4 หมวด, approved-only totals, coverage, trends/gaps, intensity, baseline/delta, cumulative baseline/reset, raw/censored LAB, breakdown/reconciliation, formula/source links                                                                          |
| 5     | Action                     | threshold/missing/overdue alerts, episode dedupe + immutable evaluations, issue assignment/investigation/plan/tasks, evidence versions/checksum/access, request verify/reject/verify/close/reopen, independent verifier, verification invalidation และ retest prerequisite |
| 6     | ตรวจรับ/รายงาน             | In-app notifications, immutable report snapshots/review/publish, CSV/XLSX/PDF exports, Audit events, responsive Thai UI, browser/domain/PostgreSQL acceptance tests, README                                                                                                |

## หลักฐานการทดสอบ

| คำสั่ง/การตรวจ          | ผลล่าสุด                                                                                                                                                                                                                                                        |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run typecheck`     | ผ่าน                                                                                                                                                                                                                                                            |
| `npm test`              | 35/35 ผ่าน (27 domain + 2 comparison + 1 monthly + 2 waste + 3 workbook)                                                                                                                                                                                        |
| `npm run test:postgres` | 27/27 domain ผ่านบน PostgreSQL จริงที่พอร์ต 55433; server ทดสอบหยุดแล้ว                                                                                                                                                                                         |
| `npm run build`         | ผ่าน Next production build                                                                                                                                                                                                                                      |
| `npm run db:setup`      | ผ่านบนฐาน local หลัก; migrations/seed ซ้ำได้                                                                                                                                                                                                                    |
| `npm run test:e2e`      | 8/8 ผ่านบน Edge (รวมชุดประชุมกันยายน/source-linked Issue/PDF 8 หน้า): desktop/mobile + scope, IEAT graphs + monthly comparison/SVG/PDF, entry→KPI, admin separation, background import + PDF/XLSX, Site create, Alert→Issue→Assign→Action→Evidence→Verify→Close |
| PDF render              | Demo 2 หน้า ภาษาไทย/ตัวเลข/เลขหน้า/source links ตรวจภาพ PNG แล้ว; แก้ glyph และ footer overflow ที่พบ                                                                                                                                                           |
| Dependency audit        | ติดตั้งล่าสุดรายงาน 0 vulnerabilities                                                                                                                                                                                                                           |

ชุด domain ตรวจ self-approval, cross-Site, revoked permissions รวม cached retries/job chunks, duplicate imports/revisions, negative/unit/future values, production zero, cumulative reset, censored lab, master effective dates, legal confirmation, checksum/signature/PDF active content, snapshot immutability, rejection/reverification/reopen และ job resume

Browser fixtures แยกฐาน `.local/e2e-*` และใช้พอร์ต 3100 ไม่แก้ฐาน Demo หลัก Screenshots อยู่ `test-results/` มี Overview desktop, หน้าข้อมูล mobile, Issue mobile พร้อมหลักฐาน และ Issue closed desktop

## UX/UI และ analytics เพิ่มเติม — 2026-10-04

- ปรับ sidebar เขียวเข้ม, พื้นหลังสว่าง, pastel icons, การ์ดมุมโค้ง/เงาเบา, typography Noto Sans Thai แบบ offline, การ์ดแนวโน้ม และวงแสดง coverage โดยอิงภาพตัวอย่าง
- Overview มีกราฟพื้นที่สองเส้น น้ำใช้–น้ำเสียที่บำบัด สเกลร่วม m³, gaps และ source ของแต่ละเส้น การแสดงวันที่อนุมัติแล้วบางส่วนยังมี coverage กำกับ
- น้ำเสียมีกราฟรายตัวอย่าง 8 พารามิเตอร์: pH/BOD₅/COD/TSS/TDS/oil & grease/TKN/temperature แยกเฉพาะจุดที่ snapshot มี `discharge_context=IEAT_CENTRAL` ไม่รวม LAB น้ำทิ้งทั่วไป กราฟไม่แทน censored/missing ด้วยศูนย์
- อ้างอิง [ประกาศ กนอ. 76/2560 สำหรับรับเข้าระบบส่วนกลาง](https://www.ieat.go.th/web-upload/1xff0d34e409a13ef56eea54c52a291126/m_document/8213/14655/file_download/11440161adc9f368d838422d49b7de74.pdf) ตรวจหน้าเอกสารต้นฉบับแล้ว เส้นทั่วไปติด **รอยืนยัน** และ seed rules เป็น DRAFT ผู้ใช้ยังไม่ได้ระบุชื่อนิคมฯ/ข้อตกลงรับน้ำเสีย จึงไม่เปิดกฎหมายหรือรับรองความสอดคล้อง เส้นอ้างอิงทั่วไปแยกจากเกณฑ์จริงที่ใช้ประเมิน ซึ่งดูรุ่นได้จาก source table
- `/analysis/monthly`: 4 คู่ข้อมูลทรัพยากร/ผลผลิต, dual trend, scatter, Pearson r, ratio of sums, จำนวนวันที่ครบ/ตัดออก, source table; หน่วยต่างกันแยกแกน ใช้เฉพาะวันที่ approved และ schedules ครบทั้งคู่ r ต้อง ≥3 คู่และมี variance ไม่สรุปเหตุและผล
- Export สำหรับประชุม: browser print/PDF แนวนอน และ SVG ที่มี Site/period/Demo/units/caveats (สิทธิ์ export เดิม) เป็น **live presentation**; immutable report snapshots/review/publish อยู่เมนูรายงานเดิม ไม่ถือว่า PDF ที่พิมพ์จากหน้า analytics ผ่าน review/publish อัตโนมัติ
- Migration 006 เปลี่ยนชื่อผู้ใช้ Demo เดิมเป็น นาย A–H, seed ใหม่ใช้ชื่อชุดเดียวกัน ไม่เปลี่ยน IDs/สิทธิ์หรือเขียน audit snapshot เก่าย้อนหลัง Seed เพิ่มผลแล็บ Demo 56 ผลในฐานจริง ไม่แก้ข้อมูลอนุมัติเดิม
- เพิ่ม backend validation pH 0–14 และจุด `measurement_type=LAB` รับเฉพาะ LAB; แบบฟอร์มแยกจุดเก็บตัวอย่างกับมิเตอร์ปริมาณ

ทดสอบใหม่ครอบคลุม missing/partial/zero, mixed production units, draft legal rules ไม่สร้าง alert, Demo aliases, LAB scope และความครบถ้วนของคู่ข้อมูล การตรวจ browser รอบแรกพบ horizontal overflow ของ chart grid บนมือถือและ footer ทำให้ PDF มีหน้าท้ายเกิน แก้แล้วตรวจซ้ำผ่าน 7/7 บน Edge และตรวจ PDF ด้วย Poppler: A4 แนวนอน 1 หน้า ภาพตัวอย่างอยู่ `test-results/monthly-analysis.png`, `wastewater-parameters.png`, `monthly-mobile.png`, `wastewater-mobile.png`; ไฟล์ประชุม `test-results/monthly-review.pdf` และ `monthly-comparison.svg`

ตรวจภาพ SVG แล้วพบ nested viewport ทำให้กราฟซ้อน/ตัด ได้กำหนดขนาดแต่ละกราฟชัดเจน เพิ่ม browser assertion และตรวจ flow นำเสนอซ้ำ 1/1 ผ่าน ภาพ SVG หลังแก้ไม่ตัดข้อความหรือกราฟ Production build ล่าสุดผ่านและ restart server แล้วที่ `http://127.0.0.1:3000`; health, นาย E, กราฟ IEAT 8 ค่า และหน้าจอมือถือกว้าง 390/scroll 390/sidebar ปิด ตรวจบน server หลักแล้ว ฐานหลักรัน migrations/seed หลังหยุด server เดิมก่อนเปิด process ใหม่

## ชุดประชุมและข้อมูลกันยายนเต็มเดือน — 2026-10-04

- Seed เพิ่มข้อมูล Demo Site A **1–30 กันยายน 2569** ในฐานจริง: ผลผลิต น้ำใช้ น้ำเสียที่บำบัด พลังงาน ขยะเกิดขึ้น ขยะย่อย 3 ประเภท และ LAB-IEAT 8 ค่า/วัน รวม 30 วัน ไม่แก้รุ่นที่อนุมัติแล้วและรันซ้ำได้
- มีวันผลิตศูนย์และภาระทรัพยากรที่ยังใช้ วันที่ภาระสูง และผลแล็บนอกเส้นอ้างอิงเพื่อฝึกประชุม ไม่สร้างผลตัดสินกฎหมายจากข้อมูลสมมติ เกณฑ์ IEAT ยัง DRAFT
- Overview มี sparklines บน KPI, กราฟประสิทธิภาพ 4 หมวด และสัดส่วนขยะ Monitoring แต่ละหมวดมีกราฟปริมาณ × ผลผลิตและอัตรารายวัน เมนูวิเคราะห์คู่ข้อมูลเพิ่มน้ำเสีย × ผลผลิต รวม 5 คู่
- `INTENSITY_TARGET` เป็น Master เป้าหมายภายใน แยกหมวด/หน่วยผลิต/ช่วงเวลา ต้องมีเอกสารอ้างอิงและคนอื่นอนุมัติ ป้องกันเป้าหมายคนละ code ทับซ้อน ไม่ใช้แทนกฎหมาย Demo targets เป็นค่าฝึกเท่านั้น
- สูตรอัตรารวมใช้ Σทรัพยากร ÷ Σผลผลิตของวันครบคู่ รวมภาระในวันผลิตเป็นศูนย์ แต่กราฟอัตรารายวันเว้นวันผลิตศูนย์ ไม่ใช้ศูนย์แทน missing/partial และไม่หาร pH/ความเข้มข้นด้วยผลผลิต
- ขยะมี donut, แนวโน้มแยก Recycle/อันตราย/ทั่วไป/ไม่ทราบ และ stacked daily bars เก็บ approved waste-type version ใน record snapshot ใช้ GENERATED ยอดหลักเพียงครั้งเดียว BREAKDOWN อธิบายยอดแม่ ไม่บวกซ้ำ หากยอดย่อยเกินยอดแม่แจ้งให้กระทบยอดและไม่ใช้สัดส่วนขัดกัน ข้อมูลประเภทที่เติมใน Demo เป็นสัดส่วนจำลอง ไม่ใช่หลักฐานคัดแยกจริง
- `/analysis/monthly` เปิดชุดประชุมทุกหมวดเป็นค่าเริ่มต้นเมื่อไม่มีช่วงวัน ใช้เดือนปฏิทินที่ปิดแล้วล่าสุดตาม timezone ของ Site ปุ่ม Demo กันยายนเลือกช่วงคงที่ ชุดประชุมมี 8 ส่วน: Executive summary, ประสิทธิภาพ 4 หมวด, ประเภทขยะ, คุณภาพน้ำเสีย 2 หน้า × 4 กราฟ
- สรุปมี coverage, เป้าหมาย, วันที่อัตราสูงสุด 3 วัน, ภาระวันผลิตศูนย์, งานค้างปัจจุบันและงานปิดในช่วงแยกกัน กดต้นทางได้และ EO/ES เปิด Issue จากวันสำคัญโดย prefill source record จริงพร้อม IDs ประกอบ ยังต้องตรวจสาเหตุ/มอบหมาย/ตรวจผลงานตาม workflow เดิม
- หน้า analytics/print เป็น live presentation; immutable report snapshot/review/publish ยังใช้เมนูรายงาน ข้อมูลใหม่ถูกเก็บใน snapshot ด้วย แก้ backend record date filters และการโหลดข้อมูลเก่าที่อยู่นอก bootstrap ล่าสุด 500 รายการ เมื่อส่งตรวจ/อนุมัติหน้ารายละเอียดจะโหลดสถานะใหม่และไม่เพิ่มรายการ/ประวัติซ้ำ

ผลตรวจชุดนี้: typecheck และ production build ผ่าน, `npm test` **35/35**, PostgreSQL จริง **27/27**, migration/seed บนฐานหลักผ่าน และ browser acceptance **8/8** ผ่านบน Edge ครอบคลุม flow เดิมกับชุดประชุม 30 วัน/ทุกกราฟ/มือถือ/PDF/source-linked Issue โดยใช้ฐานแยกจากฐานหลัก

การตรวจ PDF พบล้นหน้าจากระยะห่าง SVG และตาราง ปรับ CSS งานพิมพ์แล้วตรวจด้วย Poppler ได้ **A4 แนวนอน 8 หน้า** และตรวจภาพครบทุกหน้า แก้กราฟกับลิงก์อ้างอิงล้นจอมือถือ 390px ด้วย ข้อมูลที่มีอยู่ก่อน seed ถูกเก็บไว้ จึงอาจต่างจากฐาน E2E ใหม่เล็กน้อย

Build ล่าสุดรันอยู่ที่ `http://127.0.0.1:3000` ตรวจ health, นาย E, 5 คู่ครบ 30 วัน, 8 พารามิเตอร์ × 30 ผล, ขยะแยกประเภทครบ 30 วัน, PDF 8 หน้า และ mobile width/scroll 390/390 บน server หลักแล้ว ไม่มี browser page errors ตัวอย่างจากฐานหลัก: `.local/september-meeting-pack.pdf`, `.local/september-meeting-preview.png`, `.local/september-mobile-preview.png`; ตัวอย่าง E2E อยู่ `test-results/september-*`

งานต่อที่ช่วยการตัดสินใจจริง: เติมประวัติหลายเดือนเพื่อเปรียบเทียบเดือนก่อน/ปีเดิมอย่างมี coverage, product mix/equivalent output, เหตุผล downtime/cleaning ที่มีหลักฐาน, tariff/cost และ pollutant load เฉพาะเมื่อมีปริมาณปล่อยจริงกับผลแล็บที่จับคู่เวลาได้ งานเหล่านี้ยังไม่เดาค่าจาก Demo หรือปริมาณบำบัด รายการ production integration และข้อจำกัดเดิมด้านล่างยังคงอยู่

## วิธีเปิดและบัญชี

ดู [README.md](README.md) และ [.env.example](.env.example)

```powershell
npm ci
Copy-Item .env.example .env
npm run db:setup
npm run dev
# หรือ npm run build แล้ว npm start
```

เปิด `http://127.0.0.1:3000` บัญชี Demo ไม่ใช้ password: `eo`, `es1`, `es2`, `owner`, `manager`, `admin`, `auditor`, `eo-b` บัญชี Site B ใช้ทดสอบ scope; ต้องเพิ่ม ES ของ Site B และ workflow ที่ถูกต้องก่อนใช้อนุมัติจริง

ตรวจ production-mode server บนเครื่องแล้ว: `/api/health` ผ่าน และ login/bootstrap/logout ผ่าน; ฐานหลักมี KPI ครบ 4 หมวดและข้อมูล Demo ที่ persist เปิด inline worker สำหรับ local ไว้ใน `.env`

Local login/PGlite/evidence เปิดได้เฉพาะ development ที่ระบุ flag ชัดเจน ข้อมูลตัวอย่างมี Demo flag ไม่ใช้ข้อมูลขาดเป็นศูนย์ เกณฑ์ active ที่ seed เป็นเกณฑ์ **Demo** 180 m³ เท่านั้น เกณฑ์กฎหมายยังไม่ active

## Assumptions และขอบเขตการคำนวณ

- Daily grain และวันสิ้นสุดตาม timezone ของ Site; ปริมาณทั่วไป interval, cumulative ต้องมี approved baseline วันก่อนหรือ reset ที่ยืนยัน ไม่มีการเดาช่วงที่ขาด
- หน่วยฐานที่รองรับ volume=m3, energy=kWh, power=kW, mass=kg, concentration=mg_L, production mass=t, production count=piece; เพิ่มหน่วยย่อยด้วย factor ที่อนุมัติได้ หน่วยผลิตต่างมิติไม่มี equivalent factor จะไม่รวมเป็น intensity
- Waste generated แยกจาก handled; handled ใช้ RECYCLED/DISPOSED ที่อ้าง shipment/lot และไม่บวก TRANSFERRED เป็น generation ไม่แสดง stock เมื่อยังไม่มี opening stock
- เกณฑ์ version มีผลตาม event/sample date; numeric censored LAB เป็น INDETERMINATE เพื่อไม่ให้เกิด Pass จากค่าขอบเขตที่เดา
- ค่าเฉลี่ยใช้วันที่ expected slots ครบและมี approved values; total ที่ยัง partial มี coverage กำกับ ไม่มี expected schedule จะแสดง UNCONFIGURED
- Workflow กำหนดผู้ตรวจข้อมูลและ checklist ได้ แต่ state machine หลักเป็น Officer→Supervisor→Owner→Independent verifier ไม่เปิด arbitrary transition จาก JSON
- Master ปิดใช้มีผลเมื่อสิ้นวัน Site เพื่อรักษาข้อมูลวันนั้นและประวัติเดิม
- Missing alert scan มองย้อนหลัง 7 วันรวมวันนี้; ไม่มีการแจ้งภายนอก worker ต้องยังรันอยู่ มี browser scan เป็นทางเสริม
- Organization provision ใช้ CLI ของ database owner; SA เพิ่ม Site ภายในองค์กรที่ตนอยู่และได้ SA grant ของ Site ใหม่ ไม่เปิด tenant self-registration

## งาน integration ที่ต้องตั้งค่าของจริง

1. Google Workspace allowlist/users, OAuth client/secret/redirect และ HTTPS; code มี state/PKCE/nonce/verified email แต่ยังไม่ได้ทดสอบกับ credentials จริง
2. PostgreSQL server, secrets, backup/restore, monitoring; production ต้องใช้ `DB_DRIVER=postgres`
3. Private storage gateway และ malware scanner ตาม contract ใน README; local `DEV_VALIDATED` ไม่ใช่ antivirus scan และไม่อนุญาตใน production
4. ตั้ง `WORKER_USER_ID` เป็น ES ที่ provision และ scope ถูกต้อง, `INLINE_WORKER=false`, เปิด `npm run worker` ภายใต้ service supervisor สำหรับ PostgreSQL production
5. ชื่อจริงของ Owner/Verifier, เวลา expected schedules/holidays, unit/meter boundaries, regulatory reference/threshold และวันเริ่มใช้ ให้คนอิสระตรวจอนุมัติก่อนเปิดใช้

## Backlog ที่ยังไม่ครบสเปกฉบับเต็ม

| งาน                            | สิ่งที่ยังเหลือ / ข้อจำกัด                                                                                                                                                      |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Workflow configuration ขั้นสูง | ขั้นหลายระดับ ALL/ANY, delegate/ผู้ตรวจสำรอง, escalation matrix ยังไม่มี engine ทั่วไป ปัจจุบันใช้ ES ที่อยู่ใน snapshot และผู้ตรวจอิสระที่มอบหมาย                              |
| Scope ระดับ Department/Area    | เก็บเป็น Master แต่ enforcement ปัจจุบันเป็น Site ไม่ใช่ capability ราย Department                                                                                              |
| Production equivalence         | หน่วยฐานเดียวกันแปลงด้วย approved factor ได้; mixed product/equivalent factors ข้ามมิติและ operational-day shifts ยังไม่มี                                                      |
| Energy / Waste รายละเอียด      | tariff/cost, renewable completeness, opening stock/stock reconciliation เต็มรูปแบบ และ integration ใบกำกับ disposal ยังไม่ครบ ค่าไม่มีแหล่งข้อมูลแสดง N/A                       |
| Lists / Audit ขนาดใหญ่         | records/search/review queue เป็น server pagination; issues/tasks/alerts/documents โหลดล่าสุด 500, reports 100, audit 300 ยังต้องทำ pagination/filters ฝั่ง server ของทุกโมดูล   |
| Report builder ขั้นสูง         | snapshot + PDF/XLSX/CSV + review/publish มีแล้ว; manual narrative sections/templates, corrected-report association และ correction notice ที่ตรวจ sources เก่าทั้งฐานยังต้องขยาย |
| Bulk throughput                | คิวรองรับ 50,000 แถวตาม limit แต่ยังไม่ได้ benchmark ไฟล์จริง 50,000 แถว/concurrent imports; ทดสอบ chunk/resume/revocation ด้วย 131 แถว ไม่ใช่หลักฐานผ่าน NFR throughput        |
| Job operations                 | มี retry จาก cursor; ยังไม่มี UI cancel job/dead-letter dashboard/orphan storage cleanup และ outbox สำหรับ external delivery                                                    |
| Production NFR / UAT           | Google/storage integration, screen reader/keyboard audit แบบเต็ม, load/security assessment และ staging backup-restore drill (UAT-35) ยังไม่ผ่านตรวจรับจริง                      |
| Phase 2–4                      | AI, Google Sheets/email/chat automation, forecast/anomaly อยู่ใน backlog ไม่เปิดเป็นปุ่มใช้งาน P1                                                                               |

## จุดทำงานต่อ

- Domain boundary: `src/lib/service.ts`; migrations: `migrations/`; checks: `tests/domain.test.ts`, `tests/workbook.test.ts`, `tests/e2e/app.spec.ts`
- Worker/job resume: `src/lib/jobs.ts`, `src/lib/worker.ts`, `src/instrumentation.ts`; PostgreSQL process: `scripts/worker.ts`
- Site/initial tenant: `src/lib/sites.ts`, `scripts/provision.ts`, `provision.example.json`
- Reports: `src/lib/pdf-report.ts`, `src/lib/workbooks.ts`, `/api/export`; PDF QA fixture: `scripts/pdf-preview.ts`
- เวลาทำ migration กับ PGlite ให้หยุด server ก่อน ห้ามเปิดหลาย process บน `.local/database` เดียวกัน สำหรับทดสอบให้ใช้ฐานแยก
