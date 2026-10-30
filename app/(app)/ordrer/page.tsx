"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { Download, ImageOff } from "lucide-react";
import { assignmentRequest } from "@/app/lib/api";
import { assignmentErrorCode, listAssignments, type AssignmentSummary } from "@/app/lib/assignments";
import { appendOrders, NEW_ORDER_PATH, orderDeliveryHref, orderImagesHref, orderMeta, ORDERS_PAGE_SIZE } from "@/app/lib/ordrer";
import { formatDay } from "@/app/lib/dates";
import { ORDERS_PATH, isPageEnabled } from "@/app/lib/services";
import { ServiceUnavailable } from "@/app/components/ServiceUnavailable";
import { Button, ButtonLink, buttonClass } from "@/app/components/ui/Button";
import { Card, cardClass } from "@/app/components/ui/Card";
import { PageHeader } from "@/app/components/ui/PageHeader";
import { FOCUS } from "@/app/components/godkjenning/classes";
import { codeText, t } from "@/app/lib/i18n";
import { useLocale } from "@/app/lib/i18n/useLocale";

/**
 * Ordrelista (TG-NEW-277, FE-2): adresse, oppdragsnummer, antall bilder og
 * dato, nyeste foerst (K 2.2), med «Vis flere» etter `next_cursor`. Filtrene i
 * skissen er kuttet for lanseringen (audit punkt 9). Hver rad gaar til bildene
 * til ordresiden finnes (FE-4), og «Last ned» til nedlastingen (FE-5).
 */
export default function OrdersPage() {
  if (!isPageEnabled(ORDERS_PATH)) return <ServiceUnavailable />;
  return <OrdersContent />;
}

function OrdersContent() {
  const { getToken } = useAuth();
  const locale = useLocale();

  const [orders, setOrders] = useState<AssignmentSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  // Kaldstart (TG-NEW-134): GET proeves paa nytt, og spinneren viser en rolig tekst.
  const [waking, setWaking] = useState(false);
  // «Oppdater» mens en henting pagaar: bare det siste svaret teller.
  const requestRef = useRef(0);

  const request = useMemo(() => assignmentRequest(getToken, () => setWaking(true)), [getToken]);

  const loadInitial = useCallback(async () => {
    const id = ++requestRef.current;
    setLoading(true);
    setErrorCode(null);
    setWaking(false);
    try {
      const page = await listAssignments(request, { limit: ORDERS_PAGE_SIZE });
      if (id !== requestRef.current) return;
      setOrders(page.items);
      setCursor(page.nextCursor);
    } catch (err) {
      if (id === requestRef.current) setErrorCode(assignmentErrorCode(err));
    } finally {
      if (id === requestRef.current) {
        setLoading(false);
        setWaking(false);
      }
    }
  }, [request]);

  useEffect(() => {
    void loadInitial();
  }, [loadInitial]);

  const loadMore = useCallback(async () => {
    if (cursor === null) return;
    const id = requestRef.current;
    setLoadingMore(true);
    setErrorCode(null);
    try {
      const page = await listAssignments(request, { limit: ORDERS_PAGE_SIZE, cursor });
      if (id !== requestRef.current) return;
      setOrders((prev) => appendOrders(prev, page.items));
      setCursor(page.nextCursor);
    } catch (err) {
      if (id === requestRef.current) setErrorCode(assignmentErrorCode(err));
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, request]);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-8 md:px-8 md:py-12">
      <div className="mb-8">
        <PageHeader
          title={t(locale, "orders.title")}
          subtitle={t(locale, "orders.subtitle")}
          actions={
            <>
              <Button variant="secondary" onClick={() => void loadInitial()} disabled={loading}>
                {t(locale, "action.refresh")}
              </Button>
              <ButtonLink href={NEW_ORDER_PATH}>{t(locale, "orders.new")}</ButtonLink>
            </>
          }
        />
      </div>

      {loading ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4" role="status">
          <div className="w-8 h-8 border-4 border-line border-t-ink rounded-full animate-spin motion-reduce:animate-none" />
          <p className="text-ink-2 text-sm">{t(locale, waking ? "net.waking" : "orders.loading")}</p>
        </div>
      ) : errorCode !== null && orders.length === 0 ? (
        <Card padding="lg" className="text-center max-w-lg mx-auto">
          <p className="text-red-fg font-medium mb-2">{t(locale, "orders.loadError")}</p>
          <p className="text-ink-2 text-sm mb-6 break-words">{codeText(locale, "assignmentError", errorCode)}</p>
          <Button onClick={() => void loadInitial()}>{t(locale, "review.retry")}</Button>
        </Card>
      ) : orders.length === 0 ? (
        <Card padding="lg" className="text-center max-w-lg mx-auto">
          <p className="text-ink font-medium text-lg mb-2">{t(locale, "orders.emptyTitle")}</p>
          <p className="text-ink-2 text-sm mb-8">{t(locale, "orders.emptyBody")}</p>
          <ButtonLink href={NEW_ORDER_PATH}>{t(locale, "orders.new")}</ButtonLink>
        </Card>
      ) : (
        <>
          <ul className="flex flex-col gap-3 mb-10">
            {orders.map((order) => (
              <li key={order.id} className={cardClass("none", "flex flex-col sm:flex-row sm:items-center")}>
                <Link
                  href={orderImagesHref(order.id)}
                  className={`flex min-w-0 flex-1 items-center gap-4 rounded-card p-3 transition-colors hover:bg-surface-2 ${FOCUS}`}
                >
                  <span className="flex aspect-[4/3] w-20 shrink-0 items-center justify-center overflow-hidden rounded-button bg-surface-2 sm:w-28">
                    {order.coverThumbUrl ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={order.coverThumbUrl} alt="" loading="lazy" className="h-full w-full object-cover" />
                    ) : (
                      <ImageOff aria-hidden className="size-5 text-ink-2" strokeWidth={1.75} />
                    )}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col gap-1">
                    <span className="truncate font-medium text-ink">{order.address}</span>
                    <span className="truncate text-sm text-ink-2">{orderMeta(locale, order)}</span>
                  </span>
                  <span className="shrink-0 text-sm text-ink-2">{formatDay(order.createdAt, locale)}</span>
                </Link>
                {order.counts.images > 0 && (
                  <Link
                    href={orderDeliveryHref(order.id)}
                    aria-label={t(locale, "delivery.linkLabel", { address: order.address })}
                    className={buttonClass("secondary", "mx-3 mb-3 sm:my-3 sm:ml-0 px-4")}
                  >
                    <Download aria-hidden className="size-4" strokeWidth={1.75} />
                    {t(locale, "delivery.listLink")}
                  </Link>
                )}
              </li>
            ))}
          </ul>

          {errorCode !== null && (
            <p className="text-center text-sm text-red-fg mb-6 break-words" role="alert">
              {codeText(locale, "assignmentError", errorCode)}
            </p>
          )}

          {cursor !== null && (
            <div className="flex justify-center pb-20">
              <Button variant="secondary" onClick={() => void loadMore()} disabled={loadingMore}>
                {t(locale, loadingMore ? "orders.loadingMore" : "orders.loadMore")}
              </Button>
            </div>
          )}
        </>
      )}
    </main>
  );
}
