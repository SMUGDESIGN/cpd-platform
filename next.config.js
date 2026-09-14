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
          /* No page of this platform has any business inside anybody's iframe. */
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
          /* Once live, browsers are told to speak only TLS to this host for a
             year. Not set in development, where the dev server is plain http. */
          ...(process.env.NODE_ENV === 'production' ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }] : []),
        ],
      },
    ];
  },
};
module.exports = nextConfig;
