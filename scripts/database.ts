import { createDatabase, migrate } from '../src/lib/db';
import { seed } from '../src/lib/seed';
const db = await createDatabase();
try {
  const command = process.argv[2];
  if (command === 'migrate' || command === 'setup') {
    await migrate(db);
    console.log('Migrations completed.');
  }
  if (command === 'seed' || command === 'setup') {
    console.log(await seed(db));
  }
} finally {
  await db.close();
}
