const express = require("express");
const memcached = require("../config/memcached");

const router = express.Router();

/**
 * @swagger
 * /cache/flush:
 *   get:
 *     summary: Flush the cache.
 *     description: Clears all cached data in memcached.
 *     responses:
 *       200:
 *         description: Cache flushed successfully.
 */
router.get("/flush", (req, res) => {
  memcached.flush((err) => {
    if (err) {
      console.error("Error flushing cache:", err);
      return res.status(500).json({ error: "Could not flush cache" });
    }
    res.json({ message: "Cache flushed successfully" });
  });
});

module.exports = router;
