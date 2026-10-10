"use client";

import { Suspense, useEffect, useState, type ChangeEvent } from "react";
import { useSearchParams } from "next/navigation";
import { Check, Clock, Eraser, LayoutGrid, type LucideIcon } from "lucide-react";
import { TOOL_ICONS } from "@/app/components/toolIcons";
import { useImagePreview } from "@/app/hooks/useImagePreview";
import { useProcessJob } from "@/app/hooks/useProcessJob";
import { useQuota } from "@/app/hooks/useQuota";
import { QuotaNotice } from "@/app/components/QuotaNotice";
import { canOrder, countsAgainstQuota, quotaView } from "@/app/lib/quota";
import { StatusBadge } from "@/app/components/StatusBadge";
import { ErrorPanel } from "@/app/components/ErrorPanel";
import { RejectionPanel } from "@/app/components/RejectionPanel";
import { ReviewPanel } from "@/app/components/ReviewPanel";
import { UnknownStatusPanel } from "@/app/components/UnknownStatusPanel";
import { ApprovalNotice } from "@/app/components/ApprovalNotice";
import { PreviewPlaceholder } from "@/app/components/PreviewPlaceholder";
import { JobMedia } from "@/app/components/JobMedia";
import { workingView } from "@/app/lib/jobMedia";
import { outputView } from "@/app/lib/jobState";
import { ReviewerRejectedPanel } from "@/app/components/ReviewerRejectedPanel";
import { OpenReviewLink } from "@/app/components/OpenReviewLink";
import { DuskChoicePicker } from "@/app/components/DuskChoicePicker";
import { DEFAULT_DUSK, duskParams, isDuskOrder, type DuskChoice } from "@/app/lib/dusk";
import { orderErrorText, t } from "@/app/lib/i18n";
import { useLocale } from "@/app/lib/i18n/useLocale";
import { expressCategories, SERVICE_PARAM, toolFromParam } from "@/app/lib/services";
import { Button } from "@/app/components/ui/Button";
import { Card, cardClass } from "@/app/components/ui/Card";
import { PageHeader } from "@/app/components/ui/PageHeader";

// Tjenestevalget ligger i lib/services.ts, filtrert paa ENABLED (TG-NEW-136).
const CATEGORIES = expressCategories();

// Lucide i stedet for emojiene i services.ts (D1). Ukjent id: ingen ikon.
const CATEGORY_ICONS: Record<string, LucideIcon> = { fixit: Eraser, timetraveler: Clock };

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

// useSearchParams krever en Suspense-grense i prod-bygget (use-search-params.md).
export default function ExpressPage() {
  return (
    <Suspense fallback={null}>
      <ExpressContent />
    </Suspense>
  );
}

function ExpressContent() {
  // TG-NEW-153: /tjenester?tjeneste=<id> velger verktoeyet (snarveiene paa
  // /start). Bare tjenester som er slaatt paa; ellers ingen valg, som foer.
  const searchParams = useSearchParams();
  const [initial] = useState(() => toolFromParam(searchParams.get(SERVICE_PARAM)));
  const [activeCategoryId, setActiveCategoryId] = useState<string>(
    initial?.categoryId ?? CATEGORIES[0]?.id ?? ""
  );
  const [selectedToolId, setSelectedToolId] = useState<string | null>(initial?.toolId ?? null);

  // Scene-type-gate-kontroller (kun for scene_transform-kort).
  const [sceneType, setSceneType] = useState<SceneType>("auto");
  const [forceSceneType, setForceSceneType] = useState(false);
  // Skumringsvalg (2f-b): tidspunkt og himmel, alltid et gyldig par.
  const [dusk, setDusk] = useState<DuskChoice>(DEFAULT_DUSK);

  const locale = useLocale();
  const preview = useImagePreview();
  // Kvoten for gratisbilder (TG-NEW-149): fra GET /v1/quota, oppdatert fra bestillingen.
  const quota = useQuota();
  const job = useProcessJob({ onQuota: quota.apply });
  const refreshQuota = quota.refresh;

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
  const quotaShown = countsAgainstQuota(selectedTool?.service)
    ? quotaView(quota.quota)
    : ({ kind: "hidden" } as const);
  const runDisabled =
    !selectedTool || !preview.file || isProcessing || !canOrder(selectedTool.service, quota.quota);
  // 402 vises av QuotaNotice naar kvoten er kjent; ellers av feilboksen.
  const showSubmitError =
    job.status === "failed" &&
    !job.rejection &&
    !(job.errorCode === "free_quota_exhausted" && quotaShown.kind === "exhausted");

  // En jobb som ender failed av teknisk grunn har gitt bildet tilbake:
  // hent tallet paa nytt (KONTRAKT_KVOTE).
  useEffect(() => {
    if (job.status === "failed" && job.jobId !== null) refreshQuota();
  }, [job.status, job.jobId, refreshQuota]);

  const selectTool = (toolId: string) => {
    if (isProcessing) return;
    setSelectedToolId(toolId);
    // Nullstill scene-kontroller og resultat ved bytte av verktoy.
    setSceneType("auto");
    setForceSceneType(false);
    setDusk(DEFAULT_DUSK);
    job.reset();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (isProcessing) return;
    preview.onInputChange(e);
    // Nytt bilde: feilen, avslaget og et gammelt resultat hoerer til det
    // forrige. Skumringsvalgene og bildetypen staar (TG-NEW-187).
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
            <LayoutGrid aria-hidden className="size-7" strokeWidth={1.5} /> {t(locale, "express.title")}
          </span>
        }
        subtitle={t(locale, "express.subtitle")}
        actions={
          /* Uten error: den raa teksten skal ikke vises (TG-NEW-121). */
          <StatusBadge status={job.status} service={selectedTool?.service} />
        }
      />

      {/* --- VELG TJENESTE --- */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-ink">{t(locale, "express.chooseService")}</h2>

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
                {t(locale, cat.titleKey)}
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
                <h3 className="text-[15px] font-medium text-ink mb-1">{t(locale, tool.titleKey)}</h3>
                <p className="text-ink-2 text-[13px] leading-relaxed flex-1">{t(locale, tool.descKey)}</p>
                {selected && (
                  <span className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium text-ink">
                    <Check aria-hidden className="size-4" /> {t(locale, "express.selected")}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* --- OPPLASTING + KJOERING (naar en tjeneste er valgt) --- */}
      {selectedTool && (
        <Card padding="lg" className="space-y-6">
          <div className="flex items-center gap-4">
            {SelectedIcon && (
              <span aria-hidden className="flex size-11 items-center justify-center rounded-button bg-surface-2 text-ink">
                <SelectedIcon className="size-5" strokeWidth={1.75} />
              </span>
            )}
            <div>
              <p className="text-[13px] text-ink-2">{t(locale, "express.selectedService")}</p>
              <p className="text-ink font-medium">{t(locale, selectedTool.titleKey)}</p>
            </div>
          </div>

          <div>
            <label htmlFor="express-file" className={STEP_LABEL}>
              {t(locale, "express.chooseImage")}
            </label>
            <input
              id="express-file"
              type="file"
              accept="image/*"
              onChange={handleFileChange}
              disabled={isProcessing}
              className={`block w-full rounded-button text-sm text-ink-2 file:mr-4 file:min-h-11 file:px-4 file:rounded-button file:border-0 file:text-sm file:font-medium file:bg-primary file:text-on-primary hover:file:opacity-90 file:cursor-pointer ${FOCUS}`}
            />
          </div>

          {/* Bildetype-kontroller KUN for scene_transform-kort med sceneGate */}
          {showSceneControls && (
            <div className="flex flex-wrap gap-6 items-end border-t border-line pt-6">
              <div>
                <label htmlFor="scene-type-select" className={STEP_LABEL}>
                  {t(locale, "express.imageType")}
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
                  <option value="auto">{t(locale, "express.imageTypeAuto")}</option>
                  <option value="exterior">{t(locale, "express.imageTypeExterior")}</option>
                  <option value="interior">{t(locale, "express.imageTypeInterior")}</option>
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
                    ? t(locale, "express.forceExteriorTitle")
                    : t(locale, "express.forceExteriorLocked")
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
                  {t(locale, "express.forceExterior")}{" "}
                  <span className="text-ink-2">{t(locale, "express.forceExteriorHint")}</span>
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

          <QuotaNotice view={quotaShown} locale={locale} />

          <div className="flex flex-wrap gap-3">
            <Button onClick={handleRun} disabled={runDisabled}>
              {t(locale, isProcessing ? "express.running" : "express.run")}
            </Button>
            <Button variant="secondary" onClick={handleReset} disabled={isProcessing}>
              {t(locale, "express.reset")}
            </Button>
          </div>

          {job.waking && (
            <p className="text-sm text-ink-2" role="status">
              {t(locale, "net.waking")}
            </p>
          )}

          {job.rejection && (
            <RejectionPanel
              rejection={job.rejection}
              onForceExterior={handleForceExterior}
              disabled={runDisabled}
            />
          )}

          {/* Aldri job.error (TG-NEW-121). Feil fra bestillingen med kode
              (TG-NEW-149) har egen tekst; uten kode, eller med ukjent kode,
              den generiske meldingen. */}
          {showSubmitError && (
            <ErrorPanel message={orderErrorText(locale, job.errorCode, job.errorReason)} />
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
            <p className="text-sm font-medium text-ink-2 mb-4">{t(locale, "review.original")}</p>
            {preview.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.previewUrl}
                alt={t(locale, "review.original")}
                className="w-full h-auto rounded-button border border-line"
              />
            ) : (
              <div className="aspect-square w-full rounded-button border border-dashed border-line-strong flex items-center justify-center text-ink-2 text-sm">
                {t(locale, "express.noImage")}
              </div>
            )}
          </Card>

          <Card>
            <p className="text-sm font-medium text-ink-2 mb-4">{t(locale, "review.result")}</p>
            {job.status === "awaiting_approval" && <ApprovalNotice />}
            {output.kind === "image" ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={output.url}
                alt={t(locale, "review.result")}
                className="w-full h-auto rounded-button border border-line"
              />
            ) : output.kind === "placeholder" ? (
              <PreviewPlaceholder />
            ) : isProcessing ? (
              // Ventebildet (Petter 02.10, valg A): samme rolige symbol som i Historikk.
              <JobMedia
                view={workingView(selectedTool.service)}
                resultAlt={t(locale, "review.result")}
                aspect="square"
                frame="rounded-button border border-dashed border-line-strong"
                locale={locale}
              />
            ) : (
              <div className="aspect-square w-full rounded-button border border-dashed border-line-strong flex items-center justify-center text-ink-2 text-sm">
                {t(locale, "express.noResult")}
              </div>
            )}
          </Card>
        </section>
      )}
    </main>
  );
}
