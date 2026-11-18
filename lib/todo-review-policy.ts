export type ReviewState = "not_submitted" | "submitted" | "revision_requested" | "approved";
export type ReviewAction = "enable" | "disable" | "submit" | "approve" | "revise";
export type ReviewTask = {
  status: "To Do" | "In Progress" | "Done";
  review_required?: boolean;
  review_state?: ReviewState;
  assigned_employee_id?: string | null;
  is_delivery_step?: boolean;
};
export function assertReviewCompletion(task: ReviewTask) {
  if (task.status !== "Done" && task.review_required && task.review_state !== "approved") {
    throw new Error("Management review must be approved before completing this task.");
  }
}
export function reviewTransition(task: ReviewTask, action: ReviewAction, role: "employee" | "management", inputNote: unknown) {
  if (task.status === "Done") throw new Error("Completed tasks cannot change review state.");
  const state = task.review_state || "not_submitted";
  const note = String(inputNote ?? "").trim().slice(0, 2000);
  if (action === "enable" || action === "disable") {
    if (role !== "management") throw new Error("Management permission is required.");
    if (state !== "not_submitted") throw new Error("Review settings cannot change after submission.");
    if (action === "enable" && task.is_delivery_step) throw new Error("Final delivery uses its existing financial verification rules.");
    if (Boolean(task.review_required) === (action === "enable")) throw new Error("Review requirement is already set.");
    return { review_required: action === "enable", review_state: "not_submitted" as ReviewState, review_note: null };
  }
  if (!task.review_required) throw new Error("Review is not enabled for this task.");
  if (action === "submit") {
    if (role !== "employee") throw new Error("Only the assigned employee may submit work for review.");
    if (task.status !== "In Progress") throw new Error("Start the task before submitting work.");
    if (state !== "not_submitted" && state !== "revision_requested") throw new Error("This task is already submitted or approved.");
    return { review_state: "submitted" as ReviewState, review_note: note || null };
  }
  if (role !== "management") throw new Error("Management permission is required.");
  if (state !== "submitted") throw new Error("Only submitted tasks can be reviewed.");
  if (action === "revise" && !note) throw new Error("A revision note is required.");
  if (action === "approve" || action === "revise") {
    return { review_state: (action === "approve" ? "approved" : "revision_requested") as ReviewState, review_note: note || null };
  }
  throw new Error("Unsupported review action.");
}
