import type { NextConfig } from "next";

const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()" },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
  {
    key: "Content-Security-Policy",
    value: [
      "default-src 'self'",
      "base-uri 'self'",
      "frame-ancestors 'none'",
      "object-src 'none'",
      "form-action 'self'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      "style-src 'self' 'unsafe-inline'",
      "script-src 'self' 'unsafe-inline'",
      "connect-src 'self'",
      "upgrade-insecure-requests",
    ].join("; "),
  },
];

const nextConfig: NextConfig = {
  turbopack: { root: process.cwd() },
  poweredByHeader: false,

  async headers() {
    return [{ source: "/(.*)", headers: securityHeaders }];
  },

  async redirects() {
    return [
      { source: "/", has: [{ type: "host", value: "app.landview.com.bd" }], destination: "/login", permanent: false },
      { source: "/login", has: [{ type: "host", value: "www.landview.com.bd" }], destination: "https://app.landview.com.bd/login", permanent: false },
      { source: "/admin/:path*", has: [{ type: "host", value: "www.landview.com.bd" }], destination: "https://app.landview.com.bd/admin/:path*", permanent: false },
      { source: "/employee/:path*", has: [{ type: "host", value: "www.landview.com.bd" }], destination: "https://app.landview.com.bd/employee/:path*", permanent: false },
      { source: "/client/:path*", has: [{ type: "host", value: "www.landview.com.bd" }], destination: "https://app.landview.com.bd/client/:path*", permanent: false },
    ];
  },
};

export default nextConfig;
