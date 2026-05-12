"use client";

import { useEffect, useState } from "react";
import { useUser, useAuth } from "@clerk/nextjs";
import { submitJob } from "../lib/api";
import { useJobStatus } from "../lib/useJobStatus";

export default function SceneTransformDebugPage() {
  const { user } = useUser();
  const { getToken } = useAuth();

  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const [jobId, setJobId] = useState<string | null>(null);

  const job = useJobStatus(jobId);

  useEffect(() => {
    if (!file) {
      setPreviewUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const outputUrl = job.imageUrl;

  let statusText = "Idle";
  if (isSubmitting) statusText = "Submitting...";
  else if (jobId && job.status === "pending") statusText = "Processing...";
  else if (job.status === "failed") statusText = `Failed: ${job.error ?? "unknown"}`;
  else if (outputUrl) statusText = "Done";
  else if (submitError) statusText = `Failed: ${submitError}`;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    setSubmitError(null);
  };

  const handleRun = async () => {
    if (!file || isSubmitting) return;

    setJobId(null);
    setSubmitError(null);
    setIsSubmitting(true);

    try {
      const result = await submitJob({
        service: "scene_transform",
        image: file,
        getToken,
      });
      if (result.kind === "async") {
        setJobId(result.jobId);
      } else {
        // scene_transform skal alltid være async — sync-respons er en backend-bug
        setSubmitError("Unexpected sync response from backend");
      }
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setJobId(null);
    setSubmitError(null);
    setIsSubmitting(false);
  };

  const isProcessing = isSubmitting || (jobId !== null && job.status === "pending");
  const runDisabled = !file || isProcessing;

  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col font-sans text-white">
      <main className="flex-1 flex flex-col max-w-5xl mx-auto w-full p-8 gap-8">
        <header className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-widest mb-2 flex items-center gap-4">
              <span className="text-4xl">🧪</span> Scene Transform Debug
            </h1>
            <p className="text-slate-400 max-w-2xl text-sm">
              Debug-side for SCENE_TRANSFORM-segmentering. Last opp et bilde og se
              composited preview med rød (må bevares) og blå (kan endres) overlay.
            </p>
          </div>
          <div className="text-right border border-white/10 px-4 py-2 rounded-xl bg-white/5">
            <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">Status</p>
            <p className="text-sm text-white font-black">{statusText}</p>
          </div>
        </header>

        <div className="flex gap-6 items-center text-sm text-slate-300">
          <div className="flex items-center gap-2">
            <span className="inline-block w-4 h-4 rounded bg-red-500 opacity-60"></span>
            <span>Rød = må bevares (immutable)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block w-4 h-4 rounded bg-blue-500 opacity-60"></span>
            <span>Blå = kan endres (mutable)</span>
          </div>
        </div>

        <section className="bg-[#0f172a] border border-slate-800 rounded-3xl p-8 space-y-6">
          <div>
            <label className="text-[10px] font-black text-[#009183] uppercase tracking-[0.2em] block mb-3">
              Image
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={isProcessing}
              className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-black file:uppercase file:tracking-widest file:bg-[#009183] file:text-white hover:file:bg-[#00a89a] file:cursor-pointer"
            />
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleRun}
              disabled={runDisabled}
              className="px-8 py-3 rounded-full bg-[#009183] hover:bg-[#00a89a] disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-black uppercase tracking-widest text-[10px] transition-colors shadow-[0_0_20px_rgba(0,145,131,0.4)] disabled:shadow-none"
            >
              {isProcessing ? "Running..." : "Run"}
            </button>
            <button
              onClick={handleReset}
              disabled={isProcessing}
              className="px-8 py-3 rounded-full border border-slate-700 hover:border-slate-500 text-slate-300 hover:text-white disabled:opacity-50 disabled:cursor-not-allowed font-black uppercase tracking-widest text-[10px] transition-colors"
            >
              Reset
            </button>
          </div>

          {(submitError || job.status === "failed") && (
            <div className="border border-[#ef4444]/50 bg-[#ef4444]/10 rounded-xl p-4 text-sm text-[#fca5a5]">
              <p className="font-black uppercase tracking-widest text-[10px] mb-1">Error</p>
              <p className="break-words">{submitError ?? job.error}</p>
            </div>
          )}
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-6">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
              Input
            </p>
            {previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={previewUrl}
                alt="Input preview"
                className="w-full h-auto rounded-xl border border-slate-800"
              />
            ) : (
              <div className="aspect-square w-full rounded-xl border border-dashed border-slate-700 flex items-center justify-center text-slate-600 text-sm">
                No image selected
              </div>
            )}
          </div>

          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-6">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
              Output (composited preview)
            </p>
            {outputUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={outputUrl}
                alt="Output result"
                className="w-full h-auto rounded-xl border border-slate-800"
              />
            ) : (
              <div className="aspect-square w-full rounded-xl border border-dashed border-slate-700 flex items-center justify-center text-slate-600 text-sm">
                {isProcessing ? "Processing..." : "No result yet"}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
