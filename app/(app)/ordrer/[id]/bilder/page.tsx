"use client";

import { use } from "react";
import { OrderImages } from "@/app/components/ordre/OrderImages";
import { ServiceUnavailable } from "@/app/components/ServiceUnavailable";
import { ORDERS_PATH, isPageEnabled } from "@/app/lib/services";
import { parseStarted, STARTED_PARAM } from "@/app/lib/ordrer";

/**
 * Bildene i ordren (TG-NEW-277, FE-2; skissen «Bolig»): et tynt skall rundt
 * OrderImages, som har koeen, kallene og visningen. `key` gir ny tilstand
 * (og ny koe) ved bytte av ordre. `?startet=N` kommer fra oppsummeringen etter
 * «Start behandling» (FE-3).
 */
export default function OrderImagesPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = use(params);
  const started = parseStarted(use(searchParams)[STARTED_PARAM]);
  if (!isPageEnabled(ORDERS_PATH)) return <ServiceUnavailable />;
  return <OrderImages key={id} assignmentId={id} started={started} />;
}
