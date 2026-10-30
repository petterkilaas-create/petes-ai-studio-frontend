"use client";

import { use } from "react";
import { ResultReview } from "@/app/components/godkjenning/ResultReview";
import { FROM_PARAM, parseFrom } from "@/app/lib/orderTabs";

/**
 * Godkjenningssiden: et tynt skall rundt ResultReview (FE-1, Dag 59), som har
 * tilstanden, kallene og visningen. `key` gir ny tilstand ved bytte av jobb.
 * `?fra=<ordre-id>` kommer fra «Åpne» paa bildesiden (FE-3c); bare en uuid
 * godtas, og tilbake-stien bygges i koden.
 */
export default function GodkjenningPage({
  params,
  searchParams,
}: {
  params: Promise<{ jobId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { jobId } = use(params);
  const from = parseFrom(use(searchParams)[FROM_PARAM]);
  return <ResultReview key={jobId} jobId={jobId} from={from} />;
}
