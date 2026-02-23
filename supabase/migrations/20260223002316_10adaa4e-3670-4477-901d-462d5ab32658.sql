
-- Add modality_id column to rankings table
ALTER TABLE public.rankings ADD COLUMN modality_id uuid REFERENCES public.modalities(id) ON DELETE CASCADE;

-- Create index for faster filtering
CREATE INDEX idx_rankings_modality ON public.rankings(modality_id);
