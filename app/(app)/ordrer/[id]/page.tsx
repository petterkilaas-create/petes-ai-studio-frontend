"use client";

import { use } from "react";
import { AssignmentPlayer } from "@/app/components/ordre/AssignmentPlayer";
import { ServiceUnavailable } from "@/app/components/ServiceUnavailable";
import { ORDERS_PATH, isPageEnabled } from "@/app/lib/services";
import { IMAGE_PARAM, parsePlayerParam, RESULT_PARAM } from "@/app/lib/player";

/**
 * Ordresiden, «spilleren» (TG-NEW-277, FE-4): et tynt skall rundt
 * AssignmentPlayer, som har hentingen, valget og visningen. `key` gir ny
 * tilstand ved bytte av ordre. `?bilde=&resultat=` velger bildet og
 * resultatet (fra «Åpne» paa bildesiden); bare id-er som ser riktige ut,
 * godtas (parsePlayerParam).
 */
export default function OrderPlayerPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id } = use(params);
  const query = use(searchParams);
  const imageId = parsePlayerParam(query[IMAGE_PARAM]);
  const resultId = parsePlayerParam(query[RESULT_PARAM]);
  if (!isPageEnabled(ORDERS_PATH)) return <ServiceUnavailable />;
  return <AssignmentPlayer key={id} assignmentId={id} imageId={imageId} resultId={resultId} />;
}
