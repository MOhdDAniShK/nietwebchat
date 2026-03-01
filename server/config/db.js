const mongoose = require('mongoose');

let mongoServer;

const connectDB = async () => {
    try {
        let uri = process.env.MONGO_URI;

        // If no valid Mongo URI is provided, start the in-memory server
        if (!uri || uri.includes('<replace-with-your')) {
            console.log('No valid MONGO_URI provided in .env. Starting an in-memory MongoDB instance automatically...');
            const { MongoMemoryServer } = require('mongodb-memory-server');
            mongoServer = await MongoMemoryServer.create();
            uri = mongoServer.getUri();
        }

        const conn = await mongoose.connect(uri);
        console.log(`MongoDB Connected: ${conn.connection.host}`);
    } catch (error) {
        console.error(`Error connecting to MongoDB: ${error.message}`);
        console.log('Falling back to in-memory MongoDB...');
        try {
            const { MongoMemoryServer } = require('mongodb-memory-server');
            mongoServer = await MongoMemoryServer.create();
            const conn = await mongoose.connect(mongoServer.getUri());
            console.log(`MongoDB Connected (in-memory fallback): ${conn.connection.host}`);
        } catch (fallbackError) {
            console.error('In-memory fallback also failed:', fallbackError.message);
            process.exit(1);
        }
    }
};

module.exports = connectDB;
