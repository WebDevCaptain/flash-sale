const Memcached = require("memcached");
const { promisify } = require("util");
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

// Promisify all memcached methods
memcached.get = promisify(memcached.get);
memcached.set = promisify(memcached.set);
memcached.del = promisify(memcached.del);
memcached.flush = promisify(memcached.flush);
memcached.incr = promisify(memcached.incr);
memcached.decr = promisify(memcached.decr);
memcached.getMulti = promisify(memcached.getMulti);

module.exports = memcached;
