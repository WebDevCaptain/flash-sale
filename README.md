# Flash Sale API

This simple Express API will manage a list of products for a flash sale. The primary goal is to explore memcached and client libraries with node.js.

---

## Memcached client API methods used (for Reference)

- `get / set` operations with TTL.
- `del` for cache invalidation.
- `incr / decr` for atomic operations.
- `getMulti` to retrieve several keys at once.
- `flush` for clearing the cache.

> Here, we have promisified all the above methods available in the `memcached` npm package

---

## Technologies Used

- Node.js
- Express
- MySQL
- Memcached

---

## License

This project is released under the [MIT License](LICENSE).
