import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// FE-1 (Dag 59): kroppen i godkjenningssiden er flyttet til ResultReview uten
// ny oppførsel. Siden er et tynt skall; ordresiden kan bruke komponenten.

const APP = join(dirname(fileURLToPath(import.meta.url)), "..");
/** Uten kommentarer, saa en kommentar ikke kan oppfylle eller bryte en sjekk. */
const code = (rel: string) =>
  readFileSync(join(APP, rel), "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const shell = code("(app)/godkjenning/[jobId]/page.tsx");
const review = code("components/godkjenning/ResultReview.tsx");

test("FE-1: siden er et skall som leser jobId og rendrer ResultReview med key", () => {
  assert.match(shell, /^"use client";/);
  assert.match(shell, /const \{ jobId \} = use\(params\);/);
  // FE-3c: `?fra=` leses med parseFrom og sendes videre som from.
  assert.match(shell, /return <ResultReview key=\{jobId\} jobId=\{jobId\} from=\{from\} \/>;/);
  assert.match(shell, /import \{ ResultReview \} from "@\/app\/components\/godkjenning\/ResultReview";/);
  // Ingen tilstand, kall eller tekst i skallet.
  assert.doesNotMatch(shell, /useState|useEffect|useAuth|getReview|postDecision|\bt\(locale/);
});

test("FE-1: ResultReview tar jobId, valgfri from (FE-3c) og valgfri onChanged, og leser ikke params", () => {
  assert.match(review, /^"use client";/);
  assert.match(
    review,
    /export function ResultReview\(\{\s*jobId,\s*from = null,\s*onChanged,\s*\}: \{\s*jobId: string;\s*from\?: string \| null;\s*onChanged\?: \(\) => void;\s*\}\)/
  );
  assert.doesNotMatch(review, /export default/);
  assert.doesNotMatch(review, /\bparams\b|\buse\(/);
});

test("FE-1: onChanged kalles via ref etter avgjoerelse, retting og ferdig runde", () => {
  assert.match(review, /const onChangedRef = useRef\(onChanged\);/);
  assert.match(review, /const changed = useCallback\(\(\) => onChangedRef\.current\?\.\(\), \[\]\);/);
  assert.match(review, /if \(pollDone\) void fetchReview\(\)\.then\(changed\);/);
  // decide: updated, poll, status_changed. handleCorrection: poll, reload, limit.
  assert.equal(review.match(/changed\(\);/g)?.length, 6);
  const decide = review.slice(review.indexOf("const decide"), review.indexOf("const startCorrection"));
  assert.equal(decide.match(/changed\(\);/g)?.length, 3);
  const handle = review.slice(review.indexOf("const handleCorrection"), review.indexOf("const submitCorrection"));
  assert.equal(handle.match(/changed\(\);/g)?.length, 3);
  // Feil, blokkert og 404 gir ingen beskjed (ingenting er endret).
  assert.doesNotMatch(handle.slice(handle.indexOf('case "blocked"')), /changed\(\);/);
});
