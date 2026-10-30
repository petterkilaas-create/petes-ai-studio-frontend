"use client";

import { useState } from "react";
import { createListingTextMock, MOCK_MARKER } from "../../lib/listingTextMock";
import { ListingTextOrder } from "./ListingTextOrder";
import { t } from "../../lib/i18n";
import { useLocale } from "../../lib/i18n/useLocale";

/**
 * Tekstsiden i mock-modus (TG-NEW-281, T2; K §9.3 punkt 10): falsk backend og
 * falsk XHR, uten vakten. Lastes bare med `import()` fra siden naar
 * NODE_ENV er development og `?mock=1` er satt, saa prod-bygget ikke tar den
 * med (testen i listingTextBestilling.test.ts).
 */
export function ListingTextMock({ assignmentId }: { assignmentId: string }) {
  const locale = useLocale();
  const [deps] = useState(() => createListingTextMock(assignmentId));
  return (
    <>
      <p role="note" data-mock={MOCK_MARKER} className="bg-amber-bg px-4 py-2 text-center text-sm text-amber-fg">
        {t(locale, "listingText.mock.banner")}
      </p>
      <ListingTextOrder assignmentId={assignmentId} deps={deps} />
    </>
  );
}
