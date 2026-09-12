"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { landViewApi, readSessionCache } from "@/lib/api";

function roleOf(value: unknown) {
  return String(value || "").trim().toLowerCase();
}

export default function AdminPublicProjectsCard() {
  const pathname = usePathname();
  const [canManage, setCanManage] = useState(false);

  useEffect(() => {
    if (pathname !== "/admin") return;

    const cached = readSessionCache();
    const cachedRole = roleOf(cached?.user?.role || cached?.user?.Role);
    if (cachedRole === "admin" || cachedRole === "manager") {
      setCanManage(true);
      return;
    }

    void landViewApi.getSession()
      .then((session) => {
        const role = roleOf(session?.user?.role || session?.user?.Role);
        setCanManage(role === "admin" || role === "manager");
      })
      .catch(() => setCanManage(false));
  }, [pathname]);

  if (pathname !== "/admin" || !canManage) return null;

  return (
    <section
      aria-labelledby="public-projects-dashboard-heading"
      style={{
        margin: "0 0 18px",
        padding: "18px 20px",
        border: "1px solid rgba(239,73,59,.28)",
        borderRadius: 12,
        background: "linear-gradient(135deg, rgba(239,73,59,.10), rgba(28,28,28,.96) 38%, rgba(20,20,20,.98))",
        display: "grid",
        gridTemplateColumns: "minmax(0,1fr) auto",
        gap: 18,
        alignItems: "center",
      }}
    >
      <div style={{ minWidth: 0 }}>
        <div style={{ color: "#ef766c", fontSize: 9, fontWeight: 800, letterSpacing: ".12em", textTransform: "uppercase", marginBottom: 6 }}>
          Public website
        </div>
        <h2 id="public-projects-dashboard-heading" style={{ margin: 0, color: "#fff", fontSize: 20, lineHeight: 1.2 }}>
          Choose which projects appear on landview.com.bd
        </h2>
        <p style={{ margin: "8px 0 0", color: "#aaa", fontSize: 11, lineHeight: 1.65, maxWidth: 760 }}>
          Publish or hide projects without exposing private client records. You can also set the public title, project category, area, stories, services, description, completion year and display order.
        </p>
      </div>

      <Link
        href="/admin/public-projects"
        style={{
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          minHeight: 40,
          padding: "0 16px",
          borderRadius: 8,
          background: "#ef493b",
          color: "#fff",
          textDecoration: "none",
          fontSize: 10,
          fontWeight: 800,
          whiteSpace: "nowrap",
        }}
      >
        Manage Public Projects →
      </Link>
    </section>
  );
}
