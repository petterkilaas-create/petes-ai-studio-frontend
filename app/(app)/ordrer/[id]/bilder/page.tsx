"use client";

import { use } from "react";
import { OrderImages } from "@/app/components/ordre/OrderImages";
import { ServiceUnavailable } from "@/app/components/ServiceUnavailable";
import { ORDERS_PATH, isPageEnabled } from "@/app/lib/services";

/**
 * Bildene i ordren (TG-NEW-277, FE-2; skissen «Bolig»): et tynt skall rundt
 * OrderImages, som har koeen, kallene og visningen. `key` gir ny tilstand
 * (og ny koe) ved bytte av ordre.
 */
export default function OrderImagesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  if (!isPageEnabled(ORDERS_PATH)) return <ServiceUnavailable />;
  return <OrderImages key={id} assignmentId={id} />;
}
