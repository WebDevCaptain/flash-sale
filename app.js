// Load environment variables from .env file (if available, in containers it will be coming from environment and not .env files)
require("dotenv").config();

const express = require("express");
const morgan = require("morgan");

const app = express();
const port = process.env.PORT || 3000;

// Middleware for logging HTTP requests
app.use(morgan("combined"));

// Middleware to parse JSON request bodies
app.use(express.json());

// Simple health-check endpoint
app.get("/", (req, res) => {
  res.send("Flash Sale Inventory API is running!");
});

// Start the API server
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
