const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL connection pool
const pool = new Pool({
  connectionString: 'postgresql://abcxyz_db_user:FCmImoRGpfpXhZ5MCwxUw0X9QQAUC61s@dpg-d4ejq5idbo4c73di9asg-a.oregon-postgres.render.com/abcxyz_db',
  ssl: {
    rejectUnauthorized: false
  },
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000,
});

// Test database connection
pool.on('connect', () => {
  console.log('✅ Connected to PostgreSQL database');
});

pool.on('error', (err) => {
  console.error('❌ PostgreSQL pool error:', err);
});

// Initialize database tables
async function initializeDatabase() {
  try {
    // Drop and recreate tables to fix constraints
    await pool.query('DROP TABLE IF EXISTS orders CASCADE');
    await pool.query('DROP TABLE IF EXISTS plugins CASCADE');
    await pool.query('DROP TABLE IF EXISTS feedback CASCADE');
    await pool.query('DROP TABLE IF EXISTS admin_users CASCADE');
    await pool.query('DROP TABLE IF EXISTS users CASCADE');

    // Create plugins table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS plugins (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        description TEXT,
        image_url TEXT,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_active BOOLEAN DEFAULT true
      )
    `);

    // Create feedback table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS feedback (
        id SERIAL PRIMARY KEY,
        message TEXT NOT NULL,
        user_email VARCHAR(255),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create orders table với constraint đơn giản hơn
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        plugin_id INTEGER,
        customer_email VARCHAR(255) NOT NULL,
        customer_name VARCHAR(255),
        status VARCHAR(50) DEFAULT 'pending',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create admin_users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS admin_users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Create users table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        email VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Insert default plugins if they don't exist
    const pluginsCheck = await pool.query('SELECT COUNT(*) FROM plugins');
    if (parseInt(pluginsCheck.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO plugins (name, price, description, image_url) VALUES
        ('Shopbank System', 500000, 'Hệ thống shop bank hiện đại chơi mini game casino ngay trong mindustry, hệ thống ngân hàng hiện đại, chuyển khoản vay vốn , credit card', 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=400'),
        ('Trust System', 200000, 'Hệ thống anti grifer với lưu data của từng người chơi và hệ thống uy tín đánh giá từng người chơi và các mốc phạt khác nhau và ban vĩnh viễn', 'https://images.unsplash.com/photo-1563013544-824ae1b704d3?w=400'),
        ('Cheat Menu', 150000, 'Hệ thống cheat menu dành riêng cho chủ server admin không thể can thiệp', 'https://images.unsplash.com/photo-1542751371-adc38448a05e?w=400')
      `);
      console.log('✅ Default plugins inserted');
    }

    // Tạo password hash mới cho owner
    const plainPassword = '0796438068';
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(plainPassword, saltRounds);

    // Insert hoặc update admin user
    const adminCheck = await pool.query('SELECT COUNT(*) FROM admin_users WHERE username = $1', ['owner']);
    if (parseInt(adminCheck.rows[0].count) === 0) {
      await pool.query(
        'INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)',
        ['owner', passwordHash]
      );
      console.log('✅ Owner admin user created with new password');
    } else {
      // Update password hash nếu user đã tồn tại
      await pool.query(
        'UPDATE admin_users SET password_hash = $1 WHERE username = $2',
        [passwordHash, 'owner']
      );
      console.log('✅ Owner admin password updated');
    }

    console.log('🔑 Admin credentials: username="owner", password="0796438068"');
    console.log('✅ Database initialization completed');

  } catch (error) {
    console.error('❌ Database initialization error:', error);
  }
}

// Middleware
app.use(cors());
app.use(express.json());

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

// ==================== ROUTES ====================

// Health check
app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ 
      status: 'OK', 
      message: 'ABCXYZ Server API is running',
      timestamp: new Date().toISOString(),
      database: 'PostgreSQL (Connected)',
      admin: 'owner/0796438068'
    });
  } catch (error) {
    res.status(500).json({ 
      status: 'ERROR', 
      message: 'Database connection failed',
      error: error.message 
    });
  }
});

// ==================== USER ROUTES ====================

// User registration
app.post('/api/users/register', async (req, res) => {
  try {
    const { name, email, password } = req.body;

    console.log('User registration attempt:', { name, email });

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email and password are required' });
    }

    // Check if user already exists
    const existingUser = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (existingUser.rows.length > 0) {
      return res.status(400).json({ error: 'User already exists with this email' });
    }

    // Hash password
    const saltRounds = 12;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    // Create user
    const result = await pool.query(
      'INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3) RETURNING id, name, email, created_at',
      [name.trim(), email.trim(), passwordHash]
    );

    const user = result.rows[0];

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'abcxyz_secret',
      { expiresIn: '30d' }
    );

    res.status(201).json({
      message: 'User registered successfully',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('User registration error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// User login
app.post('/api/users/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    console.log('User login attempt:', { email });

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }

    // Find user
    const userResult = await pool.query(
      'SELECT * FROM users WHERE email = $1',
      [email]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];

    // Verify password
    const validPassword = await bcrypt.compare(password, user.password_hash);

    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Generate JWT token
    const token = jwt.sign(
      { id: user.id, email: user.email },
      process.env.JWT_SECRET || 'abcxyz_secret',
      { expiresIn: '30d' }
    );

    res.json({
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    console.error('User login error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Get user's orders - FIXED VERSION
app.get('/api/users/orders', authenticateToken, async (req, res) => {
  try {
    const userId = req.user.id;

    console.log('Getting orders for user ID:', userId);

    // Get user email first
    const userResult = await pool.query('SELECT email FROM users WHERE id = $1', [userId]);
    
    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'User not found' });
    }

    const userEmail = userResult.rows[0].email;

    console.log('User email found:', userEmail);

    const result = await pool.query(`
      SELECT o.*, p.name as plugin_name, p.price, p.image_url
      FROM orders o 
      LEFT JOIN plugins p ON o.plugin_id = p.id 
      WHERE o.customer_email = $1
      ORDER BY o.created_at DESC
    `, [userEmail]);

    console.log('User orders found:', result.rows.length);

    res.json(result.rows);
  } catch (error) {
    console.error('Get user orders error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// ==================== ADMIN ROUTES ====================

// Owner login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    console.log('Admin login attempt:', { username });

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    const userResult = await pool.query(
      'SELECT * FROM admin_users WHERE username = $1',
      [username]
    );

    if (userResult.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = userResult.rows[0];
    
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
    console.error('Admin login error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
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
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Add new plugin (Owner only) - FIXED VERSION
app.post('/api/plugins', authenticateToken, async (req, res) => {
  try {
    const { name, price, description, image_url } = req.body;

    console.log('Add plugin request:', { name, price, description, image_url });

    // Check if all required fields are present and not empty
    if (!name || name.trim() === '' || !price || !description || description.trim() === '') {
      return res.status(400).json({ 
        error: 'Name, price and description are required',
        received: { name, price, description }
      });
    }

    // Validate price is a number
    const priceNum = parseFloat(price);
    if (isNaN(priceNum) || priceNum <= 0) {
      return res.status(400).json({ error: 'Price must be a positive number' });
    }

    const result = await pool.query(
      'INSERT INTO plugins (name, price, description, image_url) VALUES ($1, $2, $3, $4) RETURNING *',
      [name.trim(), priceNum, description.trim(), image_url || null]
    );

    res.status(201).json({
      message: 'Plugin added successfully',
      plugin: result.rows[0]
    });
  } catch (error) {
    console.error('Add plugin error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Delete plugin (Owner only) - HARD DELETE
app.delete('/api/plugins/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    
    console.log('Delete plugin request:', { id });

    // First check if plugin exists
    const pluginCheck = await pool.query('SELECT * FROM plugins WHERE id = $1', [id]);
    
    if (pluginCheck.rows.length === 0) {
      return res.status(404).json({ error: 'Plugin not found' });
    }

    // Delete plugin (hard delete)
    await pool.query('DELETE FROM plugins WHERE id = $1', [id]);
    
    res.json({
      message: 'Plugin deleted successfully',
      deletedPlugin: pluginCheck.rows[0]
    });
  } catch (error) {
    console.error('Delete plugin error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// ==================== FEEDBACK ROUTES ====================

// Submit feedback
app.post('/api/feedback', async (req, res) => {
  try {
    const { message, email } = req.body;

    if (!message || message.trim() === '') {
      return res.status(400).json({ error: 'Message is required' });
    }

    const result = await pool.query(
      'INSERT INTO feedback (message, user_email) VALUES ($1, $2) RETURNING *',
      [message.trim(), email || null]
    );

    res.status(201).json({ 
      message: 'Feedback submitted successfully',
      id: result.rows[0].id
    });
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// ==================== ORDER ROUTES ====================

// Get orders (Owner only)
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query(`
      SELECT o.*, p.name as plugin_name, p.price, p.image_url
      FROM orders o 
      LEFT JOIN plugins p ON o.plugin_id = p.id 
      ORDER BY o.created_at DESC
    `);
    res.json(result.rows);
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Create order
app.post('/api/orders', async (req, res) => {
  try {
    const { plugin_id, customer_email, customer_name } = req.body;

    console.log('Create order request:', { plugin_id, customer_email, customer_name });

    if (!customer_email || customer_email.trim() === '') {
      return res.status(400).json({ error: 'Customer email is required' });
    }

    const result = await pool.query(
      'INSERT INTO orders (plugin_id, customer_email, customer_name) VALUES ($1, $2, $3) RETURNING *',
      [plugin_id || null, customer_email.trim(), customer_name || 'Customer']
    );

    res.status(201).json({
      message: 'Order created successfully',
      order: result.rows[0]
    });
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Get feedback (Owner only)
app.get('/api/feedback', authenticateToken, async (req, res) => {
  try {
    const result = await pool.query('SELECT * FROM feedback ORDER BY created_at DESC');
    res.json(result.rows);
  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Get stats (Owner only)
app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    const pluginsCount = await pool.query('SELECT COUNT(*) FROM plugins WHERE is_active = true');
    const ordersCount = await pool.query('SELECT COUNT(*) FROM orders');
    const feedbackCount = await pool.query('SELECT COUNT(*) FROM feedback');
    const usersCount = await pool.query('SELECT COUNT(*) FROM users');

    res.json({
      plugins: parseInt(pluginsCount.rows[0].count),
      orders: parseInt(ordersCount.rows[0].count),
      feedback: parseInt(feedbackCount.rows[0].count),
      users: parseInt(usersCount.rows[0].count)
    });
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// Update order status (Owner only)
app.patch('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    console.log('Update order request:', { id, status });
    
    if (!status || !['pending', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ 
        error: 'Invalid status',
        validStatuses: ['pending', 'completed', 'cancelled'],
        received: status 
      });
    }
    
    const result = await pool.query(
      'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
      [status, parseInt(id)]
    );
    
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    res.json({
      message: 'Order status updated successfully',
      order: result.rows[0]
    });
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ error: 'Internal server error: ' + error.message });
  }
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: '🚀 ABCXYZ Server API',
    version: '2.2.0',
    admin: 'owner/0796438068',
    database: 'PostgreSQL (Connected)',
    status: '✅ Fully Operational',
    features: [
      'User Authentication',
      'Plugin Management', 
      'Order System',
      'Admin Panel',
      'Feedback System',
      'Plugin Images',
      'Hard Delete'
    ],
    endpoints: {
      health: '/api/health',
      users: {
        register: '/api/users/register',
        login: '/api/users/login',
        orders: '/api/users/orders'
      },
      admin: {
        login: '/api/admin/login',
        plugins: '/api/plugins (GET, POST, DELETE)',
        orders: '/api/orders',
        stats: '/api/stats'
      },
      public: {
        plugins: '/api/plugins (GET)',
        feedback: '/api/feedback (POST)',
        orders: '/api/orders (POST)'
      }
    }
  });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error: ' + error.message });
});

// Start server với database initialization
async function startServer() {
  try {
    // Test database connection
    await pool.query('SELECT 1');
    console.log('✅ Database connection test passed');
    
    // Initialize database tables (with fresh start)
    console.log('🔄 Initializing database tables...');
    await initializeDatabase();
    
    // Start server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Local: http://localhost:${PORT}`);
      console.log(`📊 Health: https://abcxyz-backend-9yxb.onrender.com/api/health`);
      console.log(`🔑 Admin Login: https://abcxyz-backend-9yxb.onrender.com/api/admin/login`);
      console.log(`👤 User Register: https://abcxyz-backend-9yxb.onrender.com/api/users/register`);
      console.log(`🔑 Admin Credentials: username="owner", password="0796438068"`);
      console.log(`✅ Server is fully operational with ALL FIXES!`);
      console.log(`🔧 Fixed Issues:`);
      console.log(`   ✅ User authentication fixed`);
      console.log(`   ✅ Plugin validation improved`);
      console.log(`   ✅ Better error handling`);
      console.log(`   ✅ Input trimming added`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
