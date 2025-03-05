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
 * @api {get} /products Get all products
 * @apiDescription Retrieve a list of all products.
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

    // Use memcached.getMulti to retrieve cached product data
    memcached.getMulti(cacheKeys, async (err, cacheResults) => {
      if (err) {
        console.error("Error fetching from cache:", err);
      }
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
        dbRows.forEach((product) => {
          products.push(product);
          memcached.set(
            `product_${product.id}`,
            product,
            PRODUCT_CACHE_TTL,
            (err) => {
              if (err) {
                console.error(`Error caching product_${product.id}:`, err);
              }
            }
          );
        });
      }

      res.json({ products });
    });
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
    memcached.set(
      `product_${newProductId}`,
      newProduct,
      PRODUCT_CACHE_TTL,
      (err) => {
        if (err) {
          console.error(`Error caching new product ${newProductId}:`, err);
        }
      }
    );
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
    memcached.del(`product_${productId}`, (err) => {
      if (err) {
        console.error(`Error deleting cache for product ${productId}:`, err);
      }
    });
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
    memcached.del(`product_${productId}`, (err) => {
      if (err) {
        console.error(`Error deleting cache for product ${productId}:`, err);
      }
    });
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

    // Attempt to get the current inventory from the cache
    memcached.get(cacheKey, async (err, inventory) => {
      if (err) {
        console.error("Cache error:", err);
      }
      // If inventory is not cached, load it from the database
      if (inventory === undefined || inventory === null) {
        const product = await getProductFromDB(productId);
        if (!product) {
          return res.status(404).json({ error: "Product not found" });
        }
        inventory = product.inventory;
        // Cache the inventory count
        memcached.set(cacheKey, inventory, PRODUCT_CACHE_TTL, (err) => {
          if (err) {
            console.error(
              `Error caching inventory for product ${productId}:`,
              err
            );
          }
        });
      }

      // Check if there is enough inventory for a purchase
      if (parseInt(inventory) <= 0) {
        return res.status(400).json({ error: "Product out of stock" });
      }

      // Use memcached atomic decrement to reduce inventory by 1
      memcached.decr(cacheKey, 1, async (err, newInventory) => {
        if (err) {
          console.error("Error decrementing inventory:", err);
          return res.status(500).json({ error: "Could not process purchase" });
        }
        // Update the inventory in the database asynchronously
        await db.query("UPDATE products SET inventory = ? WHERE id = ?", [
          newInventory,
          productId,
        ]);
        // Invalidate the cached product details so the new inventory shows up next time
        memcached.del(`product_${productId}`, (err) => {
          if (err) {
            console.error(
              `Error deleting cache for product ${productId}:`,
              err
            );
          }
        });
        res.json({ message: "Purchase successful", inventory: newInventory });
      });
    });
  } catch (error) {
    console.error("Error in POST /products/:id/purchase:", error);
    res.status(500).json({ error: "Internal server error" });
  }
});

/**
 * @api {get} /products/:id/views Increment product view count
 * @apiDescription Increment and return the view count for a product.
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
