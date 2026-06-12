"use client";

import { useState } from "react";
import { useImagePreview } from "../hooks/useImagePreview";
import { useProcessJob } from "../hooks/useProcessJob";
import { StatusBadge } from "../components/StatusBadge";
import { ErrorPanel } from "../components/ErrorPanel";
import { RejectionPanel } from "../components/RejectionPanel";

// "simple" = service alene (ingen params, backend-defaults gjelder).
// "scene"  = scene_transform med preset_id + scene-type-gate (TG-NEW-58),
//            samme param-oppsett som scene-transform-debug i prod.
type ToolKind = "simple" | "scene";

interface Tool {
  id: string;
  service: string;
  presetId?: string;
  kind: ToolKind;
  icon: string;
  title: string;
  desc: string;
}

interface Category {
  id: string;
  title: string;
  icon: string;
  items: Tool[];
}

// Fasit fra backendens service-enum. Beskrivelser gjenbrukt fra den gamle
// express-siden der de fantes (engelsk, ingen spesialtegn).
const CATEGORIES: Category[] = [
  {
    id: "fixit",
    title: "Fix-It Tools",
    icon: "🧹",
    items: [
      {
        id: "magic_cleanup",
        service: "magic_cleanup",
        kind: "simple",
        icon: "🧽",
        title: "Magic Cleanup",
        desc: "Auto-remove moving boxes, loose cables, and general clutter.",
      },
      {
        id: "privacy_blur",
        service: "privacy_blur",
        kind: "simple",
        icon: "🕵️",
        title: "Privacy Blur",
        desc: "Seamlessly blur faces, family photos, and license plates.",
      },
      // Skjult inntil lawn_green-pipeline finnes i backend (Dag 21+)
      // {
      //   id: "lawn_green",
      //   service: "lawn_green",
      //   kind: "simple",
      //   icon: "🌿",
      //   title: "Lush Lawn",
      //   desc: "Turn dead or brown grass into a perfect, manicured green lawn.",
      // },
      // Skjult inntil pool_enhance-pipeline finnes i backend (Dag 21+)
      // {
      //   id: "pool_enhance",
      //   service: "pool_enhance",
      //   kind: "simple",
      //   icon: "🏊",
      //   title: "Pool Cleanup",
      //   desc: "Clean murky pool water into inviting, crystal-clear light blue.",
      // },
    ],
  },
  // Hele Atmosphere-kategorien skjult: alle kortene er backend-stubber uten
  // pipeline (lamp_on, fireplace_ignite, sky_replace). Vis igjen naar minst
  // ett kort har en faktisk pipeline i backend (Dag 21+).
  // {
  //   id: "atmosphere",
  //   title: "Atmosphere",
  //   icon: "🌌",
  //   items: [
  //     // Skjult inntil lamp_on-pipeline finnes i backend (Dag 21+)
  //     // {
  //     //   id: "lamp_on",
  //     //   service: "lamp_on",
  //     //   kind: "simple",
  //     //   icon: "💡",
  //     //   title: "Turn On Lights",
  //     //   desc: "Ignite interior lamps and fixtures without making it night.",
  //     // },
  //     // Skjult inntil fireplace_ignite-pipeline finnes i backend (Dag 21+)
  //     // {
  //     //   id: "fireplace_ignite",
  //     //   service: "fireplace_ignite",
  //     //   kind: "simple",
  //     //   icon: "🔥",
  //     //   title: "Virtual Fireplace",
  //     //   desc: "Ignite a realistic, cozy fire in an empty fireplace.",
  //     // },
  //     // Skjult inntil sky_replace-pipeline finnes i backend (Dag 21+)
  //     // {
  //     //   id: "sky_replace",
  //     //   service: "sky_replace",
  //     //   kind: "simple",
  //     //   icon: "🌤️",
  //     //   title: "Sky Replace",
  //     //   desc: "Swap a dull or blown-out sky for a clean, natural blue one.",
  //     // },
  //   ],
  // },
  {
    id: "timetraveler",
    title: "Time Traveler",
    icon: "🍂",
    items: [
      {
        id: "klart_vaer",
        service: "scene_transform",
        presetId: "klart_vaer",
        kind: "scene",
        icon: "☀️",
        title: "Klart vær",
        desc: "Transform the scene to bright, clear daylight.",
      },
      {
        id: "skumring",
        service: "scene_transform",
        presetId: "skumring",
        kind: "scene",
        icon: "🌆",
        title: "Skumring",
        desc: "Transform the scene to a warm, inviting dusk.",
      },
    ],
  },
];

type SceneType = "auto" | "exterior" | "interior";

export default function ExpressPage() {
  const [activeCategoryId, setActiveCategoryId] = useState<string>("fixit");
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);

  // Scene-type-gate-kontroller (kun for scene_transform-kort), samme
  // kontrakt som scene-transform-debug.
  const [sceneType, setSceneType] = useState<SceneType>("auto");
  const [forceSceneType, setForceSceneType] = useState(false);

  const preview = useImagePreview();
  const job = useProcessJob();

  const activeCategory =
    CATEGORIES.find((c) => c.id === activeCategoryId) ?? CATEGORIES[0];
  const selectedTool =
    CATEGORIES.flatMap((c) => c.items).find((t) => t.id === selectedToolId) ??
    null;

  const isProcessing = job.isProcessing;
  const runDisabled = !selectedTool || !preview.file || isProcessing;

  const selectTool = (toolId: string) => {
    if (isProcessing) return;
    setSelectedToolId(toolId);
    // Nullstill scene-kontroller og resultat ved bytte av verktoy.
    setSceneType("auto");
    setForceSceneType(false);
    job.reset();
  };

  const handleSceneTypeChange = (value: SceneType) => {
    setSceneType(value);
    // force_scene_type=true er kun gyldig sammen med scene_type="exterior"
    // (backend gir HTTP 400 ellers) — nullstill ved bytte.
    if (value !== "exterior") setForceSceneType(false);
  };

  const handleRun = () => {
    if (!selectedTool || !preview.file || isProcessing) return;
    if (selectedTool.kind === "scene") {
      // Eksakt param-oppsett kopiert fra scene-transform-debug: preset_id
      // sendes alltid for Time Traveler-kort (generativ sti), pluss
      // scene_type + force_scene_type. Ingen quality_tier/aspect_ratio.
      job.run(preview.file, selectedTool.service, {
        ...(selectedTool.presetId ? { preset_id: selectedTool.presetId } : {}),
        scene_type: sceneType,
        force_scene_type: forceSceneType,
      });
    } else {
      // Simple tjenester: service alene, backend-defaults (som i prod).
      job.run(preview.file, selectedTool.service);
    }
  };

  const handleReset = () => {
    preview.clear();
    job.reset();
    setSceneType("auto");
    setForceSceneType(false);
  };

  const handleForceExterior = () => {
    // Synkroniser kontrollene med det som faktisk sendes (exterior + force);
    // resubmitForced beholder preset_id og oevrige params fra forrige kjoering.
    setSceneType("exterior");
    setForceSceneType(true);
    void job.resubmitForced();
  };

  return (
    <div className="min-h-screen bg-[#0B1120] flex flex-col font-sans text-white">
      <main className="flex-1 flex flex-col max-w-6xl mx-auto w-full p-8 gap-8">
        <header className="flex justify-between items-start">
          <div>
            <h1 className="text-3xl font-black uppercase tracking-widest mb-2 flex items-center gap-4">
              <span className="text-4xl">⚡</span> Express Studio
            </h1>
            <p className="text-slate-400 max-w-2xl text-sm">
              One-click magic edits, atmospheric lighting, and seasonal
              transformations.
            </p>
          </div>
          <StatusBadge status={job.status} error={job.error} />
        </header>

        {/* --- STEP 1: VELG VERKTOY --- */}
        <section className="space-y-6">
          <h2 className="text-xs font-black text-[#009183] uppercase tracking-widest">
            Step 1: Choose your tool
          </h2>

          <div className="flex flex-wrap gap-4">
            {CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                onClick={() => setActiveCategoryId(cat.id)}
                disabled={isProcessing}
                className={`px-6 py-3 rounded-full font-black uppercase tracking-widest text-[10px] transition-all border disabled:opacity-50 disabled:cursor-not-allowed ${
                  activeCategoryId === cat.id
                    ? "bg-[#009183] border-[#009183] text-white shadow-[0_0_20px_rgba(0,145,131,0.4)]"
                    : "bg-transparent border-slate-700 text-slate-400 hover:text-white hover:border-slate-500"
                }`}
              >
                {cat.icon} {cat.title}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            {activeCategory.items.map((tool) => {
              const selected = tool.id === selectedToolId;
              return (
                <button
                  key={tool.id}
                  onClick={() => selectTool(tool.id)}
                  disabled={isProcessing}
                  className={`text-left bg-[#0f172a] border rounded-2xl p-6 transition-all flex flex-col h-full shadow-lg disabled:cursor-not-allowed ${
                    selected
                      ? "border-[#009183] bg-[#1e293b] shadow-[0_10px_30px_-15px_rgba(0,145,131,0.4)] -translate-y-1"
                      : "border-slate-800 hover:border-[#009183]/50 hover:bg-[#1e293b] hover:-translate-y-1"
                  }`}
                >
                  <div className="text-4xl mb-4">{tool.icon}</div>
                  <h3 className="text-sm font-black text-white uppercase tracking-wider mb-2">
                    {tool.title}
                  </h3>
                  <p className="text-slate-400 text-xs leading-relaxed flex-1">
                    {tool.desc}
                  </p>
                  {selected && (
                    <span className="mt-4 text-[#009183] text-[10px] font-black uppercase tracking-widest">
                      Selected ✓
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        {/* --- STEP 2+: OPPLASTING + KJOERING (naar et verktoy er valgt) --- */}
        {selectedTool && (
          <section className="bg-[#0f172a] border border-slate-800 rounded-3xl p-8 space-y-6">
            <div className="flex items-center gap-4">
              <div className="text-3xl">{selectedTool.icon}</div>
              <div>
                <p className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">
                  Selected Tool
                </p>
                <p className="text-white font-black uppercase tracking-widest">
                  {selectedTool.title}
                </p>
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-[#009183] uppercase tracking-[0.2em] block mb-3">
                Step 2: Image
              </label>
              <input
                type="file"
                accept="image/*"
                onChange={preview.onInputChange}
                disabled={isProcessing}
                className="block w-full text-sm text-slate-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-black file:uppercase file:tracking-widest file:bg-[#009183] file:text-white hover:file:bg-[#00a89a] file:cursor-pointer"
              />
            </div>

            {/* Step 3: scene-type-kontroller KUN for scene_transform-kort */}
            {selectedTool.kind === "scene" && (
              <div className="flex flex-wrap gap-6 items-end border-t border-slate-800 pt-6">
                <div>
                  <label
                    htmlFor="scene-type-select"
                    className="text-[10px] font-black text-[#009183] uppercase tracking-[0.2em] block mb-3"
                  >
                    Scene type
                  </label>
                  <select
                    id="scene-type-select"
                    value={sceneType}
                    onChange={(e) =>
                      handleSceneTypeChange(e.target.value as SceneType)
                    }
                    disabled={isProcessing}
                    className="bg-[#0B1120] border border-slate-700 rounded-xl px-4 py-2.5 text-sm text-white focus:border-[#009183] focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <option value="auto">Auto (classifier avgjør)</option>
                    <option value="exterior">Eksteriør</option>
                    <option value="interior">Interiør</option>
                  </select>
                </div>

                <label
                  className={`flex items-center gap-3 pb-2.5 text-sm select-none ${
                    sceneType === "exterior" && !isProcessing
                      ? "text-slate-300 cursor-pointer"
                      : "text-slate-600 cursor-not-allowed"
                  }`}
                  title={
                    sceneType === "exterior"
                      ? "Hopper over classifier og kjører som eksteriør"
                      : "Kun tilgjengelig når scene type er Eksteriør"
                  }
                >
                  <input
                    type="checkbox"
                    checked={forceSceneType}
                    onChange={(e) => setForceSceneType(e.target.checked)}
                    disabled={sceneType !== "exterior" || isProcessing}
                    className="w-4 h-4 accent-[#009183] disabled:cursor-not-allowed"
                  />
                  <span>
                    Tving eksteriør{" "}
                    <span className="text-slate-500">(hopp over classifier)</span>
                  </span>
                </label>
              </div>
            )}

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

            {job.rejection && (
              <RejectionPanel
                rejection={job.rejection}
                onForceExterior={handleForceExterior}
                disabled={runDisabled}
              />
            )}

            {job.status === "failed" && !job.rejection && (
              <ErrorPanel message={job.error} />
            )}
          </section>
        )}

        {/* --- RESULTAT: input/output side om side --- */}
        {selectedTool && (
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
        )}
      </main>
    </div>
  );
}
