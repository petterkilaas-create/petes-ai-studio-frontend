"use client";

import { lazy, Suspense, use } from "react";
import { ListingTextOrder } from "@/app/components/annonsetekst/ListingTextOrder";
import { ListingTextGate } from "@/app/components/annonsetekst/ListingTextGate";
import { ServiceUnavailable } from "@/app/components/ServiceUnavailable";
import { listingTextAccess } from "@/app/lib/services";

/**
 * Mock-modusen (T2): bare i `next dev`. I prod-bygget er NODE_ENV
 * "production", grenen faller bort, og `import()` tas ikke med i bygget.
 */
const ListingTextMock =
  process.env.NODE_ENV === "development"
    ? lazy(() => import("@/app/components/annonsetekst/ListingTextMock").then((m) => ({ default: m.ListingTextMock })))
    : null;

/**
 * Annonsetekst for en ordre (TG-NEW-281): bestillingen (T2), behandlingen
 * og tekstpakken (T3-T4). `key` gir ny tilstand ved bytte av ordre.
 * `?mock=1` i `next dev` viser siden med falsk backend og uten vakten.
 */
export default function ListingTextOrderPage({
  params,
  searchParams,
}: {
  params: Promise<{ ordreId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { ordreId } = use(params);
  const query = use(searchParams);
  if (process.env.NODE_ENV === "development" && ListingTextMock !== null && query.mock === "1") {
    return (
      <Suspense fallback={null}>
        <ListingTextMock key={ordreId} assignmentId={ordreId} />
      </Suspense>
    );
  }
  // Flagget "off" (og ordrene av): ingen kall.
  if (listingTextAccess(null) === "no") return <ServiceUnavailable />;
  return (
    <ListingTextGate>
      <ListingTextOrder key={ordreId} assignmentId={ordreId} />
    </ListingTextGate>
  );
}
