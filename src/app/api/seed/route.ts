import { NextResponse } from 'next/server'
import { connectToDatabase } from '@/lib/mongodb'
import bcrypt from 'bcryptjs'

/* ------------------------------------------------------------------ */
/*  Helper: Convert a list of URL strings into proper ProductImage[]   */
/*  objects so the images always have { url, alt, publicId, isPrimary } */
/* ------------------------------------------------------------------ */

function toImageObjects(imageUrl: string, extraImages: string[] = [], productName: string = ''): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = []
  // Primary image (from imageUrl)
  if (imageUrl) {
    result.push({ url: imageUrl, alt: productName || 'Product', publicId: '', isPrimary: true })
  }
  // Extra images (from images array)
  for (const url of extraImages) {
    if (url && url !== imageUrl) {
      result.push({ url, alt: productName || 'Product', publicId: '', isPrimary: false })
    }
  }
  return result
}

export async function POST() {
  try {
    const { db } = await connectToDatabase()

    // Create collections with validation rules
    const collections = await db.listCollections().toArray()
    const collectionNames = collections.map(c => c.name)

    // Admin collection
    if (!collectionNames.includes('admins')) {
      await db.createCollection('admins', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['email', 'password', 'name'],
            properties: {
              email: { bsonType: 'string' },
              password: { bsonType: 'string' },
              name: { bsonType: 'string' },
              role: { bsonType: 'string' },
              createdAt: { bsonType: 'date' },
              updatedAt: { bsonType: 'date' },
            },
          },
        },
      })
      await db.collection('admins').createIndex({ email: 1 }, { unique: true })
    }

    // Products collection — updated validator for production-level product management
    // Supports: images as objects, variants with nested attributes, SEO, shipping, specifications, etc.
    const productsValidator = {
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
          // Variants
          variantAttributes: { bsonType: 'array' },
          variants: { bsonType: 'array' },
          // Specifications
          specifications: { bsonType: 'array' },
          // Highlights
          highlights: { bsonType: 'array' },
          // Size Chart
          sizeChart: { bsonType: ['object', 'null'] },
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
    }

    if (!collectionNames.includes('products')) {
      await db.createCollection('products', { validator: productsValidator })
      await db.collection('products').createIndex({ name: 1 })
      await db.collection('products').createIndex({ category: 1 })
    } else {
      // Update existing products collection validator to support all new fields
      try {
        await db.command({
          collMod: 'products',
          validator: productsValidator,
        })
      } catch (collModErr) {
        console.warn('[Seed] Could not update products validator:', collModErr)
      }
    }

    // Categories collection
    if (!collectionNames.includes('categories')) {
      await db.createCollection('categories', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['name'],
            properties: {
              name: { bsonType: 'string' },
              description: { bsonType: 'string' },
              active: { bsonType: 'bool' },
              createdAt: { bsonType: 'date' },
              updatedAt: { bsonType: 'date' },
            },
          },
        },
      })
      await db.collection('categories').createIndex({ name: 1 }, { unique: true })
    }

    // Customers collection — updated schema to match actual registration flow
    // Uses `mobile` as the unique identifier (not email), includes passcodeHash, role, etc.
    const customersValidator = {
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
          profileImage: { bsonType: ['string', 'null'] },
          failedLoginAttempts: { bsonType: 'number' },
          lastLoginAt: { bsonType: ['date', 'null'] },
          createdAt: { bsonType: 'date' },
          updatedAt: { bsonType: 'date' },
        },
      },
    }

    if (!collectionNames.includes('customers')) {
      await db.createCollection('customers', { validator: customersValidator })
    } else {
      // Always update the validator to fix legacy schemas (e.g. email: string → ['string','null'])
      try {
        await db.command({ collMod: 'customers', validator: customersValidator })
      } catch {
        // Non-fatal — validator update may fail due to existing documents
      }
    }

    // Unique index on mobile (the primary identifier for customer login)
    // Drop legacy unique index on email if it exists — it blocks registration
    // because all customers have email=null, causing E11000 on 2nd+ customer.
    try { await db.collection('customers').dropIndex('email_1') } catch { /* ok */ }
    await db.collection('customers').createIndex({ mobile: 1 }, { unique: true, name: 'customers_mobile_unique' })

    // Sellers collection
    if (!collectionNames.includes('sellers')) {
      await db.createCollection('sellers', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['name', 'email', 'passwordHash', 'storeName'],
            properties: {
              name: { bsonType: 'string' },
              email: { bsonType: 'string' },
              passwordHash: { bsonType: 'string' },
              storeName: { bsonType: 'string' },
              phone: { bsonType: 'string' },
              address: { bsonType: 'string' },
              gstNumber: { bsonType: 'string' },
              panNumber: { bsonType: 'string' },
              role: { bsonType: 'string' },
              status: { bsonType: 'string' },
              isVerified: { bsonType: 'bool' },
              failedLoginAttempts: { bsonType: 'number' },
              lastLoginAt: { bsonType: 'date' },
              createdAt: { bsonType: 'date' },
              updatedAt: { bsonType: 'date' },
            },
          },
        },
      })
      await db.collection('sellers').createIndex({ email: 1 }, { unique: true })
      await db.collection('sellers').createIndex({ storeName: 1 }, { unique: true })
    }

    // Delivery Boys collection
    if (!collectionNames.includes('delivery_boys')) {
      await db.createCollection('delivery_boys', {
        validator: {
          $jsonSchema: {
            bsonType: 'object',
            required: ['mobile', 'name', 'passcodeHash', 'role'],
            properties: {
              mobile: { bsonType: 'string' },
              name: { bsonType: 'string' },
              passcodeHash: { bsonType: 'string' },
              role: { bsonType: 'string' },
              status: { bsonType: 'string' },
              isAvailable: { bsonType: 'bool' },
              vehicleType: { bsonType: 'string' },
              vehicleNumber: { bsonType: 'string' },
              profileImage: { bsonType: ['string', 'object'] },
              address: { bsonType: 'string' },
              aadhaarNumber: { bsonType: 'string' },
              panNumber: { bsonType: 'string' },
              failedLoginAttempts: { bsonType: 'number' },
              lastLoginAt: { bsonType: 'date' },
              createdAt: { bsonType: 'date' },
              updatedAt: { bsonType: 'date' },
            },
          },
        },
      })
      await db.collection('delivery_boys').createIndex({ mobile: 1 }, { unique: true })
    }

    // DbSchemas collection - for tracking schema documentation
    if (!collectionNames.includes('dbschemas')) {
      await db.createCollection('dbschemas')
      await db.collection('dbschemas').createIndex({ collection: 1 }, { unique: true })
    }

    // Seed admin user if not exists
    const existingAdmin = await db.collection('admins').findOne({ email: 'admin@realcart.com' })
    if (!existingAdmin) {
      const hashedPassword = await bcrypt.hash('admin123', 10)
      await db.collection('admins').insertOne({
        email: 'admin@realcart.com',
        password: hashedPassword,
        name: 'RealCart Admin',
        role: 'admin',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }

    // Seed demo seller if not exists, or reset if blocked
    const existingSeller = await db.collection('sellers').findOne({ email: 'seller@realcart.com' })
    if (!existingSeller) {
      const hashedSellerPassword = await bcrypt.hash('seller123', 10)
      await db.collection('sellers').insertOne({
        name: 'Demo Seller',
        email: 'seller@realcart.com',
        passwordHash: hashedSellerPassword,
        storeName: 'Demo Store',
        phone: '9876543210',
        address: '123 Market Street, Mumbai, Maharashtra',
        gstNumber: '27AAAAA0000A1Z5',
        panNumber: 'AAAAA0000A',
        role: 'seller',
        status: 'Active',
        isVerified: true,
        failedLoginAttempts: 0,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    } else if (existingSeller.status === 'Blocked' || (existingSeller.failedLoginAttempts || 0) >= 5) {
      // Reset blocked seller account
      const hashedSellerPassword = await bcrypt.hash('seller123', 10)
      await db.collection('sellers').updateOne(
        { email: 'seller@realcart.com' },
        {
          $set: {
            status: 'Active',
            passwordHash: hashedSellerPassword,
            failedLoginAttempts: 0,
            lastFailedAttempt: null,
            blockedAt: null,
            blockedReason: null,
            updatedAt: new Date(),
          },
        }
      )
    }

    // Seed sample categories
    const categoryCount = await db.collection('categories').countDocuments()
    if (categoryCount === 0) {
      await db.collection('categories').insertMany([
        { name: 'Electronics', description: 'Electronic devices and gadgets', parentCategory: 'None', status: 'Active', active: true, createdBy: 'Admin', imageUrl: null, createdAt: new Date(), updatedAt: new Date() },
        { name: 'Clothing', description: 'Apparel and fashion items', parentCategory: 'None', status: 'Active', active: true, createdBy: 'Admin', imageUrl: null, createdAt: new Date(), updatedAt: new Date() },
        { name: 'Fashion', description: 'Fashion accessories and trendy items', parentCategory: 'Clothing', status: 'Active', active: true, createdBy: 'Seller', imageUrl: null, createdAt: new Date(), updatedAt: new Date() },
        { name: 'Home & Garden', description: 'Home improvement and garden supplies', parentCategory: 'None', status: 'Active', active: true, createdBy: 'Admin', imageUrl: null, createdAt: new Date(), updatedAt: new Date() },
        { name: 'Groceries', description: 'Fresh groceries and food items', parentCategory: 'None', status: 'Active', active: true, createdBy: 'Seller', imageUrl: null, createdAt: new Date(), updatedAt: new Date() },
        { name: 'Toys', description: 'Kids toys and games', parentCategory: 'None', status: 'Draft', active: false, createdBy: 'Admin', imageUrl: null, createdAt: new Date(), updatedAt: new Date() },
        { name: 'Automotive', description: 'Auto parts and accessories', parentCategory: 'None', status: 'Active', active: true, createdBy: 'Seller', imageUrl: null, createdAt: new Date(), updatedAt: new Date() },
        { name: 'Home Decor', description: 'Home decoration and furniture', parentCategory: 'Home & Garden', status: 'Active', active: true, createdBy: 'Admin', imageUrl: null, createdAt: new Date(), updatedAt: new Date() },
        { name: 'Beauty', description: 'Beauty and personal care products', parentCategory: 'None', status: 'Active', active: true, createdBy: 'Seller', imageUrl: null, createdAt: new Date(), updatedAt: new Date() },
        { name: 'Kitchen', description: 'Kitchen utensils and appliances', parentCategory: 'Home Decor', status: 'Draft', active: false, createdBy: 'Admin', imageUrl: null, createdAt: new Date(), updatedAt: new Date() },
        { name: 'Sports', description: 'Sports equipment and accessories', parentCategory: 'None', status: 'Active', active: true, createdBy: 'Seller', imageUrl: null, createdAt: new Date(), updatedAt: new Date() },
        { name: 'Books', description: 'Books and publications', parentCategory: 'None', status: 'Active', active: true, createdBy: 'Admin', imageUrl: null, createdAt: new Date(), updatedAt: new Date() },
      ])
    }

    // Seed sample products
    const productCount = await db.collection('products').countDocuments()
    if (productCount === 0) {
      await db.collection('products').insertMany([
        {
          name: 'Wireless Headphones',
          slug: 'wireless-headphones',
          description: 'Premium noise-cancelling wireless headphones with 30-hour battery life and deep bass',
          price: 79.99,
          category: 'Electronics',
          brand: 'SoundMax',
          imageUrl: 'https://picsum.photos/seed/headphones/400/400',
          images: toImageObjects('https://picsum.photos/seed/headphones/400/400', ['https://picsum.photos/seed/headphones2/400/400', 'https://picsum.photos/seed/headphones3/400/400'], 'Wireless Headphones'),
          videoUrl: '',
          stock: 150,
          active: true,
          seller: 'Admin',
          status: 'Published',
          variants: [{ attribute: 'Color', value: 'Black' }, { attribute: 'Color', value: 'White' }],
          tags: ['Electronics', 'Audio'],
          discounts: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          name: 'Smart Watch',
          slug: 'smart-watch',
          description: 'Fitness tracking smart watch with heart rate monitor and GPS',
          price: 199.99,
          category: 'Electronics',
          brand: 'TechFit',
          imageUrl: 'https://picsum.photos/seed/smartwatch/400/400',
          images: toImageObjects('https://picsum.photos/seed/smartwatch/400/400', ['https://picsum.photos/seed/smartwatch2/400/400'], 'Smart Watch'),
          videoUrl: '',
          stock: 75,
          active: true,
          seller: 'Admin',
          status: 'Published',
          variants: [{ attribute: 'Size', value: '42mm' }, { attribute: 'Size', value: '46mm' }],
          tags: ['Electronics', 'Wearable'],
          discounts: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          name: 'Cotton T-Shirt',
          slug: 'cotton-t-shirt',
          description: 'Comfortable 100% cotton crew neck t-shirt available in multiple colors',
          price: 24.99,
          category: 'Clothing',
          brand: 'ComfortWear',
          imageUrl: 'https://picsum.photos/seed/tshirt/400/400',
          images: toImageObjects('https://picsum.photos/seed/tshirt/400/400', ['https://picsum.photos/seed/tshirt2/400/400', 'https://picsum.photos/seed/tshirt3/400/400'], 'Cotton T-Shirt'),
          videoUrl: '',
          stock: 300,
          active: true,
          seller: 'Admin',
          status: 'Published',
          variants: [{ attribute: 'Size', value: 'S' }, { attribute: 'Size', value: 'M' }, { attribute: 'Size', value: 'L' }, { attribute: 'Size', value: 'XL' }],
          tags: ['Clothing', 'Casual'],
          discounts: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          name: 'Running Shoes',
          slug: 'running-shoes',
          description: 'Lightweight running shoes with cushioned soles for maximum comfort',
          price: 89.99,
          category: 'Sports',
          brand: 'SpeedRun',
          imageUrl: 'https://picsum.photos/seed/runshoes/400/400',
          images: toImageObjects('https://picsum.photos/seed/runshoes/400/400', ['https://picsum.photos/seed/runshoes2/400/400'], 'Running Shoes'),
          videoUrl: '',
          stock: 120,
          active: true,
          seller: 'Admin',
          status: 'Published',
          variants: [{ attribute: 'Size', value: '8' }, { attribute: 'Size', value: '9' }, { attribute: 'Size', value: '10' }],
          tags: ['Sports', 'Footwear'],
          discounts: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          name: 'Garden Tool Set',
          slug: 'garden-tool-set',
          description: 'Complete garden tool set with carrying case for all your gardening needs',
          price: 49.99,
          category: 'Home & Garden',
          brand: 'GreenThumb',
          imageUrl: 'https://picsum.photos/seed/gardentools/400/400',
          images: toImageObjects('https://picsum.photos/seed/gardentools/400/400', [], 'Garden Tool Set'),
          videoUrl: '',
          stock: 60,
          active: true,
          seller: 'Admin',
          status: 'Published',
          variants: [],
          tags: ['Garden', 'Tools'],
          discounts: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          name: 'JavaScript Guide',
          slug: 'javascript-guide',
          description: 'Comprehensive guide to modern JavaScript development',
          price: 34.99,
          category: 'Books',
          brand: 'CodePress',
          imageUrl: 'https://picsum.photos/seed/jsbook/400/400',
          images: toImageObjects('https://picsum.photos/seed/jsbook/400/400', [], 'JavaScript Guide'),
          videoUrl: '',
          stock: 200,
          active: true,
          seller: 'Admin',
          status: 'Draft',
          variants: [{ attribute: 'Format', value: 'Paperback' }, { attribute: 'Format', value: 'E-book' }],
          tags: ['Books', 'Programming'],
          discounts: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          name: 'Bluetooth Speaker',
          slug: 'bluetooth-speaker',
          description: 'Portable waterproof bluetooth speaker with 360-degree sound',
          price: 59.99,
          category: 'Electronics',
          brand: 'SoundMax',
          imageUrl: 'https://picsum.photos/seed/speaker/400/400',
          images: toImageObjects('https://picsum.photos/seed/speaker/400/400', ['https://picsum.photos/seed/speaker2/400/400'], 'Bluetooth Speaker'),
          videoUrl: '',
          stock: 90,
          active: true,
          seller: 'Admin',
          status: 'Published',
          variants: [{ attribute: 'Color', value: 'Blue' }, { attribute: 'Color', value: 'Red' }],
          tags: ['Electronics', 'Audio'],
          discounts: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          name: 'Yoga Mat',
          slug: 'yoga-mat',
          description: 'Non-slip yoga mat with alignment markings for perfect poses',
          price: 29.99,
          category: 'Sports',
          brand: 'ZenFlex',
          imageUrl: 'https://picsum.photos/seed/yogamat/400/400',
          images: toImageObjects('https://picsum.photos/seed/yogamat/400/400', [], 'Yoga Mat'),
          videoUrl: '',
          stock: 180,
          active: true,
          seller: 'Admin',
          status: 'Published',
          variants: [{ attribute: 'Color', value: 'Purple' }, { attribute: 'Color', value: 'Green' }],
          tags: ['Sports', 'Yoga'],
          discounts: [],
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ])
    }

    // Migrate existing products that have empty imageUrl — add sample images
    const productsWithoutImages = await db.collection('products').find({
      $or: [
        { imageUrl: '' },
        { imageUrl: { $exists: false } },
      ],
    }).toArray()

    if (productsWithoutImages.length > 0) {
      const imageMap: Record<string, { imageUrl: string; extraImages: string[]; brand?: string; slug?: string; seller?: string; status?: string }> = {
        'Wireless Headphones': { imageUrl: 'https://picsum.photos/seed/headphones/400/400', extraImages: ['https://picsum.photos/seed/headphones2/400/400', 'https://picsum.photos/seed/headphones3/400/400'], brand: 'SoundMax', slug: 'wireless-headphones', seller: 'Admin', status: 'Published' },
        'Smart Watch': { imageUrl: 'https://picsum.photos/seed/smartwatch/400/400', extraImages: ['https://picsum.photos/seed/smartwatch2/400/400'], brand: 'TechFit', slug: 'smart-watch', seller: 'Admin', status: 'Published' },
        'Cotton T-Shirt': { imageUrl: 'https://picsum.photos/seed/tshirt/400/400', extraImages: ['https://picsum.photos/seed/tshirt2/400/400', 'https://picsum.photos/seed/tshirt3/400/400'], brand: 'ComfortWear', slug: 'cotton-t-shirt', seller: 'Admin', status: 'Published' },
        'Running Shoes': { imageUrl: 'https://picsum.photos/seed/runshoes/400/400', extraImages: ['https://picsum.photos/seed/runshoes2/400/400'], brand: 'SpeedRun', slug: 'running-shoes', seller: 'Admin', status: 'Published' },
        'Garden Tool Set': { imageUrl: 'https://picsum.photos/seed/gardentools/400/400', extraImages: [], brand: 'GreenThumb', slug: 'garden-tool-set', seller: 'Admin', status: 'Published' },
        'JavaScript Guide': { imageUrl: 'https://picsum.photos/seed/jsbook/400/400', extraImages: [], brand: 'CodePress', slug: 'javascript-guide', seller: 'Admin', status: 'Draft' },
        'Bluetooth Speaker': { imageUrl: 'https://picsum.photos/seed/speaker/400/400', extraImages: ['https://picsum.photos/seed/speaker2/400/400'], brand: 'SoundMax', slug: 'bluetooth-speaker', seller: 'Admin', status: 'Published' },
        'Yoga Mat': { imageUrl: 'https://picsum.photos/seed/yogamat/400/400', extraImages: [], brand: 'ZenFlex', slug: 'yoga-mat', seller: 'Admin', status: 'Published' },
      }

      const bulkOps = productsWithoutImages.map((p: any) => {
        const mapping = imageMap[p.name]
        const updateDoc: Record<string, unknown> = { updatedAt: new Date() }
        if (mapping) {
          updateDoc.imageUrl = mapping.imageUrl
          updateDoc.images = toImageObjects(mapping.imageUrl, mapping.extraImages, p.name)
          if (!p.brand) updateDoc.brand = mapping.brand
          if (!p.slug) updateDoc.slug = mapping.slug
          if (!p.seller) updateDoc.seller = mapping.seller
          if (!p.status) updateDoc.status = mapping.status
        } else {
          // For any product not in the map, use a generic placeholder
          const fallbackUrl = `https://picsum.photos/seed/${encodeURIComponent(p.name?.replace(/\s+/g, '') || 'product')}/400/400`
          updateDoc.imageUrl = fallbackUrl
          updateDoc.images = toImageObjects(fallbackUrl, [], p.name)
          if (!p.slug) updateDoc.slug = p.name?.toLowerCase().replace(/[^\w\s-]/g, '').replace(/[\s_]+/g, '-') || ''
          if (!p.seller) updateDoc.seller = 'Admin'
          if (!p.status) updateDoc.status = 'Published'
        }
        return {
          updateOne: {
            filter: { _id: p._id },
            update: { $set: updateDoc },
          },
        }
      })

      if (bulkOps.length > 0) {
        await db.collection('products').bulkWrite(bulkOps)
      }
    }

    // Seed sample customers
    const customerCount = await db.collection('customers').countDocuments()
    if (customerCount === 0) {
      await db.collection('customers').insertMany([
        { name: 'John Smith', email: 'john@example.com', phone: '+1234567890', address: '123 Main St, NY', active: true, createdAt: new Date(), updatedAt: new Date() },
        { name: 'Sarah Johnson', email: 'sarah@example.com', phone: '+1987654321', address: '456 Oak Ave, LA', active: true, createdAt: new Date(), updatedAt: new Date() },
        { name: 'Mike Wilson', email: 'mike@example.com', phone: '+1122334455', address: '789 Pine Rd, Chicago', active: true, createdAt: new Date(), updatedAt: new Date() },
        { name: 'Emily Davis', email: 'emily@example.com', phone: '+1555666777', address: '321 Elm St, Houston', active: true, createdAt: new Date(), updatedAt: new Date() },
        { name: 'Alex Brown', email: 'alex@example.com', phone: '+1888999000', address: '654 Maple Dr, Phoenix', active: false, createdAt: new Date(), updatedAt: new Date() },
      ])
    }

    // Seed sample attributes (for product variants)
    const attributeCount = await db.collection('attributes').countDocuments()
    if (attributeCount === 0) {
      await db.collection('attributes').insertMany([
        { name: 'Color', description: 'Product color variant', type: 'text', values: ['Red', 'Blue', 'Green', 'Black', 'White', 'Yellow', 'Pink', 'Purple', 'Orange', 'Brown', 'Grey', 'Navy', 'Beige', 'Maroon', 'Teal'], status: 'Active', createdAt: new Date(), updatedAt: new Date() },
        { name: 'Size', description: 'Product size variant', type: 'text', values: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', '28', '30', '32', '34', '36', '38', '40', '42', '44'], status: 'Active', createdAt: new Date(), updatedAt: new Date() },
        { name: 'Material', description: 'Product material type', type: 'text', values: ['Cotton', 'Polyester', 'Silk', 'Wool', 'Linen', 'Denim', 'Leather', 'Nylon', 'Rayon', 'Jute'], status: 'Active', createdAt: new Date(), updatedAt: new Date() },
        { name: 'RAM', description: 'Device RAM capacity', type: 'text', values: ['4 GB', '6 GB', '8 GB', '12 GB', '16 GB', '32 GB'], status: 'Active', createdAt: new Date(), updatedAt: new Date() },
        { name: 'Storage', description: 'Device storage capacity', type: 'text', values: ['64 GB', '128 GB', '256 GB', '512 GB', '1 TB'], status: 'Active', createdAt: new Date(), updatedAt: new Date() },
        { name: 'Weight', description: 'Product weight category', type: 'text', values: ['Lightweight', 'Medium', 'Heavy'], status: 'Active', createdAt: new Date(), updatedAt: new Date() },
      ])
    }

    // Seed sample tags (for product categorization)
    const tagCount = await db.collection('tags').countDocuments()
    if (tagCount === 0) {
      await db.collection('tags').insertMany([
        { name: 'New Arrival', category: 'General', status: 'Active', createdBy: 'Admin', createdAt: new Date(), updatedAt: new Date() },
        { name: 'Best Seller', category: 'General', status: 'Active', createdBy: 'Admin', createdAt: new Date(), updatedAt: new Date() },
        { name: 'Trending', category: 'General', status: 'Active', createdBy: 'Admin', createdAt: new Date(), updatedAt: new Date() },
        { name: 'Summer Sale', category: 'Seasonal', status: 'Active', createdBy: 'Admin', createdAt: new Date(), updatedAt: new Date() },
        { name: 'Winter Collection', category: 'Seasonal', status: 'Active', createdBy: 'Admin', createdAt: new Date(), updatedAt: new Date() },
        { name: 'Premium', category: 'Quality', status: 'Active', createdBy: 'Admin', createdAt: new Date(), updatedAt: new Date() },
        { name: 'Budget Friendly', category: 'Quality', status: 'Active', createdBy: 'Admin', createdAt: new Date(), updatedAt: new Date() },
        { name: 'Limited Edition', category: 'General', status: 'Active', createdBy: 'Admin', createdAt: new Date(), updatedAt: new Date() },
        { name: 'Mens', category: 'Gender', status: 'Active', createdBy: 'Admin', createdAt: new Date(), updatedAt: new Date() },
        { name: 'Womens', category: 'Gender', status: 'Active', createdBy: 'Admin', createdAt: new Date(), updatedAt: new Date() },
        { name: 'Unisex', category: 'Gender', status: 'Active', createdBy: 'Admin', createdAt: new Date(), updatedAt: new Date() },
        { name: 'Kids', category: 'Gender', status: 'Active', createdBy: 'Admin', createdAt: new Date(), updatedAt: new Date() },
        { name: 'Cotton', category: 'Material', status: 'Active', createdBy: 'Admin', createdAt: new Date(), updatedAt: new Date() },
        { name: 'Silk', category: 'Material', status: 'Active', createdBy: 'Admin', createdAt: new Date(), updatedAt: new Date() },
        { name: 'Handloom', category: 'Material', status: 'Active', createdBy: 'Admin', createdAt: new Date(), updatedAt: new Date() },
      ])
    }

    // Update schema documentation
    const schemaDocs = [
      {
        collection: 'admins',
        description: 'Admin users who have access to the admin panel. Contains authentication credentials and role information.',
        fields: JSON.stringify([
          { name: '_id', type: 'ObjectId', required: true, description: 'Unique identifier' },
          { name: 'email', type: 'String', required: true, description: 'Admin email address (unique)' },
          { name: 'password', type: 'String', required: true, description: 'Bcrypt hashed password' },
          { name: 'name', type: 'String', required: true, description: 'Admin display name' },
          { name: 'role', type: 'String', required: false, description: 'Admin role (default: admin)' },
          { name: 'createdAt', type: 'Date', required: false, description: 'Record creation timestamp' },
          { name: 'updatedAt', type: 'Date', required: false, description: 'Record update timestamp' },
        ]),
        indexes: JSON.stringify([
          { field: 'email', type: 'unique' },
        ]),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        collection: 'products',
        description: 'Product catalog containing all items available for sale. Includes pricing, inventory, and categorization.',
        fields: JSON.stringify([
          { name: '_id', type: 'ObjectId', required: true, description: 'Unique identifier' },
          { name: 'name', type: 'String', required: true, description: 'Product name' },
          { name: 'description', type: 'String', required: false, description: 'Product description' },
          { name: 'price', type: 'Double', required: true, description: 'Product price in USD' },
          { name: 'category', type: 'String', required: false, description: 'Product category reference' },
          { name: 'imageUrl', type: 'String', required: false, description: 'Product image URL' },
          { name: 'stock', type: 'Int', required: false, description: 'Available inventory count' },
          { name: 'active', type: 'Boolean', required: false, description: 'Product availability status' },
          { name: 'createdAt', type: 'Date', required: false, description: 'Record creation timestamp' },
          { name: 'updatedAt', type: 'Date', required: false, description: 'Record update timestamp' },
        ]),
        indexes: JSON.stringify([
          { field: 'name', type: 'normal' },
          { field: 'category', type: 'normal' },
        ]),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        collection: 'categories',
        description: 'Product categories for organizing the product catalog into logical groups.',
        fields: JSON.stringify([
          { name: '_id', type: 'ObjectId', required: true, description: 'Unique identifier' },
          { name: 'name', type: 'String', required: true, description: 'Category name (unique)' },
          { name: 'description', type: 'String', required: false, description: 'Category description' },
          { name: 'active', type: 'Boolean', required: false, description: 'Category active status' },
          { name: 'createdAt', type: 'Date', required: false, description: 'Record creation timestamp' },
          { name: 'updatedAt', type: 'Date', required: false, description: 'Record update timestamp' },
        ]),
        indexes: JSON.stringify([
          { field: 'name', type: 'unique' },
        ]),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        collection: 'customers',
        description: 'Registered customers with contact information and account status.',
        fields: JSON.stringify([
          { name: '_id', type: 'ObjectId', required: true, description: 'Unique identifier' },
          { name: 'name', type: 'String', required: true, description: 'Customer full name' },
          { name: 'email', type: 'String', required: true, description: 'Customer email address (unique)' },
          { name: 'phone', type: 'String', required: false, description: 'Customer phone number' },
          { name: 'address', type: 'String', required: false, description: 'Customer shipping address' },
          { name: 'active', type: 'Boolean', required: false, description: 'Account active status' },
          { name: 'createdAt', type: 'Date', required: false, description: 'Record creation timestamp' },
          { name: 'updatedAt', type: 'Date', required: false, description: 'Record update timestamp' },
        ]),
        indexes: JSON.stringify([
          { field: 'email', type: 'unique' },
        ]),
        version: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    for (const schemaDoc of schemaDocs) {
      await db.collection('dbschemas').updateOne(
        { collection: schemaDoc.collection },
        { $set: schemaDoc },
        { upsert: true }
      )
    }

    // ── Seed sample reviews with media ──────────────────────────────────
    const seedReviewCount = await db.collection('reviews').countDocuments({ customerId: { $regex: /^seed-cust-/ } })
    if (seedReviewCount === 0) {
      // Get all published products to create reviews for
      const publishedProducts = await db.collection('products')
        .find({ status: 'Published', active: true })
        .project({ _id: 1, name: 1, sellerId: 1, seller: 1 })
        .limit(8)
        .toArray()

      if (publishedProducts.length > 0) {
        // Sample reviewer profiles
        const reviewers = [
          { name: 'Rahul Sharma', id: 'seed-cust-001' },
          { name: 'Priya Patel', id: 'seed-cust-002' },
          { name: 'Amit Kumar', id: 'seed-cust-003' },
          { name: 'Sneha Reddy', id: 'seed-cust-004' },
          { name: 'Vikram Singh', id: 'seed-cust-005' },
          { name: 'Ananya Das', id: 'seed-cust-006' },
          { name: 'Karthik Nair', id: 'seed-cust-007' },
          { name: 'Meera Joshi', id: 'seed-cust-008' },
          { name: 'Arjun Menon', id: 'seed-cust-009' },
          { name: 'Divya Iyer', id: 'seed-cust-010' },
          { name: 'Rohan Gupta', id: 'seed-cust-011' },
          { name: 'Pooja Verma', id: 'seed-cust-012' },
        ]

        // Cloudinary sample URLs (publicly accessible demo assets).
        // IMPORTANT: Only use URLs verified to return HTTP 200. Previous
        // versions included c_lady_portrait.jpg, c_lady_portrait_hevc.mp4.png,
        // and cld960s.mp4 which all 404 on the demo cloud — causing review
        // media to silently fall back to gray placeholders.
        const sampleImageUrls = [
          'https://res.cloudinary.com/demo/image/upload/sample.jpg',
          'https://res.cloudinary.com/demo/image/upload/w_400,h_400,c_fill,g_face,r_max/woman.png',
          'https://res.cloudinary.com/demo/image/upload/w_400,h_400,c_fill,g_face,r_max/man.png',
        ]
        const sampleVideoUrls = [
          'https://res.cloudinary.com/demo/video/upload/dog.mp4',
        ]

        const reviewDocs: Array<Record<string, unknown>> = []
        const reviewSeedIds: string[] = [] // Track seed IDs in same order as reviewDocs
        const mediaDocs: Array<Record<string, unknown>> = []
        const replyDocs: Array<Record<string, unknown>> = []
        const helpfulnessDocs: Array<Record<string, unknown>> = []

        // Review templates for different product types and ratings
        const reviewTemplates = [
          // 5-star reviews
          { rating: 5, title: 'Excellent product!', comment: 'Absolutely love this product! The quality is outstanding and it exceeded my expectations. Would definitely recommend to everyone looking for a great product in this category.', pros: 'Superior quality, great value for money, fast delivery', cons: '' },
          { rating: 5, title: 'Worth every penny', comment: 'This is hands down the best purchase I have made this year. The build quality is premium and it works flawlessly. Very happy with my purchase!', pros: 'Premium build quality, excellent performance', cons: '' },
          { rating: 5, title: 'Amazing quality', comment: 'I was skeptical at first but this product really delivers. The material is top-notch and the finishing is perfect. Highly recommended!', pros: 'Great material, perfect finish, durable', cons: 'Slightly expensive' },

          // 4-star reviews
          { rating: 4, title: 'Very good product', comment: 'Really good product overall. The quality is nice and it works well for my needs. Minor improvements could make it perfect.', pros: 'Good quality, comfortable, nice design', cons: 'Could be slightly better packaging' },
          { rating: 4, title: 'Great value for money', comment: 'For the price, this is a fantastic product. It does exactly what it promises and the quality is better than expected at this price point.', pros: 'Affordable, good performance, reliable', cons: 'Color slightly different from images' },
          { rating: 4, title: 'Good purchase', comment: 'I bought this after reading many positive reviews and I agree with most of them. Solid product with a few minor areas for improvement.', pros: 'Solid build, works as described, easy to use', cons: 'Delivery took longer than expected' },

          // 3-star reviews
          { rating: 3, title: 'Decent for the price', comment: 'It is an okay product for the price range. Nothing extraordinary but it gets the job done. Expected a bit more based on the product listing.', pros: 'Affordable price', cons: 'Average quality, could be improved' },
          { rating: 3, title: 'Average product', comment: 'The product is decent but nothing special. It works fine for basic use but I expected better quality. The description was a bit misleading.', pros: 'Works for basic needs', cons: 'Quality not as expected, packaging was damaged' },

          // 2-star reviews
          { rating: 2, title: 'Not up to the mark', comment: 'Disappointed with the quality. The product looks better in pictures than in reality. Not worth the price I paid for it.', pros: 'Design is okay', cons: 'Poor quality material, overpriced' },
          { rating: 2, title: 'Below expectations', comment: 'I had high hopes but the product fell short. The material feels cheap and the finish is rough. Would not buy again.', pros: '', cons: 'Cheap material, rough finish, not durable' },

          // 1-star review
          { rating: 1, title: 'Very disappointing', comment: 'The product I received was damaged and the quality is very poor. Completely different from what was shown in the listing. Requesting a return.', pros: '', cons: 'Damaged on arrival, poor quality, misleading listing' },
        ]

        // Create varied reviews for each product
        for (let pIdx = 0; pIdx < publishedProducts.length; pIdx++) {
          const product = publishedProducts[pIdx]
          const productId = product._id.toString()
          const sellerId = (product.sellerId as string) || ''
          const sellerName = (product.seller as string) || 'Seller'

          // Each product gets 3-6 reviews with a mix of ratings
          const numReviews = pIdx === 0 ? 6 : (3 + Math.floor(Math.random() * 4))
          const selectedTemplates = []

          // Ensure a good distribution: mostly positive, some neutral, few negative
          if (pIdx === 0) {
            // First product gets all templates for maximum demo
            selectedTemplates.push(0, 1, 2, 3, 4, 5)
          } else {
            // Other products get a random selection weighted towards positive
            const positiveIdxs = [0, 1, 2, 3, 4, 5]
            const neutralIdxs = [6, 7]
            const negativeIdxs = [8, 9, 10]

            // 2-4 positive
            const numPositive = 2 + Math.floor(Math.random() * 3)
            for (let i = 0; i < numPositive && i < positiveIdxs.length; i++) {
              selectedTemplates.push(positiveIdxs[i])
            }
            // 0-1 neutral
            if (Math.random() > 0.4) {
              selectedTemplates.push(neutralIdxs[Math.floor(Math.random() * neutralIdxs.length)])
            }
            // 0-1 negative
            if (Math.random() > 0.6) {
              selectedTemplates.push(negativeIdxs[Math.floor(Math.random() * negativeIdxs.length)])
            }
          }

          for (let rIdx = 0; rIdx < Math.min(numReviews, selectedTemplates.length); rIdx++) {
            const template = reviewTemplates[selectedTemplates[rIdx]]
            if (!template) continue

            const reviewer = reviewers[(pIdx * 3 + rIdx) % reviewers.length]
            const reviewIdStr = `seed-review-${pIdx}-${rIdx}`
            const now = new Date()
            // Spread review dates over the last 30 days
            now.setDate(now.getDate() - Math.floor(Math.random() * 30))
            now.setHours(Math.floor(Math.random() * 12) + 8, Math.floor(Math.random() * 60))

            // Determine if this review has media (40% chance for first product, 25% for others)
            const hasMedia = pIdx === 0
              ? (rIdx < 3) // First 3 reviews of first product have media
              : Math.random() < 0.25

            // Determine media count and types
            let numImages = 0
            let numVideos = 0
            if (hasMedia) {
              numImages = 1 + Math.floor(Math.random() * 3) // 1-3 images
              if (Math.random() > 0.5) {
                numVideos = 1 // 50% chance of a video
              }
            }

            const reviewDoc: Record<string, unknown> = {
              productId,
              orderId: `SEED-ORD-${pIdx}-${rIdx}`,
              orderItemId: `seed-item-${pIdx}-${rIdx}`,
              customerId: reviewer.id,
              customerName: reviewer.name,
              rating: template.rating,
              title: template.title,
              comment: template.comment,
              pros: template.pros,
              cons: template.cons,
              variant: '',
              sellerId,
              verified: rIdx < 2, // First 2 reviews are "verified purchase"
              hasMedia: hasMedia && (numImages > 0 || numVideos > 0),
              helpful: Math.floor(Math.random() * 15),
              notHelpful: Math.floor(Math.random() * 3),
              status: 'active',
              createdAt: now,
              updatedAt: now,
            }
            reviewDocs.push(reviewDoc)
            reviewSeedIds.push(reviewIdStr)

            // Create media documents
            if (numImages > 0) {
              for (let mIdx = 0; mIdx < numImages; mIdx++) {
                const imgUrl = sampleImageUrls[(pIdx + mIdx) % sampleImageUrls.length]
                mediaDocs.push({
                  reviewId: reviewIdStr,
                  productId,
                  mediaType: 'image',
                  url: imgUrl,
                  publicId: `seed/review-img-${pIdx}-${rIdx}-${mIdx}`,
                  createdAt: now,
                })
              }
            }
            if (numVideos > 0) {
              for (let vIdx = 0; vIdx < numVideos; vIdx++) {
                const vidUrl = sampleVideoUrls[(pIdx + vIdx) % sampleVideoUrls.length]
                mediaDocs.push({
                  reviewId: reviewIdStr,
                  productId,
                  mediaType: 'video',
                  url: vidUrl,
                  publicId: `seed/review-vid-${pIdx}-${rIdx}-${vIdx}`,
                  createdAt: now,
                })
              }
            }

            // Create seller replies for some reviews (30% chance, only for verified reviews)
            if (reviewDoc.verified && Math.random() > 0.7) {
              const replyDate = new Date(now)
              replyDate.setDate(replyDate.getDate() + 1 + Math.floor(Math.random() * 3))
              replyDocs.push({
                reviewId: reviewIdStr,
                sellerId,
                sellerName,
                comment: 'Thank you for your valuable feedback! We appreciate your review and are glad you enjoyed our product.',
                createdAt: replyDate,
              })
            }

            // Create helpfulness votes (random votes from other customers)
            if ((reviewDoc.helpful as number) > 0) {
              const numVoters = Math.min(reviewDoc.helpful as number, 3)
              for (let vIdx = 0; vIdx < numVoters; vIdx++) {
                const voter = reviewers[(pIdx * 3 + rIdx + vIdx + 2) % reviewers.length]
                helpfulnessDocs.push({
                  reviewId: reviewIdStr,
                  customerId: voter.id,
                  vote: 'helpful',
                  createdAt: now,
                  updatedAt: now,
                })
              }
            }
          }
        }

        // Insert review documents
        if (reviewDocs.length > 0) {
          const insertedReviews = await db.collection('reviews').insertMany(reviewDocs)
          const insertedIds = Object.values(insertedReviews.insertedIds)

          // Update review_media docs with actual inserted _id strings
          // The reviewId in media docs uses our seed-ids, but the actual _id is different
          // We need to map our seed-ids to the actual inserted _ids
          const seedIdToActualId = new Map<string, string>()
          for (let i = 0; i < reviewDocs.length; i++) {
            const seedId = reviewSeedIds[i]
            const actualId = insertedIds[i]?.toString()
            if (seedId && actualId) {
              seedIdToActualId.set(seedId, actualId)
            }
          }

          // Update all docs that reference reviewId
          for (const mediaDoc of mediaDocs) {
            const actualId = seedIdToActualId.get(mediaDoc.reviewId as string)
            if (actualId) mediaDoc.reviewId = actualId
          }
          for (const replyDoc of replyDocs) {
            const actualId = seedIdToActualId.get(replyDoc.reviewId as string)
            if (actualId) replyDoc.reviewId = actualId
          }
          for (const helpfulDoc of helpfulnessDocs) {
            const actualId = seedIdToActualId.get(helpfulDoc.reviewId as string)
            if (actualId) helpfulDoc.reviewId = actualId
          }

          // Insert media, replies, and helpfulness docs
          if (mediaDocs.length > 0) {
            await db.collection('review_media').insertMany(mediaDocs)
          }
          if (replyDocs.length > 0) {
            await db.collection('review_replies').insertMany(replyDocs)
          }
          if (helpfulnessDocs.length > 0) {
            await db.collection('review_helpfulness').insertMany(helpfulnessDocs)
          }

          // Build product_rating_summary for all products with reviews
          const ratingPipeline = [
            { $match: { status: 'active' } },
            {
              $group: {
                _id: '$productId',
                avgRating: { $avg: '$rating' },
                totalReviews: { $sum: 1 },
                rating1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
                rating2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
                rating3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
                rating4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
                rating5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
              },
            },
          ]

          const ratingResults = await db.collection('reviews').aggregate(ratingPipeline).toArray()

          for (const rs of ratingResults) {
            const avgRating = Math.round((rs.avgRating || 0) * 10) / 10
            await db.collection('product_rating_summary').updateOne(
              { productId: rs._id },
              {
                $set: {
                  avgRating,
                  totalReviews: rs.totalReviews,
                  rating1Count: rs.rating1,
                  rating2Count: rs.rating2,
                  rating3Count: rs.rating3,
                  rating4Count: rs.rating4,
                  rating5Count: rs.rating5,
                  updatedAt: new Date(),
                },
                $setOnInsert: {
                  productId: rs._id,
                  createdAt: new Date(),
                },
              },
              { upsert: true }
            )
          }

          console.log(`[Seed] Created ${reviewDocs.length} reviews, ${mediaDocs.length} media, ${replyDocs.length} replies, ${helpfulnessDocs.length} helpfulness votes`)
        }
      }
    } else {
      // Reviews already exist — ensure product_rating_summary is up to date
      const ratingPipeline = [
        { $match: { status: 'active' } },
        {
          $group: {
            _id: '$productId',
            avgRating: { $avg: '$rating' },
            totalReviews: { $sum: 1 },
            rating1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
            rating2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
            rating3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
            rating4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
            rating5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
          },
        },
      ]

      const ratingResults = await db.collection('reviews').aggregate(ratingPipeline).toArray()

      for (const rs of ratingResults) {
        const avgRating = Math.round((rs.avgRating || 0) * 10) / 10
        await db.collection('product_rating_summary').updateOne(
          { productId: rs._id },
          {
            $set: {
              avgRating,
              totalReviews: rs.totalReviews,
              rating1Count: rs.rating1,
              rating2Count: rs.rating2,
              rating3Count: rs.rating3,
              rating4Count: rs.rating4,
              rating5Count: rs.rating5,
              updatedAt: new Date(),
            },
            $setOnInsert: {
              productId: rs._id,
              createdAt: new Date(),
            },
          },
          { upsert: true }
        )
      }
    }

    // ── Seed demo delivery boy ─────────────────────────────────────────
    const existingDeliveryBoy = await db.collection('delivery_boys').findOne({ mobile: '9999999999' })
    if (!existingDeliveryBoy) {
      const hashedPasscode = await bcrypt.hash('123456', 10)
      await db.collection('delivery_boys').insertOne({
        name: 'Raj Kumar',
        mobile: '9999999999',
        passcodeHash: hashedPasscode,
        role: 'delivery_boy',
        status: 'Active',
        isAvailable: true,
        vehicleType: 'motorcycle',
        vehicleNumber: 'MH-01-AB-5678',
        address: '45 Station Road, Mumbai, Maharashtra 400001',
        aadhaarNumber: '123456789012',
        panNumber: 'ABCDE1234F',
        profileImage: '',
        failedLoginAttempts: 0,
        lastLoginAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
    }

    // ── Migration: Fix legacy status value 'Publish' → 'Published' ──────
    // Earlier versions of the codebase used 'Publish' as the status value,
    // but the standard is 'Published' (past tense). This migration updates
    // any existing products that still have the old value.
    try {
      const legacyResult = await db.collection('products').updateMany(
        { status: 'Publish' },
        { $set: { status: 'Published', updatedAt: new Date() } }
      )
      if (legacyResult.modifiedCount > 0) {
        console.log(`[Seed Migration] Updated ${legacyResult.modifiedCount} products: 'Publish' → 'Published'`)
      }
    } catch (migrationErr) {
      console.warn('[Seed Migration] Failed to update legacy status values:', migrationErr)
    }

    return NextResponse.json({ success: true, message: 'Database seeded successfully' })
  } catch (error) {
    console.error('Seed error:', error)
    return NextResponse.json({ success: false, error: String(error) }, { status: 500 })
  }
}
