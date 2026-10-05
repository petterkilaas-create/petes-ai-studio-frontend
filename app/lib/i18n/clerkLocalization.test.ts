import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { enUS, nbNO } from "@clerk/localizations";
import { CLERK_NB, clerkLocalization } from "./clerkLocalization.ts";
import { withoutComments } from "../testing/jsxText.ts";

// TG-NEW-129 K1: Clerks egne tekster foelger spraaket via @clerk/localizations.
// Layouten og pakkefilene sjekkes som tekst (som i design.test.ts).

const REPO_DIR = fileURLToPath(new URL("../../..", import.meta.url));
const read = (rel: string) => readFileSync(join(REPO_DIR, rel), "utf8");

function sourceFiles(rel: string): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(relative(REPO_DIR, p));
    }
  };
  walk(join(REPO_DIR, rel));
  return out;
}

const SOURCES = [...sourceFiles("app"), ...sourceFiles("content"), "proxy.ts"];
const importers = (pattern: RegExp) => SOURCES.filter((f) => pattern.test(withoutComments(read(f))));
const IMPORTS_PACKAGE = /from ["']@clerk\/localizations["']/;
const IMPORTS_MODULE = /from ["'][^"']*\/i18n\/clerkLocalization(\.ts)?["']/;

test("K1: app-layouten sender localization etter spraaket", () => {
  const layout = withoutComments(read("app/(app)/layout.tsx"));
  assert.match(layout, /import \{ clerkLocalization \} from "@\/app\/lib\/i18n\/clerkLocalization";/);
  assert.match(layout, /<ClerkProvider localization=\{clerkLocalization\(locale\)\}>/);
});

test("K1: norsk gir nbNO med vaare tekster, engelsk gir enUS eksplisitt", () => {
  assert.equal(clerkLocalization("nb"), CLERK_NB);
  assert.equal(clerkLocalization("en"), enUS);
});

test("K1: tekstene nbNO mangler, er lagt paa, og resten av nbNO er beholdt", () => {
  assert.equal(CLERK_NB.userButton?.action__openUserMenu, "Åpne brukermenyen");
  assert.equal(CLERK_NB.userButton?.action__closeUserMenu, "Lukk brukermenyen");
  assert.equal(CLERK_NB.userProfile?.start?.profileSection?.primaryButton, "Oppdater profil");
  // Overstyringen erstatter ikke naboene i de samme objektene.
  assert.equal(CLERK_NB.locale, "nb-NO");
  assert.equal(CLERK_NB.signIn, nbNO.signIn);
  assert.equal(CLERK_NB.userButton?.action__manageAccount, "Administrer konto");
  assert.equal(CLERK_NB.userButton?.action__signOut, "Logg ut");
  assert.equal(CLERK_NB.userProfile?.navbar, nbNO.userProfile?.navbar);
  assert.equal(CLERK_NB.userProfile?.start?.headerTitle__account, nbNO.userProfile?.start?.headerTitle__account);
  assert.equal(CLERK_NB.userProfile?.start?.profileSection?.title, "Profil");
  assert.equal(CLERK_NB.userProfile?.start?.passwordSection, nbNO.userProfile?.start?.passwordSection);
});

test("K1: bare clerkLocalization.ts importerer pakken, og bare app-layouten importerer modulen", () => {
  assert.deepEqual(importers(IMPORTS_PACKAGE), ["app/lib/i18n/clerkLocalization.ts"]);
  assert.deepEqual(importers(IMPORTS_MODULE), ["app/(app)/layout.tsx"]);
  for (const f of sourceFiles("app/(marketing)")) {
    const src = withoutComments(read(f));
    assert.doesNotMatch(src, IMPORTS_PACKAGE, f);
    assert.doesNotMatch(src, IMPORTS_MODULE, f);
  }
});

test("K1: @clerk/localizations staar med eksakt versjon i package.json og lockfila", () => {
  const pkg = JSON.parse(read("package.json"));
  const version = pkg.dependencies["@clerk/localizations"];
  assert.match(version, /^\d+\.\d+\.\d+$/, `ikke eksakt: ${version}`);
  const lock = JSON.parse(read("package-lock.json"));
  assert.equal(lock.packages[""].dependencies["@clerk/localizations"], version);
  assert.equal(lock.packages["node_modules/@clerk/localizations"].version, version);
});

test("K1: nbNO dekker brukermenyen og profilvinduet", () => {
  assert.equal(nbNO.locale, "nb-NO");
  assert.equal(nbNO.userButton?.action__manageAccount, "Administrer konto");
  assert.equal(nbNO.userButton?.action__signOut, "Logg ut");
  assert.equal(nbNO.userProfile?.navbar?.account, "Profil");
  assert.equal(nbNO.userProfile?.navbar?.security, "Sikkerhet");
});
