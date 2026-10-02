import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // MS2: felles norsk 404 (app/global-not-found.tsx) med to rot-layouter.
    globalNotFound: true,
  },
  images: {
    // MS4: AVIF foerst, WebP som reserve (AUDIT_MARKEDSSIDE §7, images.md).
    formats: ["image/avif", "image/webp"],
  },
  async headers() {
    return [
      {
        // MS4: Vercel-adressene (prod og forhaandsvisning) skal aldri
        // indekseres; markedssiden indekseres bare paa SITE_URL. Verdien
        // testes som ^verdi$ mot vertsnavnet uten port (headers.md).
        source: "/:path*",
        has: [{ type: "host", value: ".*\\.vercel\\.app" }],
        headers: [{ key: "X-Robots-Tag", value: "noindex" }],
      },
    ];
  },
};

export default nextConfig;
