import { landViewApi } from "@/lib/api";

export const PROJECT_SERVICE_FOLDERS = [
  "Architectural Design",
  "Structural Design",
  "3D Design - Exterior",
  "3D Design - Interior",
  "Electrical Design",
  "Plumbing Design",
  "Estimate & Costing",
  "Plan Approval",
  "Digital Survey",
  "Soil Test",
  "Others",
] as const;

export type ProjectServiceFolderName = (typeof PROJECT_SERVICE_FOLDERS)[number];

// Requests pass through the Vercel function proxy. Keep a conservative per-file
// limit so base64 encoding stays below the platform request-size ceiling.
export const PROJECT_UPLOAD_MAX_BYTES = 3 * 1024 * 1024;

export type ProjectServiceFolderInfo = {
  name: string;
  id: string;
  url: string;
};

export type ProjectUploadQueue = Record<string, File[]>;

export async function fileToBase64(file: File) {
  if (file.size > PROJECT_UPLOAD_MAX_BYTES) {
    throw new Error(`${file.name} is larger than 3 MB. Please reduce the file size or upload it directly to the Drive folder.`);
  }

  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error(`Could not read ${file.name}.`));
    reader.readAsDataURL(file);
  });

  const comma = dataUrl.indexOf(",");
  if (comma < 0) throw new Error(`Could not encode ${file.name}.`);
  return dataUrl.slice(comma + 1);
}

export async function uploadProjectFile(projectId: string, folderName: string, file: File) {
  const base64 = await fileToBase64(file);
  return landViewApi.uploadProjectServiceFile(projectId, folderName, {
    fileName: file.name,
    mimeType: file.type || "application/octet-stream",
    base64,
  });
}

export function totalQueuedFiles(queue: ProjectUploadQueue) {
  return Object.values(queue).reduce((sum, files) => sum + files.length, 0);
}

export async function uploadQueuedProjectFiles(
  projectId: string,
  queue: ProjectUploadQueue,
  onProgress?: (completed: number, total: number, fileName: string) => void,
) {
  const entries = PROJECT_SERVICE_FOLDERS.flatMap((folderName) =>
    (queue[folderName] || []).map((file) => ({ folderName, file })),
  );

  let completed = 0;
  for (const entry of entries) {
    onProgress?.(completed, entries.length, entry.file.name);
    await uploadProjectFile(projectId, entry.folderName, entry.file);
    completed += 1;
    onProgress?.(completed, entries.length, entry.file.name);
  }

  return completed;
}
