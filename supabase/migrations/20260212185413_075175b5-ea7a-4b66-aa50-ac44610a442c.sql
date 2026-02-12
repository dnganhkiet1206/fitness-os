-- 1. Add DELETE policy for profiles (GDPR compliance)
CREATE POLICY "Users can delete own profile"
ON public.profiles
FOR DELETE
USING (auth.uid() = user_id);

-- 2. Remove duplicate individual policies on wearable_sources (keep ALL policy)
DROP POLICY IF EXISTS "Users can delete their own wearable sources" ON public.wearable_sources;
DROP POLICY IF EXISTS "Users can insert their own wearable sources" ON public.wearable_sources;
DROP POLICY IF EXISTS "Users can update their own wearable sources" ON public.wearable_sources;
DROP POLICY IF EXISTS "Users can view their own wearable sources" ON public.wearable_sources;