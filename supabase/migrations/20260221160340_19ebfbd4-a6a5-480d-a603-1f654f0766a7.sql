
-- Table to store ambassador funnel responses and interest submissions
CREATE TABLE public.ambassador_interests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  player_name TEXT NOT NULL,
  whatsapp TEXT,
  answer_1 BOOLEAN,
  answer_2 BOOLEAN,
  answer_3 BOOLEAN,
  final_action TEXT, -- 'interested' or 'maybe_later'
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.ambassador_interests ENABLE ROW LEVEL SECURITY;

-- Users can insert their own interest
CREATE POLICY "Users can insert their own interest"
ON public.ambassador_interests
FOR INSERT
WITH CHECK (auth.uid() = user_id);

-- Users can view their own interests
CREATE POLICY "Users can view their own interest"
ON public.ambassador_interests
FOR SELECT
USING (auth.uid() = user_id);

-- Admins can view all interests (via organizer role check)
CREATE POLICY "Admins can view all interests"
ON public.ambassador_interests
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role = 'admin'
  )
);
