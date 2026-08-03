-- Deleting a food that sits in a meal plan is refused by the database.
--
-- `meal_plan_items.food_item_id` was declared as a bare
-- `REFERENCES public.food_items(id)` (20260212044110_…sql:44), with no
-- ON DELETE action, so it takes the default: NO ACTION. Its sibling
-- `meal_entry_items.food_item_id` was declared `ON DELETE SET NULL` in the very
-- first migration (20260212040248_…sql:95). The two describe the same
-- relationship and only one of them was given an action.
--
-- ── it is not theoretical ──
--
-- `meal-plans.tsx:95` sets `food_item_id: f.id` when a food is added to a plan,
-- so any food used in a plan is referenced. `useDeleteFoodItem`
-- (`use-nutrition.ts:181`) then fails with SQLSTATE 23503, and the person is
-- told — if they are told anything — that their delete "violates foreign key
-- constraint meal_plan_items_food_item_id_fkey".
--
-- The same constraint blocks account deletion outright. `DELETE FROM
-- auth.users` cascades to `food_items` and, by a separate path, to
-- `meal_plan_items` through `meal_plans`; NO ACTION is checked at the end of
-- the statement and the referencing row is still there when it is. Reproduced
-- on PostgreSQL 16.13 with the four tables in this shape and nothing else: the
-- delete fails, and it fails whichever order the rows were inserted in.
--
-- ── why SET NULL and not CASCADE ──
--
-- A meal plan item carries its own `food_name`, `serving_g`, `kcal`,
-- `protein_g`, `carbs_g` and `fat_g` — the food's values copied at the moment
-- it was added, which is what makes a plan stable when a food is later edited.
-- The reference is a convenience for jumping back to the source, not the source
-- of the row's data.
--
-- So CASCADE would delete a Tuesday lunch because the food it was once linked
-- to was tidied out of the library, and the plan would silently lose a meal.
-- SET NULL keeps the row, its name and its macros, and drops only the link.
-- Verified on the same cluster: after the change, deleting the food leaves the
-- plan row with `food_name` and `kcal` intact and `food_item_id` NULL, and the
-- account deletion above completes with every table empty.
--
-- It is also what the sibling table already does, so this makes the two agree
-- rather than inventing a third behaviour.

ALTER TABLE public.meal_plan_items
  DROP CONSTRAINT IF EXISTS meal_plan_items_food_item_id_fkey;

ALTER TABLE public.meal_plan_items
  ADD CONSTRAINT meal_plan_items_food_item_id_fkey
  FOREIGN KEY (food_item_id) REFERENCES public.food_items(id) ON DELETE SET NULL;
