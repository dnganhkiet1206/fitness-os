
-- Add caffeine/screen tracking to sleep_logs
ALTER TABLE public.sleep_logs
  ADD COLUMN IF NOT EXISTS caffeine_cutoff_time timestamp with time zone,
  ADD COLUMN IF NOT EXISTS screen_off_time timestamp with time zone;

-- Body measurements table
CREATE TABLE public.body_measurements (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  date date NOT NULL,
  neck_cm numeric,
  shoulders_cm numeric,
  chest_cm numeric,
  waist_cm numeric,
  hips_cm numeric,
  bicep_left_cm numeric,
  bicep_right_cm numeric,
  thigh_left_cm numeric,
  thigh_right_cm numeric,
  calf_left_cm numeric,
  calf_right_cm numeric,
  body_fat_pct numeric,
  notes text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id, date)
);

ALTER TABLE public.body_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own measurements"
  ON public.body_measurements FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER update_body_measurements_updated_at
  BEFORE UPDATE ON public.body_measurements
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Progress photos table (stores URLs from storage)
CREATE TABLE public.progress_photos (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  date date NOT NULL DEFAULT CURRENT_DATE,
  photo_url text NOT NULL,
  pose text DEFAULT 'front',
  notes text DEFAULT '',
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.progress_photos ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can CRUD own photos"
  ON public.progress_photos FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- Storage bucket for progress photos
INSERT INTO storage.buckets (id, name, public) VALUES ('progress-photos', 'progress-photos', true);

CREATE POLICY "Users can upload own photos"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'progress-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can view own photos"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'progress-photos' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "Users can delete own photos"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'progress-photos' AND auth.uid()::text = (storage.foldername(name))[1]);
