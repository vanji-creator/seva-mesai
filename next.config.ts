import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships WASM + native fs access; keep it out of the bundle (local dev only).
  serverExternalPackages: ["@electric-sql/pglite"],
  // The Evals page reads eval/results.json at runtime; make sure it ships with the serverless function.
  // Sample deeds let reviewers try the reader without their own files.
  outputFileTracingIncludes: {
    "/evals": ["./eval/results.json"],
    "/applications/[id]": ["./eval/docs/**/*"],
  },
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
};

export default nextConfig;
