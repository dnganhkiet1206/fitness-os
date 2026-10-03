-- Carry fibre through the meal plan into the diary (P1-6).
--
-- The plan stored kcal/protein/carbs/fat per item but not fibre, so logging a
-- planned meal wrote `fiber_g: 0` — and the Nutrition tab has a fibre target.
-- The data exists at the source (`food_items.fiber_g`); only the pipe was
-- missing.

ALTER TABLE public.meal_plan_items
  ADD COLUMN fiber_g NUMERIC DEFAULT 0;
