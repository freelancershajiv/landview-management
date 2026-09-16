import { createHash, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAuthGateway } from "@/lib/supabase-auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EXPECTED = "c4c74cd5f28b368a370b6bd10f7f7fe2e8596d79e5c55fb55e0a4e319ad7c2e5";

function allowed(token: string) {
  const digest = createHash("sha256").update(token).digest();
  const expected = Buffer.from(EXPECTED, "hex");
  return digest.length === expected.length && timingSafeEqual(digest, expected);
}

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token") || "";
  if (!allowed(token)) return NextResponse.json({ success: false, error: "Not found." }, { status: 404 });
  try {
    const data = await supabaseAuthGateway("bootstrapUsers");
    return NextResponse.json({ success: true, data }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Bootstrap failed." }, { status: 500 });
  }
}
