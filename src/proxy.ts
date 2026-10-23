import { NextResponse } from "next/server";
import { auth } from "@/auth";

export default auth((req) => {
  if (req.auth) return;
  const url = new URL("/login", req.nextUrl.origin);
  if (req.nextUrl.pathname !== "/") url.searchParams.set("callbackUrl", req.nextUrl.pathname);
  return NextResponse.redirect(url);
});

export const config = {
  matcher: ["/((?!login|api/auth|api/graph|_next/static|_next/image|brand|favicon.ico).*)"],
};
