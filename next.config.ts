import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Resolve metadata before streaming so public notFound/redirect outcomes keep their HTTP status.
  htmlLimitedBots: /.*/,
  async headers() {
    const privateHeaders = [{ key: "Cache-Control", value: "private, no-store, max-age=0" }];
    const noindex = { key: "X-Robots-Tag", value: "noindex, nofollow" };
    const decorativeImageHeaders = [{ key: "X-Robots-Tag", value: "noindex" }];
    return [
      // Keep decorative fallbacks usable while keeping their original and optimized URLs out of image results.
      { source: "/hero/:asset(dragon|robot)-v1.webp", headers: decorativeImageHeaders },
      { source: "/_next/image", has: [{ type: "query", key: "url", value: "/hero/(?:dragon|robot)-v1[.]webp" }], headers: decorativeImageHeaders },
      { source: "/account/:path*", headers: [...privateHeaders, noindex, { key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/checkout/:path*", headers: [...privateHeaders, noindex] },
      { source: "/cart", headers: [noindex] },
      { source: "/login", headers: [noindex] },
      { source: "/admin/:path*", headers: [noindex] },
      { source: "/api/customer-auth/:path*", headers: [...privateHeaders, { key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
  images: {
    dangerouslyAllowSVG: true,
    remotePatterns: [
      { protocol: "https", hostname: "images.unsplash.com" },
      { protocol: "https", hostname: "**.supabase.co" },
      { protocol: "https", hostname: "res.cloudinary.com" },
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
    ],
  },
};

export default nextConfig;
