"use client";

import { Suspense, useEffect, useState, type ChangeEvent } from "react";
import { useSearchParams } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import { TOOL_ICONS } from "@/app/components/toolIcons";
import { ServiceCard } from "@/app/components/ServiceCard";
import { SERVICE_CARD_TEXT, UPLOAD_CARD_ID, splitBySize, uploadScrollBehavior } from "@/app/lib/serviceCards";
import { CARD_IMAGES } from "./cardImages";
import { DUSK_IMAGES } from "./duskImages";
import { STYLE_IMAGES } from "./styleImages";
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
import { NotCreatedPanel } from "@/app/components/NotCreatedPanel";
import { pollFailedLines } from "@/app/lib/notCreated";
import { OpenReviewLink } from "@/app/components/OpenReviewLink";
import { DuskChoicePicker } from "@/app/components/DuskChoicePicker";
import { ImageTypeChoice } from "@/app/components/ImageTypeChoice";
import { imageTypeChoices, imageTypeParams, type ImageTypeChoice as ImageTypeValue } from "@/app/lib/imageType";
import { DEFAULT_DUSK, duskParams, isDuskOrder, type DuskChoice } from "@/app/lib/dusk";
import { useOrderJobs } from "@/app/hooks/useOrderJobs";
import { StylingChoicePicker } from "@/app/components/StylingChoicePicker";
import { StylingOrderCards } from "@/app/components/StylingOrderCards";
import { StylingOrderBar } from "@/app/components/styling/StylingOrderBar";
import { EMPTY_STYLING, stylingParams, stylingSummary, type StylingChoice } from "@/app/lib/styling";
import { AarstidChoicePicker } from "@/app/components/AarstidChoicePicker";
import { aarstidParams, aarstidSummary, EMPTY_AARSTID, type AarstidChoice } from "@/app/lib/aarstid";
import { privacyDownload, saveBlob } from "@/app/lib/download";
import { aarstidOrderErrorText, orderErrorText, t } from "@/app/lib/i18n";
import { useLocale } from "@/app/lib/i18n/useLocale";
import { SERVICE_PARAM, toolFromParam, visibleCategories } from "@/app/lib/services";
import { Button } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { Pill } from "@/app/components/ui/Pill";
import { PageHeader } from "@/app/components/ui/PageHeader";

// Tjenestevalget ligger i lib/services.ts. Alle kortene vises; de som ikke er
// slaatt paa i ENABLED (TG-NEW-136), har orderable false og vises som
// «Kommer» uten klikk (dag 45). Ikonene ligger i components/toolIcons.ts.
// D-1 (dag 54): ingen kategorier lenger. De bestillbare kortene staar oeverst
// som store kort, og «Kommer» i egen seksjon nederst (D1_SVAR punkt 4 A).
const CATEGORIES = visibleCategories();
const ALL_TOOLS = CATEGORIES.flatMap((c) => c.items);
const ORDERABLE_TOOLS = ALL_TOOLS.filter((t) => t.orderable);
const COMING_TOOLS = ALL_TOOLS.filter((t) => !t.orderable);
// Dag 58 del 4: store kort med bilde for de tre demotjenestene, små kort uten bilde under.
const { large: LARGE_TOOLS, small: SMALL_TOOLS } = splitBySize(ORDERABLE_TOOLS);

const FOCUS =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-paper";
const STEP_LABEL = "text-sm font-medium text-ink block mb-3";

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
  const [selectedToolId, setSelectedToolId] = useState<string | null>(initial?.toolId ?? null);
  // Oekes naar megleren velger et kort: da rulles opplastingskortet inn (D1_SVAR punkt 5).
  const [scrollRequest, setScrollRequest] = useState(0);

  // Scene-type-gate-kontroller (kun for scene_transform-kort).
  const [sceneType, setSceneType] = useState<SceneType>("auto");
  const [forceSceneType, setForceSceneType] = useState(false);
  // Skumringsvalg (2f-b): tidspunkt og himmel, alltid et gyldig par, og stilen (TG-NEW-189).
  const [dusk, setDusk] = useState<DuskChoice>(DEFAULT_DUSK);
  // Digital styling (S2-f): romtypen og bekreftelsen av tomt rom.
  const [styling, setStyling] = useState<StylingChoice>(EMPTY_STYLING);
  // «Hvor er bildet tatt?» (TG-NEW-268): gjelder bildet, saa det nullstilles ved nytt bilde og ny tjeneste.
  const [imageType, setImageType] = useState<ImageTypeValue>("auto");
  // Aarstider (TG-NEW-271): når bildet er tatt og aarstidene. Kilden gjelder bildet, saa alt nullstilles ved nytt bilde.
  const [aarstid, setAarstid] = useState<AarstidChoice>(EMPTY_AARSTID);

  const locale = useLocale();
  const preview = useImagePreview();
  // Kvoten for gratisbilder (TG-NEW-149): fra GET /v1/quota, oppdatert fra bestillingen.
  const quota = useQuota();
  const job = useProcessJob({ onQuota: quota.apply });
  // Digital styling og Aarstider: én bestilling med 1–3 stiler eller aarstider.
  const order = useOrderJobs({ onQuota: quota.apply });
  const refreshQuota = quota.refresh;

  // Bare et kort som kan bestilles, kan vaere valgt (dag 45).
  const selectedTool =
    CATEGORIES.flatMap((c) => c.items).find((t) => t.orderable && t.id === selectedToolId) ??
    null;

  const isStyling = selectedTool?.kind === "styling";
  const isAarstid = selectedTool?.kind === "aarstid";
  // Bestillingene (POST /v1/orders/...): useOrderJobs og ett kort per jobb, ikke useProcessJob.
  const isOrder = isStyling || isAarstid;
  const isProcessing = job.isProcessing || order.isProcessing;
  const output = outputView(job.status, job.imageUrl);
  // Personvern (dag 51): «Last ned» under Resultat, bare med et resultat.
  const download = privacyDownload(selectedTool?.service, job.resultBlob, preview.file?.name);
  const showSceneControls =
    selectedTool?.kind === "scene" && selectedTool.sceneGate !== false;
  const showDuskControls =
    selectedTool !== null && isDuskOrder(selectedTool.service, selectedTool.presetId);
  // Bare tjenester med lovlige valg (imageTypeHints i services.ts): Kveldsbilde og Blå himmel.
  const imageTypeOptions = imageTypeChoices(selectedTool);
  const quotaShown = countsAgainstQuota(selectedTool?.service)
    ? quotaView(quota.quota)
    : ({ kind: "hidden" } as const);
  const runDisabled =
    !selectedTool ||
    !preview.file ||
    isProcessing ||
    !canOrder(selectedTool.service, quota.quota) ||
    (isStyling && stylingParams(styling) === null) ||
    (isAarstid && aarstidParams(aarstid) === null);
  // 402 vises av QuotaNotice naar kvoten er kjent; ellers av feilboksen.
  const showSubmitError =
    job.status === "failed" &&
    !job.rejection &&
    !(job.errorCode === "free_quota_exhausted" && quotaShown.kind === "exhausted");
  const showOrderError =
    order.failed && !(order.errorCode === "free_quota_exhausted" && quotaShown.kind === "exhausted");
  // P3b: grunnene naar vi ikke laget bildet, og gratisbildet bare ved "returned".
  // Poll har ikke oppskriften: den er bestillingen siden selv sendte.
  const jobLines = pollFailedLines(job, selectedTool?.presetId ?? null);
  const notCreatedShown = isOrder
    ? order.cards.length > 0 && order.cards.every((c) => c.notCreated !== null)
    : job.notCreated !== null;

  // En jobb som ender failed av teknisk grunn har gitt bildet tilbake:
  // hent tallet paa nytt (KONTRAKT_KVOTE).
  useEffect(() => {
    if (job.status === "failed" && job.jobId !== null) refreshQuota();
  }, [job.status, job.jobId, refreshQuota]);

  // Alle stilene feilet eller ble aldri startet: kvoten kan vaere gitt
  // tilbake (KONTRAKT_BESTILLING). Hent tallet paa nytt.
  const orderAllFailed = order.status === "failed" && order.cards.length > 0;
  useEffect(() => {
    if (orderAllFailed) refreshQuota();
  }, [orderAllFailed, refreshQuota]);

  // Opplastingskortet finnes foerst etter at kortet er valgt, saa rullingen
  // skjer her og ikke i selectTool. Ikke ved ?tjeneste= (scrollRequest 0).
  useEffect(() => {
    if (scrollRequest === 0) return;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    document
      .getElementById(UPLOAD_CARD_ID)
      ?.scrollIntoView({ block: "start", behavior: uploadScrollBehavior(reducedMotion) });
  }, [scrollRequest]);

  const selectTool = (toolId: string) => {
    if (isProcessing) return;
    setSelectedToolId(toolId);
    setScrollRequest((n) => n + 1);
    // Nullstill scene-kontroller og resultat ved bytte av verktoy.
    setSceneType("auto");
    setForceSceneType(false);
    setDusk(DEFAULT_DUSK);
    setStyling(EMPTY_STYLING);
    setImageType("auto");
    setAarstid(EMPTY_AARSTID);
    job.reset();
    order.reset();
  };

  const handleFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (isProcessing) return;
    preview.onInputChange(e);
    // Nytt bilde: feilen, avslaget og et gammelt resultat hoerer til det
    // forrige. Skumringsvalgene og bildetypen staar (TG-NEW-187).
    job.reset();
    // Bekreftelsen av tomt rom gjelder bildet: et nytt bilde maa bekreftes paa nytt.
    order.reset();
    setStyling((s) => ({ ...s, roomEmpty: false }));
    // Hvor bildet er tatt, gjelder ogsaa bildet (TG-NEW-268), og det samme gjoer aarstiden det er tatt i.
    setImageType("auto");
    setAarstid(EMPTY_AARSTID);
  };

  const handleSceneTypeChange = (value: SceneType) => {
    setSceneType(value);
    // force_scene_type=true er kun gyldig sammen med scene_type="exterior"
    // (backend gir HTTP 400 ellers) — nullstill ved bytte.
    if (value !== "exterior") setForceSceneType(false);
  };

  const handleRun = () => {
    if (!selectedTool || !preview.file || isProcessing) return;
    if (selectedTool.kind === "styling") {
      // Egen bestilling (POST /v1/orders/styling): de valgte stilene, ett trekk.
      const params = stylingParams(styling);
      if (params !== null) void order.run(preview.file, params);
      return;
    }
    if (selectedTool.kind === "aarstid") {
      // Egen bestilling (POST /v1/orders/aarstid): kilden og aarstidene, ett trekk.
      const params = aarstidParams(aarstid);
      if (params !== null) void order.runAarstid(preview.file, params);
      return;
    }
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
        // Skumring: alltid tid, himmel og stil; andre kort: ingen (2f-b, TG-NEW-189).
        ...duskParams(selectedTool.service, selectedTool.presetId, dusk),
        // TG-NEW-268: bare naar megleren har valgt, og bare et lovlig valg.
        ...imageTypeParams(selectedTool, imageType),
      });
    } else {
      // Simple tjenester: service alene, backend-defaults (som i prod).
      job.run(preview.file, selectedTool.service);
    }
  };

  const handleReset = () => {
    preview.clear();
    job.reset();
    order.reset();
    setSceneType("auto");
    setForceSceneType(false);
    setDusk(DEFAULT_DUSK);
    setStyling(EMPTY_STYLING);
    setImageType("auto");
    setAarstid(EMPTY_AARSTID);
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
          <StatusBadge
            status={isOrder ? order.status : job.status}
            service={selectedTool?.service}
            notCreated={notCreatedShown}
          />
        }
      />

      {/* --- VELG TJENESTE: de store kortene (D-1), uten kategorier --- */}
      <section className="space-y-4">
        <h2 className="text-sm font-medium text-ink">{t(locale, "express.chooseService")}</h2>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 lg:gap-8">
          {LARGE_TOOLS.map((tool) => (
            <ServiceCard
              key={tool.id}
              tool={tool}
              text={SERVICE_CARD_TEXT[tool.id]}
              images={CARD_IMAGES[tool.id]}
              selected={tool.id === selectedToolId}
              disabled={isProcessing}
              onSelect={() => selectTool(tool.id)}
              locale={locale}
            />
          ))}
        </div>
        {SMALL_TOOLS.length > 0 && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:gap-6">
            {SMALL_TOOLS.map((tool) => (
              <ServiceCard
                key={tool.id}
                tool={tool}
                text={SERVICE_CARD_TEXT[tool.id]}
                images={undefined}
                selected={tool.id === selectedToolId}
                disabled={isProcessing}
                onSelect={() => selectTool(tool.id)}
                locale={locale}
                size="small"
              />
            ))}
          </div>
        )}
      </section>

      {/* --- OPPLASTING + KJOERING (naar en tjeneste er valgt) --- */}
      {selectedTool && (
        // scroll-mt: under den faste topplinja (h-16) naar kortet rulles inn.
        <Card id={UPLOAD_CARD_ID} padding="lg" className="scroll-mt-24 space-y-6">
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
              images={DUSK_IMAGES}
              locale={locale}
            />
          )}

          {/* TG-NEW-268: etter stilene og himmelen i Kveldsbilde, rett etter bildet i Blå himmel. */}
          {imageTypeOptions.length > 0 && (
            <ImageTypeChoice
              choices={imageTypeOptions}
              value={imageType}
              onChange={setImageType}
              disabled={isProcessing}
              locale={locale}
            />
          )}

          {isStyling && (
            <StylingChoicePicker
              value={styling}
              onChange={setStyling}
              disabled={isProcessing}
              images={STYLE_IMAGES}
              locale={locale}
            />
          )}

          {isAarstid && (
            <AarstidChoicePicker value={aarstid} onChange={setAarstid} disabled={isProcessing} locale={locale} />
          )}

          <QuotaNotice view={quotaShown} locale={locale} />

          {/* Digital styling: «Bestill» i den faste linja (D-3 kompakt); «Start på nytt» står under. */}
          {isStyling && (
            <StylingOrderBar {...stylingSummary(locale, styling)}>
              <Button onClick={handleRun} disabled={runDisabled}>
                {t(locale, isProcessing ? "styling.ordering" : "styling.order")}
              </Button>
            </StylingOrderBar>
          )}

          {/* Aarstider: samme faste linje som Digital styling. */}
          {isAarstid && (
            <StylingOrderBar {...aarstidSummary(locale, aarstid)}>
              <Button onClick={handleRun} disabled={runDisabled}>
                {t(locale, isProcessing ? "styling.ordering" : "styling.order")}
              </Button>
            </StylingOrderBar>
          )}

          <div className="flex flex-wrap gap-3">
            {!isOrder && (
              <Button onClick={handleRun} disabled={runDisabled}>
                {t(locale, isProcessing ? "express.running" : "express.run")}
              </Button>
            )}
            <Button variant="secondary" onClick={handleReset} disabled={isProcessing}>
              {t(locale, "express.reset")}
            </Button>
          </div>

          {(job.waking || order.waking) && (
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
          {showSubmitError && job.notCreated !== null && <NotCreatedPanel lines={jobLines} />}

          {showSubmitError && job.notCreated === null && (
            <ErrorPanel
              message={orderErrorText(locale, job.errorCode, job.errorReason)}
              lines={jobLines.map((key) => t(locale, key))}
            />
          )}

          {showOrderError && (
            <ErrorPanel
              message={(isAarstid ? aarstidOrderErrorText : orderErrorText)(locale, order.errorCode, order.errorReason)}
            />
          )}

          {job.status === "needs_review" && job.review && (
            <ReviewPanel review={job.review} />
          )}

          {(job.status === "awaiting_approval" ||
            job.status === "needs_review") &&
            job.jobId && <OpenReviewLink jobId={job.jobId} />}

          {job.status === "rejected_by_reviewer" && (
            <ReviewerRejectedPanel reason={job.reviewerReason} lines={jobLines} />
          )}

          {job.status === "unknown" && (
            <UnknownStatusPanel />
          )}
        </Card>
      )}

      {/* --- RESULTAT (Digital styling og Aarstider): originalen og ett kort per stil eller aarstid --- */}
      {selectedTool && isOrder && (
        <section className="space-y-6">
          <Card>
            <p className="text-sm font-medium text-ink-2 mb-4">{t(locale, "review.original")}</p>
            {preview.previewUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={preview.previewUrl}
                alt={t(locale, "review.original")}
                className="w-full max-w-md h-auto rounded-button border border-line"
              />
            ) : (
              <p className="text-ink-2 text-sm">{t(locale, "express.noImage")}</p>
            )}
          </Card>
          {order.cards.length > 0 && <StylingOrderCards cards={order.cards} locale={locale} />}
        </section>
      )}

      {/* --- RESULTAT: input/output side om side --- */}
      {selectedTool && !isOrder && (
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
                view={workingView(selectedTool.service, selectedTool.presetId)}
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
            {download && (
              <div className="mt-6">
                <Button onClick={() => saveBlob(download.blob, download.fileName)}>
                  {t(locale, "express.download")}
                </Button>
              </div>
            )}
          </Card>
        </section>
      )}

      {/* --- KOMMER (dag 45): kortene som ikke kan bestilles, uten kategorier (D-1) --- */}
      {COMING_TOOLS.length > 0 && (
        <section aria-labelledby="kommer-tittel" className="space-y-4">
          <h2 id="kommer-tittel" className="text-sm font-medium text-ink">
            {t(locale, "express.comingTitle")}
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            {COMING_TOOLS.map((tool) => {
              const Icon = TOOL_ICONS[tool.id];
              // Ingen knapp og ingen onClick, ikke i tab-rekkefoelgen. Ingen
              // opacity, saa teksten holder kontrasten.
              return (
                <div
                  key={tool.id}
                  role="group"
                  aria-disabled="true"
                  aria-labelledby={`coming-${tool.id}`}
                  className="rounded-card border border-dashed border-line-strong bg-paper p-6 text-left flex flex-col h-full"
                >
                  <div className="mb-4 flex items-start justify-between gap-3">
                    {Icon && (
                      <span aria-hidden className="flex size-11 items-center justify-center rounded-button bg-surface-2 text-ink-2">
                        <Icon className="size-5" strokeWidth={1.75} />
                      </span>
                    )}
                    <span className="ml-auto">
                      <Pill tone="neutral">{t(locale, "express.coming")}</Pill>
                    </span>
                  </div>
                  <h3 id={`coming-${tool.id}`} className="text-[15px] font-medium text-ink-2 mb-1">
                    {t(locale, tool.titleKey)}
                  </h3>
                  <p className="text-ink-2 text-[13px] leading-relaxed flex-1">{t(locale, tool.descKey)}</p>
                </div>
              );
            })}
          </div>
        </section>
      )}
    </main>
  );
}
