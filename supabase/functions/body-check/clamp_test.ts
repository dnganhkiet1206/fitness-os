import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { clampBody, NOTE_MAX, num } from "./clamp.ts";

/**
 * `clampBody`: the only gate between a model's guess and a row in `body_checks`
 * (Master Audit 28/11, P2-02 — body-check had no test). The interval the app
 * shows must always contain the estimate, be at least 2 points wide (a photo
 * is not more precise than that), at most 12, and stay inside 3–60 %.
 */

const ok = (over: Record<string, unknown>) => clampBody({ is_body_photo: true, confidence: "medium", ...over });

Deno.test("not a body photo → nothing is written", () => {
  assertEquals(clampBody({ is_body_photo: false, body_fat_pct: 18 }), null);
  assertEquals(clampBody({ is_body_photo: "true", body_fat_pct: 18 }), null); // truthy is not true
  assertEquals(clampBody({ body_fat_pct: 18 }), null);
  assertEquals(clampBody(null), null);
  assertEquals(clampBody("nope"), null);
});

Deno.test("estimate outside 3–60 % or not a number → nothing is written", () => {
  for (const pct of [2.9, 60.1, -5, 0, NaN, Infinity, "abc", "", null, undefined]) {
    assertEquals(ok({ body_fat_pct: pct }), null, `pct ${String(pct)}`);
  }
});

Deno.test("edges 3 and 60 are accepted, interval stays inside the range", () => {
  assertEquals(ok({ body_fat_pct: 3 }), { body_fat_pct: 3, body_fat_low: 3, body_fat_high: 6, confidence: "medium", note: "" });
  assertEquals(ok({ body_fat_pct: 60 }), { body_fat_pct: 60, body_fat_low: 57, body_fat_high: 60, confidence: "medium", note: "" });
});

Deno.test("a numeric string is read as the number", () => {
  assertEquals(ok({ body_fat_pct: "18.5", body_fat_low: "16", body_fat_high: "21" })?.body_fat_pct, 18.5);
  assertEquals(num(" 7 "), 7);
  assertEquals(num("  "), null);
});

Deno.test("no interval from the model → estimate ± 3", () => {
  const r = ok({ body_fat_pct: 20 });
  assertEquals([r?.body_fat_low, r?.body_fat_high], [17, 23]);
});

Deno.test("the interval always contains the estimate and is at least 2 points wide", () => {
  // model's interval sits entirely above the estimate
  let r = ok({ body_fat_pct: 20, body_fat_low: 25, body_fat_high: 30 });
  assertEquals([r?.body_fat_low, r?.body_fat_high], [19, 30]);
  // entirely below
  r = ok({ body_fat_pct: 20, body_fat_low: 10, body_fat_high: 15 });
  assertEquals([r?.body_fat_low, r?.body_fat_high], [10, 21]);
  // narrower than 2 points
  r = ok({ body_fat_pct: 20, body_fat_low: 19.5, body_fat_high: 20.5 });
  assertEquals([r?.body_fat_low, r?.body_fat_high], [19, 21]);
  // inverted
  r = ok({ body_fat_pct: 20, body_fat_low: 30, body_fat_high: 10 });
  assertEquals([r?.body_fat_low, r?.body_fat_high], [19, 21]);
});

Deno.test("wider than 12 points → estimate ± 6", () => {
  const r = ok({ body_fat_pct: 20, body_fat_low: 2, body_fat_high: 40 });
  assertEquals([r?.body_fat_low, r?.body_fat_high], [14, 26]);
  const edge = ok({ body_fat_pct: 5, body_fat_low: 0, body_fat_high: 30 });
  assertEquals([edge?.body_fat_low, edge?.body_fat_high], [3, 11]);
});

Deno.test("property: for every accepted estimate the stored interval is sane", () => {
  const seeds = [-10, 0, 1, 2.5, 3, 7.77, 18, 33.3, 59.9, 60, 75];
  for (const pct of [3, 4, 10.25, 18.44, 30, 45.55, 57, 59, 60]) {
    for (const low of seeds) {
      for (const high of seeds) {
        const r = ok({ body_fat_pct: pct, body_fat_low: low, body_fat_high: high })!;
        const w = r.body_fat_high - r.body_fat_low;
        const tag = JSON.stringify({ pct, low, high, r });
        if (!(r.body_fat_low <= r.body_fat_pct && r.body_fat_pct <= r.body_fat_high)) throw new Error(`not containing: ${tag}`);
        if (!(r.body_fat_low >= 3 && r.body_fat_high <= 60)) throw new Error(`out of range: ${tag}`);
        if (!(w <= 12.0001)) throw new Error(`too wide: ${tag}`);
        if (!(w >= 2 - 0.0001 || r.body_fat_low === 3 || r.body_fat_high === 60)) throw new Error(`too narrow: ${tag}`);
      }
    }
  }
});

Deno.test("rounded to one decimal", () => {
  const r = ok({ body_fat_pct: 18.46, body_fat_low: 15.44, body_fat_high: 21.06 });
  assertEquals([r?.body_fat_pct, r?.body_fat_low, r?.body_fat_high], [18.5, 15.4, 21.1]);
});

Deno.test("confidence outside the enum → low; note trimmed and capped", () => {
  assertEquals(ok({ body_fat_pct: 20, confidence: "certain" })?.confidence, "low");
  assertEquals(ok({ body_fat_pct: 20, confidence: undefined })?.confidence, "low");
  assertEquals(ok({ body_fat_pct: 20, confidence: "high" })?.confidence, "high");
  assertEquals(ok({ body_fat_pct: 20, note: "  ánh sáng tốt  " })?.note, "ánh sáng tốt");
  assertEquals(ok({ body_fat_pct: 20, note: "x".repeat(1000) })?.note.length, NOTE_MAX);
  assertEquals(ok({ body_fat_pct: 20, note: 42 })?.note, "");
});
