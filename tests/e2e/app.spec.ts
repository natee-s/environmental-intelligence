import { test, expect, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
async function login(page: Page, user: string) {
  await page.goto('/login');
  await page.getByLabel('เลือกบทบาท Demo').selectOption(user);
  await page.getByRole('button', { name: 'เข้าสู่ระบบ Demo' }).click();
  await expect(page.locator('.main-content')).toBeVisible();
}
test('desktop dashboard, responsive navigation and API authorization', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await login(page, 'eo');
  await expect(page.getByRole('heading', { name: 'ภาพรวมสิ่งแวดล้อม', exact: true })).toBeVisible();
  await expect(page.locator('.kpi-card')).toHaveCount(4);
  await page.screenshot({ path: 'test-results/desktop-overview.png', fullPage: true });
  const blocked = await page.request.get('/api/bootstrap?site=site-b');
  expect(blocked.status()).toBe(403);
  const anon = await request.get('/api/bootstrap');
  expect(anon.status()).toBe(401);
  for (const route of [
    '/monitoring/water',
    '/monitoring/wastewater',
    '/monitoring/energy',
    '/monitoring/waste',
    '/data',
    '/data/production',
    '/data/imports',
    '/data/quality',
    '/alerts',
    '/issues',
    '/tasks',
    '/documents',
    '/reports',
    '/analysis/monthly',
    '/notifications',
  ]) {
    await page.goto(route);
    await expect(page.locator('.main-content')).toBeVisible();
    await expect(page.locator('.error-banner')).toHaveCount(0);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/overview');
  await expect(page.locator('.kpi-card')).toHaveCount(4);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'เปิดเมนู', exact: true }).click();
  await expect(page.locator('.sidebar')).toHaveClass(/open/);
  await page.getByRole('link', { name: 'ข้อมูลสิ่งแวดล้อม', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'ข้อมูลสิ่งแวดล้อม', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-data.png', fullPage: true });
  expect(errors).toEqual([]);
});
test('IEAT parameter graphs and monthly paired analysis are ready for presentation', async ({ page }) => {
  await login(page, 'manager');
  await expect(page.locator('.user-label strong')).toHaveText('นาย E');
  const data = await (await page.request.get('/api/bootstrap')).json();
  const date = (n: number) => new Date(Date.parse(data.to) - n * 86400000).toISOString().slice(0, 10);
  const qs = `?site=site-a&from=${date(7)}&to=${date(1)}`;
  await page.goto('/overview' + qs);
  await expect(page.locator('.chart-panel .data-chart circle')).toHaveCount(14);
  await page.locator('.chart-panel .data-chart circle').nth(7).click();
  await expect(page.getByRole('dialog')).toContainText('WW-OUT');
  await page.getByRole('button', { name: 'ปิดหน้าต่าง', exact: true }).click();
  await page.goto('/monitoring/wastewater' + qs);
  await expect(page.locator('.parameter-card')).toHaveCount(8);
  await expect(page.locator('.reference-badge')).toContainText('รอยืนยัน');
  await page.locator('.parameter-card').filter({ hasText: 'ความเป็นกรด–ด่าง' }).click();
  await expect(page.getByRole('img', { name: /ผลตรวจ ความเป็นกรด/ })).toBeVisible();
  await expect(page.locator('.wastewater-parameters .data-chart circle')).toHaveCount(7);
  await page.screenshot({ path: 'test-results/wastewater-parameters.png', fullPage: true });
  await page.locator('.wastewater-parameters .data-chart circle').first().click();
  await expect(page.getByRole('dialog')).toContainText('LAB-IEAT');
  await page.getByRole('button', { name: 'ปิดหน้าต่าง', exact: true }).click();
  await page.goto('/analysis/monthly' + qs);
  await page.getByRole('button', { name: 'พลังงาน × ผลผลิต', exact: true }).click();
  await expect(page.locator('.analysis-metrics > div').first()).toContainText('7');
  await expect(page.locator('.comparison-charts .data-chart')).toHaveCount(2);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'กราฟ SVG', exact: true }).click();
  const file = await download;
  await file.saveAs('test-results/monthly-comparison.svg');
  const svg = await readFile('test-results/monthly-comparison.svg', 'utf8');
  expect(svg).toContain('Demo');
  expect(svg).toContain('kWh');
  expect(svg).toContain('ผลผลิต');
  expect(svg.match(/width="760" height="302"/g)).toHaveLength(2);
  await page.screenshot({ path: 'test-results/monthly-analysis.png', fullPage: true });
  await page.pdf({
    path: 'test-results/monthly-review.pdf',
    format: 'A4',
    landscape: true,
    printBackground: true,
    preferCSSPageSize: true,
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth))
    .toBe(true);
  await page.screenshot({ path: 'test-results/monthly-mobile.png', fullPage: true, animations: 'disabled' });
  await page.goto('/monitoring/wastewater' + qs);
  await expect(page.locator('.parameter-card')).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: 'test-results/wastewater-mobile.png', fullPage: true });
});
test('September meeting deck visualizes all efficiencies, waste classes and source-linked decisions', async ({
  page,
}) => {
  await login(page, 'eo');
  await page.getByRole('button', { name: 'Demo กันยายน 2569', exact: true }).click();
  await expect(page.getByLabel('วันที่เริ่มต้น')).toHaveValue('2026-09-01');
  await expect(page.getByLabel('วันที่สิ้นสุด')).toHaveValue('2026-09-30');
  await expect(page.locator('.efficiency-panel.compact')).toHaveCount(4);
  await expect(page.locator('.efficiency-panel.compact .intensity-chart svg')).toHaveCount(4);
  await expect(page.locator('.kpi-card .mini-trend')).toHaveCount(4);
  await page
    .locator('.efficiency-grid')
    .screenshot({ path: 'test-results/september-efficiencies.png', animations: 'disabled' });
  await page.goto('/monitoring/waste?site=site-a&from=2026-09-01&to=2026-09-30');
  await expect(page.locator('.waste-type-card')).toHaveCount(4);
  await expect(page.locator('.waste-visuals .data-chart rect')).toHaveCount(90);
  await page
    .locator('.waste-visuals')
    .screenshot({ path: 'test-results/september-waste.png', animations: 'disabled' });
  await page.goto('/monitoring/wastewater?site=site-a&from=2026-09-01&to=2026-09-30');
  await expect(page.locator('.parameter-card .mini-trend')).toHaveCount(8);
  await expect(page.locator('.wastewater-parameters .data-chart circle')).toHaveCount(30);
  await page
    .locator('.parameter-grid')
    .screenshot({ path: 'test-results/september-lab-trends.png', animations: 'disabled' });
  await page.goto('/analysis/monthly');
  await expect(page.getByLabel('วันที่เริ่มต้น')).toHaveValue('2026-09-01');
  await expect(page.getByLabel('วันที่สิ้นสุด')).toHaveValue('2026-09-30');
  await expect(page.locator('.meeting-sheet')).toHaveCount(8);
  await expect(page.locator('.water-quality-chart')).toHaveCount(8);
  await expect(page.locator('.executive-metrics > div').nth(1)).toContainText('240');
  await page
    .locator('.executive-sheet')
    .screenshot({ path: 'test-results/september-briefing.png', animations: 'disabled' });
  const meetingPdf = await page.pdf({
    path: 'test-results/september-meeting-pack.pdf',
    format: 'A4',
    landscape: true,
    printBackground: true,
    preferCSSPageSize: true,
  });
  expect(meetingPdf.toString('latin1').match(/\/Type \/Page\b/g)).toHaveLength(8);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page
    .locator('.executive-sheet')
    .screenshot({ path: 'test-results/september-briefing-mobile.png', animations: 'disabled' });
  await page
    .locator('#efficiency-WATER')
    .getByRole('button', { name: 'เปิดประเด็นตรวจสอบ', exact: true })
    .click();
  const dialog = page.getByRole('dialog');
  await expect(dialog.getByLabel('ข้อเท็จจริง / ผลกระทบ / สิ่งที่ต้องตรวจ')).toHaveValue(/แหล่งข้อมูลประกอบ/);
  await expect(dialog.getByLabel('เหตุผลที่ยังไม่มีแหล่งข้อมูลอ้างอิง')).toHaveCount(0);
  await dialog.getByRole('button', { name: 'เปิดประเด็น', exact: true }).click();
  await expect(page.getByRole('button', { name: 'เปิดข้อมูลต้นทาง', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'เปิดข้อมูลต้นทาง', exact: true }).click();
  await expect(page.getByRole('dialog')).toContainText('W-MAIN');
  await expect(page.locator('.error-banner')).toHaveCount(0);
});
test('UI entry → review → KPI with persisted source', async ({ page }) => {
  await login(page, 'eo');
  await page.goto('/data');
  await page.getByRole('button', { name: 'บันทึกข้อมูล', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('วันที่วัด / วันที่เก็บตัวอย่าง (ค.ศ.)').fill('2025-12-11');
  await dialog.getByLabel(/^ค่าที่วัด/).fill('123.45');
  await dialog.getByLabel('หมายเหตุ / เหตุผลการผลิตเป็นศูนย์').fill('Demo • Browser acceptance');
  await dialog.getByRole('button', { name: 'บันทึกฉบับร่าง' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'ออกจากระบบ / เปลี่ยนบัญชี Demo' }).click();
  await login(page, 'es1');
  const snapshot = await (
    await page.request.get(
      '/api/records?site=site-a&search=' + encodeURIComponent('Demo • Browser acceptance'),
    )
  ).json();
  const record = snapshot.rows.find(
    (r: any) => r.note === 'Demo • Browser acceptance' && r.status === 'DRAFT',
  );
  expect(record).toBeTruthy();
  await page.getByRole('button', { name: 'ออกจากระบบ / เปลี่ยนบัญชี Demo' }).click();
  await login(page, 'eo');
  await page.goto('/data/' + record.id);
  await page.getByRole('button', { name: 'ส่งตรวจข้อมูล', exact: true }).click();
  await expect(page.locator('.source-heading').getByText('รอตรวจข้อมูล', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'ออกจากระบบ / เปลี่ยนบัญชี Demo' }).click();
  await login(page, 'es1');
  await page.goto('/data/' + record.id);
  await page.getByRole('button', { name: 'อนุมัติข้อมูล', exact: true }).click();
  await expect(page.locator('.source-heading').getByText('อนุมัติแล้ว', { exact: true })).toBeVisible();
  await page.goto('/overview?site=site-a&from=2025-12-11&to=2025-12-11');
  await expect(page.locator('.kpi-card.water .kpi-value')).toContainText('123.5');
});
test('admin separation and editable masters screens', async ({ page }) => {
  await login(page, 'admin');
  for (const route of [
    '/admin/master-data',
    '/admin/rules',
    '/admin/users',
    '/admin/integrations',
    '/admin/sites',
    '/admin/audit',
  ]) {
    await page.goto(route);
    await expect(page.locator('.main-content')).toBeVisible();
    await expect(page.locator('.error-banner')).toHaveCount(0);
  }
  await page.goto('/overview');
  await expect(page.getByText('คุณไม่มีสิทธิ์เข้าถึงหน้านี้', { exact: true })).toBeVisible();
});

test('queued import and PDF snapshot export work through the local server', async ({ page }) => {
  await login(page, 'eo');
  await page.goto('/data/imports');
  await page.getByLabel('ไฟล์ CSV / XLSX').setInputFiles({
    name: 'Demo-browser-import.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from(
      'category,asset_code,parameter_code,event_date,value,unit,kind\nWATER,W-MAIN,WATER_USE,2025-12-20,42,m3,CONSUMED',
    ),
  });
  await page.getByRole('button', { name: 'ตรวจไฟล์และแสดง Preview' }).click();
  await expect(page.getByRole('button', { name: 'ยืนยันนำเข้าเป็นฉบับร่าง' })).toBeVisible({
    timeout: 30000,
  });
  await page.getByRole('button', { name: 'ยืนยันนำเข้าเป็นฉบับร่าง' }).click();
  await expect
    .poll(
      async () => {
        const b = await (await page.request.get('/api/bootstrap')).json();
        return b.imports.find((r: any) => r.filename === 'Demo-browser-import.csv')?.status;
      },
      { timeout: 30000 },
    )
    .toBe('COMPLETED');
  const state = await (await page.request.get('/api/bootstrap')).json();
  const imported = await (
    await page.request.get('/api/records?site=site-a&from=2025-12-20&to=2025-12-20')
  ).json();
  const record = imported.rows[0];
  expect(record.status).toBe('DRAFT');
  const result = await page.request.post('/api/command', {
    headers: { Origin: new URL(page.url()).origin, 'Idempotency-Key': crypto.randomUUID() },
    data: {
      action: 'report.create',
      site: 'site-a',
      input: { title: 'Demo browser PDF', from: state.from, to: state.to },
    },
  });
  expect(result.ok()).toBe(true);
  const report = await result.json();
  const pdf = await page.request.get(`/api/export?site=site-a&report=${report.id}&format=pdf`);
  expect(pdf.ok()).toBe(true);
  expect(pdf.headers()['content-type']).toBe('application/pdf');
  expect((await pdf.body()).subarray(0, 5).toString()).toBe('%PDF-');
  const xlsx = await page.request.get(`/api/export?site=site-a&report=${report.id}&format=xlsx`);
  expect(xlsx.ok()).toBe(true);
  expect((await xlsx.body()).subarray(0, 2).toString()).toBe('PK');
});

test('administrator creates a scoped Demo Site in the organization', async ({ page }) => {
  await login(page, 'admin');
  await page.goto('/admin/sites');
  await page.getByRole('button', { name: 'เพิ่ม Site', exact: true }).click();
  const dialog = page.getByRole('dialog');
  await dialog.getByLabel('รหัส Site').fill('Z_BROWSER');
  await dialog.getByLabel('ชื่อ Site').fill('Demo Browser Site');
  await dialog.getByLabel('เหตุผล', { exact: true }).fill('Demo acceptance');
  await dialog.getByRole('button', { name: 'บันทึก Site' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('cell', { name: 'Demo Browser Site', exact: true })).toBeVisible();
  const state = await (await page.request.get('/api/bootstrap')).json();
  const site = state.sites.find((s: any) => s.code === 'Z_BROWSER');
  expect(site.demo).toBe(true);
  expect((await page.request.get('/api/records?site=' + site.id)).status()).toBe(403);
});
test('UI Alert → Issue → Assign → Action → Evidence → Verify → Close', async ({ page }) => {
  const switchUser = async (user: string) => {
    await page.getByRole('button', { name: 'ออกจากระบบ / เปลี่ยนบัญชี Demo' }).click();
    await login(page, user);
  };
  const api = async (action: string, input: Record<string, unknown>) => {
    const response = await page.request.post('/api/command', {
      headers: { Origin: new URL(page.url()).origin, 'Idempotency-Key': crypto.randomUUID() },
      data: { action, site: 'site-a', input },
    });
    const body = await response.json();
    expect(response.ok(), JSON.stringify(body)).toBe(true);
    return body;
  };
  await login(page, 'eo');
  const base = {
    category: 'WATER',
    asset_code: 'W-MAIN',
    parameter_code: 'WATER_USE',
    unit: 'm3',
    kind: 'CONSUMED',
    source: 'MANUAL',
    note: 'Demo • Browser Issue acceptance',
  };
  const zero = await api('record.create', { ...base, event_date: '2025-12-12', value: 0 });
  const zs = await api('record.submit', { id: zero.id, version: zero.lock_version });
  const high = await api('record.create', { ...base, event_date: '2025-12-13', value: 999 });
  const hs = await api('record.submit', { id: high.id, version: high.lock_version });
  await switchUser('es1');
  await api('record.approve', { id: zs.id, version: zs.lock_version });
  await api('record.approve', { id: hs.id, version: hs.lock_version });
  await switchUser('eo');
  await page.goto('/alerts');
  const card = page.locator('.alert-card').filter({ hasText: '999' });
  await card.getByRole('button', { name: 'เปิดประเด็น', exact: true }).click();
  let dialog = page.getByRole('dialog');
  await dialog.getByLabel('ชื่อประเด็น (10–200 ตัวอักษร)').fill('Demo • Browser Issue acceptance flow');
  await dialog
    .getByLabel('ข้อเท็จจริง / ผลกระทบ / สิ่งที่ต้องตรวจ')
    .fill('ตรวจสอบจากข้อมูลที่อนุมัติแล้ว ยังไม่สรุปสาเหตุ');
  await dialog.getByRole('button', { name: 'เปิดประเด็น', exact: true }).click();
  await expect(page.locator('.issue-title')).toContainText('Browser Issue acceptance');
  const issueUrl = new URL(page.url()).pathname;
  await switchUser('es1');
  await page.goto(issueUrl);
  await page.getByRole('button', { name: 'มอบหมายงาน', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('combobox', { name: 'ผู้รับผิดชอบ', exact: true }).selectOption('owner');
  await dialog.getByRole('combobox', { name: 'ผู้ตรวจอิสระ', exact: true }).selectOption('es2');
  await dialog.getByRole('button', { name: 'ยืนยันการดำเนินการ' }).click();
  await expect(dialog).not.toBeVisible();
  await switchUser('owner');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(issueUrl);
  await page.getByRole('button', { name: 'เริ่มตรวจสอบ', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').fill('ตรวจมิเตอร์และตรวจจุดเชื่อมในพื้นที่');
  await dialog.getByRole('button', { name: 'ยืนยันการดำเนินการ' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'บันทึกแผนแก้ไข', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog
    .getByLabel('สาเหตุ หรือ “ยังไม่ยืนยัน” พร้อมเหตุผล')
    .fill('ยังไม่ยืนยัน ต้องตรวจจุดเชื่อมเพิ่มเติม');
  await dialog.getByLabel('Action ที่ต้องดำเนินการ').fill('ตรวจซ่อมและบันทึกผล');
  await dialog.getByRole('button', { name: 'ยืนยันการดำเนินการ' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'เริ่มงาน', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').fill('เริ่มตรวจงาน');
  await dialog.getByRole('button', { name: 'ยืนยันการดำเนินการ' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'บันทึกผล', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').fill('ตรวจซ่อมเสร็จและทดสอบแล้ว');
  await dialog.getByRole('button', { name: 'ยืนยันการดำเนินการ' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: /หลักฐาน \(/ }).click();
  await page.getByRole('button', { name: 'แนบหลักฐาน', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByLabel('เลือกไฟล์หลักฐาน').setInputFiles({
    name: 'inspection.pdf',
    mimeType: 'application/pdf',
    buffer: Buffer.from('%PDF-1.4\nDemo browser evidence\n%%EOF'),
  });
  await dialog.getByRole('button', { name: 'แนบหลักฐาน', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await page.screenshot({ path: 'test-results/mobile-issue-evidence.png', fullPage: true });
  await page.getByRole('button', { name: 'ส่งตรวจผลงาน', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').fill('ดำเนินการครบ พร้อมหลักฐานตรวจสอบ');
  await dialog.getByRole('button', { name: 'ยืนยันการดำเนินการ' }).click();
  await expect(dialog).not.toBeVisible();
  await switchUser('es2');
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto(issueUrl);
  await page.getByRole('button', { name: 'ตรวจสอบผ่าน', exact: true }).click();
  dialog = page.getByRole('dialog');
  for (const checkbox of await dialog.getByRole('checkbox').all()) await checkbox.check();
  await dialog.getByRole('textbox').fill('ตรวจครบ checklist และเปิดหลักฐานได้');
  await dialog.getByRole('button', { name: 'ยืนยันการดำเนินการ' }).click();
  await expect(dialog).not.toBeVisible();
  await page.getByRole('button', { name: 'ปิดงาน', exact: true }).click();
  dialog = page.getByRole('dialog');
  await dialog.getByRole('textbox').fill('ตรวจยืนยันและปิดประเด็นตาม workflow');
  await dialog.getByRole('button', { name: 'ยืนยันการดำเนินการ' }).click();
  await expect(dialog).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'เปิดงานใหม่', exact: true })).toBeVisible();
  await page.screenshot({ path: 'test-results/desktop-closed-issue.png', fullPage: true });
  const bootstrap = await (await page.request.get('/api/bootstrap')).json();
  const evidence = bootstrap.evidence.find((e: any) => e.issue_id === issueUrl.split('/').at(-1));
  expect(evidence).toBeTruthy();
  expect((await page.request.get('/api/evidence/' + evidence.id)).ok()).toBe(true);
  await switchUser('eo-b');
  expect((await page.request.get('/api/evidence/' + evidence.id)).status()).toBe(404);
  expect((await page.request.get('/api/records/' + high.id)).status()).toBe(404);
  expect((await page.request.get('/api/export?site=site-a&from=2025-12-12&to=2025-12-13')).status()).toBe(
    403,
  );
});
