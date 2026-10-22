import { mock, test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  canDownload,
  canDownloadPrivacy,
  downloadErrorKey,
  downloadFileName,
  downloadMarkedImage,
  downloadPrivacyImage,
  privacyDownload,
  privacyFileName,
  privacyHistoryFileName,
  saveBlob,
} from "./download.ts";

const JOB = "250dccaf-1234-4abc-9def-000000000000";

function jpeg(): Response {
  return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), {
    status: 200,
    headers: { "Content-Type": "image/jpeg" },
  });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

test("filnavnet: de 8 foerste tegnene i jobId og .jpg", () => {
  assert.equal(downloadFileName(JOB), "kveldsbilde-ai_250dccaf.jpg");
  assert.equal(downloadFileName("ABC/../def-12345"), "kveldsbilde-ai_abcdef12.jpg");
  assert.equal(downloadFileName(""), "kveldsbilde-ai.jpg");
});

test("knappen vises bare for succeeded og is_owner true", () => {
  assert.equal(canDownload({ status: "succeeded", isOwner: true }), true);
  assert.equal(canDownload({ status: "succeeded", isOwner: false }), false);
  for (const status of ["awaiting_approval", "needs_review", "failed", "running", "unknown"]) {
    assert.equal(canDownload({ status, isOwner: true }), false, status);
  }
});

test("200 gir fila med riktig filnavn", async () => {
  const saved: { size: number; type: string; name: string }[] = [];
  const result = await downloadMarkedImage({
    jobId: JOB,
    fetchFile: async () => jpeg(),
    save: (blob, name) => saved.push({ size: blob.size, type: blob.type, name }),
  });
  assert.deepEqual(result, { kind: "ok", fileName: "kveldsbilde-ai_250dccaf.jpg" });
  assert.deepEqual(saved, [{ size: 4, type: "image/jpeg", name: "kveldsbilde-ai_250dccaf.jpg" }]);
});

test("feilkodene gir riktig melding, aldri raa tekst, og ingen fil", async () => {
  const cases: [number, unknown, string][] = [
    [409, { detail: { code: "action_not_allowed", status: "succeeded" } }, "review.downloadNotAllowed"],
    [409, { detail: { code: "not_approved", status: "awaiting_approval" } }, "review.downloadFailed"],
    [409, { detail: { code: "result_missing" } }, "review.downloadBroken"],
    [409, { detail: { code: "result_mismatch" } }, "review.downloadBroken"],
    [500, { detail: { code: "render_failed" } }, "review.downloadBroken"],
    [404, { detail: "job not found" }, "review.downloadFailed"],
    [401, { detail: "Missing bearer token" }, "review.downloadFailed"],
    [503, { detail: "decisions not available" }, "review.downloadFailed"],
    [502, "<html>Bad gateway</html>", "review.downloadFailed"],
  ];
  for (const [status, body, key] of cases) {
    let saved = false;
    const result = await downloadMarkedImage({
      jobId: JOB,
      fetchFile: async () => json(status, body),
      save: () => {
        saved = true;
      },
    });
    assert.deepEqual(result, { kind: "error", key }, `${status} ${JSON.stringify(body)}`);
    assert.equal(saved, false);
  }
  // Svar som ikke er JSON.
  assert.equal(downloadErrorKey(500, null), "review.downloadFailed");
});

test("nettverksfeil og manglende token gir downloadFailed", async () => {
  for (const err of [new TypeError("Failed to fetch"), new Error("Not authenticated: Clerk token unavailable")]) {
    const result = await downloadMarkedImage({
      jobId: JOB,
      fetchFile: async () => {
        throw err;
      },
      save: () => assert.fail("skal ikke lagre"),
    });
    assert.deepEqual(result, { kind: "error", key: "review.downloadFailed" });
  }
});

// --- Personvern: «Last ned» paa Tjenester (dag 51) ---

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const png = () => new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: "image/png" });

test("personvern: knappen finnes med resultat og mangler uten", () => {
  const blob = png();
  assert.deepEqual(privacyDownload("privacy_blur", blob, "stue.jpg"), {
    blob,
    fileName: "stue-personvern.png",
  });
  assert.equal(privacyDownload("privacy_blur", null, "stue.jpg"), null);
  // Andre tjenester og ingen valgt tjeneste: ingen knapp.
  assert.equal(privacyDownload("scene_transform", blob, "stue.jpg"), null);
  assert.equal(privacyDownload(undefined, blob, "stue.jpg"), null);
});

test("personvern: siden viser knappen bare via privacyDownload, og «Start på nytt» fjerner resultatet", () => {
  const page = readFileSync(join(APP_DIR, "(app)/tjenester/page.tsx"), "utf8");
  assert.match(page, /privacyDownload\(selectedTool\?\.service, job\.resultBlob, preview\.file\?\.name\)/);
  assert.match(page, /\{download && \(/);
  assert.match(page, /saveBlob\(download\.blob, download\.fileName\)/);
  assert.match(page, /handleReset = \(\) => \{[^}]*job\.reset\(\)/);
  const hook = readFileSync(join(APP_DIR, "hooks/useProcessJob.ts"), "utf8");
  const reset = hook.slice(hook.indexOf("const reset = useCallback"));
  assert.match(reset.slice(0, reset.indexOf("}, [")), /setSyncResultBlob\(null\)/);
  assert.match(hook, /setSyncResultBlob\(result\.imageBlob\)/);
  assert.match(hook, /resultBlob: syncResultBlob/);
});

test("personvern: filnavnet er originalnavnet uten endelse, -personvern og endelsen fra formatet", () => {
  assert.equal(privacyFileName("stue.jpg", "image/png"), "stue-personvern.png");
  assert.equal(privacyFileName("Bad 2. etg.HEIC", "image/png"), "Bad 2. etg-personvern.png");
  assert.equal(privacyFileName("kjøkken.jpeg", "image/jpeg"), "kjøkken-personvern.jpg");
  assert.equal(privacyFileName("fasade.png", "image/webp"), "fasade-personvern.webp");
  assert.equal(privacyFileName("uten-endelse", "image/png"), "uten-endelse-personvern.png");
  // Ukjent eller tomt format: PNG, som backend svarer med i dag.
  assert.equal(privacyFileName("stue.jpg", ""), "stue-personvern.png");
  // Uten navn, bare endelse, sti og ulovlige tegn.
  assert.equal(privacyFileName(null, "image/png"), "bilde-personvern.png");
  assert.equal(privacyFileName(".jpg", "image/png"), ".jpg-personvern.png");
  assert.equal(privacyFileName("C:\\bilder\\a/stue.jpg", "image/png"), "stue-personvern.png");
  assert.equal(privacyFileName('st<u>e?.jpg', "image/png"), "stue-personvern.png");
  assert.equal(privacyFileName("???.jpg", "image/png"), "bilde-personvern.png");
});

test("personvern: objekt-URL-en frigjoeres etter nedlastingen", (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const create = t.mock.method(URL, "createObjectURL", () => "blob:test-1");
  const revoke = t.mock.method(URL, "revokeObjectURL", () => {});
  const clicked: { href: string; download: string }[] = [];
  const anchor = {
    href: "",
    download: "",
    rel: "",
    click() {
      clicked.push({ href: this.href, download: this.download });
    },
    remove: mock.fn(),
  };
  const g = globalThis as { document?: unknown };
  const before = g.document;
  g.document = {
    createElement: () => anchor,
    body: { appendChild: () => {} },
  };
  try {
    const blob = png();
    saveBlob(blob, "stue-personvern.png");
    assert.equal(create.mock.calls[0].arguments[0], blob);
    assert.deepEqual(clicked, [{ href: "blob:test-1", download: "stue-personvern.png" }]);
    assert.equal(anchor.remove.mock.callCount(), 1);
    assert.equal(revoke.mock.callCount(), 0, "ikke foer nedlastingen har startet");
    t.mock.timers.tick(10_000);
    assert.equal(revoke.mock.callCount(), 1);
    assert.equal(revoke.mock.calls[0].arguments[0], "blob:test-1");
  } finally {
    g.document = before;
  }
});

// --- Personvern i Historikk og paa /start: «Last ned» paa kortet (dag 51) ---

const PRIVACY = { service: "privacy_blur", status: "succeeded", isOwner: true, mediaDeletedAt: null } as const;

test("personvern-kortet: knappen bare for egen privacy_blur som er ferdig", () => {
  assert.equal(canDownloadPrivacy(PRIVACY), true);
  assert.equal(canDownloadPrivacy({ ...PRIVACY, mediaDeletedAt: undefined }), true);
  // Kveldsbilde og andre tjenester, ogsaa ferdige: ingen knapp.
  for (const service of ["scene_transform", "magic_cleanup", "virtual_staging", ""]) {
    assert.equal(canDownloadPrivacy({ ...PRIVACY, service }), false, service);
  }
  for (const status of ["queued", "running", "awaiting_approval", "needs_review", "failed", "rejected", "unknown"] as const) {
    assert.equal(canDownloadPrivacy({ ...PRIVACY, status }), false, status);
  }
  // Admin med «Alle brukere» ser andres jobb: ingen knapp (valg B1 A).
  assert.equal(canDownloadPrivacy({ ...PRIVACY, isOwner: false }), false);
  // TG-NEW-117: bildene er slettet.
  assert.equal(canDownloadPrivacy({ ...PRIVACY, mediaDeletedAt: "2026-10-01T00:00:00Z" }), false);
});

test("personvern-kortet: filnavnet er bilde-<8 tegn>-personvern.png, ogsaa uten blob-type", () => {
  assert.equal(privacyHistoryFileName(JOB, "image/png"), "bilde-250dccaf-personvern.png");
  assert.equal(privacyHistoryFileName(JOB, ""), "bilde-250dccaf-personvern.png");
  assert.equal(privacyHistoryFileName("ABC/../def-12345", "image/png"), "bilde-abcdef12-personvern.png");
  assert.equal(privacyHistoryFileName("", "image/png"), "bilde-personvern.png");
});

test("personvern-kortet: 200 lagrer bloben uendret med PNG-navnet", async () => {
  const saved: { blob: Blob; name: string }[] = [];
  const body = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const result = await downloadPrivacyImage({
    jobId: JOB,
    fetchFile: async () => new Response(body, { status: 200, headers: { "Content-Type": "image/png" } }),
    save: (blob, name) => saved.push({ blob, name }),
  });
  assert.deepEqual(result, { kind: "ok", fileName: "bilde-250dccaf-personvern.png" });
  assert.equal(saved.length, 1);
  assert.equal(saved[0].name, "bilde-250dccaf-personvern.png");
  assert.deepEqual(new Uint8Array(await saved[0].blob.arrayBuffer()), body);
});

test("personvern-kortet: 200 uten Content-Type gir fortsatt .png", async () => {
  const names: string[] = [];
  const result = await downloadPrivacyImage({
    jobId: JOB,
    fetchFile: async () => new Response(new Blob([new Uint8Array([1, 2, 3])]), { status: 200 }),
    save: (_blob, name) => names.push(name),
  });
  assert.deepEqual(result, { kind: "ok", fileName: "bilde-250dccaf-personvern.png" });
  assert.deepEqual(names, ["bilde-250dccaf-personvern.png"]);
});

test("personvern-kortet: feilkodene gir riktig melding og ingen fil", async () => {
  const cases: [number, unknown, string][] = [
    [410, { detail: { code: "media_deleted" } }, "review.downloadDeleted"],
    [409, { detail: { code: "action_not_allowed" } }, "review.downloadNotAllowed"],
    [409, { detail: { code: "result_missing" } }, "review.downloadBroken"],
    [409, { detail: { code: "result_mismatch" } }, "review.downloadBroken"],
    [409, { detail: { code: "not_succeeded" } }, "review.downloadFailed"],
    [404, { detail: "job not found" }, "review.downloadFailed"],
    [503, { detail: "storage not available" }, "review.downloadFailed"],
    [502, "<html>Bad gateway</html>", "review.downloadFailed"],
  ];
  for (const [status, body, key] of cases) {
    const result = await downloadPrivacyImage({
      jobId: JOB,
      fetchFile: async () => json(status, body),
      save: () => assert.fail("skal ikke lagre"),
    });
    assert.deepEqual(result, { kind: "error", key }, `${status} ${JSON.stringify(body)}`);
  }
});

test("personvern-kortet: nettverksfeil gir downloadFailed", async () => {
  const result = await downloadPrivacyImage({
    jobId: JOB,
    fetchFile: async () => {
      throw new TypeError("Failed to fetch");
    },
    save: () => assert.fail("skal ikke lagre"),
  });
  assert.deepEqual(result, { kind: "error", key: "review.downloadFailed" });
});
