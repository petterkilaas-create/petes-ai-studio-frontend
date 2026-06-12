"use client";

import { useEffect, useState } from "react";
import { useImagePreview } from "../hooks/useImagePreview";
import { useProcessJob } from "../hooks/useProcessJob";
import { StatusBadge } from "../components/StatusBadge";
import { ErrorPanel } from "../components/ErrorPanel";
import { RejectionPanel } from "../components/RejectionPanel";
import type { ProcessParams } from "../lib/api";
import { nearestAspectRatio, type AspectRatio } from "../lib/aspectRatio";

// Kun EN tjeneste paa denne siden: Virtual Staging (Scandi).
const SERVICE = "virtual_stage";

// aspect_ratio finnes ikke i den typede ProcessParams (api.ts), men
// submitJob serialiserer params via JSON.stringify, saa et ekstra felt
// naar frem til backend uendret. Vi utvider typen lokalt for aa sende det
// — samme sti som preset_id, uten aa endre lib-laget. StageParams er
// tilordningsbar til ProcessParams, saa job.run() godtar den.
type StageParams = ProcessParams & { aspect_ratio: AspectRatio };

export default function StagingPage() {
  const preview = useImagePreview();
  const job = useProcessJob();

  // Naermeste gyldige aspect_ratio fra det opplastede bildets faktiske
  // dimensjoner. Backend krever eksplisitt aspect_ratio for virtual_stage
  // (HTTP 422 uten) og godtar ikke "match_input_image".
  const [aspectRatio, setAspectRatio] = useState<AspectRatio | null>(null);

  const isProcessing = job.isProcessing;
  const runDisabled = !preview.file || !aspectRatio || isProcessing;

  // Les dimensjoner lokalt paa siden (ikke i den delte useImagePreview-
  // hooken, som /express deler) og regn ut naermeste ratio.
  useEffect(() => {
    if (!preview.previewUrl) {
      setAspectRatio(null);
      return;
    }
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (!cancelled) {
        setAspectRatio(nearestAspectRatio(img.naturalWidth, img.naturalHeight));
      }
    };
    img.src = preview.previewUrl;
    return () => {
      cancelled = true;
    };
  }, [preview.previewUrl]);

  const handleRun = () => {
    if (!preview.file || !aspectRatio || isProcessing) return;
    const params: StageParams = { aspect_ratio: aspectRatio };
    job.run(preview.file, SERVICE, params);
  };

  const handleReset = () => {
    preview.clear();
    job.reset();
  };

  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col font-sans text-white">
      <main className="flex-1 flex flex-col max-w-6xl mx-auto w-full p-8 gap-8">
        <header className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-widest mb-2 flex items-center gap-4">
              <span className="text-4xl">🛋️</span> Virtual Staging
            </h1>
            <p className="text-slate-400 max-w-2xl text-sm">
              Furnish empty rooms with clean, Scandinavian-style interiors —
              one photo at a time.
            </p>
          </div>
          <StatusBadge status={job.status} error={job.error} />
        </header>

        {/* --- OPPLASTING + KJOERING --- */}
        <section className="bg-[#0f172a] border border-slate-800 rounded-3xl p-8 space-y-6">
          <div className="flex items-center gap-4">
            <div className="text-3xl">🛋️</div>
            <div>
              <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                Service
              </p>
              <p className="text-white font-black uppercase tracking-widest">
                Virtual Staging (Scandi)
              </p>
            </div>
          </div>

          <div>
            <label className="text-[10px] font-black text-[#009183] uppercase tracking-[0.2em] block mb-3">
              Step 1: Image
            </label>
            <input
              type="file"
              accept="image/*"
              onChange={preview.onInputChange}
              disabled={isProcessing}
              className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-black file:uppercase file:tracking-widest file:bg-[#009183] file:text-white hover:file:bg-[#00a89a] file:cursor-pointer"
            />
            {aspectRatio && (
              <p className="mt-3 text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                Format: <span className="text-slate-300">{aspectRatio}</span>
              </p>
            )}
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

          {/* virtual_stage gaar ikke gjennom scene-gaten, men hvis
              useProcessJob likevel eksponerer et avslag, vis panelet. */}
          {job.rejection && (
            <RejectionPanel
              rejection={job.rejection}
              onForceExterior={() => void job.resubmitForced()}
              disabled={runDisabled}
            />
          )}

          {job.status === "failed" && !job.rejection && (
            <ErrorPanel message={job.error} />
          )}
        </section>

        {/* --- RESULTAT: input/output side om side --- */}
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
