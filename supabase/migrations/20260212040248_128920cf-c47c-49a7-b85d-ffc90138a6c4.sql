
-- ============================================
-- Fitness OS – Full Database Schema
-- ============================================

-- 1) Profiles table
CREATE TABLE public.profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  dob DATE,
  sex TEXT DEFAULT 'other',
  height_cm NUMERIC DEFAULT 170,
  weight_kg NUMERIC DEFAULT 70,
  units_weight TEXT DEFAULT 'kg',
  units_height TEXT DEFAULT 'cm',
  goal TEXT DEFAULT 'maintain',
  activity_level TEXT DEFAULT 'moderate',
  tdee_target_kcal INTEGER DEFAULT 2200,
  macro_protein_g INTEGER DEFAULT 150,
  macro_carbs_g INTEGER DEFAULT 250,
  macro_fat_g INTEGER DEFAULT 70,
  macro_fiber_g INTEGER DEFAULT 30,
  sleep_target_hours NUMERIC DEFAULT 8,
  sleep_target_bedtime TEXT DEFAULT '23:00',
  sleep_target_waketime TEXT DEFAULT '07:00',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own profile" ON public.profiles FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = user_id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (user_id, name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'name', ''));
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 2) Food Items (shared library)
CREATE TABLE public.food_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  brand TEXT DEFAULT '',
  serving_g NUMERIC NOT NULL DEFAULT 100,
  kcal NUMERIC NOT NULL DEFAULT 0,
  protein_g NUMERIC NOT NULL DEFAULT 0,
  carbs_g NUMERIC NOT NULL DEFAULT 0,
  fat_g NUMERIC NOT NULL DEFAULT 0,
  fiber_g NUMERIC NOT NULL DEFAULT 0,
  tags TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.food_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own + shared food items" ON public.food_items FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);
CREATE POLICY "Users can insert food items" ON public.food_items FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own food items" ON public.food_items FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own food items" ON public.food_items FOR DELETE USING (auth.uid() = user_id);

-- 3) Meal Entries
CREATE TABLE public.meal_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  meal_type TEXT NOT NULL DEFAULT 'snack',
  total_kcal NUMERIC NOT NULL DEFAULT 0,
  total_protein_g NUMERIC NOT NULL DEFAULT 0,
  total_carbs_g NUMERIC NOT NULL DEFAULT 0,
  total_fat_g NUMERIC NOT NULL DEFAULT 0,
  total_fiber_g NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.meal_entries ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own meals" ON public.meal_entries FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 4) Meal Entry Items
CREATE TABLE public.meal_entry_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  meal_entry_id UUID REFERENCES public.meal_entries(id) ON DELETE CASCADE NOT NULL,
  food_item_id UUID REFERENCES public.food_items(id) ON DELETE SET NULL,
  food_name TEXT NOT NULL DEFAULT '',
  servings NUMERIC NOT NULL DEFAULT 1,
  kcal NUMERIC NOT NULL DEFAULT 0,
  protein_g NUMERIC NOT NULL DEFAULT 0,
  carbs_g NUMERIC NOT NULL DEFAULT 0,
  fat_g NUMERIC NOT NULL DEFAULT 0,
  fiber_g NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.meal_entry_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own meal items" ON public.meal_entry_items FOR ALL 
  USING (EXISTS (SELECT 1 FROM public.meal_entries WHERE id = meal_entry_id AND user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.meal_entries WHERE id = meal_entry_id AND user_id = auth.uid()));

-- 5) Exercises (shared library)
CREATE TABLE public.exercises (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  muscle_group TEXT NOT NULL DEFAULT '',
  equipment TEXT DEFAULT '',
  form_cues TEXT[] DEFAULT '{}',
  common_mistakes TEXT[] DEFAULT '{}',
  video_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.exercises ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can view own + shared exercises" ON public.exercises FOR SELECT USING (user_id IS NULL OR auth.uid() = user_id);
CREATE POLICY "Users can insert exercises" ON public.exercises FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own exercises" ON public.exercises FOR UPDATE USING (auth.uid() = user_id);
CREATE POLICY "Users can delete own exercises" ON public.exercises FOR DELETE USING (auth.uid() = user_id);

-- 6) Workout Templates
CREATE TABLE public.workout_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  type TEXT DEFAULT 'custom',
  exercises JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workout_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own templates" ON public.workout_templates FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 7) Workout Sessions
CREATE TABLE public.workout_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  template_id UUID REFERENCES public.workout_templates(id) ON DELETE SET NULL,
  template_name TEXT DEFAULT '',
  session_rpe INTEGER DEFAULT 5,
  pain_flags JSONB DEFAULT '[]',
  sets JSONB NOT NULL DEFAULT '[]',
  volume_load NUMERIC NOT NULL DEFAULT 0,
  pr_detected BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.workout_sessions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own sessions" ON public.workout_sessions FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 8) Sleep Logs
CREATE TABLE public.sleep_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  bedtime TIMESTAMPTZ NOT NULL,
  waketime TIMESTAMPTZ NOT NULL,
  quality INTEGER DEFAULT 5,
  light_min INTEGER DEFAULT 0,
  deep_min INTEGER DEFAULT 0,
  rem_min INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sleep_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own sleep" ON public.sleep_logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 9) Supplements
CREATE TABLE public.supplements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'other',
  dose_text TEXT DEFAULT '',
  timing TEXT DEFAULT 'morning',
  cycle_mode TEXT DEFAULT 'none',
  cycle_on_weeks INTEGER DEFAULT 0,
  cycle_off_weeks INTEGER DEFAULT 0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.supplements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own supplements" ON public.supplements FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 10) Supplement Intake Logs
CREATE TABLE public.supplement_intake_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  supplement_id UUID REFERENCES public.supplements(id) ON DELETE CASCADE NOT NULL,
  date_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  taken BOOLEAN DEFAULT true,
  dose_override TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.supplement_intake_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own intake logs" ON public.supplement_intake_logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 11) Biometric Samples
CREATE TABLE public.biometric_samples (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  source TEXT NOT NULL DEFAULT 'manual',
  hr_bpm NUMERIC,
  hrv_rmssd_ms NUMERIC,
  spo2_pct NUMERIC,
  vo2max_mlkgmin NUMERIC,
  resp_rate_rpm NUMERIC,
  confidence NUMERIC DEFAULT 1.0,
  notes TEXT DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.biometric_samples ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own biometrics" ON public.biometric_samples FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 12) Daily Logs (computed aggregation)
CREATE TABLE public.daily_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  date DATE NOT NULL,
  kcal NUMERIC DEFAULT 0,
  protein_g NUMERIC DEFAULT 0,
  carbs_g NUMERIC DEFAULT 0,
  fat_g NUMERIC DEFAULT 0,
  fiber_g NUMERIC DEFAULT 0,
  steps INTEGER DEFAULT 0,
  active_minutes INTEGER DEFAULT 0,
  active_kcal NUMERIC DEFAULT 0,
  sleep_duration_min INTEGER DEFAULT 0,
  sleep_quality NUMERIC DEFAULT 0,
  workout_count INTEGER DEFAULT 0,
  volume_load NUMERIC DEFAULT 0,
  supplement_taken INTEGER DEFAULT 0,
  supplement_planned INTEGER DEFAULT 0,
  readiness_score NUMERIC,
  readiness_status TEXT,
  readiness_explain TEXT DEFAULT '',
  readiness_recommendation TEXT DEFAULT '',
  acwr NUMERIC,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

ALTER TABLE public.daily_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own daily logs" ON public.daily_logs FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 13) Weekly Reviews
CREATE TABLE public.weekly_reviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  week_start_date DATE NOT NULL,
  avg_kcal NUMERIC DEFAULT 0,
  avg_protein_g NUMERIC DEFAULT 0,
  workout_completion_pct NUMERIC DEFAULT 0,
  avg_sleep_min NUMERIC DEFAULT 0,
  readiness_avg NUMERIC DEFAULT 0,
  insights JSONB DEFAULT '[]',
  recommendations JSONB DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, week_start_date)
);

ALTER TABLE public.weekly_reviews ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own reviews" ON public.weekly_reviews FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 14) Habit Nudges
CREATE TABLE public.habit_nudges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  type TEXT NOT NULL,
  message TEXT NOT NULL DEFAULT '',
  priority TEXT DEFAULT 'medium',
  enabled BOOLEAN DEFAULT true,
  frequency_cap INTEGER DEFAULT 3,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.habit_nudges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own nudges" ON public.habit_nudges FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 15) Wearable Sources
CREATE TABLE public.wearable_sources (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  provider TEXT NOT NULL,
  connected BOOLEAN DEFAULT false,
  last_sync TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.wearable_sources ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can CRUD own wearables" ON public.wearable_sources FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Indexes for performance
CREATE INDEX idx_meal_entries_user_date ON public.meal_entries(user_id, date_time);
CREATE INDEX idx_workout_sessions_user_date ON public.workout_sessions(user_id, date_time);
CREATE INDEX idx_sleep_logs_user_date ON public.sleep_logs(user_id, bedtime);
CREATE INDEX idx_biometric_samples_user_date ON public.biometric_samples(user_id, date_time);
CREATE INDEX idx_daily_logs_user_date ON public.daily_logs(user_id, date);
CREATE INDEX idx_supplement_intake_user_date ON public.supplement_intake_logs(user_id, date_time);

-- Updated_at trigger function
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Apply updated_at triggers
CREATE TRIGGER update_profiles_updated_at BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_food_items_updated_at BEFORE UPDATE ON public.food_items FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_workout_templates_updated_at BEFORE UPDATE ON public.workout_templates FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_workout_sessions_updated_at BEFORE UPDATE ON public.workout_sessions FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_sleep_logs_updated_at BEFORE UPDATE ON public.sleep_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_supplements_updated_at BEFORE UPDATE ON public.supplements FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_daily_logs_updated_at BEFORE UPDATE ON public.daily_logs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_weekly_reviews_updated_at BEFORE UPDATE ON public.weekly_reviews FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_habit_nudges_updated_at BEFORE UPDATE ON public.habit_nudges FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
CREATE TRIGGER update_wearable_sources_updated_at BEFORE UPDATE ON public.wearable_sources FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Seed starter food items (shared, user_id = NULL)
INSERT INTO public.food_items (user_id, name, brand, serving_g, kcal, protein_g, carbs_g, fat_g, fiber_g, tags) VALUES
(NULL, 'Ức gà', '', 100, 165, 31, 0, 3.6, 0, ARRAY['protein','thịt']),
(NULL, 'Cơm trắng', '', 100, 130, 2.7, 28, 0.3, 0.4, ARRAY['carbs','ngũ cốc']),
(NULL, 'Trứng gà', '', 50, 72, 6.3, 0.4, 4.8, 0, ARRAY['protein']),
(NULL, 'Chuối', '', 120, 105, 1.3, 27, 0.4, 3.1, ARRAY['trái cây','carbs']),
(NULL, 'Sữa chua Hy Lạp', '', 150, 100, 17, 6, 0.7, 0, ARRAY['protein','sữa']),
(NULL, 'Khoai lang', '', 130, 112, 2, 26, 0.1, 3.9, ARRAY['carbs']),
(NULL, 'Cá hồi', '', 100, 208, 20, 0, 13, 0, ARRAY['protein','omega3']),
(NULL, 'Bông cải xanh', '', 100, 34, 2.8, 7, 0.4, 2.6, ARRAY['rau','chất xơ']),
(NULL, 'Yến mạch', '', 40, 152, 5.3, 27, 2.7, 4, ARRAY['carbs','ngũ cốc']),
(NULL, 'Whey Protein', 'ON', 32, 120, 24, 3, 1.5, 0, ARRAY['protein','supplement']);

-- Seed starter exercises (shared, user_id = NULL)
INSERT INTO public.exercises (user_id, name, muscle_group, equipment, form_cues) VALUES
(NULL, 'Barbell Squat', 'Chân', 'Barbell', ARRAY['Giữ lưng thẳng','Đầu gối không vượt quá mũi chân','Hít vào khi xuống']),
(NULL, 'Bench Press', 'Ngực', 'Barbell', ARRAY['Vai ép xuống ghế','Hạ tạ từ từ','Thở ra khi đẩy']),
(NULL, 'Deadlift', 'Lưng/Chân', 'Barbell', ARRAY['Giữ thanh tạ sát người','Đẩy hông về trước','Không cong lưng']),
(NULL, 'Overhead Press', 'Vai', 'Barbell', ARRAY['Core siết chặt','Đẩy thẳng lên','Không ngả lưng']),
(NULL, 'Barbell Row', 'Lưng', 'Barbell', ARRAY['Kéo về bụng','Giữ lưng song song mặt đất','Siết bả vai']),
(NULL, 'Pull-up', 'Lưng', 'Bodyweight', ARRAY['Kéo ngực chạm xà','Hạ từ từ','Tay rộng bằng vai']),
(NULL, 'Dumbbell Curl', 'Bắp tay trước', 'Dumbbell', ARRAY['Giữ khuỷu tay cố định','Không lắc người']),
(NULL, 'Leg Press', 'Chân', 'Machine', ARRAY['Chân rộng bằng vai','Đầu gối không khóa']),
(NULL, 'Lat Pulldown', 'Lưng', 'Cable', ARRAY['Kéo về ngực','Ngả nhẹ ra sau','Siết lưng']),
(NULL, 'Romanian Deadlift', 'Hamstring', 'Barbell', ARRAY['Gối hơi cong','Đẩy hông ra sau','Cảm nhận kéo căng']);
