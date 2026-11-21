import { roleOf, userIdOf } from "@/lib/local-session";
import { mergeRolePermissions, roleDefaultPermissions } from "@/lib/role-permissions";
import { selectRows } from "@/lib/supabase-data";

const text = (value: unknown) => String(value ?? "").trim();

export async function permissionAccess(user: Record<string, unknown>) {
  const role = roleOf(user), userId = userIdOf(user);
  if (role === "admin") return { userId, role, all: true, permissions: roleDefaultPermissions("admin") };
  const rows = userId ? await selectRows("app_permissions", { filters: { user_key: userId }, order: "created_at:asc", limit: 5000 }) : []; const overrides: Record<string, boolean> = {}; for (const row of rows) overrides[text(row.permission)] = text(row.status).toLowerCase() === "active";
  if (role === "manager" || role === "employee" || role === "client") return { userId, role, all: false, permissions: mergeRolePermissions(role, overrides) };
  return { userId, role, all: false, permissions: overrides };
}
