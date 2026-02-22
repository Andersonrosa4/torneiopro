-- Allow organizers with tournament access to delete quiz_scores
CREATE POLICY "Organizer can delete quiz_scores"
ON public.quiz_scores
FOR DELETE
USING (has_tournament_access(tournament_id));
