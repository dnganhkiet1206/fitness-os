
-- Create water intake logs table
CREATE TABLE public.water_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount_ml INTEGER NOT NULL DEFAULT 250,
  logged_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Unique constraint to allow multiple entries per day but track each glass
CREATE INDEX idx_water_logs_user_date ON public.water_logs (user_id, date);

-- Enable RLS
ALTER TABLE public.water_logs ENABLE ROW LEVEL SECURITY;

-- RLS policy
CREATE POLICY "Users can CRUD own water logs"
  ON public.water_logs
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);
