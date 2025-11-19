const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Database connection với Supabase
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { 
    rejectUnauthorized: false 
  }
});

// Test database connection
const testConnection = async () => {
  try {
    const client = await pool.connect();
    const result = await client.query('SELECT NOW() as time, version() as version');
    console.log('✅ Supabase Database Connected Successfully!');
    console.log('📅 Time:', result.rows[0].time);
    console.log('🗄️ Database Version:', result.rows[0].version.split(',')[0]);
    client.release();
  } catch (err) {
    console.error('❌ Database Connection Failed:', err.message);
  }
};

testConnection();

// Initialize database tables
const initDatabase = async () => {
  try {
    // Admin users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(50) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Plugins table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS plugins (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        description TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true
      )
    `);

    // Feedback table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        message TEXT NOT NULL,
        user_email VARCHAR(100),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Orders table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        plugin_id INTEGER REFERENCES plugins(id),
        customer_email VARCHAR(100) NOT NULL,
        customer_name VARCHAR(100),
        status VARCHAR(20) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create default admin user
    const hashedPassword = await bcrypt.hash('123456', 10);
    await pool.query(`
      INSERT INTO admin_users (username, password_hash) 
      VALUES ('admin', $1) 
      ON CONFLICT (username) DO NOTHING
    `, [hashedPassword]);

    // Insert sample plugins
    await pool.query(`
      INSERT INTO plugins (name, price, description) 
      VALUES 
        ('Auto Factory', 150000, 'Tự động hóa hệ thống sản xuất trong game, tối ưu hiệu suất'),
        ('Advanced Defense', 200000, 'Hệ thống phòng thủ thông minh với AI tiên tiến'),
        ('Statistics Pro', 100000, 'Theo dõi và phân tích chi tiết hiệu suất game')
      ON CONFLICT DO NOTHING
    `);

    console.log('✅ Database initialized successfully');

  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
};

initDatabase();

// Authentication middleware
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }

  jwt.verify(token, process.env.JWT_SECRET || 'abcxyz_secret', (err, user) => {
    if (err) {
      return res.status(403).json({ error: 'Invalid token' });
    }
    req.user = user;
    next();
  });
};

// Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'ABCXYZ Server API is running',
    timestamp: new Date().toISOString()
  });
});

// Test database connection
app.get('/api/test-db', async (req, res) => {
  try {
    const result = await pool.query('SELECT NOW() as current_time, version() as version');
    res.json({
      status: 'success',
      message: '✅ Connected to Supabase PostgreSQL',
      database: {
        time: result.rows[0].current_time,
        version: result.rows[0].version.split(',')[0]
      },
      project: 'abcxyz-server'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: '❌ Database connection failed',
      error: error.message
    });
  }
});

// Admin login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const result = await pool.query(
      'SELECT * FROM admin_users WHERE username = $1',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = result.rows[0];
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign(
      { id: user.id, username: user.username },
      process.env.JWT_SECRET || 'abcxyz_secret',
      { expiresIn: '24h' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: { id: user.id, username: user.username }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all plugins
app.get('/api/plugins', async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM plugins WHERE is_active = true ORDER BY created_at DESC'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get plugins error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add new plugin (Admin only)
app.post('/api/plugins', authenticateToken, async (req, res) => {
  try {
    const { name, price, description } = req.body;

    if (!name || !price || !description) {
      return res.status(400).json({ error: 'Name, price and description are required' });
    }

    const result = await pool.query(
      'INSERT INTO plugins (name, price, description) VALUES ($1, $2, $3) RETURNING *',
      [name, parseFloat(price), description]
    );

    res.status(201).json({
      message: 'Plugin added successfully',
      plugin: result.rows[0]
    });
  } catch (error) {
    console.error('Add plugin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Submit feedback
app.post('/api/feedback', async (req, res) => {
  try {
    const { message, email } = req.body;

    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    await pool.query(
      'INSERT INTO feedback (message, user_email) VALUES ($1, $2)',
      [message, email || null]
    );

    res.status(201).json({ message: 'Feedback submitted successfully' });
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get orders (Admin only)
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT o.*, p.name as plugin_name, p.price 
      FROM orders o 
      LEFT JOIN plugins p ON o.plugin_id = p.id 
      ORDER BY o.created_at DESC
      LIMIT 50
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Create order
app.post('/api/orders', async (req, res) => {
  try {
    const { plugin_id, customer_email, customer_name } = req.body;

    if (!customer_email) {
      return res.status(400).json({ error: 'Customer email is required' });
    }

    const result = await pool.query(
      'INSERT INTO orders (plugin_id, customer_email, customer_name) VALUES ($1, $2, $3) RETURNING *',
      [plugin_id, customer_email, customer_name || 'Customer']
    );

    res.status(201).json({
      message: 'Order created successfully',
      order: result.rows[0]
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get feedback (Admin only)
app.get('/api/feedback', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(
      'SELECT * FROM feedback ORDER BY created_at DESC LIMIT 50'
    );
    res.json(result.rows);
  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// 404 handler
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 API Health: http://localhost:${PORT}/api/health`);
  console.log(`🗄️ DB Test: http://localhost:${PORT}/api/test-db`);
});
