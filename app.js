// this file defines all the API routes and middleware for the application

const express = require("express");
const path = require("path");
const connectDB = require("./config/database");
const config = require("./config");
const logger = require("./utils/logger");
const errorHandler = require("./middleware/errorHandler");

// Route imports
const authRoutes = require("./routes/auth");
const userRoutes = require("./routes/users");
const productRoutes = require("./routes/products");
const categoryRoutes = require("./routes/categories");
const cartRoutes = require("./routes/cart");
const orderRoutes = require("./routes/orders");
const reviewRoutes = require("./routes/reviews");
const dashboardRoutes = require("./routes/dashboard");
const dataViewerRoutes = require("./routes/dataViewer");
const checkoutRoutes = require("./routes/checkout");

/**
 * Express application setup
 */
const app = express();

// Trust proxy
app.set("trust proxy", 1);

// Connect to database
connectDB();

// Body parser middleware
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Static files
app.use(express.static(path.join(__dirname, "public")));

// API routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/products", productRoutes);
app.use("/api/categories", categoryRoutes);
app.use("/api/cart", cartRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/reviews", reviewRoutes);
app.use("/api/checkout", checkoutRoutes);
app.use("/api/dashboard", dashboardRoutes);
app.use("/api/data", dataViewerRoutes);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    success: true,
    message: "Server is healthy",
    timestamp: new Date().toISOString(),
    environment: config.NODE_ENV,
  });
});

// Serve index.html for root and /index.html
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

app.get("/index.html", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html"));
});

// Serve React app for other SPA routes (but not API routes or static files)
app.get("*", (req, res) => {
  // Only serve index.html for non-API routes and non-static files
  if (!req.path.startsWith("/api/") && !req.path.startsWith("/public/")) {
    res.sendFile(path.join(__dirname, "index.html"));
  } else {
    res.status(404).json({ error: "Endpoint not found" });
  }
});

// Global error handler (must be last)
app.use(errorHandler);

// Handle uncaught exceptions
process.on("uncaughtException", (err) => {
  logger.error("Uncaught Exception:", err);
  process.exit(1);
});

// Handle unhandled promise rejections
process.on("unhandledRejection", (err) => {
  logger.error("Unhandled Rejection:", err);
  process.exit(1);
});

// Graceful shutdown
process.on("SIGTERM", () => {
  logger.info("SIGTERM received. Shutting down gracefully...");
  process.exit(0);
});

process.on("SIGINT", () => {
  logger.info("SIGINT received. Shutting down gracefully...");
  process.exit(0);
});

const PORT = config.PORT;

const server = app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT} in ${config.NODE_ENV} mode`);
});

module.exports = { app, server };
