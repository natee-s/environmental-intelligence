import type { DB } from './db';
import { authorize, fail, dateRange, type Actor, type Row } from './core';
export async function listRecords(db: DB, actor: Actor, site: string, options: Row) {
  authorize(actor, site, 'read');
  const page = Number(options.page || 0),
    size = 25;
  if (!Number.isInteger(page) || page < 0 || page > 100000) fail('หน้าไม่ถูกต้อง');
  const params: unknown[] = [site],
    clauses = ['site_id=$1'];
  const add = (clause: string, value: unknown) => {
    params.push(value);
    clauses.push(clause.replace('?', '$' + params.length));
  };
  if (options.category) {
    if (!['WATER', 'WASTEWATER', 'ENERGY', 'WASTE', 'PRODUCTION'].includes(options.category))
      fail('หมวดไม่ถูกต้อง');
    add('category=?', options.category);
  }
  if (options.status) add('status=?', options.status);
  if (options.from || options.to) {
    dateRange(options.from || options.to, options.to || options.from);
    if (options.from) add('event_date>=?::date', options.from);
    if (options.to) add('event_date<=?::date', options.to);
  }
  if (options.quality === '1') clauses.push("status IN('SUBMITTED','REJECTED')");
  if (options.search)
    add(
      "concat_ws(' ',id,asset_code,parameter_code,source_ref,note) ILIKE ?",
      '%' +
        String(options.search)
          .replace(/[\\%_]/g, '\\$&')
          .slice(0, 200) +
        '%',
    );
  const where = clauses.join(' AND ');
  const total = Number(
    (await db.query<Row>('SELECT count(*) AS n FROM record_versions WHERE ' + where, params)).rows[0].n,
  );
  const rows = (
    await db.query<Row>(
      'SELECT * FROM record_versions WHERE ' +
        where +
        ` ORDER BY event_date DESC,created_at DESC,id LIMIT ${size} OFFSET ${page * size}`,
      params,
    )
  ).rows;
  return { rows, total, page, size };
}
