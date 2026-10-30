"use client";

import { useEffect, useRef, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { X } from "lucide-react";
import { getReview, postDecision } from "../../lib/api";
import { buildDecision, canReopen, reopenMessage } from "../../lib/review";
import { UNDO_NOTICE_MS, undoKeys, undoNoticeKey } from "../../lib/player";
import { messageText, t, type Message } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";
import { ReopenConfirm } from "../godkjenning/ReopenConfirm";
import { FOCUS } from "../godkjenning/classes";

/** Meldingen etter hoppet: resultatet som ble avgjort, og navnet («Stue · Kveldsbilde»). */
export interface Undo {
  action: "approve" | "reject";
  resultId: string;
  label: string;
}

/**
 * Meldingen over spilleren etter hoppet (FE-4, Petter 30.10): «Godkjent:
 * Stue · Kveldsbilde» eller «Avvist: …» med «Angre godkjenning» / «Angre»,
 * samme handling og bekreftelse som i ResultReview (ReopenConfirm). Den
 * staar i ca. 10 sekunder (UNDO_NOTICE_MS), men ikke mens spoersmaalet er
 * aapent, kallet gaar, pekeren er over den eller fokus er i den (WCAG 2.2.1).
 *
 * «Angre» henter review foerst, for `version` og for aa se at `reopen`
 * fortsatt er lov (canReopen), og sender saa `reopen`. Etterpaa kaller den
 * `onUndone`, som henter ordren og gaar tilbake til resultatet. Feil staar
 * i meldingen til den lukkes. Teksten kunngjoeres av omraadet rundt
 * (aria-live="polite" i AssignmentPlayer).
 */
export function UndoNotice({
  undo,
  onUndone,
  onClose,
}: {
  undo: Undo;
  onUndone: (resultId: string) => void;
  onClose: () => void;
}) {
  const { getToken } = useAuth();
  const locale = useLocale();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<Message | null>(null);
  const [hover, setHover] = useState(false);
  const [focusWithin, setFocusWithin] = useState(false);
  const inFlight = useRef(false);

  const paused = confirmOpen || working || hover || focusWithin || error !== null;
  useEffect(() => {
    if (paused) return;
    const id = window.setTimeout(onClose, UNDO_NOTICE_MS);
    return () => window.clearTimeout(id);
  }, [paused, onClose]);

  const reopen = async () => {
    if (inFlight.current) return;
    inFlight.current = true;
    setWorking(true);
    setError(null);
    try {
      const review = await getReview({ jobId: undo.resultId, getToken });
      if (review.kind !== "ok" || !canReopen(review.review)) {
        setError({ key: "reopen.notAllowed" });
        return;
      }
      const out = await postDecision({
        jobId: undo.resultId,
        decision: buildDecision("reopen", "", null, review.review),
        getToken,
      });
      const message = reopenMessage(out);
      if (message === null) onUndone(undo.resultId);
      else setError(message);
    } catch {
      setError({ key: "decision.error" });
    } finally {
      inFlight.current = false;
      setWorking(false);
    }
  };

  return (
    <div
      className="flex items-start gap-2 rounded-card border border-line bg-surface p-3"
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setFocusWithin(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocusWithin(false);
      }}
    >
      <div className="min-w-0 flex-1 py-2">
        <p className="break-words text-sm font-medium text-ink">{t(locale, undoNoticeKey(undo.action), { label: undo.label })}</p>
        {error !== null && <p className="mt-2 text-sm text-red-fg">{messageText(locale, error)}</p>}
        {error === null && (
          <ReopenConfirm
            keys={undoKeys(undo.action)}
            onConfirm={() => void reopen()}
            locked={working}
            working={working}
            onOpenChange={setConfirmOpen}
            locale={locale}
          />
        )}
      </div>
      <button
        type="button"
        onClick={onClose}
        aria-label={t(locale, "orders.startedClose")}
        className={`inline-flex size-11 shrink-0 items-center justify-center rounded-pill text-ink hover:bg-surface-2 ${FOCUS}`}
      >
        <X aria-hidden className="size-5" />
      </button>
    </div>
  );
}
