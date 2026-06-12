import { readFile } from 'node:fs/promises';
import process from 'node:process';
import pg from 'pg';

const migrationPath = process.argv[2];
const connectionString = process.env.DATABASE_URL;

if (!migrationPath || !connectionString) {
  throw new Error('Usage: DATABASE_URL=... node scripts/apply-migration.mjs <migration.sql>');
}

const sql = await readFile(migrationPath, 'utf8');
const client = new pg.Client({
  connectionString,
  ssl: { rejectUnauthorized: false }
});

await client.connect();

try {
  await client.query(sql);
  console.log(`Applied ${migrationPath}`);
} finally {
  await client.end();
}
