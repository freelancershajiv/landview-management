import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const APPS_SCRIPT_URL =
  process.env.LAND_VIEW_API_URL ||
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_LAND_VIEW_API_URL ||
  "";

function apiUrl() {
  if (!APPS_SCRIPT_URL) {
    throw new Error(
      "LAND VIEW API URL is not configured. Set LAND_VIEW_API_URL in .env.local or in Vercel Environment Variables."
    );
  }
  return APPS_SCRIPT_URL;
}

async function relay(response: Response) {
  const text = await response.text();

  return new NextResponse(text, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") || "application/json; charset=utf-8",
      "cache-control": "no-store, max-age=0",
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const target = new URL(apiUrl());

    request.nextUrl.searchParams.forEach((value, key) => {
      target.searchParams.set(key, value);
    });

    const response = await fetch(target.toString(), {
      method: "GET",
      cache: "no-store",
      redirect: "follow",
    });

    return relay(response);
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to reach LAND VIEW Apps Script backend.",
      },
      { status: 502 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const bodyText = await request.text();

    const response = await fetch(apiUrl(), {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8",
      },
      body: bodyText,
      cache: "no-store",
      redirect: "follow",
    });

    return relay(response);
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Unable to reach LAND VIEW Apps Script backend.",
      },
      { status: 502 }
    );
  }
}
