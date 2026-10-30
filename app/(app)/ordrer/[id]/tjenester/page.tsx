"use client";

import { use } from "react";
import { ServiceBoard } from "@/app/components/ordre/ServiceBoard";
import { ServiceUnavailable } from "@/app/components/ServiceUnavailable";
import { ORDERS_PATH, isPageEnabled } from "@/app/lib/services";
import { DUSK_IMAGES } from "@/app/(app)/tjenester/duskImages";
import { STYLE_IMAGES } from "@/app/(app)/tjenester/styleImages";

/**
 * Bildebrettet (TG-NEW-277, FE-3; skissen «Tjenester»): et tynt skall rundt
 * ServiceBoard. Eksempelbildene til velgerne kommer herfra, fordi node --test
 * ikke kan laste .jpg. `key` gir ny tilstand ved bytte av ordre.
 */
export default function OrderServicesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  if (!isPageEnabled(ORDERS_PATH)) return <ServiceUnavailable />;
  return <ServiceBoard key={id} assignmentId={id} duskImages={DUSK_IMAGES} styleImages={STYLE_IMAGES} />;
}
