// Load environment variables from .env file (if available, in containers it will be coming from environment and not .env files)
require("dotenv").config();

const express = require("express");
const morgan = require("morgan");

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware for logging HTTP requests
app.use(morgan("combined"));

// Middleware to parse JSON request bodies
app.use(express.json());

// Configure products and cache routes
const productsRouter = require("./routes/products");
const cacheRouter = require("./routes/cache");

app.use("/products", productsRouter);
app.use("/cache", cacheRouter);

// Simple health-check endpoint
app.get("/", (_req, res) => {
  res.send("Flash Sale Inventory API is running!");
});

// Swagger docs
const swaggerJSDoc = require("swagger-jsdoc");
const swaggerUi = require("swagger-ui-express");

const swaggerDefinition = {
  openapi: "3.0.0",
  info: {
    title: "Flash Sale Inventory API",
    version: "1.0.0",
    description: "API documentation for the Flash Sale Inventory API",
  },
  servers: [
    {
      url: "http://localhost:3000",
      description: "Local server",
    },
  ],
};

// Options for the swagger docs
const options = {
  swaggerDefinition,
  // Path to the API docs
  apis: ["./routes/*.js"], // files containing annotations
};

// Initialize swagger-jsdoc
const swaggerSpec = swaggerJSDoc(options);

// Serve the swagger docs
app.use("/docs", swaggerUi.serve, swaggerUi.setup(swaggerSpec));

// Starting the API server
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
