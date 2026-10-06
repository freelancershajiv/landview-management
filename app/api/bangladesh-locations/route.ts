import { NextRequest, NextResponse } from "next/server";
import { requireLocalSession } from "@/lib/local-session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SOURCE = "https://iqbalhasandev.github.io/bangladesh-geo-json/bangladesh-geo.json";

type Place = { name?: string; bn_name?: string; districts?: Place[]; upazilas?: Place[]; unions?: Place[]; pourashavas?: Array<Place & { category?: string }> };

const MODERN_NAMES: Record<string, string> = {
  Chattagram: "Chattogram",
  Barisal: "Barishal",
  Comilla: "Cumilla",
  Jessore: "Jashore",
  Bogra: "Bogura",
};

function modern(value: unknown) {
  const raw = String(value ?? "").trim();
  return MODERN_NAMES[raw] || raw;
}
function sameName(a: unknown, b: unknown) {
  return modern(a).localeCompare(modern(b), undefined, { sensitivity: "accent" }) === 0;
}
function option(place: Place) {
  return { name: modern(place.name), bnName: String(place.bn_name || "").trim() };
}
async function hierarchy(): Promise<Place[]> {
  const response = await fetch(SOURCE, { next: { revalidate: 86400 }, signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error(`Bangladesh location source returned ${response.status}.`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error("Bangladesh location source returned invalid data.");
  return data as Place[];
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireLocalSession(request);
    if (!user) return NextResponse.json({ success: false, error: "Session expired." }, { status: 401 });

    const level = String(request.nextUrl.searchParams.get("level") || "divisions").toLowerCase();
    const divisionName = String(request.nextUrl.searchParams.get("division") || "").trim();
    const districtName = String(request.nextUrl.searchParams.get("district") || "").trim();
    const upazilaName = String(request.nextUrl.searchParams.get("upazila") || "").trim();
    const data = await hierarchy();

    if (level === "divisions") {
      return NextResponse.json({ success: true, data: data.map(option).sort((a, b) => a.name.localeCompare(b.name)) }, { headers: { "Cache-Control": "private, max-age=3600" } });
    }

    const division = data.find((item) => sameName(item.name, divisionName));
    if (!division) return NextResponse.json({ success: true, data: [] }, { headers: { "Cache-Control": "private, max-age=3600" } });
    if (level === "districts") {
      return NextResponse.json({ success: true, data: (division.districts || []).map(option).sort((a, b) => a.name.localeCompare(b.name)) }, { headers: { "Cache-Control": "private, max-age=3600" } });
    }

    const district = (division.districts || []).find((item) => sameName(item.name, districtName));
    if (!district) return NextResponse.json({ success: true, data: [] }, { headers: { "Cache-Control": "private, max-age=3600" } });
    if (level === "upazilas") {
      return NextResponse.json({ success: true, data: (district.upazilas || []).map(option).sort((a, b) => a.name.localeCompare(b.name)) }, { headers: { "Cache-Control": "private, max-age=3600" } });
    }

    const upazila = (district.upazilas || []).find((item) => sameName(item.name, upazilaName));
    if (!upazila) return NextResponse.json({ success: true, data: { unions: [], pourashavas: [] } }, { headers: { "Cache-Control": "private, max-age=3600" } });
    return NextResponse.json({
      success: true,
      data: {
        unions: (upazila.unions || []).map(option).sort((a, b) => a.name.localeCompare(b.name)),
        pourashavas: (upazila.pourashavas || []).map((item) => ({ ...option(item), category: String(item.category || "") })).sort((a, b) => a.name.localeCompare(b.name)),
      },
    }, { headers: { "Cache-Control": "private, max-age=3600" } });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : "Could not load Bangladesh locations." }, { status: 502, headers: { "Cache-Control": "no-store" } });
  }
}
