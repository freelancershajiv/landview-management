type ProjectLike = Record<string, unknown> | null | undefined;

function clean(value: unknown) {
  return String(value ?? "").trim();
}

function first(project: ProjectLike, keys: string[]) {
  if (!project) return "";
  for (const key of keys) {
    const value = clean(project[key]);
    if (value) return value;
  }
  return "";
}

export function projectIdOf(project: ProjectLike) {
  return first(project, ["projectId", "projectCode", "project_code", "Project_ID", "File_ID", "file_id"]);
}

export function projectOwnerOf(project: ProjectLike) {
  return first(project, ["ownerName", "clientName", "client_name_snapshot", "Client_Name", "client_name", "Owner_Name"]);
}

export function projectStoryOf(project: ProjectLike) {
  return first(project, ["story", "numberOfStories", "number_of_stories_text", "Number_of_Stories", "Story", "floors", "Floors"]);
}

export function formatProjectIdentity(project: ProjectLike, fallback = "Project") {
  const parts = [projectIdOf(project), projectOwnerOf(project), projectStoryOf(project)].filter(Boolean);
  return parts.length ? parts.join(" · ") : fallback;
}
