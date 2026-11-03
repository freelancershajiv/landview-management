import AdminTodoBoard from "@/components/admin-todo-board";
import { requirePortalSession } from "@/lib/server-auth";

export default async function TodoPage() {
  await requirePortalSession(["admin", "manager"]);
  return <AdminTodoBoard />;
}
