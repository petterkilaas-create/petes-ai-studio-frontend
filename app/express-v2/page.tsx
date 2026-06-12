"use client";

import { useState, type ChangeEvent } from "react";
import { useImagePreview } from "../hooks/useImagePreview";
import { useProcessJob } from "../hooks/useProcessJob";
import { StatusBadge } from "../components/StatusBadge";
import { ErrorPanel } from "../components/ErrorPanel";

type ServiceId = "privacy_blur" | "magic_cleanup" | "virtual_stage";

const SERVICES: { id: ServiceId; label: string }[] = [
  { id: "privacy_blur", label: "Privacy Blur (sync, lokal ML)" },
  { id: "magic_cleanup", label: "Magic Cleanup (async, fal/Bria)" },
  { id: "virtual_stage", label: "Virtual Staging Scandi (async, fal/FLUX)" },
];

export default function ExpressV2Page() {
  const [service, setService] = useState<ServiceId>("privacy_blur");

  const preview = useImagePreview();
  const job = useProcessJob();

  const isProcessing = job.isProcessing;
  const runDisabled = !preview.file || isProcessing;

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    preview.onInputChange(e);
    // Rydd en tidligere feil-tilstand naar bruker velger ny fil (som foer),
    // men behold et eksisterende resultat til neste Run.
    if (job.status === "failed") job.reset();
  };

  const handleRun = () => {
    if (!preview.file || isProcessing) return;
    void job.run(preview.file, service);
  };

  const handleReset = () => {
    preview.clear();
    job.reset();
  };

  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col font-sans text-white">
      <main className="flex-1 flex flex-col max-w-5xl mx-auto w-full p-8 gap-8">
        <header className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-widest mb-2 flex items-center gap-4">
              <span className="text-4xl">⚡</span> Express V2
            </h1>
            <p className="text-slate-400 max-w-2xl text-sm">
              Minimal proof-of-concept for backend V2 (/v1/process + /v1/jobs).
            </p>
          </div>
          <StatusBadge status={job.status} error={job.error} />
        </header>

        <section className="bg-[#0f172a] border border-slate-800 rounded-3xl p-8 space-y-6">
          <div>
            <label className="text-[10px] font-black text-[#009183] uppercase tracking-[0.2em] block mb-3">
              Service
            </label>
            <div className="flex flex-col gap-2">
              {SERVICES.map((s) => (
                <label
                  key={s.id}
                  className="flex items-center gap-3 cursor-pointer text-slate-300 hover:text-white transition-colors"
                >
                  <input
                    type="radio"
                    name="service"
                    value={s.id}
                    checked={service === s.id}
                    onChange={() => setService(s.id)}
                    disabled={isProcessing}
                    className="accent-[#009183]"
                  />
                  <span className="text-sm">{s.label}</span>
                </label>
              ))}
            </div>
          </div>

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

          {job.status === "failed" && <ErrorPanel message={job.error} />}
        </section>

        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-[#0f172a] border border-slate-800 rounded-3xl p-6">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
              Input
            </p>
            {preview.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.previewUrl}
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
              Output
            </p>
            {job.resultUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={job.resultUrl}
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
