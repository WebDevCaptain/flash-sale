const Memcached = require("memcached");
require("dotenv").config();

// A memcached client
const memcached = new Memcached(
  `${process.env.MEMCACHED_HOST || "localhost"}:${
    process.env.MEMCACHED_PORT || 11211
  }`,
  {
    retries: 10,
    retry: 10000,
    remove: true,
  }
);

module.exports = memcached;
