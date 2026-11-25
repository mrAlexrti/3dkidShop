import type { MetadataRoute } from "next";
import { siteOrigin } from "@/lib/seo-config";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/admin", "/api/"] },
    sitemap: `${siteOrigin}/sitemap.xml`,
  };
}
