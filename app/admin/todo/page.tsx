import AdminTodoWorkspace from "@/components/admin-todo-workspace";
import { requirePortalSession } from "@/lib/server-auth";

export default async function TodoPage() {
  await requirePortalSession(["admin", "manager"]);
  return <AdminTodoWorkspace />;
}
