import { redirect } from "next/navigation";

export default function LegacyProjectManagementV2Redirect() {
  redirect("/project-control/finance");
}
