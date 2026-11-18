import { updateRows } from "@/lib/supabase-data";
import { assertTodoDependencies, type TodoItem } from "@/lib/todo-data";
import { reviewTransition, type ReviewAction } from "@/lib/todo-review-policy";

export async function applyTodoReview(todo: TodoItem, todos: readonly TodoItem[], action: ReviewAction, role: "employee" | "management", expectedUpdatedAt: string, note: unknown, actor: string) {
  if (!todo.id || !todo.updated_at || expectedUpdatedAt !== todo.updated_at) {
    throw new Error("Task changed. Refresh before taking a review action.");
  }
  if (action === "submit" || action === "approve") assertTodoDependencies(todo, todos);
  const changes = reviewTransition(todo, action, role, note);
  const now = new Date().toISOString();
  const updated = await updateRows("todo_items", { id: todo.id, updated_at: expectedUpdatedAt }, {
    ...changes, review_actor: actor.slice(0, 160), review_changed_at: now, updated_at: now,
  });
  if (updated.length !== 1) throw new Error("Task changed. Refresh before taking a review action.");
  return updated[0] as TodoItem;
}
