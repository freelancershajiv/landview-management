import { redirect } from "next/navigation";

export default function LegacyBillEditorPage() {
  redirect("/admin/finance/adjustments");
}
