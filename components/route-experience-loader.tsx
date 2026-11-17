"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";

// Keep public marketing / tracking bundles out of authenticated portal routes.
// Each existing feature retains its own route/hostname checks and behavior.
const PublicLeadActions = dynamic(() => import("@/components/public-lead-actions"));
const PublicHomeProjectEnhancer = dynamic(() => import("@/components/public-home-project-enhancer"));
const VisitorAnalytics = dynamic(() => import("@/components/visitor-analytics"));
const ConversionAnalytics = dynamic(() => import("@/components/conversion-analytics"));
const ContactMapEnhancer = dynamic(() => import("@/components/contact-map-enhancer"));
const WebsiteLeadNotifier = dynamic(() => import("@/components/website-lead-notifier"));

const PUBLIC_PREFIXES = ["/services", "/projects", "/team", "/contact", "/feni", "/bn", "/case-studies"];

function isPublicMarketingPath(pathname: string) {
  return pathname === "/" || PUBLIC_PREFIXES.some((prefix) =>
    pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export default function RouteExperienceLoader() {
  const pathname = usePathname() || "/";
  const isPublic = isPublicMarketingPath(pathname);
  const isAdmin = pathname === "/admin" || pathname.startsWith("/admin/");

  return (
    <>
      {isPublic ? (
        <>
          <PublicLeadActions />
          <PublicHomeProjectEnhancer />
          <VisitorAnalytics />
          <ConversionAnalytics />
          <ContactMapEnhancer />
        </>
      ) : null}
      {isAdmin ? <WebsiteLeadNotifier /> : null}
    </>
  );
}
