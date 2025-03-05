const express = require("express");
const memcached = require("../config/memcached");

const router = express.Router();

/**
 * @api {get} /cache/flush Flush Cache
 * @apiDescription Flush all cached data. (Mainly for testing & debuggging purposes)
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
