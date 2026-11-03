import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession, roleOf, userIdOf } from "@/lib/local-session";
import { createTodoItem, deleteTodoItem, listTodoItems, updateTodoItem } from "@/lib/todo-data";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Row = Record<string, unknown>;

function originAllowed(request: NextRequest) {
  const origin = request.headers.get("origin");
  if (!origin) return process.env.NODE_ENV !== "production" || request.headers.get("sec-fetch-site") === "same-origin";
  try {
    const host = new URL(origin).hostname.toLowerCase();
    return host === "app.landview.com.bd" || host === "www.landview.com.bd" || host === "landview.com.bd" || host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");
  } catch {
    return false;
  }
}

function ok(data: unknown) {
  return NextResponse.json({ success: true, data }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

function fail(error: unknown, status = 500) {
  const message = error instanceof Error ? error.message : String(error || "Request failed.");
  return NextResponse.json({ success: false, error: message }, { status, headers: { "Cache-Control": "no-store" } });
}

async function requireTodoUser(request: NextRequest) {
  const user = await requireLocalSession(request);
  if (!user) throw new Error("Authentication required.");
  const role = roleOf(user);
  if (role !== "admin" && role !== "manager") throw new Error("Access denied.");
  return user;
}

export async function GET(request: NextRequest) {
  try {
    await requireTodoUser(request);
    return ok(await listTodoItems());
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(error, /authentication/i.test(message) ? 401 : /access denied/i.test(message) ? 403 : 500);
  }
}

export async function POST(request: NextRequest) {
  if (!originAllowed(request)) return fail(new Error("Invalid request origin."), 403);
  try {
    const user = await requireTodoUser(request);
    const input = await request.json().catch(() => ({})) as Row;
    const action = String(input.action || "").trim().toLowerCase();
    if (action === "create") {
      const createdBy = String(user.name || user.Name || userIdOf(user) || "LAND VIEW").trim();
      return ok(await createTodoItem((input.item || {}) as Row, createdBy));
    }
    if (action === "update") {
      const todoCode = String(input.todoCode || "").trim();
      if (!todoCode) throw new Error("To Do code is required.");
      return ok(await updateTodoItem(todoCode, (input.item || {}) as Row));
    }
    if (action === "delete") {
      const todoCode = String(input.todoCode || "").trim();
      if (!todoCode) throw new Error("To Do code is required.");
      return ok(await deleteTodoItem(todoCode));
    }
    throw new Error("Unsupported To Do action.");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(error, /authentication/i.test(message) ? 401 : /access denied/i.test(message) ? 403 : /required|unsupported/i.test(message) ? 400 : 500);
  }
}
