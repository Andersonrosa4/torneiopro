
-- Fix: notifications insert should only allow inserting for authenticated users targeting themselves or via service role
DROP POLICY "Users can insert notifications" ON public.notifications;
CREATE POLICY "Users can insert own notifications"
  ON public.notifications FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());
