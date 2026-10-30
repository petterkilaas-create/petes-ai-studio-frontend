"use client";

import { use } from "react";
import { OrderDelivery } from "@/app/components/ordre/OrderDelivery";
import { ServiceUnavailable } from "@/app/components/ServiceUnavailable";
import { ORDERS_PATH, isPageEnabled } from "@/app/lib/services";

/**
 * Nedlastingen (TG-NEW-277, FE-5; skissen «Nedlasting»): et tynt skall rundt
 * OrderDelivery. `key` gir ny tilstand (og nytt utvalg) ved bytte av ordre.
 */
export default function OrderDeliveryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  if (!isPageEnabled(ORDERS_PATH)) return <ServiceUnavailable />;
  return <OrderDelivery key={id} assignmentId={id} />;
}
