/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  /* A verification build goes to .next-verify so it never clobbers the chunks
     the running dev server is serving (npm run build:check). Same rule as the
     DBF Hub, learned there the hard way. */
  distDir: process.env.NEXT_DIST_DIR || '.next',
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          /* SAMEORIGIN rather than DENY: the assessor tool previews the client
             status page and the unit specification in same-origin iframes. */
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
