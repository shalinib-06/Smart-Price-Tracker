import dotenv from 'dotenv';
dotenv.config();
import fs from 'fs';
import path from 'path';
import pool from './db';

async function migrate() {
  console.log('[migrate] Connecting to Supabase database...');
  const sql = fs.readFileSync(path.join(__dirname, '../migrations/001_initial.sql'), 'utf-8');
  try {
    await pool.query(sql);
    console.log('[migrate] Tables created successfully in Supabase!');
  } catch (err: any) {
    console.error('[migrate] Migration error:', err.message);
  } finally {
    await pool.end();
  }
}

migrate();
