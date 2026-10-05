import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Enables the standalone server.js output consumed by frontend/Dockerfile.
  output: "standalone",
};

export default nextConfig;
