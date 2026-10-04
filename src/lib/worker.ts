import type { DB } from './db';
import { actorById, authorize, one } from './core';
import { processNextJob } from './jobs';
import { scanOperationalAlerts } from './operational-alerts';
export async function scanScheduledSites(db: DB, userId: string, now = new Date()) {
  const actor = await actorById(db, userId);
  const sites = [...new Set(actor.grants.filter((g) => g.role === 'ES').map((g) => g.site_id))];
  for (const site of sites)
    await db.transaction(async (tx) => {
      await one(tx, 'SELECT id FROM users WHERE id=$1 FOR UPDATE', [actor.id]);
      const current = await actorById(tx, actor.id);
      authorize(current, site, 'review');
      await tx.query('INSERT INTO scheduler_state(site_id) VALUES($1) ON CONFLICT DO NOTHING', [site]);
      const state = await one(tx, 'SELECT * FROM scheduler_state WHERE site_id=$1 FOR UPDATE', [site]);
      if (state.last_scan && now.getTime() - new Date(state.last_scan).getTime() < 60000) return;
      await scanOperationalAlerts(tx, current, site, now);
      await tx.query('UPDATE scheduler_state SET last_scan=$1 WHERE site_id=$2', [now.toISOString(), site]);
    });
}
export function startWorker(db: DB, userId?: string) {
  let stopped = false,
    timer: NodeJS.Timeout;
  const tick = async () => {
    if (stopped) return;
    try {
      await processNextJob(db);
      if (userId) await scanScheduledSites(db, userId);
    } catch (e) {
      console.error('Background worker:', e instanceof Error ? e.message : 'failed');
    }
    if (!stopped) {
      timer = setTimeout(tick, 1000);
      timer.unref();
    }
  };
  timer = setTimeout(tick, 1000);
  timer.unref();
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}
