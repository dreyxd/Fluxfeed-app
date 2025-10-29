import 'dotenv/config';
import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
});

async function initWaitlistTable() {
  try {
    console.log('🔧 Creating waitlist table...');

    // Create waitlist table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS waitlist (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255) UNIQUE NOT NULL,
        created_at TIMESTAMP DEFAULT NOW()
      )
    `);

    console.log('✅ Waitlist table created successfully!');

    // Check if table exists and show count
    const result = await pool.query('SELECT COUNT(*) FROM waitlist');
    console.log(`📊 Current waitlist count: ${result.rows[0].count}`);

  } catch (error) {
    console.error('❌ Error creating waitlist table:', error);
  } finally {
    await pool.end();
  }
}

initWaitlistTable();
