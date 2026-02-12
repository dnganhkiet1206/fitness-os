
-- Create awards table to store earned badges
CREATE TABLE public.awards (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  award_type TEXT NOT NULL, -- 'streak', 'pr', 'weekly_complete', 'calorie_goal', 'steps_goal', 'sleep_streak', 'volume_milestone', 'first_workout', 'protein_streak'
  award_key TEXT NOT NULL, -- unique key like 'streak_7', 'pr_bench_press', 'weekly_2025_w5'
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT 'trophy', -- icon identifier
  tier TEXT NOT NULL DEFAULT 'bronze', -- 'bronze', 'silver', 'gold', 'platinum'
  earned_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id, award_key)
);

-- Enable RLS
ALTER TABLE public.awards ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view own awards"
  ON public.awards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own awards"
  ON public.awards FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own awards"
  ON public.awards FOR DELETE
  USING (auth.uid() = user_id);

-- Index for fast lookups
CREATE INDEX idx_awards_user_earned ON public.awards(user_id, earned_at DESC);
CREATE INDEX idx_awards_user_type ON public.awards(user_id, award_type);
