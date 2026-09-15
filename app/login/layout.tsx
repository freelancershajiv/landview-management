import type { Metadata } from "next";
import LoginAdminOptionCleanup from "@/components/login-admin-option-cleanup";

export const metadata: Metadata = {
  robots: { index: false, follow: false, nocache: true },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return <><LoginAdminOptionCleanup />{children}</>;
}
