import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    root: process.cwd(),
  },

  // The public website and management portal share this deployment.
  // Visiting the app subdomain root sends users to the existing role login.
  async redirects() {
    return [
      {
        source: "/",
        has: [
          {
            type: "host",
            value: "app.landview.com.bd",
          },
        ],
        destination: "/login",
        permanent: false,
      },
    ];
  },
};

export default nextConfig;
