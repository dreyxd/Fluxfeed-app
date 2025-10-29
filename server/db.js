import { Pool } from 'pg';
// Validate environment variables
if (!process.env.DB_HOST || !process.env.DB_USER || !process.env.DB_PASSWORD) {
    console.error('❌ Missing required database environment variables!');
    console.error('DB_HOST:', process.env.DB_HOST);
    console.error('DB_USER:', process.env.DB_USER);
    console.error('DB_NAME:', process.env.DB_NAME);
    throw new Error('Database configuration is incomplete');
}
const pool = new Pool({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 25060,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME || 'defaultdb',
    ssl: process.env.DB_SSL === 'true' ? { rejectUnauthorized: false } : false,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000, // Increased to 10 seconds
});
// Test connection on startup
pool.on('connect', (client) => {
    console.log('✅ Connected to PostgreSQL database at', process.env.DB_HOST);
    console.log('📊 Database:', process.env.DB_NAME);
});
pool.on('error', (err) => {
    console.error('❌ Unexpected error on idle PostgreSQL client', err);
    console.error('Connection details:', {
        host: process.env.DB_HOST,
        port: process.env.DB_PORT,
        database: process.env.DB_NAME,
        user: process.env.DB_USER
    });
});
// Test the connection immediately
pool.query('SELECT NOW() as now, current_database() as db, current_user as user')
    .then(result => {
    console.log('🎉 Database connection verified!');
    console.log('   Time:', result.rows[0].now);
    console.log('   Database:', result.rows[0].db);
    console.log('   User:', result.rows[0].user);
})
    .catch(err => {
    console.error('❌ Failed to connect to database:', err.message);
    console.error('   Make sure DigitalOcean database is accessible');
    process.exit(1);
});
export default pool;
