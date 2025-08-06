const mongoose = require("mongoose");

const connectDB = async () => {
  try {
    const uri =
      process.env.MONGODB_URI || "mongodb://127.0.0.1:27017/marketplace";
    console.log("🔗 Attempting to connect to MongoDB with URI:", uri);

    const conn = await mongoose.connect(uri, {
      useNewUrlParser: true,
      useUnifiedTopology: true,
      serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
      socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
    });

    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);
    return conn;
  } catch (error) {
    console.error("❌ Database connection error:", error.message);
    process.exit(1);
  }
};

module.exports = connectDB;
