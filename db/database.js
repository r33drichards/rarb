import pg from 'pg';
const { Pool } = pg;

let pool = null;

/**
 * Initialize the PostgreSQL connection pool
 */
export function initializeDatabase() {
  if (pool) {
    console.log('✓ Database pool already initialized');
    return pool;
  }

  const config = {
    host: process.env.DB_HOST || 'postgres',
    port: parseInt(process.env.DB_PORT || '5432'),
    database: process.env.DB_NAME || 'rarb_outputs',
    user: process.env.DB_USER || 'sandbox',
    password: process.env.DB_PASSWORD || 'CHANGE_ME',
    max: 10, // Maximum number of clients in the pool
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  };

  pool = new Pool(config);

  // Handle pool errors
  pool.on('error', (err) => {
    console.error('Unexpected database pool error:', err);
  });

  console.log(`✓ Database pool initialized (${config.host}:${config.port}/${config.database})`);
  return pool;
}

/**
 * Get the database pool instance
 */
export function getPool() {
  if (!pool) {
    return initializeDatabase();
  }
  return pool;
}

/**
 * Close the database pool
 */
export async function closeDatabase() {
  if (pool) {
    await pool.end();
    pool = null;
    console.log('✓ Database pool closed');
  }
}

/**
 * Save an output item to the database
 * Automatically handles duplicates using content_hash
 *
 * @param {Object} item - The item to save
 * @param {string} item.title - Title of the item (required)
 * @param {string} [item.description] - Description of the item
 * @param {string} [item.url] - URL of the item
 * @param {string} [item.category] - Category of the item
 * @returns {Promise<Object>} The saved item with id and timestamps
 */
export async function saveOutput(item) {
  const { title, description, url, category } = item;

  if (!title) {
    throw new Error('Title is required');
  }

  const client = await getPool().connect();
  try {
    // Try to insert, ignore if duplicate based on content_hash
    const result = await client.query(
      `INSERT INTO agent_outputs (title, description, url, category)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (content_hash) DO UPDATE
       SET updated_at = CURRENT_TIMESTAMP
       RETURNING id, title, description, url, category, created_at, updated_at`,
      [title, description || null, url || null, category || null]
    );

    return result.rows[0];
  } finally {
    client.release();
  }
}

/**
 * Save multiple output items to the database in a single transaction
 *
 * @param {Array<Object>} items - Array of items to save
 * @returns {Promise<Object>} Summary of saved items
 */
export async function saveOutputBatch(items) {
  if (!Array.isArray(items) || items.length === 0) {
    throw new Error('Items must be a non-empty array');
  }

  const client = await getPool().connect();
  try {
    await client.query('BEGIN');

    const results = {
      saved: 0,
      updated: 0,
      failed: 0,
      errors: []
    };

    for (const item of items) {
      try {
        const result = await client.query(
          `INSERT INTO agent_outputs (title, description, url, category)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (content_hash) DO UPDATE
           SET updated_at = CURRENT_TIMESTAMP
           RETURNING id, created_at, updated_at`,
          [item.title, item.description || null, item.url || null, item.category || null]
        );

        const row = result.rows[0];
        // Check if it's a new insert or update based on timestamps
        if (row.created_at.getTime() === row.updated_at.getTime()) {
          results.saved++;
        } else {
          results.updated++;
        }
      } catch (error) {
        results.failed++;
        results.errors.push({
          item: item.title,
          error: error.message
        });
      }
    }

    await client.query('COMMIT');
    return results;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Get recent outputs from the database
 *
 * @param {number} [limit=100] - Maximum number of items to return
 * @param {number} [days=7] - Number of days to look back
 * @returns {Promise<Array>} Array of output items
 */
export async function getRecentOutputs(limit = 100, days = 7) {
  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT id, title, description, url, category, created_at, updated_at
       FROM agent_outputs
       WHERE created_at >= CURRENT_DATE - INTERVAL '${days} days'
       ORDER BY created_at DESC
       LIMIT $1`,
      [limit]
    );

    return result.rows;
  } finally {
    client.release();
  }
}

/**
 * Check if an item exists by URL
 *
 * @param {string} url - URL to check
 * @returns {Promise<boolean>} True if exists, false otherwise
 */
export async function itemExists(url) {
  if (!url) {
    return false;
  }

  const client = await getPool().connect();
  try {
    const result = await client.query(
      `SELECT 1 FROM agent_outputs WHERE url = $1 LIMIT 1`,
      [url]
    );

    return result.rows.length > 0;
  } finally {
    client.release();
  }
}

/**
 * Initialize the database schema
 * This should be called once during setup
 */
export async function initializeSchema() {
  const client = await getPool().connect();
  try {
    // Read and execute schema file
    const fs = await import('fs');
    const path = await import('path');
    const { fileURLToPath } = await import('url');

    const __filename = fileURLToPath(import.meta.url);
    const __dirname = path.dirname(__filename);
    const schemaPath = path.join(__dirname, 'schema.sql');

    const schema = fs.readFileSync(schemaPath, 'utf8');
    await client.query(schema);

    console.log('✓ Database schema initialized');
  } catch (error) {
    console.error('Failed to initialize schema:', error.message);
    throw error;
  } finally {
    client.release();
  }
}

/**
 * Test the database connection
 */
export async function testConnection() {
  const client = await getPool().connect();
  try {
    const result = await client.query('SELECT NOW()');
    console.log('✓ Database connection successful:', result.rows[0].now);
    return true;
  } catch (error) {
    console.error('✗ Database connection failed:', error.message);
    return false;
  } finally {
    client.release();
  }
}
