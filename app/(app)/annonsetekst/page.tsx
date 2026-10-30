"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { ImageOff } from "lucide-react";
import { assignmentRequest } from "@/app/lib/api";
import {
  assignmentErrorCode,
  createAssignment,
  listAssignments,
  type AssignmentRequest,
  type AssignmentSummary,
} from "@/app/lib/assignments";
import { ADDRESS_MAX, appendOrders, checkNewOrder, orderMeta, ORDERS_PAGE_SIZE } from "@/app/lib/ordrer";
import { listingTextHref, SAME_ADDRESS_PAGES, sameAddressOrders } from "@/app/lib/listingText";
import { listingTextAccess } from "@/app/lib/services";
import { formatDay } from "@/app/lib/dates";
import { ServiceUnavailable } from "@/app/components/ServiceUnavailable";
import { ListingTextGate } from "@/app/components/annonsetekst/ListingTextGate";
import { Button } from "@/app/components/ui/Button";
import { Card, cardClass } from "@/app/components/ui/Card";
import { PageHeader } from "@/app/components/ui/PageHeader";
import { FOCUS } from "@/app/components/godkjenning/classes";
import { codeText, t, type Locale, type UiKey } from "@/app/lib/i18n";
import { useLocale } from "@/app/lib/i18n/useLocale";

/**
 * Annonsetekst, inngangen (TG-NEW-281, T1): velg en av ordrene, eller skriv
 * en ny adresse. Valget gaar til /annonsetekst/[ordreId].
 *
 * Ny adresse (K §9.3 punkt 9): foer en ny ordre lages, hentes de nyeste
 * ordrene (SAME_ADDRESS_PAGES sider) og sammenlignes med adressen
 * (normalizeAddress). Finnes samme adresse, velger megleren en av dem eller
 * «Lag ny ordre». Kallet er det samme som «Ny ordre» (POST /v1/assignments).
 * Lista viser ikke om ordren har en tekstpakke: ordrelista har ikke feltet
 * (K §9.3 punkt 7, etter 6.11; Petter 30.10).
 */
export default function ListingTextPage() {
  // Flagget "off" (og ordrene av): ingen hooks og ingen kall.
  if (listingTextAccess(null) === "no") return <ServiceUnavailable />;
  return (
    <ListingTextGate>
      <OrderPicker />
    </ListingTextGate>
  );
}

const INPUT = `block w-full min-h-11 rounded-button border border-line-strong bg-surface px-3 py-2 text-ink ${FOCUS}`;

/** De nyeste ordrene, side for side, til sammenligningen av adressen. */
async function recentOrders(request: AssignmentRequest): Promise<AssignmentSummary[]> {
  let all: AssignmentSummary[] = [];
  let cursor: string | null = null;
  for (let page = 0; page < SAME_ADDRESS_PAGES; page++) {
    const next = await listAssignments(request, { limit: ORDERS_PAGE_SIZE, ...(cursor !== null ? { cursor } : {}) });
    all = appendOrders(all, next.items);
    cursor = next.nextCursor;
    if (cursor === null) break;
  }
  return all;
}

function OrderPicker() {
  const { getToken } = useAuth();
  const locale = useLocale();
  const router = useRouter();

  // --- lista -------------------------------------------------------------------
  const [orders, setOrders] = useState<AssignmentSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  // Kaldstart (TG-NEW-134): GET proeves paa nytt, og spinneren viser en rolig tekst.
  const [waking, setWaking] = useState(false);
  const requestRef = useRef(0);

  const request = useMemo(() => assignmentRequest(getToken), [getToken]);

  // Foerste side. Ingen setState foer svaret (effekten under kaller den), og
  // «Kobler til …» bare for den siste hentingen, som paa /start.
  const fetchFirst = useCallback(async () => {
    const id = ++requestRef.current;
    const onRetry = () => {
      if (id === requestRef.current) setWaking(true);
    };
    try {
      const page = await listAssignments(assignmentRequest(getToken, onRetry), { limit: ORDERS_PAGE_SIZE });
      if (id !== requestRef.current) return;
      setOrders(page.items);
      setCursor(page.nextCursor);
    } catch (err) {
      if (id === requestRef.current) setListError(assignmentErrorCode(err));
    } finally {
      if (id === requestRef.current) {
        setLoading(false);
        setWaking(false);
      }
    }
  }, [getToken]);

  useEffect(() => {
    void fetchFirst();
  }, [fetchFirst]);

  const retry = () => {
    setLoading(true);
    setListError(null);
    setWaking(false);
    void fetchFirst();
  };

  const loadMore = useCallback(async () => {
    if (cursor === null) return;
    const id = requestRef.current;
    setLoadingMore(true);
    setListError(null);
    try {
      const page = await listAssignments(request, { limit: ORDERS_PAGE_SIZE, cursor });
      if (id !== requestRef.current) return;
      setOrders((prev) => appendOrders(prev, page.items));
      setCursor(page.nextCursor);
    } catch (err) {
      if (id === requestRef.current) setListError(assignmentErrorCode(err));
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, request]);

  // --- ny adresse ----------------------------------------------------------------
  const [address, setAddress] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<UiKey | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);
  // Ordrene med samme adresse, naar megleren skal velge (null: ikke sjekket ennaa).
  const [matches, setMatches] = useState<AssignmentSummary[] | null>(null);

  const changeAddress = (value: string) => {
    setAddress(value);
    // Ny adresse: forslagene og feilen gjaldt den forrige.
    setMatches(null);
    setFieldError(null);
    setErrorCode(null);
  };

  async function create(newAddress: string) {
    const order = await createAssignment(assignmentRequest(getToken), { address: newAddress, assignmentNo: null });
    router.push(listingTextHref(order.id));
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    const check = checkNewOrder(address, "");
    if (!check.ok) {
      setFieldError(check.key);
      return;
    }
    setFieldError(null);
    setErrorCode(null);
    setSubmitting(true);
    try {
      const same = sameAddressOrders(await recentOrders(request), check.address);
      if (same.length > 0) {
        setMatches(same);
        setSubmitting(false);
        return;
      }
      await create(check.address);
    } catch (err) {
      setErrorCode(assignmentErrorCode(err));
      setSubmitting(false);
    }
  }

  async function handleCreateAnyway() {
    if (submitting) return;
    const check = checkNewOrder(address, "");
    if (!check.ok) return;
    setErrorCode(null);
    setSubmitting(true);
    try {
      await create(check.address);
    } catch (err) {
      setErrorCode(assignmentErrorCode(err));
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 md:px-8 md:py-12">
      <div className="mb-8">
        <PageHeader title={t(locale, "listingText.page.title")} subtitle={t(locale, "listingText.page.subtitle")} />
      </div>

      <Card padding="md" className="mb-10">
        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-col gap-4">
          <div>
            <label htmlFor="listing-address" className="mb-2 block text-sm font-medium text-ink">
              {t(locale, "listingText.page.newAddress")}
            </label>
            <input
              id="listing-address"
              type="text"
              autoComplete="street-address"
              required
              maxLength={ADDRESS_MAX}
              value={address}
              onChange={(e) => changeAddress(e.target.value)}
              placeholder={t(locale, "orders.addressExample")}
              aria-invalid={fieldError !== null}
              aria-describedby={fieldError !== null ? "listing-address-error" : undefined}
              className={INPUT}
            />
            {fieldError !== null && (
              <p id="listing-address-error" className="mt-2 text-sm text-red-fg">
                {t(locale, fieldError)}
              </p>
            )}
          </div>

          {matches === null && (
            <div className="flex flex-wrap gap-3">
              <Button type="submit" disabled={submitting}>
                {t(locale, submitting ? "listingText.page.checking" : "listingText.page.continue")}
              </Button>
            </div>
          )}

          {matches !== null && (
            <div className="flex flex-col gap-3 rounded-button bg-amber-bg p-4" role="status">
              <p className="text-sm font-medium text-amber-fg">
                {matches.length === 1
                  ? t(locale, "listingText.page.sameAddressOne")
                  : t(locale, "listingText.page.sameAddressMany", { n: matches.length })}
              </p>
              <ul className="flex flex-col gap-2">
                {matches.map((order) => (
                  <li key={order.id}>
                    <OrderRow order={order} locale={locale} />
                  </li>
                ))}
              </ul>
              <div className="flex flex-wrap gap-3">
                <Button variant="secondary" onClick={() => void handleCreateAnyway()} disabled={submitting}>
                  {t(locale, submitting ? "orders.creating" : "listingText.page.createAnyway")}
                </Button>
              </div>
            </div>
          )}

          {errorCode !== null && (
            <p className="text-sm text-red-fg bg-red-bg rounded-button p-3 break-words" role="alert">
              {codeText(locale, "assignmentError", errorCode)}
            </p>
          )}
        </form>
      </Card>

      <section aria-labelledby="listing-orders-title" className="flex flex-col gap-4">
        <h2 id="listing-orders-title" className="text-lg font-medium text-ink">
          {t(locale, "listingText.page.ordersTitle")}
        </h2>

        {loading ? (
          <div className="flex flex-col items-center justify-center py-16 gap-4" role="status">
            <div className="w-8 h-8 border-4 border-line border-t-ink rounded-full animate-spin motion-reduce:animate-none" />
            <p className="text-ink-2 text-sm">{t(locale, waking ? "net.waking" : "orders.loading")}</p>
          </div>
        ) : listError !== null && orders.length === 0 ? (
          <Card padding="lg" className="text-center">
            <p className="text-red-fg font-medium mb-2">{t(locale, "orders.loadError")}</p>
            <p className="text-ink-2 text-sm mb-6 break-words">{codeText(locale, "assignmentError", listError)}</p>
            <Button onClick={retry}>{t(locale, "review.retry")}</Button>
          </Card>
        ) : orders.length === 0 ? (
          <p className="text-sm text-ink-2">{t(locale, "listingText.page.empty")}</p>
        ) : (
          <>
            <ul className="flex flex-col gap-3">
              {orders.map((order) => (
                <li key={order.id}>
                  <OrderRow order={order} locale={locale} />
                </li>
              ))}
            </ul>

            {listError !== null && (
              <p className="text-center text-sm text-red-fg break-words" role="alert">
                {codeText(locale, "assignmentError", listError)}
              </p>
            )}

            {cursor !== null && (
              <div className="flex justify-center pb-10">
                <Button variant="secondary" onClick={() => void loadMore()} disabled={loadingMore}>
                  {t(locale, loadingMore ? "orders.loadingMore" : "orders.loadMore")}
                </Button>
              </div>
            )}
          </>
        )}
      </section>
    </main>
  );
}

/** En ordre i lista og i forslagene: forsidebildet, adressen, oppdragsnummer og antall bilder, og datoen. */
function OrderRow({ order, locale }: { order: AssignmentSummary; locale: Locale }) {
  return (
    <Link
      href={listingTextHref(order.id)}
      className={cardClass("none", `flex min-w-0 items-center gap-4 p-3 transition-colors hover:bg-surface-2 ${FOCUS}`)}
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
        <span className="break-words font-medium text-ink">{order.address}</span>
        <span className="truncate text-sm text-ink-2">{orderMeta(locale, order)}</span>
      </span>
      <span className="shrink-0 text-sm text-ink-2">{formatDay(order.createdAt, locale)}</span>
    </Link>
  );
}
