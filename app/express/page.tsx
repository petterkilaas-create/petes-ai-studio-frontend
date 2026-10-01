"use client";

import { useState } from "react";
import { Check, Clock, Eraser, ScanFace, Sun, Sunset, Zap, type LucideIcon } from "lucide-react";
import { useImagePreview } from "../hooks/useImagePreview";
import { useProcessJob } from "../hooks/useProcessJob";
import { StatusBadge } from "../components/StatusBadge";
import { ErrorPanel } from "../components/ErrorPanel";
import { RejectionPanel } from "../components/RejectionPanel";
import { ReviewPanel } from "../components/ReviewPanel";
import { UnknownStatusPanel } from "../components/UnknownStatusPanel";
import { ApprovalNotice } from "../components/ApprovalNotice";
import { PreviewPlaceholder } from "../components/PreviewPlaceholder";
import { outputView } from "../lib/jobState";
import { ReviewerRejectedPanel } from "../components/ReviewerRejectedPanel";
import { OpenReviewLink } from "../components/OpenReviewLink";
import { DuskChoicePicker } from "../components/DuskChoicePicker";
import { DEFAULT_DUSK, duskParams, isDuskOrder, type DuskChoice } from "../lib/dusk";
import { t } from "../lib/i18n";
import { useLocale } from "../lib/i18n/useLocale";
import { expressCategories } from "../lib/services";
import { Button } from "../components/ui/Button";
import { Card, cardClass } from "../components/ui/Card";
import { PageHeader } from "../components/ui/PageHeader";

// Tjenestevalget ligger i lib/services.ts, filtrert paa ENABLED (TG-NEW-136).
const CATEGORIES = expressCategories();

// Lucide i stedet for emojiene i services.ts (D1). Ukjent id: ingen ikon.
const CATEGORY_ICONS: Record<string, LucideIcon> = { fixit: Eraser, timetraveler: Clock };
const TOOL_ICONS: Record<string, LucideIcon> = {
  magic_cleanup: Eraser,
  privacy_blur: ScanFace,
  klart_vaer: Sun,
  skumring: Sunset,
};

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";
const STEP_LABEL = "text-sm font-medium text-ink block mb-3";

function chipClass(selected: boolean): string {
  return `inline-flex min-h-11 items-center gap-2 px-4 rounded-pill text-sm border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS} ${
    selected
      ? "bg-primary border-primary text-on-primary font-medium"
      : "bg-surface border-line-strong text-ink-2 hover:bg-surface-2 hover:text-ink"
  }`;
}

type SceneType = "auto" | "exterior" | "interior";

export default function ExpressPage() {
  const [activeCategoryId, setActiveCategoryId] = useState<string>(CATEGORIES[0]?.id ?? "");
  const [selectedToolId, setSelectedToolId] = useState<string | null>(null);

  // Scene-type-gate-kontroller (kun for scene_transform-kort).
  const [sceneType, setSceneType] = useState<SceneType>("auto");
  const [forceSceneType, setForceSceneType] = useState(false);
  // Skumringsvalg (2f-b): tidspunkt og himmel, alltid et gyldig par.
  const [dusk, setDusk] = useState<DuskChoice>(DEFAULT_DUSK);

  const locale = useLocale();
  const preview = useImagePreview();
  const job = useProcessJob();

  const activeCategory =
    CATEGORIES.find((c) => c.id === activeCategoryId) ?? CATEGORIES[0];
  const selectedTool =
    CATEGORIES.flatMap((c) => c.items).find((t) => t.id === selectedToolId) ??
    null;

  const isProcessing = job.isProcessing;
  const output = outputView(job.status, job.imageUrl);
  const showSceneControls =
    selectedTool?.kind === "scene" && selectedTool.sceneGate !== false;
  const showDuskControls =
    selectedTool !== null && isDuskOrder(selectedTool.service, selectedTool.presetId);
  const runDisabled = !selectedTool || !preview.file || isProcessing;

  const selectTool = (toolId: string) => {
    if (isProcessing) return;
    setSelectedToolId(toolId);
    // Nullstill scene-kontroller og resultat ved bytte av verktoy.
    setSceneType("auto");
    setForceSceneType(false);
    setDusk(DEFAULT_DUSK);
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
      // Param-oppsettet: preset_id sendes alltid for Time Traveler-kort
      // (generativ sti), pluss scene_type + force_scene_type. Ingen quality_tier/aspect_ratio.
      // Uten scene-velger (sceneGate: false) sendes ingen scene-felter —
      // backend-defaults (auto/false), identisk med det som ble sendt foer.
      job.run(preview.file, selectedTool.service, {
        ...(selectedTool.presetId ? { preset_id: selectedTool.presetId } : {}),
        ...(showSceneControls
          ? { scene_type: sceneType, force_scene_type: forceSceneType }
          : {}),
        // Skumring: alltid begge feltene; andre kort: ingen (2f-b).
        ...duskParams(selectedTool.service, selectedTool.presetId, dusk),
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
    setDusk(DEFAULT_DUSK);
  };

  const handleForceExterior = () => {
    // Synkroniser kontrollene med det som faktisk sendes (exterior + force);
    // resubmitForced beholder preset_id og oevrige params fra forrige kjoering.
    setSceneType("exterior");
    setForceSceneType(true);
    void job.resubmitForced();
  };

  const SelectedIcon = selectedTool ? TOOL_ICONS[selectedTool.id] : undefined;

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 md:px-8 md:py-12">
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <Zap aria-hidden className="size-7" strokeWidth={1.5} /> Express Studio
          </span>
        }
        subtitle={t(locale, "express.subtitle")}
        actions={
          /* Uten error: den raa teksten skal ikke vises (TG-NEW-121). */
          <StatusBadge status={job.status} service={selectedTool?.service} />
        }
      />

      {/* --- STEP 1: VELG VERKTOY --- */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-ink">Step 1: Choose your tool</h2>

        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => {
            const Icon = CATEGORY_ICONS[cat.id];
            return (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCategoryId(cat.id)}
                disabled={isProcessing}
                aria-pressed={activeCategoryId === cat.id}
                className={chipClass(activeCategoryId === cat.id)}
              >
                {Icon && <Icon aria-hidden className="size-4" strokeWidth={1.75} />}
                {cat.title}
              </button>
            );
          })}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {activeCategory.items.map((tool) => {
            const selected = tool.id === selectedToolId;
            const Icon = TOOL_ICONS[tool.id];
            return (
              <button
                key={tool.id}
                type="button"
                onClick={() => selectTool(tool.id)}
                disabled={isProcessing}
                aria-pressed={selected}
                className={cardClass(
                  "md",
                  `text-left flex flex-col h-full transition-colors disabled:cursor-not-allowed ${FOCUS} ${
                    selected ? "border-ink ring-1 ring-ink" : "hover:border-line-strong"
                  }`
                )}
              >
                {Icon && (
                  <span aria-hidden className="mb-4 flex size-11 items-center justify-center rounded-button bg-surface-2 text-ink">
                    <Icon className="size-5" strokeWidth={1.75} />
                  </span>
                )}
                <h3 className="text-[15px] font-medium text-ink mb-1">{tool.title}</h3>
                <p className="text-ink-2 text-[13px] leading-relaxed flex-1">{tool.desc}</p>
                {selected && (
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink">
                    <Check aria-hidden className="size-4" /> Selected
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* --- STEP 2+: OPPLASTING + KJOERING (naar et verktoy er valgt) --- */}
      {selectedTool && (
        <Card padding="lg" className="space-y-6">
          <div className="flex items-center gap-4">
            {SelectedIcon && (
              <span aria-hidden className="flex size-11 items-center justify-center rounded-button bg-surface-2 text-ink">
                <SelectedIcon className="size-5" strokeWidth={1.75} />
              </span>
            )}
            <div>
              <p className="text-[13px] text-ink-2">Selected Tool</p>
              <p className="text-ink font-medium">{selectedTool.title}</p>
            </div>
          </div>

          <div>
            <label htmlFor="express-file" className={STEP_LABEL}>
              Step 2: Image
            </label>
            <input
              id="express-file"
              type="file"
              accept="image/*"
              onChange={preview.onInputChange}
              disabled={isProcessing}
              className={`block w-full rounded-button text-sm text-ink-2 file:mr-4 file:min-h-11 file:px-4 file:rounded-button file:border-0 file:text-sm file:font-medium file:bg-primary file:text-on-primary hover:file:opacity-90 file:cursor-pointer ${FOCUS}`}
            />
          </div>

          {/* Step 3: scene-type-kontroller KUN for scene_transform-kort med sceneGate */}
          {showSceneControls && (
            <div className="flex flex-wrap gap-6 items-end border-t border-line pt-6">
              <div>
                <label htmlFor="scene-type-select" className={STEP_LABEL}>
                  Scene type
                </label>
                <select
                  id="scene-type-select"
                  value={sceneType}
                  onChange={(e) =>
                    handleSceneTypeChange(e.target.value as SceneType)
                  }
                  disabled={isProcessing}
                  className={`min-h-11 bg-surface border border-ink-2 rounded-button px-4 text-sm text-ink disabled:opacity-50 disabled:cursor-not-allowed ${FOCUS}`}
                >
                  <option value="auto">Auto (classifier avgjør)</option>
                  <option value="exterior">Eksteriør</option>
                  <option value="interior">Interiør</option>
                </select>
              </div>

              <label
                className={`flex min-h-11 items-center gap-3 text-sm select-none ${
                  sceneType === "exterior" && !isProcessing
                    ? "text-ink cursor-pointer"
                    : "text-ink-2 opacity-60 cursor-not-allowed"
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
                  className={`size-5 accent-primary disabled:cursor-not-allowed ${FOCUS}`}
                />
                <span>
                  Tving eksteriør{" "}
                  <span className="text-ink-2">(hopp over classifier)</span>
                </span>
              </label>
            </div>
          )}

          {showDuskControls && (
            <DuskChoicePicker
              value={dusk}
              onChange={setDusk}
              disabled={isProcessing}
              locale={locale}
            />
          )}

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleRun} disabled={runDisabled}>
              {isProcessing ? "Running..." : "Run"}
            </Button>
            <Button variant="secondary" onClick={handleReset} disabled={isProcessing}>
              Reset
            </Button>
          </div>

          {job.rejection && (
            <RejectionPanel
              rejection={job.rejection}
              onForceExterior={handleForceExterior}
              disabled={runDisabled}
            />
          )}

          {/* Teknisk feil har ingen kode: alltid den generiske meldingen,
              aldri job.error (TG-NEW-121). */}
          {job.status === "failed" && !job.rejection && (
            <ErrorPanel message={t(locale, "job.failed")} />
          )}

          {job.status === "needs_review" && job.review && (
            <ReviewPanel review={job.review} />
          )}

          {(job.status === "awaiting_approval" ||
            job.status === "needs_review") &&
            job.jobId && <OpenReviewLink jobId={job.jobId} />}

          {job.status === "rejected_by_reviewer" && (
            <ReviewerRejectedPanel reason={job.reviewerReason} />
          )}

          {job.status === "unknown" && (
            <UnknownStatusPanel />
          )}
        </Card>
      )}

      {/* --- RESULTAT: input/output side om side --- */}
      {selectedTool && (
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Card>
            <p className="text-sm font-medium text-ink-2 mb-4">Input</p>
            {preview.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.previewUrl}
                alt="Input preview"
                className="w-full h-auto rounded-button border border-line"
              />
            ) : (
              <div className="aspect-square w-full rounded-button border border-dashed border-line-strong flex items-center justify-center text-ink-2 text-sm">
                No image selected
              </div>
            )}
          </Card>

          <Card>
            <p className="text-sm font-medium text-ink-2 mb-4">Output</p>
            {job.status === "awaiting_approval" && <ApprovalNotice />}
            {output.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={output.url}
                alt="Output result"
                className="w-full h-auto rounded-button border border-line"
              />
            ) : output.kind === "placeholder" ? (
              <PreviewPlaceholder />
            ) : (
              <div className="aspect-square w-full rounded-button border border-dashed border-line-strong flex items-center justify-center text-ink-2 text-sm">
                {isProcessing ? "Processing..." : "No result yet"}
              </div>
            )}
          </Card>
        </section>
      )}
    </main>
  );
}
