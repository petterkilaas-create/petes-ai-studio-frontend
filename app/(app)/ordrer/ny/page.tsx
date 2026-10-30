"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { assignmentRequest } from "@/app/lib/api";
import { assignmentErrorCode, createAssignment } from "@/app/lib/assignments";
import { ADDRESS_MAX, ASSIGNMENT_NO_MAX, checkNewOrder, orderImagesHref } from "@/app/lib/ordrer";
import { ORDERS_PATH, isPageEnabled } from "@/app/lib/services";
import { ServiceUnavailable } from "@/app/components/ServiceUnavailable";
import { Button, ButtonLink } from "@/app/components/ui/Button";
import { Card } from "@/app/components/ui/Card";
import { PageHeader } from "@/app/components/ui/PageHeader";
import { FOCUS } from "@/app/components/godkjenning/classes";
import { codeText, t, type UiKey } from "@/app/lib/i18n";
import { useLocale } from "@/app/lib/i18n/useLocale";

/**
 * Ny ordre (TG-NEW-277, FE-2; skissen «Bolig», foerste del): adresse
 * (paakrevd) og oppdragsnummer (valgfritt) → POST /v1/assignments (K 2.1) →
 * bildene. `replace`, saa tilbakeknappen ikke gir et nytt skjema for samme ordre.
 */
export default function NewOrderPage() {
  if (!isPageEnabled(ORDERS_PATH)) return <ServiceUnavailable />;
  return <NewOrderForm />;
}

const INPUT = `block w-full min-h-11 rounded-button border border-line-strong bg-surface px-3 py-2 text-ink ${FOCUS}`;

function NewOrderForm() {
  const { getToken } = useAuth();
  const locale = useLocale();
  const router = useRouter();

  const [address, setAddress] = useState("");
  const [assignmentNo, setAssignmentNo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [fieldError, setFieldError] = useState<UiKey | null>(null);
  const [errorCode, setErrorCode] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (submitting) return;
    const check = checkNewOrder(address, assignmentNo);
    if (!check.ok) {
      setFieldError(check.key);
      return;
    }
    setFieldError(null);
    setErrorCode(null);
    setSubmitting(true);
    try {
      const order = await createAssignment(assignmentRequest(getToken), {
        address: check.address,
        assignmentNo: check.assignmentNo,
      });
      router.replace(orderImagesHref(order.id));
    } catch (err) {
      setErrorCode(assignmentErrorCode(err));
      setSubmitting(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-8 md:px-8 md:py-12">
      <div className="mb-8">
        <PageHeader title={t(locale, "orders.newTitle")} subtitle={t(locale, "orders.newSubtitle")} />
      </div>

      <Card padding="md">
        <form onSubmit={(e) => void handleSubmit(e)} noValidate className="flex flex-col gap-6">
          <div>
            <label htmlFor="order-address" className="mb-2 block text-sm font-medium text-ink">
              {t(locale, "orders.address")}
            </label>
            <input
              id="order-address"
              type="text"
              autoComplete="street-address"
              required
              maxLength={ADDRESS_MAX}
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder={t(locale, "orders.addressExample")}
              aria-invalid={fieldError !== null}
              aria-describedby={fieldError !== null ? "order-address-error" : undefined}
              className={INPUT}
            />
            {fieldError !== null && (
              <p id="order-address-error" className="mt-2 text-sm text-red-fg">
                {t(locale, fieldError)}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="order-no" className="mb-2 block text-sm font-medium text-ink">
              {t(locale, "orders.assignmentNoLabel")}
            </label>
            <input
              id="order-no"
              type="text"
              autoComplete="off"
              maxLength={ASSIGNMENT_NO_MAX}
              value={assignmentNo}
              onChange={(e) => setAssignmentNo(e.target.value)}
              className={INPUT}
            />
          </div>

          {errorCode !== null && (
            <p className="text-sm text-red-fg bg-red-bg rounded-button p-3" role="alert">
              {codeText(locale, "assignmentError", errorCode)}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Button type="submit" disabled={submitting}>
              {t(locale, submitting ? "orders.creating" : "orders.create")}
            </Button>
            <ButtonLink href={ORDERS_PATH} variant="secondary">
              {t(locale, "orders.cancel")}
            </ButtonLink>
          </div>
        </form>
      </Card>
    </main>
  );
}
