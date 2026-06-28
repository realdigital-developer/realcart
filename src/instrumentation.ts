/**
 * Next.js Instrumentation Hook
 *
 * Runs once when the Next.js server starts. We use it to:
 * 1. Register global error handlers (resilient — don't crash the dev server)
 * 2. Start MongoDB connection in the background (NON-BLOCKING)
 * 3. Validate Cloudinary configuration and log status
 *
 * CRITICAL DESIGN: MongoDB connection is started but NOT awaited.
 * The server starts immediately and accepts requests. MongoDB will
 * connect in the background, and the first API request that needs
 * the database will await the connection if it hasn't completed yet.
 *
 * Error handlers are NON-FATAL in development — they log errors but
 * do NOT exit the process. This prevents the dev server from crashing
 * on transient errors (like MongoDB connection timeouts).
 */

export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // ── 1. Global error handlers ──
    // Unhandled rejections are logged but don't crash the server
    // (they're usually from failed DB queries that the route handler catches).
    process.on('unhandledRejection', (reason: unknown) => {
      console.error('[Global] Unhandled Rejection (non-fatal):', reason)
      // Do NOT exit — these are usually from DB operations that have their own error handling
    })

    // Uncaught exceptions are logged but we do NOT exit the process.
    // In production, uncaught exceptions can leave the process in an inconsistent state,
    // but in development, crashing on every error would make the dev server unusable.
    // The process manager (if any) will handle restarts if needed.
    process.on('uncaughtException', (error: Error) => {
      console.error('[Global] Uncaught Exception (logged, not exiting):', error.message)
      console.error('[Global] Stack:', error.stack)
      // Do NOT exit — let the dev server continue running.
      // If the error is truly fatal, the request that triggered it will fail
      // and the developer can fix it.
    })

    console.log('[Instrumentation] Global error handlers registered')

    // ── 1.5 Process exit logging ──
    // Log when the process is about to exit, so we can understand crashes
    process.on('exit', (code) => {
      console.log(`[Instrumentation] Process exiting with code: ${code}`)
    })
    process.on('SIGTERM', () => {
      console.log('[Instrumentation] Received SIGTERM — shutting down gracefully')
    })
    process.on('SIGINT', () => {
      console.log('[Instrumentation] Received SIGINT — shutting down gracefully')
    })

    // ── 2. Start MongoDB connection in the background (NON-BLOCKING) ──
    // We import and call connectToDatabase() but do NOT await it.
    // The server starts immediately and the first API request that
    // needs the database will await the connection promise.
    console.log('[Instrumentation] Starting MongoDB connection (background)...')
    import('@/lib/mongodb').then(({ connectToDatabase }) => {
      connectToDatabase()
        .then(() => {
          console.log('[Instrumentation] MongoDB connected — server ready for traffic')
        })
        .catch((error: Error) => {
          // Connection failure is non-fatal — the server will retry on the first request
          console.warn('[Instrumentation] MongoDB connection failed (will retry on first request):', error.message)
        })
    }).catch((error: Error) => {
      console.warn('[Instrumentation] Could not import mongodb module (non-fatal):', error.message)
    })

    // ── 3. Validate Cloudinary configuration ──
    try {
      const { validateCloudinaryStartup } = await import('@/lib/cloudinary-config')
      const result = validateCloudinaryStartup()
      if (result.valid) {
        console.log(`[Instrumentation] Cloudinary configured — cloud: ${result.config.cloudName}`)
      } else {
        console.warn('[Instrumentation] Cloudinary NOT configured — image uploads will fail')
      }
    } catch (error) {
      console.warn('[Instrumentation] Cloudinary validation failed (non-fatal):', error)
    }
  }
}
