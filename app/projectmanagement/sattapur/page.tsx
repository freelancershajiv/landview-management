import { redirect } from "next/navigation";

export default async function RetiredSupplierDeliveryPage({
  searchParams,
}: {
  searchParams: Promise<{ projectId?: string }>;
}) {
  const params = await searchParams;
  const projectId = String(params?.projectId || "").trim();
  redirect(projectId ? `/projectmanagement/expenses?projectId=${encodeURIComponent(projectId)}` : "/projectmanagement/expenses");
}
