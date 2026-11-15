import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/account",
          "/admin",
          "/api",
          "/certificate",
          "/client",
          "/employee",
          "/login",
          "/owner-access",
          "/projectmanagement",
          "/verify",
        ],
      },
    ],
    sitemap: ["https://www.landview.com.bd/sitemap.xml", "https://www.landview.com.bd/projects/sitemap.xml"],
    host: "https://www.landview.com.bd",
  };
}
