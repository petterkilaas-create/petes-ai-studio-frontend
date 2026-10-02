import type { MetadataRoute } from "next";
import { robotsFor } from "@/app/lib/seo";

// robots.txt (MS4). Foelger MARKETING_PUBLIC (app/lib/seo.ts). Bygges statisk.
export default function robots(): MetadataRoute.Robots {
  return robotsFor();
}
