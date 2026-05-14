import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server'

// Vi definerer hvilke ruter som skal være ÅPNE (f.eks. selve innloggingssiden)
// Siden vi vil låse ALT, lar vi denne være tom for øyeblikket, 
// eller vi kan legge til spesifikke ruter hvis vi lager en "Landing page" senere.
const isPublicRoute = createRouteMatcher(['/sign-in(.*)', '/sign-up(.*)'])

export default clerkMiddleware(async (auth, request) => {
  if (!isPublicRoute(request)) {
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