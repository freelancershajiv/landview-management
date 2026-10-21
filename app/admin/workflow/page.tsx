import { redirect } from "next/navigation";

export default function WorkflowRedirectPage() {
  redirect("/admin/project-operations/by-project");
}
