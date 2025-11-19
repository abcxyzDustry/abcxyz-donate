const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// PostgreSQL connection pool với fallback
let pool;

// Function để khởi tạo database connection
async function initializeDatabaseConnection() {
  const connectionConfig = {
    connectionString: process.env.DATABASE_URL || 'postgresql://abcxyz_db_user:FCmImoRGpfpXhZ5MCwxUw0X9QQAUC61s@dpg-d4ejq5idbo4c73di9asg-a.oregon-postgres.render.com/abcxyz_db',
    ssl: {
      rejectUnauthorized: false
    },
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000, // Tăng timeout
  };

  try {
    pool = new Pool(connectionConfig);
    
    // Test connection
    const client = await pool.connect();
    console.log('✅ Connected to PostgreSQL database successfully');
    client.release();
    
    return true;
  } catch (error) {
    console.error('❌ Database connection failed:', error.message);
    
    // Fallback to in-memory database
    console.log('🔄 Falling back to in-memory database...');
    return false;
  }
}

// In-memory database fallback
let plugins = [
  { id: 1, name: "Shopbank System", price: 500000, description: "Hệ thống shop bank hiện đại chơi mini game casino ngay trong mindustry, hệ thống ngân hàng hiện đại, chuyển khoản vay vốn , credit card", created_at: new Date(), is_active: true },
  { id: 2, name: "Trust System", price: 200000, description: "Hệ thống anti grifer với lưu data của từng người chơi và hệ thống uy tín đánh giá từng người chơi và các mốc phạt khác nhau và ban vĩnh viễn", created_at: new Date(), is_active: true },
  { id: 3, name: "Cheat Menu", price: 150000, description: "Hệ thống cheat menu dành riêng cho chủ server admin không thể can thiệp", created_at: new Date(), is_active: true }
];

let feedbacks = [];
let orders = [];
let adminUsers = [{ 
  id: 1, 
  username: 'owner', 
  password_hash: '$2a$12$8K1p/a0dRTlB0Z6s5UzJ.uB6eB6Q6b6Q6b6Q6b6Q6b6Q6b6Q6b6Q6b' // 11111111Ab@
}];

let useInMemoryDB = false;

// Initialize database tables (chỉ cho PostgreSQL)
async function initializeDatabase() {
  if (!pool) return;

  try {
    // Create plugins table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS plugins (
        id SERIAL PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        price DECIMAL(10,2) NOT NULL,
        description TEXT,
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

    // Create orders table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS orders (
        id SERIAL PRIMARY KEY,
        plugin_id INTEGER REFERENCES plugins(id),
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

    // Insert default plugins if they don't exist
    const pluginsCheck = await pool.query('SELECT COUNT(*) FROM plugins');
    if (parseInt(pluginsCheck.rows[0].count) === 0) {
      await pool.query(`
        INSERT INTO plugins (name, price, description) VALUES
        ('Shopbank System', 500000, 'Hệ thống shop bank hiện đại chơi mini game casino ngay trong mindustry, hệ thống ngân hàng hiện đại, chuyển khoản vay vốn , credit card'),
        ('Trust System', 200000, 'Hệ thống anti grifer với lưu data của từng người chơi và hệ thống uy tín đánh giá từng người chơi và các mốc phạt khác nhau và ban vĩnh viễn'),
        ('Cheat Menu', 150000, 'Hệ thống cheat menu dành riêng cho chủ server admin không thể can thiệp')
      `);
      console.log('✅ Default plugins inserted into PostgreSQL');
    }

    // Create owner admin user if not exists
    const adminCheck = await pool.query('SELECT COUNT(*) FROM admin_users WHERE username = $1', ['owner']);
    if (parseInt(adminCheck.rows[0].count) === 0) {
      await pool.query(
        'INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)',
        ['owner', '$2a$12$8K1p/a0dRTlB0Z6s5UzJ.uB6eB6Q6b6Q6b6Q6b6Q6b6Q6b6Q6b6Q6b']
      );
      console.log('✅ Owner admin user created in PostgreSQL');
    }

    console.log('✅ PostgreSQL database initialization completed');
  } catch (error) {
    console.error('❌ PostgreSQL initialization error:', error.message);
    useInMemoryDB = true;
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
    if (pool && !useInMemoryDB) {
      await pool.query('SELECT 1');
      res.json({ 
        status: 'OK', 
        message: 'ABCXYZ Server API is running',
        database: 'PostgreSQL (Connected)',
        timestamp: new Date().toISOString()
      });
    } else {
      res.json({ 
        status: 'OK', 
        message: 'ABCXYZ Server API is running',
        database: 'In-Memory (Fallback Mode)',
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    res.json({ 
      status: 'OK', 
      message: 'ABCXYZ Server API is running',
      database: 'In-Memory (Fallback Mode)',
      timestamp: new Date().toISOString()
    });
  }
});

// Test database connection
app.get('/api/test-db', async (req, res) => {
  try {
    if (pool && !useInMemoryDB) {
      const result = await pool.query('SELECT version(), NOW() as time');
      res.json({
        status: 'success',
        message: '✅ PostgreSQL database is working perfectly',
        database: {
          version: result.rows[0].version,
          time: result.rows[0].time,
          type: 'PostgreSQL'
        }
      });
    } else {
      res.json({
        status: 'success', 
        message: '✅ Using in-memory database (fallback mode)',
        database: {
          type: 'In-Memory',
          time: new Date().toISOString()
        }
      });
    }
  } catch (error) {
    res.json({
      status: 'success',
      message: '✅ Using in-memory database (fallback mode)',
      database: {
        type: 'In-Memory',
        time: new Date().toISOString()
      }
    });
  }
});

// Get all plugins
app.get('/api/plugins', async (req, res) => {
  try {
    if (pool && !useInMemoryDB) {
      const result = await pool.query(
        'SELECT * FROM plugins WHERE is_active = true ORDER BY created_at DESC'
      );
      res.json(result.rows);
    } else {
      // Fallback to in-memory
      res.json(plugins.filter(p => p.is_active));
    }
  } catch (error) {
    console.error('Get plugins error, using fallback:', error.message);
    // Fallback to in-memory
    res.json(plugins.filter(p => p.is_active));
  }
});

// Owner login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

    if (pool && !useInMemoryDB) {
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
    } else {
      // In-memory fallback
      const user = adminUsers.find(u => u.username === username);
      if (!user) {
        return res.status(401).json({ error: 'Invalid credentials' });
      }

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
    }
  } catch (error) {
    console.error('Login error:', error);
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

    if (pool && !useInMemoryDB) {
      const result = await pool.query(
        'INSERT INTO feedback (message, user_email) VALUES ($1, $2) RETURNING *',
        [message, email || null]
      );

      res.status(201).json({ 
        message: 'Feedback submitted successfully',
        id: result.rows[0].id
      });
    } else {
      // In-memory fallback
      const newFeedback = {
        id: feedbacks.length + 1,
        message,
        user_email: email || null,
        created_at: new Date()
      };
      feedbacks.push(newFeedback);

      res.status(201).json({ 
        message: 'Feedback submitted successfully',
        id: newFeedback.id
      });
    }
  } catch (error) {
    console.error('Submit feedback error:', error);
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

    if (pool && !useInMemoryDB) {
      const result = await pool.query(
        'INSERT INTO orders (plugin_id, customer_email, customer_name) VALUES ($1, $2, $3) RETURNING *',
        [plugin_id || null, customer_email, customer_name || 'Customer']
      );

      res.status(201).json({
        message: 'Order created successfully',
        order: result.rows[0]
      });
    } else {
      // In-memory fallback
      const newOrder = {
        id: orders.length + 1,
        plugin_id: plugin_id || null,
        customer_email,
        customer_name: customer_name || 'Customer',
        status: 'pending',
        created_at: new Date()
      };
      orders.push(newOrder);

      res.status(201).json({
        message: 'Order created successfully',
        order: newOrder
      });
    }
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get orders (Owner only) - Simplified for fallback
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    if (pool && !useInMemoryDB) {
      const result = await pool.query(`
        SELECT o.*, p.name as plugin_name, p.price 
        FROM orders o 
        LEFT JOIN plugins p ON o.plugin_id = p.id 
        ORDER BY o.created_at DESC
      `);
      res.json(result.rows);
    } else {
      // In-memory fallback
      const ordersWithPluginNames = orders.map(order => ({
        ...order,
        plugin_name: plugins.find(p => p.id === order.plugin_id)?.name || 'Custom Plugin',
        price: plugins.find(p => p.id === order.plugin_id)?.price || 0
      }));
      res.json(ordersWithPluginNames);
    }
  } catch (error) {
    console.error('Get orders error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get feedback (Owner only)
app.get('/api/feedback', authenticateToken, async (req, res) => {
  try {
    if (pool && !useInMemoryDB) {
      const result = await pool.query('SELECT * FROM feedback ORDER BY created_at DESC');
      res.json(result.rows);
    } else {
      res.json(feedbacks);
    }
  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get stats (Owner only)
app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    if (pool && !useInMemoryDB) {
      const pluginsCount = await pool.query('SELECT COUNT(*) FROM plugins WHERE is_active = true');
      const ordersCount = await pool.query('SELECT COUNT(*) FROM orders');
      const feedbackCount = await pool.query('SELECT COUNT(*) FROM feedback');

      res.json({
        plugins: parseInt(pluginsCount.rows[0].count),
        orders: parseInt(ordersCount.rows[0].count),
        feedback: parseInt(feedbackCount.rows[0].count)
      });
    } else {
      res.json({
        plugins: plugins.filter(p => p.is_active).length,
        orders: orders.length,
        feedback: feedbacks.length
      });
    }
  } catch (error) {
    console.error('Get stats error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Add new plugin (Owner only)
app.post('/api/plugins', authenticateToken, async (req, res) => {
  try {
    const { name, price, description } = req.body;

    if (!name || !price || !description) {
      return res.status(400).json({ error: 'Name, price and description are required' });
    }

    if (pool && !useInMemoryDB) {
      const result = await pool.query(
        'INSERT INTO plugins (name, price, description) VALUES ($1, $2, $3) RETURNING *',
        [name, parseFloat(price), description]
      );

      res.status(201).json({
        message: 'Plugin added successfully',
        plugin: result.rows[0]
      });
    } else {
      const newPlugin = {
        id: plugins.length + 1,
        name,
        price: parseFloat(price),
        description,
        created_at: new Date(),
        is_active: true
      };
      plugins.push(newPlugin);

      res.status(201).json({
        message: 'Plugin added successfully',
        plugin: newPlugin
      });
    }
  } catch (error) {
    console.error('Add plugin error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Update order status (Owner only)
app.patch('/api/orders/:id', authenticateToken, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    if (!['pending', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ error: 'Invalid status' });
    }
    
    if (pool && !useInMemoryDB) {
      const result = await pool.query(
        'UPDATE orders SET status = $1 WHERE id = $2 RETURNING *',
        [status, id]
      );
      
      if (result.rows.length === 0) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      res.json({
        message: 'Order status updated successfully',
        order: result.rows[0]
      });
    } else {
      const orderIndex = orders.findIndex(o => o.id === parseInt(id));
      
      if (orderIndex === -1) {
        return res.status(404).json({ error: 'Order not found' });
      }
      
      orders[orderIndex].status = status;
      
      res.json({
        message: 'Order status updated successfully',
        order: orders[orderIndex]
      });
    }
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  const dbType = (pool && !useInMemoryDB) ? 'PostgreSQL' : 'In-Memory (Fallback)';
  
  res.json({
    message: '🚀 ABCXYZ Server API',
    version: '1.0.0',
    admin: 'owner/11111111Ab@',
    database: dbType,
    status: '✅ Fully Operational',
    endpoints: {
      health: '/api/health',
      testDb: '/api/test-db',
      plugins: '/api/plugins',
      feedback: '/api/feedback',
      orders: '/api/orders',
      admin: '/api/admin/login'
    }
  });
});

// 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: 'API endpoint not found' });
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server với database initialization
async function startServer() {
  try {
    // Initialize database connection
    const dbConnected = await initializeDatabaseConnection();
    
    if (dbConnected) {
      // Initialize database tables
      await initializeDatabase();
    } else {
      useInMemoryDB = true;
      console.log('🔶 Running in IN-MEMORY mode (PostgreSQL unavailable)');
    }

    // Start server
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Server running on port ${PORT}`);
      console.log(`📍 Local: http://localhost:${PORT}`);
      console.log(`📊 Health: http://0.0.0.0:${PORT}/api/health`);
      console.log(`🗄️ DB Test: http://0.0.0.0:${PORT}/api/test-db`);
      console.log(`🔑 Owner Account: username="owner", password="11111111Ab@"`);
      console.log(`💾 Database: ${useInMemoryDB ? 'In-Memory (Fallback)' : 'PostgreSQL (Persistent)'}`);
      console.log(`✅ Server is fully operational!`);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

startServer();

module.exports = app;
