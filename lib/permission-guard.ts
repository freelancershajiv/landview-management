import type { NextRequest } from "next/server";
import { requireLocalSession, roleOf, type WorkspaceUser } from "@/lib/local-session";
import { hasCapability, type Capability } from "@/lib/permissions";

export class PermissionDeniedError extends Error {
  status: number;
  constructor(message = "You do not have permission to perform this action.", status = 403) {
    super(message);
    this.name = "PermissionDeniedError";
    this.status = status;
  }
}

export async function requireApiCapability(request: NextRequest, capability: Capability) {
  const user = await requireLocalSession(request) as WorkspaceUser | null;
  if (!user) throw new PermissionDeniedError("Session expired.", 401);
  if (!hasCapability(user, capability)) {
    throw new PermissionDeniedError(`Permission required: ${capability}.`, 403);
  }
  return { user, role: roleOf(user), capability };
}

export async function requireAnyApiCapability(request: NextRequest, capabilities: readonly Capability[]) {
  const user = await requireLocalSession(request) as WorkspaceUser | null;
  if (!user) throw new PermissionDeniedError("Session expired.", 401);
  const capability = capabilities.find((item) => hasCapability(user, item));
  if (!capability) {
    throw new PermissionDeniedError("You do not have permission to perform this action.", 403);
  }
  return { user, role: roleOf(user), capability };
}

export function permissionStatus(error: unknown) {
  return error instanceof PermissionDeniedError ? error.status : 500;
}
