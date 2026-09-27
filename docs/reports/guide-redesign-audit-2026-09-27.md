# Guide redesign audit — 2026-09-27

## Scope

ตรวจหน้า `/guide` ของ `thanabartbb/lsuperagent.docs` เทียบกับ repository contract, commit history, tests ที่บันทึกไว้ และพฤติกรรมของ production route

## ข้อเท็จจริงที่ยืนยันแล้ว

- Production `https://agents-sdk.space/guide` ตอบกลับโดยส่งผู้ใช้ที่ยังไม่เข้าสู่ระบบไป `/login?return_to=%2Fguide`.
- พฤติกรรมนี้ตรงกับ `AGENTS.md`, `README.md`, `LSUPERAGENT.md`, `assets/guide.js` และ `tests/sdk-guide.test.mjs`: `/guide` เป็น route ที่ต้องมี signed session.
- `/guide` เป็น Playground ของ `lsupergen-sdk@0.1.0`; ไม่ใช่แพ็กเกจ `npmjs.sdk-space@1.0.1`. ขอบเขตนี้ถูกบันทึกชัดเจนใน commit `c3c913218d4528a426213a5409d9f81fd063ff10`.
- การย้ายการสร้าง API key ไป `/keys` และให้ Guide รับเฉพาะ key ที่ผู้ใช้วางเองอยู่ใน commit `0194a9fb46cd5cad12f354c5dd9d95d89e85f08d`.
- commit `9e089194e15f6af425056a8d65db3aa46673b237` บันทึกว่า existing Node tests ผ่าน 41 รายการ แต่ deployed visual verification ยัง pending.
- commit ล่าสุดก่อน audit (`c3c913218d4528a426213a5409d9f81fd063ff10`) ไม่มี GitHub Actions workflow run หรือ commit status ที่รายงานผ่าน GitHub API.

## ข้อผิดพลาดที่พบและแก้แล้ว

ปุ่ม `button.run` และ `button.primary` ใช้พื้นหลัง copper `#e9a077` กับตัวอักษรขาว `#ffffff` มี contrast ประมาณ 2.15:1 ซึ่งต่ำเกินไปสำหรับข้อความปกติ

แก้ใน `guide.html` ให้ใช้ตัวอักษร `#0d0e18`; contrast เพิ่มเป็นประมาณ 8.93:1.

Commit: `97e15ba997baf89e6a7542bb413cc266edf26a5e`

## ขั้นตอนที่ทำ

1. ตรวจ commit ล่าสุดและ commit ที่เกี่ยวข้องกับ Guide, layout, key flow และ palette.
2. ตรวจ source ของ `guide.html`, `assets/guide.js`, code-window assets และ repository contracts.
3. เปิด production route แบบไม่เข้าสู่ระบบเพื่อยืนยัน redirect behavior.
4. เทียบชื่อแพ็กเกจและขอบเขต `lsupergen-sdk` กับ `npmjs.sdk-space`; ไม่เปลี่ยนชื่อเพราะเป็นคนละแพ็กเกจตาม contract.
5. คำนวณ contrast ของปุ่มและแก้ค่าที่ผิดใน branch `main`.
6. ตรวจว่าไฟล์บน `main` รับ commit ใหม่แล้ว.

## สิ่งที่ยังควรทำ

- ตรวจภาพจริงหลัง deploy ด้วย signed-in test session ที่ 390px และ 1280px: header wrap, horizontal overflow, focus ring, tab panels, code blocks, และปุ่ม run.
- รัน `node --test tests/*.test.mjs` ใน CI หรือ checkout ที่เชื่อถือได้สำหรับ commit ใหม่.
- ทดสอบ flow จริง: `/keys` สร้าง/คัดลอก key → `/guide` วาง key → Run all → Proof report 5/5.
- พิจารณานำ IDE code window component มาใช้กับ Guide ด้วย ถ้าเป้าหมาย redesign ต้องการให้ code blocks สอดคล้องกับ Docs; ปัจจุบัน component ถูกยืนยันว่าใช้กับ Docs แต่ Guide ยังใช้ `.code > pre` และปุ่ม copy แบบเดิม.

## ข้อสงสัย/ข้อจำกัด

- ยังยืนยัน visual ของหน้า Guide หลัง login ไม่ได้ เพราะ audit นี้ไม่มี signed-in test session และจะไม่ขอหรือใช้ credential.
- ยังยืนยัน deployment ของ commit `97e15ba997baf89e6a7542bb413cc266edf26a5e` ไม่ได้จาก GitHub status เพราะ repository ไม่มี workflow/status ที่รายงานสำหรับ commit ก่อนหน้า.
- คำว่า “Guide” กับ “Playground” ใช้ปะปนกันในชื่อ task และ UI แต่ repository contract ระบุ `/guide` เป็น Playground; จึงไม่เปลี่ยน label โดยไม่มี product decision.


## Update — CORE SDK theme integration

ตรวจพบ commit `0595ebe6292ecb9402b1106330e0471facbd5500` เพิ่ม `assets/guide-core.css` แต่ไม่มี reference จาก `guide.html` หรือ `assets/guide.js`; ดังนั้นไฟล์ถูก deploy ได้แต่ browser ไม่โหลด และ visual redesign ไม่เกิดขึ้นจริง

แก้แล้วโดยเพิ่ม `<link rel="stylesheet" href="/assets/guide-core.css?v=1">` หลัง shared `theme.css` ใน `guide.html` เพื่อให้ page-scoped overrides ทำงานตามลำดับ cascade

Commit แก้ไข: `0f3dfa8bb5b066ba2c0bd2f97a09151963551ec5`

ตรวจค่า contrast ของปุ่มหลังธีมใหม่: ขาวบน `#6c21ff` ประมาณ 6.37:1 และ hover `#7c32ff` ประมาณ 5.59:1 ผ่านเกณฑ์ข้อความปกติ จึงไม่ย้อนการกำหนดสีปุ่มของธีมใหม่

ยังต้องตรวจ visual หลัง deploy ด้วย signed-in session และ viewport 390px/1280px ตามรายการเดิม ไม่มี GitHub Actions run หรือ commit status สำหรับ commit ธีมในเวลาที่ตรวจ


## Update — two-mode theme and live verification

ตรวจ commits `b2573ad9156a3a235bd0301731614d6a96ffc191`, `45750bdf2169de6c8ce5673e6204e36890cfc529` และ `8589f754acc6cff193f381601d2727ea0311b9be` แล้ว:

- เพิ่ม Normal/Docs mode ร่วมกันบน `/loading` และ `/guide` ผ่าน `assets/theme-modes.css` และ `assets/theme-modes.js`.
- ใช้ canvas และ tab/card surfaces เป็น `#000000` แบบ opaque; Normal ใช้ blue-gray และ Docs ใช้ muted purple.
- เพิ่ม cache-busting version ให้ CSS ที่เปลี่ยน และเพิ่ม static contract tests ใน `tests/public-product.test.mjs`.
- Production `/loading` ถูกตรวจผ่าน browser จริง: computed body background เป็น `rgb(0, 0, 0)`, logo container เป็น 88×88px, toggle เปลี่ยนจาก Normal ไป Docs ได้, Docs toggle เป็น `rgb(102, 81, 129)` กับตัวอักษรขาว และหลัง reload ยังคง Docs mode อยู่.
- ยังไม่มี GitHub Actions workflow run หรือ commit status สำหรับ commit ล่าสุด จึงถือว่า static tests มีอยู่ใน source แต่ยังไม่มี CI execution evidence.

แก้ factual error ใน comment ของ `assets/guide-core.css`: ไฟล์ถูกโหลดโดย `guide.html` ไม่ใช่ `assets/guide.js`.

Commit แก้ comment: `cd9879c100c5838b6219416084a4d9953e70c6cb`.

ข้อจำกัดที่เหลือ: `/guide` ต้องมี signed session จึงยังไม่ได้ตรวจ computed styles และ interaction ของหน้า Guide ที่ deploy จริง รวมถึง viewport 390px/1280px และ flow `/keys → /guide → Run all`.


## Update — CORE SDK electric violet restored

ตรวจ commit `a768ab1ed6657ac7fb4d18d741cc1985f2f372f5` แล้ว พบว่าเปลี่ยน `assets/guide-core.css` โดยตั้งใจคืน electric violet (`#6c21ff`) ให้ visual layer ของ CORE SDK บน `/guide` และลบ mode-specific accent variables ที่เคยเป็น blue-gray/muted purple ออกจากไฟล์นี้

ข้อเท็จจริงจาก CSS cascade ปัจจุบัน:

- `assets/theme-modes.css` ถูกโหลดหลัง `assets/guide-core.css` จึงยังทำให้ปุ่ม Run/Primary ใน Normal mode เป็นพื้นดำตาม selector ที่เฉพาะกว่า
- ใน Docs mode ปุ่ม `.primary` ของ Guide, focus ring, hover, step number และ selected tabs ใช้ electric violet จาก `guide-core.css`; selected tabs ถูกบังคับเป็น violet ในทั้งสอง mode
- สีข้อความขาวบน `#6c21ff` มี contrast ประมาณ 6.37:1 และบน hover `#7c32ff` ประมาณ 5.59:1 จึงยังผ่าน WCAG AA สำหรับข้อความปกติ
- commit นี้ไม่มี GitHub Actions workflow run หรือ commit status ที่รายงานผ่าน GitHub API ณ เวลาตรวจ

ไม่ได้แก้ย้อน เพราะชื่อ commit และชุดการเปลี่ยนแปลงบ่งชี้ว่าเป็น product/brand decision โดยตรง และไม่พบ accessibility regression เชิง contrast จากค่าที่เปลี่ยน อย่างไรก็ตาม ผลลัพธ์นี้ทำให้คำอธิบายก่อนหน้าว่า `/guide` ใช้ Normal blue-gray / Docs muted purple ไม่ครบถ้วนแล้ว

สิ่งที่ควรยืนยันต่อ: product owner ต้องเลือกให้ชัดว่า electric violet เป็น accent เฉพาะ CORE SDK ที่ควร override theme mode หรือ theme mode ต้องควบคุม accent ทั้งหมด; จากนั้นเพิ่ม static test สำหรับ precedence นี้ และตรวจ visual จริงหลัง login ที่ 390px/1280px


## Update — sitewide editorial refresh and stale palette assertion

ตรวจ commit `8a8e3a7cb167ac3eb60d283fa25173411f2fcc96` ซึ่งปรับข้อความและ compact branding ทั่วเว็บ รวมถึง `/guide`:

- `guide.html` ยังโหลด `guide-core.css?v=3` ก่อน `theme-modes.css?v=2` และยังคง IDs/scripts ที่ใช้กับการทดสอบจริง
- เปลี่ยนข้อความนำของ Guide ให้เน้นขั้นตอนและผลลัพธ์ และเพิ่ม `assets/editorial.css?v=1`; contract ของ auth/API ไม่ได้เปลี่ยน
- ผู้ทำ commit รายงาน targeted checks ผ่าน 33/34 และยังไม่ได้ตรวจ browser/live deployment
- ข้อที่ล้มเกิดจาก test บังคับ literal `background:#000000` แต่ `assets/guide-core.css` ใช้ shorthand `background:#000` ซึ่งเป็นค่าสีเดียวกัน ไม่ใช่ visual regression

แก้ assertion ใน `tests/public-product.test.mjs` ให้ยอมรับทั้ง `#000` และ `#000000` โดยยังคงตรวจ `!important` และ opacity เดิม

Commit แก้ test: `dff72afbb3423cf92d9663c4b01c531d3c69c8fe`.

ยังไม่มี GitHub Actions workflow run หรือ commit status สำหรับ editorial commit; การตรวจ browser หลัง login ที่ 390px/1280px และ flow `/keys → /guide → Run all` ยังเป็นข้อจำกัดเดิม
