import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Vercel IGNORES `output: "standalone"` — it has its own optimized build
  // output. This setting is kept for Docker / bare-metal / Render deployments.
  output: "standalone",

  typescript: {
    ignoreBuildErrors: true,
  },

  reactStrictMode: false,

  productionBrowserSourceMaps: false,

  // Allow the sandbox preview panel to access the dev server
  allowedDevOrigins: ["*.space-z.ai"],

  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "res.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "*.cloudinary.com",
      },
      {
        protocol: "https",
        hostname: "picsum.photos",
      },
      {
        protocol: "https",
        hostname: "z-cdn.chatglm.cn",
      },
    ],
  },

  // Externalize server-side packages — they are NOT bundled into the
  // server chunk but MUST be present in node_modules at runtime.
  serverExternalPackages: [
    "cloudinary",
    "googleapis",
    "googleapis-common",
    "bcryptjs",
    "jose",
    "mongodb",
    "razorpay",
    "pdfkit",
    "nodemailer",
  ],

  experimental: {
    optimizePackageImports: [
      "lucide-react",
      "framer-motion",
      "@radix-ui/react-icons",
      "date-fns",
    ],
    serverActions: {
      bodySizeLimit: "2mb",
    },
    // Disable route preloading at startup to keep memory usage low.
    // Vercel serverless functions compile on demand, so this setting
    // primarily benefits container / bare-metal deployments.
    preloadEntriesOnStart: false,
  },
};

export default nextConfig;
