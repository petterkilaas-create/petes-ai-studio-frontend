"use client";

import { use } from "react";
import { OrderCheck } from "@/app/components/ordre/OrderCheck";
import { ServiceUnavailable } from "@/app/components/ServiceUnavailable";
import { ORDERS_PATH, isPageEnabled } from "@/app/lib/services";

/**
 * Oppsummeringen med «Start behandling» (TG-NEW-277, FE-3; skissen
 * «Kontroll»): et tynt skall rundt OrderCheck. `key` gir ny tilstand (og nye
 * noekler) ved bytte av ordre.
 */
export default function OrderCheckPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  if (!isPageEnabled(ORDERS_PATH)) return <ServiceUnavailable />;
  return <OrderCheck key={id} assignmentId={id} />;
}
