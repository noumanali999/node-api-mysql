const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mysql = require('mysql');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

// Set up the express app and HTTP server
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: 'http://localhost:3001', // Replace with your frontend URL
    methods: ['GET', 'POST'],
  }
});

// Use necessary middlewares
app.use(cors());
app.use(express.json());  // Enables JSON body parsing

// Database connection setup
const db = mysql.createConnection({
  host: 'localhost',
  user: 'root',
  password: '',
  database: 'chatsystem',
});

db.connect((err) => {
  if (err) {
    console.error('Database connection failed:', err);
    throw err;
  }
  console.log('Connected to SQL database');
});

const JWT_SECRET = 'your_jwt_secret_key';

// Login route
app.post('/api/login/', (req, res) => {
  const { email, password } = req.body;

  const query = 'SELECT * FROM users WHERE email = ?';
  db.query(query, [email], (err, results) => {
    if (err) return res.status(500).send('Server error');

    if (results.length > 0) {
      const user = results[0];

      // Compare plain text passwords (consider hashing passwords for security)
      if (password === user.password) {
        const token = jwt.sign(
          { userId: user.id, name: user.name },
          JWT_SECRET,
          { expiresIn: '1h' }
        );

        return res.json({ token, name: user.name, userId: user.id });
      }
    }
    res.status(401).send('Invalid email or password');
  });
});

// Route to get pending offers for a specific seller
app.get('/api/pending-offers/:buyerId', (req, res) => {
  const { buyerId } = req.params;

  console.log(buyerId);

  const query = `
    SELECT offers.id, offers.product_id, offers.buyer_id, offers.offer, offers.status,
           users.name AS buyer_name, products.product_name
    FROM offers
    JOIN users ON offers.buyer_id = users.id
    JOIN products ON offers.product_id = products.id
    WHERE offers.buyer_id = ? AND offers.status = 'pending'
  `;

  db.query(query, [buyerId], (err, results) => {
    if (err) {
      console.log("Error fetching pending offers:", err);
      return res.status(500).json({ error: 'Failed to fetch pending offers' });
    }
    res.status(200).json(results);
  });
});

// Route to handle making an offer
app.post('/api/make-offer', (req, res) => {
  const { product_id, buyer_id, seller_id, offer, status } = req.body;

  const parsedOffer = parseFloat(offer);
  if (isNaN(parsedOffer) || parsedOffer <= 0) {
    return res.status(400).json({ error: 'Invalid offer amount' });
  }

  const getSellerQuery = 'SELECT user_id FROM products WHERE id = ?';
  db.query(getSellerQuery, [product_id], (err, result) => {
    if (err) {
      console.error('Error getting seller information:', err);
      return res.status(500).json({ error: 'Error processing offer' });
    }

    if (result.length > 0) {
      const sellerId = result[0].user_id;

      const query = 'INSERT INTO offers (product_id, buyer_id, seller_id, offer, status) VALUES (?, ?, ?, ?, ?)';
      db.query(query, [product_id, buyer_id, sellerId, parsedOffer, status], (err, result) => {
        if (err) {
          console.error('Error making offer:', err);
          return res.status(500).json({ error: 'Failed to make offer' });
        }
        res.status(200).json({ message: 'Offer made successfully' });
      });
    } else {
      res.status(400).json({ error: 'Product not found' });
    }
  });
});

// Route to get products based on buyer_id (offers made by the buyer)
app.get('/api/products-by-buyer/:buyer_id', (req, res) => {
  const { buyer_id } = req.params;

  const query = `
    SELECT offers.id, offers.product_id, offers.buyer_id, offers.offer, offers.status,
           users.name AS buyer_name, products.product_name, products.product_description, products.price
    FROM offers
    JOIN users ON offers.buyer_id = users.id
    JOIN products ON offers.product_id = products.id
    WHERE offers.buyer_id = ? AND offers.status = 'pending'
  `;

  db.query(query, [buyer_id], (err, results) => {
    if (err) {
      console.error('Error fetching products for buyer:', err);
      return res.status(500).json({ error: 'Failed to fetch products for buyer' });
    }
    res.status(200).json(results);
  });
});

// Route to update the offer status
app.post('/api/update-offer-status', (req, res) => {
  const { offerId, status } = req.body;

  if (!offerId || !status) {
    return res.status(400).json({ error: 'Offer ID and status are required' });
  }

  const query = 'UPDATE offers SET status = ? WHERE id = ?';
  db.query(query, [status, offerId], (err, result) => {
    if (err) {
      console.error('Error updating offer status:', err);
      return res.status(500).json({ error: 'Failed to update offer status' });
    }

    if (result.affectedRows === 0) {
      return res.status(404).json({ error: 'Offer not found' });
    }

    res.status(200).json({ message: `Offer ${status} successfully` });
  });
});

// Route to get all products
app.get('/api/products', (req, res) => {
  const query = 'SELECT * FROM products';
  db.query(query, (err, results) => {
    if (err) return res.status(500).send('Error fetching products');
    res.json(results);
  });
});

// Route to get accepted offers for a specific seller
app.get('/api/all-offers/:sellerId', (req, res) => {
  const { sellerId } = req.params;

  console.log(sellerId)
  const query = `
    SELECT offers.id, offers.product_id, offers.buyer_id, offers.offer, offers.status,offers.seller_id,
           users.name AS buyer_name, products.product_name
    FROM offers
    JOIN users ON offers.buyer_id = users.id
    JOIN products ON offers.product_id = products.id
    WHERE offers.buyer_id = ?
  `;

  db.query(query, [sellerId], (err, results) => {
    if (err) {
      console.error('Error fetching accepted offers:', err);
      return res.status(500).json({ error: 'Failed to fetch accepted offers' });
    }
    res.status(200).json(results);
  });
});


// Route to get product details by productId
app.get('/api/product/:productId', (req, res) => {
  const { productId } = req.params;
  // Query to fetch product details by productId
  const query = 'SELECT * FROM products WHERE id = ?';

  db.query(query, [productId], (err, results) => {
    if (err) {
      console.error('Error fetching product details:', err);
      return res.status(500).json({ error: 'Failed to fetch product details' });
    }

    if (results.length === 0) {
      return res.status(404).json({ error: 'Product not found' });
    }

    // Return product details in the response
    res.status(200).json(results[0]);
  });
});

app.get('/api/messages', (req, res) => {
  const { productId, senderId, receiverId } = req.query;
  
  console.log("Received Params:");
  console.log("productId:", productId);
  console.log("senderId:", senderId);
  console.log("receiverId:", receiverId);

  // Ensure no parameter is missing or null
  if (!productId || !senderId || !receiverId) {
    return res.status(400).send("Missing required parameters");
  }

  const query = `
    SELECT * FROM chat_messages 
    WHERE product_id = ? 
    AND ((sender_id = ? AND receiver_id = ?) 
    OR (sender_id = ? AND receiver_id = ?))
    ORDER BY created_at ASC
  `;

  db.query(query, [productId, senderId, receiverId, receiverId, senderId], (err, results) => {
    if (err) {
      console.error('Error fetching messages from database:', err);
      return res.status(500).send('Error fetching messages');
    }
    res.json(results);
  });
});


// Listen for socket connections
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // Handle user authentication
  socket.on('authenticate', (userData) => {
    const query = 'SELECT * FROM users WHERE id = ?';
    db.query(query, [userData.userId], (err, result) => {
      if (err) {
        console.error('Error during authentication:', err);
        return;
      }
      if (result.length > 0) {
        socket.emit('authenticated', { success: true });
      } else {
        socket.emit('authenticated', { success: false });
      }
    });
  });

  // Handle sending and storing chat messages
  socket.on('sendMessage', (messageData) => {
    const { senderId, receiverId, productId, message } = messageData;

    const query = `
      INSERT INTO chat_messages (sender_id, receiver_id, product_id, message, created_at)
      VALUES (?, ?, ?, ?, NOW())
    `;

    db.query(query, [senderId, receiverId, productId, message], (err) => {
      if (err) {
        console.error('Error inserting message into database:', err);
        return;
      }
      console.log('Message stored in database');
      io.to(receiverId).emit('newMessage', messageData);
    });
  });

  // Log when a user disconnects
  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Start the server
server.listen(3000, () => {
  console.log('Socket.io server running on port 3000');
});
