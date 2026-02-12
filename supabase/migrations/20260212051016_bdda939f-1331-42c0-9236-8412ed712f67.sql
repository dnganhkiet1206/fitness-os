
-- Add price_per_serving to food_items for grocery budget mode
ALTER TABLE public.food_items ADD COLUMN IF NOT EXISTS price_per_serving NUMERIC DEFAULT NULL;
