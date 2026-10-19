import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { cleanParse, readContext } from "./parse.ts";

Deno.test("keeps valid items, drops bad numbers and kinds", () => {
  const r = cleanParse("```json\n" + JSON.stringify({
    items: [
      { type: "sleep", bed: "02:00", wake: "08:00", minutes: 360 },
      { type: "weight", kg: 1000 },
      { type: "workout", kind: "dance", minutes: 30 },
      { type: "water", ml: null },
      { type: "meal", slot: "dinner", foods: [{ name: "Lẩu", servings: 1 }, { name: "" }] },
    ],
    otherDay: ["hôm qua ngủ muộn"],
  }) + "\n```");
  assertEquals(r.items, [
    { type: "sleep", bed: "02:00", wake: "08:00", minutes: 360 },
    { type: "water", ml: null },
    { type: "meal", slot: "dinner", foods: [{ name: "lẩu", servings: 1, unit: null, grams: null }] },
  ]);
  assertEquals(r.otherDay, ["hôm qua ngủ muộn"]);
});

Deno.test("garbage → empty", () => {
  assertEquals(cleanParse("sorry I can't").items, []);
});

Deno.test("shortcuts pass once; context is trimmed to shape", () => {
  const r = cleanParse(JSON.stringify({ items: [{ type: "meals_like_yesterday" }, { type: "meals_like_yesterday" }, { type: "workout_as_planned" }] }));
  assertEquals(r.items, [{ type: "meals_like_yesterday" }, { type: "workout_as_planned" }]);
  assertEquals(readContext({ recentFoods: ["Phở bò", 3, ""], usualSleep: { bed: "23:00", wake: "7:00" }, weightUnit: "st", evil: "x" }),
    { recentFoods: ["Phở bò"], usualSleep: { bed: "23:00", wake: "7:00" } });
  assertEquals(readContext("nope"), null);
});
