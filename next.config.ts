import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  experimental: {
    // One module per icon used, instead of the whole 1,500-icon barrel.
    optimizePackageImports: ["@phosphor-icons/react"],
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.public.blob.vercel-storage.com" },
      { protocol: "https", hostname: "i.pinimg.com" },
    ],
  },
  /*
   * TikTok's ownership file must answer at the root of the domain
   * (/tiktokXXXX.txt). It used to be a catch-all [file] route at the root,
   * which also caught every mistyped one-segment address and answered it with
   * raw JSON; now only names shaped like TikTok's file reach that route, and
   * everything else gets the studio's own not-found page. Same pattern as
   * TIKTOK_VERIFICATION_FILE in lib/auth.ts, which keeps it public.
   */
  async rewrites() {
    return [
      {
        source: "/:file(tiktok[A-Za-z0-9]+\\.txt)",
        destination: "/tiktok-verification/:file",
      },
    ];
  },
};

export default nextConfig;
