import { NextResponse } from "next/server";

/**
 * Lightweight health-check endpoint for Render (and other cloud platforms).
 *
 * Render's health check hits this URL repeatedly to decide whether the
 * service is "live". It MUST:
 *   - respond FAST (no DB queries, no external API calls)
 *   - return HTTP 200 with a small JSON body
 *   - never throw (a 500 here = Render marks the service as failed → 502)
 *
 * Do NOT add database checks, Cloudinary checks, or any I/O here.
 * Those belong in a separate /api/ready or /api/deep-health endpoint
 * if you ever need them. This endpoint is for liveness only.
 */
export async function GET() {
  return NextResponse.json(
    {
      ok: true,
      status: "healthy",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      runtime: process.env.NEXT_RUNTIME || "nodejs",
    },
    {
      status: 200,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate",
      },
    }
  );
}
