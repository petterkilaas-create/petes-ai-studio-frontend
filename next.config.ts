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
  async redirects() {
    return [
      {
        // TG-NEW-153: Express heter Tjenester (Petter 05.10, valg A). 307,
        // ikke 308, saa nettleseren ikke husker den. Kjoeres foer proxyen
        // (proxy.md, Execution order); proxyen krever innlogging paa
        // /tjenester etterpaa. Eksakt kilde: /express-v2 treffes ikke.
        // Maalet er SERVICES_PATH i app/lib/services.ts (testen sjekker det).
        source: "/express",
        destination: "/tjenester",
        permanent: false,
      },
    ];
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
