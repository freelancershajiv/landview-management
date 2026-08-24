import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/login", "/admin/", "/employee/", "/client/", "/api/"],
      },
    ],
    sitemap: "https://landview.com.bd/sitemap.xml",
    host: "https://landview.com.bd",
  };
}
