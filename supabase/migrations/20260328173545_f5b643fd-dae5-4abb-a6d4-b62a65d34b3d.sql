
-- Add new columns to projects table
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS user_email text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS transcript text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS template_id text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS content_type text;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS duration_seconds float;
ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS error text;

-- Create notifications table
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id uuid REFERENCES public.projects(id) ON DELETE CASCADE,
  message text NOT NULL,
  level text DEFAULT 'info',
  read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS on notifications
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Permissive policies for notifications (personal use)
CREATE POLICY "Allow all read notifications" ON public.notifications FOR SELECT TO public USING (true);
CREATE POLICY "Allow all insert notifications" ON public.notifications FOR INSERT TO public WITH CHECK (true);
CREATE POLICY "Allow all update notifications" ON public.notifications FOR UPDATE TO public USING (true);
CREATE POLICY "Allow all delete notifications" ON public.notifications FOR DELETE TO public USING (true);

-- Enable realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
