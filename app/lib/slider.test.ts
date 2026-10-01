import { test } from "node:test";
import assert from "node:assert/strict";
import { clampPercent, SLIDER_START, sliderKey, valueFromPointer } from "./slider.ts";

/** Slideren mot originalen (D2a): tastatur og klikk paa sporet, alltid 0–100. */

test("piltastene flytter 2, med Shift 10", () => {
  assert.equal(sliderKey(50, "ArrowRight"), 52);
  assert.equal(sliderKey(50, "ArrowUp"), 52);
  assert.equal(sliderKey(50, "ArrowLeft"), 48);
  assert.equal(sliderKey(50, "ArrowDown"), 48);
  assert.equal(sliderKey(50, "ArrowRight", true), 60);
  assert.equal(sliderKey(50, "ArrowLeft", true), 40);
});

test("PageUp og PageDown flytter 10, Home og End gaar til kanten", () => {
  assert.equal(sliderKey(50, "PageUp"), 60);
  assert.equal(sliderKey(50, "PageDown"), 40);
  assert.equal(sliderKey(37, "Home"), 0);
  assert.equal(sliderKey(37, "End"), 100);
});

test("verdien holder seg innenfor 0–100 ved kanten", () => {
  assert.equal(sliderKey(99, "ArrowRight"), 100);
  assert.equal(sliderKey(100, "ArrowRight", true), 100);
  assert.equal(sliderKey(95, "PageUp"), 100);
  assert.equal(sliderKey(1, "ArrowLeft"), 0);
  assert.equal(sliderKey(0, "ArrowDown", true), 0);
  assert.equal(sliderKey(5, "PageDown"), 0);
});

test("andre taster styrer ikke slideren (null), saa Tab virker", () => {
  for (const key of ["Tab", "Enter", " ", "a", "Escape"]) {
    assert.equal(sliderKey(50, key), null, key);
  }
});

test("klikk eller trykk paa sporet gir verdien der, ogsaa utenfor sporet", () => {
  assert.equal(valueFromPointer(150, 100, 200), 25);
  assert.equal(valueFromPointer(100, 100, 200), 0);
  assert.equal(valueFromPointer(300, 100, 200), 100);
  assert.equal(valueFromPointer(20, 100, 200), 0);
  assert.equal(valueFromPointer(900, 100, 200), 100);
  assert.equal(valueFromPointer(133, 100, 200), 17);
  // Sporet har ingen bredde (ikke tegnet ennaa): midten.
  assert.equal(valueFromPointer(150, 100, 0), SLIDER_START);
});

test("clampPercent: NaN gir 0, uendelig gir kanten", () => {
  assert.equal(clampPercent(Number.NaN), 0);
  assert.equal(clampPercent(Infinity), 100);
  assert.equal(clampPercent(-Infinity), 0);
  assert.equal(clampPercent(42.5), 42.5);
});
