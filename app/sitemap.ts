import type { MetadataRoute } from "next";
import { sitemapFor } from "@/app/lib/seo";

// sitemap.xml (MS4). Foelger MARKETING_PUBLIC (app/lib/seo.ts). Bygges statisk.
export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapFor();
}
