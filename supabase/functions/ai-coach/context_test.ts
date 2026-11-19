import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { allergyRule, buildProfileContext } from "./context.ts";

Deno.test("profile block carries the five safety fields (KOA-T02)", () => {
  const block = buildProfileContext({
    name: "Kiệt",
    goal: "build muscle",
    weight_kg: 70,
    units_weight: "lb",
    height_cm: 175,
    activity_level: "active",
    training_level: "intermediate",
    tdee_target_kcal: 2500,
    macro_protein_g: 150,
    macro_carbs_g: 250,
    macro_fat_g: 80,
    macro_fiber_g: 30,
    sleep_target_hours: 8,
    allergies: ["peanuts", "shrimp"],
    disliked_foods: ["cilantro"],
    dietary_preference: "halal",
    water_target_ml: 3000,
  });
  assertEquals(block?.allergies, ["peanuts", "shrimp"]);
  assertEquals(block?.disliked_foods, ["cilantro"]);
  assertEquals(block?.dietary_preference, "halal");
  assertEquals(block?.water_target_ml, 3000);
  assertEquals(block?.macro_targets.fiber, 30);
  // Existing fields unchanged by the extraction.
  assertEquals(block?.name, "Kiệt");
  assertEquals(block?.weight_unit, "lb");
  assertEquals(block?.macro_targets.protein, 150);
});

Deno.test("null profile returns null", () => {
  assertEquals(buildProfileContext(null), null);
});

Deno.test("missing safety fields become null, never invented", () => {
  const block = buildProfileContext({ name: "Kiệt" });
  assertEquals(block?.allergies, null);
  assertEquals(block?.disliked_foods, null);
  assertEquals(block?.dietary_preference, null);
  assertEquals(block?.water_target_ml, null);
  assertEquals(block?.macro_targets.fiber, undefined);
  assertEquals(block?.weight_unit, "kg");
});

Deno.test("en rule forbids allergens, disliked foods and diet violations", () => {
  const rule = allergyRule("en");
  assertStringIncludes(rule, "NEVER recommend");
  assertStringIncludes(rule, "allergic");
  assertStringIncludes(rule, "disliked list");
  assertStringIncludes(rule, "diet");
  assertStringIncludes(rule, "An empty list means no restriction");
});

Deno.test("vi rule forbids allergens, disliked foods and diet violations", () => {
  const rule = allergyRule("vi");
  assertStringIncludes(rule, "KHÔNG BAO GIỜ");
  assertStringIncludes(rule, "dị ứng");
  assertStringIncludes(rule, "không thích");
  assertStringIncludes(rule, "chế độ ăn");
  assertStringIncludes(rule, "Danh sách rỗng nghĩa là không có hạn chế");
});
