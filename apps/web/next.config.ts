import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  serverExternalPackages: ["argon2", "mongoose", "bullmq", "ioredis", "chromadb"],
  transpilePackages: ["@secondseat/db"],
};

export default nextConfig;
