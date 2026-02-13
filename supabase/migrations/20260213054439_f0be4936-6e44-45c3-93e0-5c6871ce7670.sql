
-- Use safe approach: drop-if-exists then re-add with CASCADE

-- Helper: Add FK only if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_logs_user_id_fkey') THEN
    ALTER TABLE public.daily_logs ADD CONSTRAINT daily_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meal_entries_user_id_fkey') THEN
    ALTER TABLE public.meal_entries ADD CONSTRAINT meal_entries_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_sessions_user_id_fkey') THEN
    ALTER TABLE public.workout_sessions ADD CONSTRAINT workout_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'workout_templates_user_id_fkey') THEN
    ALTER TABLE public.workout_templates ADD CONSTRAINT workout_templates_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'sleep_logs_user_id_fkey') THEN
    ALTER TABLE public.sleep_logs ADD CONSTRAINT sleep_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weight_logs_user_id_fkey') THEN
    ALTER TABLE public.weight_logs ADD CONSTRAINT weight_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'water_logs_user_id_fkey') THEN
    ALTER TABLE public.water_logs ADD CONSTRAINT water_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplements_user_id_fkey') THEN
    ALTER TABLE public.supplements ADD CONSTRAINT supplements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'supplement_intake_logs_user_id_fkey') THEN
    ALTER TABLE public.supplement_intake_logs ADD CONSTRAINT supplement_intake_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'biometric_samples_user_id_fkey') THEN
    ALTER TABLE public.biometric_samples ADD CONSTRAINT biometric_samples_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'body_measurements_user_id_fkey') THEN
    ALTER TABLE public.body_measurements ADD CONSTRAINT body_measurements_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'awards_user_id_fkey') THEN
    ALTER TABLE public.awards ADD CONSTRAINT awards_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_challenges_user_id_fkey') THEN
    ALTER TABLE public.weekly_challenges ADD CONSTRAINT weekly_challenges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_reviews_user_id_fkey') THEN
    ALTER TABLE public.weekly_reviews ADD CONSTRAINT weekly_reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ai_conversations_user_id_fkey') THEN
    ALTER TABLE public.ai_conversations ADD CONSTRAINT ai_conversations_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'food_items_user_id_fkey') THEN
    ALTER TABLE public.food_items ADD CONSTRAINT food_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'grocery_items_user_id_fkey') THEN
    ALTER TABLE public.grocery_items ADD CONSTRAINT grocery_items_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'habit_nudges_user_id_fkey') THEN
    ALTER TABLE public.habit_nudges ADD CONSTRAINT habit_nudges_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'meal_plans_user_id_fkey') THEN
    ALTER TABLE public.meal_plans ADD CONSTRAINT meal_plans_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'progress_photos_user_id_fkey') THEN
    ALTER TABLE public.progress_photos ADD CONSTRAINT progress_photos_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'routine_days_user_id_fkey') THEN
    ALTER TABLE public.routine_days ADD CONSTRAINT routine_days_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'scan_history_user_id_fkey') THEN
    ALTER TABLE public.scan_history ADD CONSTRAINT scan_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wearable_sources_user_id_fkey') THEN
    ALTER TABLE public.wearable_sources ADD CONSTRAINT wearable_sources_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;
  END IF;
END $$;

-- 2. Unique constraints (safe)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'daily_logs_user_date_unique') THEN
    ALTER TABLE public.daily_logs ADD CONSTRAINT daily_logs_user_date_unique UNIQUE (user_id, date);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weight_logs_user_date_unique') THEN
    ALTER TABLE public.weight_logs ADD CONSTRAINT weight_logs_user_date_unique UNIQUE (user_id, date);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'weekly_reviews_user_week_unique') THEN
    ALTER TABLE public.weekly_reviews ADD CONSTRAINT weekly_reviews_user_week_unique UNIQUE (user_id, week_start_date);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'awards_user_key_unique') THEN
    ALTER TABLE public.awards ADD CONSTRAINT awards_user_key_unique UNIQUE (user_id, award_key);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'wearable_sources_user_provider_unique') THEN
    ALTER TABLE public.wearable_sources ADD CONSTRAINT wearable_sources_user_provider_unique UNIQUE (user_id, provider);
  END IF;
END $$;

-- 3. Indexes
CREATE INDEX IF NOT EXISTS idx_daily_logs_user_date ON public.daily_logs(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_meal_entries_user_datetime ON public.meal_entries(user_id, date_time DESC);
CREATE INDEX IF NOT EXISTS idx_workout_sessions_user_datetime ON public.workout_sessions(user_id, date_time DESC);
CREATE INDEX IF NOT EXISTS idx_sleep_logs_user_bedtime ON public.sleep_logs(user_id, bedtime DESC);
CREATE INDEX IF NOT EXISTS idx_weight_logs_user_date ON public.weight_logs(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_water_logs_user_date ON public.water_logs(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_biometric_samples_user_datetime ON public.biometric_samples(user_id, date_time DESC);
CREATE INDEX IF NOT EXISTS idx_body_measurements_user_date ON public.body_measurements(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_supplement_intake_user_datetime ON public.supplement_intake_logs(user_id, date_time DESC);
CREATE INDEX IF NOT EXISTS idx_awards_user_earned ON public.awards(user_id, earned_at DESC);
CREATE INDEX IF NOT EXISTS idx_weekly_challenges_user_week ON public.weekly_challenges(user_id, week_start DESC);
CREATE INDEX IF NOT EXISTS idx_ai_conversations_user_updated ON public.ai_conversations(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_messages_conversation ON public.ai_messages(conversation_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_grocery_items_user ON public.grocery_items(user_id);
CREATE INDEX IF NOT EXISTS idx_food_items_user ON public.food_items(user_id);
CREATE INDEX IF NOT EXISTS idx_meal_plan_items_plan ON public.meal_plan_items(meal_plan_id, day_index);
CREATE INDEX IF NOT EXISTS idx_meal_entry_items_entry ON public.meal_entry_items(meal_entry_id);
CREATE INDEX IF NOT EXISTS idx_progress_photos_user_date ON public.progress_photos(user_id, date DESC);
CREATE INDEX IF NOT EXISTS idx_scan_history_user ON public.scan_history(user_id, scanned_at DESC);

-- 4. Update triggers (safe with IF NOT EXISTS check)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_daily_logs_updated_at') THEN
    CREATE TRIGGER update_daily_logs_updated_at BEFORE UPDATE ON public.daily_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_meal_entries_updated_at') THEN
    CREATE TRIGGER update_meal_entries_updated_at BEFORE UPDATE ON public.meal_entries FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_workout_sessions_updated_at') THEN
    CREATE TRIGGER update_workout_sessions_updated_at BEFORE UPDATE ON public.workout_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_sleep_logs_updated_at') THEN
    CREATE TRIGGER update_sleep_logs_updated_at BEFORE UPDATE ON public.sleep_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_supplements_updated_at') THEN
    CREATE TRIGGER update_supplements_updated_at BEFORE UPDATE ON public.supplements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_body_measurements_updated_at') THEN
    CREATE TRIGGER update_body_measurements_updated_at BEFORE UPDATE ON public.body_measurements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_workout_templates_updated_at') THEN
    CREATE TRIGGER update_workout_templates_updated_at BEFORE UPDATE ON public.workout_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_ai_conversations_updated_at') THEN
    CREATE TRIGGER update_ai_conversations_updated_at BEFORE UPDATE ON public.ai_conversations FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_grocery_items_updated_at') THEN
    CREATE TRIGGER update_grocery_items_updated_at BEFORE UPDATE ON public.grocery_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_food_items_updated_at') THEN
    CREATE TRIGGER update_food_items_updated_at BEFORE UPDATE ON public.food_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_meal_plans_updated_at') THEN
    CREATE TRIGGER update_meal_plans_updated_at BEFORE UPDATE ON public.meal_plans FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_routine_days_updated_at') THEN
    CREATE TRIGGER update_routine_days_updated_at BEFORE UPDATE ON public.routine_days FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_wearable_sources_updated_at') THEN
    CREATE TRIGGER update_wearable_sources_updated_at BEFORE UPDATE ON public.wearable_sources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_weekly_challenges_updated_at') THEN
    CREATE TRIGGER update_weekly_challenges_updated_at BEFORE UPDATE ON public.weekly_challenges FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_weekly_reviews_updated_at') THEN
    CREATE TRIGGER update_weekly_reviews_updated_at BEFORE UPDATE ON public.weekly_reviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'update_habit_nudges_updated_at') THEN
    CREATE TRIGGER update_habit_nudges_updated_at BEFORE UPDATE ON public.habit_nudges FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
  END IF;
END $$;
