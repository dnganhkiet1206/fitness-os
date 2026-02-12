
-- Routine planner: map workout templates to days of week
CREATE TABLE public.routine_days (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  day_of_week integer NOT NULL CHECK (day_of_week BETWEEN 0 AND 6),
  template_id uuid REFERENCES public.workout_templates(id) ON DELETE CASCADE,
  is_rest boolean DEFAULT false,
  is_deload boolean DEFAULT false,
  notes text DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.routine_days ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own routine days" ON public.routine_days FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE UNIQUE INDEX idx_routine_days_user_day ON public.routine_days (user_id, day_of_week);
CREATE TRIGGER update_routine_days_updated_at BEFORE UPDATE ON public.routine_days
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add rest_seconds and progressive overload fields to workout_templates exercises jsonb is fine
-- Add cycle_start_date to supplements
ALTER TABLE public.supplements ADD COLUMN IF NOT EXISTS cycle_start_date date;
