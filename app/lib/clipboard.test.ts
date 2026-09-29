import { test } from "node:test";
import assert from "node:assert/strict";
import { copyText } from "./clipboard.ts";

test("copyText: lykkes gir copied, med riktig tekst", async () => {
  const written: string[] = [];
  const clipboard = { writeText: async (text: string) => void written.push(text) };
  assert.equal(await copyText("hei", clipboard), "copied");
  assert.deepEqual(written, ["hei"]);
});

test("copyText: avvist eller kastet feil gir failed, aldri krasj", async () => {
  assert.equal(await copyText("x", { writeText: () => Promise.reject(new Error("NotAllowedError")) }), "failed");
  assert.equal(
    await copyText("x", {
      writeText: () => {
        throw new Error("sync");
      },
    }),
    "failed"
  );
});

test("copyText: nettleseren mangler clipboard gir failed", async () => {
  assert.equal(await copyText("x", undefined), "failed");
  // Node har ingen navigator.clipboard, saa standardverdien gir ogsaa failed.
  assert.equal(await copyText("x"), "failed");
});
