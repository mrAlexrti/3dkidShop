import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: "/admin" },
    sitemap: "https://3dkid-shop-y8ut.vercel.app/sitemap.xml",
  };
}
