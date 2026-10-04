import { readFile } from 'node:fs/promises';
import { createDatabase, migrate } from '../src/lib/db';
import { id, insert, required, fail } from '../src/lib/core';
const file = process.argv[2];
if (!file)
  throw new Error('Usage: npm run provision -- path/to/provision.json (database owner access required)');
const config = JSON.parse(await readFile(file, 'utf8'));
const organizationName = required(config.organizationName, 'ชื่อองค์กร');
const siteCode = required(config.siteCode, 'รหัส Site'),
  siteName = required(config.siteName, 'ชื่อ Site');
if (!/^[A-Za-z0-9_-]{1,60}$/.test(siteCode)) fail('รหัส Site ไม่ถูกต้อง');
const timezone = config.timezone || 'Asia/Bangkok';
new Intl.DateTimeFormat('en', { timeZone: timezone }).format();
const email = required(config.adminEmail, 'อีเมล').toLowerCase(),
  adminName = required(config.adminName, 'ชื่อผู้ดูแล');
if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail('อีเมลไม่ถูกต้อง');
const db = await createDatabase();
try {
  await migrate(db);
  const output = await db.transaction(async (tx) => {
    if ((await tx.query('SELECT id FROM users WHERE email=$1', [email])).rows.length)
      fail('บัญชีนี้มีอยู่แล้ว ไม่มีการแก้ไขฐานข้อมูล');
    const organizationId = id(),
      siteId = id(),
      userId = id();
    await insert(tx, 'organizations', { id: organizationId, name: organizationName });
    await insert(tx, 'sites', {
      id: siteId,
      organization_id: organizationId,
      code: siteCode,
      name: siteName,
      timezone,
      demo: false,
    });
    await insert(tx, 'users', {
      id: userId,
      organization_id: organizationId,
      email,
      name: adminName,
      demo: false,
    });
    await tx.query("INSERT INTO grants(user_id,site_id,role) VALUES($1,$2,'SA')", [userId, siteId]);
    return { organizationId, siteId, adminUserId: userId };
  });
  console.log('Provisioned organization, first Site and SA (no business grant).', output);
} finally {
  await db.close();
}
