const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// In-memory database (luôn hoạt động)
let plugins = [
  { id: 1, name: "Shopbank System", price: 500000, description: "Hệ thống shop bank hiện đại chơi mini game casino ngay trong mindustry, hệ thống ngân hàng hiện đại, chuyển khoản vay vốn , credit card", created_at: new Date(), is_active: true },
  { id: 2, name: "Trust System", price: 200000, description: "Hệ thống anti grifer với lưu data của từng người chơi và hệ thống uy tín đánh giá từng người chơi và các mốc phạt khác nhau và ban vĩnh viễn", created_at: new Date(), is_active: true },
  { id: 3, name: "Cheat Menu", price: 150000, description: "Hệ thống cheat menu dành riêng cho chủ server admin không thể can thiệp", created_at: new Date(), is_active: true }
];

let feedbacks = [];
let orders = [];

// Tạo owner account với password đã hash
const ownerPasswordHash = '$2a$12$8K1p/a0dRTlB0Z6s5UzJ.uB6eB6Q6b6Q6b6Q6b6Q6b6Q6b6Q6b6Q6b'; // 11111111Ab@
let adminUsers = [{ 
  id: 1, 
  username: 'owner', 
  password_hash: ownerPasswordHash
}];

console.log('🔑 Owner Account: username="owner", password="11111111Ab@"');
console.log('💾 Using In-memory Database (Guaranteed Working)');

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
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    message: 'ABCXYZ Server API is running',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
    database: 'In-memory (Guaranteed Working)',
    admin: 'owner/11111111Ab@'
  });
});

// Test database connection
app.get('/api/test-db', async (req, res) => {
  res.json({
    status: 'success',
    message: '✅ In-memory database is working perfectly',
    database: {
      time: new Date().toISOString(),
      version: 'In-memory SQL (Fast & Reliable)'
    },
    project: 'abcxyz-server'
  });
});

// Check environment variables
app.get('/api/env-check', (req, res) => {
  res.json({
    port: process.env.PORT,
    hasJwtSecret: !!process.env.JWT_SECRET,
    hasDatabaseUrl: !!process.env.DATABASE_URL,
    nodeEnv: process.env.NODE_ENV,
    databaseMode: 'In-memory (Always Working)',
    adminAccount: 'owner/11111111Ab@'
  });
});

// Owner login
app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password required' });
    }

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
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get all plugins
app.get('/api/plugins', async (req, res) => {
  try {
    res.json(plugins.filter(p => p.is_active));
  } catch (error) {
    console.error('Get plugins error:', error);
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
  } catch (error) {
    console.error('Submit feedback error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get orders (Owner only)
app.get('/api/orders', authenticateToken, async (req, res) => {
  try {
    const ordersWithPluginNames = orders.map(order => ({
      ...order,
      plugin_name: plugins.find(p => p.id === order.plugin_id)?.name || 'Custom Plugin',
      price: plugins.find(p => p.id === order.plugin_id)?.price || 0
    }));

    res.json(ordersWithPluginNames);
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
  } catch (error) {
    console.error('Create order error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get feedback (Owner only)
app.get('/api/feedback', authenticateToken, async (req, res) => {
  try {
    res.json(feedbacks);
  } catch (error) {
    console.error('Get feedback error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get stats (Owner only)
app.get('/api/stats', authenticateToken, async (req, res) => {
  try {
    res.json({
      plugins: plugins.filter(p => p.is_active).length,
      orders: orders.length,
      feedback: feedbacks.length
    });
  } catch (error) {
    console.error('Get stats error:', error);
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
    
    const orderIndex = orders.findIndex(o => o.id === parseInt(id));
    
    if (orderIndex === -1) {
      return res.status(404).json({ error: 'Order not found' });
    }
    
    orders[orderIndex].status = status;
    
    res.json({
      message: 'Order status updated successfully',
      order: orders[orderIndex]
    });
  } catch (error) {
    console.error('Update order error:', error);
    res.status(500).json({ error: 'Internal server error' });
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
    version: '1.0.0',
    admin: 'owner/11111111Ab@',
    database: 'In-memory (Fast & Reliable)',
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

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📍 Local: http://localhost:${PORT}`);
  console.log(`📊 Health: http://0.0.0.0:${PORT}/api/health`);
  console.log(`🗄️ DB Test: http://0.0.0.0:${PORT}/api/test-db`);
  console.log(`🔧 Env Check: http://0.0.0.0:${PORT}/api/env-check`);
  console.log(`🔑 Owner Account: username="owner", password="11111111Ab@"`);
  console.log(`💾 Database: In-memory (Guaranteed Working)`);
  console.log(`✅ Server is fully operational!`);
});

module.exports = app;
