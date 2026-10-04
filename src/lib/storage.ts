import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fail, hash, id } from './core';
export function validateFile(filename: string, mime: string, bytes: Buffer) {
  if (bytes.length === 0 || bytes.length > 8 * 1024 * 1024) fail('ไฟล์ต้องมีขนาดไม่เกิน 8 MB');
  const ext = path.extname(filename).toLowerCase();
  const ok =
    (mime === 'application/pdf' && ext === '.pdf' && bytes.subarray(0, 5).toString() === '%PDF-') ||
    (mime === 'image/png' &&
      ext === '.png' &&
      bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) ||
    (mime === 'image/jpeg' &&
      ['.jpg', '.jpeg'].includes(ext) &&
      bytes[0] === 255 &&
      bytes[1] === 216 &&
      bytes[2] === 255);
  if (!ok) fail('รองรับ PDF, PNG, JPG ที่ชนิดเนื้อหาตรงนามสกุลเท่านั้น');
  if (
    mime === 'application/pdf' &&
    /\/(JavaScript|JS|Launch|EmbeddedFile|OpenAction)\b/.test(bytes.toString('latin1'))
  )
    fail('PDF มี active content ที่ไม่อนุญาต');
}
export async function putEvidence(filename: string, mime: string, bytes: Buffer) {
  validateFile(filename, mime, bytes);
  const key = id();
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  if ((process.env.EVIDENCE_PROVIDER || 'local') === 'local') {
    if (process.env.LOCAL_DEVELOPMENT !== 'true') fail('Local storage ใช้ได้เฉพาะ local development', 503);
    const dir = path.resolve(process.env.EVIDENCE_DIR || '.local/evidence');
    await mkdir(dir, { recursive: true });
    await writeFile(path.join(dir, key), bytes, { flag: 'wx' });
    return { object_key: key, sha256, provider: 'local', scan_status: 'DEV_VALIDATED' };
  }
  const gateway = process.env.STORAGE_GATEWAY_URL;
  if (!gateway || !process.env.STORAGE_GATEWAY_TOKEN) fail('ยังไม่ได้ตั้งค่า storage gateway', 503);
  const res = await fetch(`${gateway}/objects/${key}`, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${process.env.STORAGE_GATEWAY_TOKEN}`,
      'Content-Type': mime,
      'X-Content-SHA256': sha256,
    },
    body: new Uint8Array(bytes),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) fail('ผู้ให้บริการจัดเก็บไม่พร้อมใช้งาน', 503);
  const result = await res.json();
  if (result.scan_status !== 'CLEAN') fail('หลักฐานยังไม่ผ่านการสแกน', 422);
  return { object_key: key, sha256, provider: 'gateway', scan_status: 'CLEAN' };
}
export async function getEvidence(row: {
  provider: string;
  object_key: string;
  sha256: string;
  available: boolean;
  scan_status: string;
}) {
  if (
    !row.available ||
    !['CLEAN', ...(process.env.LOCAL_DEVELOPMENT === 'true' ? ['DEV_VALIDATED'] : [])].includes(
      row.scan_status,
    )
  )
    fail('หลักฐานไม่พร้อมใช้งานหรือยังไม่ผ่านการตรวจ', 503);
  if (!/^[0-9a-f-]{36}$/.test(row.object_key)) fail('รหัสหลักฐานไม่ถูกต้อง', 422);
  let bytes: Buffer;
  try {
    if (row.provider === 'local') {
      if (process.env.LOCAL_DEVELOPMENT !== 'true') fail('Local storage ไม่เปิดใช้งาน', 503);
      bytes = await readFile(path.resolve(process.env.EVIDENCE_DIR || '.local/evidence', row.object_key));
    } else {
      const res = await fetch(`${process.env.STORAGE_GATEWAY_URL}/objects/${row.object_key}`, {
        headers: { Authorization: `Bearer ${process.env.STORAGE_GATEWAY_TOKEN}` },
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) fail('หลักฐานไม่พร้อมใช้งาน', 503);
      bytes = Buffer.from(await res.arrayBuffer());
    }
  } catch {
    fail('ไม่สามารถเปิดหลักฐานได้ กรุณาตรวจ storage แล้วลองใหม่', 503);
  }
  if (createHash('sha256').update(bytes!).digest('hex') !== row.sha256)
    fail('Checksum ของหลักฐานไม่ตรงกับรุ่นที่บันทึก', 409);
  return bytes!;
}
