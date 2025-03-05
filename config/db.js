const mysql = require("mysql2/promise");
require("dotenv").config();

// Create a MySQL connection pool (with env values)
const pool = mysql.createPool({
  host: process.env.MYSQL_HOST,
  user: process.env.MYSQL_USER,
  password: process.env.MYSQL_PASSWORD,
  database: process.env.MYSQL_DATABASE,
  waitForConnections: true,
  connectionLimit: 10, // Should increase according to resources available
  queueLimit: 0, // No limit on queue size
});

module.exports = pool;
