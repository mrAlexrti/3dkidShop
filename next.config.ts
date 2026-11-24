import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers() {
    const privateHeaders = [{ key: "Cache-Control", value: "private, no-store, max-age=0" }];
    return [
      { source: "/account/:path*", headers: [...privateHeaders, { key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/checkout", headers: privateHeaders },
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
