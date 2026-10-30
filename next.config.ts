import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // PGlite ships WASM + native fs access; keep it out of the bundle (local dev only).
  serverExternalPackages: ["@electric-sql/pglite"],
  // Files read with fs at runtime must ship with the serverless functions:
  // eval results for the Evals page; case documents for "read again" and the demo sample uploads.
  outputFileTracingIncludes: {
    "/evals": ["./eval/results.json"],
    "/applications/[id]": ["./public/case-docs/**/*"],
  },
  experimental: { serverActions: { bodySizeLimit: "5mb" } },
  // The floating "N" dev badge sits over the queue; it never appears in production anyway.
  devIndicators: false,
};

export default nextConfig;
