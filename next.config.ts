import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // MS2: felles norsk 404 (app/global-not-found.tsx) med to rot-layouter.
    globalNotFound: true,
  },
};

export default nextConfig;
