
-- Add onboarding-related columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS training_level text DEFAULT 'intermediate',
  ADD COLUMN IF NOT EXISTS work_type text DEFAULT 'sedentary',
  ADD COLUMN IF NOT EXISTS dietary_preference text DEFAULT 'omnivore',
  ADD COLUMN IF NOT EXISTS allergies text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS disliked_foods text[] DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS water_target_ml integer DEFAULT 2500,
  ADD COLUMN IF NOT EXISTS onboarding_completed boolean DEFAULT false;
