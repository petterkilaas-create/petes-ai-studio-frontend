"use client";

import { use } from "react";
import { ListingTextOrder } from "@/app/components/annonsetekst/ListingTextOrder";
import { ListingTextGate } from "@/app/components/annonsetekst/ListingTextGate";
import { ServiceUnavailable } from "@/app/components/ServiceUnavailable";
import { listingTextAccess } from "@/app/lib/services";

/**
 * Annonsetekst for en ordre (TG-NEW-281). T1 er en plassholder med
 * overskriften og adressen; bestillingen og tekstpakken kommer i T2-T4.
 * `key` gir ny tilstand ved bytte av ordre.
 */
export default function ListingTextOrderPage({ params }: { params: Promise<{ ordreId: string }> }) {
  const { ordreId } = use(params);
  // Flagget "off" (og ordrene av): ingen kall.
  if (listingTextAccess(null) === "no") return <ServiceUnavailable />;
  return (
    <ListingTextGate>
      <ListingTextOrder key={ordreId} assignmentId={ordreId} />
    </ListingTextGate>
  );
}
