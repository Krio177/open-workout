import pg from 'pg';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function migrate() {
  const schema = await fs.readFile(path.join(__dirname, 'schema.sql'), 'utf-8');
  await pool.query(schema);
  console.log('Database schema applied');
}

async function connect() {
  try {
    await pool.query('SELECT 1');
    console.log('Database connected');
    await migrate();
  } catch (err) {
    console.error('Failed to connect to database:', err.message);
    process.exit(1);
  }
}

export default pool;
export { connect };
