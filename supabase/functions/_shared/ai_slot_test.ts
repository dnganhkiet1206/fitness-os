import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { DATA_SLOT, fillData, forSpanish, slot } from "./prompt-slots.ts";

// KOA-T37: đổi chữ sang tiếng Tây Ban Nha chỉ chạm khuôn, không chạm dữ liệu người dùng.
Deno.test("forSpanish không đổi chữ trong dữ liệu người dùng", () => {
  const tpl = `Reply in English.\nDATA: ${DATA_SLOT}\nMEMORY: ${slot("MEMORY")}`;
  const ctx = JSON.stringify({ note: "English breakfast", food: "English muffin" });
  const out = fillData(forSpanish(tpl, "es"), { DATA: ctx, MEMORY: "I teach English" });
  assertEquals(out, `Reply in Spanish (español).\nDATA: ${ctx}\nMEMORY: I teach English`);
});

Deno.test("fillData không hiểu $ trong dữ liệu là mẫu thay thế", () => {
  assertEquals(fillData(`a ${DATA_SLOT} b`, "$& $1 $$"), "a $& $1 $$ b");
});

Deno.test("không phải es: khuôn giữ nguyên", () => {
  assertEquals(fillData(forSpanish(`in English ${DATA_SLOT}`, "en"), "x"), "in English x");
});
