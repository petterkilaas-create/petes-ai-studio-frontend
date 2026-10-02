import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'
import { NextResponse } from 'next/server'
import { isOpenMarketingPath, MARKETING_PUBLIC, rootTarget } from './app/lib/marketingAccess'

// Vi definerer hvilke ruter som skal være ÅPNE (f.eks. selve innloggingssiden).
// Alt annet er låst. Markedssiden (/no) åpnes bare når MARKETING_PUBLIC er
// true (app/lib/marketingAccess.ts).
const isPublicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)'])

export default clerkMiddleware(async (auth, request) => {
  const { pathname } = request.nextUrl

  // MS2: / sender innloggede til /start. Andre går til innlogging (som før),
  // eller til markedssiden når den er offentlig.
  if (pathname === '/') {
    const { userId } = await auth()
    const target = rootTarget(Boolean(userId), MARKETING_PUBLIC)
    if (target) return NextResponse.redirect(new URL(target, request.url))
  }

  if (!isPublicRoute(request) && !isOpenMarketingPath(pathname, MARKETING_PUBLIC)) {
    await auth.protect()
  }
})

export const config = {
  matcher: [
    // Denne linjen sørger for at dørvakten sjekker alle sider,
    // men ignorerer interne filer som bilder og scripts.
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    '/(api|trpc)(.*)',
  ],
}
