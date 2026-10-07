import { withSupabase } from "npm:@supabase/server@1.9.0";

type Row = Record<string, any>;
type StaffRole = "employee" | "manager";

function clean(value: unknown, max = 200) {
  return String(value ?? "").trim().slice(0, max);
}

function staffRole(value: unknown): StaffRole | "" {
  const role = clean(value).toLowerCase();
  return role === "employee" || role === "manager" ? role : "";
}

function legacyUser(row: Row) {
  return {
    userId: row.user_key,
    User_ID: row.user_key,
    username: row.username,
    Username: row.username,
    name: row.full_name,
    Name: row.full_name,
    role: row.role,
    Role: row.role,
    employeeId: row.employee_code || "",
    Employee_ID: row.employee_code || "",
    projectIds: row.project_ids || "",
    Project_IDs: row.project_ids || "",
    Active: row.active ? "TRUE" : "FALSE",
  };
}

Deno.serve(withSupabase({ auth: "user" }, async (req, ctx) => {
  if (req.method !== "POST") {
    return Response.json({ success: false, error: "Method not allowed." }, { status: 405 });
  }

  try {
    const { data: callerData, error: callerError } = await ctx.supabase.auth.getUser();
    if (callerError || !callerData.user?.id) {
      return Response.json({ success: false, error: "Authentication required." }, { status: 401 });
    }

    const { data: actor, error: actorError } = await ctx.supabaseAdmin
      .from("app_users")
      .select("*")
      .eq("auth_user_id", callerData.user.id)
      .eq("active", true)
      .maybeSingle();
    if (actorError) throw actorError;
    if (!actor || clean(actor.role).toLowerCase() !== "admin") {
      return Response.json({ success: false, error: "Admin permission required." }, { status: 403 });
    }

    const input = await req.json() as Record<string, unknown>;
    const userId = clean(input.userId);
    const nextRole = staffRole(input.role);
    if (!userId) return Response.json({ success: false, error: "User ID is required." }, { status: 400 });
    if (!nextRole) return Response.json({ success: false, error: "Role must be Employee or Manager." }, { status: 400 });

    const { data: target, error: targetError } = await ctx.supabaseAdmin
      .from("app_users")
      .select("*")
      .eq("user_key", userId)
      .maybeSingle();
    if (targetError) throw targetError;
    if (!target) return Response.json({ success: false, error: "Target account was not found." }, { status: 404 });
    if (!target.active) return Response.json({ success: false, error: "Inactive accounts cannot be promoted or demoted." }, { status: 400 });
    if (!clean(target.employee_code)) return Response.json({ success: false, error: "This account is not linked to an employee record." }, { status: 400 });

    const previousRole = staffRole(target.role);
    if (!previousRole) return Response.json({ success: false, error: "Only Employee and Manager accounts can be changed here." }, { status: 400 });
    if (previousRole === nextRole) {
      return Response.json({ success: true, data: { updated: false, previousRole, role: nextRole, user: legacyUser(target) } });
    }
    if (!clean(target.auth_user_id)) throw new Error("Target account is not activated in Supabase Auth.");

    const { data: authData, error: authReadError } = await ctx.supabaseAdmin.auth.admin.getUserById(target.auth_user_id);
    if (authReadError || !authData.user) throw authReadError || new Error("Target Supabase Auth user was not found.");

    const oldMetadata = authData.user.app_metadata || {};
    const changedAt = new Date().toISOString();
    const { error: authUpdateError } = await ctx.supabaseAdmin.auth.admin.updateUserById(target.auth_user_id, {
      app_metadata: {
        ...oldMetadata,
        user_key: target.user_key,
        role: nextRole,
        role_updated_at: changedAt,
        role_updated_by: actor.user_key,
      },
    });
    if (authUpdateError) throw authUpdateError;

    const { data: updated, error: profileError } = await ctx.supabaseAdmin
      .from("app_users")
      .update({ role: nextRole, updated_at: changedAt })
      .eq("user_key", target.user_key)
      .select("*")
      .single();

    if (profileError) {
      await ctx.supabaseAdmin.auth.admin.updateUserById(target.auth_user_id, { app_metadata: oldMetadata }).catch(() => null);
      throw profileError;
    }

    await ctx.supabaseAdmin.from("app_audit_log").insert({
      id: crypto.randomUUID(),
      actor_user_key: actor.user_key,
      action: "user.role_changed",
      target: target.user_key,
      outcome: "success",
      details: {
        from_role: previousRole,
        to_role: nextRole,
        employee_code: target.employee_code,
        username: target.username,
        changed_at: changedAt,
      },
      created_at: changedAt,
    }).catch(() => null);

    return Response.json({
      success: true,
      data: {
        updated: true,
        previousRole,
        role: nextRole,
        user: legacyUser(updated),
        sessionRefreshRequired: true,
      },
    });
  } catch (error) {
    return Response.json(
      { success: false, error: error instanceof Error ? error.message : "Could not update employee role." },
      { status: 500 },
    );
  }
}));
