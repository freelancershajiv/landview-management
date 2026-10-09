"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const items = [
  { href: "/admin", label: "Home", icon: "⌂" },
  { href: "/admin/projects", label: "Projects", icon: "▣" },
  { href: "/admin/site-visits", label: "Visits", icon: "⌖" },
  { href: "/admin/finance", label: "Billing", icon: "৳" },
] as const;

function active(pathname: string, href: string) {
  if (href === "/admin") return pathname === href;
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function AdminMobileDock() {
  const pathname = usePathname();

  return (
    <nav className="lv-mobile-dock" aria-label="Admin quick navigation">
      {items.map((item) => {
        const selected = active(pathname, item.href);
        return (
          <Link key={item.href} href={item.href} className={selected ? "active" : ""} aria-current={selected ? "page" : undefined}>
            <span className="lv-mobile-dock-icon" aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
