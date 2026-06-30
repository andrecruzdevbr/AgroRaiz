import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

const PUBLIC_PATHS = ['/', '/login']
const ADMIN_PATHS = ['/admin']

function getSafeAdminRedirect(path: string | null): string {
  if (path && path.startsWith('/admin')) return path
  return '/admin'
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get('agroraiz_token')?.value

  if (
    PUBLIC_PATHS.some((p) => pathname === p) ||
    pathname.startsWith('/api/v1/whatsapp/webhook') ||
    pathname.startsWith('/api/v1/instagram/webhook')
  ) {
    if (pathname === '/login' && token) {
      const redirect = getSafeAdminRedirect(request.nextUrl.searchParams.get('redirect'))
      return NextResponse.redirect(new URL(redirect, request.url))
    }
    return NextResponse.next()
  }

  if (pathname.startsWith('/_next') || pathname.startsWith('/public') || pathname.includes('.')) {
    return NextResponse.next()
  }

  if (ADMIN_PATHS.some((p) => pathname.startsWith(p))) {
    if (!token) {
      const loginUrl = new URL('/login', request.url)
      loginUrl.searchParams.set('redirect', pathname)
      return NextResponse.redirect(loginUrl)
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
}
