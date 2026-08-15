import { NextResponse, type NextRequest } from "next/server";

// Defensa en profundidad: bloquea el shell de la app (/app/*) server-side cuando
// no hay sesión, evitando el "flash" de contenido protegido antes del redirect
// client-side. La validez del token la sigue verificando la API en cada llamada;
// aquí solo comprobamos presencia de la cookie de sesión.
export function middleware(req: NextRequest) {
  const hasSession = req.cookies.has("access_token") || req.cookies.has("refresh_token");
  if (hasSession) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.searchParams.set("next", req.nextUrl.pathname);
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/app/:path*"],
};
