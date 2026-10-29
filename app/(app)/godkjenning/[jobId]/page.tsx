"use client";

import { use } from "react";
import { ResultReview } from "@/app/components/godkjenning/ResultReview";

/**
 * Godkjenningssiden: et tynt skall rundt ResultReview (FE-1, Dag 59), som har
 * tilstanden, kallene og visningen. `key` gir ny tilstand ved bytte av jobb.
 */
export default function GodkjenningPage({
  params,
}: {
  params: Promise<{ jobId: string }>;
}) {
  const { jobId } = use(params);
  return <ResultReview key={jobId} jobId={jobId} />;
}
