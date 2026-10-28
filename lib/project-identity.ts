type ProjectLike = Record<string, unknown> | null | undefined;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

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

export function normalizeProjectCode(value: unknown) {
  const raw = clean(value).toUpperCase();
  const match = raw.match(/^(?:LV[-\s]?)?0*([0-9]+)$/);
  return match ? `LV-${String(Number(match[1])).padStart(3, "0")}` : raw;
}

export function projectUuidOf(project: ProjectLike) {
  const candidates = ["id", "project_uuid", "projectUuid", "project_id", "projectId"];
  for (const key of candidates) {
    const value = clean(project?.[key]);
    if (UUID_RE.test(value)) return value;
  }
  return "";
}

export function projectCodeOf(project: ProjectLike) {
  const explicit = first(project, ["projectCode", "project_code", "Project_ID", "File_ID", "file_id"]);
  if (explicit) return normalizeProjectCode(explicit);
  const legacyProjectId = clean(project?.projectId);
  return legacyProjectId && !UUID_RE.test(legacyProjectId) ? normalizeProjectCode(legacyProjectId) : "";
}

/**
 * Backward-compatible display identity. Database relationships should use
 * projectUuidOf(); human-facing file IDs should use projectCodeOf().
 */
export function projectIdOf(project: ProjectLike) {
  return projectCodeOf(project) || projectUuidOf(project);
}

export function projectOwnerOf(project: ProjectLike) {
  return first(project, ["ownerName", "clientName", "client_name_snapshot", "Client_Name", "client_name", "Owner_Name"]);
}

export function projectStoryOf(project: ProjectLike) {
  return first(project, ["story", "numberOfStories", "number_of_stories_text", "Number_of_Stories", "Story", "floors", "Floors"]);
}

export function formatProjectOwnerStory(project: ProjectLike, fallback = "Project") {
  const parts = [projectOwnerOf(project), projectStoryOf(project)].filter(Boolean);
  return parts.length ? parts.join(" · ") : fallback;
}

export function formatProjectIdentity(project: ProjectLike, fallback = "Project") {
  const parts = [projectCodeOf(project) || projectUuidOf(project), projectOwnerOf(project), projectStoryOf(project)].filter(Boolean);
  return parts.length ? parts.join(" · ") : fallback;
}
