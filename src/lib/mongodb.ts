import { MongoClient, Db } from 'mongodb'

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://realcartdb:Realcart%40143@cluster0.gyo3kwq.mongodb.net/realcart?appName=Cluster0'

const globalForMongo = globalThis as unknown as {
  mongoClient: MongoClient | undefined
  mongoDb: Db | undefined
  mongoConnectionPromise: Promise<{ client: MongoClient; db: Db }> | undefined
}

let client: MongoClient
let db: Db

if (!globalForMongo.mongoClient) {
  client = new MongoClient(MONGODB_URI, {
    connectTimeoutMS: 15000,
    socketTimeoutMS: 45000,
    serverSelectionTimeoutMS: 15000,
    // Connection pool sized for concurrent API requests (dashboard makes 6+ parallel queries)
    maxPoolSize: 10,
    minPoolSize: 1,
    maxIdleTimeMS: 30000,   // Close idle connections after 30s
    waitQueueTimeoutMS: 10000,
    // Heartbeat to detect stale connections faster
    heartbeatFrequencyMS: 10000,
  })
  globalForMongo.mongoClient = client
}

client = globalForMongo.mongoClient!
db = client.db('realcart')

/** Track whether one-time initialization has already run this process lifecycle. */
let collectionsInitialized = false

/** Track connection state for fast-path returns. */
let isConnected = false

/**
 * Connect to MongoDB with resilient retry logic.
 *
 * KEY DESIGN DECISIONS:
 * 1. Non-blocking: Returns quickly so the server can start accepting requests
 * 2. Retries happen on each API request, not in a blocking loop
 * 3. Index creation is deferred and doesn't block the connection
 * 4. Failed connections clear state so the next attempt starts fresh
 */
export async function connectToDatabase(): Promise<{ client: MongoClient; db: Db }> {
  // Fast path: if already connected, return immediately
  if (isConnected && globalForMongo.mongoDb) {
    return { client, db }
  }

  // If a connection attempt is already in progress, wait for it
  if (globalForMongo.mongoConnectionPromise) {
    return globalForMongo.mongoConnectionPromise
  }

  // Start a new connection attempt
  globalForMongo.mongoConnectionPromise = (async () => {
    try {
      await client.connect()
      globalForMongo.mongoDb = db
      isConnected = true

      // Initialize collections (validators + indexes) in the background
      // DO NOT await this — let it run asynchronously so the connection
      // resolves quickly and the server can start handling requests.
      if (!collectionsInitialized) {
        collectionsInitialized = true // Set flag immediately to prevent re-entry
        initializeCollections(db).catch(err => {
          console.warn('[MongoDB] Background initialization error (non-fatal):', (err as Error).message)
        })
      }

      return { client, db }
    } catch (error) {
      console.error('[MongoDB] Connection failed:', (error as Error).message)

      // Clear ALL state so the next attempt starts completely fresh
      globalForMongo.mongoConnectionPromise = undefined
      isConnected = false

      // Throw so the caller knows the connection failed
      // The caller (API route) can handle this gracefully
      throw new Error(
        `MongoDB connection failed: ${(error as Error).message}. ` +
        'The server will retry on the next request.'
      )
    }
  })()

  return globalForMongo.mongoConnectionPromise
}

/**
 * Initialize MongoDB collections with proper validators and indexes.
 *
 * Runs in the background after the first successful connection.
 * Errors are non-fatal — the server can still handle requests
 * (they'll just be slower without indexes).
 *
 * CRITICAL: This function MUST NOT throw — all errors are caught and logged.
 */
async function initializeCollections(db: Db): Promise<void> {
  // ── Update Customers Collection Validator & Indexes ──
  // CRITICAL FIX: The original seed created a unique index on `email` but the
  // register route sets email to null/empty for all customers. This caused an
  // E11000 duplicate key error on the 2nd+ registration, incorrectly reported
  // as "mobile number already registered." We must:
  // 1. Update the validator to match the actual document shape
  // 2. Drop the unique index on `email`
  // 3. Create a unique index on `mobile` instead
  try {
    await db.command({
      collMod: 'customers',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['mobile', 'name', 'passcodeHash', 'role'],
          properties: {
            mobile: { bsonType: 'string' },
            name: { bsonType: 'string' },
            email: { bsonType: ['string', 'null'] },
            passcodeHash: { bsonType: 'string' },
            role: { bsonType: 'string' },
            status: { bsonType: 'string' },
            // profileImage can be:
            //   - null (no image uploaded yet)
            //   - an object (the standard format used by /api/customer/profile POST):
            //       { url, publicId, width, height, format, size, uploadedAt }
            //   - a string (legacy compatibility — URL only)
            profileImage: {
              bsonType: ['object', 'string', 'null'],
              properties: {
                url: { bsonType: 'string' },
                publicId: { bsonType: 'string' },
                width: { bsonType: 'number' },
                height: { bsonType: 'number' },
                format: { bsonType: 'string' },
                size: { bsonType: 'number' },
                uploadedAt: { bsonType: 'date' },
              },
            },
            failedLoginAttempts: { bsonType: 'number' },
            lastLoginAt: { bsonType: ['date', 'null'] },
            createdAt: { bsonType: 'date' },
            updatedAt: { bsonType: 'date' },
          },
        },
      },
    })
    console.log('[MongoDB] Customers collection validator updated')
  } catch (validatorError) {
    console.warn('[MongoDB] Could not update customers validator (non-fatal):', (validatorError as Error).message)
  }

  // Drop the legacy unique index on `email` — it blocks 2nd+ customer registration
  // because all customers have email=null/empty.
  try {
    await db.collection('customers').dropIndex('email_1')
    console.log('[MongoDB] Dropped legacy unique index on customers.email')
  } catch {
    // Index may not exist — that's fine
  }

  // Create unique index on `mobile` (the actual unique identifier for customers)
  try {
    await db.collection('customers').createIndex(
      { mobile: 1 },
      { unique: true, background: true, name: 'customers_mobile_unique' }
    )
    console.log('[MongoDB] Customers mobile unique index ensured')
  } catch (indexError) {
    console.warn('[MongoDB] Could not create customers mobile index (non-fatal):', (indexError as Error).message)
  }

  // ── Update Products Collection Validator ──
  // Ensure the schema validator supports the production-level product document
  // (images as objects, variants, SEO, shipping, specifications, etc.)
  try {
    await db.command({
      collMod: 'products',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['name'],
          properties: {
            // Core Info
            name: { bsonType: 'string' },
            slug: { bsonType: 'string' },
            description: { bsonType: 'string' },
            category: { bsonType: 'string' },
            subcategory: { bsonType: 'string' },
            brand: { bsonType: 'string' },
            // Media
            imageUrl: { bsonType: 'string' },
            images: {
              bsonType: 'array',
              items: {
                bsonType: 'object',
                properties: {
                  url: { bsonType: 'string' },
                  alt: { bsonType: 'string' },
                  publicId: { bsonType: 'string' },
                  isPrimary: { bsonType: 'bool' },
                },
              },
            },
            videoUrl: { bsonType: 'string' },
            // Pricing
            price: { bsonType: 'number' },
            mrp: { bsonType: 'number' },
            sellingPrice: { bsonType: 'number' },
            specialPrice: { bsonType: 'number' },
            specialPriceStartDate: { bsonType: ['string', 'null'] },
            specialPriceEndDate: { bsonType: ['string', 'null'] },
            // Inventory
            stock: { bsonType: 'number' },
            lowStockThreshold: { bsonType: 'number' },
            trackInventory: { bsonType: 'bool' },
            // Production inventory fields (Flipkart/Meesho/Amazon parity)
            reservedStock: { bsonType: 'number' },        // Held for active checkouts
            sku: { bsonType: 'string' },                  // Product-level SKU
            reorderPoint: { bsonType: 'number' },         // Trigger restock alert
            reorderQuantity: { bsonType: 'number' },      // Suggested restock qty
            warehouseLocation: { bsonType: 'string' },    // Bin/aisle location
            lastStockUpdateAt: { bsonType: 'date' },      // Last stock change timestamp
            // Extended production inventory fields
            costPrice: { bsonType: 'number' },            // Purchase cost (for valuation)
            safetyStock: { bsonType: 'number' },          // Buffer stock level
            leadTimeDays: { bsonType: 'number' },         // Supplier lead time
            supplier: { bsonType: 'string' },             // Supplier/vendor name
            allowBackorder: { bsonType: 'bool' },         // Allow ordering when OOS
            restockDate: { bsonType: ['string', 'null'] },// Estimated restock date (ISO)
            // Variants
            variantAttributes: { bsonType: 'array' },
            variants: { bsonType: 'array' },
            // Specifications
            specifications: { bsonType: 'array' },
            // Highlights
            highlights: { bsonType: 'array' },
            // Size Chart
            sizeChart: {
              bsonType: ['object', 'null'],
              properties: {
                headers: { bsonType: 'array' },
                rows: { bsonType: 'array' },
                imageUrl: { bsonType: 'string' },
                unit: { bsonType: 'string' },
                howToMeasure: { bsonType: 'array' },
              },
            },
            // Shipping & Tax
            shipping: { bsonType: 'object' },
            // Return & Warranty
            returnPolicy: { bsonType: 'string' },
            warranty: { bsonType: 'string' },
            // SEO
            seo: { bsonType: 'object' },
            // Seller Info
            seller: { bsonType: 'string' },
            sellerId: { bsonType: 'string' },
            storeName: { bsonType: 'string' },
            // Status & Approval
            status: { bsonType: 'string' },
            approvalNotes: { bsonType: 'string' },
            active: { bsonType: 'bool' },
            // Tags
            tags: { bsonType: 'array' },
            // Legacy
            discounts: { bsonType: 'array' },
            // Computed/Cached
            totalSold: { bsonType: 'number' },
            viewCount: { bsonType: 'number' },
            avgRating: { bsonType: 'number' },
            totalReviews: { bsonType: 'number' },
            // Timestamps
            createdAt: { bsonType: 'date' },
            updatedAt: { bsonType: 'date' },
            approvedAt: { bsonType: ['date', 'null'] },
            publishedAt: { bsonType: ['date', 'null'] },
          },
        },
      },
    })
    console.log('[MongoDB] Products collection validator updated')
  } catch (validatorError) {
    console.warn('[MongoDB] Could not update products validator (non-fatal):', (validatorError as Error).message)
  }

  // ── Products Collection Indexes ──

  try {
    await db.collection('products').createIndex(
      { status: 1, active: 1 },
      { background: true, name: 'status_active_compound' }
    )
    console.log('[MongoDB] Products compound index ensured')
  } catch (indexError) {
    console.warn('[MongoDB] Could not create products compound index (non-fatal):', (indexError as Error).message)
  }

  try {
    await db.collection('products').createIndex(
      { name: 'text', description: 'text', brand: 'text', category: 'text', subcategory: 'text', tags: 'text' },
      {
        background: true,
        name: 'products_text_search',
        weights: { name: 10, brand: 5, category: 3, subcategory: 3, tags: 2, description: 1 },
      }
    )
    console.log('[MongoDB] Products text search index ensured')
  } catch (indexError) {
    console.warn('[MongoDB] Could not create products text index (non-fatal):', (indexError as Error).message)
  }

  try {
    await db.collection('products').createIndex(
      { category: 1, subcategory: 1, status: 1, active: 1 },
      { background: true, name: 'products_category_subcategory' }
    )
    console.log('[MongoDB] Products category+subcategory index ensured')
  } catch (indexError) {
    console.warn('[MongoDB] Could not create products category+subcategory index (non-fatal):', (indexError as Error).message)
  }

  try {
    await db.collection('products').createIndex(
      { seller: 1, status: 1 },
      { background: true, name: 'products_seller_status' }
    )
    console.log('[MongoDB] Products seller+status index ensured')
  } catch (indexError) {
    console.warn('[MongoDB] Could not create products seller+status index (non-fatal):', (indexError as Error).message)
  }

  try {
    await db.collection('products').createIndex(
      { slug: 1 },
      { background: true, name: 'products_slug' }
    )
    console.log('[MongoDB] Products slug index ensured')
  } catch (indexError) {
    console.warn('[MongoDB] Could not create products slug index (non-fatal):', (indexError as Error).message)
  }

  try {
    await db.collection('products').createIndex(
      { status: 1, createdAt: -1 },
      { background: true, name: 'products_status_date' }
    )
    console.log('[MongoDB] Products status+date index ensured')
  } catch (indexError) {
    console.warn('[MongoDB] Could not create products status+date index (non-fatal):', (indexError as Error).message)
  }

  // Drop legacy product indexes that may conflict
  try { await db.collection('products').dropIndex('name_1') } catch { /* ok */ }
  try { await db.collection('products').dropIndex('category_1') } catch { /* ok */ }

  // ── Migration: Fix legacy product status 'Publish' → 'Published' ──
  // Earlier versions of the codebase incorrectly used 'Publish' as the
  // status value. The standard is 'Published' (past tense). This one-time
  // migration updates any existing products that still have the old value.
  try {
    const legacyResult = await db.collection('products').updateMany(
      { status: 'Publish' },
      { $set: { status: 'Published', updatedAt: new Date() } }
    )
    if (legacyResult.modifiedCount > 0) {
      console.log(`[MongoDB Migration] Updated ${legacyResult.modifiedCount} products: 'Publish' → 'Published'`)
    }
  } catch (migrationErr) {
    console.warn('[MongoDB Migration] Failed to update legacy status values (non-fatal):', (migrationErr as Error).message)
  }

  // ── Reviews Collection Indexes ──
  try {
    await db.collection('reviews').createIndex(
      { productId: 1, createdAt: -1 },
      { background: true, name: 'reviews_product_date' }
    )
    console.log('[MongoDB] Reviews product+date index ensured')
  } catch (indexError) {
    console.warn('[MongoDB] Could not create reviews product+date index (non-fatal):', (indexError as Error).message)
  }

  try {
    await db.collection('reviews').dropIndex('customer_product_unique')
  } catch { /* ok */ }
  try {
    await db.collection('reviews').dropIndex('product_date_compound')
  } catch { /* ok */ }
  try {
    await db.collection('reviews').dropIndex('status_index')
  } catch { /* ok */ }

  try {
    await db.collection('reviews').createIndex(
      { customerId: 1, productId: 1, orderId: 1 },
      { background: true, unique: true, name: 'reviews_customer_product_order_unique' }
    )
    console.log('[MongoDB] Reviews customer+product+order unique index ensured')
  } catch (indexError) {
    console.warn('[MongoDB] Could not create reviews unique index (non-fatal):', (indexError as Error).message)
  }

  try {
    await db.collection('reviews').createIndex(
      { status: 1 },
      { background: true, name: 'reviews_status' }
    )
    console.log('[MongoDB] Reviews status index ensured')
  } catch (indexError) {
    console.warn('[MongoDB] Could not create reviews status index (non-fatal):', (indexError as Error).message)
  }

  try {
    await db.collection('reviews').createIndex(
      { sellerId: 1, createdAt: -1 },
      { background: true, name: 'reviews_seller_date' }
    )
    console.log('[MongoDB] Reviews seller+date index ensured')
  } catch (indexError) {
    console.warn('[MongoDB] Could not create reviews seller+date index (non-fatal):', (indexError as Error).message)
  }

  // Review media index
  try {
    await db.collection('review_media').createIndex(
      { reviewId: 1 },
      { background: true, name: 'review_media_reviewId' }
    )
    console.log('[MongoDB] Review media index ensured')
  } catch (indexError) {
    console.warn('[MongoDB] Could not create review_media index (non-fatal):', (indexError as Error).message)
  }

  // Review replies index
  try {
    await db.collection('review_replies').createIndex(
      { reviewId: 1 },
      { background: true, name: 'review_replies_reviewId' }
    )
    console.log('[MongoDB] Review replies index ensured')
  } catch (indexError) {
    console.warn('[MongoDB] Could not create review_replies index (non-fatal):', (indexError as Error).message)
  }

  // Review helpfulness index (one vote per user per review)
  try {
    await db.collection('review_helpfulness').createIndex(
      { reviewId: 1, customerId: 1 },
      { background: true, unique: true, name: 'review_helpfulness_unique' }
    )
    console.log('[MongoDB] Review helpfulness index ensured')
  } catch (indexError) {
    console.warn('[MongoDB] Could not create review_helpfulness index (non-fatal):', (indexError as Error).message)
  }

  // Product rating summary index
  try {
    await db.collection('product_rating_summary').createIndex(
      { productId: 1 },
      { background: true, unique: true, name: 'product_rating_summary_unique' }
    )
    console.log('[MongoDB] Product rating summary index ensured')
  } catch (indexError) {
    console.warn('[MongoDB] Could not create product_rating_summary index (non-fatal):', (indexError as Error).message)
  }

  // ── Size Chart Templates Collection Indexes ──
  try {
    await db.collection('size_chart_templates').createIndex(
      { status: 1 },
      { background: true, name: 'size_chart_templates_status' }
    )
    console.log('[MongoDB] Size chart templates status index ensured')
  } catch (indexError) {
    console.warn('[MongoDB] Could not create size_chart_templates index (non-fatal):', (indexError as Error).message)
  }

  // Drop old category/subcategory indexes if they exist
  try {
    await db.collection('size_chart_templates').dropIndex('size_chart_templates_category_status')
  } catch { /* index may not exist */ }
  try {
    await db.collection('size_chart_templates').dropIndex('size_chart_templates_category_subcategory_status')
  } catch { /* index may not exist */ }

  // ── Finance: Seller Payouts Collection ──
  try {
    await db.command({
      collMod: 'seller_payouts',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['payoutId', 'sellerId', 'netPayout', 'status', 'createdAt'],
          properties: {
            payoutId: { bsonType: 'string' },
            sellerId: { bsonType: 'string' },
            sellerName: { bsonType: 'string' },
            sellerStoreName: { bsonType: 'string' },
            periodStart: { bsonType: 'string' },
            periodEnd: { bsonType: 'string' },
            grossOrderValue: { bsonType: 'number' },
            commission: { bsonType: 'number' },
            gstOnCommission: { bsonType: 'number' },
            deliveryCollected: { bsonType: 'number' },
            tdsDeducted: { bsonType: 'number' },
            tcsCollected: { bsonType: 'number' },
            netPayout: { bsonType: 'number' },
            status: { bsonType: 'string', enum: ['pending', 'processed', 'paid', 'failed'] },
            bankAccount: { bsonType: 'object' },
            orderIds: { bsonType: 'array' },
            processedAt: { bsonType: ['string', 'null'] },
            paidAt: { bsonType: ['string', 'null'] },
            transactionRef: { bsonType: ['string', 'null'] },
            createdAt: { bsonType: 'string' },
            updatedAt: { bsonType: 'string' },
          },
        },
      },
    })
  } catch { /* collection may not exist yet — that's fine */ }

  try {
    await db.collection('seller_payouts').createIndex(
      { payoutId: 1 }, { unique: true, background: true, name: 'seller_payouts_payoutId_unique' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create seller_payouts payoutId index (non-fatal):', (indexError as Error).message)
  }
  try {
    await db.collection('seller_payouts').createIndex(
      { sellerId: 1, status: 1 }, { background: true, name: 'seller_payouts_seller_status' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create seller_payouts seller index (non-fatal):', (indexError as Error).message)
  }
  try {
    await db.collection('seller_payouts').createIndex(
      { status: 1, createdAt: -1 }, { background: true, name: 'seller_payouts_status_date' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create seller_payouts status index (non-fatal):', (indexError as Error).message)
  }

  // ── Finance: Transactions (Ledger) Collection ──
  try {
    await db.collection('transactions').createIndex(
      { transactionId: 1 }, { unique: true, background: true, name: 'transactions_txnId_unique' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create transactions txnId index (non-fatal):', (indexError as Error).message)
  }
  try {
    await db.collection('transactions').createIndex(
      { type: 1, date: -1 }, { background: true, name: 'transactions_type_date' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create transactions type index (non-fatal):', (indexError as Error).message)
  }
  try {
    await db.collection('transactions').createIndex(
      { orderId: 1 }, { background: true, sparse: true, name: 'transactions_orderId' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create transactions orderId index (non-fatal):', (indexError as Error).message)
  }
  try {
    await db.collection('transactions').createIndex(
      { sellerId: 1, date: -1 }, { background: true, sparse: true, name: 'transactions_seller_date' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create transactions seller index (non-fatal):', (indexError as Error).message)
  }

  // ── Finance: Refunds Collection ──
  try {
    await db.collection('refunds').createIndex(
      { refundId: 1 }, { unique: true, background: true, name: 'refunds_refundId_unique' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create refunds refundId index (non-fatal):', (indexError as Error).message)
  }
  try {
    await db.collection('refunds').createIndex(
      { orderId: 1 }, { background: true, name: 'refunds_orderId' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create refunds orderId index (non-fatal):', (indexError as Error).message)
  }
  try {
    await db.collection('refunds').createIndex(
      { status: 1, createdAt: -1 }, { background: true, name: 'refunds_status_date' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create refunds status index (non-fatal):', (indexError as Error).message)
  }

  // ── Finance: Expenses Collection ──
  try {
    await db.collection('expenses').createIndex(
      { expenseId: 1 }, { unique: true, background: true, name: 'expenses_expenseId_unique' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create expenses expenseId index (non-fatal):', (indexError as Error).message)
  }
  try {
    await db.collection('expenses').createIndex(
      { category: 1, date: -1 }, { background: true, name: 'expenses_category_date' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create expenses category index (non-fatal):', (indexError as Error).message)
  }
  try {
    await db.collection('expenses').createIndex(
      { status: 1, date: -1 }, { background: true, name: 'expenses_status_date' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create expenses status index (non-fatal):', (indexError as Error).message)
  }

  // ── Analytics: Events Collection ──
  // Stores all tracked user events: page_view, product_view, search, cart_add,
  // checkout_start, payment_initiated, order_placed, etc. Powers the Reports &
  // Analytics dashboards for both admin and seller panels.
  try {
    await db.command({
      collMod: 'analytics_events',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['type', 'sessionId', 'timestamp'],
          properties: {
            type: {
              bsonType: 'string',
              enum: [
                'page_view', 'product_view', 'search', 'cart_add', 'cart_remove',
                'wishlist_add', 'checkout_start', 'payment_initiated', 'order_placed',
                'order_cancelled', 'order_returned', 'review_submitted', 'seller_visit',
              ],
            },
            sessionId: { bsonType: 'string' },
            customerId: { bsonType: ['string', 'null'] },
            path: { bsonType: ['string', 'null'] },
            title: { bsonType: ['string', 'null'] },
            productId: { bsonType: ['string', 'null'] },
            productName: { bsonType: ['string', 'null'] },
            sellerId: { bsonType: ['string', 'null'] },
            category: { bsonType: ['string', 'null'] },
            searchQuery: { bsonType: ['string', 'null'] },
            searchResults: { bsonType: ['number', 'null'] },
            cartValue: { bsonType: ['number', 'null'] },
            orderId: { bsonType: ['string', 'null'] },
            orderValue: { bsonType: ['number', 'null'] },
            referrer: { bsonType: ['string', 'null'] },
            userAgent: { bsonType: ['string', 'null'] },
            device: { bsonType: ['string', 'null'], enum: ['desktop', 'mobile', 'tablet', null] },
            ip: { bsonType: ['string', 'null'] },
            metadata: { bsonType: ['object', 'null'] },
            timestamp: { bsonType: 'date' },
            createdAt: { bsonType: 'date' },
          },
        },
      },
    })
  } catch { /* collection may not exist yet — that's fine */ }

  try {
    await db.collection('analytics_events').createIndex(
      { type: 1, timestamp: -1 }, { background: true, name: 'analytics_events_type_time' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create analytics_events type index (non-fatal):', (indexError as Error).message)
  }
  try {
    await db.collection('analytics_events').createIndex(
      { sessionId: 1, timestamp: -1 }, { background: true, name: 'analytics_events_session_time' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create analytics_events session index (non-fatal):', (indexError as Error).message)
  }
  try {
    await db.collection('analytics_events').createIndex(
      { productId: 1, timestamp: -1 }, { background: true, sparse: true, name: 'analytics_events_product_time' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create analytics_events product index (non-fatal):', (indexError as Error).message)
  }
  try {
    await db.collection('analytics_events').createIndex(
      { sellerId: 1, timestamp: -1 }, { background: true, sparse: true, name: 'analytics_events_seller_time' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create analytics_events seller index (non-fatal):', (indexError as Error).message)
  }
  try {
    await db.collection('analytics_events').createIndex(
      { customerId: 1, timestamp: -1 }, { background: true, sparse: true, name: 'analytics_events_customer_time' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create analytics_events customer index (non-fatal):', (indexError as Error).message)
  }
  // TTL index: auto-expire events after 2 years to prevent unbounded growth
  try {
    await db.collection('analytics_events').createIndex(
      { timestamp: 1 }, { background: true, expireAfterSeconds: 63072000, name: 'analytics_events_ttl' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create analytics_events TTL index (non-fatal):', (indexError as Error).message)
  }

  // ── Inventory Movements (audit log) ──
  // Tracks every stock change (order, cancel, return, adjustment, reservation)
  // Ensure collection exists before applying validator (collMod requires existing collection)
  try {
    const movementsExist = await db.listCollections({ name: 'inventory_movements' }).hasNext()
    if (!movementsExist) {
      await db.createCollection('inventory_movements')
    }
  } catch (createError) {
    // non-fatal
  }
  try {
    await db.command({
      collMod: 'inventory_movements',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['movementId', 'productId', 'type', 'quantityChange', 'createdAt'],
          properties: {
            movementId: { bsonType: 'string' },
            productId: { bsonType: 'string' },
            productName: { bsonType: ['string', 'null'] },
            variantId: { bsonType: ['string', 'null'] },
            variantSku: { bsonType: ['string', 'null'] },
            sellerId: { bsonType: ['string', 'null'] },
            sellerName: { bsonType: ['string', 'null'] },
            type: {
              bsonType: 'string',
              enum: ['order', 'cancel', 'return', 'adjustment', 'restock', 'reservation', 'release', 'reservation_confirm', 'initial', 'correction', 'transfer', 'count_adjustment'],
            },
            quantityChange: { bsonType: 'number' },
            stockBefore: { bsonType: ['number', 'null'] },
            stockAfter: { bsonType: ['number', 'null'] },
            orderId: { bsonType: ['string', 'null'] },
            reservationId: { bsonType: ['string', 'null'] },
            reason: { bsonType: ['string', 'null'] },
            performedBy: { bsonType: 'string', enum: ['system', 'seller', 'admin', 'customer'] },
            userId: { bsonType: ['string', 'null'] },
            userName: { bsonType: ['string', 'null'] },
            createdAt: { bsonType: 'string' },
          },
        },
      },
    })
    console.log('[MongoDB] inventory_movements validator updated')
  } catch (validatorError) {
    console.warn('[MongoDB] Could not update inventory_movements validator (non-fatal):', (validatorError as Error).message)
  }

  try {
    await db.collection('inventory_movements').createIndex(
      { productId: 1, createdAt: -1 }, { background: true, name: 'inventory_movements_product_time' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create inventory_movements product index (non-fatal):', (indexError as Error).message)
  }
  try {
    await db.collection('inventory_movements').createIndex(
      { sellerId: 1, createdAt: -1 }, { background: true, sparse: true, name: 'inventory_movements_seller_time' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create inventory_movements seller index (non-fatal):', (indexError as Error).message)
  }
  try {
    await db.collection('inventory_movements').createIndex(
      { orderId: 1 }, { background: true, sparse: true, name: 'inventory_movements_order' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create inventory_movements order index (non-fatal):', (indexError as Error).message)
  }
  try {
    await db.collection('inventory_movements').createIndex(
      { type: 1, createdAt: -1 }, { background: true, name: 'inventory_movements_type_time' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create inventory_movements type index (non-fatal):', (indexError as Error).message)
  }
  try {
    await db.collection('inventory_movements').createIndex(
      { movementId: 1 }, { background: true, unique: true, name: 'inventory_movements_id_unique' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create inventory_movements movementId index (non-fatal):', (indexError as Error).message)
  }

  // ── Stock Reservations (checkout holds) ──
  // Ensure collection exists before applying validator (collMod requires existing collection)
  try {
    const reservationsExist = await db.listCollections({ name: 'stock_reservations' }).hasNext()
    if (!reservationsExist) {
      await db.createCollection('stock_reservations')
    }
  } catch (createError) {
    // non-fatal
  }
  try {
    await db.command({
      collMod: 'stock_reservations',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['reservationId', 'productId', 'quantity', 'status', 'createdAt'],
          properties: {
            reservationId: { bsonType: 'string' },
            productId: { bsonType: 'string' },
            variantId: { bsonType: ['string', 'null'] },
            customerId: { bsonType: ['string', 'null'] },
            sessionId: { bsonType: ['string', 'null'] },
            quantity: { bsonType: 'number' },
            cartToken: { bsonType: ['string', 'null'] },
            status: { bsonType: 'string', enum: ['active', 'confirmed', 'released', 'expired'] },
            expiresAt: { bsonType: 'date' },
            createdAt: { bsonType: 'string' },
            releasedAt: { bsonType: ['string', 'null'] },
            confirmedAt: { bsonType: ['string', 'null'] },
            orderId: { bsonType: ['string', 'null'] },
          },
        },
      },
    })
    console.log('[MongoDB] stock_reservations validator updated')
  } catch (validatorError) {
    console.warn('[MongoDB] Could not update stock_reservations validator (non-fatal):', (validatorError as Error).message)
  }

  try {
    await db.collection('stock_reservations').createIndex(
      { reservationId: 1 }, { background: true, unique: true, name: 'stock_reservations_id_unique' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create stock_reservations id index (non-fatal):', (indexError as Error).message)
  }
  try {
    await db.collection('stock_reservations').createIndex(
      { productId: 1, status: 1 }, { background: true, name: 'stock_reservations_product_status' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create stock_reservations product index (non-fatal):', (indexError as Error).message)
  }
  try {
    await db.collection('stock_reservations').createIndex(
      { customerId: 1, status: 1 }, { background: true, sparse: true, name: 'stock_reservations_customer_status' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create stock_reservations customer index (non-fatal):', (indexError as Error).message)
  }
  // TTL: auto-expire active reservations after their expiresAt timestamp
  try {
    await db.collection('stock_reservations').createIndex(
      { expiresAt: 1 }, { background: true, expireAfterSeconds: 0, name: 'stock_reservations_ttl' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create stock_reservations TTL index (non-fatal):', (indexError as Error).message)
  }

  // ── Inventory Alerts (low stock / out of stock / reorder) ──
  // Ensure collection exists before applying validator (collMod requires existing collection)
  try {
    const alertsExist = await db.listCollections({ name: 'inventory_alerts' }).hasNext()
    if (!alertsExist) {
      await db.createCollection('inventory_alerts')
    }
  } catch (createError) {
    // non-fatal
  }
  try {
    await db.command({
      collMod: 'inventory_alerts',
      validator: {
        $jsonSchema: {
          bsonType: 'object',
          required: ['alertId', 'productId', 'type', 'status', 'createdAt'],
          properties: {
            alertId: { bsonType: 'string' },
            productId: { bsonType: 'string' },
            productName: { bsonType: ['string', 'null'] },
            variantId: { bsonType: ['string', 'null'] },
            sellerId: { bsonType: ['string', 'null'] },
            sellerName: { bsonType: ['string', 'null'] },
            type: { bsonType: 'string', enum: ['low_stock', 'out_of_stock', 'reorder'] },
            currentStock: { bsonType: 'number' },
            threshold: { bsonType: 'number' },
            status: { bsonType: 'string', enum: ['active', 'acknowledged', 'resolved'] },
            message: { bsonType: 'string' },
            createdAt: { bsonType: 'string' },
            acknowledgedAt: { bsonType: ['string', 'null'] },
            acknowledgedBy: { bsonType: ['string', 'null'] },
            resolvedAt: { bsonType: ['string', 'null'] },
          },
        },
      },
    })
    console.log('[MongoDB] inventory_alerts validator updated')
  } catch (validatorError) {
    console.warn('[MongoDB] Could not update inventory_alerts validator (non-fatal):', (validatorError as Error).message)
  }

  try {
    await db.collection('inventory_alerts').createIndex(
      { alertId: 1 }, { background: true, unique: true, name: 'inventory_alerts_id_unique' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create inventory_alerts id index (non-fatal):', (indexError as Error).message)
  }
  try {
    await db.collection('inventory_alerts').createIndex(
      { sellerId: 1, status: 1, createdAt: -1 }, { background: true, sparse: true, name: 'inventory_alerts_seller_status' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create inventory_alerts seller index (non-fatal):', (indexError as Error).message)
  }
  try {
    await db.collection('inventory_alerts').createIndex(
      { status: 1, type: 1, createdAt: -1 }, { background: true, name: 'inventory_alerts_status_type' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create inventory_alerts status index (non-fatal):', (indexError as Error).message)
  }
  try {
    await db.collection('inventory_alerts').createIndex(
      { productId: 1, variantId: 1, status: 1 }, { background: true, name: 'inventory_alerts_product_status' }
    )
  } catch (indexError) {
    console.warn('[MongoDB] Could not create inventory_alerts product index (non-fatal):', (indexError as Error).message)
  }

  console.log('[MongoDB] Initialization complete')
}

export { client, db }
