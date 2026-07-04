import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // All state is client-side (IndexedDB) — RSC payloads never change per
    // navigation, so let the client router reuse them. Without this every
    // tab tap / minimize refetches from the server, which hangs painfully
    // in a gym dead zone.
    staleTimes: { dynamic: 300, static: 300 },
  },
};

export default nextConfig;

// Populate process.env with Cloudflare bindings/context during `next dev`.
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";
initOpenNextCloudflareForDev();
