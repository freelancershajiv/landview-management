import { redirect } from "next/navigation";

export default function WebsiteReadinessRedirect() {
  redirect("/admin/public-portfolio");
}
