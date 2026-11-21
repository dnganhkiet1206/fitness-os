import { assertEquals, assertStringIncludes } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { allergyRule, buildProfileContext, mondayIndex, readinessComponents, streakDays, todayPlan, waterByDay } from "./context.ts";

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


// KOA-T33: chuỗi ngày không còn trần 7 (trước chỉ đọc 7 hàng).
Deno.test("streakDays đếm quá 7 ngày, bắt đầu từ hôm qua nếu hôm nay chưa ghi", () => {
  const today = "2026-11-20";
  const rows = Array.from({ length: 20 }, (_, i) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1 - i);
    return { date: d.toISOString().split("T")[0], kcal: 1800 };
  });
  assertEquals(streakDays(rows, today), 20);
  assertEquals(streakDays([...rows, { date: today, workout_count: 1 }], today), 21);
  assertEquals(streakDays([{ date: "2026-11-17", kcal: 1 }], today), 0, "đứt quãng thì 0");
  assertEquals(streakDays([{ date: "2026-11-19", kcal: 0 }], today), 0, "hàng không ghi gì không tính");
});

Deno.test("waterByDay cộng theo ngày, chỉ 7 ngày, hôm nay riêng", () => {
  const w = waterByDay([
    { date: "2026-11-20", amount_ml: 250 }, { date: "2026-11-20", amount_ml: 500 },
    { date: "2026-11-18", amount_ml: 1000 }, { date: "2026-11-10", amount_ml: 900 },
    { date: "2026-11-19", amount_ml: null },
  ], "2026-11-20");
  assertEquals(w.today_ml, 750);
  assertEquals(w.last_7_days, [{ date: "2026-11-18", ml: 1000 }, { date: "2026-11-20", ml: 750 }]);
  assertEquals(waterByDay([], "2026-11-20").today_ml, null, "chưa ghi là null, không phải 0");
});

const ROUTINE = [
  { day_of_week: 0, template_id: "t-push", is_rest: false },
  { day_of_week: 2, template_id: "t-pull", is_rest: false, is_deload: true },
  { day_of_week: 5, template_id: null, is_rest: true },
];
const TEMPLATES = [
  { id: "t-push", name: "Push", exercises: [{ exerciseName: "Bench Press", sets: 3, reps: 8, weightKg: 60 }] },
  { id: "t-pull", name: "Pull", exercises: [{ exerciseName: "Row", sets: 3, reps: 10, weightKg: 40 }, { bogus: 1 }] },
];

Deno.test("monday index matches the app (Monday = 0)", () => {
  assertEquals(mondayIndex("2026-11-16"), 0); // thứ Hai
  assertEquals(mondayIndex("2026-11-22"), 6); // Chủ nhật
});

Deno.test("today plan follows the weekly routine (KOA-T33)", () => {
  const p = todayPlan("2026-11-16", ROUTINE, null, TEMPLATES, false);
  assertEquals(p, { status: "todo", name: "Push", is_deload: false, exercises: [{ name: "Bench Press", sets: 3, reps: 8, weight_kg: 60 }] });
  assertEquals(todayPlan("2026-11-16", ROUTINE, null, TEMPLATES, true).status, "done");
  const wed = todayPlan("2026-11-18", ROUTINE, null, TEMPLATES, false);
  assertEquals(wed.is_deload, true);
  assertEquals(wed.exercises.length, 1, "bài hỏng trong JSON bị bỏ, không làm hỏng cả buổi");
  assertEquals(todayPlan("2026-11-21", ROUTINE, null, TEMPLATES, false).status, "rest");
  assertEquals(todayPlan("2026-11-17", ROUTINE, null, TEMPLATES, false).status, "unplanned");
});

Deno.test("a day override wins over the routine; rest wins over a template", () => {
  const moved = todayPlan("2026-11-17", ROUTINE, { date: "2026-11-17", template_id: "t-pull", is_rest: false }, TEMPLATES, false);
  assertEquals([moved.status, moved.name], ["todo", "Pull"]);
  const off = todayPlan("2026-11-16", ROUTINE, { date: "2026-11-16", template_id: null, is_rest: true }, TEMPLATES, false);
  assertEquals([off.status, off.name], ["rest", null]);
  const cleared = todayPlan("2026-11-16", ROUTINE, { date: "2026-11-16", template_id: null, is_rest: false }, TEMPLATES, false);
  assertEquals(cleared.status, "unplanned", "đổi lịch xoá buổi của ngày: chưa lên lịch");
  const deleted = todayPlan("2026-11-16", [{ day_of_week: 0, template_id: "gone", is_rest: false }], null, TEMPLATES, false);
  assertEquals(deleted.status, "unplanned", "template đã xoá");
});

Deno.test("readiness components parse the stored explain (KOA-T33)", () => {
  assertEquals(readinessComponents("hrv:62|rhr:70.4|sleep:80|load:45"), { hrv: 62, rhr: 70, sleep: 80, load: 45 });
  assertEquals(readinessComponents("load:45"), { load: 45 });
  assertEquals(readinessComponents("legacy prose text"), null);
  assertEquals(readinessComponents("hrv:|sleep:x"), null);
  assertEquals(readinessComponents(null), null);
});
