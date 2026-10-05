/**
 * Clerks egne tekster (brukermenyen, «Administrer konto») etter spraaket
 * (TG-NEW-129 K1). Brukes bare av rot-layouten for (app); markedssiden har
 * ingen Clerk.
 *
 * nbNO fra @clerk/localizations mangler noen tekster som vises hos oss, og
 * der faller Clerk tilbake til engelsk. De legges paa her. enUS sendes
 * eksplisitt (ikke undefined), saa et bytte fra norsk tilbake til engelsk
 * ogsaa overskriver tekstene.
 */

import { enUS, nbNO } from "@clerk/localizations";
import type { Locale } from "./index.ts";

type ClerkLocalization = typeof nbNO;

export const CLERK_NB: ClerkLocalization = {
  ...nbNO,
  userButton: {
    ...nbNO.userButton,
    // Skjermleser-tekstene paa menyknappen.
    action__openUserMenu: "Åpne brukermenyen",
    action__closeUserMenu: "Lukk brukermenyen",
  },
  userProfile: {
    ...nbNO.userProfile,
    start: {
      ...nbNO.userProfile?.start,
      profileSection: {
        ...nbNO.userProfile?.start?.profileSection,
        primaryButton: "Oppdater profil",
      },
    },
  },
};

export function clerkLocalization(locale: Locale): ClerkLocalization {
  return locale === "nb" ? CLERK_NB : enUS;
}
