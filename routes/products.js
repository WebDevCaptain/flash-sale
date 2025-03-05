/**
 * @swagger
 * components:
 *   schemas:
 *     Product:
 *       type: object
 *       properties:
 *         id:
 *           type: integer
 *           description: The auto-generated id of the product.
 *         name:
 *           type: string
 *           description: The product name.
 *         description:
 *           type: string
 *           description: The product description.
 *         price:
 *           type: number
 *           format: float
 *           description: The product price.
 *         inventory:
 *           type: integer
 *           description: The available inventory count.
 *         created_at:
 *           type: string
 *           format: date-time
 *           description: The creation date of the product.
 *       example:
 *         id: 1
 *         name: "Flash light"
 *         description: "High-intensity LED flashlight"
 *         price: 49.99
 *         inventory: 25
 *         created_at: "2026-01-01T00:00:00Z"
 */

const express = require("express");
const router = express.Router();
const db = require("../config/db");
const memcached = require("../config/memcached");

// Cache time-to-live (TTL) for product details (in seconds)
const PRODUCT_CACHE_TTL = 120;

/**
 * Utility to fetch a product from the db by id.
 * @param {number} productId - The product ID.
 * @returns {Object} The product record.
 */
async function getProductFromDB(productId) {
  const [rows] = await db.query("SELECT * FROM products WHERE id = ?", [
    productId,
  ]);
  return rows[0];
}

/**
 * @swagger
 * /products:
 *   get:
 *     summary: Retrieve a list of all products.
 *     description: Retrieves the list of all products by checking cache and database.
 *     responses:
 *       200:
 *         description: A list of products.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 products:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Product'
 */
router.get("/", async (_req, res) => {
  try {
    // Get all product IDs from the database
    const [rows] = await db.query("SELECT id FROM products");
    const productIds = rows.map((row) => row.id);

    if (productIds.length === 0) {
      return res.status(404).json({ error: "No products found" });
    }

    // Create cache keys for each product
    const cacheKeys = productIds.map((id) => `product_${id}`);

    try {
      const cacheResults = await memcached.getMulti(cacheKeys);

      console.log("Cache results:", cacheResults);

      let products = [];
      let missingIds = [];

      // Check which products are cached and which are missing
      productIds.forEach((id) => {
        const key = `product_${id}`;
        if (cacheResults && cacheResults[key]) {
          products.push(cacheResults[key]);
        } else {
          missingIds.push(id);
        }
      });

      // For products not found in cache, query the database and update the cache
      if (missingIds.length > 0) {
        const placeholders = missingIds.map(() => "?").join(",");
        const [dbRows] = await db.query(
          `SELECT * FROM products WHERE id IN (${placeholders})`, // hacky way but works
          missingIds
        );

        // Highly inefficient, needs refactoring.
        for (let i = 0; i < dbRows.length; i++) {
          const row = dbRows[i];
          const key = `product_${row.id}`;
          await memcached.set(key, row, PRODUCT_CACHE_TTL);
          products.push(row);
        }
      }

      res.json({ products });
    } catch (err) {
      console.error("Error fetching products from getMulti method:", err);
    }
  } catch (error) {
    console.error("Error in GET /products:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * @api {get} /products/:id Get product by ID
 * @apiDescription Retrieve details of a specific product.
 */
router.get("/:id", async (req, res) => {
  try {
    const productId = req.params.id;
    const cacheKey = `product_${productId}`;

    // Check memcached for the product
    let product = await memcached.get(cacheKey);

    if (product) {
      console.log("Cache hit", cacheKey);
      return res.json({ product, source: "cache" });
    }

    console.log("Cache miss", cacheKey);

    product = await getProductFromDB(productId);

    if (!product) {
      return res.status(404).json({ error: "Product not found" });
    }

    // Cache the product data
    const cacheres = await memcached.set(cacheKey, product, PRODUCT_CACHE_TTL);
    console.log("Cache set status", cacheres);
    return res.json({ product, source: "db" });
  } catch (error) {
    console.error("Error in GET /products/:id", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * @api {post} /products Create a new product
 * @apiDescription Create a new product entry.
 */
router.post("/", async (req, res) => {
  try {
    const { name, description, price, inventory } = req.body;
    // Validate required fields (we can do this in a better way, this is just for demonstrating)
    if (!name || !price || inventory === undefined) {
      return res
        .status(400)
        .json({ error: "Missing required fields: name, price, inventory" });
    }
    // Insert the new product into the database
    const [result] = await db.query(
      "INSERT INTO products (name, description, price, inventory) VALUES (?, ?, ?, ?)",
      [name, description, price, inventory]
    );
    const newProductId = result.insertId;
    const newProduct = {
      id: newProductId,
      name,
      description,
      price,
      inventory,
    };
    // Cache the newly created product

    try {
      await memcached.set(
        `product_${newProductId}`,
        newProduct,
        PRODUCT_CACHE_TTL
      );
    } catch (err) {
      console.error(`Error caching new product ${newProductId}:`, err);
    }

    res.status(201).json({ product: newProduct });
  } catch (error) {
    console.error("Error in POST /products:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * @api {put} /products/:id Update a product
 * @apiDescription Update product information.
 */
router.put("/:id", async (req, res) => {
  try {
    const productId = req.params.id;
    const { name, description, price, inventory } = req.body;
    // Update the product in the database
    const [result] = await db.query(
      "UPDATE products SET name = ?, description = ?, price = ?, inventory = ? WHERE id = ?",
      [name, description, price, inventory, productId]
    );
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    // Invalidate the product cache to force a refresh next time

    await memcached.del(`product_${productId}`);

    res.json({ message: "Product updated successfully" });
  } catch (error) {
    console.error("Error in PUT /products/:id:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * @api {delete} /products/:id Delete a product
 * @apiDescription Delete a product from the system.
 */
router.delete("/:id", async (req, res) => {
  try {
    const productId = req.params.id;
    // Delete the product from the database
    const [result] = await db.query("DELETE FROM products WHERE id = ?", [
      productId,
    ]);
    if (result.affectedRows === 0) {
      return res.status(404).json({ error: "Product not found" });
    }
    // Remove the product from the cache

    const deleted = await Promise.all([
      memcached.del(`product_${productId}`),
      memcached.del(`product_inventory_${productId}`),
    ]);

    if (!deleted) {
      console.debug(`Failed to delete from cache for product ${productId}`);
    }

    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    console.error("Error in DELETE /products/:id:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * @api {post} /products/:id/purchase Purchase a product
 * @apiDescription Process a purchase by decrementing inventory.
 */
router.post("/:id/purchase", async (req, res) => {
  try {
    const productId = req.params.id;
    const cacheKey = `product_inventory_${productId}`;
    let inventory;

    // Tryin to get inventory from cache
    try {
      inventory = await memcached.get(cacheKey);
    } catch (err) {
      console.error("Cache error:", err);
    }

    // If inventory is not cached, load it from the database
    if (!inventory) {
      const product = await getProductFromDB(productId);
      if (!product) {
        return res.status(404).json({ error: "Product not found" });
      }
      inventory = product.inventory;
      // Cache the inventory count
      try {
        await memcached.set(cacheKey, inventory, PRODUCT_CACHE_TTL);
      } catch (err) {
        console.error(`Error caching inventory for product ${productId}:`, err);
      }
    }

    // Check if there is enough inventory for a purchase
    if (parseInt(inventory) <= 0) {
      return res
        .status(400)
        .json({ error: "Product out of stock, better luck next time.. :(" });
    }

    // Atomically decrement the inventory in memcached by 1
    let newInventory;
    try {
      newInventory = await memcached.decr(cacheKey, 1);
    } catch (err) {
      console.error("Error decrementing inventory:", err);
      return res.status(500).json({ error: "Could not process purchase" });
    }

    // Update the inventory in the database asynchronously
    await db.query("UPDATE products SET inventory = ? WHERE id = ?", [
      newInventory,
      productId,
    ]);

    // Invalidate the cached product details so updated inventory is fetched next time
    try {
      await memcached.del(`product_${productId}`);
    } catch (err) {
      console.error(`Error deleting cache for product ${productId}:`, err);
    }

    res.json({ message: "Purchase successful", inventory: newInventory });
  } catch (error) {
    console.error("Error in POST /products/:id/purchase:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * @swagger
 * /products/{id}/views:
 *   get:
 *     summary: Increment product view count.
 *     description: Increment and return the view count for a product.
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: integer
 *         description: The product id.
 *     responses:
 *       200:
 *         description: Returns the current view count.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 views:
 *                   type: integer
 */
router.get("/:id/views", async (req, res) => {
  try {
    const productId = req.params.id;
    const cacheKey = `product_views_${productId}`;

    // Use memcached atomic increment to update view count
    const newCount = await memcached.incr(cacheKey, 1);

    if (newCount) {
      return res.json({ views: newCount });
    } else {
      await memcached.set(cacheKey, 1, PRODUCT_CACHE_TTL);
      return res.json({ views: 1 });
    }
  } catch (error) {
    console.error("Error in GET /products/:id/views:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

module.exports = router;
