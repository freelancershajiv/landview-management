import { NextRequest, NextResponse } from "next/server";

const COOKIE_NAME = "landview_session";
const PROTECTED = ["/admin", "/employee", "/client"];

export function proxy(request: NextRequest) {
  const host = (request.headers.get("host") || "").split(":")[0].toLowerCase();
  const path = request.nextUrl.pathname;
  const isAppHost = host === "app.landview.com.bd" || host === "localhost" || host === "127.0.0.1" || host.endsWith(".vercel.app");

  if (host === "app.landview.com.bd" && path === "/") {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (PROTECTED.some((prefix) => path === prefix || path.startsWith(prefix + "/"))) {
    if (!request.cookies.get(COOKIE_NAME)?.value) {
      return NextResponse.redirect(new URL("/login", request.url));
    }
    if (!isAppHost) return NextResponse.redirect(`https://app.landview.com.bd${path}`);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon-192.png|icon-512.png|manifest.json).*)"],
};
