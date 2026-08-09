import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
  experimental:
    process.env.NEXT_ACCEPTANCE_BUILD === "1" ? { cpus: 2 } : undefined,
};

export default nextConfig;
