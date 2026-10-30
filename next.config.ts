import type { NextConfig } from "next";
import { fileURLToPath } from "node:url";

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    // This app lives inside a larger repo with its own lockfile; pin the workspace root here.
    root: fileURLToPath(new URL(".", import.meta.url)),
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  // Crunch-time safety (directive §5.4): a type error must never block a Vercel deploy during
  // the sprint. `npm run typecheck` still reports every error — keep it at zero.
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
