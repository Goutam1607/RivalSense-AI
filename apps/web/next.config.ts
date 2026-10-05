import path from "node:path";
import type { NextConfig } from "next";

// One .env for the whole monorepo lives in the repo root; npm scripts load it with dotenv-cli.

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false,
  serverExternalPackages: ["@react-pdf/renderer", "pg"],
  typedRoutes: false,
  experimental: { serverActions: { bodySizeLimit: "6mb" } }, // CSV review uploads (5 MB cap enforced in the action)
  turbopack: { root: path.resolve(__dirname, "../..") },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
