import pg from 'pg';

const { Pool } = pg;

// Automatically handle either Render's DATABASE_URL or our local docker-compose variables
const poolConfig = process.env.DATABASE_URL 
  ? { 
      connectionString: process.env.DATABASE_URL,
      ssl: { rejectUnauthorized: false } 
    }
  : {
      host: process.env.DB_HOST || 'localhost',
      user: process.env.DB_USER || 'postgres',
      password: process.env.DB_PASSWORD || 'secret',
      database: process.env.DB_NAME || 'checkboxes',
      port: process.env.DB_PORT || 5432,
    };

const pool = new Pool(poolConfig);

/**
 * Retries the database connection until it is successful.
 * This prevents the app from crashing if it starts faster than the Postgres container.
 */
export async function initDB() {
  let initialized = false;
  
  console.log("Connecting to database...");

  while (!initialized) {
    try {
      await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
          id SERIAL PRIMARY KEY,
          username VARCHAR(50) UNIQUE NOT NULL,
          password_hash VARCHAR(255) NOT NULL
        );
      `);
      console.log("✅ Database connected and initialized.");
      initialized = true;
    } catch (err) {
      console.error("⏳ Database not ready yet, retrying in 2 seconds...");
      // Wait for 2 seconds before retrying
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }
}

export default pool;
