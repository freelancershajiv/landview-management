import AdminTodoBoard from "@/components/admin-todo-board";
import AdminTodoManagementDashboard from "@/components/admin-todo-management-dashboard";
import AdminTodoWorkloadCenter from "@/components/admin-todo-workload-center";
import AdminTodoWorkflowCenter from "@/components/admin-todo-workflow-center";
import TodoCollaborationCenter from "@/components/todo-collaboration-center";
import TodoChecklistCenter from "@/components/todo-checklist-center";
import AdminTodoTemplateCenter from "@/components/admin-todo-template-center";
import AdminTodoAutomationCenter from "@/components/admin-todo-automation-center";
import AdminTodoReminderCenter from "@/components/admin-todo-reminder-center";
import { requirePortalSession } from "@/lib/server-auth";

export default async function TodoPage() {
  await requirePortalSession(["admin", "manager"]);
  return <>
    <AdminTodoManagementDashboard />
    <AdminTodoWorkloadCenter />
    <AdminTodoBoard />
    <AdminTodoWorkflowCenter />
    <TodoChecklistCenter mode="admin" />
    <AdminTodoTemplateCenter />
    <AdminTodoAutomationCenter />
    <TodoCollaborationCenter mode="admin" />
    <AdminTodoReminderCenter />
  </>;
}
