import { NextRequest, NextResponse } from "next/server";

const SALEFLOW_API = process.env.SALEFLOW_API_URL || "https://sale.siteflow.se";

export const config = {
  matcher: [
    // Match everything except Next internals and favicon
    "/((?!_next|favicon.ico|api/health).*)",
  ],
};

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Root path = landing
  if (pathname === "/" || pathname === "") {
    return NextResponse.next();
  }

  // Extract slug (first path segment)
  const segments = pathname.split("/").filter(Boolean);
  const slug = segments[0];
  if (!slug) return NextResponse.next();

  // Look up target URL from Saleflow API
  try {
    const lookupRes = await fetch(`${SALEFLOW_API}/api/d/${slug}`, {
      next: { revalidate: 300 },
    });

    if (!lookupRes.ok) return NextResponse.next();

    const data = (await lookupRes.json()) as { url: string };
    if (!data.url) return NextResponse.next();

    // Build target URL — preserve rest of path + query
    const restPath = segments.slice(1).join("/");
    const targetUrl = new URL(data.url);
    targetUrl.pathname = "/" + restPath;
    targetUrl.search = req.nextUrl.search;

    // Rewrite (proxy) — URL in browser stays on demo.siteflow.se/:slug
    return NextResponse.rewrite(targetUrl);
  } catch {
    return NextResponse.next();
  }
}
