/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow all domains for proxying
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
        ],
      },
    ];
  },
};

module.exports = nextConfig;
