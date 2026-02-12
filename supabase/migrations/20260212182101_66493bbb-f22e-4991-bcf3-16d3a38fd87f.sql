
-- Ensure RLS is enabled on wearable_sources
ALTER TABLE public.wearable_sources ENABLE ROW LEVEL SECURITY;

-- Create RLS policies for wearable_sources
CREATE POLICY "Users can view their own wearable sources"
ON public.wearable_sources FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own wearable sources"
ON public.wearable_sources FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own wearable sources"
ON public.wearable_sources FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own wearable sources"
ON public.wearable_sources FOR DELETE
USING (auth.uid() = user_id);
