// Fix DNS SRV lookup for MongoDB Atlas on restrictive networks
const dns = require('dns');
dns.setServers(['8.8.8.8', '8.8.4.4', '1.1.1.1']);

const express = require('express');
const http = require('http');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const socketConfig = require('./socket');
const path = require('path');

dotenv.config({ path: path.join(__dirname, '.env') });
connectDB();

const User = require('./models/User');

const initAdmin = async () => {
    try {
        const adminEmail = '0251cse274@niet.co.in';
        let admin = await User.findOne({ email: adminEmail });
        
        if (!admin) {
            admin = await User.create({
                username: 'ADMIN',
                email: adminEmail,
                password: 'Danish.10',
                role: 'OWNER',
                isVerified: true
            });
            console.log('Admin user created successfully.');
        } else {
             if (admin.role !== 'OWNER' || !admin.isVerified) {
                 admin.role = 'OWNER';
                 admin.isVerified = true;
                 await admin.save();
                 console.log('Admin user updated successfully.');
             }
        }
    } catch (error) {
        console.error('Error initializing admin user:', error);
    }
};

initAdmin();

const app = express();
const server = http.createServer(app);

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/chat', require('./routes/chat'));

// Socket.io
socketConfig(server);

// Serve frontend in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, '../client/dist')));

  app.get('*', (req, res) =>
    res.sendFile(path.resolve(__dirname, '../', 'client', 'dist', 'index.html'))
  );
} else {
  app.get('/', (req, res) => res.send('API is running...'));
}

const PORT = process.env.PORT || 5001;
server.listen(PORT, '0.0.0.0', () => console.log(`Server running on port ${PORT} across all interfaces`));
